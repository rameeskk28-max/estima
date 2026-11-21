import { useMemo, useRef, useState } from 'react';
import { FileInput, Library, ClipboardCheck, Upload, LoaderCircle, CheckCircle2, XCircle, Wand2, FileDown, ArrowRight, Plus, Trash2, Search, HardDriveDownload, Cloud, CloudOff, LogIn, LogOut, RefreshCw, KeyRound, HardDriveUpload, Settings2, Package, Building2, ShieldCheck, FileText } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { Card, Field, TextField, SelectField, downloadBytes, safeName } from '../../components/ui.jsx';
import { FileSlot } from '../../components/FileSlot.jsx';
import { parseQuote, extractItems } from '../../lib/quote/parse.js';
import { generateFromQuote, systemName, tagFrom, equipmentText, matchModel, LIBRARY_DOCS, warrantySheet } from '../../lib/quote/generate.js';
import { LIT_TEMPLATES } from '../../lib/literature.js';
import { compileSubmittal } from '../../lib/pdf/compile.js';
import { compressPdf } from '../../lib/pdf/compress.js';
import { CompressionSelect } from '../submittal/SubmittalBuilder.jsx';
import { readBackup } from '../../lib/backup.js';
import { displayName } from '../../lib/cloud.js';
import { SheetPreviewModal } from '../../components/SheetPreview.jsx';

export const QUOTE_ITEMS = [
  { key: 'generate', label: 'Quote → Submittal', icon: FileInput, desc: 'Upload a quotation and generate the submittal' },
  { key: 'compliance', label: 'Compliance Statement', icon: ClipboardCheck, desc: 'Specification clauses → technical compliance statement' },
  { key: 'library', label: 'Document Library', icon: Library, desc: 'Company documents, pump datasheets & drawings saved once' },
];

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

const ok = (b) => (b ? <CheckCircle2 size={15} className="shrink-0 text-emerald-400" /> : <XCircle size={15} className="shrink-0 text-red-400" />);
const n2 = (x) => (x == null ? '' : String(Math.round(x * 100) / 100));
const SCHEDULE_REQUIRED = ['eff', 'kw', 'rpm', 'phase', 'motorClass', 'certs', 'housing', 'impeller'];
const missing = (it) => SCHEDULE_REQUIRED.filter((k) => it[k] === '' || it[k] == null);
/** Highlights an empty field. */
const Miss = ({ v, children }) => <div className={v === '' || v == null ? 'rounded-lg ring-1 ring-amber-500/60 ring-offset-2 ring-offset-transparent' : ''}>{children}</div>;
const CAT_OF = { transfer: 'transfer', 'booster-vfd': 'booster', 'booster-fixed': 'booster', circulation: 'circulation', sump: 'sump' };
/** Pre-select a saved calculation when exactly one matches the item's category. */
function autoDuty(duties, it) {
  const m = duties.filter((d) => d.kind === 'pump' && d.sheet && d.category === CAT_OF[it.template]);
  return m.length === 1 ? m[0].id : '';
}

/* ================================================================== */
export function QuoteGenerator({ go }) {
  const { quoteDraft: d, setQuoteDraft, library, files, applyQuote, notify, project, entries, duties, literature, getLogo, schedule, warrantyDoc, addModel, compliance, stamp } = useStore();
  const dutiesById = Object.fromEntries(duties.map((x) => [x.id, x]));
  const [busy, setBusy] = useState('');
  const [generated, setGenerated] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const read = async (file) => {
    if (!file) return;
    if (!/pdf$/i.test(file.name) && file.type !== 'application/pdf') return notify('Please select the quotation PDF', 'bad');
    setBusy('Reading quotation…');
    try {
      const pdfjs = await loadPdfjs();
      const q = parseQuote(await extractItems(new Uint8Array(await file.arrayBuffer()), pdfjs));
      if (!q.items.length) throw new Error('No pump items found in this quotation.');
      const S = library.settings;
      setQuoteDraft({
        fileName: file.name,
        header: q.header,
        items: q.items.map((it) => ({
          ...it,
          include: true,
          system: systemName(it),
          tag: tagFrom(it.title),
          reqFlow: '',
          reqHead: '',
          eff: '',
          certs: S.certs?.[it.template] ?? '',
          motorClass: S.motorClass || '',
          starter: it.vfd ? 'VFD' : (it.electrical || []).some((e) => /^SD$|star[\s-]*delta/i.test(e.trim())) ? 'Star-Delta' : 'DOL',
          dutyId: autoDuty(duties, it),
        })),
        form: {
          projectName: q.header.project || '',
          client: '',
          consultant: '',
          contractor: q.header.customer,
          plot: '',
          material: S.material,
          brand: S.brand,
          refNo: '',
          revision: '0',
          date: new Date().toISOString().slice(0, 10),
          warrantyPeriod: q.header.warranty || 'THREE years from the date of Initial Start',
          warrantyEquipment: equipmentText(q.items),
        },
      });
      setGenerated(false);
      notify(`Quotation ${q.header.quoteNo || ''} read – ${q.items.length} item(s) found`);
    } catch (e) {
      console.error(e);
      notify(e.message || 'Could not read the quotation', 'bad');
    } finally {
      setBusy('');
    }
  };

  const setForm = (patch) => setQuoteDraft((x) => ({ ...x, form: { ...x.form, ...patch } }));
  const setItem = (k, patch) => setQuoteDraft((x) => ({ ...x, items: x.items.map((it, j) => (j === k ? { ...it, ...patch } : it)) }));

  const generate = () => {
    const f = d.form;
    if (!f.projectName.trim()) return notify('Enter the project name first', 'bad');
    if (entries.length && !confirm('Generating replaces the current submittal index, pump schedule, project header and quote literature. Continue?')) return;
    const gen = generateFromQuote(d, f, library, dutiesById);
    applyQuote(gen);
    setGenerated(true);
    notify(`Submittal generated – ${gen.entries.length} sections`);
  };

  const compileNow = async () => {
    setBusy('Compiling…');
    try {
      const res = await compileSubmittal({ project, entries, duties, files, logo: await getLogo(), schedule, literature, warranty: warrantyDoc, librarySettings: library.settings, compliance, stamp }, setBusy);
      res.bytes = await compressPdf(res.bytes, library.settings.compression || 'standard', setBusy);
      downloadBytes(res.bytes, `${safeName(project.refNo || 'Submittal')}_Rev${safeName(project.revision || '0')}_${safeName(project.projectName || 'Project')}.pdf`);
      notify(res.warnings.length ? `${res.pageCount} pages – ${res.warnings.length} warning(s), see Submittal Package` : `Submittal compiled – ${res.pageCount} A4 pages`, res.warnings.length ? 'bad' : 'ok');
    } catch (e) {
      notify(`Compilation failed: ${e.message}`, 'bad');
    } finally {
      setBusy('');
    }
  };

  const libStatus = LIBRARY_DOCS.map((doc) => ({ ...doc, n: (files[doc.key] || []).length }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-slate-50">
            <FileInput className="text-brand-400" size={22} /> Quote → Submittal
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Upload a Greenland quotation PDF – ERP quotation (Q26…) or Sales Quotation (GL-FE-…) format. The pump items are read automatically, matched with your Document Library (company documents, datasheets, drawings) and turned into the pump schedule, technical literature and the full submittal index.
          </p>
        </div>
      </div>

      {/* Step 1 – upload */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          read(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        className={`card flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed p-8 text-center transition ${drag ? 'border-brand-500 bg-brand-500/10' : 'hover:border-brand-500/60'}`}
      >
        {busy ? <LoaderCircle className="animate-spin text-brand-400" size={30} /> : <Upload className="text-brand-400" size={30} />}
        <div className="font-display text-lg font-bold text-slate-50">{busy || (d ? `Replace quotation (${d.fileName})` : 'Drop the quotation PDF here or click to upload')}</div>
        <div className="text-xs text-slate-400">Read in your browser – the quotation is not uploaded anywhere.</div>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => (read(e.target.files?.[0]), (e.target.value = ''))} />
      </div>

      {d && (
        <>
          <div className="card flex flex-wrap gap-x-8 gap-y-2 rounded-2xl p-4 text-sm">
            {[
              ['Quotation', d.header.quoteNo],
              ['Date', d.header.quoteDate],
              ['Customer', d.header.customer],
              ['Salesperson', d.header.salesperson],
              ['Warranty', d.header.warranty],
              ['Items', `${d.items.filter((i) => i.include !== false).length} / ${d.items.length} included`],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="text-[11px] uppercase tracking-wide text-slate-500">{k}</div>
                <div className="font-semibold text-slate-100">{v || '–'}</div>
              </div>
            ))}
          </div>

          <Card title="1. Project details (not in the quotation)" icon={Building2}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <TextField label="Project name *" value={d.form.projectName} onChange={(v) => setForm({ projectName: v })} className="sm:col-span-2" placeholder="e.g. VISTA HUB – Commercial & Office Building G+3P+9+Roof" />
              <TextField label="Plot" value={d.form.plot} onChange={(v) => setForm({ plot: v })} placeholder="e.g. No.5919629 @ Jabal Ali 1st" />
              <TextField label="Submittal reference no." value={d.form.refNo} onChange={(v) => setForm({ refNo: v })} placeholder="e.g. GL-FE-26-00022" />
              <TextField label="Client" value={d.form.client} onChange={(v) => setForm({ client: v })} />
              <TextField label="Consultant" value={d.form.consultant} onChange={(v) => setForm({ consultant: v })} />
              <TextField label="Contractor (from quote customer)" value={d.form.contractor} onChange={(v) => setForm({ contractor: v })} className="sm:col-span-2" />
              <TextField label="Material" value={d.form.material} onChange={(v) => setForm({ material: v })} />
              <TextField label="Brand" value={d.form.brand} onChange={(v) => setForm({ brand: v })} />
              <TextField label="Revision" value={d.form.revision} onChange={(v) => setForm({ revision: v })} />
              <TextField label="Date" type="date" value={d.form.date} onChange={(v) => setForm({ date: v })} />
            </div>
          </Card>

          <Card title={`2. Quotation items (${d.items.length})`} icon={Package} bodyClass="p-3 space-y-3">
            {d.items.map((it, k) => {
              const m = matchModel(library.models, it.model);
              const ds = m ? (files[`libm-${m.id}-datasheet`] || []).length : 0;
              const dw = m ? (files[`libm-${m.id}-drawing`] || []).length : 0;
              return (
                <div key={k} className={`rounded-2xl border p-3 transition ${it.include === false ? 'border-line/50 opacity-50' : 'border-line bg-ink-950/40'}`}>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-xs text-slate-300">
                      <input type="checkbox" className="accent-brand-500" checked={it.include !== false} onChange={(e) => setItem(k, { include: e.target.checked })} /> Item {it.no}
                    </label>
                    <span className="truncate text-xs text-slate-500">{it.title}</span>
                    <span className="glass-pill ml-auto rounded-full px-2.5 py-0.5 text-xs text-slate-300">
                      Qty <b className="text-slate-50">{it.qty}</b>
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
                    <TextField label="System name" value={it.system} onChange={(v) => setItem(k, { system: v })} className="col-span-2" />
                    <SelectField label="Literature template" value={it.template} onChange={(v) => setItem(k, { template: v })} options={Object.entries(LIT_TEMPLATES).map(([value, t]) => ({ value, label: t.label }))} />
                    <TextField label="Tag" value={it.tag} onChange={(v) => setItem(k, { tag: v })} />
                    <TextField label="Arrangement" value={it.arrangement} onChange={(v) => setItem(k, { arrangement: v })} />
                    <TextField label="Model" value={it.model} onChange={(v) => setItem(k, { model: v })} />
                    <TextField label="Proposed flow (L/s)" value={n2(it.flowLps)} onChange={(v) => setItem(k, { flowLps: Number(v) || 0 })} />
                    <TextField label="Proposed head (m)" value={n2(it.headM)} onChange={(v) => setItem(k, { headM: Number(v) || 0 })} />
                    <TextField label="Specified flow (L/s)" value={it.reqFlow} onChange={(v) => setItem(k, { reqFlow: v })} placeholder="consultant" />
                    <TextField label="Specified head (m)" value={it.reqHead} onChange={(v) => setItem(k, { reqHead: v })} placeholder="consultant" />
                  </div>
                  <div className="mt-3 rounded-xl border border-line/70 p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Pump schedule fields
                      {missing(it).length > 0 && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 normal-case tracking-normal text-amber-400">{missing(it).length} missing – fill manually</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
                      <Miss v={it.eff}><TextField label="Efficiency %" value={it.eff} onChange={(v) => setItem(k, { eff: v })} placeholder="e.g. 68.6" /></Miss>
                      <Miss v={it.kw}><TextField label="Power kW" value={it.kw ?? ''} onChange={(v) => setItem(k, { kw: v === '' ? null : Number(v) || v })} /></Miss>
                      <Miss v={it.rpm}><TextField label="Speed rpm" value={it.rpm ?? ''} onChange={(v) => setItem(k, { rpm: v })} /></Miss>
                      <Miss v={it.phase}><TextField label="Phase" value={it.phase ?? ''} onChange={(v) => setItem(k, { phase: v })} /></Miss>
                      <Miss v={it.motorClass}><TextField label="Motor IE class" value={it.motorClass} onChange={(v) => setItem(k, { motorClass: v })} /></Miss>
                      <Miss v={it.certs}><TextField label="Certificates" value={it.certs} onChange={(v) => setItem(k, { certs: v })} placeholder="WRAS, ACS / NA" /></Miss>
                      <TextField label="Pressure vessel (L)" value={it.vessel} onChange={(v) => setItem(k, { vessel: v })} placeholder="NA" />
                      <TextField label="Suction × discharge" value={it.header} onChange={(v) => setItem(k, { header: v })} placeholder="NA" />
                      <SelectField label="Starter" value={it.starter} onChange={(v) => setItem(k, { starter: v })} options={['DOL', 'VFD', 'Star-Delta', 'Soft starter'].map((x) => ({ value: x, label: x }))} />
                      <Miss v={it.housing}><TextField label="Casing / housing" value={it.housing} onChange={(v) => setItem(k, { housing: v })} /></Miss>
                      <Miss v={it.impeller}><TextField label="Impeller" value={it.impeller} onChange={(v) => setItem(k, { impeller: v })} /></Miss>
                      <TextField label="Shaft" value={it.shaft} onChange={(v) => setItem(k, { shaft: v })} />
                      <Field label="Hydraulic calculation" className="col-span-2 xl:col-span-4">
                        <select className="field" value={it.dutyId || ''} onChange={(e) => setItem(k, { dutyId: e.target.value })}>
                          <option value="">{duties.length ? 'None – no calculation sheet' : 'No saved calculations (Calculations folder → Save to Submittal)'}</option>
                          {duties
                            .filter((d) => d.sheet)
                            .map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.tag} – {d.calcType}
                                {d.flowLps != null ? ` – ${n2(d.flowLps)} L/s @ ${n2(d.headM)} m` : ''}
                              </option>
                            ))}
                        </select>
                      </Field>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <span className="flex items-center gap-1.5 text-slate-300">{ok(!!m)} Library model {m ? <b className="text-slate-50">{m.model}</b> : 'not found'}</span>
                    <span className="flex items-center gap-1.5 text-slate-300">{ok(ds > 0)} Datasheet</span>
                    <span className="flex items-center gap-1.5 text-slate-300">{ok(dw > 0)} Drawing</span>
                    <span className="text-slate-500">· {it.electrical.length} electrical / {it.mechanical.length} mechanical features from quote</span>
                    {!m && it.model && (
                      <button className="btn-ghost !py-0.5 text-xs text-brand-400" onClick={() => (addModel(it.model), notify(`${it.model} added – attach its datasheet & drawing in the Document Library`))}>
                        <Plus size={13} /> Add {it.model} to library
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="3. Warranty certificate (draft)" icon={ShieldCheck}>
              <div className="space-y-3">
                <TextField label="Warranty period" value={d.form.warrantyPeriod} onChange={(v) => setForm({ warrantyPeriod: v })} hint="Pre-filled from the quotation – edit if needed" />
                <TextField label="Equipment description" value={d.form.warrantyEquipment} onChange={(v) => setForm({ warrantyEquipment: v })} />
                <WarrantyPreviewButton form={d.form} />
              </div>
            </Card>
            <Card title="4. Document Library check" icon={Library}>
              <ul className="space-y-1.5 text-sm">
                {libStatus.map((x) => (
                  <li key={x.key} className="flex items-center gap-2 text-slate-300">
                    {ok(x.n > 0)} {x.title}
                    <span className="ml-auto text-xs text-slate-500">{x.n ? `${x.n} file(s)` : 'missing'}</span>
                  </li>
                ))}
              </ul>
              <button className="btn-ghost mt-2 !px-0 text-xs text-brand-400" onClick={() => go('quote/library')}>
                Open Document Library <ArrowRight size={13} />
              </button>
            </Card>
          </div>

          <div className="card flex flex-wrap items-center gap-3 rounded-2xl p-4">
            <div className="text-sm text-slate-300">
              {generated ? (
                <span className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 size={16} /> Submittal generated – review it in Submittal Package, add the Technical Compliance Statement, then compile.
                </span>
              ) : (
                'Creates the project header, pump schedule, one technical literature per item and the full index.'
              )}
            </div>
            {generated && (
              <div className="w-full sm:w-72 [&>label]:mt-0">
                <CompressionSelect />
              </div>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              {generated && (
                <>
                  <button className="btn-secondary" onClick={() => go('submittal')}>
                    <FileText size={16} /> Open Submittal Package
                  </button>
                  <button className="btn-secondary" onClick={compileNow} disabled={!!busy}>
                    {busy ? <LoaderCircle size={16} className="animate-spin" /> : <FileDown size={16} />} Compile & download
                  </button>
                </>
              )}
              <button className="btn-primary" onClick={generate}>
                <Wand2 size={16} /> {generated ? 'Generate again' : 'Generate submittal'}
              </button>
            </div>
          </div>

          {generated && (
            <Card title="Technical Compliance Statement" icon={ClipboardCheck}>
              <p className="text-sm text-slate-300">
                {compliance.rows.length ? `${compliance.rows.filter((r) => r.type === 'clause').length} clauses ready – inserted automatically.` : 'Not prepared yet.'}{' '}
                <button className="text-brand-400 underline-offset-2 hover:underline" onClick={() => go('quote/compliance')}>
                  Open Compliance Statement
                </button>
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function WarrantyPreviewButton({ form }) {
  const { library, project } = useStore();
  const [open, setOpen] = useState(false);
  const p = { ...project, projectName: form.projectName || project.projectName, client: form.client, consultant: form.consultant, contractor: form.contractor, plot: form.plot, material: form.material, brand: form.brand };
  const sheet = useMemo(() => warrantySheet(p, { period: form.warrantyPeriod, equipment: form.warrantyEquipment }, library.settings), [form, library.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <button className="btn-secondary !py-1.5 text-xs" onClick={() => setOpen(true)}>
        <FileText size={14} /> Preview certificate
      </button>
      <SheetPreviewModal open={open} onClose={() => setOpen(false)} sheet={sheet} project={p} />
    </>
  );
}

/* ================================================================== */
export function DocumentLibrary() {
  const { library, files, addModel, updateModel, removeModel, setLibrarySettings, exportBackup, importBackup, notify } = useStore();
  const [q, setQ] = useState('');
  const [newModel, setNewModel] = useState('');
  const [busy, setBusy] = useState('');
  const S = library.settings;
  const importRef = useRef(null);
  const models = library.models.filter((m) => !q || m.model.toLowerCase().includes(q.toLowerCase()));

  const doExport = (kind) => {
    setBusy(kind);
    setTimeout(() => {
      try {
        const json = exportBackup(kind);
        downloadBytes(new TextEncoder().encode(json), `greenland-${kind === 'library' ? 'library' : 'workspace'}-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
        notify(`${kind === 'library' ? 'Library' : 'Workspace'} backup downloaded (${(json.length / 1048576).toFixed(1)} MB)`);
      } finally {
        setBusy('');
      }
    }, 30);
  };
  const doImport = async (file) => {
    if (!file) return;
    setBusy('import');
    try {
      const b = readBackup(await file.text());
      if (b.kind === 'workspace' && !confirm('This is a full workspace backup – it replaces your current project, schedule, literature and replies (library items are merged). Continue?')) return;
      await importBackup(b);
      notify(`Backup imported – ${b.files.length} file(s)`);
    } catch (e) {
      notify(e.message, 'bad');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-slate-50">
          <Library className="text-brand-400" size={22} /> Document Library
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">Save the documents that are the same in every submittal once. Pump datasheets, drawings and catalogues are matched to quotation items by model number.</p>
      </div>

      <CloudCard />

      <Card title="Backup – use the library on another computer" icon={HardDriveDownload}>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary" onClick={() => doExport('library')} disabled={!!busy}>
            {busy === 'library' ? <LoaderCircle size={16} className="animate-spin" /> : <HardDriveDownload size={16} />} Export library
          </button>
          <button className="btn-secondary" onClick={() => doExport('workspace')} disabled={!!busy}>
            {busy === 'workspace' ? <LoaderCircle size={16} className="animate-spin" /> : <HardDriveDownload size={16} />} Export full workspace
          </button>
          <button className="btn-secondary" onClick={() => importRef.current?.click()} disabled={!!busy}>
            {busy === 'import' ? <LoaderCircle size={16} className="animate-spin" /> : <HardDriveUpload size={16} />} Import backup
          </button>
          <input ref={importRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => (doImport(e.target.files?.[0]), (e.target.value = ''))} />
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Everything is stored in this browser. Export creates one .json file; open the website on the other computer and use Import backup. Library imports are merged with what is already there.</p>
      </Card>

      <Card title="Constant documents (used in every submittal)" icon={FileText}>
        <div className="grid gap-4 md:grid-cols-2">
          {LIBRARY_DOCS.map((doc) => (
            <div key={doc.key} className="rounded-2xl border border-line bg-ink-950/40 p-3">
              <div className="mb-2 flex items-center gap-2">
                {ok((files[doc.key] || []).length > 0)}
                <span className="text-sm font-semibold text-slate-100">{doc.title}</span>
              </div>
              <p className="mb-2 text-[11px] text-slate-500">{doc.desc}</p>
              <FileSlot slotId={doc.key} label="Attach PDF" />
            </div>
          ))}
        </div>
      </Card>

      <Card
        title={`Pump models (${library.models.length})`}
        icon={Package}
        actions={
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className="field !w-48 !py-1 !pl-7 text-xs" placeholder="Search model" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap gap-2">
          <input className="field max-w-sm flex-1" placeholder="Model code exactly as in the quotation, e.g. 10VR0300NF1B-D5EB" value={newModel} onChange={(e) => setNewModel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && newModel.trim() && (addModel(newModel), setNewModel(''))} />
          <button className="btn-primary" disabled={!newModel.trim()} onClick={() => (addModel(newModel), setNewModel(''), notify('Model added – attach its datasheet and drawing'))}>
            <Plus size={16} /> Add model
          </button>
        </div>
        {!models.length && <p className="text-sm text-slate-500">No pump models yet. Add the model codes you quote most, with their datasheet (curves) and drawing.</p>}
        <div className="space-y-3">
          {models.map((m) => (
            <div key={m.id} className="rounded-2xl border border-line bg-ink-950/40 p-3">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <input className="field !w-72 font-semibold" value={m.model} onChange={(e) => updateModel(m.id, { model: e.target.value })} aria-label="Model code" />
                <input className="field min-w-[180px] flex-1" placeholder="Notes (optional)" value={m.notes || ''} onChange={(e) => updateModel(m.id, { notes: e.target.value })} aria-label="Notes" />
                <button className="btn-ghost !p-1.5 hover:!text-red-400" onClick={async () => confirm(`Delete model ${m.model} and its files?`) && (await removeModel(m.id))} aria-label="Delete model">
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  ['datasheet', 'Datasheet & performance curves'],
                  ['drawing', 'Drawing / skid layout'],
                  ['catalogue', 'Catalogue (optional)'],
                ].map(([k, l]) => (
                  <div key={k}>
                    <div className="lbl">{l}</div>
                    <FileSlot slotId={`libm-${m.id}-${k}`} label="Attach PDF" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Defaults & warranty text" icon={Settings2}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <TextField label="Default material" value={S.material} onChange={(v) => setLibrarySettings({ material: v })} />
          <TextField label="Default brand" value={S.brand} onChange={(v) => setLibrarySettings({ brand: v })} />
          <TextField label="Supplier line (warranty)" value={S.supplierLine} onChange={(v) => setLibrarySettings({ supplierLine: v })} className="lg:col-span-2" />
          <TextField label="Motor efficiency class" value={S.motorClass} onChange={(v) => setLibrarySettings({ motorClass: v })} />
          {Object.entries(LIT_TEMPLATES).map(([k, t]) => (
            <TextField key={k} label={`Certifications – ${t.label.replace(' System', '')}`} value={S.certs?.[k] ?? ''} onChange={(v) => setLibrarySettings({ certs: { ...S.certs, [k]: v } })} />
          ))}
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <Field label="Warranty certificate text" hint="Placeholders: {brand} {equipment} {period} {project}">
            <textarea className="field text-sm" rows={4} value={S.warrantyCertify} onChange={(e) => setLibrarySettings({ warrantyCertify: e.target.value })} />
          </Field>
          <Field label="Signatory line">
            <input className="field" value={S.warrantyFor} onChange={(e) => setLibrarySettings({ warrantyFor: e.target.value })} />
          </Field>
          <Field label="Warranty terms & conditions (one per line)" className="lg:col-span-2">
            <textarea className="field text-sm" rows={8} value={S.warrantyTerms} onChange={(e) => setLibrarySettings({ warrantyTerms: e.target.value })} />
          </Field>
        </div>
      </Card>
    </div>
  );
}

/* ================================================================== */
function CloudCard() {
  const { cloud, cloudSignIn, cloudSignOut, cloudSync, cloudChangePassword, notify } = useStore();
  const [email, setEmail] = useState('');
  const [np, setNp] = useState({ open: false, a: '', b: '' });
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  if (!cloud.configured)
    return (
      <Card title="Cloud library" icon={CloudOff}>
        <p className="text-sm text-slate-400">
          Cloud saving is not connected on this site yet – documents are kept in this browser only. Add <code className="text-brand-400">VITE_SUPABASE_URL</code> and <code className="text-brand-400">VITE_SUPABASE_ANON_KEY</code> in Netlify (see README) and redeploy.
        </p>
      </Card>
    );
  const tone = { syncing: 'text-amber-400', ok: 'text-emerald-400', error: 'text-red-400', off: 'text-slate-400' }[cloud.status];
  if (cloud.user)
    return (
      <Card title="Cloud library" icon={Cloud}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-sm text-slate-300">
            Signed in as <b className="text-slate-50">{displayName(cloud.user)}</b> – library documents are saved online and shared with your team.
            <div className={`mt-1 flex items-center gap-1 text-xs ${tone}`}>
              {cloud.status === 'syncing' && <LoaderCircle size={12} className="animate-spin" />} {cloud.msg || 'Ready'}
            </div>
          </div>
          <div className="ml-auto flex gap-2">
            <button className="btn-secondary" onClick={() => cloudSync()} disabled={cloud.status === 'syncing'}>
              <RefreshCw size={15} /> Sync now
            </button>
            <button className="btn-ghost" onClick={() => setNp({ open: !np.open, a: '', b: '' })}>
              <KeyRound size={15} /> Change password
            </button>
            <button className="btn-ghost" onClick={cloudSignOut}>
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>
        {np.open && (
          <form
            className="mt-3 flex flex-wrap items-end gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (np.a.length < 8) return notify('Use at least 8 characters', 'bad');
              if (np.a !== np.b) return notify('The two passwords do not match', 'bad');
              try {
                await cloudChangePassword(np.a);
                setNp({ open: false, a: '', b: '' });
                notify('Password changed');
              } catch (err) {
                notify(err.message, 'bad');
              }
            }}
          >
            <TextField label="New password" type="password" autoComplete="new-password" value={np.a} onChange={(v) => setNp((x) => ({ ...x, a: v }))} className="min-w-[180px] flex-1" />
            <TextField label="Repeat new password" type="password" autoComplete="new-password" value={np.b} onChange={(v) => setNp((x) => ({ ...x, b: v }))} className="min-w-[180px] flex-1" />
            <button className="btn-primary" type="submit">Save password</button>
          </form>
        )}
      </Card>
    );
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await cloudSignIn(email, pw);
      setPw('');
      notify('Signed in – syncing the library');
    } catch (err) {
      notify(err.message || 'Sign-in failed', 'bad');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Cloud library – sign in" icon={Cloud}>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <p className="w-full text-sm text-slate-400">Sign in to save the library online and open it on any computer. Without signing in, documents stay in this browser only.</p>
        <TextField label="Username" autoComplete="username" value={email} onChange={setEmail} className="min-w-[220px] flex-1" />
        <TextField label="Password" type="password" autoComplete="current-password" value={pw} onChange={setPw} className="min-w-[180px] flex-1" />
        <button className="btn-primary" type="submit" disabled={busy || !email || !pw}>
          {busy ? <LoaderCircle size={16} className="animate-spin" /> : <LogIn size={16} />} Sign in
        </button>
        <span className="w-full text-[11px] text-slate-500">Forgot your password? Ask the site administrator to reset it.</span>
      </form>
    </Card>
  );
}
