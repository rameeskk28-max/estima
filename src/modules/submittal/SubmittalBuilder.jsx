import { useMemo, useRef, useState } from 'react';
import {
  Building2, ListOrdered, ArrowUp, ArrowDown, Trash2, Plus, Upload, FileText, FileDown, LoaderCircle, TriangleAlert,
  CircleCheck, Table, RotateCcw, Eye, Image as ImageIcon, X, Calculator, Package, BookOpen, Library, ShieldCheck,
} from 'lucide-react';
import { useStore } from '../../store.jsx';
import { SECTION_CATEGORIES } from '../../lib/calcs/index.js';
import { DEFAULT_INDEX } from '../../lib/submittalDefaults.js';
import { compileSubmittal, countPdfPages, buildPlan, literatureFiles } from '../../lib/pdf/compile.js';
import { fmt, lpsToM3h, mToBar } from '../../lib/hydraulics.js';
import { Card, TextField, Field, downloadBytes, safeName } from '../../components/ui.jsx';
import { SheetPreviewModal } from '../../components/SheetPreview.jsx';
import { FileSlot } from '../../components/FileSlot.jsx';

export function SubmittalBuilder() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-slate-50">
          <Package className="text-brand-400" size={22} /> Submittal Package Builder
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Fill in the project header, arrange the index, attach PDFs to each section and compile a single standardised A4 submittal with cover page, mapped table of contents, section dividers and embedded calculation sheets.
        </p>
      </div>
      <ProjectHeader />
      <PumpSchedule />
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_400px]">
        <IndexManager />
        <CompilePanel />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function ProjectHeader() {
  const { project, setProject, logo, setLogo, notify, logoSrc } = useStore();
  const set = (k) => (v) => setProject((p) => ({ ...p, [k]: v }));
  const onLogo = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/image\/(png|jpe?g)/.test(f.type)) return notify('Logo must be PNG or JPG', 'bad');
    if (f.size > 600 * 1024) return notify('Logo must be under 600 KB', 'bad');
    const r = new FileReader();
    r.onload = () => setLogo({ dataUrl: r.result, type: f.type, name: f.name });
    r.readAsDataURL(f);
  };
  return (
    <Card title="Project Header" icon={Building2}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TextField label="Project name" value={project.projectName} onChange={set('projectName')} placeholder="e.g. G+12 Residential Tower, Plot 345" className="lg:col-span-2" />
        <TextField label="Client" value={project.client} onChange={set('client')} />
        <TextField label="Consultant" value={project.consultant} onChange={set('consultant')} />
        <TextField label="MEP contractor" value={project.contractor} onChange={set('contractor')} />
        <TextField label="Submittal reference no." value={project.refNo} onChange={set('refNo')} placeholder="e.g. MEP-SUB-PL-015" />
        <TextField label="Revision" value={project.revision} onChange={set('revision')} />
        <TextField label="Date" type="date" value={project.date} onChange={set('date')} />
        <TextField label="Supplier name" value={project.supplier} onChange={set('supplier')} />
        <TextField label="Prepared by" value={project.preparedBy} onChange={set('preparedBy')} />
        <TextField label="Checked by (calc sheets)" value={project.checkedBy} onChange={set('checkedBy')} />
        <TextField label="Approved by (calc sheets)" value={project.approvedBy} onChange={set('approvedBy')} />
        <Field label="Supplier logo (cover & sheets)">
          <div className="flex items-center gap-2">
            <label className="btn-secondary cursor-pointer !py-1.5">
              <ImageIcon size={15} /> {logo ? 'Replace' : 'Upload'}
              <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={onLogo} />
            </label>
            <img src={logoSrc} alt="Logo" className="h-8 max-w-[120px] rounded bg-white object-contain p-0.5" />
            {logo && (
              <button className="btn-ghost !p-1" onClick={() => setLogo(null)} aria-label="Restore default logo" title="Restore default Greenland logo">
                <X size={14} />
              </button>
            )}
          </div>
        </Field>
        <TextField label="Submittal subject (cover title)" value={project.subject} onChange={set('subject')} className="sm:col-span-2 lg:col-span-4" />
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
function PumpSchedule() {
  const { duties, setDuties, project } = useStore();
  const [view, setView] = useState(null);
  const update = (id, patch) => setDuties((l) => l.map((d) => (d.id === id ? { ...d, ...patch, sheet: patch.tag ? { ...d.sheet, tag: patch.tag } : d.sheet } : d)));
  const move = (idx, dir) =>
    setDuties((l) => {
      const c = [...l];
      const j = idx + dir;
      if (j < 0 || j >= c.length) return l;
      [c[idx], c[j]] = [c[j], c[idx]];
      return c;
    });
  return (
    <Card title={`Pump Schedule – Saved Calculator Duties (${duties.length})`} icon={Table} bodyClass="p-0">
      {!duties.length ? (
        <div className="flex items-center gap-3 p-5 text-sm text-slate-400">
          <Calculator size={18} className="text-brand-400" /> No duties saved yet. Open any calculator and press <b className="text-slate-200">Save to Pump Schedule</b> – the duty and its A4 calculation sheet are auto-inserted into the matching technical section.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-ink-800 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2">Tag</th>
                <th className="px-3 py-2">Service</th>
                <th className="px-3 py-2">Arrangement</th>
                <th className="px-3 py-2 text-right">Flow L/s</th>
                <th className="px-3 py-2 text-right">m³/h</th>
                <th className="px-3 py-2 text-right">Head m</th>
                <th className="px-3 py-2 text-right">bar</th>
                <th className="px-3 py-2 text-right">kW</th>
                <th className="px-3 py-2">Submittal section</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {duties.map((d, idx) => (
                <tr key={d.id} className="hover:bg-ink-800/50">
                  <td className="px-3 py-1.5">
                    <input className="field !w-24 !py-1 font-semibold" value={d.tag} onChange={(e) => update(d.id, { tag: e.target.value })} />
                  </td>
                  <td className="px-3 py-1.5 text-slate-300">
                    <div className="max-w-[260px] truncate" title={d.service}>
                      {d.service}
                    </div>
                    <div className="text-[11px] text-slate-500">{d.calcType}</div>
                  </td>
                  <td className="px-3 py-1.5 font-medium text-brand-300">{d.arrangement}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{d.flowLps != null ? fmt(d.flowLps, 2) : '–'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{d.flowLps != null ? fmt(lpsToM3h(d.flowLps), 2) : '–'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{d.headM != null ? fmt(d.headM, 1) : '–'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{d.headM != null ? fmt(mToBar(d.headM), 2) : '–'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{d.motorKW ?? '–'}</td>
                  <td className="px-3 py-1.5">
                    <select className="field !py-1 text-xs" value={d.category} onChange={(e) => update(d.id, { category: e.target.value })}>
                      {Object.entries(SECTION_CATEGORIES).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">
                    <button className="btn-ghost !p-1" onClick={() => move(idx, -1)} aria-label="Move up" disabled={idx === 0}>
                      <ArrowUp size={14} />
                    </button>
                    <button className="btn-ghost !p-1" onClick={() => move(idx, 1)} aria-label="Move down" disabled={idx === duties.length - 1}>
                      <ArrowDown size={14} />
                    </button>
                    <button className="btn-ghost !p-1" onClick={() => setView(d)} aria-label="View calculation sheet" title="View calculation sheet">
                      <Eye size={14} />
                    </button>
                    <button className="btn-ghost !p-1 hover:!text-red-400" onClick={() => confirm(`Remove ${d.tag} from the schedule?`) && setDuties((l) => l.filter((x) => x.id !== d.id))} aria-label="Delete duty">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {view && <SheetPreviewModal open onClose={() => setView(null)} sheet={view.sheet} project={project} />}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
const KIND_LABEL = { upload: 'Documents', schedule: 'Pump schedule', technical: 'Technical literature', warranty: 'Warranty certificate' };

function IndexManager() {
  const { entries, setEntries, files, duties, uid, removeFile, schedule, literature, warrantyDoc } = useStore();
  const update = (id, patch) => setEntries((l) => l.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const move = (idx, dir) =>
    setEntries((l) => {
      const c = [...l];
      const j = idx + dir;
      if (j < 0 || j >= c.length) return l;
      [c[idx], c[j]] = [c[j], c[idx]];
      return c;
    });
  const add = () => setEntries((l) => [...l, { id: uid(), title: 'NEW SECTION', kind: 'upload', include: true }]);
  const remove = async (e) => {
    if (!confirm(`Delete section "${e.title}" and its attached files?`)) return;
    for (const f of files[e.id] || []) await removeFile(e.id, f.id);
    setEntries((l) => l.filter((x) => x.id !== e.id));
  };
  const reset = () => {
    if (!confirm('Restore the standard 14-point UAE consultant index? Custom sections will be removed (uploaded files on standard sections are kept).')) return;
    setEntries(DEFAULT_INDEX());
  };
  let n = 0;
  return (
    <Card
      title="Table of Contents – Index Manager"
      icon={ListOrdered}
      actions={
        <>
          <button className="btn-ghost text-xs" onClick={reset}>
            <RotateCcw size={14} /> Standard index
          </button>
          <button className="btn-secondary !py-1.5 text-xs" onClick={add}>
            <Plus size={14} /> Add section
          </button>
        </>
      }
      bodyClass="p-3 space-y-2"
    >
      {entries.map((e, idx) => {
        if (e.include !== false) n++;
        const calcDuties = e.kind === 'technical' ? duties.filter((d) => d.category === e.category) : [];
        return (
          <div key={e.id} className={`rounded-lg border p-3 transition ${e.include === false ? 'border-line/50 bg-ink-950/30 opacity-60' : 'border-line bg-ink-900/60'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-7 w-9 shrink-0 items-center justify-center rounded bg-brand-600/20 text-sm font-bold text-brand-300 tabular-nums">{e.include === false ? '–' : String(n).padStart(2, '0')}</span>
              <input className="field min-w-[220px] flex-1 !py-1 font-semibold uppercase" value={e.title} onChange={(ev) => update(e.id, { title: ev.target.value })} aria-label="Section title" />
              <select className="field !w-auto !py-1 text-xs" value={e.kind} onChange={(ev) => update(e.id, { kind: ev.target.value, category: ev.target.value === 'technical' ? e.category || 'booster' : e.category })} aria-label="Section type">
                {Object.entries(KIND_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              {e.kind === 'technical' && (
                <select className="field !w-auto !py-1 text-xs" value={e.category} onChange={(ev) => update(e.id, { category: ev.target.value })} aria-label="Equipment category">
                  {Object.entries(SECTION_CATEGORIES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              )}
              <label className="flex items-center gap-1.5 text-xs text-slate-400">
                <input type="checkbox" className="accent-brand-500" checked={e.include !== false} onChange={(ev) => update(e.id, { include: ev.target.checked })} /> Include
              </label>
              <div className="ml-auto flex">
                <button className="btn-ghost !p-1" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label="Move section up">
                  <ArrowUp size={15} />
                </button>
                <button className="btn-ghost !p-1" onClick={() => move(idx, 1)} disabled={idx === entries.length - 1} aria-label="Move section down">
                  <ArrowDown size={15} />
                </button>
                <button className="btn-ghost !p-1 hover:!text-red-400" onClick={() => remove(e)} aria-label="Delete section">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {e.include !== false && (
              <div className="mt-2.5 space-y-1.5 pl-11">
                {e.kind === 'schedule' && (
                  <AutoItem icon={Table} text={schedule.rows.length ? `Pump Schedule tab – ${schedule.rows.length} pump(s), SOM format` : `Auto-generated from ${duties.length} saved dut${duties.length === 1 ? 'y' : 'ies'} (fill the Pump Schedule tab for the full SOM format)`} />
                )}
                {e.libSlot && (
                  <AutoItem icon={Library} text={(files[e.libSlot] || []).length ? `Document Library – ${(files[e.libSlot] || []).length} file(s)` : 'Document Library – nothing saved yet (Quote to Submittal → Document Library)'} />
                )}
                {e.kind === 'warranty' && <AutoItem icon={ShieldCheck} text={`Generated Certificate of Warranty – Draft (${warrantyDoc?.period || 'period not set'})`} />}
                {e.kind === 'technical' &&
                  literature
                    .filter((l) => (e.litId ? l.id === e.litId : l.category === e.category))
                    .map((l) => {
                      const nd = literatureFiles(l, files, 'datasheet').length;
                      const nw = literatureFiles(l, files, 'drawing').length;
                      return <AutoItem key={l.id} icon={BookOpen} text={`Technical Literature – ${l.title}${l.model ? ` (${l.model})` : ''} · ${nd} datasheet, ${nw} drawing PDF`} />;
                    })}
                {e.kind === 'technical' &&
                  !e.litId &&
                  (calcDuties.length ? (
                    calcDuties.map((d) => <AutoItem key={d.id} icon={Calculator} text={`Hydraulic Calculation – ${d.tag} · ${d.calcType}`} />)
                  ) : (
                    <p className="text-[11px] text-amber-300/80">No calculator duty assigned to “{SECTION_CATEGORIES[e.category]}” – save one from a calculator to auto-insert its calculation sheet.</p>
                  ))}
                <FileSlot slotId={e.id} label={e.kind === 'technical' ? 'Attach datasheets / performance curves (PDF)' : 'Attach PDF documents'} />
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}

const AutoItem = ({ icon: Icon, text }) => (
  <div className="flex items-center gap-2 rounded-md border border-brand-500/20 bg-brand-500/5 px-2.5 py-1.5 text-xs text-brand-200">
    <Icon size={14} /> {text}
    <span className="ml-auto rounded bg-brand-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase">auto</span>
  </div>
);

/* ------------------------------------------------------------------ */
function CompilePanel() {
  const { project, entries, duties, files, notify, getLogo, schedule, literature, warrantyDoc, library } = useStore();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState(null);

  const plan = useMemo(() => buildPlan(entries, duties, files, literature), [entries, duties, files, literature]);
  const stats = useMemo(() => {
    let uploadPages = 0;
    let docs = 0;
    plan.forEach((s) => s.items.forEach((it) => it.type === 'pdf' && ((uploadPages += it.file.pages || 0), docs++)));
    const calcs = plan.reduce((a, s) => a + s.items.filter((it) => it.type === 'calc').length, 0);
    const empty = plan.filter((s) => !s.items.length).length;
    return { uploadPages, docs, calcs, empty };
  }, [plan]);
  const missing = ['projectName', 'refNo', 'supplier'].filter((k) => !String(project[k] || '').trim());

  const compile = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await compileSubmittal(
        { project, entries, duties, files, logo: await getLogo(), schedule, literature, warranty: warrantyDoc, librarySettings: library.settings },
        setProgress,
      );
      const name = `${safeName(project.refNo || 'Submittal')}_Rev${safeName(project.revision || '0')}_${safeName(project.projectName || 'Project')}.pdf`;
      downloadBytes(res.bytes, name);
      setResult({ ...res, name, size: res.bytes.length });
      notify(`Submittal compiled – ${res.pageCount} A4 pages`);
    } catch (e) {
      console.error(e);
      notify(`Compilation failed: ${e.message}`, 'bad');
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  return (
    <div className="space-y-4 2xl:sticky 2xl:top-4 2xl:self-start">
      <Card title="Compile Final Submittal" icon={FileDown}>
        <div className="grid grid-cols-2 gap-2 text-center">
          <Stat label="Sections" value={plan.length} />
          <Stat label="Calc sheets" value={stats.calcs} />
          <Stat label="Attached PDFs" value={stats.docs} />
          <Stat label="Attached pages" value={stats.uploadPages} />
        </div>
        <ul className="mt-3 space-y-1 text-xs text-slate-400">
          <li>• A4 cover page with consultant stamp & action codes</li>
          <li>• Table of contents with page mapping (incl. sub-items)</li>
          <li>• Section divider page for every index item</li>
          <li>• Pump schedule + calculation sheets auto-inserted</li>
          <li>• All uploads normalised to A4 with page footers</li>
        </ul>
        {missing.length > 0 && (
          <p className="mt-3 flex gap-2 rounded-md bg-amber-500/10 p-2 text-xs text-amber-200">
            <TriangleAlert size={14} className="shrink-0" /> Header incomplete: {missing.map((m) => ({ projectName: 'Project name', refNo: 'Reference no.', supplier: 'Supplier' })[m]).join(', ')}
          </p>
        )}
        {stats.empty > 0 && <p className="mt-2 text-xs text-slate-500">{stats.empty} section(s) have no content yet – they will show “No document attached”.</p>}
        <button className="btn-primary mt-4 w-full !py-3 text-base" onClick={compile} disabled={busy || !plan.length}>
          {busy ? <LoaderCircle size={18} className="animate-spin" /> : <FileDown size={18} />}
          {busy ? 'Compiling…' : 'Compile & Download Final A4 Submittal PDF'}
        </button>
        {busy && <p className="mt-2 truncate text-center text-xs text-brand-300">{progress}</p>}
      </Card>

      {result && (
        <Card title="Compilation Report" icon={CircleCheck}>
          <p className="text-sm text-emerald-300">
            {result.name}
            <span className="block text-xs text-slate-400">
              {result.pageCount} pages · {(result.size / 1024 / 1024).toFixed(2)} MB
            </span>
          </p>
          <button className="btn-secondary mt-2 w-full text-xs" onClick={() => downloadBytes(result.bytes, result.name)}>
            <FileDown size={14} /> Download again
          </button>
          <div className="mt-3 max-h-72 overflow-auto rounded-md bg-ink-950/60 p-2 text-xs">
            {result.toc.map((s) => (
              <div key={s.number} className="py-0.5">
                <div className="flex justify-between gap-2 font-semibold text-slate-200">
                  <span className="truncate">
                    {String(s.number).padStart(2, '0')}. {s.title}
                  </span>
                  <span className="tabular-nums text-brand-300">p.{s.page}</span>
                </div>
                {s.items.map((it, k) => (
                  <div key={k} className="flex justify-between gap-2 pl-5 text-slate-400">
                    <span className="truncate">{it.label}</span>
                    <span className="tabular-nums">{it.page}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {result.warnings.length > 0 && (
            <ul className="mt-3 space-y-1">
              {result.warnings.map((w, k) => (
                <li key={k} className="flex gap-1.5 text-[11px] text-amber-200">
                  <TriangleAlert size={12} className="mt-0.5 shrink-0" /> {w}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

const Stat = ({ label, value }) => (
  <div className="rounded-lg border border-line bg-ink-900/60 p-2">
    <div className="text-xl font-semibold tabular-nums text-slate-50">{value}</div>
    <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
  </div>
);
