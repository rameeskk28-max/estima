import { PDFDocument, rgb } from 'pdf-lib';
import { A4, C, loadFonts, drawText, clean, wrap } from './theme.js';
import { renderCalcSheet } from './calcSheet.js';
import { appendPdf } from './compile.js';
import { embedImage, dataUrlToImage } from './literaturePdf.js';
import { replySheet, annexureSlot, prevSlot } from '../replies.js';

const MAROON = rgb(0.5, 0.05, 0.05);

/** Divider page in the sheet style: header block + large centred caption. */
async function divider(doc, fonts, base, project, logoImg, title, lines = []) {
  const { pages } = await renderCalcSheet(doc, fonts, { ...base, sections: [], signatures: false }, project, logoImg);
  const page = pages[0];
  const [W, H] = A4;
  drawText(page, title, { x: W / 2, y: H / 2 + 20, size: 30, font: fonts.bold, color: MAROON, align: 'center' });
  lines.forEach((ln, i) => wrap(fonts.reg, ln, 11, W - 140).forEach((l, j) => drawText(page, l, { x: W / 2, y: H / 2 - 12 - i * 16 - j * 14, size: 11, font: fonts.reg, color: C.muted, align: 'center' })));
  return page;
}

/**
 * Full reply package: reply sheet → annexure dividers + attachments → previous submittal.
 * @param {object} reply
 * @param {object} project
 * @param {{ logo?: object, stamp?: string, files?: Record<string, {name:string, bytes:Uint8Array, pages?:number}[]>, onProgress?: (m:string)=>void }} opts
 */
export async function buildReplyPdf(reply, project, { logo, stamp, files = {}, onProgress = () => {} } = {}) {
  const doc = await PDFDocument.create();
  doc.setTitle(clean(`${reply.marNo || 'Reply'} Rev ${reply.rev || ''} – Consultant Comment Reply`));
  doc.setCreator('Greenland Pump Engineering Suite');
  const fonts = await loadFonts(doc);
  const logoImg = await embedImage(doc, logo);
  const stampImg = await embedImage(doc, dataUrlToImage(stamp));
  const warnings = [];

  const pageCounts = {};
  reply.annexures.forEach((a) => (pageCounts[a.id] = (files[annexureSlot(reply, a)] || []).reduce((s, f) => s + (f.pages || 0), 0)));
  const prevFiles = files[prevSlot(reply)] || [];
  const prevPages = prevFiles.reduce((s, f) => s + (f.pages || 0), 0);

  onProgress('Writing comment reply sheet…');
  const sheet = replySheet(reply, project, { stampPdf: stampImg, pageCounts, prevPages });
  await renderCalcSheet(doc, fonts, sheet, project, logoImg);

  const base = { ...sheet, docTitle: sheet.docTitle };
  for (const [k, a] of reply.annexures.entries()) {
    const label = `Annexure ${String(k + 1).padStart(2, '0')}`;
    const list = files[annexureSlot(reply, a)] || [];
    onProgress(`${label}…`);
    await divider(doc, fonts, base, project, logoImg, label, [a.desc || '', list.length ? `${pageCounts[a.id]} page(s) attached` : 'No document attached']);
    for (const f of list) {
      const res = await appendPdf(doc, fonts, f);
      if (res.error) warnings.push(`${label} – ${f.name}: ${res.error}`);
    }
  }
  if (prevFiles.length) {
    onProgress('Previous submittal…');
    await divider(doc, fonts, base, project, logoImg, 'PREVIOUS SUBMITTAL', [`Submittal ${reply.marNo || ''} – as previously submitted`, `${prevPages} page(s)`]);
    for (const f of prevFiles) {
      const res = await appendPdf(doc, fonts, f);
      if (res.error) warnings.push(`Previous submittal – ${f.name}: ${res.error}`);
    }
  }

  const pages = doc.getPages();
  const foot = clean(`${(project.supplier || 'GREENLAND').split(' ')[0].toUpperCase()}  |  CONSULTANT RESPONSE  |  ${reply.marNo || ''} Rev. ${reply.rev || ''}`);
  pages.forEach((p, i) => {
    const { width } = p.getSize();
    drawText(p, foot, { x: 24, y: 14, size: 6.8, font: fonts.reg, color: C.muted });
    drawText(p, `Page ${i + 1} of ${pages.length}`, { x: width - 24, y: 14, size: 7.5, font: fonts.bold, color: C.navy, align: 'right' });
  });
  onProgress('Saving…');
  return { bytes: await doc.save(), warnings, pageCount: pages.length };
}
