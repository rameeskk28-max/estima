import { evaluatePipe, fmt, lpsToM3h, motorSizing, mToBar, mToKPa, toLps, toMeters, arrangementText } from '../hydraulics.js';
import { pipeDefaults, pipeSteps, pipeInputRows, fittingTable, motorSteps, velocityCheck, flowText, headText, STANDARD_NOTES } from './common.js';

export const boosterDefaults = () => ({
  tag: 'BPS-01',
  service: 'Domestic Cold Water Booster Pump Set',
  category: 'booster',
  duty: 2,
  standby: 1,
  flow: { value: 6, unit: 'L/s' },
  staticLift: 42,
  suctionHead: 1.5,
  residual: { value: 1.5, unit: 'bar' },
  equipmentLoss: { value: 2, unit: 'm' },
  pipe: pipeDefaults({ material: 'PPR', dn: 100, length: 120, fittings: { gate: 4, nrv: 1, elbow90: 14, teeRun: 8, teeBranch: 1, strainer: 1, flexConn: 2 } }),
  safetyPct: 10,
  pumpEff: 65,
  motorMargin: 15,
});

export function computeBooster(i) {
  const qTotal = toLps(i.flow.value, i.flow.unit);
  const duty = Math.max(1, Number(i.duty) || 1);
  const qPump = qTotal / duty;
  const hStatic = Number(i.staticLift) || 0;
  const hSuction = Number(i.suctionHead) || 0;
  const hResidual = toMeters(i.residual.value, i.residual.unit);
  const hEquip = toMeters(i.equipmentLoss.value, i.equipmentLoss.unit);
  const pipe = evaluatePipe({ qLps: qTotal, ...i.pipe });

  const subtotal = hStatic + hResidual + pipe.hf + pipe.hm + hEquip - hSuction;
  const safety = subtotal * ((Number(i.safetyPct) || 0) / 100);
  const tdh = subtotal + safety;
  const m = motorSizing(qPump, tdh, i.pumpEff, i.motorMargin);
  const arr = arrangementText(duty, Number(i.standby) || 0);

  const checks = [velocityCheck('Discharge header', pipe.v, { min: 0.6, max: 2.5 })];
  if (hSuction < 0) checks.push({ ok: false, text: 'Negative suction head (suction lift) – verify NPSH; booster sets should operate with flooded suction.' });

  const breakdown = [
    { label: 'Static lift', m: hStatic },
    { label: 'Residual pressure', m: hResidual },
    { label: 'Pipe friction', m: pipe.hf },
    { label: 'Fittings / valves', m: pipe.hm },
    { label: 'Equipment losses', m: hEquip },
    { label: 'Suction head credit', m: -hSuction },
    { label: `Safety margin ${i.safetyPct}%`, m: safety },
  ];

  const sheet = {
    docTitle: 'BOOSTER PUMP SET – HYDRAULIC CALCULATION',
    calcType: 'Booster Pump Set',
    tag: i.tag,
    service: i.service,
    sections: [
      {
        type: 'table',
        title: '1. DESIGN INPUT PARAMETERS',
        columns: ['Parameter', 'Value', 'Unit'],
        rows: [
          ['Pump arrangement', arr, '–'],
          ['Total system peak demand flow', fmt(qTotal, 2), 'L/s'],
          ['Total system peak demand flow (volumetric)', fmt(lpsToM3h(qTotal), 2), 'm³/h'],
          ['Static lift (pump C/L to highest / critical fixture)', fmt(hStatic, 2), 'm'],
          ['Positive suction head (tank min. level above pump C/L)', fmt(hSuction, 2), 'm'],
          ['Required residual pressure at critical fixture', `${fmt(Number(i.residual.value), 2)} ${i.residual.unit}`, `= ${fmt(hResidual, 2)} m`],
          ['Equipment losses (meter / filter / PRV)', fmt(hEquip, 2), 'm'],
          ...pipeInputRows('Discharge', i.pipe, pipe),
          ['Design safety margin on head', fmt(Number(i.safetyPct), 0), '%'],
          ['Pump hydraulic efficiency (ηp)', fmt(Number(i.pumpEff), 0), '%'],
          ['Motor safety margin', fmt(Number(i.motorMargin), 0), '%'],
        ],
      },
      fittingTable('Discharge Header', i.pipe.fittings),
      {
        type: 'steps',
        title: '2. CALCULATION',
        steps: [
          {
            title: 'Flow per duty pump',
            formula: 'Qp = Qtotal / Nduty',
            subst: `Qp = ${fmt(qTotal, 2)} / ${duty}`,
            result: `Qp = ${fmt(qPump, 2)} L/s (${fmt(lpsToM3h(qPump), 2)} m³/h)`,
          },
          {
            title: 'Residual pressure conversion',
            formula: 'Hres = P × 10.194 (m per bar)',
            subst: `Hres = ${fmt(mToBar(hResidual), 3)} bar × 10.194`,
            result: `Hres = ${fmt(hResidual, 2)} m`,
          },
          ...pipeSteps('Discharge header', qTotal, i.pipe, pipe),
          {
            title: 'Total Dynamic Head',
            formula: 'TDH = (Hstatic + Hres + hf + hm + Hequip − Hsuction) × (1 + SF)',
            subst: `TDH = (${fmt(hStatic, 2)} + ${fmt(hResidual, 2)} + ${fmt(pipe.hf, 2)} + ${fmt(pipe.hm, 2)} + ${fmt(hEquip, 2)} − ${fmt(hSuction, 2)}) × ${fmt(1 + (Number(i.safetyPct) || 0) / 100, 2)}`,
            result: `TDH = ${fmt(tdh, 2)} m  (${fmt(mToBar(tdh), 2)} bar / ${fmt(mToKPa(tdh), 1)} kPa)`,
          },
          ...motorSteps(qPump, tdh, m, i.motorMargin),
        ],
      },
      {
        type: 'results',
        title: '3. RESULTS SUMMARY – SELECTED DUTY POINT',
        rows: [
          ['Pump set arrangement', arr],
          ['Total set capacity', flowText(qTotal)],
          ['Duty point per pump – flow', flowText(qPump)],
          ['Duty point per pump – total dynamic head', headText(tdh)],
          ['Pump shaft power (per pump)', `${fmt(m.Pshaft, 2)} kW`],
          ['Recommended motor rating (per pump)', `${m.motor} kW`],
          ['Discharge header velocity', `${fmt(pipe.v, 2)} m/s`],
        ],
        checks,
      },
      { type: 'notes', title: '4. NOTES', items: [...STANDARD_NOTES, 'Pressure set point for variable-speed booster set = TDH at duty point; cut-in/cut-out set points by diaphragm vessel calculation.'] },
    ],
  };

  return {
    duty: { tag: i.tag, service: i.service, category: i.category, kind: 'pump', calcType: 'Booster Pump Set', flowLps: qPump, totalFlowLps: qTotal, headM: tdh, motorKW: m.motor, arrangement: arr, remarks: `${duty} duty pump(s) @ ${fmt(qPump, 2)} L/s each` },
    kpis: [
      { label: 'Flow per Pump', value: fmt(qPump, 2), unit: 'L/s', sub: `${fmt(lpsToM3h(qPump), 2)} m³/h · Set ${fmt(qTotal, 2)} L/s` },
      { label: 'Total Dynamic Head', value: fmt(tdh, 2), unit: 'm', sub: `${fmt(mToBar(tdh), 2)} bar · ${fmt(mToKPa(tdh), 1)} kPa` },
      { label: 'Shaft Power', value: fmt(m.Pshaft, 2), unit: 'kW', sub: `Hydraulic ${fmt(m.Ph, 2)} kW` },
      { label: 'Motor Rating', value: String(m.motor), unit: 'kW', sub: `${arr} · per pump` },
    ],
    breakdown,
    checks,
    sheet,
    pipe,
  };
}
