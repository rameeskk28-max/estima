// Reference data & formulas used by the calculation sheets (same method as the
// Greenland Excel calculation templates: Equivalent Length Method – Hazen-Williams).

/* ------------------------------------------------------------------ */
/* Unit constants (with the reference quoted on the calculation sheet) */
/* ------------------------------------------------------------------ */
export const PSI_PER_BAR = 14.5038; // 1 bar = 14.5038 psi
export const M_PER_BAR = 10.197; // 1 bar = 10.197 m water column (ρ = 1000 kg/m³, g = 9.80665 m/s²)
export const FT_PER_M = 3.28084;
export const GPM_PER_LPS = 15.8503; // 1 L/s = 15.8503 US gpm
export const LPS_PER_GPM = 0.06309;
export const KW_PER_TR = 3.517;

/* ------------------------------------------------------------------ */
/* Nominal pipe sizes (inches) & materials                             */
/* ------------------------------------------------------------------ */
export const PIPE_SIZES_IN = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12];

export const sizeLabel = (s) => {
  const map = { 0.5: '½"', 0.75: '¾"', 1: '1"', 1.25: '1¼"', 1.5: '1½"', 2: '2"', 2.5: '2½"', 3: '3"', 4: '4"', 5: '5"', 6: '6"', 8: '8"', 10: '10"', 12: '12"' };
  return map[s] || `${s}"`;
};
const DN = { 0.5: 15, 0.75: 20, 1: 25, 1.25: 32, 1.5: 40, 2: 50, 2.5: 65, 3: 80, 4: 100, 5: 125, 6: 150, 8: 200, 10: 250, 12: 300 };
export const dnOf = (s) => DN[s];

// Steel Schedule 40 internal diameters (in) – ASME B36.10M
const SCH40_ID = { 0.5: 0.622, 0.75: 0.824, 1: 1.049, 1.25: 1.38, 1.5: 1.61, 2: 2.067, 2.5: 2.469, 3: 3.068, 4: 4.026, 5: 5.047, 6: 6.065, 8: 7.981, 10: 10.02, 12: 11.938 };
// Stainless Sch 10S internal diameters (in) – ASME B36.19M
const SCH10S_ID = { 0.5: 0.674, 0.75: 0.884, 1: 1.097, 1.25: 1.442, 1.5: 1.682, 2: 2.157, 2.5: 2.635, 3: 3.26, 4: 4.26, 5: 5.295, 6: 6.357, 8: 8.329, 10: 10.42, 12: 12.39 };
// Thermoplastic outside diameters (mm) used for each nominal size
const PLASTIC_OD = { 0.5: 20, 0.75: 25, 1: 32, 1.25: 40, 1.5: 50, 2: 63, 2.5: 75, 3: 90, 4: 110, 5: 140, 6: 160, 8: 225, 10: 280, 12: 315 };
const plasticId = (sdr) => (s) => (PLASTIC_OD[s] * (1 - 2 / sdr)) / 25.4;

export const MATERIALS = {
  'PPR / uPVC': { C: 150, id: plasticId(6), idBasis: 'PPR PN20 (SDR 6) – DIN 8077', cBasis: 'C = 150 for PPR / uPVC (smooth thermoplastic)' },
  PE: { C: 140, id: plasticId(11), idBasis: 'HDPE PE100 PN16 (SDR 11) – ISO 4427', cBasis: 'C = 140 for PE' },
  'GI (Galvanised Steel)': { C: 120, id: (s) => SCH40_ID[s], idBasis: 'Sch 40 – ASME B36.10M', cBasis: 'C = 120 for galvanised steel' },
  'Black Steel': { C: 120, id: (s) => SCH40_ID[s], idBasis: 'Sch 40 – ASME B36.10M', cBasis: 'C = 120 for carbon steel' },
  'Stainless Steel': { C: 140, id: (s) => SCH10S_ID[s], idBasis: 'Sch 10S – ASME B36.19M', cBasis: 'C = 140 for stainless steel' },
  Copper: { C: 140, id: (s) => SCH40_ID[s] * 0.98, idBasis: 'Copper Type L (approx.)', cBasis: 'C = 140 for copper' },
};
export const MATERIAL_NAMES = Object.keys(MATERIALS);

/* ------------------------------------------------------------------ */
/* Equivalent lengths of fittings (ft)                                 */
/* ½"–3": IPC 2009 Table E103.3(5); larger sizes: Crane TP-410 L/D.    */
/* ------------------------------------------------------------------ */
const IPC_SIZES = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
const IPC_TABLE = {
  '45° Elbow': [1.2, 1.5, 1.8, 2.4, 3, 4, 5, 6],
  '90° Elbow': [2, 2.5, 3, 4, 5, 7, 8, 10],
  'Tee – Run': [0.6, 0.8, 0.9, 1.2, 1.5, 2, 2.5, 3],
  'Tee – Branch': [3, 4, 5, 6, 7, 10, 12, 15],
  'Gate Valve': [0.4, 0.5, 0.6, 0.8, 1, 1.3, 1.6, 2],
  'Balancing Valve': [0.8, 1.1, 1.5, 1.9, 2.2, 3, 3.7, 4.5],
  'Plug-type Cock': [0.8, 1.1, 1.5, 1.9, 2.2, 3, 3.7, 4.5],
  'Check Valve, Swing': [5.6, 8.4, 11.2, 14, 16.8, 22.4, 28, 33.6],
  'Globe Valve': [15, 20, 25, 35, 45, 55, 65, 80],
  'Angle Valve': [8, 12, 15, 18, 22, 28, 34, 40],
};
// Crane Technical Paper 410 – resistance expressed as equivalent length ratio L/D
const CRANE_LD = {
  '45° Elbow': 16,
  '90° Elbow': 30,
  'Tee – Run': 20,
  'Tee – Branch': 60,
  'Gate Valve': 8,
  'Balancing Valve': 18,
  'Plug-type Cock': 18,
  'Check Valve, Swing': 100,
  'Globe Valve': 340,
  'Angle Valve': 150,
  'Butterfly Valve': 45,
  'Ball Valve': 3,
  'Foot Valve': 420,
};

export const FITTING_ITEMS = [
  'Straight Pipe',
  '90° Elbow',
  '45° Elbow',
  'Tee – Run',
  'Tee – Branch',
  'Gate Valve',
  'Butterfly Valve',
  'Ball Valve',
  'Check Valve, Swing',
  'Balancing Valve',
  'Plug-type Cock',
  'Globe Valve',
  'Angle Valve',
  'Foot Valve',
  'Strainer',
  'Y-Strainer',
  'Flexible Connector',
  'Reducer',
  'Expansion Joint',
  'Air Valve',
  'Custom / Manual',
];

/**
 * Equivalent length (ft) of one fitting, with its reference.
 * @returns {{ft: number|null, source: string}}
 */
export function equivalentLength(item, sizeIn) {
  if (item === 'Straight Pipe') return { ft: null, source: 'Measured pipe length × 3.28084' };
  const i = IPC_SIZES.indexOf(Number(sizeIn));
  if (IPC_TABLE[item] && i >= 0) return { ft: IPC_TABLE[item][i], source: 'IPC 2009 Table E103.3(5)' };
  if (CRANE_LD[item] && SCH40_ID[sizeIn]) {
    const ft = (CRANE_LD[item] * SCH40_ID[sizeIn]) / 12;
    return { ft: Math.round(ft * 10) / 10, source: `Crane TP-410, Le = L/D (${CRANE_LD[item]}) × D` };
  }
  return { ft: null, source: 'Manual – manufacturer data' };
}

/* ------------------------------------------------------------------ */
/* Hazen-Williams (IPC Appendix E / ASPE), imperial form               */
/* ------------------------------------------------------------------ */
/** Friction loss in psi per 100 ft:  P = 4.52 · Q^1.852 / (C^1.852 · d^4.87) × 100  (Q gpm, d in) */
export function hwPsiPer100ft(qLps, C, idIn) {
  const Q = qLps * GPM_PER_LPS;
  if (!(Q > 0 && C > 0 && idIn > 0)) return 0;
  return ((4.52 * Math.pow(Q, 1.852)) / (Math.pow(C, 1.852) * Math.pow(idIn, 4.87))) * 100;
}

/** Velocity (m/s) = 4Q / (π d²) */
export function velocityMs(qLps, idIn) {
  const d = idIn * 0.0254;
  if (!(d > 0)) return 0;
  return (4 * (qLps / 1000)) / (Math.PI * d * d);
}

/* ------------------------------------------------------------------ */
/* Water supply fixture units & IPC demand                             */
/* ------------------------------------------------------------------ */
export const FIXTURES = [
  { name: 'Water Closet – Private / Flush Tank', wsfu: 2.5 },
  { name: 'Water Closet – Public / Flush Valve', wsfu: 5 },
  { name: 'Wash Basin / Lavatory', wsfu: 1 },
  { name: 'Ablution Spray / Hand Spray', wsfu: 1 },
  { name: 'Urinal – Private / Flush Tank', wsfu: 2 },
  { name: 'Urinal – Public / Flush Valve', wsfu: 5 },
  { name: 'Bidet', wsfu: 2.5 },
  { name: 'Bathtub', wsfu: 2 },
  { name: 'Shower', wsfu: 2 },
  { name: 'Kitchen Sink', wsfu: 2 },
  { name: 'Laundry Tub', wsfu: 2 },
  { name: 'Dishwasher', wsfu: 1.5 },
  { name: 'Washing Machine', wsfu: 2 },
  { name: 'Hose Bibb / Bib Tap', wsfu: 2.5 },
  { name: 'Custom fixture', wsfu: 1 },
];

// IPC 2009 Table E103.3(3) – Table for estimating demand (WSFU → gpm)
const DEMAND_TANK = [[1,3],[2,5],[3,6.5],[4,8],[5,9.4],[6,10.7],[7,11.8],[8,12.8],[9,13.7],[10,14.6],[11,15.4],[12,16],[13,16.5],[14,17],[15,17.5],[16,18],[17,18.4],[18,18.8],[19,19.2],[20,19.6],[25,21.5],[30,23.3],[35,24.9],[40,26.3],[45,27.7],[50,29.1],[60,32],[70,35],[80,38],[90,41],[100,43.5],[120,48],[140,52.5],[160,57],[180,61],[200,65],[225,70],[250,75],[275,80],[300,85],[400,105],[500,124],[750,170],[1000,208],[1250,239],[1500,269],[1750,297],[2000,325],[2500,380],[3000,433],[4000,525],[5000,593]];
const DEMAND_VALVE = [[5,15],[6,17.4],[7,19.8],[8,22.2],[9,24.6],[10,27],[11,27.8],[12,28.6],[13,29.4],[14,30.2],[15,31],[16,31.8],[17,32.6],[18,33.4],[19,34.2],[20,35],[25,38],[30,42],[35,44],[40,46],[45,48],[50,50],[60,54],[70,58],[80,61.2],[90,64.3],[100,67.5],[120,73],[140,77],[160,81],[180,85.5],[200,90],[225,95.5],[250,101],[275,104.5],[300,108],[400,127],[500,140],[750,177],[1000,208],[1250,239],[1500,269],[1750,297],[2000,325],[2500,380],[3000,433],[4000,525],[5000,593]];

/** Linear interpolation in IPC Table E103.3(3). */
export function ipcDemandGpm(wsfu, system = 'tank') {
  const t = system === 'valve' ? DEMAND_VALVE : DEMAND_TANK;
  if (!(wsfu > 0)) return { gpm: 0, lo: null, hi: null };
  if (wsfu <= t[0][0]) return { gpm: (t[0][1] * wsfu) / t[0][0], lo: t[0], hi: t[0] };
  for (let k = 1; k < t.length; k++) {
    if (wsfu <= t[k][0]) {
      const [x0, y0] = t[k - 1];
      const [x1, y1] = t[k];
      return { gpm: y0 + ((wsfu - x0) * (y1 - y0)) / (x1 - x0), lo: t[k - 1], hi: t[k] };
    }
  }
  const last = t[t.length - 1];
  return { gpm: last[1], lo: last, hi: last };
}

export const fmtN = (n, dp = 2) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? '–' : Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }));
