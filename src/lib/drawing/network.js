// Pipe network from CAD geometry:
//  1. pair parallel double lines → pipe centre-lines with outside diameter (gap = OD)
//     (single-line drawings: every line is a centre-line, size from nearby labels)
//  2. join ends at fittings / tees / elbows → graph
//  3. attach fixtures, pick the source, trace the critical (index) route
import { FIXTURES, ipcDemandGpm, LPS_PER_GPM, hwPsiPer100ft, equivalentLength, FT_PER_M, PSI_PER_BAR, M_PER_BAR } from '../ipc.js';
import { PPR, odToNominal, pprId, snapOd } from './ppr.js';

/* ---------------- block classification ---------------- */
const FIXTURE_RULES = [
  [/urinal/i, 'Urinal – Private / Flush Tank'],
  [/\bwc\b|w\.c|closet|toilet|flush/i, 'Water Closet – Private / Flush Tank'],
  [/shattaf|hand ?spray|ablution|bidet spray|health faucet/i, 'Ablution Spray / Hand Spray'],
  [/basin|lavatory|\blav\b|wash ?hand/i, 'Wash Basin / Lavatory'],
  [/kitchen|sink/i, 'Kitchen Sink'],
  [/shower/i, 'Shower'],
  [/bath ?tub|bathtub/i, 'Bathtub'],
  [/bidet/i, 'Bidet'],
  [/washing ?machine|\bwm\b/i, 'Washing Machine'],
  [/dish ?washer/i, 'Dishwasher'],
  [/bib|hose|\bhb\b|garden tap/i, 'Hose Bibb / Bib Tap'],
];
const FITTING_RULES = [
  [/pressure reducing|\bprv\b/i, 'PRV'],
  [/check|non.?return|\bnrv\b/i, 'Check Valve, Swing'],
  [/gate valve|isolat/i, 'Gate Valve'],
  [/ball.?valve|ball\b/i, 'Ball Valve'],
  [/butterfly/i, 'Butterfly Valve'],
  [/globe/i, 'Globe Valve'],
  [/strainer/i, 'Y-Strainer'],
  [/angle valve/i, 'Angle Valve'],
  [/elbow|bend/i, 'Elbow'],
  [/tee/i, 'Tee'],
  [/reduc|concentric|eccentric/i, 'Reducer'],
  [/meter/i, 'Water Meter'],
  [/arrest|hammer|\bwha\b/i, 'Water Hammer Arrestor'],
  [/heater|geyser|calorifier/i, 'Water Heater'],
];
export function classifyBlock(b) {
  // symbols grouped from a PDF: their type is assigned by the user (or left unassigned / ignored)
  if (b.preset) {
    if (b.kind === 'ignore') return { cls: 'other', kind: '' };
    if (b.cls === 'fixture') return { cls: 'fixture', kind: b.kind || UNASSIGNED };
    return { cls: 'fitting', kind: b.kind || 'In-line item' };
  }
  const n = b.label || b.name || '';
  if (/door|window|glaz|furniture|vanity|mirror|partition/i.test(n) || /^A-/i.test(b.layer || '')) return { cls: 'other', kind: '' };
  for (const [re, kind] of FIXTURE_RULES) if (re.test(n) && !/valve.*(gate|ball|check)/i.test(n)) {
    // "WC VALCE - Shattaf" (WC valve) is a WC; "Wash Basin Angle Valve" is a basin
    return { cls: 'fixture', kind };
  }
  for (const [re, kind] of FITTING_RULES) if (re.test(n)) return { cls: kind === 'Water Heater' ? 'equipment' : 'fitting', kind };
  return { cls: 'other', kind: '' };
}
export const UNASSIGNED = 'Unassigned symbol';
export const fixtureWsfu = (kind) => (kind === UNASSIGNED ? 0 : FIXTURES.find((f) => f.name === kind)?.wsfu ?? 1);

/* ---------------- geometry helpers ---------------- */
const len = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * @param {ReturnType<import('./flatten.js').flattenDwg>} flat
 * @param {{ include: (line)=>boolean, single?: boolean }} opt
 */
export function buildNetwork(flat, opt) {
  const k = flat.unitToMm || 1;
  const symbolIds = new Set(flat.blocks.filter((b) => classifyBlock(b).cls !== 'other').map((b) => b.id));
  const tiny = new Set(flat.blocks.filter((b) => Math.hypot(b.maxx - b.minx, b.maxy - b.miny) * k < 400).map((b) => b.id));
  const raw = flat.lines.filter((l) => opt.include(l) && !(l.owner != null && (symbolIds.has(l.owner) || tiny.has(l.owner))) && !l.arc);
  const segs = raw
    .map((l) => ({ a: { x: l.a.x * k, y: l.a.y * k }, b: { x: l.b.x * k, y: l.b.y * k } }))
    .map((s) => ({ ...s, L: len(s.a, s.b) }))
    .filter((s) => s.L > 3);
  for (const s of segs) {
    s.ux = (s.b.x - s.a.x) / s.L;
    s.uy = (s.b.y - s.a.y) / s.L;
    if (s.ux < -1e-9 || (Math.abs(s.ux) < 1e-9 && s.uy < 0)) {
      [s.a, s.b] = [s.b, s.a];
      s.ux = -s.ux;
      s.uy = -s.uy;
    }
    s.ang = Math.atan2(s.uy, s.ux);
    s.c = -s.uy * s.a.x + s.ux * s.a.y; // perpendicular offset
    s.t0 = s.ux * s.a.x + s.uy * s.a.y;
    s.t1 = s.t0 + s.L;
    s.used = [];
  }

  /* 1) centre-lines */
  const centre = [];
  let paired = 0;
  if (!opt.single) {
    // spatial grid: each segment registered in the cells it passes through
    const CELL = 300;
    const sgrid = new Map();
    segs.forEach((s, i) => {
      s.i = i;
      const n = Math.max(1, Math.ceil(s.L / 150));
      const cells = new Set();
      for (let k2 = 0; k2 <= n; k2++) {
        const x = s.a.x + (s.b.x - s.a.x) * (k2 / n);
        const y = s.a.y + (s.b.y - s.a.y) * (k2 / n);
        cells.add(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`);
      }
      s.cells = [...cells];
      for (const c of cells) (sgrid.get(c) || sgrid.set(c, []).get(c)).push(s);
    });
    const cand = [];
    for (const p of segs) {
      const seenQ = new Set();
      for (const c of p.cells) {
        const [cx, cy] = c.split(',').map(Number);
        for (let dx = -1; dx <= 1; dx++)
          for (let dy = -1; dy <= 1; dy++)
            for (const q of sgrid.get(`${cx + dx},${cy + dy}`) || []) {
              if (q.i <= p.i || seenQ.has(q.i)) continue;
              seenQ.add(q.i);
              if (Math.abs(p.ux * q.uy - p.uy * q.ux) > 0.012) continue;
              // q end points in p's frame
              const off = (pt) => -(pt.x - p.a.x) * p.uy + (pt.y - p.a.y) * p.ux;
              const tt = (pt) => (pt.x - p.a.x) * p.ux + (pt.y - p.a.y) * p.uy;
              const oa = off(q.a);
              const ob = off(q.b);
              if (Math.sign(oa) !== Math.sign(ob) || Math.abs(oa - ob) > 10) continue;
              const d = Math.abs(oa + ob) / 2;
              if (d < 12 || d > 175) continue;
              const qa = tt(q.a);
              const qb = tt(q.b);
              const lo = Math.max(0, Math.min(qa, qb));
              const hi = Math.min(p.L, Math.max(qa, qb));
              const ov = hi - lo;
              if (ov <= 0 || (ov < Math.min(0.5 * Math.min(p.L, q.L), 150) && ov < 0.8 * Math.min(p.L, q.L))) continue;
              cand.push({ p, q, d, side: Math.sign(oa), lo, hi });
            }
      }
    }
    cand.sort((x, y) => x.d - y.d);
    // used intervals: p in its own t-axis; q mapped to p's axis via projection (stored per pair partner on p's axis)
    const tq = (q, p, t) => {
      const x = p.a.x + p.ux * t;
      const y = p.a.y + p.uy * t;
      return (x - q.a.x) * q.ux + (y - q.a.y) * q.uy;
    };
    // subtract already-used parts; pair whatever free stretches remain (≥ 120 mm)
    const freeParts = (lo, hi, used) => {
      let parts = [[lo, hi]];
      for (const [u0, u1] of used)
        parts = parts.flatMap(([a, b]) => (u1 <= a || u0 >= b ? [[a, b]] : [[a, Math.max(a, u0)], [Math.min(b, u1), b]].filter(([x, y]) => y - x > 1)));
      return parts;
    };
    for (const c of cand) {
      // q's used intervals expressed on p's axis
      const qUsedOnP = c.q.used.map(([a, b]) => {
        const toP = (t) => {
          const x = c.q.a.x + c.q.ux * t;
          const y = c.q.a.y + c.q.uy * t;
          return (x - c.p.a.x) * c.p.ux + (y - c.p.a.y) * c.p.uy;
        };
        const x0 = toP(a);
        const x1 = toP(b);
        return [Math.min(x0, x1), Math.max(x0, x1)];
      });
      const parts = freeParts(c.lo, c.hi, [...c.p.used, ...qUsedOnP]).filter(([a, b]) => b - a >= Math.min(120, 0.8 * (c.hi - c.lo)));
      for (const [lo, hi] of parts) {
        const q0 = tq(c.q, c.p, lo);
        const q1 = tq(c.q, c.p, hi);
        c.p.used.push([lo, hi]);
        c.q.used.push([Math.min(q0, q1), Math.max(q0, q1)]);
        const h = (c.side * c.d) / 2;
        const at = (t) => ({ x: c.p.a.x + c.p.ux * t - c.p.uy * h, y: c.p.a.y + c.p.uy * t + c.p.ux * h });
        centre.push({ a: at(lo), b: at(hi), od: c.d, paired: true });
        paired += hi - lo;
      }
    }
  }
  // double-line drawing if most of the long linework pairs up (short bits are fitting outlines / caps)
  const total = segs.filter((x) => x.L >= 100).reduce((s, x) => s + x.L, 0);
  const doubleMode = !opt.single && paired > 0.25 * total;
  // leftovers: in single-line mode every line; in double-line mode long unpaired lines (likely single-line runs)
  for (const s of segs) {
    const usedLen = s.used.reduce((t, [a, b]) => t + (b - a), 0);
    if (!doubleMode) centre.push({ a: s.a, b: s.b, od: null, paired: false });
    else if (usedLen < 0.2 * s.L && s.L > 600) centre.push({ a: s.a, b: s.b, od: null, paired: false });
  }

  /* 2) graph – merge ends, split at T-junctions, bridge fittings */
  const nodes = [];
  const grid = new Map();
  const cell = 250;
  const gk = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  const addNode = (p) => {
    const n = { id: nodes.length, x: p.x, y: p.y, edges: [], parent: null };
    nodes.push(n);
    const key = gk(p.x, p.y);
    (grid.get(key) || grid.set(key, []).get(key)).push(n);
    return n;
  };
  const near = (p, r) => {
    const out = [];
    const cx = Math.floor(p.x / cell);
    const cy = Math.floor(p.y / cell);
    const span = Math.ceil(r / cell);
    for (let i = -span; i <= span; i++) for (let j = -span; j <= span; j++) for (const n of grid.get(`${cx + i},${cy + j}`) || []) if (Math.hypot(n.x - p.x, n.y - p.y) <= r) out.push(n);
    return out;
  };
  // union-find for endpoint merging
  const par = [];
  const find = (i) => (par[i] === i ? i : (par[i] = find(par[i])));
  const union = (a, b) => (par[find(a)] = find(b));

  const ends = [];
  centre.forEach((c, ci) => {
    c.na = addNode(c.a);
    c.nb = addNode(c.b);
    ends.push({ n: c.na, c: ci }, { n: c.nb, c: ci });
  });
  nodes.forEach((n) => (par[n.id] = n.id));
  const tolOf = (c) => Math.max(60, 1.6 * (c.od || 40));
  // end ↔ end
  for (const e of ends) {
    const tol = tolOf(centre[e.c]);
    for (const m of near(e.n, tol)) if (m !== e.n && m.id !== centre[e.c].na.id + centre[e.c].nb.id - e.n.id) union(e.n.id, m.id);
  }
  // end ↔ segment interior (tee): split later by recording attachment points
  const attach = centre.map(() => []);
  const segIndex = new Map();
  centre.forEach((c, ci) => {
    const minx = Math.min(c.a.x, c.b.x), maxx = Math.max(c.a.x, c.b.x), miny = Math.min(c.a.y, c.b.y), maxy = Math.max(c.a.y, c.b.y);
    for (let i = Math.floor(minx / 1000); i <= Math.floor(maxx / 1000); i++) for (let j = Math.floor(miny / 1000); j <= Math.floor(maxy / 1000); j++) (segIndex.get(`${i},${j}`) || segIndex.set(`${i},${j}`, []).get(`${i},${j}`)).push(ci);
  });
  for (const e of ends) {
    const own = centre[e.c];
    const p = e.n;
    const list = new Set(segIndex.get(`${Math.floor(p.x / 1000)},${Math.floor(p.y / 1000)}`) || []);
    for (const ci of list) {
      if (ci === e.c) continue;
      const c = centre[ci];
      const L = len(c.a, c.b);
      if (L < 1) continue;
      const ux = (c.b.x - c.a.x) / L;
      const uy = (c.b.y - c.a.y) / L;
      const t = (p.x - c.a.x) * ux + (p.y - c.a.y) * uy;
      if (t < 30 || t > L - 30) continue;
      const d = Math.abs(-(p.x - c.a.x) * uy + (p.y - c.a.y) * ux);
      const lim = (c.od || 40) / 2 + Math.max(50, (own.od || 40) * 1.5);
      if (d <= lim) attach[ci].push({ t, n: p });
    }
  }
  // fittings: all ends inside a fitting's box are one node
  const fittings = [];
  const fixtures = [];
  const equipment = [];
  for (const b of flat.blocks) {
    const { cls, kind } = classifyBlock(b);
    const box = { minx: b.minx * k, maxx: b.maxx * k, miny: b.miny * k, maxy: b.maxy * k, x: b.x * k, y: b.y * k };
    if (cls === 'fitting') fittings.push({ ...box, kind, label: b.label, id: b.id });
    else if (cls === 'fixture') fixtures.push({ ...box, kind, label: b.label, sig: b.sig, id: b.id, layer: b.layer, nested: b.parent != null, wsfu: fixtureWsfu(kind) });
    else if (cls === 'equipment') equipment.push({ ...box, kind, label: b.label, id: b.id });
  }
  // fittings and other small in-line blocks (meters, anonymous valve symbols, Revit zw$ fittings).
  // Blocks that touch each other are chained (e.g. two elbows back to back, meter beside a union).
  const items = [];
  const pad = 40;
  const endsIn = (box) => {
    const r = Math.hypot(box.maxx - box.minx, box.maxy - box.miny) / 2 + pad;
    return near(box, r).filter((n) => n.x >= box.minx - pad && n.x <= box.maxx + pad && n.y >= box.miny - pad && n.y <= box.maxy + pad);
  };
  for (const f of fittings) items.push({ f, box: f, nodes: endsIn(f), fitting: true });
  for (const b of flat.blocks) {
    const cls = classifyBlock(b).cls;
    if (cls !== 'other') continue;
    const box = { minx: b.minx * k, maxx: b.maxx * k, miny: b.miny * k, maxy: b.maxy * k, x: b.x * k, y: b.y * k };
    const diag = Math.hypot(box.maxx - box.minx, box.maxy - box.miny);
    if (diag > 700 || diag < 15) continue;
    const ns = endsIn(box);
    if (!ns.length) continue;
    const f = { ...box, kind: /meter/i.test(b.label) || /-M$|METER/i.test(b.layer) ? 'Water Meter' : 'In-line item', label: b.label, id: b.id };
    items.push({ f, box, nodes: ns, fitting: false });
  }
  const ip = items.map((_, i) => i);
  const ifind = (i) => (ip[i] === i ? i : (ip[i] = ifind(ip[i])));
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const A = items[i].box;
      const B = items[j].box;
      if (A.minx - pad <= B.maxx && B.minx - pad <= A.maxx && A.miny - pad <= B.maxy && B.miny - pad <= A.maxy) ip[ifind(i)] = ifind(j);
    }
  const groups = new Map();
  items.forEach((it, i) => (groups.get(ifind(i)) || groups.set(ifind(i), []).get(ifind(i))).push(it));
  const ownerOf = new Map(ends.map((e2) => [e2.n, e2.c]));
  for (const g of groups.values()) {
    const ns = [...new Set(g.flatMap((it) => it.nodes))];
    const owners = new Set(ns.map((n) => ownerOf.get(n)));
    const hasFitting = g.some((it) => it.fitting);
    if (!(hasFitting ? owners.size >= 1 : owners.size >= 2 && owners.size <= 4)) continue;
    for (let i = 1; i < ns.length; i++) union(ns[0].id, ns[i].id);
    for (const it of g) {
      it.f.nodeIds = ns.map((n) => n.id);
      if (!it.fitting) fittings.push(it.f);
    }
  }

  // collinear gaps (in-line valves, meters, labels breaking the pipe): join a pipe end to the nearest end it
  // points straight at – a collinear continuation up to 1.2 m, any pipe end up to 1 m
  const bridges = [];
  for (const e of ends) {
    const c = centre[e.c];
    const other = e.n === c.na ? c.nb : c.na;
    const L = len(c.a, c.b);
    if (L < 1) continue;
    const dx = (e.n.x - other.x) / L;
    const dy = (e.n.y - other.y) / L; // outward direction at this end
    let best = null;
    for (const m of near(e.n, 1200)) {
      if (m === e.n || m === other) continue;
      const vx = m.x - e.n.x;
      const vy = m.y - e.n.y;
      const along = vx * dx + vy * dy;
      const side = Math.abs(-vx * dy + vy * dx);
      if (along <= 0 || side > Math.max(12, (c.od || 30) / 2)) continue;
      const oc = centre[ends.find((x) => x.n === m).c];
      const om = m === oc.na ? oc.nb : oc.na;
      const ol = len(oc.a, oc.b);
      if (ol < 100) continue;
      const opposite = ((m.x - om.x) / ol) * dx + ((m.y - om.y) / ol) * dy < -0.98;
      if (!opposite && along > 1000) continue;
      if (!best || along < best.along) best = { m, along };
    }
    if (best && find(best.m.id) !== find(e.n.id)) bridges.push([e.n, best.m]);
  }
  // only bridge free ends (an end already joined to something at a fitting is not a gap)
  const deg = new Map();
  for (const n of nodes) deg.set(find(n.id), (deg.get(find(n.id)) || 0) + 1);
  for (const [a2, b2] of bridges) if (deg.get(find(a2.id)) === 1 && find(a2.id) !== find(b2.id)) union(a2.id, b2.id);
  // build final graph: canonical node per union set; split segments at tees
  const canon = new Map();
  const G = [];
  const gnode = (n) => {
    const r = find(n.id);
    if (!canon.has(r)) canon.set(r, { id: G.length, xs: 0, ys: 0, cnt: 0, edges: [], fittings: [] });
    const g = canon.get(r);
    if (g.id === G.length) G.push(g);
    g.xs += n.x;
    g.ys += n.y;
    g.cnt++;
    return g;
  };
  const edges = [];
  centre.forEach((c, ci) => {
    const pts = [{ t: 0, g: gnode(c.na) }, ...attach[ci].map((a) => ({ t: a.t, g: gnode(a.n) })), { t: len(c.a, c.b), g: gnode(c.nb) }].sort((x, y) => x.t - y.t);
    const L = len(c.a, c.b);
    const at = (t) => ({ x: c.a.x + ((c.b.x - c.a.x) * t) / L, y: c.a.y + ((c.b.y - c.a.y) * t) / L });
    for (let i = 0; i + 1 < pts.length; i++) {
      const u = pts[i].g;
      const v = pts[i + 1].g;
      if (u === v || pts[i + 1].t - pts[i].t < 1) continue;
      const e = { id: edges.length, u: u.id, v: v.id, a: at(pts[i].t), b: at(pts[i + 1].t), L: pts[i + 1].t - pts[i].t, od: c.od, paired: c.paired };
      edges.push(e);
      u.edges.push(e.id);
      v.edges.push(e.id);
    }
  });
  for (const g of G) {
    g.x = g.xs / g.cnt;
    g.y = g.ys / g.cnt;
  }
  for (const f of fittings) {
    const set = new Set((f.nodeIds || []).map((id) => canon.get(find(id))?.id).filter((x) => x != null));
    for (const id of set) G[id].fittings.push(f.kind);
    f.node = [...set][0] ?? null;
  }

  /* 3) sizes: snap OD; unknown sizes from labels ("32 mmØ", "Ø32") or neighbours */
  const labels = flat.texts
    .map((t) => {
      const m = t.text.match(/(?:Ø\s*(\d{2,3})(?!\d)|(\d{2,3})\s*mm\s*Ø?)/i);
      return m ? { x: t.x * k, y: t.y * k, od: snapOd(Number(m[1] || m[2])) } : null;
    })
    .filter(Boolean);
  for (const e of edges) {
    if (e.od) e.od = snapOd(e.od);
    else {
      const mx = (e.a.x + e.b.x) / 2;
      const my = (e.a.y + e.b.y) / 2;
      let best = null;
      let bd = 1500;
      for (const l of labels) {
        const d = Math.hypot(l.x - mx, l.y - my);
        if (d < bd) (bd = d), (best = l);
      }
      if (best) (e.od = best.od), (e.odFromLabel = true);
    }
  }
  for (let pass = 0; pass < 6; pass++)
    for (const e of edges)
      if (!e.od)
        for (const nid of [e.u, e.v]) {
          const o = G[nid].edges.map((id) => edges[id]).find((x) => x.od);
          if (o) {
            e.od = o.od;
            e.odGuessed = true;
            break;
          }
        }
  for (const e of edges) if (!e.od) (e.od = 25), (e.odGuessed = true);

  /* 4) fixtures → pipe ends within reach (cold & hot ends both kept; analysis uses the reachable one).
        The same outlet drawn twice (valve symbol + sanitary ware) is counted once. */
  const REACH = opt.fixtureReach || 700;
  const kept = [];
  const loose = [];
  const order = [...fixtures].sort((x, y) => (/^P-|PLUMB|SANR|FIXT/i.test(y.layer || '') ? 1 : 0) - (/^P-|PLUMB|SANR|FIXT/i.test(x.layer || '') ? 1 : 0));
  // a fixture type drawn by the plumbing designer at top level wins over copies inside xref / background blocks
  const topKinds = new Set(fixtures.filter((f) => !f.nested).map((f) => f.kind));
  for (const f of order) {
    if (f.nested && topKinds.has(f.kind)) continue;
    if (kept.some((o) => o.kind === f.kind && Math.hypot(o.x - f.x, o.y - f.y) < 260)) continue;
    const cands = G.map((g) => ({ g, d: Math.hypot(g.x - f.x, g.y - f.y) }))
      .filter((c) => c.d < REACH && c.g.edges.length <= 2)
      .map((c) => ({ ...c, w: c.d * (c.g.edges.length === 1 ? 1 : 1.6) }))
      .sort((x, y) => x.w - y.w)
      .map((c) => c.g.id);
    if (!cands.length) {
      loose.push(f);
      continue;
    }
    f.nodes = cands;
    f.node = cands[0];
    kept.push(f);
  }
  fixtures.length = 0;
  fixtures.push(...kept);

  return { nodes: G, edges, fittings, fixtures, loose, equipment, doubleMode, pairedPct: total ? paired / total : 0 };
}

/* ---------------- routing ---------------- */
function dijkstra(net, src) {
  const dist = new Array(net.nodes.length).fill(Infinity);
  const prevE = new Array(net.nodes.length).fill(-1);
  dist[src] = 0;
  const done = new Uint8Array(net.nodes.length);
  // simple binary heap
  const h = [[0, src]];
  const push = (x) => {
    h.push(x);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (h[p][0] <= h[i][0]) break;
      [h[p], h[i]] = [h[i], h[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = h[0];
    const last = h.pop();
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && h[l][0] < h[m][0]) m = l;
        if (r < h.length && h[r][0] < h[m][0]) m = r;
        if (m === i) break;
        [h[m], h[i]] = [h[i], h[m]];
        i = m;
      }
    }
    return top;
  };
  while (h.length) {
    const [d, u] = pop();
    if (done[u]) continue;
    done[u] = 1;
    for (const eid of net.nodes[u].edges) {
      const e = net.edges[eid];
      const v = e.u === u ? e.v : e.u;
      const nd = d + e.L;
      if (nd < dist[v]) {
        dist[v] = nd;
        prevE[v] = eid;
        push([nd, v]);
      }
    }
  }
  return { dist, prevE };
}

/** Pick a likely source: a dangling end on the largest pipe, farthest from the fixtures' centre. */
export function autoSource(net) {
  // connected components
  const comp = new Array(net.nodes.length).fill(-1);
  let nc = 0;
  for (const n of net.nodes) {
    if (comp[n.id] >= 0) continue;
    const st = [n.id];
    comp[n.id] = nc;
    while (st.length) {
      const u = st.pop();
      for (const eid of net.nodes[u].edges) {
        const e = net.edges[eid];
        const v = e.u === u ? e.v : e.u;
        if (comp[v] < 0) (comp[v] = nc), st.push(v);
      }
    }
    nc++;
  }
  const load = new Array(nc).fill(0);
  for (const f of net.fixtures) if (f.node != null) load[comp[f.node]] += f.wsfu;
  const main = load.indexOf(Math.max(...load));
  const fx = net.fixtures.filter((f) => comp[f.node] === main);
  const cx = fx.reduce((s, f) => s + f.x, 0) / Math.max(1, fx.length);
  const cy = fx.reduce((s, f) => s + f.y, 0) / Math.max(1, fx.length);
  const outlets = new Set(net.fixtures.flatMap((f) => f.nodes || [f.node]));
  // supply end = the root from which pipe sizes only step down: fewest metres of pipe that get bigger
  // downstream; tie → larger pipe at the end
  let best = null;
  let bestScore = Infinity;
  for (const g of net.nodes) {
    if (g.edges.length !== 1 || comp[g.id] !== main || outlets.has(g.id)) continue;
    const seen = new Map([[g.id, net.edges[g.edges[0]].od]]);
    const st = [g.id];
    let bad = 0;
    while (st.length) {
      const u = st.pop();
      const parentOd = seen.get(u);
      for (const eid of net.nodes[u].edges) {
        const e = net.edges[eid];
        const v = e.u === u ? e.v : e.u;
        if (seen.has(v)) continue;
        if (e.od > parentOd + 1) bad += (e.L / 1000) * (e.od - parentOd);
        seen.set(v, e.od);
        st.push(v);
      }
    }
    const score = bad - (net.edges[g.edges[0]].od || 0) * 0.01;
    if (score < bestScore) (bestScore = score), (best = g.id);
  }
  return best;
}

const angleAt = (e, nodeId, net) => {
  const n = net.nodes[nodeId];
  const far = Math.hypot(e.a.x - n.x, e.a.y - n.y) > Math.hypot(e.b.x - n.x, e.b.y - n.y) ? e.a : e.b;
  return Math.atan2(far.y - n.y, far.x - n.x);
};

/**
 * Analyse the network from a source.
 * @param {object} net   buildNetwork result
 * @param {number} src   source node id
 * @param {{ supplyType?: 'tank'|'valve', pn?: string, C?: number, fixtures?: boolean }} opt
 * @returns paths to every fixture (or every dangling end) with losses; .critical = worst
 */
export function analyse(net, src, opt = {}) {
  const { dist, prevE } = dijkstra(net, src);
  const C = opt.C || 150;
  const pn = opt.pn || 'PN20';
  // downstream fixture units per edge (shortest-path tree)
  const wsfuAt = new Array(net.nodes.length).fill(0);
  const fixAt = new Map();
  for (const f of net.fixtures) f.at = f.kind === 'ignore' ? null : (f.nodes || [f.node]).find((id) => id != null && dist[id] < Infinity && id !== src) ?? null;
  for (const f of net.fixtures) if (f.at != null) {
    wsfuAt[f.at] += f.wsfu;
    (fixAt.get(f.at) || fixAt.set(f.at, []).get(f.at)).push(f);
  }
  const order = net.nodes.map((n) => n.id).filter((i) => dist[i] < Infinity).sort((a, b) => dist[b] - dist[a]);
  const edgeWsfu = new Array(net.edges.length).fill(0);
  const sub = [...wsfuAt];
  for (const v of order) {
    const eid = prevE[v];
    if (eid < 0) continue;
    const e = net.edges[eid];
    const u = e.u === v ? e.v : e.u;
    edgeWsfu[eid] = sub[v];
    sub[u] += sub[v];
  }
  const flowOf = (eid) => (opt.flowLps != null ? opt.flowLps : ipcDemandGpm(edgeWsfu[eid], opt.supplyType || 'tank').gpm * LPS_PER_GPM);

  const pathTo = (target) => {
    const ids = [];
    let v = target;
    while (v !== src && prevE[v] >= 0) {
      ids.push(prevE[v]);
      const e = net.edges[prevE[v]];
      v = e.u === v ? e.v : e.u;
    }
    return ids.reverse();
  };
  const evaluate = (target) => {
    const eids = pathTo(target);
    if (!eids.length) return null;
    const items = [];
    let frictionBar = 0;
    let lengthM = 0;
    let node = src;
    eids.forEach((eid, k) => {
      const e = net.edges[eid];
      const q = flowOf(eid);
      const idMm = pprId(e.od, pn);
      const idIn = idMm / 25.4;
      const psi100 = hwPsiPer100ft(q, C, idIn);
      const Lm = e.L / 1000;
      lengthM += Lm;
      const pipeBar = (Lm * FT_PER_M * psi100) / 100 / PSI_PER_BAR;
      frictionBar += pipeBar;
      items.push({ type: 'pipe', eid, od: e.od, idMm, nominal: odToNominal(e.od), q, wsfu: edgeWsfu[eid], Lm, bar: pipeBar });
      const next = e.u === node ? e.v : e.u;
      // fittings at the node we arrive at (except the final outlet)
      const nn = net.nodes[next];
      const nextE = eids[k + 1] != null ? net.edges[eids[k + 1]] : null;
      if (nextE) {
        const nominal = odToNominal(nextE.od);
        const turn = Math.abs(((angleAt(e, next, net) - angleAt(nextE, next, net) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
        const deg = (turn * 180) / Math.PI;
        const fitAdd = (item) => {
          const eq = equivalentLength(item, nominal).ft ?? 0;
          const bar = (eq * hwPsiPer100ft(flowOf(eids[k + 1]), C, pprId(nextE.od, pn) / 25.4)) / 100 / PSI_PER_BAR;
          frictionBar += bar;
          items.push({ type: 'fitting', item, nominal, od: nextE.od, q: flowOf(eids[k + 1]), idMm: pprId(nextE.od, pn), bar, node: next });
        };
        if (nn.edges.length >= 3) fitAdd(deg > 45 ? 'Tee – Branch' : 'Tee – Run');
        else if (deg > 60) fitAdd('90° Elbow');
        else if (deg > 25) fitAdd('45° Elbow');
        for (const f of nn.fittings) if (['Gate Valve', 'Ball Valve', 'Check Valve, Swing', 'Butterfly Valve', 'Globe Valve', 'Y-Strainer', 'Angle Valve'].includes(f)) fitAdd(f);
      }
      node = next;
    });
    return { target, eids, items, frictionBar, frictionM: frictionBar * M_PER_BAR, lengthM, fixtures: fixAt.get(target) || [] };
  };

  const targets = opt.fixtures === false || !net.fixtures.length ? net.nodes.filter((g) => g.edges.length === 1 && g.id !== src && dist[g.id] < Infinity).map((g) => g.id) : [...fixAt.keys()];
  let results = targets.map(evaluate).filter(Boolean).sort((a, b) => b.frictionBar - a.frictionBar);
  if (opt.fixtures === false || !net.fixtures.length) {
    // transfer / discharge / loop mains: keep to routes that stay on main-size pipe, take the longest
    const srcOd = net.edges[net.nodes[src]?.edges?.[0]]?.od || 0;
    const main = results.filter((r) => r.items.every((it) => it.type !== 'pipe' || it.od >= 0.75 * srcOd));
    results = (main.length ? main : results).sort((a, b) => b.lengthM - a.lengthM);
  }
  const reached = net.fixtures.filter((f) => f.at != null);
  // (ignored symbols have no outlet)
  return { src, results, critical: results[0] || null, edgeWsfu, totalWsfu: sub[src], reached, unreached: net.fixtures.length - reached.length, evaluate, dist };
}

/** Group route items into head-loss table rows (same item + size + flow merged). */
export function routeRows(items, pn = 'PN20') {
  const rows = [];
  const keyOf = (it) => `${it.type === 'pipe' ? 'Straight Pipe' : it.item}|${it.nominal}|${it.q.toFixed(2)}`;
  const map = new Map();
  for (const it of items) {
    const item = it.type === 'pipe' ? 'Straight Pipe' : it.item;
    const k = keyOf(it);
    let r = map.get(k);
    if (!r) {
      r = { item, size: it.nominal, od: it.od, qty: 0, length: 0, flow: Number(it.q.toFixed(2)), idIn: Number((pprId(it.od, pn) / 25.4).toFixed(3)) };
      map.set(k, r);
      rows.push(r);
    }
    if (it.type === 'pipe') r.length += it.Lm;
    else r.qty += 1;
  }
  return rows.map((r) => ({ ...r, length: r.item === 'Straight Pipe' ? Number(r.length.toFixed(2)) : '' }));
}

export { PPR };
