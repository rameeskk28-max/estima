// Unit system for the Engineering Tools – every quantity converts through an SI base unit.

export const QUANTITIES = {
  flow: {
    label: 'Flow rate',
    base: 'm³/s',
    units: { 'L/s': 1e-3, 'm³/h': 1 / 3600, 'L/min': 1 / 60000, 'm³/s': 1, 'US gpm': 6.30901964e-5, 'UK gpm': 7.57681667e-5, 'ft³/s': 0.0283168466, 'ft³/min': 0.000471947443 },
  },
  pressure: {
    label: 'Pressure / head (water)',
    base: 'Pa',
    units: { bar: 1e5, kPa: 1e3, 'm H₂O': 9806.65, psi: 6894.75729, 'ft H₂O': 2989.06692, Pa: 1, MPa: 1e6, mbar: 100, 'kg/cm²': 98066.5, atm: 101325, mmHg: 133.322368, 'in H₂O': 249.08891 },
  },
  length: {
    label: 'Length',
    base: 'm',
    units: { m: 1, mm: 1e-3, cm: 1e-2, km: 1e3, in: 0.0254, ft: 0.3048, yd: 0.9144, mile: 1609.344 },
  },
  diameter: { label: 'Diameter', base: 'm', units: { mm: 1e-3, in: 0.0254, m: 1 } },
  head: { label: 'Head', base: 'm', units: { m: 1, ft: 0.3048 } },
  velocity: { label: 'Velocity', base: 'm/s', units: { 'm/s': 1, 'ft/s': 0.3048, 'km/h': 1 / 3.6, 'ft/min': 0.00508 } },
  power: {
    label: 'Power',
    base: 'W',
    units: { kW: 1e3, W: 1, HP: 745.699872, 'PS (metric hp)': 735.49875, 'BTU/h': 0.29307107, TR: 3516.85284, 'kcal/h': 1.163 },
  },
  volume: { label: 'Volume', base: 'm³', units: { 'm³': 1, L: 1e-3, 'US gal': 0.003785411784, 'UK gal': 0.00454609, 'ft³': 0.0283168466 } },
  area: { label: 'Area', base: 'm²', units: { 'm²': 1, 'mm²': 1e-6, 'cm²': 1e-4, 'ft²': 0.09290304, 'in²': 0.00064516 } },
  time: { label: 'Time', base: 's', units: { s: 1, min: 60, h: 3600 } },
  temperature: { label: 'Temperature', base: 'K', units: { '°C': null, '°F': null, K: null } },
  frictionRate: { label: 'Friction rate', base: 'Pa/m', units: { 'Pa/m': 1, 'm/100 m': 98.0665, 'ft/100 ft': 98.0665, 'psi/100 ft': 226.206 } },
};

/** Value in SI base units. */
export function toSI(v, unit, q) {
  const n = Number(v);
  if (!Number.isFinite(n)) return NaN;
  if (q === 'temperature') return unit === '°C' ? n + 273.15 : unit === '°F' ? ((n - 32) * 5) / 9 + 273.15 : n;
  return n * QUANTITIES[q].units[unit];
}

export function fromSI(v, unit, q) {
  if (!Number.isFinite(v)) return NaN;
  if (q === 'temperature') return unit === '°C' ? v - 273.15 : unit === '°F' ? ((v - 273.15) * 9) / 5 + 32 : v;
  return v / QUANTITIES[q].units[unit];
}

export const convert = (v, from, to, q) => fromSI(toSI(v, from, q), to, q);

/** Format with sensible significant figures. */
export function fmtSmart(n, sig = 4) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '–';
  if (n === 0) return '0';
  const a = Math.abs(n);
  if (a >= 1e7 || a < 1e-4) return n.toExponential(sig - 1);
  const dp = Math.max(0, sig - 1 - Math.floor(Math.log10(a)));
  return n.toLocaleString('en-US', { maximumFractionDigits: Math.min(dp, 6) });
}

/** Input value object helpers: { v, u } */
export const val = (v, u) => ({ v, u });
export const si = (x, q) => toSI(x?.v, x?.u, q);
