// PPR pipe sizes (DIN 8077 / EN ISO 15874): outside diameter → wall thickness per pressure class.
// Internal diameter = OD − 2 × wall. Nominal inch size is used only for fitting equivalent lengths.
export const PPR = {
  //  OD:   [nominal in, PN10 wall, PN16 wall, PN20 wall, PN25 wall]
  20: [0.5, 1.9, 2.3, 3.4, 4.1],
  25: [0.75, 2.3, 2.8, 4.2, 5.1],
  32: [1, 2.9, 3.6, 5.4, 6.5],
  40: [1.25, 3.7, 4.5, 6.7, 8.1],
  50: [1.5, 4.6, 5.6, 8.3, 10.1],
  63: [2, 5.8, 7.1, 10.5, 12.7],
  75: [2.5, 6.8, 8.4, 12.5, 15.1],
  90: [3, 8.2, 10.1, 15.0, 18.1],
  110: [4, 10.0, 12.3, 18.3, 22.1],
  125: [4, 11.4, 14.0, 20.8, 25.1],
  160: [6, 14.6, 17.9, 26.6, 32.1],
};
export const PN_CLASSES = ['PN10', 'PN16', 'PN20', 'PN25'];
const ODS = Object.keys(PPR).map(Number);

/** Nearest standard OD (drawn double-line gaps are rarely exact: 33 → 32, 60 → 63). */
export function snapOd(d) {
  let best = ODS[0];
  for (const o of ODS) if (Math.abs(o - d) < Math.abs(best - d)) best = o;
  return best;
}
export const odToNominal = (od) => PPR[snapOd(od)][0];
export function pprId(od, pn = 'PN20') {
  const row = PPR[snapOd(od)];
  const w = row[1 + Math.max(0, PN_CLASSES.indexOf(pn))];
  return Math.round((snapOd(od) - 2 * w) * 10) / 10;
}
