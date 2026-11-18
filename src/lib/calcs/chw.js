import { evaluatePipe, fmt, lpsToM3h, motorSizing, mToBar, mToKPa, toKW, toMeters, arrangementText, KW_PER_TR } from '../hydraulics.js';
import { pipeDefaults, pipeSteps, pipeInputRows, fittingTable, motorSteps, velocityCheck, flowText, headText } from './common.js';

export const chwDefaults = () => ({
  tag: 'CHWP-01',
  service: 'Chilled Water Circulation Pump Set',
  category: 'circulation',
  duty: 2,
  standby: 1,
  load: { value: 500, unit: 'TR' },
  deltaT: 5.5,
  chillerDrop: { value: 65, unit: 'kPa' },
  coilDrop: { value: 45, unit: 'kPa' },
  valveDrop: { value: 35, unit: 'kPa' },
  otherDrop: { value: 20, unit: 'kPa' },
  pipe: pipeDefaults({ material: 'MS', dn: 250, length: 420, fittings: { butterfly: 8, elbow90: 34, teeRun: 22, teeBranch: 2, strainer: 1, nrv: 1, flexConn: 2 } }),
  safetyPct: 10,
  pumpEff: 78,
  motorMargin: 15,
});

export function computeChw(i) {
  const loadKW = toKW(i.load.value, i.load.unit);
  const dT = Math.max(Number(i.deltaT) || 0, 0.1);
  const qTotal = loadKW / (4.186 * dT);
  const duty = Math.max(1, Number(i.duty) || 1);
  const qPump = qTotal / duty;
  const hCh = toMeters(i.chillerDrop.value, i.chillerDrop.unit);
  const hCoil = toMeters(i.coilDrop.value, i.coilDrop.unit);
  const hValve = toMeters(i.valveDrop.value, i.valveDrop.unit);
  const hOther = toMeters(i.otherDrop.value, i.otherDrop.unit);
  const pipe = evaluatePipe({ qLps: qTotal, ...i.pipe });

  const subtotal = hCh + hCoil + hValve + hOther + pipe.hf + pipe.hm;
  const safety = subtotal * ((Number(i.safetyPct) || 0) / 100);
  const tdh = subtotal + safety;
  const m = motorSizing(qPump, tdh, i.pumpEff, i.motorMargin);
  const arr = arrangementText(duty, Number(i.standby) || 0);

  const frOk = pipe.paPerM <= 400;
  const checks = [
    velocityCheck('Index circuit main', pipe.v, { min: 0.6, max: 3.0 }),
    { ok: frOk, text: `Pipe friction rate ${fmt(pipe.paPerM, 0)} Pa/m ${frOk ? '≤ 400 Pa/m design limit' : '> 400 Pa/m – upsize main'}` },
    { ok: true, text: 'Closed loop – static head cancels; pump selected for system friction only (expansion vessel / pressurisation unit maintains static fill pressure).' },
  ];

  const breakdown = [
    { label: 'Chiller evaporator', m: hCh },
    { label: 'AHU / FCU coil', m: hCoil },
    { label: 'Control valve', m: hValve },
    { label: 'Other components', m: hOther },
    { label: 'Pipe friction', m: pipe.hf },
    { label: 'Fittings / valves', m: pipe.hm },
    { label: `Safety margin ${i.safetyPct}%`, m: safety },
  ];

  const kp = (h) => `${fmt(mToKPa(h), 1)} kPa = ${fmt(h, 2)} m`;

  const sheet = {
    docTitle: 'CHILLED WATER (CHW) PUMP – HYDRAULIC CALCULATION',
    calcType: 'Chilled Water Pump Set',
    tag: i.tag,
    service: i.service,
    sections: [
      {
        type: 'table',
        title: '1. DESIGN INPUT PARAMETERS',
        columns: ['Parameter', 'Value', 'Unit'],
        rows: [
          ['Pump arrangement', arr, '–'],
          ['Design cooling load', `${fmt(Number(i.load.value), 1)} ${i.load.unit}`, `= ${fmt(loadKW, 1)} kW`],
          ['Chilled water temperature difference (ΔT)', fmt(dT, 2), '°C'],
          ['Chiller evaporator pressure drop', kp(hCh), ''],
          ['Index AHU / FCU coil pressure drop', kp(hCoil), ''],
          ['Control valve (2-way / PICV) pressure drop', kp(hValve), ''],
          ['Other components (balancing valve, strainer, HX)', kp(hOther), ''],
          ...pipeInputRows('Index circuit (supply + return)', i.pipe, pipe),
          ['Design safety margin on head', fmt(Number(i.safetyPct), 0), '%'],
          ['Pump efficiency (ηp) / Motor margin', `${fmt(Number(i.pumpEff), 0)} / ${fmt(Number(i.motorMargin), 0)}`, '%'],
        ],
      },
      fittingTable('Index Circuit', i.pipe.fittings),
      {
        type: 'steps',
        title: '2. CALCULATION',
        steps: [
          ...(i.load.unit === 'TR' ? [{ title: 'Cooling load conversion', formula: 'Load (kW) = TR × 3.517', subst: `Load = ${fmt(Number(i.load.value), 1)} × ${KW_PER_TR}`, result: `Load = ${fmt(loadKW, 1)} kW` }] : []),
          { title: 'Chilled water flow rate', formula: 'Q (L/s) = Load (kW) / (4.186 × ΔT)', subst: `Q = ${fmt(loadKW, 1)} / (4.186 × ${fmt(dT, 2)})`, result: `Q = ${fmt(qTotal, 2)} L/s (${fmt(lpsToM3h(qTotal), 1)} m³/h)` },
          { title: 'Flow per duty pump', formula: 'Qp = Q / Nduty', subst: `Qp = ${fmt(qTotal, 2)} / ${duty}`, result: `Qp = ${fmt(qPump, 2)} L/s (${fmt(lpsToM3h(qPump), 1)} m³/h)` },
          { title: 'Component pressure drops', formula: 'Hcomp = ΣΔP / (ρ·g)', subst: `Hcomp = (${fmt(mToKPa(hCh), 1)} + ${fmt(mToKPa(hCoil), 1)} + ${fmt(mToKPa(hValve), 1)} + ${fmt(mToKPa(hOther), 1)}) kPa / 9.81`, result: `Hcomp = ${fmt(hCh + hCoil + hValve + hOther, 2)} m` },
          ...pipeSteps('Index circuit', qTotal, i.pipe, pipe),
          {
            title: 'Pump head (closed loop)',
            formula: 'H = (Hcomp + hf + hm) × (1 + SF)',
            subst: `H = (${fmt(hCh + hCoil + hValve + hOther, 2)} + ${fmt(pipe.hf, 2)} + ${fmt(pipe.hm, 2)}) × ${fmt(1 + (Number(i.safetyPct) || 0) / 100, 2)}`,
            result: `H = ${fmt(tdh, 2)} m  (${fmt(mToKPa(tdh), 1)} kPa / ${fmt(mToBar(tdh), 2)} bar)`,
          },
          ...motorSteps(qPump, tdh, m, i.motorMargin),
        ],
      },
      {
        type: 'results',
        title: '3. RESULTS SUMMARY – SELECTED DUTY POINT',
        rows: [
          ['Pump set arrangement', arr],
          ['System design flow', flowText(qTotal)],
          ['Duty point per pump – flow', flowText(qPump)],
          ['Duty point per pump – head', headText(tdh)],
          ['Recommended motor rating (per pump)', `${m.motor} kW (shaft ${fmt(m.Pshaft, 2)} kW)`],
          ['Index main velocity / friction rate', `${fmt(pipe.v, 2)} m/s / ${fmt(pipe.paPerM, 0)} Pa/m`],
        ],
        checks,
      },
      {
        type: 'notes',
        title: '4. NOTES',
        items: [
          'Flow based on water (cp = 4.186 kJ/kg·K, ρ ≈ 1000 kg/m³); apply glycol correction where applicable.',
          'Pressure drops of chiller, coils and control valves taken from manufacturer data for the index (most remote) circuit.',
          'Variable-speed pumps controlled on differential pressure across the index circuit; selection verified against manufacturer curve.',
        ],
      },
    ],
  };

  return {
    duty: { tag: i.tag, service: i.service, category: i.category, kind: 'pump', calcType: 'Chilled Water Pump Set', flowLps: qPump, totalFlowLps: qTotal, headM: tdh, motorKW: m.motor, arrangement: arr, remarks: `${fmt(loadKW, 0)} kW @ ΔT ${fmt(dT, 1)} °C` },
    kpis: [
      { label: 'System Flow', value: fmt(qTotal, 2), unit: 'L/s', sub: `${fmt(lpsToM3h(qTotal), 1)} m³/h · ${fmt(loadKW, 0)} kW` },
      { label: 'Flow per Pump', value: fmt(qPump, 2), unit: 'L/s', sub: `${fmt(lpsToM3h(qPump), 1)} m³/h` },
      { label: 'Pump Head', value: fmt(tdh, 2), unit: 'm', sub: `${fmt(mToKPa(tdh), 1)} kPa · ${fmt(mToBar(tdh), 2)} bar` },
      { label: 'Motor Rating', value: String(m.motor), unit: 'kW', sub: `${arr} · shaft ${fmt(m.Pshaft, 2)} kW` },
    ],
    breakdown,
    checks,
    sheet,
  };
}
