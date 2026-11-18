import { PDFDocument } from 'pdf-lib';
import { A4, C, loadFonts, wrap, drawText, rect, hline, vline, clean, fmtDate } from './theme.js';

const [PW, PH] = A4;
const L = 36;
const R = PW - 36;
const W = R - L;
const TOP = PH - 30;
const HEADER_H = 80;
const CONTENT_TOP = TOP - HEADER_H - 12;
const CONTENT_BOTTOM = 62;

/**
 * Appends an A4 engineering calculation sheet to `doc`.
 * @returns {Promise<{pages: import('pdf-lib').PDFPage[]}>}
 */
export async function renderCalcSheet(doc, fonts, sheet, project = {}, logoImg = null) {
  const pages = [];
  let page;
  let y;

  const newPage = () => {
    page = doc.addPage(A4);
    pages.push(page);
    y = CONTENT_TOP;
  };
  const ensure = (h) => {
    if (y - h < CONTENT_BOTTOM) {
      newPage();
      return true;
    }
    return false;
  };

  newPage();

  const sectionTitle = (title) => {
    ensure(40);
    y -= 4;
    rect(page, L, y - 16, W, 16, { fill: C.light2 });
    rect(page, L, y - 16, 3, 16, { fill: C.blue });
    drawText(page, title, { x: L + 9, y: y - 11.5, size: 9.5, font: fonts.bold, color: C.navy });
    y -= 22;
  };

  const table = (sec) => {
    sectionTitle(sec.title);
    const cols = sec.columns;
    const widths = (sec.widths || (cols.length === 3 ? [0.58, 0.24, 0.18] : cols.map(() => 1 / cols.length))).map((f) => f * W);
    const size = 8.2;
    const pad = 4;
    const lineH = size * 1.25;
    const drawHead = () => {
      const h = lineH + pad * 2;
      rect(page, L, y - h, W, h, { fill: C.navy });
      let x = L;
      cols.forEach((c, k) => {
        drawText(page, c, { x: x + pad, y: y - pad - size + 1, size, font: fonts.bold, color: C.white, maxWidth: widths[k] - pad * 2 });
        x += widths[k];
      });
      y -= h;
    };
    ensure(lineH * 3 + pad * 4);
    drawHead();
    sec.rows.forEach((row, ri) => {
      const isTotal = /^TOTAL/.test(String(row[0]));
      const font = isTotal ? fonts.bold : fonts.reg;
      const cells = row.map((cell, k) => wrap(font, cell, size, widths[k] - pad * 2));
      const h = Math.max(...cells.map((c) => c.length)) * lineH + pad * 2 - 2;
      if (ensure(h)) drawHead();
      if (ri % 2 === 1 || isTotal) rect(page, L, y - h, W, h, { fill: isTotal ? C.light2 : C.light });
      let x = L;
      cells.forEach((lines, k) => {
        lines.forEach((ln, li) => {
          const bold = k === 1 && cols.length === 3 && sec.title.startsWith('1.');
          drawText(page, ln, { x: x + pad, y: y - pad - size + 1 - li * lineH, size, font: bold ? fonts.bold : font, color: C.text });
        });
        x += widths[k];
      });
      hline(page, L, R, y - h, C.border, 0.4);
      y -= h;
    });
    // vertical grid
    y -= 8;
  };

  const steps = (sec) => {
    sectionTitle(sec.title);
    const num = sec.title.match(/^(\d+)\./)?.[1] || '2';
    sec.steps.forEach((s, idx) => {
      const sizeT = 8.6;
      const size = 8.2;
      const innerW = W - 26;
      const fLines = wrap(fonts.ital, s.formula, size, innerW - 60);
      const sLines = wrap(fonts.reg, s.subst, size, innerW - 60);
      const rLines = wrap(fonts.bold, s.result, size + 0.4, innerW - 60);
      const lh = size * 1.32;
      const h = 14 + (fLines.length + sLines.length + rLines.length) * lh + 6;
      ensure(h);
      drawText(page, `${num}.${idx + 1}`, { x: L + 2, y: y - 10, size: sizeT, font: fonts.bold, color: C.blue });
      drawText(page, s.title, { x: L + 26, y: y - 10, size: sizeT, font: fonts.bold, color: C.navy });
      let yy = y - 14 - lh + 2;
      const label = (t, lines, font, color, sz = size) => {
        drawText(page, t, { x: L + 26, y: yy, size: 7, font: fonts.reg, color: C.muted });
        lines.forEach((ln) => {
          drawText(page, ln, { x: L + 86, y: yy, size: sz, font, color });
          yy -= lh;
        });
      };
      label('Formula', fLines, fonts.ital, C.text);
      label('Substitution', sLines, fonts.reg, C.text);
      const ry = yy;
      rect(page, L + 82, ry - (rLines.length - 1) * lh - 3.5, innerW - 56, rLines.length * lh + 1.5, { fill: C.light });
      label('Result', rLines, fonts.bold, C.navy, size + 0.4);
      y -= h;
      hline(page, L + 26, R, y + 3, C.light2, 0.5);
    });
    y -= 6;
  };

  const results = (sec) => {
    sectionTitle(sec.title);
    const size = 8.6;
    const pad = 5;
    const lw = W * 0.42;
    const lh = size * 1.3;
    const rows = sec.rows.map(([a, b]) => ({ a: wrap(fonts.reg, a, size, lw - pad * 2), b: wrap(fonts.bold, b, size, W - lw - pad * 2) }));
    rows.forEach((r) => {
      const h = Math.max(r.a.length, r.b.length) * lh + pad * 2 - 2;
      ensure(h);
      rect(page, L, y - h, lw, h, { fill: C.light, stroke: C.border, width: 0.5 });
      rect(page, L + lw, y - h, W - lw, h, { stroke: C.border, width: 0.5 });
      r.a.forEach((ln, i) => drawText(page, ln, { x: L + pad, y: y - pad - size + 1 - i * lh, size, font: fonts.reg, color: C.text }));
      r.b.forEach((ln, i) => drawText(page, ln, { x: L + lw + pad, y: y - pad - size + 1 - i * lh, size, font: fonts.bold, color: C.navy }));
      y -= h;
    });
    y -= 6;
    (sec.checks || []).forEach((c) => {
      const lines = wrap(fonts.reg, c.text, 8, W - 70);
      const h = lines.length * 10.5 + 6;
      ensure(h);
      rect(page, L, y - h, W, h, { fill: c.ok ? C.greenBg : C.redBg });
      rect(page, L + 5, y - 13, 42, 10, { fill: c.ok ? C.green : C.red });
      drawText(page, c.ok ? 'PASS' : 'CHECK', { x: L + 26, y: y - 10.8, size: 7, font: fonts.bold, color: C.white, align: 'center' });
      lines.forEach((ln, i) => drawText(page, ln, { x: L + 55, y: y - 11 - i * 10.5, size: 8, font: fonts.reg, color: C.text }));
      y -= h + 3;
    });
    y -= 6;
  };

  const notes = (sec) => {
    sectionTitle(sec.title);
    sec.items.forEach((n, i) => {
      const lines = wrap(fonts.reg, n, 7.8, W - 20);
      const h = lines.length * 10 + 2;
      ensure(h);
      drawText(page, `${i + 1}.`, { x: L + 4, y: y - 8, size: 7.8, font: fonts.bold, color: C.muted });
      lines.forEach((ln, k) => drawText(page, ln, { x: L + 18, y: y - 8 - k * 10, size: 7.8, font: fonts.reg, color: C.muted }));
      y -= h;
    });
    y -= 8;
  };

  for (const sec of sheet.sections || []) {
    if (sec.type === 'table') table(sec);
    else if (sec.type === 'steps') steps(sec);
    else if (sec.type === 'results') results(sec);
    else if (sec.type === 'notes') notes(sec);
  }

  // Signature block
  const sigH = 78;
  ensure(sigH + 6);
  const colW = W / 3;
  const sy = y - 6;
  const roles = [
    ['PREPARED BY', project.preparedBy || ''],
    ['CHECKED BY', project.checkedBy || ''],
    ['APPROVED BY', project.approvedBy || ''],
  ];
  roles.forEach(([role, name], k) => {
    const x = L + k * colW;
    rect(page, x, sy - sigH, colW, sigH, { stroke: C.navy, width: 0.7 });
    rect(page, x, sy - 15, colW, 15, { fill: C.navy });
    drawText(page, role, { x: x + colW / 2, y: sy - 10.5, size: 8, font: fonts.bold, color: C.white, align: 'center' });
    const rowsY = [sy - 30, sy - 50, sy - 70];
    ['Name', 'Signature', 'Date'].forEach((lbl, j) => {
      drawText(page, `${lbl}:`, { x: x + 6, y: rowsY[j], size: 7.5, font: fonts.reg, color: C.muted });
      hline(page, x + 48, x + colW - 8, rowsY[j] - 2, C.border, 0.5);
    });
    if (name) drawText(page, name, { x: x + 50, y: sy - 30, size: 8, font: fonts.bold, color: C.text, maxWidth: colW - 58 });
    if (k === 0 && project.date) drawText(page, fmtDate(project.date), { x: x + 50, y: sy - 70, size: 8, font: fonts.reg, color: C.text });
  });

  // Headers & local footers (now that page count is known)
  pages.forEach((p, idx) => drawSheetHeader(p, fonts, sheet, project, idx + 1, pages.length, logoImg));
  return { pages };
}

function drawSheetHeader(page, fonts, sheet, project, n, total, logoImg) {
  const yTop = TOP;
  const h1 = 42;
  rect(page, L, yTop - h1, W, h1, { stroke: C.navy, width: 0.8 });
  const leftW = W * 0.42;
  vline(page, L + leftW, yTop, yTop - h1, C.navy, 0.8);
  if (logoImg) {
    const sc = Math.min(22 / logoImg.height, (leftW - 16) / logoImg.width);
    page.drawImage(logoImg, { x: L + 7, y: yTop - 5 - logoImg.height * sc, width: logoImg.width * sc, height: logoImg.height * sc });
    drawText(page, `ENGINEERING CALCULATION SHEET  ·  ${sheet.calcType || ''}`, { x: L + 8, y: yTop - 37, size: 6.8, font: fonts.bold, color: C.blue, maxWidth: leftW - 14 });
  } else {
    drawText(page, project.supplier || 'Supplier Name', { x: L + 8, y: yTop - 17, size: 12, font: fonts.bold, color: C.navy, maxWidth: leftW - 14 });
    drawText(page, 'ENGINEERING CALCULATION SHEET', { x: L + 8, y: yTop - 30, size: 7.5, font: fonts.bold, color: C.blue });
    drawText(page, sheet.calcType || '', { x: L + 8, y: yTop - 39, size: 6.8, font: fonts.reg, color: C.muted, maxWidth: leftW - 14 });
  }

  const gx = L + leftW;
  const gw = W - leftW;
  const cells = [
    ['Project', project.projectName || '–', 'Ref No.', project.refNo || '–'],
    ['Client', project.consultant || '–', 'Rev.', project.revision || '0'],
    ['Tag', sheet.tag || '–', 'Sheet', `${n} of ${total}`],
  ];
  const rh = h1 / 3;
  cells.forEach((row, r) => {
    const yy = yTop - rh * (r + 1);
    if (r > 0) hline(page, gx, R, yy + rh, C.border, 0.5);
    const c1 = gw * 0.62;
    vline(page, gx + c1, yy, yy + rh, C.border, 0.5);
    drawText(page, `${row[0]}:`, { x: gx + 5, y: yy + 4.5, size: 6.5, font: fonts.reg, color: C.muted });
    drawText(page, row[1], { x: gx + 36, y: yy + 4.5, size: 7.2, font: fonts.bold, color: C.text, maxWidth: c1 - 40 });
    drawText(page, `${row[2]}:`, { x: gx + c1 + 5, y: yy + 4.5, size: 6.5, font: fonts.reg, color: C.muted });
    drawText(page, row[3], { x: gx + c1 + 38, y: yy + 4.5, size: 7.2, font: fonts.bold, color: C.text, maxWidth: gw - c1 - 42 });
  });

  const tb = yTop - h1;
  rect(page, L, tb - 22, W, 22, { fill: C.navy });
  drawText(page, sheet.docTitle || 'CALCULATION', { x: L + W / 2, y: tb - 15, size: 10.5, font: fonts.bold, color: C.white, align: 'center', maxWidth: W - 20 });
  rect(page, L, tb - 38, W, 16, { fill: C.light, stroke: C.border, width: 0.5 });
  drawText(page, 'Equipment Tag:', { x: L + 6, y: tb - 33, size: 7.5, font: fonts.reg, color: C.muted });
  drawText(page, sheet.tag || '–', { x: L + 64, y: tb - 33, size: 8, font: fonts.bold, color: C.navy });
  drawText(page, 'Service:', { x: L + 150, y: tb - 33, size: 7.5, font: fonts.reg, color: C.muted });
  drawText(page, sheet.service || '–', { x: L + 182, y: tb - 33, size: 8, font: fonts.bold, color: C.navy, maxWidth: W - 190 });

  // local footer
  hline(page, L, R, 50, C.border, 0.5);
  drawText(page, clean(`${project.supplier || ''}${project.refNo ? '  |  ' + project.refNo : ''}`), { x: L, y: 40, size: 6.8, font: fonts.reg, color: C.muted, maxWidth: W * 0.6 });
  drawText(page, `${sheet.tag || ''} – Sheet ${n} of ${total}`, { x: R, y: 40, size: 6.8, font: fonts.bold, color: C.muted, align: 'right' });
}

/** Standalone calculation-sheet PDF (download from calculators). */
export async function buildCalcSheetPdf(sheet, project, logo) {
  const doc = await PDFDocument.create();
  doc.setTitle(clean(`${sheet.tag} – ${sheet.docTitle}`));
  doc.setAuthor(clean(project?.preparedBy || project?.supplier || ''));
  doc.setCreator('Greenland Pump Engineering Suite');
  const fonts = await loadFonts(doc);
  let img = null;
  if (logo?.bytes) {
    try {
      img = /png/i.test(logo.type) ? await doc.embedPng(logo.bytes) : await doc.embedJpg(logo.bytes);
    } catch {
      img = null;
    }
  }
  await renderCalcSheet(doc, fonts, sheet, project, img);
  return doc.save();
}
