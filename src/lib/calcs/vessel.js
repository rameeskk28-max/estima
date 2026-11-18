import { fmt, toLps } from '../hydraulics.js';

export const STANDARD_VESSELS = [24, 60, 100, 200, 300, 500];

export const vesselDefaults = () => ({
  tag: 'PV-01',
  service: 'Diaphragm Pressure Vessel – Booster Pump Set',
  category: 'booster',
  pmin: 4.0,
  pmax: 5.5,
  mode: 'pump',
  va: 40,
  pumpFlow: { value: 1.2, unit: 'L/s' },
  starts: 30,
  vessels: 1,
  maxWorkingPressure: 10,
});

export function computeVessel(i) {
  const pmin = Number(i.pmin) || 0;
  const pmax = Number(i.pmax) || 0;
  const qp = toLps(i.pumpFlow.value, i.pumpFlow.unit);
  const N = Math.max(Number(i.starts) || 1, 1);
  const Tmin = 3600 / N;
  const vaFromPump = (qp * Tmin) / 4; // L
  const Va = i.mode === 'pump' ? vaFromPump : Number(i.va) || 0;
  const dp = pmax - pmin;
  const valid = dp > 0 && pmin > 0.2;
  const Vt = valid ? (Va * (pmax + 1)) / dp : NaN;
  const ppre = pmin - 0.2;

  let n = Math.max(1, Math.round(Number(i.vessels) || 1));
  const largest = STANDARD_VESSELS[STANDARD_VESSELS.length - 1];
  let autoIncreased = false;
  if (valid && Vt / n > largest) {
    n = Math.ceil(Vt / largest);
    autoIncreased = true;
  }
  const perVessel = valid ? Vt / n : NaN;
  const size = valid ? STANDARD_VESSELS.find((s) => s >= perVessel) ?? largest : null;
  const installed = size ? size * n : 0;
  const acceptance = valid ? dp / (pmax + 1) : NaN;
  const prOk = pmax <= (Number(i.maxWorkingPressure) || 10);

  const checks = [];
  if (!valid) checks.push({ ok: false, text: 'Cut-out pressure must exceed cut-in pressure, and cut-in must exceed 0.2 bar.' });
  else {
    checks.push({ ok: true, text: `Installed volume ${fmt(installed, 0)} L ≥ required ${fmt(Vt, 1)} L` });
    checks.push({ ok: prOk, text: `Cut-out ${fmt(pmax, 1)} bar ${prOk ? '≤' : '>'} vessel PN rating ${fmt(Number(i.maxWorkingPressure), 0)} bar` });
    if (autoIncreased) checks.push({ ok: true, text: `Number of vessels increased to ${n} (largest standard size is ${largest} L)` });
  }

  const recommendation = valid ? `${n} × ${size} L diaphragm vessel${n > 1 ? 's' : ''}, pre-charged to ${fmt(ppre, 1)} bar` : '–';

  const sheet = {
    docTitle: 'PRESSURE VESSEL (DIAPHRAGM TANK) SIZING CALCULATION',
    calcType: 'Pressure Vessel Sizing',
    tag: i.tag,
    service: i.service,
    sections: [
      {
        type: 'table',
        title: '1. DESIGN INPUT PARAMETERS',
        columns: ['Parameter', 'Value', 'Unit'],
        rows: [
          ['Pump cut-in pressure (Pmin)', fmt(pmin, 2), 'bar g'],
          ['Pump cut-out pressure (Pmax)', fmt(pmax, 2), 'bar g'],
          ['Drawdown volume basis', i.mode === 'pump' ? 'From pump flow & max starts/hour' : 'Direct entry', '–'],
          ...(i.mode === 'pump'
            ? [
                ['Largest single pump flow', fmt(qp, 2), 'L/s'],
                ['Maximum starts per hour', fmt(N, 0), 'starts/h'],
              ]
            : [['Required drawdown (acceptance) volume', fmt(Va, 1), 'L']]),
          ['Number of vessels', String(n), 'nos'],
          ['Vessel pressure rating (PN)', fmt(Number(i.maxWorkingPressure), 0), 'bar'],
        ],
      },
      {
        type: 'steps',
        title: '2. CALCULATION',
        steps: [
          ...(i.mode === 'pump'
            ? [
                { title: 'Minimum cycle time', formula: 'Tmin = 3600 / N', subst: `Tmin = 3600 / ${fmt(N, 0)}`, result: `Tmin = ${fmt(Tmin, 0)} s` },
                { title: 'Drawdown volume', formula: 'Va = Qp · Tmin / 4', subst: `Va = ${fmt(qp, 2)} L/s × ${fmt(Tmin, 0)} s / 4`, result: `Va = ${fmt(Va, 1)} L` },
              ]
            : []),
          { title: 'Total vessel volume (Boyle’s law)', formula: 'Vt = Va · (Pmax + 1) / (Pmax − Pmin)', subst: `Vt = ${fmt(Va, 1)} × (${fmt(pmax, 2)} + 1) / (${fmt(pmax, 2)} − ${fmt(pmin, 2)})`, result: `Vt = ${fmt(Vt, 1)} L` },
          { title: 'Volume per vessel', formula: 'Vv = Vt / n', subst: `Vv = ${fmt(Vt, 1)} / ${n}`, result: `Vv = ${fmt(perVessel, 1)} L → standard size ${size ?? '–'} L` },
          { title: 'Pre-charge (air) pressure', formula: 'Ppre = Pmin − 0.2 bar', subst: `Ppre = ${fmt(pmin, 2)} − 0.2`, result: `Ppre = ${fmt(ppre, 2)} bar g` },
          { title: 'Acceptance factor', formula: 'AF = (Pmax − Pmin) / (Pmax + 1)', subst: `AF = (${fmt(pmax, 2)} − ${fmt(pmin, 2)}) / (${fmt(pmax, 2)} + 1)`, result: `AF = ${fmt(acceptance, 3)}` },
        ],
      },
      {
        type: 'table',
        title: 'Standard Vessel Range',
        columns: ['Nominal size (L)', 'Vessels required', 'Installed volume (L)', 'Status'],
        widths: [0.25, 0.25, 0.25, 0.25],
        rows: STANDARD_VESSELS.map((s) => {
          const k = valid ? Math.ceil(Vt / s) : 0;
          return [String(s), valid ? String(k) : '–', valid ? fmt(k * s, 0) : '–', s === size ? 'SELECTED' : ''];
        }),
      },
      {
        type: 'results',
        title: '3. RESULTS SUMMARY',
        rows: [
          ['Required drawdown volume (Va)', `${fmt(Va, 1)} L`],
          ['Required total vessel volume (Vt)', `${fmt(Vt, 1)} L`],
          ['Recommended selection', recommendation],
          ['Installed total volume', `${fmt(installed, 0)} L`],
          ['Pre-charge pressure', `${fmt(ppre, 2)} bar g`],
        ],
        checks,
      },
      {
        type: 'notes',
        title: '4. NOTES',
        items: [
          'Pressures in the Boyle’s-law relation are taken as gauge + 1 bar (absolute) as per manufacturer sizing practice.',
          'Pre-charge pressure to be set on site with the vessel isolated and drained, 0.2 bar below pump cut-in pressure.',
          'Vessel to be EN 13831 / CE-marked with replaceable butyl (EPDM) membrane suitable for potable water.',
        ],
      },
    ],
  };

  return {
    duty: { tag: i.tag, service: i.service, category: i.category, kind: 'vessel', calcType: 'Pressure Vessel', flowLps: null, headM: null, motorKW: null, arrangement: valid ? `${n} × ${size} L` : '–', remarks: valid ? `Vt ${fmt(Vt, 0)} L, pre-charge ${fmt(ppre, 1)} bar, ${fmt(pmin, 1)}/${fmt(pmax, 1)} bar` : '' },
    kpis: [
      { label: 'Drawdown Volume', value: fmt(Va, 1), unit: 'L', sub: i.mode === 'pump' ? `Tmin ${fmt(Tmin, 0)} s` : 'Direct entry' },
      { label: 'Total Vessel Volume', value: fmt(Vt, 1), unit: 'L', sub: `Acceptance factor ${fmt(acceptance, 3)}` },
      { label: 'Pre-charge Pressure', value: fmt(ppre, 2), unit: 'bar', sub: `Cut-in ${fmt(pmin, 2)} / cut-out ${fmt(pmax, 2)} bar` },
      { label: 'Recommended', value: valid ? `${n} × ${size}` : '–', unit: 'L', sub: valid ? `Installed ${fmt(installed, 0)} L` : 'Check inputs', tone: valid ? 'ok' : 'bad' },
    ],
    breakdown: [],
    checks,
    selection: { n, size, Vt, installed },
    sheet,
  };
}
