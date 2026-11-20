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

export const newCostRow = (o = {}) => ({ id: rid(), name: '', qty: 1, pump: '', panel: '', assembly: '', vfdKw: '', vfd: '', vesselSize: '', vessel: '', fittings: '', quoted: '', ...o });
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
    costing: (quote?.items || []).length
      ? quote.items.map((it) => newCostRow({ name: [it.title || it.system, it.model].filter(Boolean).join(' – '), qty: Number(it.qty) || 1 }))
      : [newCostRow()],
    items: (quote?.items || []).length ? quote.items.map((it) => newItemRow({ model: it.model || '', qty: Number(it.qty) || 1 })) : [newItemRow()],
    notes: '',
    include: { details: true, quote: true, lpo: true, costing: true, items: true, datasheets: true },
  };
}

const num = (v) => (v === '' || v == null ? 0 : Number(v) || 0);
export const COST_PARTS = ['pump', 'panel', 'assembly', 'vfd', 'vessel', 'fittings'];

/** Net cost (per set × qty), margin and markup on cost. */
export function costRow(r) {
  const unit = COST_PARTS.reduce((s, k) => s + num(r[k]), 0);
  const qty = Math.max(0, num(r.qty) || 0);
  const net = unit * qty;
  const quoted = num(r.quoted);
  const margin = quoted - net;
  const markup = net > 0 ? (margin / net) * 100 : null;
  return { unit, qty, net, quoted, margin, markup };
}
export function costTotals(rows) {
  const t = rows.map(costRow).reduce((a, r) => ({ net: a.net + r.net, quoted: a.quoted + r.quoted }), { net: 0, quoted: 0 });
  const margin = t.quoted - t.net;
  return { ...t, margin, markup: t.net > 0 ? (margin / t.net) * 100 : null };
}

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
  const rows = o.costing.map((r) => ({ r, c: costRow(r) }));
  const tot = costTotals(o.costing);
  return {
    ...header(o, 'COSTING & MARGIN'),
    sections: [
      {
        type: 'grid',
        title: `1. COST BREAK-UP PER PUMP SET (${cur})`,
        columns: [
          { label: 'No.', w: 0.04, align: 'c' },
          { label: 'Pump set / item', w: 0.2 },
          { label: 'Qty', w: 0.05, align: 'c' },
          { label: 'Pump', w: 0.08, align: 'r' },
          { label: 'Control panel', w: 0.08, align: 'r' },
          { label: 'Assembly', w: 0.08, align: 'r' },
          { label: 'VFD (kW)', w: 0.06, align: 'c' },
          { label: 'VFD', w: 0.075, align: 'r' },
          { label: 'Vessel size', w: 0.075, align: 'c' },
          { label: 'Vessel', w: 0.075, align: 'r' },
          { label: 'Fittings', w: 0.075, align: 'r' },
          { label: 'Cost / set', w: 0.08, align: 'r' },
        ],
        rows: rows.map(({ r, c }, k) => ({
          c: [String(k + 1), t(r.name), t(r.qty), money(num(r.pump)), money(num(r.panel)), money(num(r.assembly)), t(r.vfdKw), money(num(r.vfd)), t(r.vesselSize), money(num(r.vessel)), r.fittings === '' ? '–' : money(num(r.fittings)), money(c.unit)],
        })),
      },
      {
        type: 'grid',
        title: `2. NET COST, QUOTED VALUE & MARGIN (${cur})`,
        columns: [
          { label: 'No.', w: 0.05, align: 'c' },
          { label: 'Pump set / item', w: 0.31 },
          { label: 'Qty', w: 0.06, align: 'c' },
          { label: 'Net cost', w: 0.15, align: 'r' },
          { label: 'Quoted value', w: 0.15, align: 'r' },
          { label: 'Net margin', w: 0.15, align: 'r' },
          { label: 'Markup on cost', w: 0.13, align: 'r' },
        ],
        rows: [
          ...rows.map(({ r, c }, k) => ({ c: [String(k + 1), t(r.name), t(r.qty), money(c.net), money(c.quoted), money(c.margin), pct(c.markup)], tone: c.margin < 0 ? { col: 5, color: 'red' } : undefined })),
          { c: ['', 'TOTAL', '', money(tot.net), money(tot.quoted), money(tot.margin), pct(tot.markup)], bold: true, tone: tot.margin < 0 ? { col: 5, color: 'red' } : { col: 5, color: 'green' } },
        ],
        legend: ['Net cost = (pump + control panel + assembly + VFD + pressure vessel + fittings) × qty. Net margin = quoted value − net cost. Markup on cost = net margin ÷ net cost × 100.'],
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
