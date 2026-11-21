import { PDFDocument } from 'pdf-lib';
import { C, loadFonts, drawText, clean } from './theme.js';
import { appendPdf } from './compile.js';
import { renderCalcSheet } from './calcSheet.js';
import { literatureSheet } from '../literature.js';

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

/**
 * Render one technical literature with the calculation-sheet layout
 * (same header block, title bar, section bars, tables and signatures).
 */
export async function renderLiterature(doc, fonts, lit, project = {}, { logoImg, productImg } = {}) {
  const sheet = literatureSheet(lit, { pdfImage: productImg });
  const { pages } = await renderCalcSheet(doc, fonts, sheet, project, logoImg);
  return pages;
}

/** Standalone literature PDF: literature sheet + attached datasheets & drawings. */
export async function buildLiteraturePdf(lit, project, { logo, attachments = [] } = {}) {
  const doc = await PDFDocument.create();
  doc.setTitle(clean(`Technical Literature – ${lit.title}`));
  doc.setCreator('Greenland Pump Engineering Suite');
  const fonts = await loadFonts(doc);
  const logoImg = await embedImage(doc, logo);
  const productImg = await embedImage(doc, dataUrlToImage(lit.image));
  await renderLiterature(doc, fonts, lit, project, { logoImg, productImg });
  const warnings = [];
  for (const file of attachments) {
    const res = await appendPdf(doc, fonts, file);
    if (res.error) warnings.push(`${file.name}: ${res.error}`);
  }
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const { width } = p.getSize();
    drawText(p, `Page ${i + 1} of ${pages.length}`, { x: width / 2, y: 18, size: 8, font: fonts.reg, color: C.muted, align: 'center' });
  });
  return { bytes: await doc.save(), warnings };
}
