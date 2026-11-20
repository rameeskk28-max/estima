import { PDFDocument, rgb, degrees } from 'pdf-lib';
import { A4, C, loadFonts, wrap, drawText, rect, hline, vline, clean, fmtDate } from './theme.js';

const [PW, PH] = A4;
const TONES = { green: { fg: C.green, bg: C.greenBg }, amber: { fg: rgb(0.66, 0.38, 0.02), bg: rgb(1, 0.95, 0.85) }, red: { fg: C.red, bg: C.redBg }, blue: { fg: C.navy, bg: C.light } };
const L = 30;
const R = PW - 30;
const W = R - L;
const TOP = PH - 26;
const HEADER_H = 64;
const CONTENT_TOP = TOP - HEADER_H - 10;
const CONTENT_BOTTOM = 50;

/** Replace "@field" placeholders with project header values. */
export const resolve = (v, project = {}) => (typeof v === 'string' && v.startsWith('@') ? project[v.slice(1)] || '–' : v);

/** Normalise any section into { columns, rows } for the table writer. */
export function sectionTable(sec, project) {
  if (sec.type === 'info') {
    return {
      columns: [
        { label: '', w: 0.28 },
        { label: '', w: 0.72 },
      ],
      noHead: true,
      rows: sec.rows.map(([k, v]) => ({ c: [k, resolve(v, project)], keyCol: true })),
    };
  }
  if (sec.type === 'steps') {
    return {
      columns: sec.columns,
      rows: sec.steps.map((s) => ({ c: [String(s.n), s.calc, s.formula, s.value, s.unit, s.ref], bold: s.bold, refCol: 5, valCol: 3 })),
    };
  }
  return { columns: sec.columns, rows: sec.rows };
}

/**
 * Appends an A4 calculation sheet to `doc` (Greenland calculation format).
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
    ensure(44);
    y -= 2;
    rect(page, L, y - 13.5, W, 13.5, { fill: C.navy });
    drawText(page, title, { x: L + 6, y: y - 9.8, size: 8, font: fonts.bold, color: C.white, maxWidth: W - 12 });
    y -= 13.5;
  };

  const table = (sec) => {
    const t = sectionTable(sec, project);
    const widths = t.columns.map((c) => c.w * W);
    const dense = t.columns.length > 8;
    const size = dense ? 6.4 : 7;
    const lh = size * 1.2;
    const pad = dense ? 2.4 : 2.8;
    const drawHead = () => {
      if (t.noHead) return;
      const lines = t.columns.map((c, k) => wrap(fonts.bold, c.label, size - 0.2, widths[k] - pad * 2));
      const h = Math.max(...lines.map((l) => l.length)) * lh + pad * 2;
      rect(page, L, y - h, W, h, { fill: C.light2 });
      let x = L;
      lines.forEach((ls, k) => {
        ls.forEach((ln, li) => {
          const cx = t.columns[k].align === 'c' ? x + widths[k] / 2 : t.columns[k].align === 'r' ? x + widths[k] - pad : x + pad;
          drawText(page, ln, { x: cx, y: y - pad - size + 1 - li * lh, size: size - 0.2, font: fonts.bold, color: C.navy, align: t.columns[k].align === 'c' ? 'center' : t.columns[k].align === 'r' ? 'right' : 'left' });
        });
        vline(page, x, y, y - h, C.border, 0.5);
        x += widths[k];
      });
      vline(page, R, y, y - h, C.border, 0.5);
      hline(page, L, R, y - h, C.border, 0.6);
      hline(page, L, R, y, C.border, 0.6);
      y -= h;
    };
    ensure(lh * 3 + pad * 4);
    drawHead();
    t.rows.forEach((r) => {
      const toned = (k) => r.tone && r.tone.col === k;
      const fontFor = (k) => (r.bold || (r.keyCol && k === 0) || r.valCol === k || toned(k) ? fonts.bold : r.refCol === k ? fonts.ital : fonts.reg);
      const cells = r.c.map((cell, k) => wrap(fontFor(k), cell ?? '', size, widths[k] - pad * 2));
      const h = Math.max(...cells.map((c) => c.length)) * lh + pad * 2 - 1;
      if (ensure(h)) drawHead();
      if (r.bold) rect(page, L, y - h, W, h, { fill: C.greenBg });
      else if (r.keyCol) rect(page, L, y - h, widths[0], h, { fill: C.light });
      let x = L;
      cells.forEach((lines, k) => {
        const flagged = r.flag === k;
        if (flagged) rect(page, x + 0.5, y - h + 0.5, widths[k] - 1, h - 1, { fill: C.redBg });
        if (toned(k)) rect(page, x + 0.5, y - h + 0.5, widths[k] - 1, h - 1, { fill: TONES[r.tone.color].bg });
        lines.forEach((ln, li) => {
          const center = t.columns[k].align === 'c';
          const right = t.columns[k].align === 'r';
          drawText(page, ln, {
            x: center ? x + widths[k] / 2 : right ? x + widths[k] - pad : x + pad,
            y: y - pad - size + 1 - li * lh,
            size,
            font: fontFor(k),
            color: toned(k) ? TONES[r.tone.color].fg : flagged ? C.red : r.refCol === k ? C.muted : r.valCol === k || r.bold ? C.navy : C.text,
            align: center ? 'center' : right ? 'right' : 'left',
          });
        });
        vline(page, x, y, y - h, C.border, 0.5);
        x += widths[k];
      });
      vline(page, R, y, y - h, C.border, 0.5);
      hline(page, L, R, y - h, C.border, 0.5);
      y -= h;
    });
    if (sec.legend?.length) {
      y -= 4;
      sec.legend.forEach((ln) => {
        const lines = wrap(fonts.ital, ln, 6.4, W - 8);
        ensure(lines.length * 8 + 2);
        lines.forEach((l) => {
          drawText(page, l, { x: L + 4, y: y - 7, size: 6.4, font: fonts.ital, color: C.muted });
          y -= 8;
        });
      });
    }
    y -= 7;
  };

  const resultLine = (sec) => {
    const lines = wrap(fonts.bold, sec.text, 9, W - 20);
    const h = lines.length * 12 + 10;
    ensure(h + 4);
    rect(page, L, y - h, W, h, { fill: C.greenBg, stroke: C.sky, width: 1 });
    rect(page, L, y - h, 4, h, { fill: C.sky });
    lines.forEach((ln, i) => drawText(page, ln, { x: L + 12, y: y - 13 - i * 12, size: 9, font: fonts.bold, color: C.navy }));
    y -= h + 8;
  };

  const note = (sec) => {
    const lines = wrap(fonts.ital, sec.text, 7.4, W - 8);
    ensure(lines.length * 9.5 + 4);
    lines.forEach((ln) => {
      drawText(page, ln, { x: L + 2, y: y - 8, size: 7.4, font: fonts.ital, color: C.muted });
      y -= 9.5;
    });
    y -= 6;
  };

  // Plain paragraph(s) – "\n" starts a new line
  const para = (sec) => {
    if (sec.title) sectionTitle(sec.title);
    y -= 4;
    String(sec.text || '')
      .split('\n')
      .forEach((pl) => {
        const lines = pl.trim() ? wrap(fonts.reg, pl, 8.8, W - 8) : [''];
        lines.forEach((ln) => {
          ensure(13);
          drawText(page, ln, { x: L + 4, y: y - 9, size: 8.8, font: /^AUTHORI[SZ]ED|^For:/i.test(pl.trim()) ? fonts.bold : fonts.reg, color: C.text });
          y -= 12.5;
        });
      });
    y -= 8;
  };

  // Framed picture (e.g. product photo) – sec.pdfImage is an embedded PDFImage
  const imageBox = (sec) => {
    if (!sec.pdfImage) return;
    const boxH = sec.height || 170;
    ensure(boxH + 8 + (sec.title ? 26 : 0)); // keep the title with its picture
    if (sec.title) sectionTitle(sec.title);
    ensure(boxH + 8);
    const bw = sec.boxWidth ? sec.boxWidth * W : W;
    const bx = sec.align === 'right' ? R - bw : L;
    rect(page, bx, y - boxH, bw, boxH, { stroke: C.border, width: 0.5 });
    if (sec.caption) drawText(page, sec.caption, { x: bx + bw / 2, y: y - boxH + 5, size: 6.6, font: fonts.bold, color: C.muted, align: 'center' });
    const img = sec.pdfImage;
    const sc = Math.min((bw - 20) / img.width, (boxH - (sec.caption ? 24 : 16)) / img.height);
    page.drawImage(img, { x: bx + bw / 2 - (img.width * sc) / 2, y: y - boxH / 2 - (img.height * sc) / 2 + (sec.caption ? 5 : 0), width: img.width * sc, height: img.height * sc });
    y -= boxH + 8;
  };

  // images supplied as data URLs (e.g. pipe route from a drawing) are embedded here
  const sections = [];
  for (const sec of sheet.sections || []) {
    if (sec.type === 'image' && sec.src && !sec.pdfImage) {
      try {
        const m = /^data:image\/(png|jpe?g);base64,(.*)$/i.exec(sec.src);
        if (m) {
          const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
          sections.push({ ...sec, pdfImage: /png/i.test(m[1]) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes) });
          continue;
        }
      } catch {
        /* skip a broken image */
      }
    }
    sections.push(sec);
  }
  for (const sec of sections) {
    if (sec.type === 'result') resultLine(sec);
    else if (sec.type === 'note') note(sec);
    else if (sec.type === 'image') imageBox(sec);
    else if (sec.type === 'para') para(sec);
    else {
      sectionTitle(sec.title);
      table(sec);
    }
  }

  // Signature block
  if (sheet.signatures !== false) {
  const sigH = 46;
  ensure(sigH + 4);
  const colW = W / 3;
  const sy = y - 4;
  [
    ['PREPARED BY', project.preparedBy || ''],
    ['CHECKED BY', project.checkedBy || ''],
    ['APPROVED BY', project.approvedBy || ''],
  ].forEach(([role, name], k) => {
    const x = L + k * colW;
    rect(page, x, sy - sigH, colW, sigH, { stroke: C.navy, width: 0.7 });
    rect(page, x, sy - 13, colW, 13, { fill: C.navy });
    drawText(page, role, { x: x + colW / 2, y: sy - 9.3, size: 7.4, font: fonts.bold, color: C.white, align: 'center' });
    [sy - 23, sy - 34, sy - 45 + 2].forEach((ry, j) => {
      drawText(page, `${['Name', 'Signature', 'Date'][j]}:`, { x: x + 6, y: ry, size: 7, font: fonts.reg, color: C.muted });
      hline(page, x + 46, x + colW - 8, ry - 2, C.border, 0.5);
    });
    if (name) drawText(page, name, { x: x + 48, y: sy - 23, size: 7.6, font: fonts.bold, color: C.text, maxWidth: colW - 56 });
    if (k === 0 && project.date) drawText(page, fmtDate(project.date), { x: x + 48, y: sy - 43, size: 7.6, font: fonts.reg, color: C.text });
  });

  }
  if (sheet.watermark)
    pages.forEach((p) => {
      const size = 120;
      const w = fonts.bold.widthOfTextAtSize(sheet.watermark, size);
      const a = (35 * Math.PI) / 180;
      p.drawText(sheet.watermark, { x: PW / 2 - (w / 2) * Math.cos(a) + (size / 3) * Math.sin(a), y: PH / 2 - (w / 2) * Math.sin(a) - (size / 3) * Math.cos(a), size, font: fonts.bold, color: rgb(0.75, 0.1, 0.1), opacity: 0.12, rotate: degrees(35) });
    });
  pages.forEach((p, idx) => drawSheetHeader(p, fonts, sheet, project, idx + 1, pages.length, logoImg));
  return { pages };
}

function drawSheetHeader(page, fonts, sheet, project, n, total, logoImg) {
  const yTop = TOP;
  const h1 = 40;
  rect(page, L, yTop - h1, W, h1, { stroke: C.navy, width: 0.8 });
  const leftW = W * 0.36;
  vline(page, L + leftW, yTop, yTop - h1, C.navy, 0.8);
  if (logoImg) {
    const sc = Math.min(24 / logoImg.height, (leftW - 16) / logoImg.width);
    page.drawImage(logoImg, { x: L + 7, y: yTop - 4 - logoImg.height * sc, width: logoImg.width * sc, height: logoImg.height * sc });
  } else {
    drawText(page, project.supplier || 'Supplier', { x: L + 8, y: yTop - 18, size: 11, font: fonts.bold, color: C.navy, maxWidth: leftW - 14 });
  }
  drawText(page, sheet.sheetLabel || 'HYDRAULIC CALCULATION SHEET', { x: L + 8, y: yTop - 35, size: 6.4, font: fonts.bold, color: C.blue });
  const gx = L + leftW;
  const gw = W - leftW;
  const cells = [
    ['Project', project.projectName || '–', 'Ref No.', sheet.ref || project.refNo || '–'],
    ['Tag', sheet.tag || '–', 'Rev.', sheet.rev || project.revision || '0'],
    ['Date', fmtDate(sheet.date || project.date) || '–', 'Sheet', `${n} of ${total}`],
  ];
  const rh = h1 / 3;
  cells.forEach((row, r) => {
    const yy = yTop - rh * (r + 1);
    if (r > 0) hline(page, gx, R, yy + rh, C.border, 0.5);
    const c1 = gw * 0.66;
    vline(page, gx + c1, yy, yy + rh, C.border, 0.5);
    drawText(page, `${row[0]}:`, { x: gx + 5, y: yy + 4.3, size: 6.3, font: fonts.reg, color: C.muted });
    drawText(page, row[1], { x: gx + 36, y: yy + 4.3, size: 7, font: fonts.bold, color: C.text, maxWidth: c1 - 40 });
    drawText(page, `${row[2]}:`, { x: gx + c1 + 5, y: yy + 4.3, size: 6.3, font: fonts.reg, color: C.muted });
    drawText(page, row[3], { x: gx + c1 + 38, y: yy + 4.3, size: 7, font: fonts.bold, color: C.text, maxWidth: gw - c1 - 42 });
  });
  const tb = yTop - h1;
  rect(page, L, tb - 20, W, 20, { fill: C.sky });
  drawText(page, sheet.docTitle || 'HYDRAULIC CALCULATION', { x: L + W / 2, y: tb - 13.5, size: 10, font: fonts.bold, color: C.white, align: 'center', maxWidth: W - 20 });

  hline(page, L, R, 48, C.border, 0.5);
  drawText(page, clean(`${project.supplier || ''}${project.refNo ? '  |  ' + project.refNo : ''}`), { x: L, y: 39, size: 6.6, font: fonts.reg, color: C.muted, maxWidth: W * 0.6 });
  drawText(page, `${sheet.tag || ''} – Sheet ${n} of ${total}`, { x: R, y: 39, size: 6.6, font: fonts.bold, color: C.muted, align: 'right' });
}

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
