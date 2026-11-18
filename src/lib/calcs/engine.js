// Shared engine for calculation sheets in the Greenland Excel format:
// 1. Project / design information → 2. Flow calculation → 3. Head loss table → 4. Final head.
import {
  MATERIALS, equivalentLength, hwPsiPer100ft, velocityMs, sizeLabel, fmtN, FT_PER_M, PSI_PER_BAR, M_PER_BAR,
} from '../ipc.js';

let seq = 0;
export const rid = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

export const row = (item, size, qty = 1, length = '', flow = '') => ({ id: rid(), item, size, qty, length, flow, eq: '', idIn: '' });

export const SECTION_CATEGORIES = {
  transfer: 'Transfer Pump Set',
  booster: 'Booster Pump Set',
  'booster-basement': 'Booster Pump Set – Basement',
  circulation: 'Circulation Pump Set',
  sump: 'Sump Pump Set',
};

/** Common inputs for every pump calculator. */
export const commonDefaults = (o) => ({
  tag: 'P-01',
  system: 'PUMP SET',
  category: 'booster',
  specifiedDuty: '',
  duty: 1,
  standby: 1,
  material: 'PPR / uPVC',
  velLimit: 1.5,
  idBasis: 'nominal',
  residual: 0,
  staticHeight: 0,
  fos: 15,
  pumpBrand: '',
  pumpModel: '',
  remarks: 'Pipe header size is considered as per the minimum velocity of 3 FPS.',
  ...o,
});

export const configText = (d, s) => `${d} Duty + ${s} Standby`;
export const configShort = (d, s) => `${d}D+${s}S`;

/** Evaluate the head-loss table rows. */
export function headLoss(rows, material, designFlow, velLimit = 1.5, idBasis = 'nominal') {
  const mat = MATERIALS[material] || MATERIALS['PPR / uPVC'];
  const out = rows.map((r, k) => {
    const size = Number(r.size);
    const q = r.flow === '' || r.flow === null || r.flow === undefined ? designFlow : Number(r.flow) || 0;
    const straight = r.item === 'Straight Pipe';
    const lookup = equivalentLength(r.item, size);
    const eqManual = r.eq !== '' && r.eq !== null && r.eq !== undefined;
    const eqFt = straight ? (Number(r.length) || 0) * FT_PER_M : eqManual ? Number(r.eq) || 0 : lookup.ft;
    const eqSource = straight ? 'Length (m) × 3.28084' : eqManual ? 'Manual / manufacturer' : lookup.source;
    const idIn = r.idIn !== '' && r.idIn !== null && r.idIn !== undefined ? Number(r.idIn) || 0 : idBasis === 'actual' ? mat.id(size) || size : size;
    const v = velocityMs(q, idIn);
    const psi100 = hwPsiPer100ft(q, mat.C, idIn);
    const qty = straight ? 1 : Number(r.qty) || 0;
    const lossPsi = eqFt == null ? 0 : (straight ? eqFt : qty * eqFt) * (psi100 / 100);
    const lossBar = lossPsi / PSI_PER_BAR;
    return { ...r, n: k + 1, q, size, straight, eqFt, eqSource, missingEq: eqFt == null, idIn, C: mat.C, v, vOk: v <= velLimit, psi100, qty, lossBar };
  });
  const totalBar = out.reduce((s, r) => s + r.lossBar, 0);
  return { rows: out, totalBar, mat, idBasis };
}

/** Section 3 – head-loss table in the template's 13-column layout. */
export function headLossSection(hl, velLimit, title = '3. HEAD LOSS CALCULATION – FITTINGS & PIPE FRICTION') {
  const cols = [
    { label: 'No.', w: 0.035, align: 'c' },
    { label: 'Pipes & Fittings', w: 0.15 },
    { label: 'Size (in)', w: 0.055, align: 'c' },
    { label: 'Flow (L/s)', w: 0.065, align: 'c' },
    { label: 'Qty', w: 0.045, align: 'c' },
    { label: 'Length (m)', w: 0.065, align: 'c' },
    { label: 'Eq. Length / Item (ft)', w: 0.085, align: 'c' },
    { label: 'C-Factor', w: 0.06, align: 'c' },
    { label: 'ID (in)', w: 0.06, align: 'c' },
    { label: 'Velocity (m/s)', w: 0.075, align: 'c' },
    { label: 'Vel. Check', w: 0.06, align: 'c' },
    { label: 'Friction Loss (psi/100ft)', w: 0.09, align: 'c' },
    { label: 'Total Loss (bar)', w: 0.075, align: 'c' },
  ];
  const rows = hl.rows.map((r) => ({
    c: [
      String(r.n),
      r.item,
      sizeLabel(r.size),
      fmtN(r.q, 2),
      r.straight ? '–' : String(r.qty),
      r.straight ? fmtN(Number(r.length) || 0, 1) : '–',
      r.missingEq ? 'N/A' : fmtN(r.eqFt, 1),
      String(r.C),
      fmtN(r.idIn, 3),
      fmtN(r.v, 2),
      r.vOk ? 'OK' : 'CHECK',
      fmtN(r.psi100, 2),
      fmtN(r.lossBar, 3),
    ],
    flag: r.vOk ? null : 10,
  }));
  rows.push({ c: ['', 'TOTAL FRICTION LOSS', '', '', '', '', '', '', '', '', '', '', fmtN(hl.totalBar, 3)], bold: true });
  const sources = [...new Set(hl.rows.filter((r) => !r.straight).map((r) => r.eqSource))];
  return {
    type: 'grid',
    title,
    columns: cols,
    rows,
    legend: [
      `Eq. Length / Item: ${sources.length ? sources.join('; ') : 'IPC 2009 Table E103.3(5)'}. Straight pipe = measured length (m) × 3.28084 ft/m.`,
      `C-Factor: Hazen-Williams roughness coefficient – ${hl.mat.cBasis}. ID: ${hl.idBasis === 'actual' ? `actual internal diameter of ${hl.mat.idBasis}` : 'taken equal to the nominal pipe size (in)'}${hl.rows.some((r) => r.idIn !== '' && r.idIn !== undefined && String(r.idIn) !== '') ? '; manual values where entered' : ''}.`,
      `Velocity: V = 4Q / (π·D²). Vel. Check: OK when V ≤ ${fmtN(velLimit, 1)} m/s (recommended max. velocity for noise & erosion control).`,
      'Friction Loss: Hazen-Williams formula (IPC 2009 Appendix E): P = 4.52 × Q^1.852 / (C^1.852 × d^4.87) × 100, Q in US gpm (L/s × 15.8503), d in inches.',
      'Total Loss (bar) = Qty × Eq. Length (ft) × Friction Loss / 100 ÷ 14.5038 (1 bar = 14.5038 psi).',
    ],
  };
}

/** Section 4 – final head calculation rows. extra: [{calc, value(m), ref}] component losses (CHW). */
export function finalHead(i, totalBar, { residualRef, staticRef, extra = [], closedLoop = false } = {}) {
  const frictionM = totalBar * M_PER_BAR;
  const residual = Number(i.residual) || 0;
  const stat = closedLoop ? 0 : Number(i.staticHeight) || 0;
  const extraSum = extra.reduce((s, e) => s + e.value, 0);
  const required = frictionM + residual + stat + extraSum;
  const fos = Number(i.fos) || 0;
  const allowance = required * (fos / 100);
  const proposed = required + allowance;
  const steps = [];
  let n = 1;
  const add = (calc, formula, value, unit, ref, opts = {}) => steps.push({ n: n++, calc, formula, value, unit, ref, ...opts });
  add('Total friction loss', 'Sum of total losses (Section 3)', fmtN(totalBar, 3), 'bar', 'Σ friction losses of all pipes & fittings from the head-loss table');
  add('Total loss in metres head', 'bar × 10.197', fmtN(frictionM, 2), 'm', '1 bar = 10.197 m water column (water density 1000 kg/m³, g = 9.807 m/s²)');
  extra.forEach((e) => add(e.calc, e.formula, fmtN(e.value, 2), 'm', e.ref));
  if (!closedLoop && (residual > 0 || residualRef)) add('End / residual pressure', 'Design input', fmtN(residual, 2), 'm', residualRef || 'Minimum pressure required at the outlet – consultant specification');
  if (closedLoop) add('Static height', 'Closed loop', '0.00', 'm', 'Closed circuit – static head on supply and return cancels out');
  else add('Static height', 'Design input', fmtN(stat, 2), 'm', staticRef || 'Vertical height difference – from architectural / MEP sections');
  const parts = ['Friction', ...extra.map(() => 'components'), !closedLoop && (residual > 0 || residualRef) ? 'residual' : null, 'static'].filter(Boolean);
  add('Total required head', [...new Set(parts)].join(' + '), fmtN(required, 2), 'm', 'Sum of the head components above');
  add('Factor of Safety', 'Design input', fmtN(fos, 0), '%', 'Allowance for pipe ageing, scaling and unaccounted minor losses – design practice');
  add('Safety allowance', `Required head × ${fmtN(fos, 0)}%`, fmtN(allowance, 2), 'm', 'Total required head × factor of safety');
  add('Total proposed head', 'Required head + safety', fmtN(proposed, 2), 'm', `Minimum pump head at the duty point = ${fmtN(proposed / M_PER_BAR, 2)} bar`, { bold: true });
  return { steps, frictionM, required, allowance, proposed };
}

export function selectedPumpLine(i, flowPerPump, proposed) {
  const model = [i.pumpBrand, i.pumpModel].filter(Boolean).join(' ');
  return `Selected Pump${model ? ` (${model})` : ''} is ${fmtN(flowPerPump, 2)} L/s @ ${fmtN(proposed, 1)} m (${fmtN(proposed / M_PER_BAR, 2)} bar) – ${configShort(i.duty, i.standby)}`;
}

/** Section 1 – values starting with "@" are filled from the project header at render time. */
export function infoSection(i, method = 'Equivalent Length Method – Hazen-Williams Formula', extra = []) {
  return {
    type: 'info',
    title: '1. PROJECT / DESIGN INFORMATION',
    rows: [
      ['System', i.system],
      ['Project', '@projectName'],
      ['Client', '@client'],
      ['Consultant', '@consultant'],
      ['Specified Duty', i.specifiedDuty || '–'],
      ['Configuration', configText(i.duty, i.standby)],
      ['Calculation Method', method],
      ...(i.material && method.includes('Hazen') ? [['Pipe Material', i.material]] : []),
      ...extra,
    ],
  };
}

export const STEP_COLUMNS = [
  { label: 'Step', w: 0.045, align: 'c' },
  { label: 'Calculation', w: 0.2 },
  { label: 'Input / Formula', w: 0.19 },
  { label: 'Result', w: 0.1, align: 'c' },
  { label: 'Unit', w: 0.065, align: 'c' },
  { label: 'Reference / Basis', w: 0.4 },
];

export const stepsSection = (title, steps) => ({ type: 'steps', title, columns: STEP_COLUMNS, steps });

export function headLossChecks(hl, velLimit) {
  const checks = [];
  const bad = hl.rows.filter((r) => !r.vOk);
  checks.push(bad.length ? { ok: false, text: `${bad.length} item(s) exceed ${velLimit} m/s – consider a larger pipe size (rows ${bad.map((r) => r.n).join(', ')})` } : { ok: true, text: `All velocities ≤ ${velLimit} m/s` });
  const miss = hl.rows.filter((r) => r.missingEq);
  if (miss.length) checks.push({ ok: false, text: `No table value for ${miss.map((r) => `${r.item} ${sizeLabel(r.size)}`).join(', ')} – enter equivalent length manually` });
  return checks;
}
