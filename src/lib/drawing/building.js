// Building-level calculation from analysed floor plans:
//   fixtures × floors served → total demand;  riser (pump → floor) + floor critical route → head per floor;
//   the floor needing the most head is the critical one.  Output feeds the existing calculators.
import { ipcDemandGpm, LPS_PER_GPM, hwPsiPer100ft, FT_PER_M, PSI_PER_BAR, M_PER_BAR, fmtN } from '../ipc.js';
import { odToNominal, pprId } from './ppr.js';
import { fixtureWsfu } from './network.js';

export const DRAWING_SYSTEMS = {
  booster: { label: 'Domestic water booster (fixture units)', short: 'Booster', calc: 'booster', fixtures: true, from: 'Pump / booster set at', to: 'Serves floors up to', range: true },
  transfer: { label: 'Transfer pump (tank → roof tank)', short: 'Transfer', calc: 'transfer', fixtures: false, from: 'Lower tank / pump at', to: 'Upper (roof) tank at' },
  sump: { label: 'Drainage / sump pump (discharge route)', short: 'Sump', calc: 'sump', fixtures: false, from: 'Sump pit at', to: 'Discharge point at' },
  chw: { label: 'Chilled / hot water circulation (closed loop)', short: 'Circulation', calc: 'chw', fixtures: false, from: 'Pumps at', to: 'Most remote unit at' },
};

export const defaultDrawing = () => ({
  system: 'booster',
  typicalHeight: 4,
  levels: [], // [{ name, elev }]
  pumpLevel: '',
  outletHeight: 1.0,
  staticMode: 'positive', // 'positive' = negative static (down-feed) taken as 0; 'signed'
  supplyType: 'tank',
  pn: 'PN20',
  riserOd: 75,
  riserExtra: 10, // horizontal run / offsets in the riser (m)
  extraRise: 0, // non-booster systems: vertical rise to add (m)
  loopFactor: 2, // closed loop: supply + return
  plans: [], // [{ id, name, fileName, fileId, viewTitle, levels: [], summary }]
  symbols: {}, // learned block → type mapping (added to DEFAULT_SYMBOLS)
  sizeBasis: 'od', // sizes written on drawings: 'od' = PPR outside diameter, 'dn' = nominal bore
  files: [], // [{ id, name, kind: 'riser' | 'plans' | 'ignore', views, levels }]
  servedFrom: '', // booster: lowest floor served ('' = all)
  servedTo: '', // booster: highest floor served / transfer, sump: destination level
  routePlan: '', // transfer / sump / chw: plan view holding the route
  floorFix: {}, // { levelName: { fixtureName: count } } – typed per floor, replaces the drawing count
  tanks: [], // tank / pit notes found on the drawings
  tankVolume: '', // transfer: upper (roof) tank volume m³
  pit: null, // sump: { L, W, D } m
  step: 1,
  review: null, // calculator inputs prepared for review (editable)
});

/** Elevations bottom → top at a typical floor height; lowest level is 0. */
export const levelsWithHeight = (names, h) => names.map((name, i) => ({ name, elev: Number((i * h).toFixed(2)) }));

const frictionBar = (q, od, pn, lengthM, C = 150) => (lengthM * FT_PER_M * hwPsiPer100ft(q, C, pprId(od, pn) / 25.4)) / 100 / PSI_PER_BAR;

/**
 * @param {ReturnType<typeof defaultDrawing>} d
 * @param {{ duty?: number }} calcInputs  current calculator inputs (duty pumps, design flow for non-fixture systems)
 */
const typedOf = (o) => (o && Object.values(o).some((v) => v !== undefined && v !== null && v !== '') ? o : null);

/** Fixtures counted for one floor: typed for that floor › typed for its plan › found on the drawing. */
export function floorFixtures(d, level, plan) {
  return typedOf(d.floorFix?.[level]) || typedOf(plan?.manual) || plan?.summary?.fixtures || {};
}
export const wsfuOf = (fx) => Object.entries(fx || {}).reduce((s, [k, n]) => s + (Number(n) || 0) * fixtureWsfu(k), 0);

/** Levels (bottom → top) between two names, inclusive; empty names = open ends. */
export function levelRange(levels, from, to) {
  const i0 = from ? levels.findIndex((l) => l.name === from) : 0;
  const i1 = to ? levels.findIndex((l) => l.name === to) : levels.length - 1;
  if (i0 < 0 || i1 < 0) return levels;
  return levels.slice(Math.min(i0, i1), Math.max(i0, i1) + 1);
}

/**
 * Whole-building result.
 *  booster: every served floor contributes its fixtures; head checked floor by floor (riser + floor route + static)
 *  transfer / sump / chw: one route from the "from" level to the "to" level
 * @param {ReturnType<typeof defaultDrawing>} d
 */
export function buildingResult(d, { duty = 1, designFlowLps = null } = {}) {
  const sys = DRAWING_SYSTEMS[d.system] || DRAWING_SYSTEMS.booster;
  const levels = d.levels || [];
  const lv = new Map(levels.map((l) => [l.name, l]));
  const pump = lv.get(d.pumpLevel) || levels[0] || { name: '', elev: 0 };
  const planFor = (name) => d.plans.find((p) => (p.levels || []).includes(name)) || null;
  const loop = d.system === 'chw' ? Number(d.loopFactor) || 1 : 1;

  // floors served (booster) – or the destination only (other systems)
  let served;
  if (sys.fixtures) {
    served = levels.length ? levelRange(levels, d.servedFrom, d.servedTo) : [];
    // no levels yet: every plan is "a floor"
    if (!levels.length) served = d.plans.map((p) => ({ name: p.name, elev: 0, plan: p }));
  } else {
    const dest = lv.get(d.servedTo) || levels[levels.length - 1] || { name: 'route', elev: 0 };
    served = [dest];
  }
  const rows = served.map((l) => {
    const plan = l.plan || (sys.fixtures ? planFor(l.name) : d.plans.find((p) => p.id === d.routePlan) || null);
    const fx = sys.fixtures ? floorFixtures(d, l.name, plan) : {};
    return { level: l.name, elev: l.elev || 0, plan, fixtures: fx, wsfu: wsfuOf(fx) };
  });

  const fixtures = {};
  for (const r of rows) for (const [k, n] of Object.entries(r.fixtures)) if (Number(n) > 0) fixtures[k] = (fixtures[k] || 0) + Number(n);
  const totalWsfu = wsfuOf(fixtures);
  const demand = ipcDemandGpm(totalWsfu, d.supplyType);
  const qTotal = sys.fixtures ? demand.gpm * LPS_PER_GPM : Number(designFlowLps) || 0;
  const qPump = qTotal / Math.max(1, Number(duty) || 1);

  const floors = rows.map((r) => {
    const dz = r.elev + (sys.fixtures ? Number(d.outletHeight) || 0 : 0) - pump.elev;
    const stat = (d.staticMode === 'signed' ? dz : Math.max(0, dz)) + (sys.fixtures || d.system === 'chw' ? 0 : Number(d.extraRise) || 0);
    const riserLen = Math.abs(r.elev - pump.elev) + (Number(d.riserExtra) || 0);
    const riserM = frictionBar(qTotal, d.riserOd, d.pn, riserLen) * M_PER_BAR * loop;
    const floorM = (r.plan?.summary?.frictionM || 0) * loop;
    const contributes = !sys.fixtures || r.wsfu > 0;
    return { ...r, dz, stat, riserLen, riserM, floorM, totalM: contributes ? riserM + floorM + (d.system === 'chw' ? 0 : stat) : 0, contributes };
  });
  const crit = floors.filter((f) => f.contributes).sort((a, b) => b.totalM - a.totalM)[0] || null;
  return { fixtures, totalWsfu, demand, qTotal, qPump, floors, crit, pump, served: rows.length };
}

/** Rows for the head-loss table: riser to the critical floor + that floor's route. */
export function calcRowsFor(d, res) {
  const c = res.crit;
  if (!c) return [];
  const rows = [];
  const loop = d.system === 'chw' ? Number(d.loopFactor) || 1 : 1;
  const nom = odToNominal(d.riserOd);
  const idIn = Number((pprId(d.riserOd, d.pn) / 25.4).toFixed(3));
  const rid = () => `r${Math.random().toString(36).slice(2, 9)}`;
  const qRiser = res.qTotal ? Number(res.qTotal.toFixed(2)) : ''; // the riser carries the whole system flow
  rows.push({ id: rid(), item: 'Straight Pipe', size: nom, qty: 1, length: Number((c.riserLen * loop).toFixed(2)), flow: qRiser, eq: '', idIn, note: `Riser ${res.pump.name || 'pump'} → ${c.level}` });
  const passed = d.levels.filter((l) => (l.elev - res.pump.elev) * (c.elev - res.pump.elev) > 0 && Math.abs(l.elev - res.pump.elev) < Math.abs(c.elev - res.pump.elev)).length;
  if (passed) rows.push({ id: rid(), item: 'Tee – Run', size: nom, qty: passed * loop, length: '', flow: qRiser, eq: '', idIn });
  rows.push({ id: rid(), item: '90° Elbow', size: nom, qty: 2 * loop, length: '', flow: qRiser, eq: '', idIn });
  for (const r of c.plan?.summary?.rows || [])
    rows.push({ id: rid(), item: r.item, size: r.size, qty: r.item === 'Straight Pipe' ? 1 : r.qty * loop, length: r.item === 'Straight Pipe' ? Number((r.length * loop).toFixed(2)) : '', flow: r.flow, eq: '', idIn: r.idIn });
  return rows;
}

/** Inputs patch for the target calculator. */
export function calcPatch(d, res) {
  const sys = DRAWING_SYSTEMS[d.system];
  const c = res.crit;
  const patch = {
    rows: calcRowsFor(d, res),
    material: 'PPR / uPVC',
    idBasis: 'actual',
    routeImages: c?.plan?.summary?.image ? [{ src: c.plan.summary.image, caption: `${c.plan.name} – critical route to ${c.plan.summary.targetLabel || 'most remote outlet'} (${fmtN(c.plan.summary.lengthM, 1)} m on plan), riser ${res.pump.name || ''} → ${c.level}` }] : [],
    routeNote: c
      ? `Pipe route measured from drawing ${c.plan?.fileName || c.plan?.name || '(typed values)'}: riser ${fmtN(c.riserLen, 1)} m (${res.pump.name || 'pump level'} → ${c.level}, typical floor height ${fmtN(d.typicalHeight, 1)} m + ${fmtN(Number(d.riserExtra) || 0, 1)} m horizontal) + floor route ${fmtN(c.plan?.summary?.lengthM || 0, 1)} m. Pipe internal diameters: PPR ${d.pn}.`
      : '',
  };
  if (sys.calc !== 'chw') patch.staticHeight = Number(((c?.stat || 0) + (sys.fixtures ? 0 : Number(d.extraRise) || 0)).toFixed(2));
  if (d.system === 'transfer' && Number(d.tankVolume) > 0) patch.tankVolume = Number(d.tankVolume);
  if (d.system === 'sump' && d.pit) Object.assign(patch, { pitL: Number(d.pit.L) || undefined, pitW: Number(d.pit.W) || undefined, pitD: Number(d.pit.D) || undefined });
  if (sys.fixtures) {
    patch.supplyType = d.supplyType;
    patch.demandMode = 'auto';
    patch.fixtures = Object.entries(res.fixtures)
      .filter(([, n]) => n > 0)
      .map(([name, qty]) => ({ id: `f${Math.random().toString(36).slice(2, 9)}`, name, qty, wsfu: fixtureWsfu(name) }));
  }
  return patch;
}
