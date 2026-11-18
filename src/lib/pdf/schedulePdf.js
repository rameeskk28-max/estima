import { PDFDocument } from 'pdf-lib';
import { A4L, C, loadFonts, wrap, drawText, rect, hline, vline, clean, fmtDate } from './theme.js';

/** Column definitions – same order as the Greenland SOM pump schedule. */
export const SCHEDULE_COLUMNS = [
  { key: 'sl', label: 'SL. NO', w: 0.024 },
  { key: 'system', label: 'SYSTEM', w: 0.074, align: 'l', input: 'text' },
  { key: 'config', label: 'CONFIGU- RATION', w: 0.05, input: 'text' },
  { key: 'qty', label: 'QTY OF SETS', w: 0.032, input: 'text' },
  { key: 'specFlow', label: 'FLOW (LPS)', group: 'SPECIFIED', w: 0.034, input: 'num' },
  { key: 'specHead', label: 'HEAD (M)', group: 'SPECIFIED', w: 0.034, input: 'num' },
  { key: 'propFlow', label: 'FLOW (LPS)', group: 'PROPOSED', w: 0.034, input: 'num' },
  { key: 'propHead', label: 'HEAD (M)', group: 'PROPOSED', w: 0.034, input: 'num' },
  { key: 'brand', label: 'BRAND', w: 0.05, input: 'text' },
  { key: 'model', label: 'PUMP MODEL', w: 0.072, input: 'text', bold: true },
  { key: 'type', label: 'PUMP TYPE', w: 0.055, input: 'text' },
  { key: 'moc', label: 'MOC (MATERIAL OF CONSTRUCTION)', w: 0.094, align: 'l', input: 'text' },
  { key: 'certs', label: 'CERTIFI- CATES & COMPLIANCE', w: 0.055, input: 'text' },
  { key: 'eff', label: 'EFFICI- ENCY IN %', w: 0.04, input: 'text' },
  { key: 'power', label: 'POWER IN KW', w: 0.035, input: 'text' },
  { key: 'speed', label: 'MOTOR SPEED IN RPM', w: 0.038, input: 'text' },
  { key: 'motorClass', label: 'MOTOR EFFICIENCY CLASS & COMPLIANCE STANDARD', w: 0.06, input: 'text' },
  { key: 'vessel', label: 'PRESSURE VESSEL', w: 0.046, input: 'text' },
  { key: 'header', label: 'SUCTION X DISCHARGE HEADER', w: 0.062, input: 'text' },
  { key: 'phase', label: 'PHASE', w: 0.032, input: 'text' },
  { key: 'starter', label: 'STARTER TYPE', w: 0.042, input: 'text' },
];

export const emptyScheduleRow = (o = {}) => ({
  id: Math.random().toString(36).slice(2, 10),
  system: '',
  config: '1D+1S',
  qty: '1',
  specFlow: '',
  specHead: '',
  propFlow: '',
  propHead: '',
  brand: '',
  model: '',
  type: '',
  moc: '',
  certs: '',
  eff: '',
  power: '',
  speed: '2900',
  motorClass: 'IE3',
  vessel: 'NA',
  header: '',
  phase: '3',
  starter: 'DOL',
  ...o,
});

export const EXAMPLE_SCHEDULE = () => [
  emptyScheduleRow({ system: 'TRANSFER PUMP SET', specFlow: '4.5', specHead: '81.6', propFlow: '4.5', propHead: '79', brand: 'Franklin Electric', model: '15EVR0700-FIS-T52C055 BQE-L3', type: 'Vertical Multi Stage', moc: 'Casing - SS304, Impeller - SS304, Shaft - SS', certs: 'WRAS, ACS', eff: '68.60%', power: '5.50', header: '2.5"x2.5" SS304' }),
  emptyScheduleRow({ system: 'BOOSTER PUMP SET', specFlow: '3.8', specHead: '32', propFlow: '3.8', propHead: '32', brand: 'Franklin Electric', model: '15VR0300HF1B-F5EB', type: 'Vertical Multi Stage', moc: 'Casing - SS304, Impeller - SS304, Shaft - SS', certs: 'WRAS, ACS', eff: '65.90%', power: '2.20', vessel: '24L', header: '2"x2"', starter: 'VFD' }),
  emptyScheduleRow({ system: 'SUMP PUMP SET', specFlow: '6.5', specHead: '25', propFlow: '6.5', propHead: '10', brand: 'Franklin Electric', model: '50FWC-M-52-1,6T', type: 'SEWAGE PUMP', moc: 'Casing - Cast iron EN GJL200, Impeller - Cast iron EN GJL200, Shaft - Stainless steel AISI416', certs: 'NA', eff: '53.85%', power: '1.60', motorClass: 'IE2', header: 'NA' }),
];

/** Renders the manual pump schedule on A4 landscape pages. */
export function renderManualSchedule(doc, fonts, schedule, project = {}) {
  const [PW, PH] = A4L;
  const L = 24;
  const R = PW - 24;
  const W = R - L;
  const widths = SCHEDULE_COLUMNS.map((c) => c.w * W);
  const total = widths.reduce((a, b) => a + b, 0);
  const scale = W / total;
  for (let k = 0; k < widths.length; k++) widths[k] *= scale;
  const xs = [];
  widths.reduce((x, w, k) => ((xs[k] = x), x + w), L);
  const pages = [];
  let page;
  let y;
  const size = 6.2;
  const lh = 7.6;

  const head = (cont) => {
    page = doc.addPage(A4L);
    pages.push(page);
    let top = PH - 30;
    rect(page, L, top - 18, W, 18, { fill: C.sky });
    drawText(page, `${schedule.title || 'PUMP SCHEDULE'}${cont ? ' (CONT.)' : ''}`, { x: L + W / 2, y: top - 12.5, size: 10, font: fonts.bold, color: C.white, align: 'center' });
    top -= 18;
    rect(page, L, top - 13, W, 13, { fill: C.greenBg });
    drawText(page, schedule.subtitle || '', { x: L + W / 2, y: top - 9.3, size: 7.4, font: fonts.boldItal, color: C.navy, align: 'center', maxWidth: W - 20 });
    top -= 13;
    const info = [project.projectName, project.refNo && `Ref: ${project.refNo}`, project.revision && `Rev. ${project.revision}`, project.date && fmtDate(project.date)].filter(Boolean).join('   |   ');
    if (info) drawText(page, info, { x: L, y: top - 10, size: 6.8, font: fonts.reg, color: C.muted, maxWidth: W });
    top -= 18;
    // two-tier header
    const h1 = 12;
    const h2 = 30;
    rect(page, L, top - h1 - h2, W, h1 + h2, { fill: C.sky });
    SCHEDULE_COLUMNS.forEach((c, k) => {
      const x = xs[k];
      const w = widths[k];
      if (c.group) {
        const first = SCHEDULE_COLUMNS.findIndex((cc) => cc.group === c.group);
        if (first === k) {
          const gw = SCHEDULE_COLUMNS.filter((cc) => cc.group === c.group).reduce((s, _, j) => s + widths[first + j], 0);
          drawText(page, c.group, { x: x + gw / 2, y: top - 8.5, size: 6, font: fonts.bold, color: C.white, align: 'center' });
          hline(page, x, x + gw, top - h1, C.white, 0.6);
        }
        const lines = wrap(fonts.bold, c.label, 5.6, w - 3);
        lines.forEach((ln, i) => drawText(page, ln, { x: x + w / 2, y: top - h1 - 10 - i * 6.6, size: 5.6, font: fonts.bold, color: C.white, align: 'center' }));
        vline(page, x, top - h1, top - h1 - h2, C.white, 0.5);
        if (first !== k) return;
      } else {
        const lines = wrap(fonts.bold, c.label, 5.6, w - 3);
        const startY = top - (h1 + h2) / 2 + ((lines.length - 1) * 6.6) / 2 - 2;
        lines.forEach((ln, i) => drawText(page, ln, { x: x + w / 2, y: startY - i * 6.6, size: 5.6, font: fonts.bold, color: C.white, align: 'center' }));
      }
      vline(page, x, top, top - h1 - h2, C.white, 0.6);
    });
    y = top - h1 - h2;
  };
  head(false);

  const rows = schedule.rows || [];
  if (!rows.length) {
    rect(page, L, y - 22, W, 22, { stroke: C.border, width: 0.5 });
    drawText(page, 'No pumps entered in the schedule.', { x: L + W / 2, y: y - 14, size: 8, font: fonts.ital, color: C.muted, align: 'center' });
  }
  rows.forEach((r, ri) => {
    const vals = SCHEDULE_COLUMNS.map((c) => (c.key === 'sl' ? String(ri + 1) : String(r[c.key] ?? '')));
    const cells = vals.map((v, k) => wrap(SCHEDULE_COLUMNS[k].bold ? fonts.bold : fonts.reg, v, size, widths[k] - 4));
    const h = Math.max(...cells.map((c) => c.length)) * lh + 8;
    if (y - h < 40) head(true);
    rect(page, L, y - h, W, h, { fill: ri % 2 ? C.light : C.white });
    cells.forEach((lines, k) => {
      const c = SCHEDULE_COLUMNS[k];
      const startY = y - h / 2 + ((lines.length - 1) * lh) / 2 - 2;
      lines.forEach((ln, i) =>
        drawText(page, ln, {
          x: c.align === 'l' ? xs[k] + 2.5 : xs[k] + widths[k] / 2,
          y: startY - i * lh,
          size,
          font: c.bold ? fonts.bold : fonts.reg,
          color: c.bold ? C.navy : C.text,
          align: c.align === 'l' ? 'left' : 'center',
        }),
      );
      vline(page, xs[k], y, y - h, C.border, 0.5);
    });
    vline(page, R, y, y - h, C.border, 0.5);
    hline(page, L, R, y - h, C.border, 0.5);
    y -= h;
  });
  if (schedule.notes && y > 60) {
    wrap(fonts.ital, schedule.notes, 7, W).slice(0, 4).forEach((ln, i) => drawText(page, ln, { x: L, y: y - 14 - i * 9, size: 7, font: fonts.ital, color: C.muted }));
  }
  return pages;
}

export async function buildSchedulePdf(schedule, project) {
  const doc = await PDFDocument.create();
  doc.setTitle(clean(`${schedule.title || 'Pump Schedule'} – ${project.projectName || ''}`));
  doc.setCreator('Greenland Pump Engineering Suite');
  const fonts = await loadFonts(doc);
  const pages = renderManualSchedule(doc, fonts, schedule, project);
  pages.forEach((p, i) => {
    const { width } = p.getSize();
    drawText(p, `${project.supplier || ''}`, { x: 24, y: 16, size: 6.8, font: fonts.reg, color: C.muted });
    drawText(p, `Page ${i + 1} of ${pages.length}`, { x: width - 24, y: 16, size: 6.8, font: fonts.bold, color: C.muted, align: 'right' });
  });
  return doc.save();
}

/** CSV export (opens in Excel). */
export function scheduleCsv(schedule) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = SCHEDULE_COLUMNS.map((c) => (c.group ? `${c.group} ${c.label}` : c.label).replace('- ', ''));
  const lines = [header.map(esc).join(',')];
  (schedule.rows || []).forEach((r, i) => lines.push(SCHEDULE_COLUMNS.map((c) => esc(c.key === 'sl' ? i + 1 : r[c.key])).join(',')));
  return '﻿' + lines.join('\r\n');
}
