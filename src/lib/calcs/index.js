import { boosterDefaults, computeBooster } from './booster.js';
import { transferDefaults, computeTransfer } from './transfer.js';
import { sumpDefaults, computeSump } from './sump.js';
import { vesselDefaults, computeVessel } from './vessel.js';
import { chwDefaults, computeChw } from './chw.js';

export const CALCULATORS = {
  booster: { key: 'booster', label: 'Booster Pump Set', short: 'Booster', defaults: boosterDefaults, compute: computeBooster },
  transfer: { key: 'transfer', label: 'Transfer Pump', short: 'Transfer', defaults: transferDefaults, compute: computeTransfer },
  sump: { key: 'sump', label: 'Sump / Drainage Pump', short: 'Sump', defaults: sumpDefaults, compute: computeSump },
  vessel: { key: 'vessel', label: 'Pressure Vessel Sizing', short: 'Vessel', defaults: vesselDefaults, compute: computeVessel },
  chw: { key: 'chw', label: 'Chilled Water Pump', short: 'CHW', defaults: chwDefaults, compute: computeChw },
};
export { SECTION_CATEGORIES } from './common.js';
