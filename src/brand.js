// Supplier branding – change here to re-brand the whole application and every PDF.
import logoUrl from './assets/greenland-logo.png';
import markUrl from './assets/greenland-mark.png';

export const BRAND = {
  appName: 'Greenland Pump Engineering Suite',
  shortName: 'GREENLAND',
  legalName: 'Greenland Equipment & Machinery Est. L.L.C',
  tagline: 'Pumps · Booster Sets · Pressure Vessels · HVAC Pumping Systems',
  logoUrl,
  markUrl,
  green: '#06AF4B',
  navy: '#153963',
};

let cached;
/** Logo bytes for pdf-lib (PNG). */
export async function brandLogoBytes() {
  if (!cached) cached = fetch(logoUrl).then((r) => r.arrayBuffer()).then((b) => ({ bytes: new Uint8Array(b), type: 'image/png' }));
  return cached;
}
