// Pump datasheet reader (text PDFs). Tuned on Franklin Electric / Spaix® datasheets:
//   "Pump type 30VR04A2GFAB-J5EC" · MOTOR "LAFERT T52C075" · "Rated power 7.5 kW" · "Electric current 14.4 A"
//   · "Electric voltage 3~ 400 V" · "Rated flow 9.501 l/s" · "Nominal head 57.49 m" · "Selection ref 2026-…"
// Other makes: generic "Rated current … A", "P2 … kW", "Model / Type …" patterns. Image-only PDFs → model from file name.

const NUM = /^-?\d+(?:[.,]\d+)?$/;
const toNum = (s) => Number(String(s).replace(',', '.'));

/** Text items of the first pages, grouped in rows. */
async function pageRows(doc, maxPages = 3) {
  const rows = [];
  for (let p = 1; p <= Math.min(maxPages, doc.numPages); p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const items = tc.items.filter((t) => t.str && t.str.trim()).map((t) => ({ s: t.str.replace(/\s+/g, ' ').trim(), x: t.transform[4], y: t.transform[5], page: p }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    for (const it of items) {
      const r = rows.find((row) => row.page === p && Math.abs(row.y - it.y) <= 3);
      if (r) r.items.push(it);
      else rows.push({ page: p, y: it.y, items: [it] });
    }
  }
  rows.forEach((r) => r.items.sort((a, b) => a.x - b.x));
  return rows;
}

/** First number to the right of a label on the same row. */
function valueRight(rows, re, { text = false } = {}) {
  for (const r of rows) {
    const k = r.items.findIndex((i) => re.test(i.s.replace(/\s+/g, ' ')));
    if (k < 0) continue;
    for (const it of r.items.slice(k + 1)) {
      if (text) {
        if (!/^(kW|A|V|bar|m|l\/s|1\/min|%|Hz)$/i.test(it.s)) return it.s;
      } else if (NUM.test(it.s)) return toNum(it.s);
    }
  }
  return null;
}

/** Model from a file name like "40FWS-V-52-037M-G.pdf" (only if it looks like a pump code). */
export function modelFromFileName(name) {
  const base = String(name || '').replace(/\.[a-z0-9]+$/i, '').replace(/^[0-9a-f]{8}-/i, '');
  if (/\d+\s*(LPS|L\/S)|AT\s*\d/i.test(base)) return ''; // "6 LPS AT 3 BAR" is a duty, not a model
  return /[A-Z].*\d|\d.*[A-Z]/i.test(base) && base.length <= 40 ? base.replace(/_/g, ' ').trim() : '';
}

/**
 * @param {Uint8Array} bytes
 * @param {object} pdfjs
 * @param {string} fileName
 * @returns {Promise<{ model, motorKw, current, voltage, motorMake, flow, head, selectionRef, make, pages, textPdf, missing: string[] }>}
 */
export async function readDatasheet(bytes, pdfjs, fileName = '') {
  const doc = await pdfjs.getDocument({ data: bytes, verbosity: 0 }).promise;
  try {
    const rows = await pageRows(doc);
    const text = rows.map((r) => r.items.map((i) => i.s).join(' ')).join('\n');
    const textPdf = text.replace(/\s/g, '').length > 80;
    const out = { model: '', motorKw: null, current: null, voltage: '', motorMake: '', flow: null, head: null, selectionRef: '', make: '', pages: doc.numPages, textPdf };
    if (textPdf) {
      out.model = valueRight(rows, /^Pump type$/i, { text: true }) || '';
      if (!out.model) {
        // Spaix prints the model under "Technical data" at the top
        const td = rows.findIndex((r) => r.items.some((i) => /^Technical data$/i.test(i.s)));
        if (td >= 0) out.model = rows[td + 1]?.items.map((i) => i.s).join(' ') || '';
      }
      out.make = valueRight(rows, /^Make$/i, { text: true }) || '';
      out.motorKw = valueRight(rows, /^Rated pow ?er$/i);
      out.current = valueRight(rows, /^(Electric current|Rated current|Nominal current|Full load current|In)$/i);
      const vRow = rows.find((r) => r.items.some((i) => /^Electric voltage$/i.test(i.s)));
      if (vRow) {
        const k = vRow.items.findIndex((i) => /^Electric voltage$/i.test(i.s));
        out.voltage = vRow.items.slice(k + 1).map((i) => i.s).filter((s) => /^(\d|3~|1~)/.test(s)).slice(0, 2).join(' ').replace(/\s+/, ' ');
      }
      const mot = rows.findIndex((r) => r.items.some((i) => /^MOTOR$/.test(i.s)));
      if (mot >= 0) out.motorMake = rows[mot + 1]?.items.map((i) => i.s).join(' ') || '';
      out.flow = valueRight(rows, /^Rated flow$/i);
      out.head = valueRight(rows, /^Nominal head$/i);
      // Spaix: reference on the row below the label
      const sr = rows.findIndex((r) => r.items.some((i) => /^Selection ref$/i.test(i.s)));
      if (sr >= 0) out.selectionRef = rows[sr + 1]?.items[0]?.s || '';
      // generic fallbacks (other makes)
      const g = (re) => text.match(re);
      if (!out.current) out.current = toNum(g(/(?:Rated|Nominal|Full[- ]load)\s+current[^0-9]{0,15}(\d+(?:[.,]\d+)?)\s*A\b/i)?.[1] || '') || null;
      if (!out.motorKw) out.motorKw = toNum(g(/(?:Rated power|Motor power|P2)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*kW/i)?.[1] || '') || null;
      if (!out.model) out.model = (g(/(?:Model|Pump type|Product name|Type)\s*[:=]\s*([A-Z0-9][A-Z0-9 .\-/]{3,30})/i)?.[1] || '').trim();
    }
    if (!out.model) out.model = modelFromFileName(fileName);
    out.missing = [['model', 'model'], ['motorKw', 'motor kW'], ['current', 'rated current']].filter(([k]) => !out[k]).map(([, l]) => l);
    return out;
  } finally {
    doc.destroy();
  }
}

/** Normalised key to match a model in costing / item rows. */
export const modelKey = (m) => String(m || '').toUpperCase().replace(/[\s\-_/.]+/g, '');
