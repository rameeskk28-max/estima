// The five calculators – Greenland calculation-sheet format with references on every step.
import { fmtN, ipcDemandGpm, LPS_PER_GPM, KW_PER_TR, M_PER_BAR, FIXTURES } from '../ipc.js';
import {
  commonDefaults, row, rid, headLoss, headLossSection, finalHead, infoSection, stepsSection, selectedPumpLine,
  headLossChecks, configShort, SECTION_CATEGORIES,
} from './engine.js';

const perPump = (q, duty) => q / Math.max(1, Number(duty) || 1);
const dutyRows = (i, qTotal, qPump, startN) => [
  { n: startN, calc: 'No. of duty pumps', formula: 'Configuration', value: String(Math.max(1, Number(i.duty) || 1)), unit: 'No.', ref: `${configShort(i.duty, i.standby)} – standby pump not counted in capacity` },
  { n: startN + 1, calc: 'Design flow per duty pump', formula: 'Flow ÷ duty pumps', value: fmtN(qPump, 2), unit: 'L/s', ref: 'Each duty pump shares the total design flow equally', bold: true },
];

function buildSheet({ title, calcType, i, flowSection, flowExtra = [], hl, fh, qPump, method, infoExtra }) {
  const sections = [infoSection(i, method, infoExtra), ...flowExtra, flowSection];
  if (hl) sections.push(headLossSection(hl, i.velLimit));
  sections.push(stepsSection('4. FINAL HEAD CALCULATION', fh.steps));
  sections.push({ type: 'result', text: selectedPumpLine(i, qPump, fh.proposed) });
  if (i.remarks) sections.push({ type: 'note', text: i.remarks });
  return { docTitle: `HYDRAULIC CALCULATION – ${String(i.system).toUpperCase()}`, calcType, tag: i.tag, service: i.system, sections };
}

function duty(i, calcType, qPump, qTotal, proposed, remarks) {
  return {
    tag: i.tag,
    service: i.system,
    category: i.category,
    kind: 'pump',
    calcType,
    flowLps: qPump,
    totalFlowLps: qTotal,
    headM: proposed,
    motorKW: null,
    arrangement: configShort(i.duty, i.standby),
    specifiedDuty: i.specifiedDuty,
    brand: i.pumpBrand,
    model: i.pumpModel,
    remarks,
  };
}

const kpis = (qPump, qTotal, hl, fh) => [
  { label: 'Flow per Pump', value: fmtN(qPump, 2), unit: 'L/s', sub: `${fmtN(qPump * 3.6, 2)} m³/hr · total ${fmtN(qTotal, 2)} L/s` },
  { label: 'Total Friction Loss', value: fmtN(hl ? hl.totalBar : 0, 3), unit: 'bar', sub: `${fmtN(fh.frictionM, 2)} m head` },
  { label: 'Required Head', value: fmtN(fh.required, 2), unit: 'm', sub: `+ ${fmtN(fh.allowance, 2)} m safety` },
  { label: 'Proposed Head', value: fmtN(fh.proposed, 1), unit: 'm', sub: `${fmtN(fh.proposed / M_PER_BAR, 2)} bar`, tone: 'ok' },
];

/* ================================================================== */
/* TRANSFER PUMP SET                                                   */
/* ================================================================== */
export const transferDefaults = () =>
  commonDefaults({
    tag: 'TPS-01',
    system: 'TRANSFER PUMP SET',
    category: 'transfer',
    specifiedDuty: '6.2 LPS @ 4 BAR',
    tankVolume: 22,
    effFactor: 80,
    fillTime: 0.8,
    staticHeight: 30,
    residual: 0,
    rows: [row('Gate Valve', 2.5, 4), row('Check Valve, Swing', 2.5, 2), row('Straight Pipe', 3, 1, 40), row('90° Elbow', 2.5, 9)],
  });

export function computeTransfer(i) {
  const V = Number(i.tankVolume) || 0;
  const f = (Number(i.effFactor) || 0) / 100;
  const EV = V * f;
  const T = Math.max(Number(i.fillTime) || 0, 0.001);
  const F = EV / T;
  const qTotal = F / 3.6;
  const qPump = perPump(qTotal, i.duty);
  const hl = headLoss(i.rows, i.material, qPump, i.velLimit, i.idBasis);
  const fh = finalHead(i, hl.totalBar, {
    residualRef: 'Pressure required at the float valve / tank inlet – consultant specification',
    staticRef: 'Height from lower tank low water level to overhead tank inlet – from architectural sections',
  });
  const flowSection = stepsSection('2. TRANSFER PUMP FLOW CALCULATION', [
    { n: 1, calc: 'Total volume of overhead tank', formula: 'V', value: fmtN(V, 2), unit: 'm³', ref: 'Overhead (roof) tank capacity – from architectural / tank drawings' },
    { n: 2, calc: 'Effective volume', formula: 'V × effective volume factor', value: fmtN(EV, 2), unit: 'm³', ref: 'Usable volume to be refilled by the transfer pumps' },
    { n: 3, calc: 'Effective volume factor', formula: 'Input', value: fmtN(Number(i.effFactor) || 0, 0), unit: '%', ref: 'Volume between pump start level and overflow (dead volume & freeboard excluded) – design practice' },
    { n: 4, calc: 'Time required for filling', formula: 'T', value: fmtN(T, 2), unit: 'hr', ref: 'Required filling time – consultant specification' },
    { n: 5, calc: 'Flow rate', formula: 'Effective volume ÷ time', value: fmtN(F, 2), unit: 'm³/hr', ref: 'Volumetric flow Q = V / t' },
    { n: 6, calc: 'Convert flow to L/s', formula: 'm³/hr ÷ 3.6', value: fmtN(qTotal, 2), unit: 'L/s', ref: '1 m³/hr = 1000 L ÷ 3600 s = 1/3.6 L/s' },
    ...dutyRows(i, qTotal, qPump, 7),
  ]);
  const sheet = buildSheet({ i, calcType: 'Transfer Pump Set', flowSection, hl, fh, qPump });
  return {
    duty: duty(i, 'Transfer Pump Set', qPump, qTotal, fh.proposed, `Tank ${fmtN(V, 1)} m³ filled in ${fmtN(T, 2)} hr`),
    kpis: kpis(qPump, qTotal, hl, fh),
    checks: headLossChecks(hl, i.velLimit),
    hl,
    fh,
    anim: { flow: qPump, head: fh.proposed, fill: T },
    sheet,
  };
}

/* ================================================================== */
/* BOOSTER PUMP SET – fixture unit method                              */
/* ================================================================== */
const fx = (name, qty, wsfu) => ({ id: rid(), name, qty, wsfu: wsfu ?? FIXTURES.find((f) => f.name === name)?.wsfu ?? 1 });

export const boosterDefaults = () =>
  commonDefaults({
    tag: 'BPS-01',
    system: 'MAIN BOOSTER PUMP SET',
    category: 'booster',
    specifiedDuty: '5.5 LPS @ 2.5 BAR',
    duty: 2,
    standby: 1,
    supplyType: 'tank',
    demandMode: 'auto',
    manualGpm: 160,
    fixtures: [
      fx('Water Closet – Private / Flush Tank', 64),
      fx('Shower', 64),
      fx('Wash Basin / Lavatory', 64),
      fx('Ablution Spray / Hand Spray', 64, 0.5),
      fx('Kitchen Sink', 32),
      fx('Washing Machine', 32),
      fx('Dishwasher', 32, 2),
    ],
    residual: 10.3,
    staticHeight: 0,
    rows: [row('Gate Valve', 3, 6, '', 5.5), row('Check Valve, Swing', 3, 3, '', 5.5), row('Straight Pipe', 3, 1, 55, 5.5), row('90° Elbow', 3, 4, '', 5.5), row('Straight Pipe', 1.5, 1, 55, 3.15), row('90° Elbow', 1.5, 5, '', 3.15), row('Straight Pipe', 1, 1, 20, 0.88), row('90° Elbow', 1, 3, '', 0.88)],
  });

export function computeBooster(i) {
  const list = i.fixtures.map((f, k) => ({ ...f, n: k + 1, total: (Number(f.qty) || 0) * (Number(f.wsfu) || 0) }));
  const wsfu = list.reduce((s, f) => s + f.total, 0);
  const d = ipcDemandGpm(wsfu, i.supplyType);
  const gpm = i.demandMode === 'manual' ? Number(i.manualGpm) || 0 : d.gpm;
  const qTotal = gpm * LPS_PER_GPM;
  const qPump = perPump(qTotal, i.duty);
  const hl = headLoss(i.rows, i.material, qPump, i.velLimit, i.idBasis);
  const fh = finalHead(i, hl.totalBar, {
    residualRef: 'Minimum residual pressure at the most remote / critical fixture – consultant specification',
    staticRef: 'Height from pump centre-line to the highest fixture – from architectural sections',
  });
  const fixtureSection = {
    type: 'grid',
    title: '2. DOMESTIC WATER DEMAND – FIXTURE UNIT METHOD',
    columns: [
      { label: 'No.', w: 0.06, align: 'c' },
      { label: 'Fixture / Appliance', w: 0.4 },
      { label: 'Qty', w: 0.1, align: 'c' },
      { label: 'WSFU / Fixture', w: 0.13, align: 'c' },
      { label: 'Total WSFU', w: 0.13, align: 'c' },
      { label: 'Source', w: 0.18 },
    ],
    rows: [
      ...list.map((f) => ({ c: [String(f.n), f.name, fmtN(Number(f.qty) || 0, 0), fmtN(Number(f.wsfu) || 0, 1), fmtN(f.total, 1), 'IPC 2009 Appendix E'] })),
      { c: ['', 'TOTAL', '', '', fmtN(wsfu, 1), 'Total WSFU'], bold: true },
    ],
    legend: ['WSFU = water supply fixture unit – load value assigned to each fixture type (IPC 2009 Appendix E). Total WSFU = Qty × WSFU per fixture.'],
  };
  const lo = d.lo && d.hi && d.lo !== d.hi ? `${d.lo[0]} WSFU = ${d.lo[1]} gpm; ${d.hi[0]} WSFU = ${d.hi[1]} gpm` : '';
  const flowSection = stepsSection('2.1 DESIGN FLOW CALCULATION', [
    { n: 1, calc: 'Total fixture units', formula: 'Sum of WSFU', value: fmtN(wsfu, 1), unit: 'WSFU', ref: 'Total of the fixture unit table above' },
    {
      n: 2,
      calc: 'IPC demand (probable peak flow)',
      formula: i.demandMode === 'manual' ? 'Manual input' : `Interpolation – ${i.supplyType === 'valve' ? 'flush valves' : 'flush tanks'}`,
      value: fmtN(gpm, 1),
      unit: 'GPM',
      ref: i.demandMode === 'manual' ? 'Design demand from reviewed source calculation / consultant' : `IPC 2009 Table E103.3(3) – demand for system predominantly ${i.supplyType === 'valve' ? 'flush valves' : 'flush tanks'}${lo ? ` (${lo})` : ''}`,
    },
    { n: 3, calc: 'Convert GPM to L/s', formula: 'GPM × 0.06309', value: fmtN(qTotal, 2), unit: 'L/s', ref: '1 US gpm = 0.06309 L/s' },
    ...dutyRows(i, qTotal, qPump, 4),
  ]);
  const sheet = buildSheet({ i, calcType: 'Booster Pump Set', flowExtra: [fixtureSection], flowSection, hl, fh, qPump, method: 'Fixture Unit Method (IPC) + Equivalent Length Method – Hazen-Williams' });
  return {
    duty: duty(i, 'Booster Pump Set', qPump, qTotal, fh.proposed, `${fmtN(wsfu, 0)} WSFU → ${fmtN(gpm, 0)} GPM`),
    kpis: kpis(qPump, qTotal, hl, fh),
    checks: [{ ok: true, text: `${fmtN(wsfu, 1)} WSFU → ${fmtN(gpm, 1)} GPM (${fmtN(qTotal, 2)} L/s) – IPC Table E103.3(3)` }, ...headLossChecks(hl, i.velLimit)],
    hl,
    fh,
    wsfu,
    gpm,
    anim: { flow: qPump, head: fh.proposed, pumps: Number(i.duty) || 1, standby: Number(i.standby) || 0 },
    sheet,
  };
}

/* ================================================================== */
/* SUMP / SEWAGE PUMP SET                                              */
/* ================================================================== */
export const sumpDefaults = () =>
  commonDefaults({
    tag: 'SPS-01',
    system: 'SUMP / SEWAGE PUMP SET',
    category: 'sump',
    specifiedDuty: '6.4 LPS @ 10 M',
    material: 'PE',
    pitL: 1.5,
    pitW: 1.5,
    pitD: 0.8,
    effFactor: 60,
    emptyTime: 0.05,
    staticHeight: 5,
    residual: 0,
    fos: 15,
    remarks: 'Pipe header size is considered as per the minimum velocity of 3 FPS. Total flow for the pump set is considered for the worst-case scenario.',
    rows: [row('Gate Valve', 3, 1), row('Check Valve, Swing', 3, 1), row('Straight Pipe', 3, 1, 35), row('45° Elbow', 3, 2), row('90° Elbow', 3, 9)],
  });

export function computeSump(i) {
  const L = Number(i.pitL) || 0;
  const W = Number(i.pitW) || 0;
  const D = Number(i.pitD) || 0;
  const V = L * W * D;
  const EV = V * ((Number(i.effFactor) || 0) / 100);
  const T = Math.max(Number(i.emptyTime) || 0, 0.001);
  const F = EV / T;
  const qTotal = F / 3.6;
  const qPump = perPump(qTotal, i.duty);
  const hl = headLoss(i.rows, i.material, qPump, i.velLimit, i.idBasis);
  const fh = finalHead(i, hl.totalBar, { staticRef: 'Height from pump stop level in the pit to the discharge manhole / high point – from MEP sections' });
  const flowSection = stepsSection('2. SUBMERSIBLE PUMP FLOW CALCULATION', [
    { n: 1, calc: 'Total volume of sump pit', formula: `L × W × D = ${fmtN(L, 2)} × ${fmtN(W, 2)} × ${fmtN(D, 2)}`, value: fmtN(V, 2), unit: 'm³', ref: 'Internal pit dimensions – from structural / MEP drawings' },
    { n: 2, calc: 'Effective volume', formula: 'V × effective volume factor', value: fmtN(EV, 2), unit: 'm³', ref: 'Working volume between pump start and stop levels' },
    { n: 3, calc: 'Effective volume factor', formula: 'Input', value: fmtN(Number(i.effFactor) || 0, 0), unit: '%', ref: 'Portion of pit volume used for pumping (submergence & freeboard excluded) – design practice' },
    { n: 4, calc: 'Time required for emptying', formula: 'T', value: fmtN(T, 3), unit: 'hr', ref: `Design emptying time (${fmtN(T * 60, 1)} min) – consultant specification` },
    { n: 5, calc: 'Flow rate', formula: 'Effective volume ÷ time', value: fmtN(F, 2), unit: 'm³/hr', ref: 'Volumetric flow Q = V / t' },
    { n: 6, calc: 'Convert flow to L/s', formula: 'm³/hr ÷ 3.6', value: fmtN(qTotal, 2), unit: 'L/s', ref: '1 m³/hr = 1000 L ÷ 3600 s = 1/3.6 L/s' },
    ...dutyRows(i, qTotal, qPump, 7),
  ]);
  const sheet = buildSheet({ i, calcType: 'Sump Pump Set', flowSection, hl, fh, qPump });
  return {
    duty: duty(i, 'Sump Pump Set', qPump, qTotal, fh.proposed, `Pit ${fmtN(L, 1)}×${fmtN(W, 1)}×${fmtN(D, 1)} m`),
    kpis: kpis(qPump, qTotal, hl, fh),
    checks: headLossChecks(hl, i.velLimit),
    hl,
    fh,
    anim: { flow: qPump, head: fh.proposed },
    sheet,
  };
}

/* ================================================================== */
/* CHILLED WATER (CIRCULATION) PUMP SET                                */
/* ================================================================== */
export const chwDefaults = () =>
  commonDefaults({
    tag: 'CHWP-01',
    system: 'CHILLED WATER PUMP SET',
    category: 'circulation',
    specifiedDuty: '',
    duty: 2,
    standby: 1,
    material: 'Black Steel',
    velLimit: 2.4,
    loadUnit: 'TR',
    load: 150,
    deltaT: 5.5,
    chillerKpa: 60,
    coilKpa: 40,
    valveKpa: 30,
    otherKpa: 20,
    remarks: '',
    rows: [row('Straight Pipe', 4, 1, 180), row('90° Elbow', 4, 16), row('Tee – Run', 4, 10), row('Tee – Branch', 4, 2), row('Butterfly Valve', 4, 6), row('Check Valve, Swing', 4, 1), row('Y-Strainer', 4, 1)],
  });

export function computeChw(i) {
  const loadKW = i.loadUnit === 'TR' ? (Number(i.load) || 0) * KW_PER_TR : Number(i.load) || 0;
  const dT = Math.max(Number(i.deltaT) || 0, 0.1);
  const qTotal = loadKW / (4.186 * dT);
  const qPump = perPump(qTotal, i.duty);
  const hl = headLoss(i.rows, i.material, qTotal, i.velLimit, i.idBasis);
  const k2m = (k) => (Number(k) || 0) / 9.80665;
  const extra = [
    { calc: 'Chiller evaporator pressure drop', formula: `${fmtN(Number(i.chillerKpa) || 0, 1)} kPa ÷ 9.807`, value: k2m(i.chillerKpa), ref: 'Chiller manufacturer selection data' },
    { calc: 'AHU / FCU coil pressure drop', formula: `${fmtN(Number(i.coilKpa) || 0, 1)} kPa ÷ 9.807`, value: k2m(i.coilKpa), ref: 'Index (most remote) coil – AHU/FCU manufacturer data' },
    { calc: 'Control valve pressure drop', formula: `${fmtN(Number(i.valveKpa) || 0, 1)} kPa ÷ 9.807`, value: k2m(i.valveKpa), ref: '2-way / PICV valve – valve manufacturer data' },
    { calc: 'Other components', formula: `${fmtN(Number(i.otherKpa) || 0, 1)} kPa ÷ 9.807`, value: k2m(i.otherKpa), ref: 'Balancing valve, strainer, heat exchanger – manufacturer data' },
  ].filter((e) => e.value > 0);
  const fh = finalHead(i, hl.totalBar, { extra, closedLoop: true });
  const steps = [];
  let n = 1;
  if (i.loadUnit === 'TR') {
    steps.push({ n: n++, calc: 'Design cooling load', formula: 'Input', value: fmtN(Number(i.load) || 0, 1), unit: 'TR', ref: 'Cooling load – HVAC load calculation' });
    steps.push({ n: n++, calc: 'Convert to kW', formula: 'TR × 3.517', value: fmtN(loadKW, 1), unit: 'kW', ref: '1 ton of refrigeration = 3.517 kW' });
  } else steps.push({ n: n++, calc: 'Design cooling load', formula: 'Input', value: fmtN(loadKW, 1), unit: 'kW', ref: 'Cooling load – HVAC load calculation' });
  steps.push({ n: n++, calc: 'Chilled water ΔT', formula: 'Return − supply', value: fmtN(dT, 1), unit: '°C', ref: 'Design temperature difference – chiller / consultant specification' });
  steps.push({ n: n++, calc: 'Chilled water flow', formula: 'kW ÷ (4.186 × ΔT)', value: fmtN(qTotal, 2), unit: 'L/s', ref: 'Q = P / (cp × ΔT); cp of water = 4.186 kJ/kg·K, 1 kg ≈ 1 L' });
  steps.push(...dutyRows(i, qTotal, qPump, n));
  const flowSection = stepsSection('2. CHILLED WATER FLOW CALCULATION', steps);
  const sheet = buildSheet({ i, calcType: 'Chilled Water Pump Set', flowSection, hl, fh, qPump });
  return {
    duty: duty(i, 'Chilled Water Pump Set', qPump, qTotal, fh.proposed, `${fmtN(loadKW, 0)} kW @ ΔT ${fmtN(dT, 1)} °C`),
    kpis: kpis(qPump, qTotal, hl, fh),
    checks: headLossChecks(hl, i.velLimit),
    hl,
    fh,
    anim: { flow: qPump, head: fh.proposed },
    sheet,
  };
}

/* ================================================================== */
/* PRESSURE VESSEL                                                     */
/* ================================================================== */
export const STANDARD_VESSELS = [24, 60, 100, 200, 300, 500];

export const vesselDefaults = () => ({
  tag: 'PV-01',
  system: 'DIAPHRAGM PRESSURE VESSEL',
  category: 'booster',
  specifiedDuty: '',
  pmin: 3,
  pmax: 4.5,
  mode: 'pump',
  va: 40,
  pumpFlow: 2.5,
  starts: 30,
  vessels: 1,
});

export function computeVessel(i) {
  const pmin = Number(i.pmin) || 0;
  const pmax = Number(i.pmax) || 0;
  const qp = Number(i.pumpFlow) || 0;
  const N = Math.max(Number(i.starts) || 1, 1);
  const Tmin = 3600 / N;
  const Va = i.mode === 'pump' ? (qp * Tmin) / 4 : Number(i.va) || 0;
  const valid = pmax > pmin && pmin > 0.2;
  const Vt = valid ? (Va * (pmax + 1)) / (pmax - pmin) : NaN;
  let n = Math.max(1, Math.round(Number(i.vessels) || 1));
  const largest = STANDARD_VESSELS[STANDARD_VESSELS.length - 1];
  if (valid && Vt / n > largest) n = Math.ceil(Vt / largest);
  const per = valid ? Vt / n : NaN;
  const size = valid ? STANDARD_VESSELS.find((s) => s >= per) ?? largest : null;
  const ppre = pmin - 0.2;
  const steps = [];
  let k = 1;
  steps.push({ n: k++, calc: 'Pump cut-in pressure', formula: 'Pmin', value: fmtN(pmin, 2), unit: 'bar g', ref: 'Booster set start pressure – from booster head calculation / consultant' });
  steps.push({ n: k++, calc: 'Pump cut-out pressure', formula: 'Pmax', value: fmtN(pmax, 2), unit: 'bar g', ref: 'Booster set stop pressure – controller setting' });
  if (i.mode === 'pump') {
    steps.push({ n: k++, calc: 'Largest pump flow', formula: 'Qp', value: fmtN(qp, 2), unit: 'L/s', ref: 'Flow of one duty pump – booster calculation' });
    steps.push({ n: k++, calc: 'Max. starts per hour', formula: 'N', value: fmtN(N, 0), unit: 'starts/hr', ref: 'Pump / motor manufacturer limit' });
    steps.push({ n: k++, calc: 'Minimum cycle time', formula: '3600 ÷ N', value: fmtN(Tmin, 0), unit: 's', ref: 'One start-stop cycle per allowed start' });
    steps.push({ n: k++, calc: 'Drawdown volume', formula: 'Qp × Tmin ÷ 4', value: fmtN(Va, 1), unit: 'L', ref: 'Worst-case cycling occurs when demand = ½ pump flow (vessel sizing practice)' });
  } else steps.push({ n: k++, calc: 'Drawdown volume', formula: 'Input', value: fmtN(Va, 1), unit: 'L', ref: 'Required acceptance volume – design input' });
  steps.push({ n: k++, calc: 'Total vessel volume', formula: 'Va × (Pmax + 1) ÷ (Pmax − Pmin)', value: fmtN(Vt, 1), unit: 'L', ref: "Boyle's law P1·V1 = P2·V2 with absolute pressures (gauge + 1 bar)", bold: true });
  steps.push({ n: k++, calc: 'Number of vessels', formula: 'Input', value: String(n), unit: 'No.', ref: 'Vessels installed in parallel' });
  steps.push({ n: k++, calc: 'Volume per vessel', formula: 'Vt ÷ n', value: fmtN(per, 1), unit: 'L', ref: `Next standard size: ${STANDARD_VESSELS.join(' / ')} L` });
  steps.push({ n: k++, calc: 'Selected vessel', formula: 'Standard size ≥ volume per vessel', value: valid ? `${n} × ${size}` : '–', unit: 'L', ref: 'Manufacturer standard range', bold: true });
  steps.push({ n: k++, calc: 'Pre-charge pressure', formula: 'Pmin − 0.2', value: fmtN(ppre, 2), unit: 'bar g', ref: 'Air pre-charge 0.2 bar below cut-in – vessel manufacturer recommendation', bold: true });
  const sheet = {
    docTitle: 'PRESSURE VESSEL (DIAPHRAGM TANK) SIZING CALCULATION',
    calcType: 'Pressure Vessel',
    tag: i.tag,
    service: i.system,
    sections: [
      {
        type: 'info',
        title: '1. PROJECT / DESIGN INFORMATION',
        rows: [
          ['System', i.system],
          ['Project', '@projectName'],
          ['Client', '@client'],
          ['Consultant', '@consultant'],
          ['Specified Duty', i.specifiedDuty || '–'],
          ['Calculation Method', "Boyle's Law – Diaphragm Vessel Sizing"],
        ],
      },
      stepsSection('2. VESSEL SIZING CALCULATION', steps),
      { type: 'result', text: valid ? `Selected: ${n} × ${size} L diaphragm vessel${n > 1 ? 's' : ''}, pre-charged to ${fmtN(ppre, 1)} bar` : 'Check inputs – cut-out pressure must exceed cut-in pressure' },
    ],
  };
  return {
    duty: { tag: i.tag, service: i.system, category: i.category, kind: 'vessel', calcType: 'Pressure Vessel', flowLps: null, headM: null, motorKW: null, arrangement: valid ? `${n} × ${size} L` : '–', remarks: valid ? `Vt ${fmtN(Vt, 0)} L, pre-charge ${fmtN(ppre, 1)} bar` : '' },
    kpis: [
      { label: 'Drawdown Volume', value: fmtN(Va, 1), unit: 'L', sub: i.mode === 'pump' ? `Tmin ${fmtN(Tmin, 0)} s` : 'Direct entry' },
      { label: 'Total Vessel Volume', value: fmtN(Vt, 1), unit: 'L', sub: `${fmtN(pmin, 1)} / ${fmtN(pmax, 1)} bar` },
      { label: 'Pre-charge', value: fmtN(ppre, 2), unit: 'bar', sub: 'Pmin − 0.2 bar' },
      { label: 'Selected', value: valid ? `${n} × ${size}` : '–', unit: 'L', sub: valid ? `Installed ${n * size} L` : 'Check inputs', tone: valid ? 'ok' : 'bad' },
    ],
    checks: valid ? [{ ok: true, text: `Installed ${n * size} L ≥ required ${fmtN(Vt, 1)} L` }] : [{ ok: false, text: 'Cut-out pressure must exceed cut-in pressure (and cut-in > 0.2 bar).' }],
    selection: { n, size, Vt },
    anim: { pmin, pmax },
    sheet,
  };
}

export const CALCULATORS = {
  booster: { key: 'booster', label: 'Booster Pump Set', defaults: boosterDefaults, compute: computeBooster },
  transfer: { key: 'transfer', label: 'Transfer Pump Set', defaults: transferDefaults, compute: computeTransfer },
  sump: { key: 'sump', label: 'Sump / Sewage Pump Set', defaults: sumpDefaults, compute: computeSump },
  vessel: { key: 'vessel', label: 'Pressure Vessel', defaults: vesselDefaults, compute: computeVessel },
  chw: { key: 'chw', label: 'Chilled Water Pump Set', defaults: chwDefaults, compute: computeChw },
};
export { SECTION_CATEGORIES };
