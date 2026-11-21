// Order processing: one file per order – project details, final quote, LPO, costing, item codes, datasheets.
// Compiled with the submittal compiler (cover, index, dividers, page numbers).
const rid = () => `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const ORDER_SECTIONS = [
  { key: 'details', title: 'PROJECT DETAILS' },
  { key: 'quote', title: 'FINAL QUOTATION' },
  { key: 'lpo', title: 'LOCAL PURCHASE ORDER (LPO)' },
  { key: 'costing', title: 'COSTING & MARGIN' },
  { key: 'items', title: 'ITEM CODES & RATED CURRENT' },
  { key: 'datasheets', title: 'PUMP DATASHEETS' },
];
export const orderSlot = (o, key) => `ord-${o.id}-${key}`;

export const newCostRow = (o = {}) => ({ id: rid(), name: '', qty: 1, pump: '', vfdKw: '', vfd: '', vesselSize: '', vessel: '', ...o });
export const newItemRow = (o = {}) => ({ id: rid(), code: '', model: '', qty: 1, current: '', ...o });

export function newOrder(project = {}, quote = null) {
  const h = quote?.header || {};
  return {
    id: rid(),
    created: new Date().toISOString(),
    orderNo: '',
    status: 'open',
    details: [
      { id: rid(), label: 'Project', value: project.projectName || h.project || '' },
      { id: rid(), label: 'Client', value: project.client || '' },
      { id: rid(), label: 'Customer / MEP contractor', value: h.customer || project.contractor || '' },
      { id: rid(), label: 'Consultant', value: project.consultant || '' },
      { id: rid(), label: 'Quotation no. & date', value: [h.quoteNo, h.quoteDate].filter(Boolean).join(' – ') },
      { id: rid(), label: 'LPO no. & date', value: '' },
      { id: rid(), label: 'Sales engineer', value: h.salesperson || '' },
      { id: rid(), label: 'Delivery / terms', value: '' },
    ],
    currency: 'AED',
    common: { panel: '', assembly: '', quoted: '' },
    costing: (quote?.items || []).length
      ? quote.items.map((it) => newCostRow({ name: [it.title || it.system, it.model].filter(Boolean).join(' – '), qty: Number(it.qty) || 1 }))
      : [newCostRow()],
    items: (quote?.items || []).length ? quote.items.map((it) => newItemRow({ model: it.model || '', qty: Number(it.qty) || 1 })) : [newItemRow()],
    notes: '',
    include: { details: true, quote: true, lpo: true, costing: true, items: true, datasheets: true },
  };
}

const num = (v) => (v === '' || v == null ? 0 : Number(v) || 0);
export const COST_PARTS = ['pump', 'vfd', 'vessel'];

/** One pump row: (pump incl. duty + VFD + pressure vessel) × qty. */
export function costRow(r) {
  const unit = COST_PARTS.reduce((s, k) => s + num(r[k]), 0);
  const qty = Math.max(0, num(r.qty));
  return { unit, qty, total: unit * qty, pump: num(r.pump) * qty, vfd: num(r.vfd) * qty, vessel: num(r.vessel) * qty };
}

/** Older orders kept panel / assembly / quoted on each row → whole-order figures. */
export function commonOf(o) {
  if (o.common) return o.common;
  const sum = (k) => (o.costing || []).reduce((s, r) => s + num(r[k]) * (k === 'quoted' ? 1 : Math.max(1, num(r.qty))), 0) || '';
  return { panel: sum('panel'), assembly: sum('assembly'), quoted: sum('quoted') };
}

/** Whole-order summary in the costing-template order. Net margin % = markup on cost. */
export function costSummary(o) {
  const rows = (o.costing || []).map(costRow);
  const c = commonOf(o);
  const pump = rows.reduce((s, r) => s + r.pump, 0);
  const vfd = rows.reduce((s, r) => s + r.vfd, 0);
  const vessel = rows.reduce((s, r) => s + r.vessel, 0);
  const panel = num(c.panel);
  const assembly = num(c.assembly);
  const net = pump + vfd + vessel + panel + assembly;
  const quoted = num(c.quoted);
  const margin = quoted - net;
  return { pump, vfd, vessel, panel, assembly, net, quoted, margin, markup: net > 0 && quoted ? (margin / net) * 100 : null };
}
/** @deprecated kept for callers expecting { net, quoted, margin, markup } */
export const costTotals = (rowsOrOrder) => costSummary(Array.isArray(rowsOrOrder) ? { costing: rowsOrOrder } : rowsOrOrder);

const money = (v, cur = 'AED') => (v == null || !Number.isFinite(v) ? '–' : `${v < 0 ? '-' : ''}${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const pct = (v) => (v == null ? '–' : `${v.toFixed(1)} %`);
const t = (v) => (v === '' || v == null ? '–' : String(v));

const header = (o, label, project) => ({ docTitle: label, sheetLabel: 'ORDER PROCESSING', ref: o.orderNo || undefined, signatures: false, project });

export function detailsSheet(o) {
  return {
    ...header(o, 'PROJECT DETAILS'),
    sections: [
      { type: 'info', title: '1. PROJECT DETAILS (FOR REFERENCE)', rows: o.details.filter((d) => d.label || d.value).map((d) => [d.label || '–', d.value || '–']) },
      ...(o.notes ? [{ type: 'note', text: o.notes }] : []),
    ],
  };
}

export function costingSheet(o) {
  const cur = o.currency || 'AED';
  const sm = costSummary(o);
  const project = o.details.find((d) => /project/i.test(d.label))?.value || 'ORDER';
  return {
    ...header(o, 'COSTING & MARGIN'),
    sections: [
      {
        type: 'grid',
        title: `1. PUMP COSTS (${cur})`,
        columns: [
          { label: 'No.', w: 0.05, align: 'c' },
          { label: 'Pump model', w: 0.25 },
          { label: 'Qty', w: 0.06, align: 'c' },
          { label: 'Pump cost (incl. duty)', w: 0.12, align: 'r' },
          { label: 'VFD kW', w: 0.07, align: 'c' },
          { label: 'VFD cost', w: 0.11, align: 'r' },
          { label: 'PV size', w: 0.09, align: 'c' },
          { label: 'PV cost', w: 0.11, align: 'r' },
          { label: 'Total', w: 0.14, align: 'r' },
        ],
        rows: [
          ...o.costing.map((r, k) => ({ c: [String(k + 1), t(r.name), t(r.qty), money(num(r.pump)), t(r.vfdKw), money(num(r.vfd)), t(r.vesselSize), money(num(r.vessel)), money(costRow(r).total)] })),
          { c: ['', 'TOTAL', '', money(sm.pump), '', money(sm.vfd), '', money(sm.vessel), money(sm.pump + sm.vfd + sm.vessel)], bold: true },
        ],
        legend: ['Costs per unit; Total = (pump + VFD + pressure vessel) × qty. Pump cost includes duty.'],
        size: 9.4,
        dense: false,
        pad: 5,
      },
      {
        type: 'grid',
        title: `2. COST SUMMARY (${cur})`,
        columns: [
          { label: 'Cost Component', w: 0.62 },
          { label: `${String(project).toUpperCase()} (${cur})`, w: 0.38, align: 'r' },
        ],
        rows: [
          { c: ['Pump Cost (incl. duty)', money(sm.pump)] },
          { c: ['VFD Cost', money(sm.vfd)] },
          { c: ['PV Cost', money(sm.vessel)] },
          { c: ['Control Panel Cost', money(sm.panel)] },
          { c: ['Assembly Cost', money(sm.assembly)] },
          { c: ['Net Cost', money(sm.net)], bold: true },
          { c: ['Quoted Value', money(sm.quoted)] },
          { c: ['Net Margin', money(sm.margin)], bold: true, tone: { col: 1, color: sm.margin < 0 ? 'red' : 'green' } },
          { c: ['Net Margin % (on cost)', pct(sm.markup)], bold: true, tone: { col: 1, color: sm.margin < 0 ? 'red' : 'green' } },
        ],
        legend: ['Net cost = pump + VFD + pressure vessel + control panel + assembly. Net margin = quoted value − net cost. Net margin % = net margin ÷ net cost × 100.'],
        size: 10.5,
        pad: 6,
      },
      {
        type: 'result',
        size: 12,
        tone: sm.margin < 0 ? 'red' : 'green',
        text: sm.quoted
          ? `Net margin: ${cur} ${money(sm.margin)}  (${pct(sm.markup)} on cost)   |   Net cost ${cur} ${money(sm.net)}   |   Quoted ${cur} ${money(sm.quoted)}`
          : `Net cost: ${cur} ${money(sm.net)}  –  enter the quoted value to see the margin`,
      },
    ],
  };
}

export function itemsSheet(o) {
  return {
    ...header(o, 'ITEM CODES & RATED CURRENT'),
    sections: [
      {
        type: 'grid',
        title: '1. ITEM CODE SCHEDULE',
        columns: [
          { label: 'No.', w: 0.07, align: 'c' },
          { label: 'Item code', w: 0.25 },
          { label: 'Pump model', w: 0.38 },
          { label: 'Qty', w: 0.1, align: 'c' },
          { label: 'Rated current (A)', w: 0.2, align: 'c' },
        ],
        rows: o.items.map((r, k) => ({ c: [String(k + 1), t(r.code), t(r.model), t(r.qty), t(r.current)] })),
      },
    ],
  };
}

/** Entries for the submittal compiler (only included sections). */
export function orderEntries(o) {
  const inc = o.include || {};
  const out = [];
  const add = (key, extra) => inc[key] !== false && out.push({ id: orderSlot(o, key), title: ORDER_SECTIONS.find((s) => s.key === key).title, include: true, ...extra });
  add('details', { sheets: [detailsSheet(o)] });
  add('quote');
  add('lpo');
  add('costing', { sheets: [costingSheet(o)] });
  add('items', { sheets: [itemsSheet(o)] });
  add('datasheets');
  return out;
}

export { money, pct };
