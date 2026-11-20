// Vector PDF drawings (AutoCAD / Revit "export to PDF"): lines with their layer (optional-content group),
// texts and the drawing scale → the same primitives the DWG reader produces, in real-world millimetres.
// Symbols on fixture / valve layers are grouped into clusters ("blocks") – their type is assigned by the user.

const PT_MM = 25.4 / 72;

const mul = (a, b) => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];
const ap = (m, x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

/** Most common "1 : 100" style scale on the sheet. */
export function scaleFromTexts(texts) {
  const c = {};
  for (const t of texts) {
    const m = String(t.text).match(/^\s*1\s*:\s*(\d{2,4})\s*$/);
    if (m) c[m[1]] = (c[m[1]] || 0) + 1;
  }
  const best = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  return best ? Number(best[0]) : null;
}

/**
 * @param {Uint8Array} bytes
 * @param {object} pdfjs   pdfjs-dist module
 * @param {{ page?: number, scale?: number }} opt
 */
export async function readPdfDrawing(bytes, pdfjs, opt = {}) {
  const doc = await pdfjs.getDocument({ data: bytes, verbosity: 0 }).promise;
  try {
    const page = await doc.getPage(opt.page || 1);
    const ocConfig = await doc.getOptionalContentConfig();
    const ocName = (id) => {
      try {
        return ocConfig.getGroup(id)?.name || '0';
      } catch {
        return '0';
      }
    };
    const OPS = pdfjs.OPS;
    // page view transform (handles /Rotate and flipped content) → then y up, as on the printed sheet
    const vt = page.getViewport({ scale: 1 }).transform;
    const toSheet = (p) => {
      const q = ap(vt, p.x, p.y);
      return { x: q.x, y: -q.y };
    };
    const ol = await page.getOperatorList();
    const lines = [];
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [];
    const mc = []; // marked-content layer stack
    const layer = () => mc.filter(Boolean).at(-1) || '0';
    let color = 0;
    for (let i = 0; i < ol.fnArray.length; i++) {
      const fn = ol.fnArray[i];
      const args = ol.argsArray[i];
      if (fn === OPS.save) stack.push(ctm);
      else if (fn === OPS.restore) ctm = stack.pop() || ctm;
      else if (fn === OPS.transform) ctm = mul(ctm, args);
      else if (fn === OPS.paintFormXObjectBegin) {
        stack.push(ctm);
        if (args?.[0]) ctm = mul(ctm, args[0]);
      } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || ctm;
      else if (fn === OPS.beginMarkedContentProps) mc.push(args?.[0] === 'OC' && args[1] ? ocName(typeof args[1] === 'object' ? args[1].id : args[1]) : null);
      else if (fn === OPS.beginMarkedContent) mc.push(null);
      else if (fn === OPS.endMarkedContent) mc.pop();
      else if (fn === OPS.setStrokeRGBColor) color = (args?.[0] ?? 0) * 65536 + (args?.[1] ?? 0) * 256 + (args?.[2] ?? 0);
      else if (fn === OPS.constructPath) {
        const [ops, coords] = args;
        let k = 0;
        let cur = null;
        let start = null;
        const lay = layer();
        const seg = (a, b) => {
          if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 1e-6) lines.push({ a: toSheet(a), b: toSheet(b), layer: lay, color, owner: null });
        };
        for (const op of ops) {
          if (op === OPS.moveTo) {
            cur = ap(ctm, coords[k], coords[k + 1]);
            start = cur;
            k += 2;
          } else if (op === OPS.lineTo) {
            const p = ap(ctm, coords[k], coords[k + 1]);
            if (cur) seg(cur, p);
            cur = p;
            k += 2;
          } else if (op === OPS.curveTo) {
            const p = ap(ctm, coords[k + 4], coords[k + 5]);
            if (cur) seg(cur, p);
            cur = p;
            k += 6;
          } else if (op === OPS.curveTo2 || op === OPS.curveTo3) {
            const p = ap(ctm, coords[k + 2], coords[k + 3]);
            if (cur) seg(cur, p);
            cur = p;
            k += 4;
          } else if (op === OPS.closePath) {
            if (cur && start) seg(cur, start);
            cur = start;
          } else if (op === OPS.rectangle) {
            const [x, y, w, h] = coords.slice(k, k + 4);
            const p = [ap(ctm, x, y), ap(ctm, x + w, y), ap(ctm, x + w, y + h), ap(ctm, x, y + h)];
            for (let j = 0; j < 4; j++) seg(p[j], p[(j + 1) % 4]);
            k += 4;
          }
        }
      }
    }
    // texts (page space)
    const tc = await page.getTextContent();
    const texts = tc.items
      .filter((it) => it.str && it.str.trim())
      .map((it) => ({ text: it.str.replace(/\s+/g, ' ').trim(), ...toSheet({ x: it.transform[4], y: it.transform[5] }), h: Math.hypot(it.transform[2], it.transform[3]), layer: 'TEXT' }));
    // merge texts on one baseline that belong together ("32 mm" + "Ø")
    const scale = opt.scale || scaleFromTexts(texts) || 100;
    const k = PT_MM * scale; // page points → real mm
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const l of lines) for (const p of [l.a, l.b]) {
      if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x;
      if (p.y < miny) miny = p.y; if (p.y > maxy) maxy = p.y;
    }
    // sheet frames / viewport borders are often tagged on a drawing layer – drop page-size lines
    const big = 0.45 * Math.max(maxx - minx, maxy - miny);
    for (let j = lines.length - 1; j >= 0; j--) if (Math.hypot(lines[j].b.x - lines[j].a.x, lines[j].b.y - lines[j].a.y) > big) lines.splice(j, 1);
    const layers = [...new Set(lines.map((l) => l.layer))];
    const flat = { lines, texts, blocks: [], unitToMm: k, bbox: { minx, miny, maxx, maxy }, scale, layers, source: 'pdf' };
    flat.blocks = symbolClusters(flat);
    return flat;
  } finally {
    doc.destroy();
  }
}

/**
 * Group geometry on symbol layers (fixtures, valves, meters) into clusters – one per symbol.
 * Each gets a geometric signature so identical symbols can be typed once.
 */
export function symbolClusters(flat, re = { fixture: /SANR|FIXT|PLUMB.*FIX/i, valve: /VALVE|FITT|WS-M|METER/i, pipefit: /PIPE|PL[-_]CW|CWS/i }) {
  const k = flat.unitToMm;
  const out = [];
  for (const [cls, rx] of Object.entries(re)) {
    // pipe layers: only the tiny pieces (fitting outlines, < 60 mm) become symbols; pipe walls stay pipes
    const ls = flat.lines.filter((l) => rx.test(l.layer) && !/IDEN|TEXT/i.test(l.layer) && (cls !== 'pipefit' || Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) * k < 60));
    if (!ls.length) continue;
    // union segments whose end points are within 40 mm (real) of each other – point grid, O(n)
    const tol = (cls === 'pipefit' ? 12 : 40) / k;
    const par = ls.map((_, i) => i);
    const find = (i) => (par[i] === i ? i : (par[i] = find(par[i])));
    const grid = new Map();
    const key = (x, y) => `${Math.floor(x / tol)},${Math.floor(y / tol)}`;
    ls.forEach((l, i) => {
      for (const p of [l.a, l.b]) {
        const kk = key(p.x, p.y);
        (grid.get(kk) || grid.set(kk, []).get(kk)).push(i);
      }
    });
    for (const [kk, list] of grid) {
      const [cx, cy] = kk.split(',').map(Number);
      const root = find(list[0]);
      for (const i of list) par[find(i)] = root;
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        const o = grid.get(`${cx + dx},${cy + dy}`);
        if (o) par[find(o[0])] = find(root);
      }
    }
    const groups = new Map();
    ls.forEach((l, i) => (groups.get(find(i)) || groups.set(find(i), []).get(find(i))).push(l));
    for (const g of groups.values()) {
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity, len = 0;
      for (const l of g) {
        for (const p of [l.a, l.b]) {
          minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y);
        }
        len += Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y);
      }
      const w = (maxx - minx) * k;
      const h = (maxy - miny) * k;
      if (Math.max(w, h) > (cls === 'fixture' ? 900 : 2500) || len * k < 30) continue; // room-size linework / dust
      // signature: size (rotation independent) + amount of linework, rounded
      const big = Math.max(w, h);
      const small = Math.min(w, h);
      const sig = `${cls}:${Math.round(big / 25) * 25}x${Math.round(small / 25) * 25}:${Math.round((len * k) / 100) * 100}:${Math.round(g.length / 4) * 4}`;
      const id = out.length;
      g.forEach((l) => (l.owner = id));
      out.push({ id, name: sig, label: sig, sig, layer: g[0].layer, cls: cls === 'pipefit' ? 'valve' : cls, kind: cls === 'pipefit' ? 'Fitting' : undefined, minx, miny, maxx, maxy, x: (minx + maxx) / 2, y: (miny + maxy) / 2, parent: null, preset: true, n: g.length });
    }
  }
  return out;
}
