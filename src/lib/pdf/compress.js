// Final-submittal compression (runs after the submittal PDF is compiled).
//  1. lossless: drop embedded XMP metadata copied from source PDFs, Flate-compress raw streams,
//     merge identical objects (fonts / logos repeated across merged documents)
//  2. images (browser only): re-encode large JPEG / 8-bit RGB & grey images at a capped resolution
import { PDFDocument, PDFName, PDFRawStream, PDFDict, PDFArray, PDFRef, PDFNumber } from 'pdf-lib';
import pako from 'pako';

export const COMPRESSION = {
  off: { label: 'Off (original quality)' },
  lossless: { label: 'Lossless (no quality change)' },
  standard: { label: 'Standard – recommended', maxPx: 1800, quality: 0.72 },
  strong: { label: 'Strong – smallest file', maxPx: 1300, quality: 0.58 },
};

const N = (s) => PDFName.of(s);
const filters = (d) => {
  const f = d.get(N('Filter'));
  if (!f) return [];
  if (f instanceof PDFArray) return f.asArray().map((x) => x.toString());
  return [f.toString()];
};

/** FNV-1a over bytes + dict text, for duplicate detection. */
function hash(bytes, dictText) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i], 16777619);
    h2 = Math.imul(h2 + bytes[i], 2246822519) ^ (h2 >>> 13);
  }
  return `${bytes.length}:${(h1 >>> 0).toString(36)}:${(h2 >>> 0).toString(36)}:${dictText}`;
}

/** Replace PDFRefs inside an object according to map (old ref tag -> new ref). */
function remap(obj, map) {
  if (obj instanceof PDFRef) return map.get(obj.tag) || obj;
  if (obj instanceof PDFDict) {
    for (const [k, v] of obj.entries()) {
      const r = remap(v, map);
      if (r !== v) obj.set(k, r);
    }
  } else if (obj instanceof PDFArray) {
    for (let i = 0; i < obj.size(); i++) {
      const v = obj.get(i);
      const r = remap(v, map);
      if (r !== v) obj.set(i, r);
    }
  } else if (obj instanceof PDFRawStream) remap(obj.dict, map);
  return obj;
}

function canEncodeImages() {
  return typeof document !== 'undefined' || typeof OffscreenCanvas !== 'undefined';
}
function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
async function toJpeg(canvas, quality) {
  const blob = canvas.convertToBlob ? await canvas.convertToBlob({ type: 'image/jpeg', quality }) : await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
  return new Uint8Array(await blob.arrayBuffer());
}

/** Try to re-encode one image stream; returns new {bytes,w,h,gray} or null. */
async function recodeImage(stream, ctx, opt) {
  const d = stream.dict;
  const fl = filters(d);
  const w = d.get(N('Width'))?.asNumber?.();
  const h = d.get(N('Height'))?.asNumber?.();
  const bpc = d.get(N('BitsPerComponent'))?.asNumber?.();
  if (!w || !h || bpc !== 8 || d.get(N('ImageMask')) || d.get(N('Decode')) || d.get(N('DecodeParms')) && !fl.includes('/DCTDecode')) return null;
  if (stream.contents.length < 15000) return null; // small images are not worth it
  let cs = d.get(N('ColorSpace'));
  if (cs instanceof PDFRef) cs = ctx.lookup(cs);
  let comps = 0;
  if (cs?.toString() === '/DeviceRGB') comps = 3;
  else if (cs?.toString() === '/DeviceGray') comps = 1;
  else if (cs instanceof PDFArray && cs.get(0)?.toString() === '/ICCBased') {
    const icc = ctx.lookup(cs.get(1));
    const n = icc?.dict?.get(N('N'))?.asNumber?.();
    if (n === 3 || n === 1) comps = n;
  }
  if (!comps) return null; // CMYK, indexed, Lab… left alone

  const scale = Math.min(1, opt.maxPx / Math.max(w, h));
  const hasMask = !!d.get(N('SMask'));
  const nw = hasMask ? w : Math.max(1, Math.round(w * scale));
  const nh = hasMask ? h : Math.max(1, Math.round(h * scale));

  let data = stream.contents;
  const rest = [...fl];
  if (rest[0] === '/FlateDecode') {
    data = pako.inflate(data);
    rest.shift();
  }
  let source;
  if (rest.length === 1 && rest[0] === '/DCTDecode') {
    source = await createImageBitmap(new Blob([data], { type: 'image/jpeg' }));
    if (source.width !== w || source.height !== h) return null;
  } else if (rest.length === 0) {
    if (data.length < w * h * comps) return null;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0, j = 0; i < w * h; i++, j += comps) {
      const r = data[j];
      rgba[i * 4] = r;
      rgba[i * 4 + 1] = comps === 3 ? data[j + 1] : r;
      rgba[i * 4 + 2] = comps === 3 ? data[j + 2] : r;
      rgba[i * 4 + 3] = 255;
    }
    source = await createImageBitmap(new ImageData(rgba, w, h));
  } else return null;

  const c = makeCanvas(nw, nh);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, nw, nh);
  g.imageSmoothingQuality = 'high';
  g.drawImage(source, 0, 0, nw, nh);
  source.close?.();
  const jpg = await toJpeg(c, opt.quality);
  if (jpg.length > stream.contents.length * 0.9) return null;
  return { bytes: jpg, w: nw, h: nh, gray: comps === 1 };
}

/**
 * @param {Uint8Array} bytes   compiled submittal
 * @param {'off'|'lossless'|'standard'|'strong'} level
 * @param {(msg:string)=>void} onProgress
 */
export async function compressPdf(bytes, level = 'standard', onProgress = () => {}) {
  if (level === 'off') return bytes;
  const opt = COMPRESSION[level] || COMPRESSION.standard;
  onProgress('Compressing – cleaning up…');
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const ctx = doc.context;
  const catalog = ctx.trailerInfo.Root;

  const objs = ctx.enumerateIndirectObjects();
  // 1) drop XMP metadata everywhere except the document catalog
  for (const [ref, o] of objs) {
    const d = o instanceof PDFDict ? o : o instanceof PDFRawStream ? o.dict : null;
    if (!d) continue;
    if (ref !== catalog && d.get(N('Metadata'))) d.delete(N('Metadata'));
    if (d.get(N('PieceInfo'))) d.delete(N('PieceInfo'));
  }

  // 2) images (lossy, browser only)
  if (opt.maxPx && canEncodeImages()) {
    const imgs = objs.filter(([, o]) => o instanceof PDFRawStream && o.dict.get(N('Subtype'))?.toString() === '/Image');
    let recoded = 0;
    for (const [k, [, s]] of imgs.entries()) {
      if (k % 10 === 0) onProgress(`Compressing images… ${k + 1}/${imgs.length}`);
      try {
        const r = await recodeImage(s, ctx, opt);
        if (!r) continue;
        const d = s.dict;
        d.set(N('Filter'), N('DCTDecode'));
        d.delete(N('DecodeParms'));
        d.set(N('Width'), PDFNumber.of(r.w));
        d.set(N('Height'), PDFNumber.of(r.h));
        d.set(N('ColorSpace'), N(r.gray ? 'DeviceGray' : 'DeviceRGB'));
        d.set(N('Length'), PDFNumber.of(r.bytes.length));
        s.contents = r.bytes;
        recoded++;
      } catch (e) {
        console.warn('image kept', e);
      }
    }
    console.info(`compressPdf: ${recoded}/${imgs.length} images re-encoded`);
  }

  // 3) Flate-compress raw (unfiltered) streams
  onProgress('Compressing – streams…');
  for (const [, o] of ctx.enumerateIndirectObjects()) {
    if (!(o instanceof PDFRawStream) || o.contents.length < 256) continue;
    if (o.dict.get(N('Filter'))) continue;
    if (o.dict.get(N('Type'))?.toString() === '/Metadata') continue;
    const z = pako.deflate(o.contents);
    if (z.length < o.contents.length * 0.9) {
      o.contents = z;
      o.dict.set(N('Filter'), N('FlateDecode'));
      o.dict.set(N('Length'), PDFNumber.of(z.length));
    }
  }

  // 4) merge identical streams (fonts, logos, ICC profiles repeated across merged PDFs)
  onProgress('Compressing – merging duplicates…');
  for (let pass = 0; pass < 3; pass++) {
    const seen = new Map();
    const map = new Map();
    for (const [ref, o] of ctx.enumerateIndirectObjects()) {
      if (!(o instanceof PDFRawStream) || o.contents.length < 512) continue;
      const key = hash(o.contents, o.dict.toString());
      const first = seen.get(key);
      if (first) map.set(ref.tag, first);
      else seen.set(key, ref);
    }
    if (!map.size) break;
    for (const [, o] of ctx.enumerateIndirectObjects()) remap(o, map);
    remap(ctx.trailerInfo.Root, map);
    for (const tag of map.keys()) {
      const [num, gen] = tag.split(' ').map(Number);
      ctx.delete(PDFRef.of(num, gen));
    }
  }

  // 5) drop objects nothing refers to any more (orphaned metadata, replaced duplicates)
  const keep = new Set();
  const stack = [ctx.trailerInfo.Root, ctx.trailerInfo.Info].filter(Boolean);
  while (stack.length) {
    const o = stack.pop();
    if (o instanceof PDFRef) {
      if (keep.has(o.tag)) continue;
      keep.add(o.tag);
      const v = ctx.lookup(o);
      if (v) stack.push(v);
    } else if (o instanceof PDFDict) for (const [, v] of o.entries()) stack.push(v);
    else if (o instanceof PDFArray) for (let i = 0; i < o.size(); i++) stack.push(o.get(i));
    else if (o instanceof PDFRawStream) stack.push(o.dict);
  }
  for (const [ref] of ctx.enumerateIndirectObjects()) if (!keep.has(ref.tag)) ctx.delete(ref);

  onProgress('Compressing – saving…');
  const out = await doc.save({ useObjectStreams: true });
  return out.length < bytes.length ? out : bytes;
}
