// Canvas rendering of a plan: drawing background, pipe network coloured by size, critical route highlighted.
export const OD_COLORS = { 20: '#94a3b8', 25: '#16a34a', 32: '#2563eb', 40: '#9333ea', 50: '#d97706', 63: '#0891b2', 75: '#be185d', 90: '#1e293b', 110: '#4d7c0f', 125: '#7c2d12', 160: '#0f766e' };

/** Bounds of the pipe network (mm), padded. */
export function netBounds(net, pad = 1500) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const e of net.edges) for (const p of [e.a, e.b]) {
    if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x;
    if (p.y < miny) miny = p.y; if (p.y > maxy) maxy = p.y;
  }
  if (!Number.isFinite(minx)) return { minx: 0, miny: 0, maxx: 1000, maxy: 1000 };
  return { minx: minx - pad, miny: miny - pad, maxx: maxx + pad, maxy: maxy + pad };
}

/**
 * @param {CanvasRenderingContext2D} g
 * @param {{ flat, net, route?: {eids:number[], items?:object[]}, src?:number, target?:number, view:{minx,miny,maxx,maxy}, w:number, h:number, print?:boolean, labels?:boolean }} o
 */
export function drawPlan(g, o) {
  const { flat, net, view, w, h } = o;
  const k = flat?.unitToMm || 1;
  const s = Math.min(w / (view.maxx - view.minx), h / (view.maxy - view.miny));
  const ox = (w - (view.maxx - view.minx) * s) / 2;
  const oy = (h - (view.maxy - view.miny) * s) / 2;
  const X = (x) => ox + (x - view.minx) * s;
  const Y = (y) => h - oy - (y - view.miny) * s;
  g.save();
  g.fillStyle = o.print ? '#ffffff' : o.dark ? '#0b1220' : '#ffffff';
  g.fillRect(0, 0, w, h);
  g.lineCap = 'round';

  // background drawing (architecture, all layers) – faint
  if (flat) {
    g.strokeStyle = o.dark && !o.print ? 'rgba(148,163,184,0.22)' : 'rgba(100,116,139,0.28)';
    g.lineWidth = 0.6;
    g.beginPath();
    let n = 0;
    for (const l of flat.lines) {
      const ax = l.a.x * k, ay = l.a.y * k, bx = l.b.x * k, by = l.b.y * k;
      if ((ax < view.minx && bx < view.minx) || (ax > view.maxx && bx > view.maxx) || (ay < view.miny && by < view.miny) || (ay > view.maxy && by > view.maxy)) continue;
      g.moveTo(X(ax), Y(ay));
      g.lineTo(X(bx), Y(by));
      if (++n > 150000) break;
    }
    g.stroke();
  }

  // network by size
  const crit = new Set(o.route?.eids || []);
  g.lineWidth = Math.max(1.4, 2.2 * Math.sqrt(s * 40));
  for (const e of net.edges) {
    if (crit.has(e.id)) continue;
    g.strokeStyle = OD_COLORS[e.od] || '#334155';
    g.beginPath();
    g.moveTo(X(e.a.x), Y(e.a.y));
    g.lineTo(X(e.b.x), Y(e.b.y));
    g.stroke();
  }
  // critical route
  if (crit.size) {
    g.strokeStyle = 'rgba(220,38,38,0.28)';
    g.lineWidth = Math.max(7, 9 * Math.sqrt(s * 40));
    g.beginPath();
    for (const id of crit) {
      const e = net.edges[id];
      g.moveTo(X(e.a.x), Y(e.a.y));
      g.lineTo(X(e.b.x), Y(e.b.y));
    }
    g.stroke();
    g.strokeStyle = '#dc2626';
    g.lineWidth = Math.max(2.6, 3.6 * Math.sqrt(s * 40));
    g.stroke();
  }
  // fixtures
  for (const f of net.fixtures) {
    g.fillStyle = f.at == null && f.node == null ? '#f97316' : '#16a34a';
    g.beginPath();
    g.arc(X(f.x), Y(f.y), Math.max(2.2, 3 * Math.sqrt(s * 40)), 0, Math.PI * 2);
    g.fill();
  }
  // route section numbers
  if (o.labels !== false && o.route?.items) {
    let k2 = 0;
    g.font = `bold ${Math.max(10, Math.min(14, 12 * Math.sqrt(s * 40)))}px Helvetica, Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let lastOd = null;
    for (const it of o.route.items) {
      if (it.type !== 'pipe' || it.Lm < 0.5) continue;
      if (it.od === lastOd && it.Lm < 3) continue;
      lastOd = it.od;
      const e = net.edges[it.eid];
      const mx = X((e.a.x + e.b.x) / 2);
      const my = Y((e.a.y + e.b.y) / 2);
      const t = `${++k2}: Ø${it.od}`;
      const tw = g.measureText(t).width + 8;
      g.fillStyle = '#ffffff';
      g.strokeStyle = '#dc2626';
      g.lineWidth = 1;
      g.fillRect(mx - tw / 2, my - 9, tw, 18);
      g.strokeRect(mx - tw / 2, my - 9, tw, 18);
      g.fillStyle = '#991b1b';
      g.fillText(t, mx, my + 0.5);
    }
  }
  // markers
  const mark = (id, color, text) => {
    const n = net.nodes[id];
    if (!n) return;
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(X(n.x), Y(n.y), 11, 0, Math.PI * 2);
    g.stroke();
    g.font = 'bold 12px Helvetica, Arial, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    const tw = g.measureText(text).width + 10;
    g.fillStyle = color;
    g.fillRect(X(n.x) + 14, Y(n.y) - 10, tw, 20);
    g.fillStyle = '#fff';
    g.fillText(text, X(n.x) + 19, Y(n.y) + 0.5);
  };
  if (o.src != null) mark(o.src, '#0f172a', 'SUPPLY');
  if (o.target != null) mark(o.target, '#dc2626', 'CRITICAL OUTLET');
  g.restore();
  return { s, X, Y, toWorld: (px, py) => ({ x: view.minx + (px - ox) / s, y: view.miny + (h - oy - py) / s }) };
}

/** A4-landscape-ish JPEG of the plan with the route, for the calculation sheet. */
export function routeImage(flat, net, route, src, target) {
  const w = 1500;
  const b = netBounds(net, 900);
  // crop to the route (plus margin) when the network is much larger
  let view = b;
  if (route?.eids?.length) {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const id of route.eids) for (const p of [net.edges[id].a, net.edges[id].b]) {
      minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y);
    }
    const m = Math.max(2500, 0.15 * Math.max(maxx - minx, maxy - miny));
    view = { minx: Math.max(b.minx, minx - m), miny: Math.max(b.miny, miny - m), maxx: Math.min(b.maxx, maxx + m), maxy: Math.min(b.maxy, maxy + m) };
  }
  const h = Math.round(Math.min(1100, Math.max(600, (w * (view.maxy - view.miny)) / (view.maxx - view.minx))));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  drawPlan(c.getContext('2d'), { flat, net, route, src, target, view, w, h, print: true });
  return c.toDataURL('image/jpeg', 0.82);
}
