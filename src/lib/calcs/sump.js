import { evaluatePipe, fmt, lpsToM3h, motorSizing, mToBar, mToKPa, toLps, arrangementText } from '../hydraulics.js';
import { pipeDefaults, pipeSteps, pipeInputRows, fittingTable, motorSteps, velocityCheck, flowText, headText, STANDARD_NOTES } from './common.js';

export const sumpDefaults = () => ({
  tag: 'SPS-01',
  service: 'Basement Drainage Sump Pump Set',
  category: 'sump',
  duty: 1,
  standby: 1,
  drainageFlow: { value: 2.5, unit: 'L/s' },
  seepageFlow: { value: 0.5, unit: 'L/s' },
  rainArea: 150,
  rainIntensity: 75,
  runoffC: 1.0,
  inflowFactor: 1.25,
  pitBottom: -7.5,
  stopHeight: 0.45,
  dischargeLevel: 0.6,
  pipe: pipeDefaults({ material: 'GI', dn: 80, length: 35, fittings: { nrv: 1, gate: 1, elbow90: 6, teeRun: 1, exit: 1 } }),
  starts: 10,
  pitL: 1.5,
  pitW: 1.2,
  standbyGap: 0.1,
  alarmGap: 0.15,
  freeboard: 0.3,
  safetyPct: 10,
  pumpEff: 50,
  motorMargin: 20,
});

export function computeSump(i) {
  const qDrain = toLps(i.drainageFlow.value, i.drainageFlow.unit);
  const qSeep = toLps(i.seepageFlow.value, i.seepageFlow.unit);
  const qRain = ((Number(i.runoffC) || 0) * (Number(i.rainIntensity) || 0) * (Number(i.rainArea) || 0)) / 3600;
  const qIn = qDrain + qSeep + qRain;
  const factor = Number(i.inflowFactor) || 1;
  const qPump = qIn * factor; // each duty pump sized for full peak inflow
  const duty = Math.max(1, Number(i.duty) || 1);
  const qPerPump = qPump / duty;

  const bottom = Number(i.pitBottom) || 0;
  const stopLevel = bottom + (Number(i.stopHeight) || 0);
  const outlet = Number(i.dischargeLevel) || 0;
  const hStatic = outlet - stopLevel;
  const pipe = evaluatePipe({ qLps: qPump, ...i.pipe });
  const subtotal = hStatic + pipe.hf + pipe.hm;
  const safety = subtotal * ((Number(i.safetyPct) || 0) / 100);
  const tdh = subtotal + safety;
  const m = motorSizing(qPerPump, tdh, i.pumpEff, i.motorMargin);
  const arr = arrangementText(duty, Number(i.standby) || 0);

  // Wet well sizing:  V = Tmin · Qp / 4,  Tmin = 3600 / N
  const N = Math.max(Number(i.starts) || 1, 1);
  const Tmin = 3600 / N;
  const Veff = (Tmin * qPerPump) / 4 / 1000; // m³
  const area = (Number(i.pitL) || 0) * (Number(i.pitW) || 0);
  const effDepth = area > 0 ? Veff / area : 0;
  const startDuty = stopLevel + effDepth;
  const startStandby = startDuty + (Number(i.standbyGap) || 0);
  const highAlarm = startStandby + (Number(i.alarmGap) || 0);
  const inletInvert = highAlarm + (Number(i.freeboard) || 0);
  const pitDepth = inletInvert - bottom;

  const checks = [
    velocityCheck('Rising main', pipe.v, { min: 0.7, max: 2.5 }),
    { ok: effDepth >= 0.3, text: `Effective depth between stop/start floats = ${fmt(effDepth, 2)} m ${effDepth >= 0.3 ? '(≥ 0.30 m practical minimum)' : '– below 0.30 m practical float spacing; reduce pit plan area'}` },
    { ok: pipe.v >= 0.7, text: 'Self-cleansing velocity ≥ 0.7 m/s required in rising main to prevent solids settlement' },
  ];

  const breakdown = [
    { label: 'Static head', m: hStatic },
    { label: 'Pipe friction', m: pipe.hf },
    { label: 'Fittings / valves', m: pipe.hm },
    { label: `Safety margin ${i.safetyPct}%`, m: safety },
  ];

  const sheet = {
    docTitle: 'SUMP / DRAINAGE PUMP SET – HYDRAULIC CALCULATION',
    calcType: 'Sump Pump Set',
    tag: i.tag,
    service: i.service,
    sections: [
      {
        type: 'table',
        title: '1. DESIGN INPUT PARAMETERS',
        columns: ['Parameter', 'Value', 'Unit'],
        rows: [
          ['Pump arrangement', arr, '–'],
          ['Drainage / fixture inflow', fmt(qDrain, 2), 'L/s'],
          ['Groundwater seepage inflow', fmt(qSeep, 2), 'L/s'],
          ['Rainwater catchment area (ramps / open areas)', fmt(Number(i.rainArea), 1), 'm²'],
          ['Design rainfall intensity', fmt(Number(i.rainIntensity), 0), 'mm/h'],
          ['Run-off coefficient', fmt(Number(i.runoffC), 2), '–'],
          ['Peak inflow safety factor', fmt(factor, 2), '–'],
          ['Sump pit bottom elevation', fmt(bottom, 2), 'm'],
          ['Pump stop level above pit bottom (min. submergence)', fmt(Number(i.stopHeight), 2), 'm'],
          ['Discharge point / manhole invert elevation', fmt(outlet, 2), 'm'],
          ...pipeInputRows('Rising main', i.pipe, pipe),
          ['Maximum pump starts per hour', fmt(N, 0), 'starts/h'],
          ['Sump pit internal plan dimensions', `${fmt(Number(i.pitL), 2)} × ${fmt(Number(i.pitW), 2)}`, 'm'],
          ['Design safety margin on head', fmt(Number(i.safetyPct), 0), '%'],
          ['Pump efficiency (ηp) / Motor margin', `${fmt(Number(i.pumpEff), 0)} / ${fmt(Number(i.motorMargin), 0)}`, '%'],
        ],
      },
      fittingTable('Rising Main', i.pipe.fittings),
      {
        type: 'steps',
        title: '2. CALCULATION',
        steps: [
          { title: 'Rainwater inflow (Rational method)', formula: 'Qr = C · i · A / 3600', subst: `Qr = ${fmt(Number(i.runoffC), 2)} × ${fmt(Number(i.rainIntensity), 0)} × ${fmt(Number(i.rainArea), 1)} / 3600`, result: `Qr = ${fmt(qRain, 2)} L/s` },
          { title: 'Total peak inflow', formula: 'Qin = Qdrain + Qseep + Qr', subst: `Qin = ${fmt(qDrain, 2)} + ${fmt(qSeep, 2)} + ${fmt(qRain, 2)}`, result: `Qin = ${fmt(qIn, 2)} L/s` },
          { title: 'Design pump capacity', formula: 'Qp = Qin × SF / Nduty', subst: `Qp = ${fmt(qIn, 2)} × ${fmt(factor, 2)} / ${duty}`, result: `Qp = ${fmt(qPerPump, 2)} L/s (${fmt(lpsToM3h(qPerPump), 2)} m³/h)` },
          { title: 'Static discharge head', formula: 'Hst = Z(discharge) − Z(stop level)', subst: `Hst = ${fmt(outlet, 2)} − (${fmt(bottom, 2)} + ${fmt(Number(i.stopHeight), 2)})`, result: `Hst = ${fmt(hStatic, 2)} m` },
          ...pipeSteps('Rising main', qPump, i.pipe, pipe),
          {
            title: 'Total Dynamic Head',
            formula: 'TDH = (Hst + hf + hm) × (1 + SF)',
            subst: `TDH = (${fmt(hStatic, 2)} + ${fmt(pipe.hf, 2)} + ${fmt(pipe.hm, 2)}) × ${fmt(1 + (Number(i.safetyPct) || 0) / 100, 2)}`,
            result: `TDH = ${fmt(tdh, 2)} m  (${fmt(mToBar(tdh), 2)} bar / ${fmt(mToKPa(tdh), 1)} kPa)`,
          },
          ...motorSteps(qPerPump, tdh, m, i.motorMargin),
          { title: 'Minimum pump cycle time', formula: 'Tmin = 3600 / N', subst: `Tmin = 3600 / ${fmt(N, 0)}`, result: `Tmin = ${fmt(Tmin, 0)} s` },
          { title: 'Effective sump volume (start ↔ stop)', formula: 'Veff = Tmin · Qp / 4', subst: `Veff = ${fmt(Tmin, 0)} × ${fmt(qPerPump / 1000, 5)} / 4`, result: `Veff = ${fmt(Veff, 3)} m³ (${fmt(Veff * 1000, 0)} L)` },
          { title: 'Effective depth between floats', formula: 'heff = Veff / (L × W)', subst: `heff = ${fmt(Veff, 3)} / (${fmt(Number(i.pitL), 2)} × ${fmt(Number(i.pitW), 2)})`, result: `heff = ${fmt(effDepth, 2)} m` },
        ],
      },
      {
        type: 'table',
        title: 'Float / Level Control Schedule',
        columns: ['Level', 'Height above pit bottom (m)', 'Elevation (m)'],
        widths: [0.5, 0.25, 0.25],
        rows: [
          ['Inlet pipe invert (min.)', fmt(inletInvert - bottom, 2), fmt(inletInvert, 2)],
          ['High water alarm', fmt(highAlarm - bottom, 2), fmt(highAlarm, 2)],
          ['Standby pump start', fmt(startStandby - bottom, 2), fmt(startStandby, 2)],
          ['Duty pump start', fmt(startDuty - bottom, 2), fmt(startDuty, 2)],
          ['All pumps stop', fmt(stopLevel - bottom, 2), fmt(stopLevel, 2)],
          ['Sump pit bottom', '0.00', fmt(bottom, 2)],
        ],
      },
      {
        type: 'results',
        title: '3. RESULTS SUMMARY – SELECTED DUTY POINT',
        rows: [
          ['Pump set arrangement', arr],
          ['Duty point per pump – flow', flowText(qPerPump)],
          ['Duty point per pump – total dynamic head', headText(tdh)],
          ['Recommended motor rating (per pump)', `${m.motor} kW (shaft ${fmt(m.Pshaft, 2)} kW)`],
          ['Effective sump volume (start ↔ stop)', `${fmt(Veff * 1000, 0)} L (${fmt(effDepth, 2)} m depth)`],
          ['Minimum sump pit depth below inlet invert', `${fmt(pitDepth, 2)} m`],
        ],
        checks,
      },
      { type: 'notes', title: '4. NOTES', items: [...STANDARD_NOTES, 'Submersible pumps with automatic alternation (duty/standby) and high-level alarm to BMS. Rising main to include NRV and isolation valve in valve chamber.'] },
    ],
  };

  return {
    duty: { tag: i.tag, service: i.service, category: i.category, kind: 'pump', calcType: 'Sump Pump Set', flowLps: qPerPump, totalFlowLps: qPump, headM: tdh, motorKW: m.motor, arrangement: arr, remarks: `Sump eff. vol. ${fmt(Veff * 1000, 0)} L` },
    kpis: [
      { label: 'Flow per Pump', value: fmt(qPerPump, 2), unit: 'L/s', sub: `${fmt(lpsToM3h(qPerPump), 2)} m³/h · inflow ${fmt(qIn, 2)} L/s` },
      { label: 'Total Dynamic Head', value: fmt(tdh, 2), unit: 'm', sub: `${fmt(mToBar(tdh), 2)} bar · ${fmt(mToKPa(tdh), 1)} kPa` },
      { label: 'Effective Sump Volume', value: fmt(Veff * 1000, 0), unit: 'L', sub: `${fmt(effDepth, 2)} m between stop/start` },
      { label: 'Motor Rating', value: String(m.motor), unit: 'kW', sub: `${arr} · shaft ${fmt(m.Pshaft, 2)} kW` },
    ],
    breakdown,
    checks,
    levels: { bottom, stopLevel, startDuty, startStandby, highAlarm, inletInvert },
    sheet,
  };
}
