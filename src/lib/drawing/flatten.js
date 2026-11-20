// Flatten a LibreDWG database into world-coordinate primitives:
//   lines (pipes, any layer), texts, and block references (fittings / fixtures / equipment)
// Block references are expanded recursively so nested geometry lands at its real position.

const SYMBOL = /elbow|tee|valve|cock|strainer|reducer|union|coupling|flange|meter|arrest|whа|wha|prv|pump|heater|basin|wc|closet|shattaf|spray|sink|shower|urinal|bib|tap|bidet|tub|washing|dish|drain|floor trap|gully|cleanout|vent|nozzle|diffuser|fcu|ahu|coil/i;

const tf = (m, p) => ({ x: m[0] * p.x + m[1] * p.y + m[4], y: m[2] * p.x + m[3] * p.y + m[5] });
const mul = (a, b) => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[0] * b[4] + a[1] * b[5] + a[4], a[2] * b[4] + a[3] * b[5] + a[5],
];
const insertMatrix = (e, base = { x: 0, y: 0 }) => {
  const c = Math.cos(e.rotation || 0);
  const s = Math.sin(e.rotation || 0);
  const sx = e.xScale ?? 1;
  const sy = e.yScale ?? 1;
  // world = T(ins) · R · S · T(-base)
  const m = [c * sx, -s * sy, s * sx, c * sy, 0, 0];
  const b = tf(m, base);
  m[4] = e.insertionPoint.x - b.x;
  m[5] = e.insertionPoint.y - b.y;
  return m;
};

const cleanText = (t) =>
  String(t || '')
    .replace(/%%[cC]/g, 'Ø')
    .replace(/\\P/g, ' ')
    .replace(/\\[A-Za-z][^;\\]*;/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Short readable block name (strip Revit ids "-1785570-2nd Floor"). */
export const blockLabel = (n) => String(n || '').replace(/-(\d{4,}|V\d+)-[^-]*$/, '').replace(/\s+-\s+Standard$/, '').trim();

/**
 * @param {object} db  LibreDWG DwgDatabase
 * @returns {{ lines, texts, blocks, units, bbox }}
 */
export function flattenDwg(db) {
  const recs = new Map((db.tables?.BLOCK_RECORD?.entries || []).map((b) => [b.name, b]));
  const lines = [];
  const texts = [];
  const blocks = [];
  const I = [1, 0, 0, 1, 0, 0];

  const walk = (ents, m, owner, depth, inheritLayer) => {
    for (const e of ents || []) {
      if (e.isVisible === false) continue;
      const layer = e.layer === '0' && inheritLayer ? inheritLayer : e.layer;
      const color = e.colorIndex === 256 || e.colorIndex === 0 ? owner?.color ?? e.colorIndex : e.colorIndex;
      if (e.type === 'LINE') {
        lines.push({ a: tf(m, e.startPoint), b: tf(m, e.endPoint), layer, color, owner: owner?.id ?? null });
      } else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE2D' || e.type === 'POLYLINE') {
        const v = e.vertices || [];
        for (let k = 0; k + 1 < v.length; k++) lines.push({ a: tf(m, v[k]), b: tf(m, v[k + 1]), layer, color, owner: owner?.id ?? null });
        if (e.flag & 1 && v.length > 2) lines.push({ a: tf(m, v[v.length - 1]), b: tf(m, v[0]), layer, color, owner: owner?.id ?? null });
      } else if (e.type === 'ARC' && e.radius > 0) {
        // keep arcs as 3 chords – enough for drawing & connectivity
        let a0 = e.startAngle;
        let d = e.endAngle - a0;
        if (d < 0) d += Math.PI * 2;
        const pts = [0, 1, 2, 3].map((k) => ({ x: e.center.x + e.radius * Math.cos(a0 + (d * k) / 3), y: e.center.y + e.radius * Math.sin(a0 + (d * k) / 3) }));
        for (let k = 0; k < 3; k++) lines.push({ a: tf(m, pts[k]), b: tf(m, pts[k + 1]), layer, color, owner: owner?.id ?? null, arc: true });
      } else if (e.type === 'TEXT' || e.type === 'MTEXT') {
        const p = e.insertionPoint || e.startPoint;
        const t = cleanText(e.text);
        if (p && t) texts.push({ text: t, ...tf(m, p), h: (e.textHeight || e.height || 100) * Math.hypot(m[0], m[2]), layer });
      } else if (e.type === 'INSERT' && depth < 6) {
        const rec = recs.get(e.name);
        if (!rec) continue;
        const mm = mul(m, insertMatrix(e, rec.basePoint));
        const isSymbol = SYMBOL.test(e.name);
        let blk = owner;
        if (!owner || (isSymbol && !owner.symbol)) {
          blk = { id: blocks.length, name: e.name, label: blockLabel(e.name), layer, color, minx: Infinity, miny: Infinity, maxx: -Infinity, maxy: -Infinity, symbol: isSymbol, parent: owner?.id ?? null };
          blocks.push(blk);
        }
        const before = lines.length;
        walk(rec.entities, mm, blk, depth + 1, layer);
        if (blk !== owner) {
          for (let k = before; k < lines.length; k++) for (const p of [lines[k].a, lines[k].b]) {
            blk.minx = Math.min(blk.minx, p.x); blk.maxx = Math.max(blk.maxx, p.x);
            blk.miny = Math.min(blk.miny, p.y); blk.maxy = Math.max(blk.maxy, p.y);
          }
          if (!Number.isFinite(blk.minx)) {
            const p = tf(mm, rec.basePoint || { x: 0, y: 0 });
            Object.assign(blk, { minx: p.x, maxx: p.x, miny: p.y, maxy: p.y });
          }
          blk.x = (blk.minx + blk.maxx) / 2;
          blk.y = (blk.miny + blk.maxy) / 2;
        }
        for (const a of e.attribs || []) {
          const p = a.insertionPoint || a.startPoint;
          const t = cleanText(a.text);
          if (p && t) texts.push({ text: t, ...tf(m, p), h: a.textHeight || 100, layer });
        }
      }
    }
  };
  walk(db.entities, I, null, 0, null);

  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const l of lines) for (const p of [l.a, l.b]) {
    if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x;
    if (p.y < miny) miny = p.y; if (p.y > maxy) maxy = p.y;
  }
  const insunits = db.header?.INSUNITS;
  const unitToMm = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 }[insunits] ?? 1;
  return { lines, texts, blocks, unitToMm, bbox: { minx, miny, maxx, maxy } };
}

/** Layer / colour groups for the filter list. */
export function lineGroups(flat) {
  const g = {};
  for (const l of flat.lines) {
    const k = `${l.layer}|${l.color}`;
    (g[k] ||= { key: k, layer: l.layer, color: l.color, count: 0 }).count++;
  }
  return Object.values(g).sort((a, b) => b.count - a.count);
}
