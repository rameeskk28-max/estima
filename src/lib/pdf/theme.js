import { rgb, StandardFonts } from 'pdf-lib';

export const A4 = [595.28, 841.89];
export const A4L = [841.89, 595.28];
export const MM = 72 / 25.4;

export const C = {
  // Greenland brand: navy #153963, green #06AF4B
  navy: rgb(21 / 255, 57 / 255, 99 / 255),
  navy2: rgb(14 / 255, 40 / 255, 72 / 255),
  blue: rgb(4 / 255, 140 / 255, 60 / 255),
  sky: rgb(6 / 255, 175 / 255, 75 / 255),
  light: rgb(0.945, 0.96, 0.985),
  light2: rgb(0.9, 0.93, 0.97),
  zebra: rgb(0.972, 0.979, 0.99),
  border: rgb(0.74, 0.79, 0.86),
  text: rgb(0.09, 0.11, 0.15),
  muted: rgb(0.38, 0.43, 0.5),
  white: rgb(1, 1, 1),
  green: rgb(0.06, 0.48, 0.24),
  greenBg: rgb(0.9, 0.97, 0.92),
  red: rgb(0.74, 0.1, 0.1),
  redBg: rgb(0.99, 0.92, 0.92),
};

/**
 * Report fonts. Reports use Times (Times New Roman metrics); the submittal cover and
 * table of contents keep Helvetica ('sans').
 */
export async function loadFonts(doc, family = 'serif') {
  const set =
    family === 'sans'
      ? [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique]
      : [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic];
  const [reg, bold, ital, boldItal] = await Promise.all(set.map((f) => doc.embedFont(f)));
  return { reg, bold, ital, boldItal };
}

/** House type scale for reports (pt, Times). */
export const TYPE = {
  docTitle: 12.5, // title bar
  section: 9.5, // section bars
  body: 9.5, // paragraphs
  table: 8.8, // table cells
  tableDense: 8, // tables with many columns
  head: 8.6, // table headings
  note: 8.5, // notes / legends
  small: 7.8, // header labels, captions
  footer: 8,
};

// Standard 14 fonts use WinAnsi encoding – map engineering symbols that it lacks.
const MAP = {
  '−': '-', '‐': '-', '‑': '-', 'Σ': 'Sum ', 'Δ': 'd', 'η': 'eta-', 'ρ': 'rho', 'π': 'pi', '≥': '>=', '≤': '<=',
  '↔': '<->', '→': '->', '←': '<-', '≈': '~', '√': 'sqrt', '✓': 'OK', '✔': 'OK', '✗': 'X', ' ': ' ',
  ' ': ' ', ' ': ' ', '⁴': '^4', '¹': '^1', 'ε': 'e', 'μ': 'u', '\t': '  ',
};
// Unicode code points that WinAnsi supports in the 0x80–0x9F range
const WIN_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

export function clean(input) {
  const s = String(input ?? '');
  let out = '';
  for (const ch of s) {
    if (MAP[ch] !== undefined) out += MAP[ch];
    else {
      const code = ch.codePointAt(0);
      if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_EXTRA.has(ch)) out += ch;
      else if (code === 10) out += '\n';
      else out += '?';
    }
  }
  return out;
}

export function textWidth(font, text, size) {
  return font.widthOfTextAtSize(clean(text), size);
}

/** Wrap text into lines that fit maxWidth. Honors explicit newlines. */
export function wrap(font, text, size, maxWidth) {
  const lines = [];
  for (const para of clean(text).split('\n')) {
    const words = para.split(/ +/);
    let line = '';
    for (let w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // break very long words
      while (font.widthOfTextAtSize(w, size) > maxWidth && w.length > 1) {
        let k = w.length - 1;
        while (k > 1 && font.widthOfTextAtSize(w.slice(0, k), size) > maxWidth) k--;
        lines.push(w.slice(0, k));
        w = w.slice(k);
      }
      line = w;
    }
    lines.push(line);
  }
  return lines;
}

/** Wrap without splitting words: shrinks the size (by up to 2 pt) until the longest word fits. */
export function fitWrap(font, text, size, width) {
  const words = clean(text ?? '').split(/\s+/).filter(Boolean);
  let s = size;
  while (s > size - 2 && words.some((w) => font.widthOfTextAtSize(w, s) > width)) s -= 0.25;
  return { lines: wrap(font, text ?? '', s, width), size: s };
}

export function truncate(font, text, size, maxWidth) {
  let s = clean(text);
  if (font.widthOfTextAtSize(s, size) <= maxWidth) return s;
  while (s.length > 1 && font.widthOfTextAtSize(s + '...', size) > maxWidth) s = s.slice(0, -1);
  return s + '...';
}

export function drawText(page, text, { x, y, size = 9, font, color = C.text, align = 'left', maxWidth }) {
  let s = maxWidth ? truncate(font, text, size, maxWidth) : clean(text);
  let dx = x;
  if (align !== 'left') {
    const w = font.widthOfTextAtSize(s, size);
    dx = align === 'center' ? x - w / 2 : x - w;
  }
  page.drawText(s, { x: dx, y, size, font, color });
}

export function rect(page, x, y, w, h, { fill, stroke, width = 0.6 } = {}) {
  page.drawRectangle({ x, y, width: w, height: h, color: fill, borderColor: stroke, borderWidth: stroke ? width : 0 });
}

export function hline(page, x1, x2, y, color = C.border, thickness = 0.6) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, color, thickness });
}

export function vline(page, x, y1, y2, color = C.border, thickness = 0.6) {
  page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, color, thickness });
}

export const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
