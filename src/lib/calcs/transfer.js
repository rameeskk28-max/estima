import { evaluatePipe, fmt, lpsToM3h, motorSizing, mToBar, mToKPa, toM3, toMeters, arrangementText, vapourPressureKPa, waterDensity, atmosphericKPa, G } from '../hydraulics.js';
import { pipeDefaults, pipeSteps, pipeInputRows, fittingTable, motorSteps, velocityCheck, flowText, headText, STANDARD_NOTES } from './common.js';

export const transferDefaults = () => ({
  tag: 'TPS-01',
  service: 'Water Transfer Pump Set – Ground Tank to Roof Tank',
  category: 'transfer',
  duty: 1,
  standby: 1,
  volume: { value: 60, unit: 'm³' },
  fillTime: 2,
  lwlLevel: -3.5,
  pumpLevel: -4.0,
  dischargeLevel: 64,
  residual: { value: 3, unit: 'm' },
  suctionPipe: pipeDefaults({ material: 'GI', dn: 100, length: 6, fittings: { entrance: 1, gate: 1, strainer: 1, elbow90: 2, flexConn: 1, reducer: 1 } }),
  dischargePipe: pipeDefaults({ material: 'GI', dn: 80, length: 95, fittings: { reducer: 1, flexConn: 1, nrv: 1, gate: 2, elbow90: 10, teeRun: 2, exit: 1 } }),
  safetyPct: 10,
  pumpEff: 68,
  motorMargin: 15,
  waterTemp: 40,
  altitude: 10,
  npshr: 3.0,
  npshMargin: 0.5,
});

export function computeTransfer(i) {
  const V = toM3(i.volume.value, i.volume.unit);
  const t = Math.max(Number(i.fillTime) || 0, 0.01);
  const qTotal = (V * 1000) / (t * 3600); // L/s
  const duty = Math.max(1, Number(i.duty) || 1);
  const qPump = qTotal / duty;

  const lwl = Number(i.lwlLevel) || 0;
  const pumpCL = Number(i.pumpLevel) || 0;
  const disch = Number(i.dischargeLevel) || 0;
  const hStatic = disch - lwl;
  const hResidual = toMeters(i.residual.value, i.residual.unit);
  const suction = evaluatePipe({ qLps: qPump, ...i.suctionPipe });
  const discharge = evaluatePipe({ qLps: qTotal, ...i.dischargePipe });

  const subtotal = hStatic + hResidual + suction.total + discharge.total;
  const safety = subtotal * ((Number(i.safetyPct) || 0) / 100);
  const tdh = subtotal + safety;
  const m = motorSizing(qPump, tdh, i.pumpEff, i.motorMargin);
  const arr = arrangementText(duty, Number(i.standby) || 0);

  // NPSH available
  const T = Number(i.waterTemp) || 0;
  const rho = waterDensity(T);
  const patm = atmosphericKPa(Number(i.altitude) || 0);
  const pv = vapourPressureKPa(T);
  const Ha = (patm * 1000) / (rho * G);
  const Hvp = (pv * 1000) / (rho * G);
  const hs = lwl - pumpCL; // + flooded, − lift
  const npsha = Ha + hs - suction.total - Hvp;
  const npshr = Number(i.npshr) || 0;
  const npshReq = npshr + (Number(i.npshMargin) || 0);
  const npshOk = npsha >= npshReq;

  const checks = [
    { ok: npshOk, text: `NPSHa ${fmt(npsha, 2)} m ${npshOk ? '≥' : '<'} NPSHr + margin ${fmt(npshReq, 2)} m – ${npshOk ? 'cavitation-free operation' : 'CAVITATION RISK: raise suction level / upsize suction pipe'}` },
    velocityCheck('Suction pipe', suction.v, { min: 0.3, max: 1.5 }),
    velocityCheck('Discharge pipe', discharge.v, { min: 0.6, max: 2.5 }),
  ];

  const breakdown = [
    { label: 'Static elevation', m: hStatic },
    { label: 'Outlet residual', m: hResidual },
    { label: 'Suction losses', m: suction.total },
    { label: 'Discharge friction', m: discharge.hf },
    { label: 'Discharge fittings', m: discharge.hm },
    { label: `Safety margin ${i.safetyPct}%`, m: safety },
  ];

  const sheet = {
    docTitle: 'TRANSFER PUMP SET – HYDRAULIC CALCULATION',
    calcType: 'Transfer Pump Set',
    tag: i.tag,
    service: i.service,
    sections: [
      {
        type: 'table',
        title: '1. DESIGN INPUT PARAMETERS',
        columns: ['Parameter', 'Value', 'Unit'],
        rows: [
          ['Pump arrangement', arr, '–'],
          ['Upper (roof) tank volume to be filled', fmt(V, 2), 'm³'],
          ['Required filling time', fmt(t, 2), 'h'],
          ['Lower tank minimum water level (LWL) elevation', fmt(lwl, 2), 'm'],
          ['Pump centre-line elevation', fmt(pumpCL, 2), 'm'],
          ['Roof tank inlet (discharge) elevation', fmt(disch, 2), 'm'],
          ['Residual pressure at outlet / float valve', `${fmt(Number(i.residual.value), 2)} ${i.residual.unit}`, `= ${fmt(hResidual, 2)} m`],
          ...pipeInputRows('Suction', i.suctionPipe, suction),
          ...pipeInputRows('Discharge', i.dischargePipe, discharge),
          ['Water temperature', fmt(T, 1), '°C'],
          ['Site altitude above sea level', fmt(Number(i.altitude), 0), 'm'],
          ['Pump NPSHr at duty point (manufacturer)', fmt(npshr, 2), 'm'],
          ['NPSH safety margin', fmt(Number(i.npshMargin), 2), 'm'],
          ['Design safety margin on head', fmt(Number(i.safetyPct), 0), '%'],
          ['Pump efficiency (ηp) / Motor margin', `${fmt(Number(i.pumpEff), 0)} / ${fmt(Number(i.motorMargin), 0)}`, '%'],
        ],
      },
      fittingTable('Suction Pipe', i.suctionPipe.fittings),
      fittingTable('Discharge Pipe', i.dischargePipe.fittings),
      {
        type: 'steps',
        title: '2. CALCULATION',
        steps: [
          { title: 'Required flow rate', formula: 'Q = V / t', subst: `Q = ${fmt(V, 2)} m³ × 1000 / (${fmt(t, 2)} h × 3600)`, result: `Q = ${fmt(qTotal, 2)} L/s (${fmt(lpsToM3h(qTotal), 2)} m³/h)` },
          { title: 'Flow per duty pump', formula: 'Qp = Q / Nduty', subst: `Qp = ${fmt(qTotal, 2)} / ${duty}`, result: `Qp = ${fmt(qPump, 2)} L/s` },
          { title: 'Static elevation head', formula: 'Hst = Z(inlet) − Z(LWL)', subst: `Hst = ${fmt(disch, 2)} − (${fmt(lwl, 2)})`, result: `Hst = ${fmt(hStatic, 2)} m` },
          ...pipeSteps('Suction', qPump, i.suctionPipe, suction),
          ...pipeSteps('Discharge', qTotal, i.dischargePipe, discharge),
          {
            title: 'Total Dynamic Head',
            formula: 'TDH = (Hst + Hres + Σh(suction) + Σh(discharge)) × (1 + SF)',
            subst: `TDH = (${fmt(hStatic, 2)} + ${fmt(hResidual, 2)} + ${fmt(suction.total, 2)} + ${fmt(discharge.total, 2)}) × ${fmt(1 + (Number(i.safetyPct) || 0) / 100, 2)}`,
            result: `TDH = ${fmt(tdh, 2)} m  (${fmt(mToBar(tdh), 2)} bar / ${fmt(mToKPa(tdh), 1)} kPa)`,
          },
          ...motorSteps(qPump, tdh, m, i.motorMargin),
          { title: 'Atmospheric pressure head', formula: 'Ha = Patm / (ρ·g),  Patm = 101.325·(1 − 2.25577e-5·z)^5.25588', subst: `Ha = ${fmt(patm, 2)} kPa × 1000 / (${fmt(rho, 1)} × 9.81)`, result: `Ha = ${fmt(Ha, 2)} m` },
          { title: 'Vapour pressure head (Antoine)', formula: 'Hvp = Pv(T) / (ρ·g)', subst: `Hvp = ${fmt(pv, 2)} kPa × 1000 / (${fmt(rho, 1)} × 9.81)`, result: `Hvp = ${fmt(Hvp, 2)} m` },
          { title: 'NPSH available', formula: 'NPSHa = Ha + hs − hf(suction) − Hvp', subst: `NPSHa = ${fmt(Ha, 2)} + (${fmt(hs, 2)}) − ${fmt(suction.total, 2)} − ${fmt(Hvp, 2)}`, result: `NPSHa = ${fmt(npsha, 2)} m  vs  NPSHr + margin = ${fmt(npshReq, 2)} m → ${npshOk ? 'PASS' : 'FAIL'}` },
        ],
      },
      {
        type: 'results',
        title: '3. RESULTS SUMMARY – SELECTED DUTY POINT',
        rows: [
          ['Pump set arrangement', arr],
          ['Duty point per pump – flow', flowText(qPump)],
          ['Duty point per pump – total dynamic head', headText(tdh)],
          ['Recommended motor rating (per pump)', `${m.motor} kW (shaft ${fmt(m.Pshaft, 2)} kW)`],
          ['NPSH available / required (incl. margin)', `${fmt(npsha, 2)} m / ${fmt(npshReq, 2)} m – ${npshOk ? 'PASS' : 'FAIL'}`],
          ['Suction / discharge velocity', `${fmt(suction.v, 2)} m/s / ${fmt(discharge.v, 2)} m/s`],
        ],
        checks,
      },
      { type: 'notes', title: '4. NOTES', items: [...STANDARD_NOTES, 'Pumps controlled by level switches in the roof tank (start/stop) with dry-run protection in the lower tank.'] },
    ],
  };

  return {
    duty: { tag: i.tag, service: i.service, category: i.category, kind: 'pump', calcType: 'Transfer Pump Set', flowLps: qPump, totalFlowLps: qTotal, headM: tdh, motorKW: m.motor, arrangement: arr, remarks: `NPSHa ${fmt(npsha, 2)} m` },
    kpis: [
      { label: 'Flow per Pump', value: fmt(qPump, 2), unit: 'L/s', sub: `${fmt(lpsToM3h(qPump), 2)} m³/h` },
      { label: 'Total Dynamic Head', value: fmt(tdh, 2), unit: 'm', sub: `${fmt(mToBar(tdh), 2)} bar · ${fmt(mToKPa(tdh), 1)} kPa` },
      { label: 'NPSH Available', value: fmt(npsha, 2), unit: 'm', sub: `Required ${fmt(npshReq, 2)} m · ${npshOk ? 'PASS' : 'FAIL'}`, tone: npshOk ? 'ok' : 'bad' },
      { label: 'Motor Rating', value: String(m.motor), unit: 'kW', sub: `${arr} · shaft ${fmt(m.Pshaft, 2)} kW` },
    ],
    breakdown,
    checks,
    sheet,
  };
}
