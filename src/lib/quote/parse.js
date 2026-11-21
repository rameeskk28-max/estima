// Reader for Greenland quotations – two formats:
//  1. ERP quotation (Aspose PDF, "Q2600…"): NO. | PRODUCT DESCRIPTION | QTY | UOM | UNIT PRICE | TOTAL PRICE
//  2. Sales quotation (Excel → PDF, "GL-FE-26-…"): S.No | Pump Model | Control Panel Includes |
//     Fittings and Acessories | Unit Price | Qty | Total Price, header "Quotation No. / Date / Email / Project", "BILL TO:"
// Input: text items with positions from pdf.js; output: header fields + pump line items.

/**
 * Extract positioned text items from a PDF with pdf.js.
 * @param {Uint8Array} bytes
 * @param {any} pdfjs the pdfjs-dist module
 * @returns {Promise<{page:number,str:string,x:number,y:number,w:number,h:number}[][]>}
 */
export async function extractItems(bytes, pdfjs) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(0), isEvalSupported: false, useSystemFonts: true }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    pages.push(
      tc.items
        .filter((it) => it.str && it.str.trim())
        .map((it) => ({ page: p, str: it.str, x: it.transform[4], y: vp.height - it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || 9, pw: vp.width })),
    );
  }
  await doc.destroy();
  return pages;
}

/** Group items of one page into lines (top → bottom), each line's items sorted left → right. */
export function toLines(items, tol = 2.5) {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const l = lines.find((ln) => Math.abs(ln.y - it.y) <= tol);
    if (l) l.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  lines.forEach((l) => l.items.sort((a, b) => a.x - b.x));
  return lines.sort((a, b) => a.y - b.y);
}

export const join = (items) =>
  items
    .reduce((s, it, k) => {
      if (!k) return it.str;
      const prev = items[k - 1];
      const gap = it.x - (prev.x + prev.w);
      return s + (gap > 1.5 && !s.endsWith(' ') && !it.str.startsWith(' ') ? ' ' : '') + it.str;
    }, '')
    .replace(/\s+/g, ' ')
    .trim();

const FOOTER = /Head Office|Tel \||Email \||Website|Mahy Khoory|info@greenland/i;

/* ------------------------------------------------------------------ */
/* Header fields                                                       */
/* ------------------------------------------------------------------ */
const LEFT_LABELS = ['CUSTOMER CODE', 'CUSTOMER NAME', 'CUSTOMER TEL', 'CUSTOMER EMAIL', 'CUSTOMER ADDRESS', 'CONTACT CODE', 'CONTACT NAME', 'PAYMENT TERMS', 'DELIVERY LEAD TIME'];
const RIGHT_LABELS = ['QUOTATION NO.', 'QUOTATION DATE', 'QUOTATION VALIDITY', 'SALESPERSON NAME', 'SALESPERSON CONTACT', 'SALESPERSON EMAIL', 'SALES UNIT', 'DELIVERY LEAD TIME'];

function parseHeader(items, tableTop) {
  const head = items.filter((it) => it.y < tableTop - 4 && !FOOTER.test(it.str));
  const find = (label) => head.find((it) => it.str.trim().toUpperCase() === label);
  const left = LEFT_LABELS.map((l) => ({ label: l, it: find(l) })).filter((x) => x.it && x.it.x < 200);
  const right = RIGHT_LABELS.map((l) => ({ label: l, it: head.find((it) => it.str.trim().toUpperCase() === l && it.x >= 200) })).filter((x) => x.it);
  const rightX = right.length ? Math.min(...right.map((r) => r.it.x)) : 330;
  const colon = (lbls, side) => {
    const c = head.filter((it) => it.str.trim().startsWith(':') && (side === 'L' ? it.x < rightX : it.x > rightX) && lbls.some((l) => Math.abs(l.it.y - it.y) < 3));
    return c.length ? Math.min(...c.map((x) => x.x)) : null;
  };
  const out = {};
  const read = (lbls, x0, x1) => {
    const ys = lbls.map((l) => l.it.y).sort((a, b) => a - b);
    lbls.forEach((l) => {
      const k = ys.indexOf(l.it.y);
      const lo = k > 0 ? (ys[k - 1] + l.it.y) / 2 : l.it.y - 14;
      const hi = k < ys.length - 1 ? (ys[k + 1] + l.it.y) / 2 : l.it.y + 14;
      const vals = head.filter((it) => it.x > x0 && it.x < x1 && it.y > lo && it.y <= hi && it.str.trim() !== ':' && !lbls.some((o) => o.it === it));
      const lines = toLines(vals).map((ln) => join(ln.items)).filter(Boolean);
      if (!out[l.label] || lines.length) out[l.label] = lines.join(' ').replace(/\s+/g, ' ').trim();
    });
  };
  const lc = colon(left, 'L');
  const rc = colon(right, 'R');
  if (left.length) read(left, (lc ?? 160) + 2, rightX - 4);
  if (right.length) read(right, (rc ?? rightX + 120) + 2, 9999);
  const g = (k) => out[k] || '';
  return {
    quoteNo: g('QUOTATION NO.'),
    quoteDate: g('QUOTATION DATE'),
    validity: g('QUOTATION VALIDITY'),
    customer: g('CUSTOMER NAME'),
    customerCode: g('CUSTOMER CODE'),
    customerEmail: g('CUSTOMER EMAIL'),
    customerTel: g('CUSTOMER TEL'),
    contact: g('CONTACT NAME'),
    salesperson: g('SALESPERSON NAME'),
    salesEmail: g('SALESPERSON EMAIL'),
    salesContact: g('SALESPERSON CONTACT'),
    leadTime: g('DELIVERY LEAD TIME'),
    payment: g('PAYMENT TERMS'),
  };
}

/* ------------------------------------------------------------------ */
/* Line items                                                          */
/* ------------------------------------------------------------------ */
const ACCESSORY_WORDS = /relay|MCB|lamps?|switch|PLC|BMS|contactor|enclosure|valve|gauge|strainer|connector|manifold|vessel|chains?|shackles|hooks|loose|float|pump\.$|^pump\.?$/i;

/** Drop the page footer (address band) – everything from the first footer line down. */
function stripFooter(pages) {
  return pages.map((items) => {
    const f = items.filter((it) => FOOTER.test(it.str));
    if (!f.length) return items;
    const fy = Math.min(...f.map((it) => it.y));
    return items.filter((it) => it.y < fy - 3);
  });
}

export function parseQuote(rawPages) {
  const pages = stripFooter(rawPages);
  const all = pages.flat();
  const hdr = all.find((it) => /PRODUCT DESCRIPTION/i.test(it.str));
  if (!hdr) {
    if (all.some((it) => /^Pump Model$/i.test(it.str.trim())) && all.some((it) => /Control Panel/i.test(it.str))) return parseSalesQuote(rawPages);
    throw new Error('This does not look like a Greenland quotation (no “PRODUCT DESCRIPTION” or “Pump Model” column found).');
  }
  const qtyH = all.find((it) => it.page === hdr.page && /^QTY$/i.test(it.str.trim()));
  const noH = all.find((it) => it.page === hdr.page && /^NO\.?$/i.test(it.str.trim()) && Math.abs(it.y - hdr.y) < 4);
  const descX0 = (noH ? noH.x + noH.w : hdr.x - 60) + 8;
  const descX1 = qtyH ? qtyH.x - 8 : hdr.x + 220;
  const header = parseHeader(pages[hdr.page - 1], hdr.y);

  // description lines across pages, until the totals
  const desc = [];
  const numbers = []; // item numbers in NO column with their quantity
  let ended = false;
  for (const pageItems of pages) {
    if (ended) break;
    const p = pageItems[0]?.page;
    const startY = p === hdr.page ? hdr.y + 4 : 0;
    const lines = toLines(pageItems.filter((it) => it.y > startY && !FOOTER.test(it.str)));
    for (const ln of lines) {
      const text = join(ln.items);
      if (/TOTAL DISCOUNT|SUB TOTAL|ALL PRICES ARE/i.test(text)) {
        ended = true;
        break;
      }
      const d = ln.items.filter((it) => it.x >= descX0 - 2 && it.x < descX1);
      const no = ln.items.find((it) => it.x < descX0 - 2 && /^\d{1,3}$/.test(it.str.trim()));
      if (no) {
        const qty = ln.items.find((it) => it.x >= descX1 - 2 && /^[\d,.]+$/.test(it.str.trim()));
        numbers.push({ page: p, y: ln.y, no: Number(no.str), qty: qty ? Number(qty.str.replace(/,/g, '')) : null });
      }
      if (d.length) desc.push({ page: p, y: ln.y, text: join(d) });
    }
  }

  // item boundaries: every "Make :" line starts an item; its title is the preceding non-accessory lines
  const makeIdx = desc.map((l, k) => (/^Make\s*:/i.test(l.text) ? k : -1)).filter((k) => k >= 0);
  const items = makeIdx.map((mk, n) => {
    let s = mk;
    const floor = n ? makeIdx[n - 1] + 1 : 0;
    while (s - 1 >= floor && mk - (s - 1) <= 3) {
      const t = desc[s - 1].text;
      if (t.startsWith('•') || /[.:]$/.test(t) || ACCESSORY_WORDS.test(t) || /ACCESS?OR(IE|Y)S?/i.test(t)) break;
      s--;
    }
    return { start: s, make: mk };
  });
  items.forEach((it, k) => (it.end = k < items.length - 1 ? items[k + 1].start : desc.length));

  return {
    header: { ...header, warranty: parseWarranty(pages, header) },
    items: items.map((b, k) => {
      const lines = desc.slice(b.start, b.end);
      const title = desc.slice(b.start, b.make).map((l) => l.text).join(' ');
      const block = desc.slice(b.make, b.end);
      const first = lines[0];
      const last = lines[lines.length - 1];
      const num = numbers.find((nm) => (nm.page > first.page || (nm.page === first.page && nm.y >= first.y - 6)) && (nm.page < last.page || (nm.page === last.page && nm.y <= last.y + 6)));
      return { ...parseItem(title, block.map((l) => l.text)), no: num?.no ?? k + 1, qty: num?.qty ?? 1 };
    }),
  };
}

function section(lines, startRe, stopRe) {
  const i = lines.findIndex((l) => startRe.test(l));
  if (i < 0) return { text: '', from: -1, to: -1 };
  let j = i + 1;
  while (j < lines.length && !stopRe.test(lines[j])) j++;
  const first = lines[i].replace(startRe, '').trim();
  return { text: [first, ...lines.slice(i + 1, j)].filter(Boolean).join(' '), from: i, to: j };
}

const tidy = (s) =>
  String(s || '')
    .replace(/\b1P(\d\d)\b/g, 'IP$1')
    .replace(/([a-z])([A-Z][a-z])/g, '$1\n$2')
    .replace(/ACCESORIES/gi, 'ACCESSORIES')
    .trim();

const MAKES = ['FRANKLIN ELECTRIC', 'GRUNDFOS', 'WILO', 'KSB', 'LOWARA', 'PEDROLLO', 'DAB', 'EBARA', 'XYLEM', 'CALPEDA', 'ARMSTRONG', 'SAER', 'CAPRARI', 'ZENIT', 'FLYGT'];

function parseItem(title, lines) {
  const field = (re, stop) => section(lines, re, stop).text;
  const spec = section(lines, /^Make\s*:\s*/i, /^Type\s*:/i).text.replace(/\s+/g, ' ').trim();
  const known = MAKES.find((m) => spec.toUpperCase().startsWith(m));
  const make = known || (spec.split(/\s{2,}|,/)[0] || '').trim();
  let rest = known ? spec.slice(known.length).trim() : spec.slice(make.length).replace(/^,/, '').trim();
  const mm = rest.match(/^(.*?),\s*([\d.]+)\s*KW/i);
  const model = (mm ? mm[1] : rest.split(',')[0] || '').trim();
  const kwv = mm ? Number(mm[2]) : Number(rest.match(/([\d.]+)\s*KW/i)?.[1]);
  const rpm = rest.match(/([\d.]+)\s*rpm/i)?.[1];
  const phase = rest.match(/([\d.]+)\s*Phase/i)?.[1];
  const type = field(/^Type\s*:\s*/i, /^Arrangement\s*:/i);
  const arrangement = field(/^Arrangement\s*:\s*/i, /^Flow\s*:/i).replace(/\s+/g, '');
  const fl = lines.find((l) => /Flow\s*:/i.test(l)) || '';
  const fm = fl.match(/Flow\s*:\s*([\d.]+)\s*(m3\/hr|m3\/h|m³\/h|L\/S|LPS|L\/sec)/i);
  const hm = fl.match(/Head\s*:\s*([\d.]+)/i);
  const flowLps = fm ? (/m/i.test(fm[2]) ? Number(fm[1]) / 3.6 : Number(fm[1])) : null;
  const housing = field(/^Pump Housing\s*:\s*/i, /^(Impeller\s*:|ELECTRICAL|MECHANICAL)/i);
  const impeller = field(/^Impeller\s*:\s*/i, /^(ELECTRICAL|MECHANICAL|Shaft)/i);
  const shaft = field(/^Shaft\s*:\s*/i, /^(ELECTRICAL|MECHANICAL)/i);
  const eSec = sectionLines(lines, /^ELECTRICAL ACCESS?OR(IES|Y)\s*:?\s*/i, /^MECHANICAL ACCESS?OR/i);
  const mechRaw = section(lines, /^MECHANICAL ACCESS?OR(IES|Y)\s*:?\s*/i, /^ELECTRICAL ACCESS?OR/i).text;
  const electrical = eSec
    .flatMap((l) => tidy(l).split('\n'))
    .map((x) => x.trim())
    .filter(Boolean)
    .reduce((acc, x) => {
      // "IP66" alone followed by "enclosure" → "IP66 enclosure"
      if (acc.length && /^IP\d\d$/i.test(acc[acc.length - 1])) acc[acc.length - 1] = `${acc[acc.length - 1]} ${x}`;
      else acc.push(x);
      return acc;
    }, []);
  const mechanical = mechRaw
    .split('•')
    .map((x) => x.replace(/\s+/g, ' ').replace(/\s+\./g, '.').trim())
    .filter(Boolean);
  const vessel = (mechRaw.match(/(\d+)\s*L(?:iter|itre)?\s*(?:Liter\s*)?pressure\s*vessel/i) || [])[1] || '';
  const hdr = mechRaw.match(/(\d+(?:\.\d+)?)\s*[Xx×]\s*(\d+(?:\.\d+)?)\s*(?:suction|manifold|header)/i);
  const header = hdr ? `${hdr[1]}"x${hdr[2]}"` : '';
  const vfd = /VFD|inbuil?d/i.test(`${title} ${eSec.join(' ')}`);
  return {
    title: title.replace(/\s+/g, ' ').trim(),
    make,
    model,
    kw: kwv > 0 ? kwv : null,
    rpm: rpm ? Number(rpm) : null,
    phase: phase ? Number(phase) : null,
    type: type.replace(/\s+/g, ' ').trim(),
    arrangement,
    flowLps: flowLps != null ? Math.round(flowLps * 100) / 100 : null,
    headM: hm ? Number(hm[1]) : null,
    housing: housing.replace(/\s+/g, ' ').trim(),
    impeller: impeller.replace(/\s+/g, ' ').trim(),
    shaft: shaft.replace(/\s+/g, ' ').trim(),
    electrical,
    mechanical,
    vessel,
    header,
    vfd,
    template: guessTemplate(title, type, vfd),
  };
}

/** Lines of a section, keeping line structure (first line = text after the heading). */
function sectionLines(lines, startRe, stopRe) {
  const i = lines.findIndex((l) => startRe.test(l));
  if (i < 0) return [];
  let j = i + 1;
  while (j < lines.length && !stopRe.test(lines[j])) j++;
  return [lines[i].replace(startRe, '').trim(), ...lines.slice(i + 1, j)].filter(Boolean);
}

/** "IP66 enclosure Contactors H O A selector switch …" → separate features. */
function splitElectrical(s) {
  return s
    .replace(/\b(IP\d\d)\b\s*/i, '$1 ')
    .split(/(?<=enclosure)\s+|(?<=relay)\s+|(?<=MCB)\s+(?=[A-Z])|(?<=BMS)\s+/i)
    .filter(Boolean);
}

export function guessTemplate(title, type, vfd) {
  const t = `${title} ${type}`.toLowerCase();
  if (/sump|sewage|drain|submersible/.test(t)) return 'sump';
  if (/circulat|recirc|inline/.test(t)) return 'circulation';
  if (/transfer/.test(t)) return 'transfer';
  if (/booster|pressur/.test(t)) return vfd ? 'booster-vfd' : 'booster-fixed';
  return vfd ? 'booster-vfd' : 'transfer';
}

function parseWarranty(pages) {
  const lines = pages.flatMap((p) => toLines(p.filter((it) => !FOOTER.test(it.str))).map((l) => join(l.items)));
  const i = lines.findIndex((l) => /^WARRANTY\s*:?/i.test(l) || /\bWARRANTY\s*:/i.test(l));
  const near = lines.slice(Math.max(0, i - 2), i + 3).filter((l) => /MONTH|YEAR/i.test(l));
  return near.join(' ').replace(/^.*?WARRANTY\s*:\s*/i, '').replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ */
/* Format 2 – Sales quotation (S.No | Pump Model | Control Panel …)    */
/* ------------------------------------------------------------------ */
const SALES_FOOTER = /HE\s*AD\s*O\s*F\s*F\s*I\s*CE|P\.O\.Box|info@greenland/i;
const SALES_LABEL = /^(Make|Type|Arrangement|Flow|Head|Pump Housing|Impeller|Shaft)\s*:/i;
const centre = (it) => it.x + it.w / 2;

export function parseSalesQuote(rawPages) {
  const pages = rawPages.map((items) => {
    const f = items.filter((it) => SALES_FOOTER.test(it.str));
    const fy = f.length ? Math.min(...f.map((it) => it.y)) : Infinity;
    return items.filter((it) => it.y < fy - 3);
  });
  const all = pages.flat();
  const H = (re, page) => all.find((it) => (!page || it.page === page) && re.test(it.str.trim()));
  const modelH = H(/^Pump Model$/i);
  const p0 = modelH.page;
  const snH = H(/^S\.?\s*No\.?$/i, p0);
  const ctrlH = H(/Control Panel/i, p0);
  const fitH = H(/^Fittings/i, p0);
  const unitH = H(/^Unit Price$/i, p0);
  const qtyH = H(/^Qty$/i, p0);
  const totH = H(/^Total Price$/i, p0);

  // header (first page, above the table)
  const top = pages[p0 - 1].filter((it) => it.y < modelH.y - 4);
  const labelRow = (re) => top.find((it) => re.test(it.str.trim()));
  const valueNear = (lab, span = 6) => {
    if (!lab) return '';
    if (span < 6) return join(top.filter((it) => it.x > lab.x + lab.w + 20 && Math.abs(it.y - lab.y) <= span).sort((p, q) => p.x - q.x)); // one row
    const others = top.filter((it) => it.x <= lab.x + 2 && it !== lab && it.x >= lab.x - 2 && it.y > lab.y + 2).map((it) => it.y);
    const nextY = others.length ? Math.min(...others) : lab.y + 40;
    const vals = top.filter((it) => it.x > lab.x + lab.w + 20 && it.y > lab.y - span && it.y < nextY - 2);
    return toLines(vals).map((l) => join(l.items)).join(' ').replace(/\s+/g, ' ').trim();
  };
  const qn = labelRow(/^Quotation No\.?$/i);
  const billTo = labelRow(/^BILL TO:?$/i);
  const rightX = qn ? qn.x - 10 : 290;
  const customer = billTo
    ? toLines(top.filter((it) => it.y > billTo.y + 2 && it.x < rightX && !/SALES QUOTATION/i.test(it.str) && it.y < (qn ? qn.y : billTo.y + 40)))
        .map((l) => join(l.items.filter((it) => it.x < rightX)))
        .filter(Boolean)
        .join(' ')
    : '';

  // columns: each column starts at the leftmost body text between the previous heading centre and its own centre
  const body = (it) => it.y > modelH.y + 4 || it.page !== p0;
  const colStart = (prevH, h) => {
    const xs = all.filter((it) => body(it) && it.x > centre(prevH) && it.x <= centre(h) + 2).map((it) => it.x);
    return xs.length ? Math.min(...xs) : h.x;
  };
  const xModel = snH ? colStart(snH, modelH) : modelH.x - 40;
  const xCtrl = colStart(modelH, ctrlH);
  const xFit = colStart(ctrlH, fitH);
  const xPrice = unitH.x - 6;

  // body lines until the totals / notes
  const rows = [];
  let ended = false;
  for (const items of pages) {
    if (ended) break;
    const p = items[0]?.page;
    if (p < p0) continue;
    const hy = all.find((it) => it.page === p && /^Pump Model$/i.test(it.str.trim()))?.y ?? 0;
    for (const ln of toLines(items.filter((it) => it.y > hy + 4))) {
      const text = join(ln.items);
      if (/^Notes\b|TOTAL AED|TOTAL DISCOUNT|Terms & Conditions/i.test(text)) {
        ended = true;
        break;
      }
      const pick = (x0, x1) => join(ln.items.filter((it) => it.x >= x0 - 2 && it.x < x1 - 2));
      const no = ln.items.find((it) => it.x < xModel - 2 && /^\d{1,3}$/.test(it.str.trim()));
      const num = (h) => {
        const it = h && ln.items.find((x) => x.x >= xPrice && Math.abs(centre(x) - centre(h)) < Math.max(18, h.w));
        return it && /^[\d,.]+$/.test(it.str.trim()) ? Number(it.str.replace(/,/g, '')) : null;
      };
      rows.push({ page: p, y: ln.y, no: no ? Number(no.str) : null, model: pick(xModel, xCtrl), ctrl: pick(xCtrl, xFit), fit: pick(xFit, xPrice), qty: num(qtyH), unit: num(unitH), total: num(totH) });
    }
  }

  // items start at each "Make :" line of the Pump Model column
  const starts = rows.map((r, k) => (/^Make\s*:/i.test(r.model) ? k : -1)).filter((k) => k >= 0);
  const blocks = starts.map((s, n) => rows.slice(s, n < starts.length - 1 ? starts[n + 1] : rows.length));

  const items = blocks.map((b, k) => {
    const model = b.map((r) => r.model).filter(Boolean);
    const ctrl = b.map((r) => r.ctrl).filter(Boolean);
    const fit = b.map((r) => r.fit).filter(Boolean).join(' ');
    const numRow = b.find((r) => r.no != null);
    const qtyRow = b.find((r) => r.qty != null);

    // Pump Model column: Make, title line(s), model spec (has kW, may wrap), labelled fields
    const make = model[0].replace(/^Make\s*:\s*/i, '').trim();
    const titleL = [];
    const specL = [];
    const fields = {};
    let mode = 'title';
    let last = null;
    for (const l of model.slice(1)) {
      const m = l.match(SALES_LABEL);
      if (m) {
        last = m[1].toLowerCase();
        fields[last] = l.replace(SALES_LABEL, '').trim();
        if (mode === 'spec') mode = 'done';
        continue;
      }
      if (mode !== 'done' && /\d\s*KW\b|rpm|Phase/i.test(l)) mode = 'spec';
      if (mode === 'spec') specL.push(l);
      else if (mode === 'title' && !last) titleL.push(l);
      else if (last) fields[last] = `${fields[last]} ${l}`.trim(); // wrapped field value
    }
    const strip = (v) => String(v || '').replace(/,\s*$/, '').trim();
    // same line structure as the ERP format, so one item reader serves both
    const lines = [
      `Make : ${make} ${specL.join(' ')}`.replace(/\s+/g, ' ').replace(/\s+,/g, ','),
      `Type : ${strip(fields.type)}`,
      `Arrangement : ${strip(fields.arrangement)}`,
      `Flow :${strip(fields.flow)}${fields.head ? `, Head : ${strip(fields.head)}` : ''}`,
      `Pump Housing : ${strip(fields['pump housing'])}`,
      `Impeller : ${strip(fields.impeller)}`,
      ...(fields.shaft ? [`Shaft : ${strip(fields.shaft)}`] : []),
      ...(ctrl.length ? [`ELECTRICAL ACCESSORIES: ${ctrl[0]}`, ...ctrl.slice(1)] : []),
      ...(fit ? [`MECHANICAL ACCESORIES: ${fit}`] : []),
    ];
    const it = parseItem(titleL.join(' '), lines);
    return { ...it, no: numRow?.no ?? k + 1, qty: qtyRow?.qty ?? 1, unitPrice: qtyRow?.unit ?? null, totalPrice: qtyRow?.total ?? null };
  });

  // terms ("Price Validity:", "Delivery:", "Payment Terms:", "Warranty:") and signatory
  const lines = pages.flatMap((p) => toLines(p).map((l) => join(l.items)));
  const term = (re) => (lines.find((l) => re.test(l)) || '').replace(/^\d+\s*/, '').replace(re, '').trim();
  const authIdx = lines.findIndex((l) => /^Authori[sz]ed By/i.test(l));
  const header = {
    quoteNo: valueNear(qn, 3),
    quoteDate: valueNear(labelRow(/^Date$/i), 3),
    validity: term(/^\d*\s*Price Validity\s*:/i),
    customer,
    customerCode: '',
    customerEmail: '',
    customerTel: '',
    contact: customer,
    salesperson: authIdx >= 0 ? lines[authIdx + 1] || '' : '',
    salesEmail: valueNear(labelRow(/^Email$/i), 3),
    salesContact: (lines.find((l) => /^\+?9715\d{7,8}$|^\+?971\s?5\d/.test(l.replace(/\s/g, ''))) || '').trim(),
    leadTime: term(/^\d*\s*Delivery\s*:/i),
    payment: term(/^\d*\s*Payment Terms\s*:/i),
    project: valueNear(labelRow(/^Project$/i), 10),
    format: 'sales',
  };
  header.warranty = term(/^\d*\s*Warranty\s*:/i) || parseWarranty(pages, header);
  return { header, items };
}
