import { fmt, fittingRows, lpsToM3h, mToBar, mToKPa, velocityStatus, M_PER_BAR } from '../hydraulics.js';

/** Default pipe-run input object. */
export const pipeDefaults = (o = {}) => ({
  material: 'GI',
  dn: 80,
  idMm: '',
  length: 50,
  fittings: {},
  ...o,
});

/** Calculation steps for a pipe run (friction + fittings). */
export function pipeSteps(label, q, pipe, res) {
  const lines = [
    {
      title: `${label} – velocity`,
      formula: 'v = Q / A = 4·Q / (π·d²)',
      subst: `v = 4 × ${fmt(q / 1000, 5)} / (π × ${fmt(res.id / 1000, 4)}²)`,
      result: `v = ${fmt(res.v, 2)} m/s`,
    },
    {
      title: `${label} – pipe friction (Hazen-Williams)`,
      formula: 'hf = 10.67 · L · Q^1.852 / (C^1.852 · d^4.8704)',
      subst: `hf = 10.67 × ${fmt(Number(pipe.length), 1)} × ${fmt(q / 1000, 5)}^1.852 / (${res.C}^1.852 × ${fmt(res.id / 1000, 4)}^4.8704)`,
      result: `hf = ${fmt(res.hf, 2)} m  (${fmt(res.unitLoss, 2)} m/100 m)`,
    },
    {
      title: `${label} – fittings & valves (K-method)`,
      formula: 'hm = ΣK · v² / (2·g)',
      subst: `hm = ${fmt(res.K, 2)} × ${fmt(res.v, 2)}² / (2 × 9.81)`,
      result: `hm = ${fmt(res.hm, 2)} m`,
    },
  ];
  return lines;
}

export function pipeInputRows(label, pipe, res) {
  return [
    [`${label} – pipe material`, res.materialLabel, ''],
    [`${label} – nominal size / internal Ø`, `DN${pipe.dn} / ${fmt(res.id, 1)}`, 'mm'],
    [`${label} – Hazen-Williams C`, String(res.C), '–'],
    [`${label} – equivalent straight length`, fmt(Number(pipe.length), 1), 'm'],
  ];
}

export function fittingTable(label, fittings) {
  const rows = fittingRows(fittings).map((f) => [f.label, String(f.qty), fmt(f.K, 2), fmt(f.total, 2)]);
  if (!rows.length) rows.push(['No fittings entered', '–', '–', '0.00']);
  const total = fittingRows(fittings).reduce((s, f) => s + f.total, 0);
  rows.push(['TOTAL ΣK', '', '', fmt(total, 2)]);
  return { type: 'table', title: `${label} – Fittings Schedule`, columns: ['Fitting / Valve', 'Qty', 'K each', 'K total'], widths: [0.55, 0.12, 0.15, 0.18], rows };
}

export const flowText = (q) => `${fmt(q, 2)} L/s  |  ${fmt(lpsToM3h(q), 2)} m³/h`;
export const headText = (h) => `${fmt(h, 2)} m  |  ${fmt(mToBar(h), 2)} bar  |  ${fmt(mToKPa(h), 1)} kPa`;

export function motorSteps(q, head, m, marginPct) {
  return [
    {
      title: 'Hydraulic power',
      formula: 'Ph = ρ · g · Q · H / 1000',
      subst: `Ph = 1000 × 9.81 × ${fmt(q / 1000, 5)} × ${fmt(head, 2)} / 1000`,
      result: `Ph = ${fmt(m.Ph, 2)} kW`,
    },
    {
      title: 'Pump shaft power',
      formula: 'P2 = Ph / ηp',
      subst: `P2 = ${fmt(m.Ph, 2)} / ${fmt(m.eta, 2)}`,
      result: `P2 = ${fmt(m.Pshaft, 2)} kW`,
    },
    {
      title: 'Motor rating with safety margin',
      formula: 'Pm = P2 × (1 + margin)  →  next IEC standard frame',
      subst: `Pm = ${fmt(m.Pshaft, 2)} × (1 + ${fmt(Number(marginPct), 0)}%) = ${fmt(m.Preq, 2)} kW`,
      result: `Selected motor = ${m.motor} kW`,
    },
  ];
}

export const velocityCheck = (label, v, band) => {
  const s = velocityStatus(v, band);
  return { ok: s.ok, text: `${label} velocity ${fmt(v, 2)} m/s – ${s.text}` };
};

export const barToM = (bar) => bar * M_PER_BAR;

export const SECTION_CATEGORIES = {
  transfer: 'Transfer Pump Set',
  booster: 'Booster Pump Set',
  'booster-basement': 'Booster Pump Set – Basement',
  circulation: 'Circulation Pump Set',
  sump: 'Sump Pump Set',
};

export const STANDARD_NOTES = [
  'Friction losses computed by Hazen-Williams for water at ambient temperature; minor losses by the resistance-coefficient (K) method.',
  'Final pump selection shall be verified against the manufacturer performance curve at the duty point.',
  'Pipe routing, lengths and fitting quantities to be confirmed against approved shop drawings.',
];
