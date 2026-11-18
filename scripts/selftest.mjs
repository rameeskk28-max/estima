// Node self-test: runs every calculator, renders calc sheets and compiles a full
// submittal with sample attachments (portrait, landscape, rotated, corrupt).
import { writeFileSync, mkdirSync } from 'node:fs';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { CALCULATORS } from '../src/lib/calcs/index.js';
import { buildCalcSheetPdf } from '../src/lib/pdf/calcSheet.js';
import { compileSubmittal } from '../src/lib/pdf/compile.js';
import { DEFAULT_INDEX } from '../src/lib/submittalDefaults.js';
import { readFileSync } from 'node:fs';
const logo = { bytes: readFileSync(new URL('../src/assets/greenland-logo.png', import.meta.url)), type: 'image/png' };

const out = process.argv[2] || 'selftest-output';
mkdirSync(out, { recursive: true });
const project = {
  projectName: 'G+12 Residential Tower – Plot 345, Al Barsha South',
  consultant: 'Sample Engineering Consultants',
  contractor: 'Sample MEP Contracting LLC',
  refNo: 'SUB-PMP-001',
  revision: '0',
  date: '2026-11-18',
  supplier: 'Greenland Equipment & Machinery Est. L.L.C',
  preparedBy: 'A. Engineer',
  subject: 'Material Submittal – Water Pumps, Booster Sets & Pressure Vessels',
};

let failures = 0;
const assert = (cond, msg) => { if (!cond) { failures++; console.error('FAIL:', msg); } else console.log('ok  ', msg); };

const duties = [];
for (const c of Object.values(CALCULATORS)) {
  const r = c.compute(c.defaults());
  assert(r.duty && r.sheet && r.kpis.length === 4, `${c.key} computes`);
  if (r.duty.kind === 'pump') assert(r.duty.headM > 0 && r.duty.flowLps > 0 && r.duty.motorKW > 0, `${c.key} duty point positive`);
  const bytes = await buildCalcSheetPdf(r.sheet, project, logo);
  writeFileSync(`${out}/calc-${c.key}.pdf`, bytes);
  const n = (await PDFDocument.load(bytes)).getPageCount();
  assert(n >= 1, `${c.key} calc sheet PDF (${n} pages)`);
  duties.push({ id: c.key, ...r.duty, sheet: r.sheet });
}
// basement booster duplicate
duties.push({ ...duties[0], id: 'b2', tag: 'BPS-02', category: 'booster-basement', service: 'Basement Booster Set' });

// Known-answer checks
import { hazenWilliams, velocity } from '../src/lib/hydraulics.js';
const hf = hazenWilliams(10, 102.3, 100, 120); // ≈ 1.98 m (hand calculation)
assert(Math.abs(hf - 1.979) < 0.01, `Hazen-Williams 10 L/s DN100 C120 100 m = ${hf.toFixed(3)} m`);
assert(Math.abs(velocity(10, 102.3) - 1.2166) < 0.01, 'velocity 10 L/s DN100');
const chw = CALCULATORS.chw.compute({ ...CALCULATORS.chw.defaults(), load: { value: 1000, unit: 'kW' }, deltaT: 6 });
assert(Math.abs(chw.duty.totalFlowLps - 1000 / (4.186 * 6)) < 1e-9, 'CHW Q = kW / (4.186 ΔT)');
const v = CALCULATORS.vessel.compute({ ...CALCULATORS.vessel.defaults(), mode: 'direct', va: 50, pmin: 3, pmax: 4.5, vessels: 1 });
assert(Math.abs(v.selection.Vt - 50 * 5.5 / 1.5) < 1e-9 && v.selection.size === 200, `Vessel Vt=${v.selection.Vt.toFixed(1)} → ${v.selection.size} L`);

// Sample attachments
async function sample(label, size, rotate = 0, pages = 2) {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.HelveticaBold);
  for (let i = 0; i < pages; i++) {
    const p = d.addPage(size);
    p.drawRectangle({ x: 10, y: 10, width: size[0] - 20, height: size[1] - 20, borderColor: rgb(0.8, 0, 0), borderWidth: 3 });
    p.drawText(`${label} – page ${i + 1}`, { x: 40, y: size[1] - 60, size: 22, font: f });
    p.drawText('TOP', { x: size[0] / 2 - 20, y: size[1] - 30, size: 14, font: f });
    if (rotate) p.setRotation(degrees(rotate));
  }
  return d.save();
}
const files = {
  e1: [{ name: 'Company Profile.pdf', bytes: await sample('Company profile (A4)', [595.28, 841.89], 0, 3) }],
  e2: [{ name: 'Trade License.pdf', bytes: await sample('Trade licence (Letter landscape)', [792, 612], 0, 1) }],
  e7: [{ name: 'Booster Datasheet & Curves.pdf', bytes: await sample('Datasheet (rotated 90)', [595.28, 841.89], 90, 2) }],
  e12: [{ name: 'ISO 9001.pdf', bytes: new Uint8Array([1, 2, 3, 4]) }],
};
const entries = DEFAULT_INDEX();
const res = await compileSubmittal({ project, entries, duties, files, logo }, () => {});
writeFileSync(`${out}/submittal.pdf`, res.bytes);
assert(res.pageCount > 20, `compiled submittal: ${res.pageCount} pages`);
assert(res.toc.length === 14, 'TOC has 14 sections');
assert(res.warnings.some((w) => w.includes('ISO 9001')), 'corrupt file reported');
const reread = await PDFDocument.load(res.bytes);
const sizes = reread.getPages().map((p) => p.getSize());
const isA4 = (s) => { const [a, b] = [s.width, s.height].sort((x, y) => x - y); return Math.abs(a - 595.28) < 0.5 && Math.abs(b - 841.89) < 0.5; };
assert(sizes.every(isA4), 'every page is A4 (portrait or landscape)');
for (const s of res.toc) console.log(`  ${String(s.number).padStart(2, '0')} ${s.title.padEnd(62)} p.${s.page}  ${s.items.map((i) => i.label + '@' + i.page).join(', ')}`);
console.log('warnings:', res.warnings);
if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('All self-tests passed.');
