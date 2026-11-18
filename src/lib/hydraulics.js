// Core hydraulic engineering library (SI / metric units).
// All functions are pure so they can be unit-tested in Node and reused by the PDF engine.

export const G = 9.81; // m/s²
export const RHO = 1000; // kg/m³ (design density for cold water)
export const M_PER_BAR = 100000 / (RHO * G); // 10.194 m per bar
export const KW_PER_TR = 3.517; // 1 refrigeration ton = 3.517 kW

/* ------------------------------------------------------------------ */
/* Unit conversion                                                     */
/* ------------------------------------------------------------------ */

export const FLOW_UNITS = {
  'L/s': 1,
  'm³/h': 1 / 3.6,
  'L/min': 1 / 60,
};
export const toLps = (v, unit) => (Number(v) || 0) * (FLOW_UNITS[unit] ?? 1);
export const fromLps = (lps, unit) => lps / (FLOW_UNITS[unit] ?? 1);
export const lpsToM3h = (lps) => lps * 3.6;

export const PRESSURE_UNITS = {
  m: 1,
  bar: M_PER_BAR,
  kPa: M_PER_BAR / 100,
};
export const toMeters = (v, unit) => (Number(v) || 0) * (PRESSURE_UNITS[unit] ?? 1);
export const fromMeters = (m, unit) => m / (PRESSURE_UNITS[unit] ?? 1);
export const mToBar = (m) => m / M_PER_BAR;
export const mToKPa = (m) => (m / M_PER_BAR) * 100;

export const VOLUME_UNITS = { 'm³': 1, L: 0.001 };
export const toM3 = (v, unit) => (Number(v) || 0) * (VOLUME_UNITS[unit] ?? 1);

export const POWER_UNITS = { kW: 1, TR: KW_PER_TR };
export const toKW = (v, unit) => (Number(v) || 0) * (POWER_UNITS[unit] ?? 1);

export const convertUnit = (value, from, to, table) => {
  const n = Number(value);
  if (!Number.isFinite(n) || from === to) return value;
  return (n * table[from]) / table[to];
};

/* ------------------------------------------------------------------ */
/* Number formatting                                                   */
/* ------------------------------------------------------------------ */

export function fmt(n, dp = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '–';
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/* ------------------------------------------------------------------ */
/* Pipe materials & internal diameters                                 */
/* ------------------------------------------------------------------ */

export const DN_LIST = [20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300];

// Steel Sch 40 internal diameters (mm)
const STEEL_SCH40_ID = { 20: 20.9, 25: 26.6, 32: 35.1, 40: 40.9, 50: 52.5, 65: 62.7, 80: 77.9, 100: 102.3, 125: 128.2, 150: 154.1, 200: 202.7, 250: 254.5, 300: 303.2 };
// Stainless steel Sch 10S internal diameters (mm)
const SS_SCH10S_ID = { 20: 22.5, 25: 27.9, 32: 36.6, 40: 42.8, 50: 54.8, 65: 66.9, 80: 82.8, 100: 108.2, 125: 134.5, 150: 161.5, 200: 211.6, 250: 264.7, 300: 314.8 };
// Thermoplastic outside diameters (mm) commonly paired with DN
const PLASTIC_OD = { 20: 25, 25: 32, 32: 40, 40: 50, 50: 63, 65: 75, 80: 90, 100: 110, 125: 140, 150: 160, 200: 225, 250: 280, 300: 315 };

export const PIPE_MATERIALS = {
  PPR: { label: 'PPR (PN20, SDR 6)', C: 150, idFor: (dn) => PLASTIC_OD[dn] * (1 - 2 / 6), odFor: (dn) => PLASTIC_OD[dn] },
  HDPE: { label: 'HDPE (PE100 PN16, SDR 11)', C: 150, idFor: (dn) => PLASTIC_OD[dn] * (1 - 2 / 11), odFor: (dn) => PLASTIC_OD[dn] },
  GI: { label: 'Galvanised Iron (Sch 40)', C: 120, idFor: (dn) => STEEL_SCH40_ID[dn] },
  SS: { label: 'Stainless Steel (Sch 10S)', C: 140, idFor: (dn) => SS_SCH10S_ID[dn] },
  MS: { label: 'Black / Carbon Steel (Sch 40)', C: 120, idFor: (dn) => STEEL_SCH40_ID[dn] },
  CU: { label: 'Copper (Type L)', C: 140, idFor: (dn) => STEEL_SCH40_ID[dn] * 0.98 },
};
export const WATER_MATERIALS = ['PPR', 'HDPE', 'GI', 'SS'];
export const CHW_MATERIALS = ['MS', 'SS', 'CU', 'HDPE'];

export function pipeLabel(dn, material) {
  const m = PIPE_MATERIALS[material];
  if (m?.odFor) return `DN${dn} (Ø${m.odFor(dn)} mm OD)`;
  return `DN${dn}`;
}

/* ------------------------------------------------------------------ */
/* Fittings – resistance coefficients (K) for minor losses             */
/* ------------------------------------------------------------------ */

export const FITTINGS = {
  gate: { label: 'Gate / Isolation Valve (open)', K: 0.2 },
  butterfly: { label: 'Butterfly Valve (open)', K: 0.5 },
  nrv: { label: 'Non-Return Valve (swing)', K: 2.0 },
  elbow90: { label: 'Elbow 90° (standard)', K: 0.75 },
  elbow45: { label: 'Elbow 45°', K: 0.4 },
  teeRun: { label: 'Tee – flow through run', K: 0.6 },
  teeBranch: { label: 'Tee – flow through branch', K: 1.8 },
  strainer: { label: 'Y-Strainer (clean)', K: 2.0 },
  footValve: { label: 'Foot Valve with Strainer', K: 15.0 },
  flexConn: { label: 'Flexible Connector', K: 0.3 },
  reducer: { label: 'Reducer / Enlarger', K: 0.5 },
  entrance: { label: 'Tank Entrance (sharp)', K: 0.5 },
  exit: { label: 'Pipe Exit / Discharge', K: 1.0 },
};

export const defaultFittings = (overrides = {}) =>
  Object.fromEntries(Object.keys(FITTINGS).map((k) => [k, overrides[k] ?? 0]));

/* ------------------------------------------------------------------ */
/* Hydraulic formulas                                                  */
/* ------------------------------------------------------------------ */

/** Velocity (m/s) for flow in L/s through internal diameter in mm. */
export function velocity(qLps, idMm) {
  const d = idMm / 1000;
  const A = (Math.PI * d * d) / 4;
  if (!(A > 0)) return 0;
  return qLps / 1000 / A;
}

/**
 * Hazen-Williams friction loss (SI):  hf = 10.67 · L · Q^1.852 / (C^1.852 · d^4.8704)
 * Q in m³/s, d in m, L in m. Returns head loss in metres.
 */
export function hazenWilliams(qLps, idMm, lengthM, C) {
  const Q = qLps / 1000;
  const d = idMm / 1000;
  if (!(Q > 0 && d > 0 && C > 0 && lengthM > 0)) return 0;
  return (10.67 * lengthM * Math.pow(Q, 1.852)) / (Math.pow(C, 1.852) * Math.pow(d, 4.8704));
}

/** Sum of K values from a { key: count } map. */
export function sumK(fittings, extraK = 0) {
  let k = 0;
  for (const [key, count] of Object.entries(fittings || {})) {
    if (FITTINGS[key]) k += (Number(count) || 0) * FITTINGS[key].K;
  }
  return k + (Number(extraK) || 0);
}

/** Minor (fitting) losses: hm = ΣK · v² / 2g */
export function minorLoss(K, v) {
  return (K * v * v) / (2 * G);
}

/** Complete pipe run evaluation used by all calculators. */
export function evaluatePipe({ qLps, material, dn, idMm, length, fittings, extraK = 0 }) {
  const mat = PIPE_MATERIALS[material] || PIPE_MATERIALS.GI;
  const id = Number(idMm) > 0 ? Number(idMm) : mat.idFor(dn);
  const v = velocity(qLps, id);
  const hf = hazenWilliams(qLps, id, Number(length) || 0, mat.C);
  const K = sumK(fittings, extraK);
  const hm = minorLoss(K, v);
  const unitLoss = Number(length) > 0 ? (hf / Number(length)) * 100 : 0; // m per 100 m
  return { C: mat.C, id, v, hf, K, hm, total: hf + hm, unitLoss, paPerM: (unitLoss / 100) * RHO * G, materialLabel: mat.label };
}

/** Recommended velocity band check */
export function velocityStatus(v, { min = 0.6, max = 2.5 } = {}) {
  if (v < min) return { ok: false, text: `Low velocity (< ${min} m/s) – consider smaller pipe` };
  if (v > max) return { ok: false, text: `High velocity (> ${max} m/s) – noise / erosion risk, upsize pipe` };
  return { ok: true, text: `Within recommended range (${min} – ${max} m/s)` };
}

/** Lists fittings with non-zero quantities for reports. */
export function fittingRows(fittings) {
  return Object.entries(fittings || {})
    .filter(([k, n]) => FITTINGS[k] && Number(n) > 0)
    .map(([k, n]) => ({ label: FITTINGS[k].label, qty: Number(n), K: FITTINGS[k].K, total: Number(n) * FITTINGS[k].K }));
}

/* ------------------------------------------------------------------ */
/* Power & motor selection                                             */
/* ------------------------------------------------------------------ */

export const IEC_MOTORS = [0.37, 0.55, 0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110, 132, 160, 200, 250, 315];

/** Hydraulic power (kW) = ρ·g·Q·H / 1000 */
export function hydraulicPower(qLps, headM, rho = RHO) {
  return (rho * G * (qLps / 1000) * headM) / 1000;
}

export function selectMotor(requiredKW) {
  return IEC_MOTORS.find((m) => m >= requiredKW - 1e-9) ?? Math.ceil(requiredKW);
}

export function motorSizing(qLps, headM, pumpEff, motorMarginPct) {
  const eta = Math.min(Math.max(Number(pumpEff) || 0, 1), 100) / 100;
  const Ph = hydraulicPower(qLps, headM);
  const Pshaft = Ph / eta;
  const Preq = Pshaft * (1 + (Number(motorMarginPct) || 0) / 100);
  return { Ph, eta, Pshaft, Preq, motor: selectMotor(Preq) };
}

/* ------------------------------------------------------------------ */
/* Water properties / NPSH                                             */
/* ------------------------------------------------------------------ */

/** Vapour pressure of water (kPa) – Antoine equation (1–100 °C). */
export function vapourPressureKPa(tC) {
  const mmHg = Math.pow(10, 8.07131 - 1730.63 / (233.426 + tC));
  return mmHg * 0.133322;
}

/** Density of water (kg/m³) as a function of temperature. */
export function waterDensity(tC) {
  return 1000 * (1 - ((tC + 288.9414) / (508929.2 * (tC + 68.12963))) * Math.pow(tC - 3.9863, 2));
}

/** Atmospheric pressure (kPa) at altitude (m) – ISA barometric formula. */
export function atmosphericKPa(altM) {
  return 101.325 * Math.pow(1 - 2.25577e-5 * altM, 5.25588);
}

export const kPaToHead = (kPa, rho = RHO) => (kPa * 1000) / (rho * G);

/* ------------------------------------------------------------------ */
/* Arrangement helpers                                                 */
/* ------------------------------------------------------------------ */

export const arrangementText = (duty, standby) => `${duty}D+${standby}S`;
