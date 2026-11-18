import { PDFDocument, rgb } from 'pdf-lib';
import { A4, C, loadFonts, wrap, drawText, rect, hline, clean } from './theme.js';
import { appendPdf } from './compile.js';
import { fillText, lines, dutyText } from '../literature.js';

export const SLOGAN = 'Sustainable engineering solutions for better tomorrow.';
const RED = rgb(0.85, 0.11, 0.11);
const [PW, PH] = A4;
const L = 64;
const R = PW - 56;
const W = R - L;

export async function embedImage(doc, img) {
  if (!img?.bytes) return null;
  try {
    return /png/i.test(img.type) ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
  } catch {
    return null;
  }
}

export function dataUrlToImage(dataUrl) {
  if (!dataUrl) return null;
  const [meta, b64] = dataUrl.split(',');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, type: /png/i.test(meta) ? 'image/png' : 'image/jpeg' };
}

function brandHeader(page, fonts, logoImg, big) {
  const maxW = big ? 230 : 170;
  if (logoImg) {
    const sc = Math.min(maxW / logoImg.width, (big ? 56 : 40) / logoImg.height);
    const w = logoImg.width * sc;
    const h = logoImg.height * sc;
    const top = big ? PH - 70 : PH - 42;
    page.drawImage(logoImg, { x: PW / 2 - w / 2, y: top - h, width: w, height: h });
    drawText(page, SLOGAN, { x: PW / 2, y: top - h - 11, size: big ? 8.5 : 7.5, font: fonts.ital, color: C.navy, align: 'center' });
    return top - h - 22;
  }
  drawText(page, 'GREENLAND', { x: PW / 2, y: PH - 70, size: 22, font: fonts.bold, color: C.navy, align: 'center' });
  return PH - 100;
}

function watermark(page, img) {
  if (!img) return;
  const sc = Math.min((PW - 80) / img.width, 420 / img.height);
  const w = img.width * sc;
  const h = img.height * sc;
  page.drawImage(img, { x: PW / 2 - w / 2, y: PH / 2 - h / 2 - 40, width: w, height: h, opacity: 0.16 });
}

function underlined(page, text, { x, y, size, font, color = C.navy, align = 'left' }) {
  drawText(page, text, { x, y, size, font, color, align });
  const w = font.widthOfTextAtSize(clean(text), size);
  const x0 = align === 'center' ? x - w / 2 : x;
  hline(page, x0, x0 + w, y - 2, color, 0.8);
}

/** Render one technical literature (cover + content pages). */
export function renderLiterature(doc, fonts, lit, project = {}, { logoImg, productImg } = {}) {
  const pages = [];
  const f = (t) => fillText(t, lit);

  if (lit.cover !== false) {
    const page = doc.addPage(A4);
    pages.push(page);
    brandHeader(page, fonts, logoImg, true);
    watermark(page, productImg);
    const title = `${lit.title || ''} – ${dutyText(lit.propFlow, lit.propHead)}`;
    const tl = wrap(fonts.boldItal, title, 15, W);
    tl.forEach((ln, i) => underlined(page, ln, { x: PW / 2, y: PH / 2 + 10 - i * 22, size: 15, font: fonts.boldItal, align: 'center' }));
    if (project.projectName) drawText(page, project.projectName, { x: PW / 2, y: 110, size: 10, font: fonts.bold, color: C.navy, align: 'center', maxWidth: W });
    if (project.refNo) drawText(page, `${project.refNo}${project.revision ? `  ·  Rev. ${project.revision}` : ''}`, { x: PW / 2, y: 95, size: 8.5, font: fonts.reg, color: C.muted, align: 'center' });
  }

  let page;
  let y;
  const newPage = () => {
    page = doc.addPage(A4);
    pages.push(page);
    watermark(page, productImg);
    y = brandHeader(page, fonts, logoImg, false) - 12;
  };
  const ensure = (h) => {
    if (y - h < 60) newPage();
  };
  newPage();
  y -= 8;
  underlined(page, 'TECHNICAL LITERATURE', { x: PW / 2, y, size: 13, font: fonts.bold, align: 'center' });
  y -= 30;

  const kv = (label, value, { bold, red } = {}) => {
    const lab = `${label} : `;
    const lw = fonts.ital.widthOfTextAtSize(clean(lab), 9.5);
    const vf = bold ? fonts.boldItal : fonts.ital;
    const vl = wrap(vf, value || '–', 9.5, W - lw);
    ensure(vl.length * 13 + 8);
    drawText(page, lab, { x: L, y, size: 9.5, font: fonts.ital, color: red ? RED : C.text });
    vl.forEach((ln, i) => drawText(page, ln, { x: L + lw, y: y - i * 13, size: 9.5, font: vf, color: red ? RED : C.text }));
    y -= vl.length * 13 + 9;
  };
  kv('SYSTEM', lit.title, { bold: true });
  kv('CONFIGURATION', lit.config);
  kv(`${(lit.brand || '').toUpperCase()} PUMP MODEL${lit.pumpType ? ' (Type)' : ''}`, `${lit.model || '–'}${lit.pumpType ? ` (${lit.pumpType})` : ''}`, { bold: true });
  if (lit.motor) kv('MOTOR', lit.motor);
  if (lit.certification) kv('CERTIFICATION', lit.certification, { bold: true });
  kv('REQUESTED DUTY', dutyText(lit.reqFlow, lit.reqHead), { red: true });
  kv('PROPOSED DUTY', dutyText(lit.propFlow, lit.propHead), { red: true });

  // keep the heading together with roughly its first paragraph
  const heading = (t, keep = 40) => {
    ensure(keep);
    y -= 6;
    underlined(page, t, { x: L, y, size: 9.5, font: fonts.boldItal });
    y -= 17;
  };

  const moc = (lit.moc || []).filter((m) => m.k || m.v);
  if (moc.length) {
    heading('MATERIAL OF CONSTRUCTION');
    moc.forEach((m) => {
      ensure(14);
      drawText(page, m.k, { x: L, y, size: 9, font: fonts.ital, color: C.text });
      drawText(page, `: ${m.v}`, { x: L + 120, y, size: 9, font: fonts.ital, color: C.text, maxWidth: W - 120 });
      y -= 14;
    });
    y -= 4;
  }

  const bulletList = (items, style) => {
    items.forEach((it) => {
      const txt = f(it);
      const ls = wrap(fonts.ital, txt, 9, W - (style === 'para' ? 0 : 34));
      ensure(ls.length * 12.5 + 3);
      if (style === 'dot') page.drawCircle({ x: L + 26, y: y + 3, size: 1.8, color: C.text });
      if (style === 'diamond') {
        const cx = L + 8;
        const cy = y + 3;
        page.drawSvgPath(`M ${cx} ${-cy - 3.6} L ${cx + 2.6} ${-cy} L ${cx} ${-cy + 3.6} L ${cx - 2.6} ${-cy} Z`, { x: 0, y: 0, color: C.sky });
      }
      const x = style === 'para' ? L : style === 'dot' ? L + 34 : L + 18;
      ls.forEach((ln, i) => drawText(page, ln, { x, y: y - i * 12.5, size: 9, font: fonts.ital, color: C.text }));
      y -= ls.length * 12.5 + (style === 'para' ? 9 : 3);
    });
    y -= 6;
  };

  const control = lines(lit.control);
  if (control.length) {
    heading('CONTROL FEATURES', 70);
    bulletList(control, 'dot');
  }
  const mech = lines(lit.mechanical);
  if (mech.length) {
    heading('MECHANICAL FEATURES', 70);
    bulletList(mech, 'diamond');
  }
  const logic = lines(lit.logic);
  if (logic.length) {
    heading('LOGIC OF OPERATION', 30 + Math.min(wrap(fonts.ital, fillText(logic[0], lit), 9, W - 34).length, 5) * 12.5);
    bulletList(logic, lit.logicStyle === 'paragraphs' ? 'para' : 'dot');
  }
  if (lit.scope) {
    heading('Scope of supply');
    bulletList([lit.scope], 'para');
  }
  return pages;
}

/** Standalone literature PDF: literature pages + attached datasheets & drawings. */
export async function buildLiteraturePdf(lit, project, { logo, attachments = [] } = {}) {
  const doc = await PDFDocument.create();
  doc.setTitle(clean(`Technical Literature – ${lit.title}`));
  doc.setCreator('Greenland Pump Engineering Suite');
  const fonts = await loadFonts(doc);
  const logoImg = await embedImage(doc, logo);
  const productImg = await embedImage(doc, dataUrlToImage(lit.image));
  renderLiterature(doc, fonts, lit, project, { logoImg, productImg });
  const warnings = [];
  for (const file of attachments) {
    const res = await appendPdf(doc, fonts, file);
    if (res.error) warnings.push(`${file.name}: ${res.error}`);
  }
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const { width } = p.getSize();
    drawText(p, `Page ${i + 1} of ${pages.length}`, { x: width - 24, y: 16, size: 7, font: fonts.reg, color: C.muted, align: 'right' });
    if (project.refNo) drawText(p, project.refNo, { x: 24, y: 16, size: 7, font: fonts.reg, color: C.muted });
  });
  return { bytes: await doc.save(), warnings };
}

export { rect };
