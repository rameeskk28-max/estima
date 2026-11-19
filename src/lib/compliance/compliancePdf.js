// Technical Compliance Statement – Greenland submittal template (GL-FE-26-00022 style).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { clean, wrap, rect, hline, vline } from '../pdf/theme.js';
import { STATUS } from './spec.js';

const A4 = [595.28, 841.89];
const [PW, PH] = A4;
const L = 36;
const R = PW - 36;
const W = R - L;
const DARK = rgb(0.12, 0.33, 0.19); // table header
const GREEN = rgb(0.17, 0.48, 0.24); // part bars / labels
const NAVY = rgb(0.13, 0.22, 0.4);
const INK = rgb(0.1, 0.1, 0.12);
const GREY = rgb(0.45, 0.45, 0.48);
const LINE = rgb(0.55, 0.58, 0.62);
const TONE = {
  green: { fg: rgb(0.15, 0.45, 0.2), bg: rgb(0.91, 0.96, 0.92) },
  amber: { fg: rgb(0.66, 0.45, 0.05), bg: rgb(1, 0.97, 0.9) },
  red: { fg: rgb(0.62, 0.1, 0.12), bg: rgb(1, 1, 1) },
  grey: { fg: rgb(0.5, 0.5, 0.52), bg: rgb(0.95, 0.95, 0.96) },
};
const COLS = [
  { label: 'CLAUSE', w: 0.09 },
  { label: 'SPECIFICATION REQUIREMENT', w: 0.33 },
  { label: 'COMPLIANCE / REMARKS', w: 0.39 },
  { label: 'STATUS', w: 0.19, c: true },
];

export const DEFAULT_FOOTER = 'Head Office - Dubai (M.A.H.Y. Khoory Compound), P.O.Box: 29482, Near Abu Hail Metro Station | Phone: +9714 333 4515 | Email: info@greenland.ae';

const txt = (page, s, o) => {
  const t = clean(s);
  let x = o.x;
  if (o.align === 'center') x -= o.font.widthOfTextAtSize(t, o.size) / 2;
  if (o.align === 'right') x -= o.font.widthOfTextAtSize(t, o.size);
  page.drawText(t, { x, y: o.y, size: o.size, font: o.font, color: o.color || INK });
};

/** Key items = deviations (and partials) with their remarks. */
export function autoKeyItems(rows) {
  return rows
    .filter((r) => r.type === 'clause' && (r.status === 'deviation' || r.status === 'partial'))
    .map((r) => `Clause ${r.clause}: ${r.remarks || r.text}`.replace(/\s+/g, ' ').slice(0, 300));
}

/**
 * @param {PDFDocument} doc
 * @param {object} cs compliance data
 * @param {object} project
 * @param {{logoImg?: any, stampImg?: any, footer?: string}} opts
 */
export async function renderCompliance(doc, cs, project = {}, { logoImg, stampImg, footer = DEFAULT_FOOTER } = {}) {
  const f = {
    reg: await doc.embedFont(StandardFonts.TimesRoman),
    bold: await doc.embedFont(StandardFonts.TimesRomanBold),
    ital: await doc.embedFont(StandardFonts.TimesRomanItalic),
  };
  const pages = [];
  let page;
  let y;
  const widths = COLS.map((c) => c.w * W);
  const BOTTOM = 70;

  const newPage = () => {
    page = doc.addPage(A4);
    pages.push(page);
    if (logoImg) {
      const sc = Math.min(150 / logoImg.width, 42 / logoImg.height);
      page.drawImage(logoImg, { x: L, y: PH - 30 - logoImg.height * sc, width: logoImg.width * sc, height: logoImg.height * sc });
      hline(page, L + logoImg.width * sc + 16, R, PH - 30 - (logoImg.height * sc) / 2 - 6, GREEN, 0.8);
    }
    txt(page, footer, { x: PW / 2, y: 38, size: 6.6, font: f.ital, color: GREY, align: 'center' });
    y = PH - 92;
  };
  const tableHead = () => {
    const h = 20;
    rect(page, L, y - h, W, h, { fill: DARK });
    let x = L;
    COLS.forEach((c, k) => {
      txt(page, c.label, { x: c.c ? x + widths[k] / 2 : x + 5, y: y - 13.5, size: 8.6, font: f.bold, color: rgb(1, 1, 1), align: c.c ? 'center' : 'left' });
      x += widths[k];
    });
    y -= h;
  };
  const ensure = (h, withHead = true) => {
    if (y - h < BOTTOM) {
      newPage();
      if (withHead) tableHead();
      return true;
    }
    return false;
  };

  newPage();
  // Title block
  y -= 4;
  txt(page, 'TECHNICAL COMPLIANCE STATEMENT', { x: PW / 2, y, size: 17, font: f.bold, color: NAVY, align: 'center' });
  y -= 18;
  const sub = cs.subtitle || `Specification Section ${cs.specNo || ''} (${title(cs.specName)}) vs. Offered ${title(cs.brandOffered || 'Franklin Electric')} Pump Sets`;
  wrap(f.ital, sub, 9.5, W).forEach((ln) => {
    txt(page, ln, { x: PW / 2, y, size: 9.5, font: f.ital, color: GREY, align: 'center' });
    y -= 12;
  });
  y -= 10;
  // Project table
  const info = [
    ['PROJECT', project.projectName],
    ['MAIN CONTRACTOR', project.contractor],
    ['CONSULTANT', project.consultant],
    ['SPECIFICATION REF.', [cs.specNo && `Section ${cs.specNo}`, cs.specName].filter(Boolean).join(' - ')],
    ['SUPPLIER', cs.supplier || 'M/S. Greenland Equipment & Machinery EST LLC'],
    ['BRAND OFFERED', cs.brandOffered || 'Franklin Electric Pumps'],
  ];
  const lw = W * 0.26;
  const tw = W * 0.93;
  info.forEach(([k, v]) => {
    const lines = wrap(f.bold, v || '–', 9.2, tw - lw - 12);
    const h = Math.max(20, lines.length * 11.5 + 8);
    rect(page, L, y - h, lw, h, { fill: GREEN, stroke: INK, width: 0.6 });
    rect(page, L + lw, y - h, tw - lw, h, { stroke: INK, width: 0.6 });
    txt(page, k, { x: L + 6, y: y - h / 2 - 3, size: 9, font: f.bold, color: rgb(1, 1, 1) });
    lines.forEach((ln, i) => txt(page, ln, { x: L + lw + 6, y: y - h / 2 + ((lines.length - 1) * 11.5) / 2 - 3 - i * 11.5, size: 9.2, font: f.bold, color: NAVY }));
    y -= h;
  });
  y -= 22;

  // Rows – a green bar for each PART / sub-part; the table header is drawn before the first row under it
  let needHead = false;
  let headed = false;
  let lastWasBar = false;
  const bar = (label) => {
    if (!lastWasBar) y -= 12;
    if (y - 90 < BOTTOM) newPage();
    rect(page, L, y - 16, W, 16, { fill: GREEN });
    txt(page, label.toUpperCase(), { x: L + 8, y: y - 11.8, size: 9.6, font: f.bold, color: rgb(1, 1, 1) });
    y -= 22;
    needHead = true;
    headed = true;
    lastWasBar = true;
  };
  for (const r of cs.rows || []) {
    if (r.hidden) continue;
    if (r.type === 'part') {
      bar(r.text);
      continue;
    }
    if (r.type === 'heading') {
      bar(`PART ${r.clause} - ${r.text}`);
      continue;
    }
    if (!headed) bar('Specification clauses');
    if (needHead) {
      if (y - 60 < BOTTOM) newPage();
      tableHead();
      needHead = false;
    }
    lastWasBar = false;
    const st = STATUS[r.status];
    const tone = st ? TONE[st.color] : null;
    const size = 8.4;
    const lh = 10.4;
    const cells = [
      wrap(f.bold, r.clause || '', size, widths[0] - 8),
      wrap(f.reg, r.text || '', size, widths[1] - 8),
      wrap(f.reg, r.remarks || '', size, widths[2] - 8),
      wrap(f.bold, st ? (r.status === 'na' ? 'N/A' : st.label) : '', size + 0.4, widths[3] - 8),
    ];
    // very long requirement texts are split across pages
    let start = 0;
    const total = Math.max(...cells.map((c) => c.length));
    while (start < total) {
      const room = Math.max(3, Math.floor((y - BOTTOM - 10) / lh));
      if (room < 3 || y - (Math.min(total - start, 3) * lh + 10) < BOTTOM) {
        newPage();
        tableHead();
        continue;
      }
      const n = Math.min(total - start, room);
      const h = n * lh + 10;
      if (r.status === 'na') rect(page, L, y - h, W, h, { fill: TONE.grey.bg });
      if (tone && r.status !== 'na') rect(page, L + widths[0] + widths[1] + widths[2], y - h, widths[3], h, { fill: tone.bg });
      let x = L;
      cells.forEach((lines, k) => {
        const part = lines.slice(start, start + n);
        const vy = k === 3 || k === 0 ? y - h / 2 + ((part.length - 1) * lh) / 2 - 3 : y - 6 - size + 2;
        part.forEach((ln, i) =>
          txt(page, ln, {
            x: k === 3 ? x + widths[k] / 2 : x + 4,
            y: vy - i * lh,
            size: k === 3 ? size + 0.4 : size,
            font: k === 0 || k === 3 ? f.bold : f.reg,
            color: k === 3 && tone ? tone.fg : INK,
            align: k === 3 ? 'center' : 'left',
          }),
        );
        vline(page, x, y, y - h, LINE, 0.5);
        x += widths[k];
      });
      vline(page, R, y, y - h, LINE, 0.5);
      hline(page, L, R, y - h, LINE, 0.5);
      y -= h;
      start += n;
    }
  }

  // Key items
  const keys = String(cs.keyItems ?? autoKeyItems(cs.rows || []).join('\n'))
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  if (keys.length) {
    y -= 16;
    ensure(40, false);
    txt(page, "Key items for Consultant's attention:", { x: L, y, size: 10.5, font: f.bold, color: rgb(0.72, 0.1, 0.12) });
    y -= 15;
    keys.forEach((k) => {
      const lines = wrap(f.reg, k, 9.2, W - 30);
      ensure(lines.length * 12 + 4, false);
      page.drawCircle({ x: L + 12, y: y + 3, size: 2, color: INK });
      lines.forEach((ln, i) => txt(page, ln, { x: L + 24, y: y - i * 12, size: 9.2, font: f.reg }));
      y -= lines.length * 12 + 4;
    });
  }

  // Signatory
  y -= 22;
  ensure(110, false);
  txt(page, cs.signFor || 'For: GREENLAND EQUIPMENT & MACHINERY EST. L.L.C', { x: L, y, size: 10.5, font: f.bold });
  y -= 40;
  if (cs.signName) {
    txt(page, cs.signName, { x: L, y, size: 10, font: f.bold });
    y -= 13;
  }
  String(cs.signLines || '')
    .split('\n')
    .filter(Boolean)
    .forEach((ln) => {
      txt(page, ln, { x: L, y, size: 9.4, font: f.reg });
      y -= 12;
    });
  if (stampImg && cs.showStamp !== false) {
    const sc = Math.min(120 / stampImg.width, 120 / stampImg.height);
    const sy = Math.max(46, y - 20);
    page.drawImage(stampImg, { x: R - stampImg.width * sc, y: sy, width: stampImg.width * sc, height: stampImg.height * sc });
  }
  return pages;
}

const title = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

export async function buildCompliancePdf(cs, project, { logo, stamp } = {}) {
  const doc = await PDFDocument.create();
  doc.setTitle(clean(`Technical Compliance Statement – ${cs.specNo || ''} ${cs.specName || ''}`));
  doc.setCreator('Greenland Pump Engineering Suite');
  const emb = async (img) => {
    if (!img?.bytes) return null;
    try {
      return /png/i.test(img.type) ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
    } catch {
      return null;
    }
  };
  const pages = await renderCompliance(doc, cs, project, { logoImg: await emb(logo), stampImg: await emb(stamp) });
  const fnt = await doc.embedFont(StandardFonts.Helvetica);
  pages.forEach((p, i) => p.drawText(`Page ${i + 1} of ${pages.length}`, { x: R - 50, y: 22, size: 7, font: fnt, color: GREY }));
  return doc.save();
}
