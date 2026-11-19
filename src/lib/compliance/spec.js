// Specification reader: splits a specification section into clause rows for the
// Technical Compliance Statement (one row per numbered / lettered clause).
import { toLines, join } from '../quote/parse.js';

const rid = () => Math.random().toString(36).slice(2, 10);

/**
 * Convert pdf.js items (one array per page) into page lines {text, x, note}.
 * Short text far to the right, separated by a gap, is a margin note (e.g. "Comply", "Noted.").
 */
export function linesFromItems(pages) {
  return pages.map((items) => {
    const pw = items[0]?.pw || 612;
    return toLines(items).map((ln) => {
      const body = [];
      const note = [];
      ln.items.forEach((it, k) => {
        const prev = ln.items[k - 1];
        const gap = prev ? it.x - (prev.x + prev.w) : it.x;
        if (it.x > pw * 0.66 && (gap > 18 || !prev)) note.push(it);
        else if (note.length) note.push(it);
        else body.push(it);
      });
      return { text: join(body), x: body[0]?.x ?? 0, note: join(note) };
    });
  });
}

const NUM = /^(\d{1,2}(?:\.\d{1,3}){1,4})\.?(?:\s+(.*))?$/;
const PART_WORDS = /^(GENERAL|PRODUCTS?|EXECUTION)$/i;
const LETTER = /^([A-Z])\.\s+(.+)$/;
const LIST = /^(\(?[a-z]\)|\(?[ivx]{1,4}\)|[a-z]\.|\d{1,2}\.|•|-)\s+/;

/**
 * @param {{text:string,x:number,note?:string}[][]} pageLines
 * @returns {{ sectionNo: string, sectionName: string, rows: object[] }}
 */
export function parseSpec(pageLines) {
  const nPages = pageLines.length;
  // 1) repeated headers / footers
  const key = (t) => t.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();
  const freq = {};
  pageLines.forEach((ls) => new Set(ls.flatMap((l) => [key(l.text), key(l.note || ''), key(`${l.text} ${l.note || ''}`)])).forEach((k) => (freq[k] = (freq[k] || 0) + 1)));
  const repeated = (t) => nPages >= 3 && freq[key(t)] >= Math.max(2, Math.ceil(nPages * 0.4)) && t.length < 120;
  const isNoise = (t) => !t.trim() || /^page\s+\d+(\s+of\s+\d+)?$/i.test(t.trim()) || /\bPage \d+ of \d+\b/i.test(t) || repeated(t);

  // 2) section number & name ("151400" / "PLUMBING PUMPS" or "SECTION 15440 - PLUMBING PUMPS")
  let sectionNo = '';
  let sectionName = '';
  outer: for (const ls of pageLines)
    for (let i = 0; i < ls.length; i++) {
      const t = ls[i].text.trim();
      const m = t.match(/^(?:SECTION\s+)?(\d{5,6}|\d{2}\s\d{2}\s\d{2})(?:\s*[-–]\s*(.+))?$/i);
      if (m) {
        sectionNo = m[1];
        sectionName = (m[2] || ls[i + 1]?.text || '').trim();
        if (/^contents$/i.test(sectionName)) sectionName = '';
        break outer;
      }
    }

  // 3) body range: after a "Contents" page (TOC) – else from the first clause; stop at END OF SECTION
  let startPage = 0;
  let startLine = 0;
  const cp = pageLines.findIndex((ls) => ls.some((l) => /^(table of )?contents$/i.test(l.text.trim())));
  if (cp >= 0 && cp < nPages - 1) startPage = cp + 1;
  else {
    // skip the tail of a previous section ending with END OF SECTION before our section header
    const ep = pageLines.findIndex((ls) => ls.some((l) => /END OF SECTION/i.test(l.text)));
    const sp = pageLines.findIndex((ls) => ls.some((l) => sectionNo && l.text.includes(sectionNo)));
    if (ep >= 0 && sp >= ep) {
      startPage = ep;
      startLine = pageLines[ep].findIndex((l) => /END OF SECTION/i.test(l.text)) + 1;
    }
  }
  const body = [];
  let done = false;
  for (let p = startPage; p < nPages && !done; p++)
    pageLines[p].forEach((l0, i) => {
      let l = l0;
      if (done || (p === startPage && i < startLine)) return;
      if (/END OF SECTION/i.test(l.text)) return (done = true);
      const full = `${l.text} ${l.note || ''}`.trim();
      if (isNoise(full) || (isNoise(l.text) && (!l.note || isNoise(l.note) || /page\s+\d+/i.test(l.note)))) return;
      if (l.note && (isNoise(l.note) || /page\s+\d+\s+of/i.test(l.note))) l = { ...l, note: '' };
      body.push(l);
    });

  // 4) clause rows
  const rows = [];
  let cur = null;
  let lastNum = '';
  const push = (r) => {
    rows.push(r);
    cur = r;
  };
  for (const l of body) {
    const t = l.text.trim();
    const n = t.match(NUM);
    const L = !n && t.match(LETTER);
    if (/^PART\s+\d+\b/i.test(t) && t.length <= 40) {
      rows.push({ id: rid(), type: 'clause', clause: '', text: t, note: '', remarks: '', status: '' });
      cur = null;
    } else if (n) {
      lastNum = n[1];
      push({ id: rid(), type: 'clause', clause: n[1], text: (n[2] || '').trim(), note: l.note || '', remarks: '', status: '' });
    } else if (L && cur) {
      push({ id: rid(), type: 'clause', clause: `${lastNum} ${L[1]}`.trim(), text: L[2].trim(), note: l.note || '', remarks: '', status: '' });
    } else if (cur && t) {
      cur.text += LIST.test(t) ? `\n${t}` : `${cur.text && !cur.text.endsWith('\n') ? ' ' : ''}${t}`;
      if (l.note) cur.note = [cur.note, l.note].filter(Boolean).join(' ');
    } else if (cur && l.note) cur.note = [cur.note, l.note].filter(Boolean).join(' ');
  }

  // 5) headings & PART bars: short titles with no body text of their own
  let part = 0;
  const out = [];
  rows.forEach((r, k) => {
    const next = rows[k + 1];
    const depth = r.clause.split('.').length;
    const title = r.text.replace(/\s+/g, ' ').trim();
    const looksTitle = title.length > 0 && title.length <= 70 && !/[.;:]$/.test(title) && depth <= 2 && !/\s[A-Z]$/.test(r.clause);
    const childFollows = next && (next.clause.startsWith(`${r.clause}.`) || next.clause.startsWith(`${r.clause} `) || next.clause.split('.').length > depth || /^\d+\.\d+$/.test(next.clause));
    if (PART_WORDS.test(title) || /^PART\s+\d/i.test(title)) {
      part += 1;
      out.push({ id: r.id, type: 'part', clause: '', text: `PART ${part} - ${title.replace(/^PART\s+\d+\s*[-–]?\s*/i, '').toUpperCase()}`, remarks: '', status: '' });
    } else if (looksTitle && childFollows) out.push({ ...r, type: 'heading', text: title });
    else out.push({ ...r, text: r.text.replace(/[ \t]+/g, ' ').trim() });
  });
  return { sectionNo, sectionName: sectionName.replace(/\s+/g, ' '), rows: out };
}

export const STATUS = {
  complied: { label: 'Complied', color: 'green' },
  noted: { label: 'Noted', color: 'amber' },
  partial: { label: 'Partially Complied', color: 'amber' },
  deviation: { label: 'Deviation', color: 'red' },
  na: { label: 'Not Applicable', color: 'grey' },
};

/** Suggest a status from a margin note left in the spec (e.g. "Comply", "Noted.", "Out of scope"). */
export function statusFromNote(note) {
  const n = String(note || '').toLowerCase();
  if (!n) return '';
  if (/deviat/.test(n)) return 'deviation';
  if (/out of scope|not part|n\/?a\b|not applicable/.test(n)) return 'na';
  if (/partial/.test(n)) return 'partial';
  if (/compl/.test(n)) return 'complied';
  if (/noted/.test(n)) return 'noted';
  return '';
}
