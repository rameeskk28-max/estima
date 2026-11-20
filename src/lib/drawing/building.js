// Building-level calculation from analysed floor plans:
//   fixtures × floors served → total demand;  riser (pump → floor) + floor critical route → head per floor;
//   the floor needing the most head is the critical one.  Output feeds the existing calculators.
import { ipcDemandGpm, LPS_PER_GPM, hwPsiPer100ft, FT_PER_M, PSI_PER_BAR, M_PER_BAR, fmtN } from '../ipc.js';
import { odToNominal, pprId } from './ppr.js';
import { fixtureWsfu } from './network.js';

export const DRAWING_SYSTEMS = {
  booster: { label: 'Domestic water booster (fixture units)', calc: 'booster', fixtures: true },
  transfer: { label: 'Transfer pump (tank → roof tank)', calc: 'transfer', fixtures: false },
  sump: { label: 'Drainage / sump pump (discharge route)', calc: 'sump', fixtures: false },
  chw: { label: 'Chilled / hot water circulation (closed loop)', calc: 'chw', fixtures: false },
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
  plans: [], // [{ id, name, fileName, levels: [], summary }]
});

/** Elevations bottom → top at a typical floor height; lowest level is 0. */
export const levelsWithHeight = (names, h) => names.map((name, i) => ({ name, elev: Number((i * h).toFixed(2)) }));

const frictionBar = (q, od, pn, lengthM, C = 150) => (lengthM * FT_PER_M * hwPsiPer100ft(q, C, pprId(od, pn) / 25.4)) / 100 / PSI_PER_BAR;

/**
 * @param {ReturnType<typeof defaultDrawing>} d
 * @param {{ duty?: number }} calcInputs  current calculator inputs (duty pumps, design flow for non-fixture systems)
 */
export function buildingResult(d, { duty = 1, designFlowLps = null } = {}) {
  const lv = new Map(d.levels.map((l) => [l.name, l]));
  const pump = lv.get(d.pumpLevel) || d.levels[0] || { name: '', elev: 0 };
  // fixtures across all floors
  const fixtures = {};
  for (const p of d.plans) {
    const floors = Math.max(1, p.levels?.length || p.floors || 1);
    const typed = p.manual && Object.values(p.manual).some((v) => v !== undefined && v !== null && v !== '') ? p.manual : null;
    for (const [kind, n] of Object.entries(typed || p.summary?.fixtures || {})) if (Number(n) > 0) fixtures[kind] = (fixtures[kind] || 0) + Number(n) * floors;
  }
  const totalWsfu = Object.entries(fixtures).reduce((s, [k, n]) => s + n * fixtureWsfu(k), 0);
  const demand = ipcDemandGpm(totalWsfu, d.supplyType);
  const qTotal = DRAWING_SYSTEMS[d.system]?.fixtures ? demand.gpm * LPS_PER_GPM : Number(designFlowLps) || 0;
  const qPump = qTotal / Math.max(1, Number(duty) || 1);

  // head per served floor
  const floors = [];
  for (const p of d.plans) {
    const sum = p.summary;
    if (!sum) continue;
    const names = p.levels?.length ? p.levels : [p.name];
    for (const name of names) {
      const l = lv.get(name) || { name, elev: 0 };
      const dz = l.elev + (Number(d.outletHeight) || 0) - pump.elev;
      const stat = d.staticMode === 'signed' ? dz : Math.max(0, dz);
      const riserLen = Math.abs(l.elev - pump.elev) + (Number(d.riserExtra) || 0);
      const riserBar = frictionBar(qTotal, d.riserOd, d.pn, riserLen);
      const floorBar = (sum.frictionM || 0) / M_PER_BAR;
      const loop = d.system === 'chw' ? Number(d.loopFactor) || 1 : 1;
      floors.push({
        plan: p,
        level: l.name,
        elev: l.elev,
        dz,
        stat,
        riserLen,
        riserM: riserBar * M_PER_BAR * loop,
        floorM: floorBar * M_PER_BAR * loop,
        totalM: (riserBar + floorBar) * M_PER_BAR * loop + stat,
      });
    }
  }
  floors.sort((a, b) => b.totalM - a.totalM);
  const crit = floors[0] || null;
  return { fixtures, totalWsfu, demand, qTotal, qPump, floors, crit, pump };
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
  for (const r of c.plan.summary.rows || [])
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
    routeImages: c?.plan.summary.image ? [{ src: c.plan.summary.image, caption: `${c.plan.name} – critical route to ${c.plan.summary.targetLabel || 'most remote outlet'} (${fmtN(c.plan.summary.lengthM, 1)} m on plan), riser ${res.pump.name || ''} → ${c.level}` }] : [],
    routeNote: c
      ? `Pipe route measured from drawing ${c.plan.fileName || c.plan.name}: riser ${fmtN(c.riserLen, 1)} m (${res.pump.name || 'pump level'} → ${c.level}, typical floor height ${fmtN(d.typicalHeight, 1)} m + ${fmtN(Number(d.riserExtra) || 0, 1)} m horizontal) + floor route ${fmtN(c.plan.summary.lengthM, 1)} m. Pipe internal diameters: PPR ${d.pn}.`
      : '',
  };
  if (sys.calc !== 'chw') patch.staticHeight = Number(((c?.stat || 0) + (sys.fixtures ? 0 : Number(d.extraRise) || 0)).toFixed(2));
  if (sys.fixtures) {
    patch.supplyType = d.supplyType;
    patch.demandMode = 'auto';
    patch.fixtures = Object.entries(res.fixtures)
      .filter(([, n]) => n > 0)
      .map(([name, qty]) => ({ id: `f${Math.random().toString(36).slice(2, 9)}`, name, qty, wsfu: fixtureWsfu(name) }));
  }
  return patch;
}
