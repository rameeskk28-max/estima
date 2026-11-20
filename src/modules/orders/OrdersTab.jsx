import { useMemo, useRef, useState } from 'react';
import { ClipboardList, Plus, Trash2, FileDown, LoaderCircle, FileInput, Calculator, Hash, FileText, Building2, BookOpen, Copy, Eye, Upload, TriangleAlert, CheckCircle2 } from 'lucide-react';
import { readDatasheet, modelKey } from '../../lib/datasheet.js';
import { useStore } from '../../store.jsx';
import { Card, downloadBytes, safeName } from '../../components/ui.jsx';
import { FileSlot } from '../../components/FileSlot.jsx';
import { SheetPreviewModal } from '../../components/SheetPreview.jsx';
import { compileSubmittal } from '../../lib/pdf/compile.js';
import { compressPdf } from '../../lib/pdf/compress.js';
import { matchModel } from '../../lib/quote/generate.js';
import { ORDER_SECTIONS, orderSlot, newCostRow, newItemRow, costRow, costSummary, commonOf, orderEntries, costingSheet, money, pct } from '../../lib/orders.js';

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

  /** Read datasheets: add each file to section 6 and fill / update the costing and item-code rows. */
  const readDatasheets = async (fileList) => {
    const list = [...(fileList || [])].filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    if (!list.length) return;
    setBusy('Reading datasheets…');
    try {
      const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const found = [];
      const recs = [];
      for (const [k, file] of list.entries()) {
        setBusy(`Reading ${file.name} (${k + 1}/${list.length})…`);
        const bytes = new Uint8Array(await file.arrayBuffer());
        let info;
        try {
          info = await readDatasheet(bytes.slice(), pdfjs, file.name);
        } catch (e) {
          info = { model: '', motorKw: null, current: null, missing: ['model', 'motor kW', 'rated current'], error: e.message };
        }
        found.push({ file: file.name, ...info });
        recs.push({ name: file.name, size: bytes.length, pages: info.pages || 0, bytes });
      }
      await addFiles(orderSlot(o, 'datasheets'), recs);
      updateOrder(o.id, (cur) => {
        const costing = [...cur.costing];
        const items = [...cur.items];
        const same = (a, b) => {
          const x = modelKey(a);
          const y = modelKey(b);
          return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
        };
        for (const f of found) {
          if (!f.model) continue;
          // costing: one row per pump set – "Pump set / item" = model, "VFD kW" = motor kW
          const c = costing.findIndex((r) => same(r.name.split(' – ').pop(), f.model) || same(r.name, f.model));
          if (c >= 0) costing[c] = { ...costing[c], name: costing[c].name || f.model, vfdKw: costing[c].vfdKw === '' || costing[c].vfdKw == null ? f.motorKw ?? '' : costing[c].vfdKw };
          else {
            const blank = costing.findIndex((r) => !r.name && !r.pump && !r.quoted);
            const row = newCostRow({ name: f.model, vfdKw: f.motorKw ?? '' });
            if (blank >= 0) costing[blank] = { ...row, id: costing[blank].id };
            else costing.push(row);
          }
          // item codes: model, rated current (qty kept)
          const i = items.findIndex((r) => same(r.model, f.model));
          if (i >= 0) items[i] = { ...items[i], model: items[i].model || f.model, current: items[i].current === '' || items[i].current == null ? f.current ?? '' : items[i].current };
          else {
            const blank = items.findIndex((r) => !r.model && !r.code);
            const row = newItemRow({ model: f.model, current: f.current ?? '' });
            if (blank >= 0) items[blank] = { ...row, id: items[blank].id };
            else items.push(row);
          }
        }
        const info = [...(cur.datasheetInfo || []).filter((x) => !found.some((f) => f.file === x.file)), ...found.map(({ file, model, motorKw, current, voltage, flow, head, motorMake, selectionRef, missing, textPdf }) => ({ file, model, motorKw, current, voltage, flow, head, motorMake, selectionRef, missing, textPdf }))];
        return { costing, items, datasheetInfo: info };
      });
      const gaps = found.filter((f) => f.missing?.length).length;
      notify(`${found.length} datasheet(s) read and added${gaps ? ` – ${gaps} with missing values (highlighted, please type them)` : ''}`, gaps ? 'bad' : 'ok');
    } catch (e) {
      console.error(e);
      notify(`Could not read the datasheets: ${e.message}`, 'bad');
    } finally {
      setBusy('');
    }
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
              const tot = costSummary(x);
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

              <CostingCard o={o} upd={upd} onPreview={() => setPreview({ sheet: costingSheet(o), project: { ...project, projectName: o.details.find((x) => /project/i.test(x.label))?.value || project.projectName, refNo: o.orderNo || project.refNo } })} />
              <ItemsCard o={o} upd={upd} />

              <Card title="6. Pump datasheets" icon={BookOpen} actions={<button className="btn-ghost !py-1 text-xs" onClick={fillDatasheets}><Copy size={13} /> Add from Document Library</button>}>
                <DatasheetReader busy={busy} onFiles={readDatasheets} info={o.datasheetInfo || []} />
                <FileSlot slotId={orderSlot(o, 'datasheets')} label="Attach other datasheets (without reading)" />
                <p className="mt-2 text-[11px] text-slate-500">“Add from Document Library” copies the saved datasheets of the pump models in the item-code table.</p>
              </Card>
            </div>
          )}
        </div>
      )}
      {preview && <SheetPreviewModal open onClose={() => setPreview(null)} sheet={preview.sheet} project={preview.project} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
const COLS = [
  ['name', 'Pump model', 'w-56', 'text'],
  ['qty', 'Qty', 'w-16', 'num'],
  ['pump', 'Pump cost (incl. duty)', 'w-28', 'num'],
  ['vfdKw', 'VFD kW', 'w-20', 'num'],
  ['vfd', 'VFD cost', 'w-28', 'num'],
  ['vesselSize', 'PV size', 'w-24', 'text'],
  ['vessel', 'PV cost', 'w-28', 'num'],
];

function CostingCard({ o, upd, onPreview }) {
  const sm = useMemo(() => costSummary(o), [o]);
  const common = commonOf(o);
  const set = (id, k, v) => upd({ costing: o.costing.map((r) => (r.id === id ? { ...r, [k]: v } : r)) });
  const setCommon = (k, v) => upd({ common: { ...common, [k]: v } });
  const project = o.details.find((d) => /project/i.test(d.label))?.value || 'This order';
  const line = (label, value, cls = '') => (
    <tr className={`border-t border-line ${cls}`}>
      <td className="px-3 py-1.5">{label}</td>
      <td className="px-3 py-1.5 text-right tabular-nums">{value}</td>
    </tr>
  );
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
            <Plus size={13} /> Add pump
          </button>
        </div>
      }
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Each pump – cost per unit</div>
      <div className="overflow-auto">
        <table className="w-full min-w-[980px] text-xs">
          <thead className="text-left text-slate-400">
            <tr>
              <th className="px-1 py-1">#</th>
              {COLS.map(([k, l]) => (
                <th key={k} className="px-1 py-1">
                  {l}
                </th>
              ))}
              <th className="px-1 py-1 text-right">Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {o.costing.map((r, i) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-1 py-1 text-slate-500">{i + 1}</td>
                {COLS.map(([k, , w, type]) => (
                  <td key={k} className="px-1 py-1">
                    <input type={type === 'num' ? 'number' : 'text'} step="any" className={`field ${w} !py-1 text-xs ${type === 'num' ? 'text-right' : ''}`} value={r[k] ?? ''} onChange={(e) => set(r.id, k, e.target.value)} aria-label={k} />
                  </td>
                ))}
                <td className="px-1 py-1 text-right font-semibold tabular-nums text-slate-100">{money(costRow(r).total)}</td>
                <td>
                  <button className="btn-ghost !p-1 hover:!text-red-400" onClick={() => upd({ costing: o.costing.filter((x) => x.id !== r.id) })} aria-label="Remove row">
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">For the whole set ({o.currency})</div>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              ['panel', 'Control panel – total'],
              ['assembly', 'Assembly – total'],
              ['quoted', 'Quoted value (enter)'],
            ].map(([k, l]) => (
              <label key={k} className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {l}
                <input type="number" step="any" className={`field mt-1 text-right ${k === 'quoted' ? '!border-amber-500/60 !bg-amber-500/10' : ''}`} value={common[k] ?? ''} onChange={(e) => setCommon(k, e.target.value)} />
              </label>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Pump, VFD and PV costs are per unit × qty. Control panel and assembly are one figure each for the whole set. Net margin % = net margin ÷ net cost.</p>
        </div>
        {/* summary – same layout as the costing template */}
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy-500/40 text-left text-slate-50">
                <th className="px-3 py-2">Cost Component</th>
                <th className="truncate px-3 py-2 text-right">{String(project).toUpperCase()}</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {line('Pump Cost (incl. duty)', money(sm.pump))}
              {line('VFD Cost', money(sm.vfd))}
              {line('PV Cost', money(sm.vessel))}
              {line('Control Panel Cost', money(sm.panel))}
              {line('Assembly Cost', money(sm.assembly))}
              {line('Net Cost', money(sm.net), 'bg-sky-500/10 font-bold text-slate-50')}
              {line('Quoted Value', money(sm.quoted), 'text-amber-300')}
              {line('Net Margin', money(sm.margin), `font-bold ${sm.margin < 0 ? 'text-red-400' : 'text-emerald-400'}`)}
              {line('Net Margin % (on cost)', pct(sm.markup), `font-bold ${sm.margin < 0 ? 'text-red-400' : 'text-emerald-400'}`)}
            </tbody>
          </table>
        </div>
      </div>
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
                  <input className={`field !py-1 text-xs ${r.model && !r.code ? '!border-amber-500/70' : ''}`} value={r.code} onChange={(e) => set(r.id, 'code', e.target.value)} aria-label="Item code" placeholder={r.model ? 'type item code' : ''} />
                </td>
                <td className="px-1 py-1">
                  <input className="field !py-1 text-xs" value={r.model} onChange={(e) => set(r.id, 'model', e.target.value)} aria-label="Pump model" />
                </td>
                <td className="px-1 py-1">
                  <input type="number" className="field !w-20 !py-1 text-right text-xs" value={r.qty} onChange={(e) => set(r.id, 'qty', e.target.value)} aria-label="Qty" />
                </td>
                <td className="px-1 py-1">
                  <input type="number" step="any" className={`field !w-28 !py-1 text-right text-xs ${r.model && (r.current === '' || r.current == null) ? '!border-amber-500/70 !bg-amber-500/10' : ''}`} value={r.current} onChange={(e) => set(r.id, 'current', e.target.value)} aria-label="Rated current" placeholder={r.model ? 'type A' : ''} />
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

function DatasheetReader({ busy, onFiles, info }) {
  const ref = useRef(null);
  return (
    <div className="mb-3">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => (e.preventDefault(), onFiles(e.dataTransfer.files))}
        onClick={() => !busy && ref.current?.click()}
        className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-brand-500/40 bg-brand-500/5 p-5 text-center transition hover:border-brand-500"
      >
        {busy ? <LoaderCircle size={22} className="animate-spin text-brand-400" /> : <Upload size={22} className="text-brand-400" />}
        <div className="text-sm font-semibold text-slate-50">Upload & read pump datasheets – several at once</div>
        <div className="text-[11px] text-slate-400">Model, motor kW and rated current are filled into the costing and item-code tables; the files are added below.</div>
        <input ref={ref} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={(e) => (onFiles(e.target.files), (e.target.value = ''))} />
      </div>
      {info.length > 0 && (
        <div className="mt-2 overflow-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead className="text-left text-slate-400">
              <tr>
                <th className="px-1 py-1">Datasheet</th>
                <th className="px-1 py-1">Model</th>
                <th className="px-1 py-1 text-right">Motor kW</th>
                <th className="px-1 py-1 text-right">Rated current</th>
                <th className="px-1 py-1">Duty</th>
                <th className="px-1 py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {info.map((f) => (
                <tr key={f.file} className="border-t border-line">
                  <td className="max-w-[180px] truncate px-1 py-1 text-slate-300" title={f.file}>
                    {f.file}
                  </td>
                  <td className="px-1 py-1 font-semibold text-slate-100">{f.model || '–'}</td>
                  <td className="px-1 py-1 text-right">{f.motorKw ?? '–'}</td>
                  <td className="px-1 py-1 text-right">{f.current != null ? `${f.current} A` : '–'}</td>
                  <td className="px-1 py-1 text-slate-400">{f.flow ? `${f.flow} l/s @ ${f.head} m` : '–'}</td>
                  <td className="px-1 py-1">
                    {f.missing?.length ? (
                      <span className="flex items-center gap-1 text-amber-400">
                        <TriangleAlert size={12} /> {f.textPdf === false ? 'image PDF – ' : ''}type {f.missing.join(', ')}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 size={12} /> read
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
