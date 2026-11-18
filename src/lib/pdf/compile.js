import { PDFDocument, degrees } from 'pdf-lib';
import { A4, A4L, C, loadFonts, wrap, drawText, rect, hline, clean, truncate, fmtDate } from './theme.js';
import { renderCalcSheet } from './calcSheet.js';
import { renderManualSchedule } from './schedulePdf.js';
import { renderLiterature, embedImage, dataUrlToImage } from './literaturePdf.js';
import { literatureLabel } from '../literature.js';
import { fmt, lpsToM3h, mToBar } from '../hydraulics.js';
import { SECTION_CATEGORIES } from '../calcs/engine.js';

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Build the section plan: which items go into each section.
 */
export function buildPlan(entries, duties, files, literature = []) {
  const included = entries.filter((e) => e.include !== false);
  return included.map((e, idx) => {
    const items = [];
    if (e.kind === 'schedule') items.push({ type: 'schedule', label: 'Pump & Equipment Schedule' });
    if (e.kind === 'technical') {
      const lits = literature.filter((l) => l.category === e.category);
      // Order: technical literature → pump datasheets & curves → calculation sheets → drawings → other uploads
      lits.forEach((l) => items.push({ type: 'literature', lit: l, label: literatureLabel(l) }));
      lits.forEach((l) => (files[`lit-${l.id}-datasheet`] || []).forEach((f) => items.push({ type: 'pdf', file: f, label: `Pump Datasheet & Curves – ${f.name.replace(/\.pdf$/i, '')}` })));
      duties
        .filter((d) => d.category === e.category && d.sheet)
        .forEach((d) => items.push({ type: 'calc', duty: d, label: `Calculation Sheet – ${d.tag} (${d.calcType})` }));
      lits.forEach((l) => (files[`lit-${l.id}-drawing`] || []).forEach((f) => items.push({ type: 'pdf', file: f, label: `Drawing – ${f.name.replace(/\.pdf$/i, '')}` })));
    }
    (files[e.id] || []).forEach((f) => items.push({ type: 'pdf', file: f, label: f.name.replace(/\.pdf$/i, '') }));
    return { entry: e, number: idx + 1, items };
  });
}

/**
 * Compile the full submittal.
 * @param {{project: object, entries: object[], duties: object[], files: Record<string, {name:string, bytes:ArrayBuffer|Uint8Array}[]>, logo?: {bytes:ArrayBuffer, type:string}}} input
 * @param {(msg: string) => void} [onProgress]
 */
export async function compileSubmittal({ project = {}, entries = [], duties = [], files = {}, logo, schedule, literature = [] }, onProgress = () => {}) {
  const doc = await PDFDocument.create();
  const fonts = await loadFonts(doc);
  const warnings = [];
  doc.setTitle(clean(`${project.refNo || 'Submittal'} – ${project.projectName || ''}`));
  doc.setSubject(clean(project.subject || 'Technical Submittal'));
  doc.setAuthor(clean(project.preparedBy || project.supplier || ''));
  doc.setCreator('Greenland Pump Engineering Suite');
  doc.setProducer('Greenland Pump Engineering Suite (pdf-lib)');

  let logoImg = null;
  if (logo?.bytes) {
    try {
      logoImg = /png/i.test(logo.type) ? await doc.embedPng(logo.bytes) : await doc.embedJpg(logo.bytes);
    } catch (e) {
      warnings.push(`Logo could not be embedded (${e.message}). Use PNG or JPG.`);
    }
  }

  const plan = buildPlan(entries, duties, files, literature);
  const pageMeta = []; // per page: { section, footer: boolean }
  const track = (pages, section, footer = true) => pages.forEach((p) => pageMeta.push({ page: p, section, footer }));

  onProgress('Generating cover page…');
  const cover = drawCover(doc, fonts, project, logoImg);
  track([cover], '', false);

  // Reserve TOC pages
  const tocRows = [];
  plan.forEach((s) => {
    tocRows.push({ level: 0, number: s.number, title: s.entry.title, ref: s });
    s.items.forEach((it) => tocRows.push({ level: 1, title: it.label, ref: it }));
  });
  const tocLayout = layoutToc(tocRows);
  const tocPages = tocLayout.map(() => doc.addPage(A4));
  track(tocPages, 'TABLE OF CONTENTS');

  // Sections
  for (const s of plan) {
    onProgress(`Section ${pad2(s.number)} – ${s.entry.title}`);
    const label = `${pad2(s.number)}. ${s.entry.title}`;
    s.startPage = doc.getPageCount() + 1;
    const divider = drawDivider(doc, fonts, project, s, logoImg);
    track([divider], label);
    if (!s.items.length) warnings.push(`Section ${pad2(s.number)} "${s.entry.title}" has no attached documents.`);
    for (const it of s.items) {
      it.startPage = doc.getPageCount() + 1;
      if (it.type === 'schedule') {
        const pages = schedule?.rows?.length ? renderManualSchedule(doc, fonts, schedule, project) : drawSchedule(doc, fonts, project, duties);
        track(pages, label);
      } else if (it.type === 'literature') {
        const productImg = await embedImage(doc, dataUrlToImage(it.lit.image));
        track(await renderLiterature(doc, fonts, it.lit, project, { logoImg, productImg }), label);
      } else if (it.type === 'calc') {
        const { pages } = await renderCalcSheet(doc, fonts, it.duty.sheet, project, logoImg);
        track(pages, label);
      } else if (it.type === 'pdf') {
        onProgress(`Merging ${it.file.name}…`);
        const res = await appendPdf(doc, fonts, it.file);
        if (res.error) warnings.push(`"${it.file.name}": ${res.error}`);
        track(res.pages, label);
      }
    }
  }

  onProgress('Writing table of contents…');
  drawToc(tocPages, fonts, project, tocLayout);

  // Global footer / page numbering
  const total = doc.getPageCount();
  pageMeta.forEach((m, i) => {
    if (!m.footer) return;
    const { width } = m.page.getSize();
    const page = m.page;
    hline(page, 28, width - 28, 28, C.navy, 0.8);
    drawText(page, `${project.projectName || ''}`, { x: 28, y: 16, size: 7, font: fonts.bold, color: C.navy, maxWidth: width * 0.36 });
    drawText(page, `${project.refNo || ''}  Rev. ${project.revision || '0'}`, { x: 28, y: 7.5, size: 6.5, font: fonts.reg, color: C.muted, maxWidth: width * 0.36 });
    drawText(page, m.section, { x: width / 2, y: 12, size: 7, font: fonts.reg, color: C.muted, align: 'center', maxWidth: width * 0.34 });
    drawText(page, `Page ${i + 1} of ${total}`, { x: width - 28, y: 12, size: 8, font: fonts.bold, color: C.navy, align: 'right' });
  });

  onProgress('Saving PDF…');
  const bytes = await doc.save();
  return {
    bytes,
    pageCount: total,
    warnings,
    toc: plan.map((s) => ({ number: s.number, title: s.entry.title, page: s.startPage, items: s.items.map((it) => ({ label: it.label, page: it.startPage })) })),
  };
}

/* ------------------------------------------------------------------ */
/* Cover                                                               */
/* ------------------------------------------------------------------ */

function drawCover(doc, fonts, p, logoImg) {
  const page = doc.addPage(A4);
  const [W, H] = A4;
  const L = 44;
  const R = W - 44;
  // White brand band with logo, navy title block, green rule
  const band = 96;
  if (logoImg) {
    const sc = Math.min(58 / logoImg.height, 300 / logoImg.width);
    page.drawImage(logoImg, { x: L - 4, y: H - band / 2 - (logoImg.height * sc) / 2, width: logoImg.width * sc, height: logoImg.height * sc });
  } else {
    drawText(page, (p.supplier || 'SUPPLIER NAME').toUpperCase(), { x: L, y: H - 52, size: 16, font: fonts.bold, color: C.navy, maxWidth: R - L });
  }
  drawText(page, 'MEP Pumps & Pressure Systems', { x: R, y: H - band / 2 + 2, size: 8.5, font: fonts.bold, color: C.sky, align: 'right' });
  drawText(page, 'Supply · Engineering · Commissioning', { x: R, y: H - band / 2 - 10, size: 7.5, font: fonts.reg, color: C.muted, align: 'right' });
  rect(page, 0, H - band - 150, W, 150, { fill: C.navy });
  rect(page, 0, H - band - 156, W, 6, { fill: C.sky });
  rect(page, 0, 0, 14, H - band - 156, { fill: C.navy2 });

  drawText(page, 'TECHNICAL SUBMITTAL', { x: L, y: H - band - 62, size: 30, font: fonts.bold, color: C.white });
  rect(page, L, H - band - 76, 60, 3, { fill: C.sky });
  const subj = wrap(fonts.reg, p.subject || 'Material Submittal – Water Pumps & Pressure Vessels', 13, R - L);
  subj.slice(0, 2).forEach((ln, i) => drawText(page, ln, { x: L, y: H - band - 100 - i * 16, size: 13, font: fonts.reg, color: C.white }));

  // Project block
  let y = H - 290;
  drawText(page, 'PROJECT', { x: L, y, size: 8.5, font: fonts.bold, color: C.blue });
  y -= 22;
  const pLines = wrap(fonts.bold, p.projectName || 'Project Name', 18, R - L);
  pLines.slice(0, 3).forEach((ln) => {
    drawText(page, ln, { x: L, y, size: 18, font: fonts.bold, color: C.navy });
    y -= 22;
  });
  y -= 10;

  const rows = [
    ['Client', p.client],
    ['Consultant', p.consultant],
    ['MEP Contractor', p.contractor],
    ['Supplier', p.supplier],
    ['Submittal Reference No.', p.refNo],
    ['Revision', p.revision || '0'],
    ['Submission Date', fmtDate(p.date)],
    ['Prepared By', p.preparedBy],
  ];
  const lw = 160;
  rows.forEach(([a, b], i) => {
    const h = 22;
    rect(page, L, y - h, lw, h, { fill: i % 2 ? C.light : C.light2, stroke: C.border, width: 0.5 });
    rect(page, L + lw, y - h, R - L - lw, h, { stroke: C.border, width: 0.5 });
    drawText(page, a, { x: L + 8, y: y - 14.5, size: 8.5, font: fonts.bold, color: C.navy });
    drawText(page, b || '–', { x: L + lw + 8, y: y - 14.5, size: 9, font: fonts.reg, color: C.text, maxWidth: R - L - lw - 16 });
    y -= h;
  });

  // Consultant stamp & action codes
  const boxTop = 250;
  const bw = (R - L - 14) / 2;
  rect(page, L, 60, bw, boxTop - 60, { stroke: C.navy, width: 0.8 });
  rect(page, L, boxTop - 18, bw, 18, { fill: C.navy });
  drawText(page, "CONSULTANT'S REVIEW STAMP", { x: L + bw / 2, y: boxTop - 12.5, size: 8, font: fonts.bold, color: C.white, align: 'center' });

  const x2 = L + bw + 14;
  rect(page, x2, 60, bw, boxTop - 60, { stroke: C.navy, width: 0.8 });
  rect(page, x2, boxTop - 18, bw, 18, { fill: C.navy });
  drawText(page, 'REVIEW ACTION CODE', { x: x2 + bw / 2, y: boxTop - 12.5, size: 8, font: fonts.bold, color: C.white, align: 'center' });
  const codes = ['A – Approved', 'B – Approved as Noted', 'C – Revise & Resubmit', 'D – Rejected'];
  codes.forEach((c, i) => {
    const yy = boxTop - 42 - i * 22;
    rect(page, x2 + 12, yy - 2, 11, 11, { stroke: C.navy, width: 0.8 });
    drawText(page, c, { x: x2 + 32, y: yy, size: 9, font: fonts.reg, color: C.text });
  });
  drawText(page, 'Reviewed by: ____________________', { x: x2 + 12, y: 92, size: 8, font: fonts.reg, color: C.muted });
  drawText(page, 'Date: ____________________', { x: x2 + 12, y: 74, size: 8, font: fonts.reg, color: C.muted });

  drawText(page, 'This document is the property of the supplier and is issued for consultant review and approval only.', { x: W / 2, y: 36, size: 7, font: fonts.ital, color: C.muted, align: 'center' });
  return page;
}

/* ------------------------------------------------------------------ */
/* Table of contents                                                   */
/* ------------------------------------------------------------------ */

const TOC_TOP = A4[1] - 150;
const TOC_BOTTOM = 60;

function layoutToc(rows) {
  const pages = [[]];
  let y = TOC_TOP;
  rows.forEach((r) => {
    const h = r.level === 0 ? 22 : 14;
    const extra = r.level === 0 ? 4 : 0;
    if (y - h - extra < TOC_BOTTOM) {
      pages.push([]);
      y = TOC_TOP;
    }
    y -= extra;
    pages[pages.length - 1].push({ ...r, y, h });
    y -= h;
  });
  return pages;
}

function drawToc(pages, fonts, p, layout) {
  const [W, H] = A4;
  const L = 44;
  const R = W - 44;
  pages.forEach((page, pi) => {
    rect(page, 0, H - 92, W, 92, { fill: C.navy });
    rect(page, 0, H - 95, W, 3, { fill: C.sky });
    drawText(page, 'TABLE OF CONTENTS', { x: L, y: H - 50, size: 22, font: fonts.bold, color: C.white });
    drawText(page, `${p.projectName || ''}`, { x: L, y: H - 70, size: 9, font: fonts.reg, color: C.sky, maxWidth: R - L - 140 });
    drawText(page, `${p.refNo || ''}  ·  Rev. ${p.revision || '0'}`, { x: R, y: H - 70, size: 9, font: fonts.bold, color: C.white, align: 'right' });
    if (pages.length > 1) drawText(page, `(${pi + 1}/${pages.length})`, { x: R, y: H - 50, size: 9, font: fonts.reg, color: C.sky, align: 'right' });

    // column head
    const hy = TOC_TOP + 14;
    rect(page, L, hy - 4, R - L, 18, { fill: C.light2 });
    drawText(page, 'ITEM', { x: L + 6, y: hy + 1.5, size: 8, font: fonts.bold, color: C.navy });
    drawText(page, 'DESCRIPTION', { x: L + 48, y: hy + 1.5, size: 8, font: fonts.bold, color: C.navy });
    drawText(page, 'PAGE', { x: R - 6, y: hy + 1.5, size: 8, font: fonts.bold, color: C.navy, align: 'right' });

    (layout[pi] || []).forEach((r) => {
      const pageNo = String(r.ref.startPage ?? '');
      if (r.level === 0) {
        const yy = r.y - 15;
        rect(page, L, r.y - r.h, 3, r.h, { fill: C.blue });
        drawText(page, pad2(r.number), { x: L + 10, y: yy, size: 10, font: fonts.bold, color: C.blue });
        const title = truncate(fonts.bold, r.title, 10, R - L - 120);
        drawText(page, title, { x: L + 48, y: yy, size: 10, font: fonts.bold, color: C.navy });
        leaders(page, fonts, L + 48 + fonts.bold.widthOfTextAtSize(title, 10) + 6, R - 34, yy);
        drawText(page, pageNo, { x: R - 6, y: yy, size: 10, font: fonts.bold, color: C.navy, align: 'right' });
        hline(page, L, R, r.y - r.h, C.light2, 0.5);
      } else {
        const yy = r.y - 10;
        const title = truncate(fonts.reg, `–  ${r.title}`, 8.5, R - L - 140);
        drawText(page, title, { x: L + 62, y: yy, size: 8.5, font: fonts.reg, color: C.text });
        leaders(page, fonts, L + 62 + fonts.reg.widthOfTextAtSize(title, 8.5) + 6, R - 34, yy);
        drawText(page, pageNo, { x: R - 6, y: yy, size: 8.5, font: fonts.reg, color: C.muted, align: 'right' });
      }
    });
  });
}

function leaders(page, fonts, x1, x2, y) {
  if (x2 - x1 < 10) return;
  const dot = '.';
  const w = fonts.reg.widthOfTextAtSize(dot + ' ', 7);
  const n = Math.floor((x2 - x1) / w);
  page.drawText(Array(n).fill('.').join(' '), { x: x1, y, size: 7, font: fonts.reg, color: C.border });
}

/* ------------------------------------------------------------------ */
/* Section divider                                                     */
/* ------------------------------------------------------------------ */

function drawDivider(doc, fonts, p, s, logoImg) {
  const page = doc.addPage(A4);
  const [W, H] = A4;
  const L = 60;
  const R = W - 50;
  rect(page, 0, 32, 34, H - 32, { fill: C.navy });
  rect(page, 34, 32, 4, H - 32, { fill: C.sky });
  if (logoImg) {
    const sc = Math.min(34 / logoImg.height, 170 / logoImg.width);
    page.drawImage(logoImg, { x: R - logoImg.width * sc, y: H - 40 - logoImg.height * sc, width: logoImg.width * sc, height: logoImg.height * sc });
    drawText(page, p.refNo || '', { x: R, y: H - 88, size: 8, font: fonts.reg, color: C.muted, align: 'right' });
  } else {
    drawText(page, (p.supplier || '').toUpperCase(), { x: R, y: H - 50, size: 9, font: fonts.bold, color: C.navy, align: 'right', maxWidth: R - L });
    drawText(page, p.refNo || '', { x: R, y: H - 63, size: 8, font: fonts.reg, color: C.muted, align: 'right' });
  }

  drawText(page, 'SECTION', { x: L, y: H * 0.62 + 70, size: 14, font: fonts.bold, color: C.blue });
  drawText(page, pad2(s.number), { x: L - 4, y: H * 0.62 - 20, size: 96, font: fonts.bold, color: C.navy });
  hline(page, L, R, H * 0.62 - 42, C.sky, 3);
  const lines = wrap(fonts.bold, s.entry.title, 24, R - L);
  let y = H * 0.62 - 76;
  lines.forEach((ln) => {
    drawText(page, ln, { x: L, y, size: 24, font: fonts.bold, color: C.navy });
    y -= 30;
  });
  if (s.entry.kind === 'technical' && s.entry.category) {
    drawText(page, `Equipment category: ${SECTION_CATEGORIES[s.entry.category] || s.entry.category}`, { x: L, y: y - 2, size: 10, font: fonts.reg, color: C.muted });
    y -= 20;
  }
  y -= 16;
  drawText(page, 'CONTENTS OF THIS SECTION', { x: L, y, size: 8.5, font: fonts.bold, color: C.blue });
  y -= 6;
  hline(page, L, R, y, C.border, 0.6);
  y -= 16;
  if (!s.items.length) {
    drawText(page, 'No document attached to this section.', { x: L, y, size: 10, font: fonts.ital, color: C.red });
  }
  s.items.slice(0, 18).forEach((it, i) => {
    drawText(page, `${s.number}.${i + 1}`, { x: L, y, size: 9.5, font: fonts.bold, color: C.blue });
    drawText(page, it.label, { x: L + 36, y, size: 9.5, font: fonts.reg, color: C.text, maxWidth: R - L - 40 });
    y -= 17;
  });
  if (s.items.length > 18) drawText(page, `+ ${s.items.length - 18} more document(s)`, { x: L + 36, y, size: 9, font: fonts.ital, color: C.muted });

  drawText(page, p.projectName || '', { x: L, y: 70, size: 10, font: fonts.bold, color: C.navy, maxWidth: R - L });
  drawText(page, [p.consultant, p.contractor].filter(Boolean).join('  |  '), { x: L, y: 56, size: 8.5, font: fonts.reg, color: C.muted, maxWidth: R - L });
  return page;
}

/* ------------------------------------------------------------------ */
/* Pump schedule (A4 landscape)                                        */
/* ------------------------------------------------------------------ */

export function scheduleRows(duties) {
  return duties.filter((d) => d.kind !== 'vessel');
}

function drawSchedule(doc, fonts, p, duties) {
  const pumps = duties.filter((d) => d.kind !== 'vessel');
  const vessels = duties.filter((d) => d.kind === 'vessel');
  const [W, H] = A4L;
  const L = 30;
  const R = W - 30;
  const pages = [];
  let page;
  let y;
  const header = (cont) => {
    page = doc.addPage(A4L);
    pages.push(page);
    rect(page, L, H - 62, R - L, 34, { fill: C.navy });
    drawText(page, `PUMP & EQUIPMENT SCHEDULE${cont ? ' (cont.)' : ''}`, { x: L + 12, y: H - 50, size: 14, font: fonts.bold, color: C.white });
    drawText(page, p.projectName || '', { x: R - 12, y: H - 43, size: 8.5, font: fonts.bold, color: C.sky, align: 'right', maxWidth: 360 });
    drawText(page, `${p.refNo || ''}  ·  Rev. ${p.revision || '0'}  ·  ${fmtDate(p.date)}`, { x: R - 12, y: H - 55, size: 7.5, font: fonts.reg, color: C.white, align: 'right' });
    y = H - 78;
  };
  header(false);

  const table = (title, cols, rows) => {
    const tw = R - L;
    const widths = cols.map((c) => c.w * tw);
    const size = 7.8;
    const drawHead = () => {
      drawText(page, title, { x: L, y: y - 10, size: 9, font: fonts.bold, color: C.navy });
      y -= 16;
      const h = 26;
      rect(page, L, y - h, tw, h, { fill: C.navy2 });
      let x = L;
      cols.forEach((c, k) => {
        const lines = wrap(fonts.bold, c.label, 7, widths[k] - 6);
        lines.slice(0, 2).forEach((ln, li) => drawText(page, ln, { x: x + widths[k] / 2, y: y - 10 - li * 8.5 + (lines.length === 1 ? -4 : 0), size: 7, font: fonts.bold, color: C.white, align: 'center' }));
        x += widths[k];
      });
      y -= h;
    };
    drawHead();
    if (!rows.length) {
      rect(page, L, y - 22, tw, 22, { stroke: C.border, width: 0.5 });
      drawText(page, 'No duties saved – use the calculators and press "Save to Pump Schedule".', { x: L + tw / 2, y: y - 14, size: 8, font: fonts.ital, color: C.muted, align: 'center' });
      y -= 30;
      return;
    }
    rows.forEach((row, ri) => {
      const cells = row.map((cell, k) => wrap(k === 1 ? fonts.bold : fonts.reg, cell, size, widths[k] - 6));
      const h = Math.max(...cells.map((c) => c.length)) * 10 + 8;
      if (y - h < 50) {
        header(true);
        drawHead();
      }
      if (ri % 2) rect(page, L, y - h, tw, h, { fill: C.light });
      let x = L;
      cells.forEach((lines, k) => {
        lines.forEach((ln, li) => drawText(page, ln, { x: cols[k].align === 'left' ? x + 4 : x + widths[k] / 2, y: y - 11 - li * 10, size, font: k === 1 ? fonts.bold : fonts.reg, color: C.text, align: cols[k].align === 'left' ? 'left' : 'center' }));
        page.drawLine({ start: { x, y }, end: { x, y: y - h }, color: C.border, thickness: 0.4 });
        x += widths[k];
      });
      page.drawLine({ start: { x: R, y }, end: { x: R, y: y - h }, color: C.border, thickness: 0.4 });
      hline(page, L, R, y - h, C.border, 0.4);
      y -= h;
    });
    y -= 18;
  };

  table(
    'A. PUMP SCHEDULE',
    [
      { label: 'S/N', w: 0.04 },
      { label: 'TAG', w: 0.08 },
      { label: 'SERVICE / DESCRIPTION', w: 0.24, align: 'left' },
      { label: 'ARRANGEMENT', w: 0.08 },
      { label: 'FLOW PER PUMP (L/s)', w: 0.075 },
      { label: 'FLOW PER PUMP (m³/h)', w: 0.075 },
      { label: 'HEAD (m)', w: 0.065 },
      { label: 'HEAD (bar)', w: 0.065 },
      { label: 'MOTOR (kW)', w: 0.065 },
      { label: 'REMARKS', w: 0.19, align: 'left' },
    ],
    pumps.map((d, i) => [String(i + 1), d.tag, d.service, d.arrangement, fmt(d.flowLps, 2), fmt(lpsToM3h(d.flowLps), 2), fmt(d.headM, 1), fmt(mToBar(d.headM), 2), String(d.motorKW ?? '–'), d.remarks || '']),
  );

  if (vessels.length) {
    if (y < 140) header(true);
    table(
      'B. PRESSURE VESSEL SCHEDULE',
      [
        { label: 'S/N', w: 0.04 },
        { label: 'TAG', w: 0.08 },
        { label: 'SERVICE / DESCRIPTION', w: 0.3, align: 'left' },
        { label: 'SELECTION', w: 0.14 },
        { label: 'REMARKS', w: 0.44, align: 'left' },
      ],
      vessels.map((d, i) => [String(i + 1), d.tag, d.service, d.arrangement, d.remarks || '']),
    );
  }
  if (y > 70) drawText(page, 'Duty points per pump at design conditions. Motor ratings are recommended IEC standard frame sizes. Refer to individual calculation sheets for design basis.', { x: L, y: Math.max(y, 56), size: 7, font: fonts.ital, color: C.muted, maxWidth: R - L });
  return pages;
}

/* ------------------------------------------------------------------ */
/* PDF merge – every page normalised to A4                             */
/* ------------------------------------------------------------------ */

export async function appendPdf(doc, fonts, file) {
  let src;
  try {
    src = await PDFDocument.load(file.bytes, { ignoreEncryption: true, updateMetadata: false });
  } catch (e) {
    return { pages: [errorPage(doc, fonts, file.name, e.message)], error: `could not be read (${e.message}) – placeholder page inserted.` };
  }
  const out = [];
  let warning = null;
  if (src.isEncrypted) warning = 'is encrypted/protected – pages may render blank. Please upload an unprotected copy.';
  const srcPages = src.getPages();
  if (!srcPages.length) return { pages: [errorPage(doc, fonts, file.name, 'Document has no pages')], error: 'contains no pages.' };

  for (let i = 0; i < srcPages.length; i++) {
    const sp = srcPages[i];
    let embedded;
    try {
      const cb = sp.getCropBox();
      embedded = await doc.embedPage(sp, { left: cb.x, bottom: cb.y, right: cb.x + cb.width, top: cb.y + cb.height });
    } catch (e) {
      out.push(errorPage(doc, fonts, `${file.name} – page ${i + 1}`, e.message));
      warning = warning || `page ${i + 1} could not be embedded (${e.message}).`;
      continue;
    }
    const rot = (((sp.getRotation().angle || 0) % 360) + 360) % 360;
    const sw = embedded.width;
    const sh = embedded.height;
    const quarter = rot === 90 || rot === 270;
    const vw = quarter ? sh : sw; // visual width
    const vh = quarter ? sw : sh;
    const size = vw > vh ? A4L : A4;
    const page = doc.addPage(size);
    const box = { x: 18, y: 34, w: size[0] - 36, h: size[1] - 34 - 16 };
    const s = Math.min(box.w / vw, box.h / vh);
    const dw = vw * s;
    const dh = vh * s;
    const bx = box.x + (box.w - dw) / 2;
    const by = box.y + (box.h - dh) / 2;
    const opts = { xScale: s, yScale: s };
    if (rot === 0) page.drawPage(embedded, { ...opts, x: bx, y: by });
    else if (rot === 90) page.drawPage(embedded, { ...opts, x: bx, y: by + dh, rotate: degrees(-90) });
    else if (rot === 180) page.drawPage(embedded, { ...opts, x: bx + dw, y: by + dh, rotate: degrees(180) });
    else if (rot === 270) page.drawPage(embedded, { ...opts, x: bx + dw, y: by, rotate: degrees(90) });
    out.push(page);
  }
  return { pages: out, error: warning };
}

function errorPage(doc, fonts, name, msg) {
  const page = doc.addPage(A4);
  const [W, H] = A4;
  rect(page, 60, H / 2 - 70, W - 120, 140, { fill: C.redBg, stroke: C.red, width: 1 });
  drawText(page, 'DOCUMENT COULD NOT BE EMBEDDED', { x: W / 2, y: H / 2 + 36, size: 14, font: fonts.bold, color: C.red, align: 'center' });
  drawText(page, name, { x: W / 2, y: H / 2 + 8, size: 10, font: fonts.bold, color: C.text, align: 'center', maxWidth: W - 160 });
  wrap(fonts.reg, msg || 'Unknown error', 9, W - 160).slice(0, 3).forEach((ln, i) => drawText(page, ln, { x: W / 2, y: H / 2 - 14 - i * 12, size: 9, font: fonts.reg, color: C.muted, align: 'center' }));
  return page;
}

/** Count pages of a PDF (used by the UI on upload). */
export async function countPdfPages(bytes) {
  const d = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  return { pages: d.getPageCount(), encrypted: d.isEncrypted };
}
