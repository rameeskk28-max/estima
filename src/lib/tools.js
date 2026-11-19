// Engineering Tools – quick pump & piping calculations (metric + imperial inputs).
import { QUANTITIES, toSI, fromSI, fmtSmart, val, si } from './units.js';
import { MATERIALS, MATERIAL_NAMES, PIPE_SIZES_IN, sizeLabel, dnOf } from './ipc.js';
import { vapourPressureKPa, waterDensity, atmosphericKPa, IEC_MOTORS } from './hydraulics.js';

const G = 9.80665;
const f = fmtSmart;
const fx = (n, dp = 2) => (Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }) : '–');

/** Absolute roughness ε (mm) for Darcy-Weisbach (Moody / manufacturer typical values). */
export const ROUGHNESS_MM = { 'PPR / uPVC': 0.007, PE: 0.007, 'GI (Galvanised Steel)': 0.15, 'Black Steel': 0.045, 'Stainless Steel': 0.015, Copper: 0.0015 };

/** Dynamic viscosity of water (Pa·s) – Vogel equation. */
export const waterViscosity = (tC) => 2.414e-5 * Math.pow(10, 247.8 / (tC + 273.15 - 140));

/** Pipe internal diameter (m) from material + nominal size, or custom diameter. */
export function pipeId(p) {
  if (p.mode === 'custom') return si(p.id, 'diameter');
  const mat = MATERIALS[p.material] || MATERIALS['PPR / uPVC'];
  return (mat.id(Number(p.size)) || Number(p.size)) * 0.0254;
}
const pipeText = (p) => (p.mode === 'custom' ? `Custom ID ${p.id.v} ${p.id.u}` : `${p.material} ${sizeLabel(Number(p.size))} (DN${dnOf(Number(p.size))})`);

export const pipeDefaults = (o = {}) => ({ mode: 'standard', material: 'GI (Galvanised Steel)', size: 3, id: val(77.9, 'mm'), ...o });

/** Hazen-Williams SI: hf = 10.67 L Q^1.852 / (C^1.852 d^4.8704) */
export const hwLoss = (Q, D, L, C) => (Q > 0 && D > 0 && C > 0 ? (10.67 * L * Math.pow(Q, 1.852)) / (Math.pow(C, 1.852) * Math.pow(D, 4.8704)) : 0);

/** Darcy-Weisbach with Swamee-Jain friction factor. */
export function dwLoss(Q, D, L, epsM, tC) {
  const rho = waterDensity(tC);
  const mu = waterViscosity(tC);
  const A = (Math.PI * D * D) / 4;
  const v = Q / A;
  const Re = (rho * v * D) / mu;
  let fr;
  if (Re < 2300) fr = 64 / Math.max(Re, 1);
  else fr = 0.25 / Math.pow(Math.log10(epsM / (3.7 * D) + 5.74 / Math.pow(Re, 0.9)), 2);
  return { hf: (fr * (L / D) * v * v) / (2 * G), f: fr, Re, v, rho, mu, regime: Re < 2300 ? 'Laminar' : Re < 4000 ? 'Transitional' : 'Turbulent' };
}

/** Output helpers */
const both = (x, q, a, b) => `${f(fromSI(x, a, q))} ${a}  (${f(fromSI(x, b, q))} ${b})`;
const inRow = (label, x) => [label, `${x.v} ${x.u}`];

function sheet(title, ref, inputs, steps, extra = []) {
  return {
    docTitle: `ENGINEERING CALCULATION – ${title}`,
    sheetLabel: 'ENGINEERING TOOLS',
    calcType: title,
    tag: ref || '–',
    service: title,
    sections: [
      { type: 'info', title: '1. INPUT DATA', rows: [['Project', '@projectName'], ...inputs] },
      {
        type: 'steps',
        title: '2. CALCULATION',
        columns: [
          { label: 'Step', w: 0.045, align: 'c' },
          { label: 'Calculation', w: 0.2 },
          { label: 'Formula', w: 0.22 },
          { label: 'Result', w: 0.12, align: 'c' },
          { label: 'Unit', w: 0.07, align: 'c' },
          { label: 'Reference / Basis', w: 0.345 },
        ],
        steps: steps.map((s, i) => ({ n: i + 1, ...s })),
      },
      ...extra,
    ],
  };
}

/* =========================================================== */
/* 1. UNIT CONVERTER                                            */
/* =========================================================== */
export const converterDefaults = () => ({ ref: '', q: 'flow', v: 10, u: 'L/s' });
export function computeConverter(i) {
  const Q = QUANTITIES[i.q];
  const base = toSI(i.v, i.u, i.q);
  const rows = Object.keys(Q.units).map((u) => ({ unit: u, value: fromSI(base, u, i.q) }));
  return {
    rows,
    kpis: [],
    sheet: {
      ...sheet(`UNIT CONVERSION – ${Q.label.toUpperCase()}`, i.ref, [inRow(Q.label, { v: i.v, u: i.u })], []),
      sections: [
        { type: 'info', title: '1. INPUT', rows: [['Project', '@projectName'], [Q.label, `${i.v} ${i.u}`]] },
        { type: 'grid', title: '2. EQUIVALENT VALUES', columns: [{ label: 'Unit', w: 0.4 }, { label: 'Value', w: 0.6, align: 'c' }], rows: rows.map((r) => ({ c: [r.unit, f(r.value, 6)], bold: r.unit === i.u })) },
        { type: 'note', text: 'Conversion factors: NIST SP 811 / ISO 80000. Water head ↔ pressure at standard gravity (9.80665 m/s²) and 1000 kg/m³ (4 °C).' },
      ],
    },
  };
}

/* =========================================================== */
/* 2. VELOCITY                                                  */
/* =========================================================== */
export const velocityDefaults = () => ({ ref: '', flow: val(5, 'L/s'), pipe: pipeDefaults(), vmin: val(0.6, 'm/s'), vmax: val(2.4, 'm/s') });
export function computeVelocity(i) {
  const Q = si(i.flow, 'flow');
  const D = pipeId(i.pipe);
  const A = (Math.PI * D * D) / 4;
  const v = Q / A;
  const hv = (v * v) / (2 * G);
  const vmin = si(i.vmin, 'velocity');
  const vmax = si(i.vmax, 'velocity');
  const ok = v >= vmin && v <= vmax;
  const mat = MATERIALS[i.pipe.material];
  const table = i.pipe.mode === 'custom' ? [] : PIPE_SIZES_IN.map((s) => {
    const d = (mat.id(s) || s) * 0.0254;
    const vv = Q / ((Math.PI * d * d) / 4);
    return { size: s, id: d * 1000, v: vv, ok: vv >= vmin && vv <= vmax };
  });
  const steps = [
    { calc: 'Internal diameter', formula: pipeText(i.pipe), value: fx(D * 1000, 1), unit: 'mm', ref: i.pipe.mode === 'custom' ? 'User input' : mat.idBasis },
    { calc: 'Flow area', formula: 'A = π·D² / 4', value: f(A * 1e4), unit: 'cm²', ref: 'Circular pipe cross-section' },
    { calc: 'Velocity', formula: 'v = Q / A', value: fx(v, 3), unit: 'm/s', ref: `= ${fx(v / 0.3048, 2)} ft/s – continuity equation`, bold: true },
    { calc: 'Velocity head', formula: 'hv = v² / 2g', value: fx(hv, 3), unit: 'm', ref: 'Kinetic energy per unit weight' },
    { calc: 'Velocity check', formula: `${fx(vmin, 1)} ≤ v ≤ ${fx(vmax, 1)} m/s`, value: ok ? 'OK' : 'CHECK', unit: '', ref: 'Recommended range for pumped water (noise / erosion / sediment) – design practice', bold: true },
  ];
  return {
    kpis: [
      { label: 'Velocity', value: fx(v, 2), unit: 'm/s', sub: `${fx(v / 0.3048, 2)} ft/s`, tone: ok ? 'ok' : 'bad' },
      { label: 'Internal Ø', value: fx(D * 1000, 1), unit: 'mm', sub: `${fx(D / 0.0254, 3)} in` },
      { label: 'Flow area', value: f(A * 1e4), unit: 'cm²', sub: `${f(A / 0.00064516)} in²` },
      { label: 'Velocity head', value: fx(hv, 3), unit: 'm', sub: `${fx(hv / 0.3048, 3)} ft` },
    ],
    checks: [{ ok, text: ok ? `Velocity ${fx(v, 2)} m/s within ${fx(vmin, 1)}–${fx(vmax, 1)} m/s` : `Velocity ${fx(v, 2)} m/s outside ${fx(vmin, 1)}–${fx(vmax, 1)} m/s – change pipe size` }],
    table,
    sheet: sheet('PIPE VELOCITY', i.ref, [inRow('Flow rate', i.flow), ['Pipe', pipeText(i.pipe)], ['Velocity range', `${i.vmin.v}–${i.vmax.v} ${i.vmax.u}`]], steps, table.length ? [{
      type: 'grid', title: '3. VELOCITY FOR ALL SIZES', columns: [{ label: 'Size', w: 0.2, align: 'c' }, { label: 'ID (mm)', w: 0.2, align: 'c' }, { label: 'Velocity (m/s)', w: 0.3, align: 'c' }, { label: 'Status', w: 0.3, align: 'c' }],
      rows: table.map((t) => ({ c: [sizeLabel(t.size), fx(t.id, 1), fx(t.v, 2), t.ok ? 'OK' : t.v > vmax ? 'Too high' : 'Too low'], bold: t.size === Number(i.pipe.size), flag: t.ok ? null : 3 })),
    }] : []),
  };
}

/* =========================================================== */
/* 3. PIPE SIZER                                                */
/* =========================================================== */
export const sizerDefaults = () => ({ ref: '', flow: val(10, 'L/s'), material: 'GI (Galvanised Steel)', method: 'hw', C: '', temp: val(25, '°C'), vmin: val(0.6, 'm/s'), vmax: val(2.4, 'm/s'), useFriction: true, fmax: val(4, 'm/100 m') });
export function computeSizer(i) {
  const Q = si(i.flow, 'flow');
  const mat = MATERIALS[i.material];
  const C = Number(i.C) || mat.C;
  const tC = si(i.temp, 'temperature') - 273.15;
  const eps = ROUGHNESS_MM[i.material] / 1000;
  const vmin = si(i.vmin, 'velocity');
  const vmax = si(i.vmax, 'velocity');
  const fmax = si(i.fmax, 'frictionRate'); // Pa/m
  const rows = PIPE_SIZES_IN.map((s) => {
    const D = (mat.id(s) || s) * 0.0254;
    const v = Q / ((Math.PI * D * D) / 4);
    const hf100 = i.method === 'dw' ? dwLoss(Q, D, 100, eps, tC).hf : hwLoss(Q, D, 100, C);
    const pa = (hf100 / 100) * 1000 * G;
    const okV = v <= vmax;
    const okF = !i.useFriction || pa <= fmax;
    return { size: s, D, v, hf100, pa, okV, okF, ok: okV && okF, low: v < vmin };
  });
  const rec = rows.find((r) => r.ok);
  const steps = [
    { calc: 'Design flow', formula: 'Input', value: fx(Q * 1000, 2), unit: 'L/s', ref: `= ${fx(Q * 3600, 2)} m³/h = ${fx(Q / 6.30901964e-5, 1)} US gpm` },
    { calc: 'Friction method', formula: i.method === 'dw' ? 'Darcy-Weisbach, Swamee-Jain f' : 'Hazen-Williams', value: i.method === 'dw' ? `ε ${ROUGHNESS_MM[i.material]}` : `C ${C}`, unit: i.method === 'dw' ? 'mm' : '–', ref: i.method === 'dw' ? `Absolute roughness for ${i.material}; water at ${fx(tC, 0)} °C` : mat.cBasis },
    { calc: 'Velocity limit', formula: 'v ≤ vmax', value: fx(vmax, 2), unit: 'm/s', ref: 'Design criterion – noise & erosion control' },
    ...(i.useFriction ? [{ calc: 'Friction limit', formula: 'hf / L ≤ limit', value: fx(fmax / (1000 * G) * 100, 2), unit: 'm/100 m', ref: `= ${fx(fmax, 0)} Pa/m – design criterion` }] : []),
    { calc: 'Recommended size', formula: 'Smallest size meeting all limits', value: rec ? sizeLabel(rec.size) : 'None', unit: rec ? `DN${dnOf(rec.size)}` : '', ref: rec ? `ID ${fx(rec.D * 1000, 1)} mm, v ${fx(rec.v, 2)} m/s, ${fx(rec.hf100, 2)} m/100 m` : 'Flow too large for listed sizes – use parallel pipes', bold: true },
  ];
  return {
    rows,
    rec,
    kpis: [
      { label: 'Recommended', value: rec ? sizeLabel(rec.size) : '–', unit: rec ? `DN${dnOf(rec.size)}` : '', sub: rec ? `ID ${fx(rec.D * 1000, 1)} mm` : 'No size meets limits', tone: rec ? 'ok' : 'bad' },
      { label: 'Velocity', value: rec ? fx(rec.v, 2) : '–', unit: 'm/s', sub: rec ? `${fx(rec.v / 0.3048, 2)} ft/s` : '' },
      { label: 'Friction', value: rec ? fx(rec.hf100, 2) : '–', unit: 'm/100 m', sub: rec ? `${fx(rec.pa, 0)} Pa/m` : '' },
      { label: 'Flow', value: fx(Q * 1000, 2), unit: 'L/s', sub: `${fx(Q * 3600, 1)} m³/h · ${fx(Q / 6.30901964e-5, 0)} gpm` },
    ],
    checks: rec && rec.low ? [{ ok: false, text: `Velocity in the recommended size is below ${fx(vmin, 1)} m/s – check for sedimentation (drainage).` }] : [],
    sheet: sheet('PIPE SIZER', i.ref, [inRow('Design flow', i.flow), ['Pipe material', i.material], ['Method', i.method === 'dw' ? 'Darcy-Weisbach' : 'Hazen-Williams'], ['Velocity limit', `${i.vmax.v} ${i.vmax.u}`], ['Friction limit', i.useFriction ? `${i.fmax.v} ${i.fmax.u}` : 'Not applied']], steps, [{
      type: 'grid', title: '3. SIZE SELECTION TABLE',
      columns: [{ label: 'Size', w: 0.13, align: 'c' }, { label: 'DN', w: 0.1, align: 'c' }, { label: 'ID (mm)', w: 0.14, align: 'c' }, { label: 'Velocity (m/s)', w: 0.16, align: 'c' }, { label: 'Friction (m/100 m)', w: 0.17, align: 'c' }, { label: 'Friction (Pa/m)', w: 0.15, align: 'c' }, { label: 'Status', w: 0.15, align: 'c' }],
      rows: rows.map((r) => ({ c: [sizeLabel(r.size), `DN${dnOf(r.size)}`, fx(r.D * 1000, 1), fx(r.v, 2), fx(r.hf100, 2), fx(r.pa, 0), r.ok ? (r === rec ? 'SELECTED' : 'OK') : !r.okV ? 'Velocity high' : 'Friction high'], bold: r === rec, flag: r.ok ? null : 6 })),
    }]),
  };
}

/* =========================================================== */
/* 4. FRICTION LOSS                                             */
/* =========================================================== */
export const frictionDefaults = () => ({ ref: '', flow: val(5, 'L/s'), pipe: pipeDefaults(), length: val(100, 'm'), method: 'hw', C: '', eps: '', temp: val(25, '°C'), sumK: 0 });
export function computeFriction(i) {
  const Q = si(i.flow, 'flow');
  const D = pipeId(i.pipe);
  const L = si(i.length, 'length');
  const mat = MATERIALS[i.pipe.material] || MATERIALS['PPR / uPVC'];
  const C = Number(i.C) || mat.C;
  const epsMm = i.eps !== '' && i.eps != null ? Number(i.eps) : ROUGHNESS_MM[i.pipe.material] ?? 0.05;
  const tC = si(i.temp, 'temperature') - 273.15;
  const dw = dwLoss(Q, D, L, epsMm / 1000, tC);
  const hf = i.method === 'dw' ? dw.hf : hwLoss(Q, D, L, C);
  const v = dw.v;
  const K = Number(i.sumK) || 0;
  const hm = (K * v * v) / (2 * G);
  const total = hf + hm;
  const rho = i.method === 'dw' ? dw.rho : 1000;
  const toBar = (h) => (rho * G * h) / 1e5;
  const steps = [
    { calc: 'Internal diameter', formula: pipeText(i.pipe), value: fx(D * 1000, 1), unit: 'mm', ref: i.pipe.mode === 'custom' ? 'User input' : mat.idBasis },
    { calc: 'Velocity', formula: 'v = 4Q / (π·D²)', value: fx(v, 3), unit: 'm/s', ref: 'Continuity equation' },
    ...(i.method === 'dw'
      ? [
          { calc: 'Reynolds number', formula: 'Re = ρ·v·D / μ', value: f(dw.Re), unit: '–', ref: `${dw.regime} flow; water ${fx(tC, 0)} °C: ρ ${fx(dw.rho, 1)} kg/m³, μ ${f(dw.mu * 1000)} mPa·s` },
          { calc: 'Friction factor', formula: Re2300(dw.Re) ? 'f = 64 / Re' : 'f = 0.25 / [log(ε/3.7D + 5.74/Re^0.9)]²', value: fx(dw.f, 4), unit: '–', ref: Re2300(dw.Re) ? 'Laminar flow (Hagen-Poiseuille)' : `Swamee-Jain (Colebrook explicit), ε = ${epsMm} mm` },
          { calc: 'Pipe friction loss', formula: 'hf = f·(L/D)·v²/2g', value: fx(hf, 3), unit: 'm', ref: 'Darcy-Weisbach equation', bold: true },
        ]
      : [{ calc: 'Pipe friction loss', formula: 'hf = 10.67·L·Q^1.852 / (C^1.852·D^4.8704)', value: fx(hf, 3), unit: 'm', ref: `Hazen-Williams (SI), C = ${C} – ${mat.cBasis}`, bold: true }]),
    ...(K > 0 ? [{ calc: 'Minor losses', formula: `ΣK·v²/2g, ΣK = ${K}`, value: fx(hm, 3), unit: 'm', ref: 'Resistance-coefficient method (fittings & valves)' }] : []),
    { calc: 'Total head loss', formula: K > 0 ? 'hf + hm' : 'hf', value: fx(total, 3), unit: 'm', ref: `= ${fx(toBar(total), 3)} bar = ${fx(toBar(total) * 14.5038, 2)} psi = ${fx(total / 0.3048, 2)} ft`, bold: true },
    { calc: 'Friction rate', formula: 'hf / L × 100', value: fx(L > 0 ? (hf / L) * 100 : 0, 2), unit: 'm/100 m', ref: `= ${fx(L > 0 ? (hf / L) * rho * G : 0, 0)} Pa/m` },
  ];
  return {
    kpis: [
      { label: 'Total head loss', value: fx(total, 2), unit: 'm', sub: `${fx(toBar(total), 3)} bar · ${fx(total / 0.3048, 2)} ft`, tone: 'ok' },
      { label: 'Friction rate', value: fx(L > 0 ? (hf / L) * 100 : 0, 2), unit: 'm/100 m', sub: `${fx(L > 0 ? (hf / L) * rho * G : 0, 0)} Pa/m` },
      { label: 'Velocity', value: fx(v, 2), unit: 'm/s', sub: `${fx(v / 0.3048, 2)} ft/s` },
      { label: i.method === 'dw' ? 'Reynolds no.' : 'Pressure loss', value: i.method === 'dw' ? f(dw.Re, 3) : fx(toBar(total) * 100, 1), unit: i.method === 'dw' ? '' : 'kPa', sub: i.method === 'dw' ? `${dw.regime} · f ${fx(dw.f, 4)}` : `${fx(toBar(total) * 14.5038, 2)} psi` },
    ],
    checks: [],
    sheet: sheet('PIPE FRICTION LOSS', i.ref, [inRow('Flow rate', i.flow), ['Pipe', pipeText(i.pipe)], inRow('Pipe length', i.length), ['Method', i.method === 'dw' ? 'Darcy-Weisbach' : 'Hazen-Williams'], ...(K > 0 ? [['Sum of K (fittings)', String(K)]] : [])], steps),
  };
}
const Re2300 = (Re) => Re < 2300;

/* =========================================================== */
/* 5. PUMP POWER                                                */
/* =========================================================== */
export const powerDefaults = () => ({ ref: '', flow: val(5, 'L/s'), head: val(40, 'm'), sg: 1, pumpEff: 65, motorEff: 90, margin: 15, voltage: 400, pf: 0.85 });
export function computePower(i) {
  const Q = si(i.flow, 'flow');
  const H = si(i.head, 'head');
  const sg = Number(i.sg) || 1;
  const ep = (Number(i.pumpEff) || 1) / 100;
  const em = (Number(i.motorEff) || 1) / 100;
  const Ph = (1000 * sg * G * Q * H) / 1000;
  const P2 = Ph / ep;
  const req = P2 * (1 + (Number(i.margin) || 0) / 100);
  const motor = IEC_MOTORS.find((m) => m >= req - 1e-9) ?? Math.ceil(req);
  const P1 = P2 / em;
  const I = (P1 * 1000) / (Math.sqrt(3) * (Number(i.voltage) || 400) * (Number(i.pf) || 0.85));
  const steps = [
    { calc: 'Hydraulic power', formula: 'Ph = ρ·g·Q·H', value: fx(Ph, 3), unit: 'kW', ref: `ρ = ${fx(1000 * sg, 0)} kg/m³ (SG ${sg}), g = 9.807 m/s²` },
    { calc: 'Pump shaft power', formula: 'P2 = Ph / ηp', value: fx(P2, 3), unit: 'kW', ref: `ηp = ${i.pumpEff}% – from pump curve at duty point` },
    { calc: 'Motor rating required', formula: `P2 × (1 + ${i.margin}%)`, value: fx(req, 3), unit: 'kW', ref: 'Safety margin for curve tolerance / run-out' },
    { calc: 'Selected motor', formula: 'Next IEC standard ≥ required', value: String(motor), unit: 'kW', ref: `= ${fx(motor / 0.7457, 1)} HP – IEC 60072 standard ratings`, bold: true },
    { calc: 'Electrical input power', formula: 'P1 = P2 / ηm', value: fx(P1, 3), unit: 'kW', ref: `ηm = ${i.motorEff}% – motor nameplate (IE class)` },
    { calc: 'Running current (3-phase)', formula: 'I = P1 / (√3·V·PF)', value: fx(I, 1), unit: 'A', ref: `${i.voltage} V, PF ${i.pf}` },
    { calc: 'Wire-to-water efficiency', formula: 'Ph / P1', value: fx((Ph / P1) * 100, 1), unit: '%', ref: 'Overall pump-set efficiency' },
  ];
  return {
    kpis: [
      { label: 'Shaft power', value: fx(P2, 2), unit: 'kW', sub: `${fx(P2 / 0.7457, 2)} HP · hydraulic ${fx(Ph, 2)} kW` },
      { label: 'Selected motor', value: String(motor), unit: 'kW', sub: `${fx(motor / 0.7457, 1)} HP`, tone: 'ok' },
      { label: 'Input power', value: fx(P1, 2), unit: 'kW', sub: `Wire-to-water ${fx((Ph / P1) * 100, 1)}%` },
      { label: 'Current', value: fx(I, 1), unit: 'A', sub: `${i.voltage} V 3-ph, PF ${i.pf}` },
    ],
    checks: [],
    sheet: sheet('PUMP POWER & MOTOR SIZING', i.ref, [inRow('Flow rate', i.flow), inRow('Pump head', i.head), ['Specific gravity', String(sg)], ['Pump / motor efficiency', `${i.pumpEff}% / ${i.motorEff}%`], ['Motor margin', `${i.margin}%`]], steps),
  };
}

/* =========================================================== */
/* 6. AFFINITY LAWS                                             */
/* =========================================================== */
export const affinityDefaults = () => ({ ref: '', mode: 'speed', flow: val(5, 'L/s'), head: val(40, 'm'), power: val(3, 'kW'), x1: 2900, x2: 2400 });
export function computeAffinity(i) {
  const r = (Number(i.x2) || 0) / (Number(i.x1) || 1);
  const Q1 = si(i.flow, 'flow');
  const H1 = si(i.head, 'head');
  const P1 = si(i.power, 'power');
  const Q2 = Q1 * r;
  const H2 = H1 * r * r;
  const P2 = P1 * r ** 3;
  const what = i.mode === 'speed' ? 'speed (rpm)' : 'impeller diameter (mm)';
  const steps = [
    { calc: 'Ratio', formula: i.mode === 'speed' ? 'r = N2 / N1' : 'r = D2 / D1', value: fx(r, 4), unit: '–', ref: `${what}: ${i.x1} → ${i.x2}` },
    { calc: 'New flow', formula: 'Q2 = Q1 · r', value: fx(Q2 * 1000, 2), unit: 'L/s', ref: `= ${fx(Q2 * 3600, 2)} m³/h – affinity law (flow ∝ ${i.mode === 'speed' ? 'N' : 'D'})`, bold: true },
    { calc: 'New head', formula: 'H2 = H1 · r²', value: fx(H2, 2), unit: 'm', ref: `= ${fx(H2 / 10.197, 2)} bar – affinity law (head ∝ ${i.mode === 'speed' ? 'N²' : 'D²'})`, bold: true },
    { calc: 'New power', formula: 'P2 = P1 · r³', value: fx(P2 / 1000, 2), unit: 'kW', ref: `affinity law (power ∝ ${i.mode === 'speed' ? 'N³' : 'D³'})`, bold: true },
    { calc: 'Power saving', formula: '1 − r³', value: fx((1 - r ** 3) * 100, 1), unit: '%', ref: 'Energy saving at reduced speed (VFD) – ideal, losses excluded' },
  ];
  return {
    kpis: [
      { label: 'New flow', value: fx(Q2 * 1000, 2), unit: 'L/s', sub: `${fx(Q2 * 3600, 1)} m³/h` },
      { label: 'New head', value: fx(H2, 2), unit: 'm', sub: `${fx(H2 / 10.197, 2)} bar` },
      { label: 'New power', value: fx(P2 / 1000, 2), unit: 'kW', sub: `${fx((P2 / 1000) / 0.7457, 2)} HP` },
      { label: 'Power change', value: fx((r ** 3 - 1) * 100, 1), unit: '%', sub: `ratio r = ${fx(r, 3)}`, tone: r <= 1 ? 'ok' : 'bad' },
    ],
    checks: i.mode === 'diameter' && (r < 0.75 || r > 1) ? [{ ok: false, text: 'Impeller trimming laws are reliable only for trims down to about 75–80% of full diameter.' }] : [],
    sheet: sheet(`PUMP AFFINITY LAWS – ${i.mode === 'speed' ? 'SPEED CHANGE' : 'IMPELLER TRIM'}`, i.ref, [inRow('Flow Q1', i.flow), inRow('Head H1', i.head), inRow('Power P1', i.power), [i.mode === 'speed' ? 'Speed N1 → N2 (rpm)' : 'Impeller D1 → D2 (mm)', `${i.x1} → ${i.x2}`]], steps),
  };
}

/* =========================================================== */
/* 7. NPSH                                                      */
/* =========================================================== */
export const npshDefaults = () => ({ ref: '', temp: val(40, '°C'), altitude: val(10, 'm'), staticHead: val(0.5, 'm'), suctionLoss: val(0.6, 'm'), npshr: val(3, 'm'), margin: val(0.5, 'm') });
export function computeNpsh(i) {
  const tC = si(i.temp, 'temperature') - 273.15;
  const rho = waterDensity(tC);
  const patm = atmosphericKPa(si(i.altitude, 'length'));
  const pv = vapourPressureKPa(tC);
  const Ha = (patm * 1000) / (rho * G);
  const Hv = (pv * 1000) / (rho * G);
  const hs = si(i.staticHead, 'head');
  const hl = si(i.suctionLoss, 'head');
  const npsha = Ha + hs - hl - Hv;
  const req = si(i.npshr, 'head') + si(i.margin, 'head');
  const ok = npsha >= req;
  const steps = [
    { calc: 'Atmospheric pressure', formula: 'Pa = 101.325·(1 − 2.25577e-5·z)^5.25588', value: fx(patm, 2), unit: 'kPa', ref: `ISA barometric formula at ${i.altitude.v} ${i.altitude.u}` },
    { calc: 'Atmospheric head', formula: 'Ha = Pa / (ρ·g)', value: fx(Ha, 2), unit: 'm', ref: `ρ = ${fx(rho, 1)} kg/m³ at ${fx(tC, 1)} °C` },
    { calc: 'Vapour pressure head', formula: 'Hvp = Pv / (ρ·g)', value: fx(Hv, 2), unit: 'm', ref: `Pv = ${fx(pv, 2)} kPa (Antoine equation)` },
    { calc: 'Static suction head', formula: '+ flooded / − lift', value: fx(hs, 2), unit: 'm', ref: 'Liquid level minus pump centre-line' },
    { calc: 'Suction line losses', formula: 'Input', value: fx(hl, 2), unit: 'm', ref: 'Friction + fittings in suction pipe' },
    { calc: 'NPSH available', formula: 'NPSHa = Ha + hs − hf − Hvp', value: fx(npsha, 2), unit: 'm', ref: 'Hydraulic Institute ANSI/HI 9.6.1', bold: true },
    { calc: 'NPSH required + margin', formula: 'NPSHr + margin', value: fx(req, 2), unit: 'm', ref: 'NPSHr from pump curve at duty flow' },
    { calc: 'Check', formula: 'NPSHa ≥ NPSHr + margin', value: ok ? 'PASS' : 'FAIL', unit: '', ref: ok ? 'No cavitation expected' : 'Cavitation risk – raise suction level / reduce losses / lower speed', bold: true },
  ];
  return {
    kpis: [
      { label: 'NPSH available', value: fx(npsha, 2), unit: 'm', sub: `${fx(npsha / 0.3048, 2)} ft`, tone: ok ? 'ok' : 'bad' },
      { label: 'Required + margin', value: fx(req, 2), unit: 'm', sub: ok ? 'PASS' : 'FAIL', tone: ok ? 'ok' : 'bad' },
      { label: 'Atmospheric head', value: fx(Ha, 2), unit: 'm', sub: `${fx(patm, 1)} kPa` },
      { label: 'Vapour head', value: fx(Hv, 2), unit: 'm', sub: `${fx(pv, 2)} kPa at ${fx(tC, 0)} °C` },
    ],
    checks: [{ ok, text: ok ? `NPSHa exceeds NPSHr + margin by ${fx(npsha - req, 2)} m` : `NPSHa is ${fx(req - npsha, 2)} m short – cavitation risk` }],
    sheet: sheet('NPSH AVAILABLE CHECK', i.ref, [inRow('Water temperature', i.temp), inRow('Site altitude', i.altitude), inRow('Static suction head', i.staticHead), inRow('Suction losses', i.suctionLoss), inRow('NPSHr', i.npshr), inRow('Margin', i.margin)], steps),
  };
}

/* =========================================================== */
/* 8. TANK & SUMP                                               */
/* =========================================================== */
export const tankDefaults = () => ({ ref: '', mode: 'tank', shape: 'rect', L: val(4, 'm'), W: val(3, 'm'), D: val(2.5, 'm'), H: val(2, 'm'), eff: 80, time: val(2, 'h'), pumpFlow: val(6, 'L/s'), starts: 10, inflow: val(2, 'L/s') });
export function computeTank(i) {
  if (i.mode === 'sump') {
    const Qp = si(i.pumpFlow, 'flow');
    const N = Math.max(Number(i.starts) || 1, 1);
    const Tmin = 3600 / N;
    const Veff = (Qp * Tmin) / 4;
    const Qin = si(i.inflow, 'flow');
    const ok = Qin < Qp;
    const tFill = Qin > 0 ? Veff / Qin : Infinity;
    const tEmpty = ok ? Veff / (Qp - Qin) : Infinity;
    const cycle = tFill + tEmpty;
    const startsAct = Number.isFinite(cycle) ? 3600 / cycle : 0;
    const steps = [
      { calc: 'Minimum cycle time', formula: 'Tmin = 3600 / N', value: fx(Tmin, 0), unit: 's', ref: `${N} starts/h – pump / motor manufacturer limit` },
      { calc: 'Minimum effective volume', formula: 'Veff = Qp · Tmin / 4', value: fx(Veff, 3), unit: 'm³', ref: `= ${fx(Veff * 1000, 0)} L – worst case when inflow = ½ pump flow (HI 9.8)`, bold: true },
      { calc: 'Fill time at inflow', formula: 'Veff / Qin', value: fx(tFill / 60, 1), unit: 'min', ref: `Inflow ${fx(Qin * 1000, 2)} L/s` },
      { calc: 'Pump-down time', formula: 'Veff / (Qp − Qin)', value: ok ? fx(tEmpty / 60, 1) : '∞', unit: 'min', ref: ok ? 'Net emptying rate' : 'Inflow ≥ pump flow – pump cannot empty the pit' },
      { calc: 'Starts per hour at this inflow', formula: '3600 / (fill + pump-down)', value: fx(startsAct, 1), unit: 'starts/h', ref: `Limit ${N} starts/h` },
    ];
    return {
      kpis: [
        { label: 'Min. effective volume', value: fx(Veff * 1000, 0), unit: 'L', sub: `${fx(Veff, 3)} m³ · ${fx(Veff / 0.003785411784, 0)} US gal`, tone: 'ok' },
        { label: 'Cycle time', value: Number.isFinite(cycle) ? fx(cycle / 60, 1) : '∞', unit: 'min', sub: `${fx(startsAct, 1)} starts/h` },
        { label: 'Fill time', value: Number.isFinite(tFill) ? fx(tFill / 60, 1) : '∞', unit: 'min', sub: 'at given inflow' },
        { label: 'Pump-down', value: ok ? fx(tEmpty / 60, 1) : '∞', unit: 'min', sub: ok ? 'net emptying' : 'inflow ≥ pump flow', tone: ok ? undefined : 'bad' },
      ],
      checks: [{ ok, text: ok ? `Pump flow exceeds inflow – cycle ${fx(cycle / 60, 1)} min` : 'Inflow equals or exceeds pump flow – increase pump capacity' }],
      sheet: sheet('SUMP EFFECTIVE VOLUME & CYCLE TIME', i.ref, [inRow('Pump flow', i.pumpFlow), ['Max. starts per hour', String(N)], inRow('Inflow', i.inflow)], steps),
    };
  }
  const H = si(i.H, 'length');
  const area = i.shape === 'cyl' ? (Math.PI * si(i.D, 'length') ** 2) / 4 : si(i.L, 'length') * si(i.W, 'length');
  const V = area * H;
  const EV = (V * (Number(i.eff) || 0)) / 100;
  const t = si(i.time, 'time');
  const Q = t > 0 ? EV / t : 0;
  const steps = [
    { calc: 'Plan area', formula: i.shape === 'cyl' ? 'A = π·D² / 4' : 'A = L × W', value: fx(area, 3), unit: 'm²', ref: 'Internal tank dimensions' },
    { calc: 'Total volume', formula: 'V = A × H', value: fx(V, 3), unit: 'm³', ref: `= ${fx(V * 1000, 0)} L = ${fx(V / 0.004546, 0)} IG` },
    { calc: 'Effective volume', formula: `V × ${i.eff}%`, value: fx(EV, 3), unit: 'm³', ref: 'Usable volume (dead volume & freeboard excluded)' },
    { calc: 'Required flow', formula: 'Q = EV / t', value: fx(Q * 1000, 2), unit: 'L/s', ref: `= ${fx(Q * 3600, 2)} m³/h = ${fx(Q / 6.30901964e-5, 1)} US gpm`, bold: true },
  ];
  return {
    kpis: [
      { label: 'Total volume', value: fx(V, 2), unit: 'm³', sub: `${fx(V * 1000, 0)} L · ${fx(V / 0.004546, 0)} IG` },
      { label: 'Effective volume', value: fx(EV, 2), unit: 'm³', sub: `${i.eff}% of total` },
      { label: 'Required flow', value: fx(Q * 1000, 2), unit: 'L/s', sub: `${fx(Q * 3600, 2)} m³/h`, tone: 'ok' },
      { label: 'Flow', value: fx(Q / 6.30901964e-5, 1), unit: 'US gpm', sub: `${fx(Q / 7.57681667e-5, 1)} UK gpm` },
    ],
    checks: [],
    sheet: sheet('TANK VOLUME & FILLING FLOW', i.ref, i.shape === 'cyl' ? [inRow('Diameter', i.D), inRow('Water depth', i.H), ['Effective factor', `${i.eff}%`], inRow('Filling time', i.time)] : [inRow('Length', i.L), inRow('Width', i.W), inRow('Water depth', i.H), ['Effective factor', `${i.eff}%`], inRow('Filling time', i.time)], steps),
  };
}

export const TOOLS = {
  converter: { key: 'converter', label: 'Unit Converter', defaults: converterDefaults, compute: computeConverter },
  velocity: { key: 'velocity', label: 'Velocity', defaults: velocityDefaults, compute: computeVelocity },
  sizer: { key: 'sizer', label: 'Pipe Sizer', defaults: sizerDefaults, compute: computeSizer },
  friction: { key: 'friction', label: 'Friction Loss', defaults: frictionDefaults, compute: computeFriction },
  power: { key: 'power', label: 'Pump Power', defaults: powerDefaults, compute: computePower },
  affinity: { key: 'affinity', label: 'Affinity Laws', defaults: affinityDefaults, compute: computeAffinity },
  npsh: { key: 'npsh', label: 'NPSH', defaults: npshDefaults, compute: computeNpsh },
  tank: { key: 'tank', label: 'Tank & Sump', defaults: tankDefaults, compute: computeTank },
};
export { MATERIAL_NAMES, PIPE_SIZES_IN, sizeLabel, both };
