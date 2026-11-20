import { useMemo, useState } from 'react';
import { ClipboardList, Plus, Trash2, FileDown, LoaderCircle, FileInput, Calculator, Hash, FileText, Building2, BookOpen, Copy, Eye } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { Card, downloadBytes, safeName } from '../../components/ui.jsx';
import { FileSlot } from '../../components/FileSlot.jsx';
import { SheetPreviewModal } from '../../components/SheetPreview.jsx';
import { compileSubmittal } from '../../lib/pdf/compile.js';
import { compressPdf } from '../../lib/pdf/compress.js';
import { matchModel } from '../../lib/quote/generate.js';
import { ORDER_SECTIONS, orderSlot, newCostRow, newItemRow, costRow, costTotals, orderEntries, costingSheet, money, pct } from '../../lib/orders.js';

const STATUS = { open: 'Open', processing: 'In process', delivered: 'Delivered', closed: 'Closed' };

export function OrdersTab() {
  const { orders, addOrder, updateOrder, removeOrder, quoteDraft, project, files, addFiles, library, getLogo, notify } = useStore();
  const [sel, setSel] = useState(orders[0]?.id || null);
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState(null);
  const o = orders.find((x) => x.id === sel) || orders[0] || null;
  const upd = (patch) => o && updateOrder(o.id, patch);

  const create = (fromQuote) => {
    const id = addOrder(fromQuote ? quoteDraft : null);
    setSel(id);
    notify(fromQuote ? 'New order created from the last quotation – check the values' : 'New order created');
  };

  const fillDatasheets = async () => {
    let n = 0;
    const slot = orderSlot(o, 'datasheets');
    const have = new Set((files[slot] || []).map((f) => f.name));
    for (const it of o.items) {
      const m = matchModel(library.models, it.model);
      if (!m) continue;
      const recs = (files[`libm-${m.id}-datasheet`] || []).filter((f) => !have.has(f.name)).map((f) => ({ name: f.name, size: f.size, pages: f.pages, encrypted: f.encrypted, bytes: f.bytes }));
      if (recs.length) {
        await addFiles(slot, recs);
        recs.forEach((r) => have.add(r.name));
        n += recs.length;
      }
    }
    notify(n ? `${n} datasheet(s) added from the Document Library` : 'No matching datasheets in the Document Library – upload them here or save them in the library', n ? 'ok' : 'bad');
  };

  const compile = async () => {
    setBusy('Compiling…');
    try {
      const d = Object.fromEntries(o.details.map((x) => [x.label.toLowerCase(), x.value]));
      const proj = { ...project, projectName: d.project || project.projectName, refNo: o.orderNo || project.refNo, subject: 'Order Processing File – Quotation, LPO, Costing, Item Codes & Datasheets' };
      const res = await compileSubmittal(
        {
          project: proj,
          entries: orderEntries(o),
          files,
          logo: await getLogo(),
          cover: { title: 'ORDER PROCESSING FILE', internal: true, rows: o.details.filter((x) => x.label).slice(0, 10).map((x) => [x.label, x.value]) },
        },
        setBusy,
      );
      res.bytes = await compressPdf(res.bytes, library.settings.compression || 'standard', setBusy);
      downloadBytes(res.bytes, `Order_${safeName(o.orderNo || 'file')}_${safeName(proj.projectName || 'project')}.pdf`);
      notify(`Order file compiled – ${res.pageCount} pages${res.warnings.length ? ` · ${res.warnings.length} warning(s)` : ''}`, res.warnings.length ? 'bad' : 'ok');
    } catch (e) {
      console.error(e);
      notify(`Could not compile: ${e.message}`, 'bad');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-slate-50">
            <ClipboardList className="text-brand-400" size={22} /> Order Processing
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">One file per order: project details, final quotation, LPO, costing & margin, item codes and pump datasheets – compiled into a single indexed A4 PDF.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => create(false)}>
            <Plus size={16} /> New order
          </button>
          <button className="btn-primary" onClick={() => create(true)} disabled={!quoteDraft} title={quoteDraft ? '' : 'Read a quotation in Quote → Submittal first'}>
            <FileInput size={16} /> New order from last quotation
          </button>
        </div>
      </div>

      {!orders.length ? (
        <Card title="No orders yet" icon={ClipboardList}>
          <p className="text-sm text-slate-400">Create an order. “From last quotation” fills the project details, costing rows and pump models from the quotation read in Quote → Submittal.</p>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
          {/* order list */}
          <div className="space-y-2">
            {orders.map((x) => {
              const tot = costTotals(x.costing);
              const name = x.details.find((d) => /project/i.test(d.label))?.value;
              return (
                <button key={x.id} onClick={() => setSel(x.id)} className={`card w-full rounded-2xl p-3 text-left transition ${o?.id === x.id ? 'border-brand-500/60 bg-brand-500/10' : 'hover:border-brand-500/40'}`}>
                  <div className="truncate text-sm font-semibold text-slate-50">{x.orderNo || 'Order (no number)'}</div>
                  <div className="truncate text-xs text-slate-400">{name || 'Project not set'}</div>
                  <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                    <span>{STATUS[x.status] || x.status}</span>
                    <span>{tot.quoted ? `${x.currency} ${money(tot.quoted)}` : ''}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {o && (
            <div className="min-w-0 space-y-4">
              <div className="card flex flex-wrap items-end gap-3 rounded-2xl p-3">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Order / job no.
                  <input className="field mt-1 !w-48 normal-case" value={o.orderNo} onChange={(e) => upd({ orderNo: e.target.value })} placeholder="e.g. SO-2026-0142" />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Status
                  <select className="field mt-1 !w-40 normal-case" value={o.status} onChange={(e) => upd({ status: e.target.value })}>
                    {Object.entries(STATUS).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="ml-auto flex flex-wrap gap-2">
                  <button className="btn-ghost hover:!text-red-400" onClick={() => confirm('Delete this order and its attached files?') && (removeOrder(o.id), setSel(null))}>
                    <Trash2 size={15} /> Delete
                  </button>
                  <button className="btn-primary" onClick={compile} disabled={!!busy}>
                    {busy ? <LoaderCircle size={16} className="animate-spin" /> : <FileDown size={16} />} {busy || 'Compile order file (PDF)'}
                  </button>
                </div>
                <div className="flex w-full flex-wrap gap-3 text-xs text-slate-400">
                  Include in the PDF:
                  {ORDER_SECTIONS.map((s2, k) => (
                    <label key={s2.key} className="flex items-center gap-1">
                      <input type="checkbox" className="accent-brand-500" checked={o.include?.[s2.key] !== false} onChange={(e) => upd({ include: { ...o.include, [s2.key]: e.target.checked } })} /> {k + 1}. {s2.title.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())}
                    </label>
                  ))}
                </div>
              </div>

              {/* 1 details */}
              <Card title="1. Project details (reference)" icon={Building2} actions={<button className="btn-ghost !py-1 text-xs" onClick={() => upd({ details: [...o.details, { id: `d${Date.now()}`, label: '', value: '' }] })}><Plus size={13} /> Add line</button>}>
                <div className="grid gap-2 md:grid-cols-2">
                  {o.details.map((d) => (
                    <div key={d.id} className="flex gap-2">
                      <input className="field !w-44 shrink-0 text-xs font-semibold" value={d.label} onChange={(e) => upd({ details: o.details.map((x) => (x.id === d.id ? { ...x, label: e.target.value } : x)) })} aria-label="Label" />
                      <input className="field text-sm" value={d.value} onChange={(e) => upd({ details: o.details.map((x) => (x.id === d.id ? { ...x, value: e.target.value } : x)) })} aria-label={d.label} />
                      <button className="btn-ghost !p-1 hover:!text-red-400" onClick={() => upd({ details: o.details.filter((x) => x.id !== d.id) })} aria-label="Remove line">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
                <textarea className="field mt-2 text-sm" rows={2} placeholder="Notes (optional)" value={o.notes} onChange={(e) => upd({ notes: e.target.value })} />
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card title="2. Final quotation" icon={FileText}>
                  <FileSlot slotId={orderSlot(o, 'quote')} label="Attach the final quotation PDF" />
                </Card>
                <Card title="3. LPO" icon={FileText}>
                  <FileSlot slotId={orderSlot(o, 'lpo')} label="Attach the customer LPO PDF" />
                </Card>
              </div>

              <CostingCard o={o} upd={upd} onPreview={() => setPreview(costingSheet(o))} />
              <ItemsCard o={o} upd={upd} />

              <Card title="6. Pump datasheets" icon={BookOpen} actions={<button className="btn-ghost !py-1 text-xs" onClick={fillDatasheets}><Copy size={13} /> Add from Document Library</button>}>
                <FileSlot slotId={orderSlot(o, 'datasheets')} label="Attach datasheets of all pumps" />
                <p className="mt-2 text-[11px] text-slate-500">“Add from Document Library” copies the saved datasheets of the pump models in the item-code table.</p>
              </Card>
            </div>
          )}
        </div>
      )}
      {preview && <SheetPreviewModal open onClose={() => setPreview(null)} sheet={preview} project={project} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
const COLS = [
  ['name', 'Pump set / item', 'w-56', 'text'],
  ['qty', 'Qty', 'w-14', 'num'],
  ['pump', 'Pump', 'w-24', 'num'],
  ['panel', 'Control panel', 'w-24', 'num'],
  ['assembly', 'Assembly', 'w-24', 'num'],
  ['vfdKw', 'VFD kW', 'w-16', 'num'],
  ['vfd', 'VFD cost', 'w-24', 'num'],
  ['vesselSize', 'Vessel size', 'w-24', 'text'],
  ['vessel', 'Vessel cost', 'w-24', 'num'],
  ['fittings', 'Fittings (opt.)', 'w-24', 'num'],
  ['quoted', 'Quoted value', 'w-28', 'num'],
];

function CostingCard({ o, upd, onPreview }) {
  const tot = useMemo(() => costTotals(o.costing), [o.costing]);
  const set = (id, k, v) => upd({ costing: o.costing.map((r) => (r.id === id ? { ...r, [k]: v } : r)) });
  return (
    <Card
      title="4. Costing & margin"
      icon={Calculator}
      actions={
        <div className="flex items-center gap-2">
          <select className="field !w-auto !py-0.5 text-xs" value={o.currency} onChange={(e) => upd({ currency: e.target.value })} aria-label="Currency">
            {['AED', 'USD', 'SAR', 'OMR', 'QAR', 'EUR'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <button className="btn-ghost !py-1 text-xs" onClick={onPreview}>
            <Eye size={13} /> Preview sheet
          </button>
          <button className="btn-ghost !py-1 text-xs" onClick={() => upd({ costing: [...o.costing, newCostRow()] })}>
            <Plus size={13} /> Add pump set
          </button>
        </div>
      }
    >
      <div className="overflow-auto">
        <table className="w-full min-w-[1300px] text-xs">
          <thead className="text-left text-slate-400">
            <tr>
              <th className="px-1 py-1">#</th>
              {COLS.map(([k, l]) => (
                <th key={k} className="px-1 py-1">
                  {l}
                </th>
              ))}
              <th className="px-1 py-1 text-right">Net cost</th>
              <th className="px-1 py-1 text-right">Net margin</th>
              <th className="px-1 py-1 text-right">Markup</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {o.costing.map((r, i) => {
              const c = costRow(r);
              return (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-1 py-1 text-slate-500">{i + 1}</td>
                  {COLS.map(([k, , w, type]) => (
                    <td key={k} className="px-1 py-1">
                      <input type={type === 'num' ? 'number' : 'text'} step="any" className={`field ${w} !py-1 text-xs ${type === 'num' ? 'text-right' : ''}`} value={r[k]} onChange={(e) => set(r.id, k, e.target.value)} aria-label={k} />
                    </td>
                  ))}
                  <td className="px-1 py-1 text-right font-semibold text-slate-100">{money(c.net)}</td>
                  <td className={`px-1 py-1 text-right font-semibold ${c.margin < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{money(c.margin)}</td>
                  <td className="px-1 py-1 text-right">{pct(c.markup)}</td>
                  <td>
                    <button className="btn-ghost !p-1 hover:!text-red-400" onClick={() => upd({ costing: o.costing.filter((x) => x.id !== r.id) })} aria-label="Remove row">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          ['Net cost', `${o.currency} ${money(tot.net)}`],
          ['Quoted value', `${o.currency} ${money(tot.quoted)}`],
          ['Net margin', `${o.currency} ${money(tot.margin)}`, tot.margin < 0 ? 'text-red-400' : 'text-emerald-400'],
          ['Markup on cost', pct(tot.markup)],
        ].map(([l, v, tone]) => (
          <div key={l} className="rounded-xl border border-line p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">{l}</div>
            <div className={`font-display text-lg font-bold ${tone || 'text-slate-50'}`}>{v}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Costs are per pump set; net cost = (pump + panel + assembly + VFD + vessel + fittings) × qty. Quoted value is the total for the row. Markup on cost = margin ÷ net cost.</p>
    </Card>
  );
}

function ItemsCard({ o, upd }) {
  const set = (id, k, v) => upd({ items: o.items.map((r) => (r.id === id ? { ...r, [k]: v } : r)) });
  return (
    <Card
      title="5. Item codes"
      icon={Hash}
      actions={
        <div className="flex gap-2">
          <button className="btn-ghost !py-1 text-xs" onClick={() => upd({ items: o.costing.map((r) => newItemRow({ model: r.name.split(' – ').pop(), qty: r.qty })) })} title="Replace the rows with one per costing line">
            <Copy size={13} /> From costing rows
          </button>
          <button className="btn-ghost !py-1 text-xs" onClick={() => upd({ items: [...o.items, newItemRow()] })}>
            <Plus size={13} /> Add item
          </button>
        </div>
      }
    >
      <div className="overflow-auto">
        <table className="w-full min-w-[640px] text-xs">
          <thead className="text-left text-slate-400">
            <tr>
              <th className="px-1 py-1">#</th>
              <th className="px-1 py-1">Item code</th>
              <th className="px-1 py-1">Pump model</th>
              <th className="px-1 py-1">Qty</th>
              <th className="px-1 py-1">Rated current (A)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {o.items.map((r, i) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-1 py-1 text-slate-500">{i + 1}</td>
                <td className="px-1 py-1">
                  <input className="field !py-1 text-xs" value={r.code} onChange={(e) => set(r.id, 'code', e.target.value)} aria-label="Item code" />
                </td>
                <td className="px-1 py-1">
                  <input className="field !py-1 text-xs" value={r.model} onChange={(e) => set(r.id, 'model', e.target.value)} aria-label="Pump model" />
                </td>
                <td className="px-1 py-1">
                  <input type="number" className="field !w-20 !py-1 text-right text-xs" value={r.qty} onChange={(e) => set(r.id, 'qty', e.target.value)} aria-label="Qty" />
                </td>
                <td className="px-1 py-1">
                  <input type="number" step="any" className="field !w-28 !py-1 text-right text-xs" value={r.current} onChange={(e) => set(r.id, 'current', e.target.value)} aria-label="Rated current" />
                </td>
                <td>
                  <button className="btn-ghost !p-1 hover:!text-red-400" onClick={() => upd({ items: o.items.filter((x) => x.id !== r.id) })} aria-label="Remove item">
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
