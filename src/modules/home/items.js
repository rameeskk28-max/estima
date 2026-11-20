// Calculator list (kept in its own module so the navigation map can import it without a cycle).
import { Building2, ArrowUpDown, Waves, Snowflake, Cylinder, Route } from 'lucide-react';

export const CALC_ITEMS = [
  { key: 'booster', label: 'Booster Pump Set', icon: Building2, desc: 'Fixture units (IPC) → demand, head loss & final head' },
  { key: 'transfer', label: 'Transfer Pump Set', icon: ArrowUpDown, desc: 'Tank volume & filling time → flow and head' },
  { key: 'sump', label: 'Sump / Sewage Pump Set', icon: Waves, desc: 'Pit volume & emptying time → flow and head' },
  { key: 'chw', label: 'Chilled Water Pump Set', icon: Snowflake, desc: 'Cooling load & ΔT → flow; closed-loop head' },
  { key: 'vessel', label: 'Pressure Vessel', icon: Cylinder, desc: "Boyle's law vessel volume & pre-charge" },
  { key: 'drawing', label: 'From Drawing (DWG)', icon: Route, desc: 'Read plumbing DWGs – fixtures, pipe routes & fittings → head calculation' },
];
