import { useMemo, useRef, useState } from 'react';
import { ClipboardCheck, Upload, LoaderCircle, Download, Eye, Plus, Trash2, ArrowUp, ArrowDown, Wand2, EyeOff, CheckCheck, Filter, StickyNote } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { Card, Field, TextField, downloadBytes, safeName } from '../../components/ui.jsx';
import { STATUS, statusFromNote } from '../../lib/compliance/spec.js';
import { buildCompliancePdf, autoKeyItems } from '../../lib/compliance/compliancePdf.js';
import { dataUrlToImage } from '../../lib/pdf/literaturePdf.js';

const TONE = { green: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400', amber: 'border-amber-500/40 bg-amber-500/10 text-amber-400', red: 'border-red-500/40 bg-red-500/10 text-red-400', grey: 'border-line bg-ink-800 text-slate-400' };
const QUICK = ['Complied.', 'Noted.', 'Complied – refer to Franklin Electric datasheet.', 'Complied – refer to technical literature.', 'N/A – installation by MEP contractor.', 'Comply by contractor.'];
const rid = () => Math.random().toString(36).slice(2, 10);

export function ComplianceTab() {
  const { compliance: cs, setCompliance, project, quoteDraft, getLogo, stamp, notify } = useStore();
  const set = (patch) => setCompliance((c) => ({ ...c, ...(typeof patch === 'function' ? patch(c) : patch) }));
  const setRows = (fn) => set((c) => ({ rows: fn(c.rows) }));
  const upd = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const [busy, setBusy] = useState('');
  const [filter, setFilter] = useState('all');
  const inputRef = useRef(null);

  const read = async (file) => {
    if (!file) return;
    if (cs.rows.length && !confirm('Replace the current compliance rows with this specification?')) return;
    try {
      const { readSpecFile } = await import('../../lib/compliance/readSpec.js');
      const res = await readSpecFile(file, setBusy);
      if (!res.rows.length) throw new Error('No numbered clauses found in this specification.');
      const sales = quoteDraft?.header;
      set({
        rows: res.rows.map((r) => ({ ...r, remarks: '', status: '' })),
        specNo: res.sectionNo || cs.specNo,
        specName: res.sectionName || cs.specName,
        sourceName: file.name,
        keyItems: null,
        signName: cs.signName || (sales?.salesperson ? `${titleCase(sales.salesperson)} | GREENLAND` : ''),
        signLines: cs.signLines || [sales?.salesContact && `Mob: ${sales.salesContact}`, sales?.salesEmail && sales.salesEmail.toLowerCase()].filter(Boolean).join(' | '),
      });
      notify(`${res.rows.filter((r) => r.type === 'clause').length} clauses read from ${res.pages} page(s)${res.ocrPages ? ` – ${res.ocrPages} scanned page(s) recognised by OCR` : ''}`);
    } catch (e) {
      console.error(e);
      notify(e.message || 'Could not read the specification', 'bad');
    } finally {
      setBusy('');
    }
  };

  const pdf = async (open) => {
    setBusy('Building PDF…');
    try {
      const bytes = await buildCompliancePdf(cs, project, { logo: await getLogo(), stamp: cs.showStamp !== false ? dataUrlToImage(stamp) : null });
      if (open) {
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else downloadBytes(bytes, `Technical_Compliance_Statement_${safeName(cs.specNo || 'spec')}.pdf`);
    } finally {
      setBusy('');
    }
  };

  const clauses = cs.rows.filter((r) => r.type === 'clause' && !r.hidden);
  const counts = Object.fromEntries(Object.keys(STATUS).map((k) => [k, clauses.filter((r) => r.status === k).length]));
  const pending = clauses.filter((r) => !r.status).length;
  const visible = cs.rows.filter((r) => filter === 'all' || (filter === 'pending' ? r.type === 'clause' && !r.status : filter === 'issues' ? ['deviation', 'partial'].includes(r.status) : true));
  const keyAuto = useMemo(() => autoKeyItems(cs.rows).join('\n'), [cs.rows]);
  const move = (id, d) =>
    setRows((rs) => {
      const k = rs.findIndex((r) => r.id === id);
      const j = k + d;
      if (j < 0 || j >= rs.length) return rs;
      const c = [...rs];
      [c[k], c[j]] = [c[j], c[k]];
      return c;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-slate-50">
            <ClipboardCheck className="text-brand-400" size={22} /> Technical Compliance Statement
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Upload the project specification (text or scanned PDF). Each numbered clause becomes a row with the specification requirement filled in – add the compliance remarks and status, and it is printed in the Greenland compliance-statement format and inserted into the submittal automatically.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => pdf(true)} disabled={!cs.rows.length || !!busy}>
            <Eye size={16} /> Preview
          </button>
          <button className="btn-primary" onClick={() => pdf(false)} disabled={!cs.rows.length || !!busy}>
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />} Download PDF
          </button>
        </div>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          read(e.dataTransfer.files?.[0]);
        }}
        onClick={() => !busy && inputRef.current?.click()}
        className="card flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed p-6 text-center transition hover:border-brand-500/60"
      >
        {busy ? <LoaderCircle className="animate-spin text-brand-400" size={28} /> : <Upload className="text-brand-400" size={28} />}
        <div className="font-display text-lg font-bold text-slate-50">{busy || (cs.sourceName ? `Replace specification (${cs.sourceName})` : 'Drop the specification PDF here or click to upload')}</div>
        <div className="text-xs text-slate-400">Text PDFs are read instantly; scanned pages are recognised by OCR in your browser (slower).</div>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => (read(e.target.files?.[0]), (e.target.value = ''))} />
      </div>

      <Card title="Statement header" icon={ClipboardCheck}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TextField label="Specification section no." value={cs.specNo} onChange={(v) => set({ specNo: v })} placeholder="e.g. 15440" />
          <TextField label="Section name" value={cs.specName} onChange={(v) => set({ specName: v })} placeholder="e.g. PLUMBING PUMPS" />
          <TextField label="Brand offered" value={cs.brandOffered} onChange={(v) => set({ brandOffered: v })} />
          <TextField label="Supplier" value={cs.supplier} onChange={(v) => set({ supplier: v })} />
          <TextField label="Sub-title (blank = automatic)" value={cs.subtitle} onChange={(v) => set({ subtitle: v })} className="sm:col-span-2 lg:col-span-4" placeholder={`Specification Section ${cs.specNo || '…'} (${cs.specName || '…'}) vs. Offered ${cs.brandOffered} Pump Sets`} />
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Project, main contractor and consultant come from the project header ({project.projectName || 'not set'}).</p>
      </Card>

      {cs.rows.length > 0 && (
        <>
          <div className="card flex flex-wrap items-center gap-2 rounded-2xl p-3">
            {Object.entries(STATUS).map(([k, s]) => (
              <span key={k} className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${TONE[s.color]}`}>
                {s.label}: {counts[k]}
              </span>
            ))}
            <span className="rounded-lg border border-line px-2 py-1 text-[11px] font-semibold text-slate-300">Pending: {pending}</span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Filter size={14} className="text-slate-500" />
              <select className="field !w-auto !py-1 text-xs" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter rows">
                <option value="all">All rows</option>
                <option value="pending">Pending only</option>
                <option value="issues">Deviations / partial</option>
              </select>
              <button className="btn-ghost !py-1 text-xs" title="Suggest a status from notes found in the specification margin" onClick={() => (setRows((rs) => rs.map((r) => (r.type === 'clause' && !r.status && statusFromNote(r.note) ? { ...r, status: statusFromNote(r.note) } : r))), notify('Statuses suggested from margin notes'))}>
                <Wand2 size={14} /> From margin notes
              </button>
              <button className="btn-ghost !py-1 text-xs" onClick={() => confirm('Set all pending clauses to “Complied”?') && setRows((rs) => rs.map((r) => (r.type === 'clause' && !r.status ? { ...r, status: 'complied' } : r)))}>
                <CheckCheck size={14} /> Pending → Complied
              </button>
            </div>
          </div>

          <Card title={`Clauses (${clauses.length})`} icon={ClipboardCheck} bodyClass="p-3 space-y-2">
            {visible.map((r) => {
              const tone = STATUS[r.status]?.color;
              if (r.type !== 'clause')
                return (
                  <div key={r.id} className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 ${r.hidden ? 'opacity-40' : ''} ${r.type === 'part' ? 'bg-brand-600/80' : 'bg-brand-600/40'}`}>
                    <select className="field !w-auto !border-white/30 !bg-black/20 !py-0.5 text-xs text-white" value={r.type} onChange={(e) => upd(r.id, { type: e.target.value })} aria-label="Row type">
                      <option value="part">PART bar</option>
                      <option value="heading">Sub-part bar</option>
                      <option value="clause">Clause</option>
                    </select>
                    {r.type === 'heading' && <input className="field !w-20 !border-white/30 !bg-black/20 !py-0.5 text-xs font-bold text-white" value={r.clause} onChange={(e) => upd(r.id, { clause: e.target.value })} aria-label="Clause" />}
                    <input className="field min-w-[200px] flex-1 !border-white/30 !bg-black/20 !py-0.5 text-sm font-bold uppercase text-white" value={r.text} onChange={(e) => upd(r.id, { text: e.target.value })} aria-label="Bar text" />
                    <RowTools r={r} upd={upd} move={move} setRows={setRows} light />
                  </div>
                );
              return (
                <div key={r.id} className={`rounded-xl border border-line bg-ink-950/40 p-3 ${r.hidden ? 'opacity-40' : ''}`}>
                  <div className="grid gap-3 lg:grid-cols-[90px_minmax(0,1fr)_minmax(0,1fr)_170px]">
                    <div className="space-y-1">
                      <input className="field !py-1 text-sm font-bold" value={r.clause} onChange={(e) => upd(r.id, { clause: e.target.value })} aria-label="Clause no." />
                      <select className="field !py-0.5 text-[11px]" value={r.type} onChange={(e) => upd(r.id, { type: e.target.value })} aria-label="Row type">
                        <option value="clause">Clause</option>
                        <option value="heading">Sub-part bar</option>
                        <option value="part">PART bar</option>
                      </select>
                    </div>
                    <Field label="Specification requirement">
                      <textarea className="field text-xs leading-relaxed" rows={Math.min(8, Math.max(3, Math.ceil(r.text.length / 70)))} value={r.text} onChange={(e) => upd(r.id, { text: e.target.value })} />
                      {r.note && (
                        <span className="mt-1 flex items-center gap-1 text-[11px] text-amber-400/90">
                          <StickyNote size={11} /> Margin note: {r.note}
                        </span>
                      )}
                    </Field>
                    <Field label="Compliance / remarks">
                      <textarea className="field text-xs leading-relaxed" rows={3} value={r.remarks} onChange={(e) => upd(r.id, { remarks: e.target.value })} />
                      <div className="mt-1 flex flex-wrap gap-1">
                        {QUICK.map((q) => (
                          <button key={q} className="glass-pill rounded-full px-2 py-0.5 text-[10px] text-slate-400 hover:text-brand-400" onClick={() => upd(r.id, { remarks: r.remarks ? `${r.remarks} ${q}` : q, status: r.status || (/^N\/A/.test(q) ? 'na' : /^Noted|^Comply by/.test(q) ? 'noted' : 'complied') })}>
                            + {q}
                          </button>
                        ))}
                      </div>
                    </Field>
                    <div className="space-y-2">
                      <Field label="Status">
                        <select className={`field !py-1 text-sm font-semibold ${tone ? TONE[tone] : ''}`} value={r.status} onChange={(e) => upd(r.id, { status: e.target.value })}>
                          <option value="">— pending —</option>
                          {Object.entries(STATUS).map(([k, s]) => (
                            <option key={k} value={k}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <RowTools r={r} upd={upd} move={move} setRows={setRows} />
                    </div>
                  </div>
                </div>
              );
            })}
            <button className="btn-secondary w-full" onClick={() => setRows((rs) => [...rs, { id: rid(), type: 'clause', clause: '', text: '', remarks: '', status: '' }])}>
              <Plus size={15} /> Add clause
            </button>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Key items for Consultant's attention" icon={StickyNote}>
              <label className="mb-2 flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" className="accent-brand-500" checked={cs.keyItems === null} onChange={(e) => set({ keyItems: e.target.checked ? null : keyAuto })} /> Automatic (from Deviation / Partially Complied rows)
              </label>
              <textarea className="field text-sm" rows={5} value={cs.keyItems === null ? keyAuto : cs.keyItems} disabled={cs.keyItems === null} onChange={(e) => set({ keyItems: e.target.value })} placeholder="One item per line" />
            </Card>
            <Card title="Signatory" icon={ClipboardCheck}>
              <div className="space-y-3">
                <TextField label="For line" value={cs.signFor} onChange={(v) => set({ signFor: v })} />
                <TextField label="Name line" value={cs.signName} onChange={(v) => set({ signName: v })} placeholder="e.g. Ramees Kuzhiyil | GREENLAND" />
                <Field label="Further lines (title, mobile, email)">
                  <textarea className="field text-sm" rows={2} value={cs.signLines} onChange={(e) => set({ signLines: e.target.value })} placeholder={'Technical Sales Engineer | Franklin Electric\nMob: +971 … | name@greenland.ae'} />
                </Field>
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" className="accent-brand-500" checked={cs.showStamp !== false} onChange={(e) => set({ showStamp: e.target.checked })} /> Print company stamp {stamp ? '' : '(upload it in Comment Replies → Company Stamp)'}
                </label>
              </div>
            </Card>
          </div>
          <p className="text-[11px] text-slate-500">The statement is inserted automatically in the submittal section “TECHNICAL COMPLIANCE STATEMENT” (created by Quote → Submittal). Uploaded PDFs in that section are added after it.</p>
        </>
      )}
    </div>
  );
}

function RowTools({ r, upd, move, setRows, light }) {
  const cls = `btn-ghost !p-1 ${light ? '!text-white/80 hover:!text-white' : ''}`;
  return (
    <div className="flex items-center gap-0.5">
      <button className={cls} onClick={() => move(r.id, -1)} aria-label="Move up">
        <ArrowUp size={13} />
      </button>
      <button className={cls} onClick={() => move(r.id, 1)} aria-label="Move down">
        <ArrowDown size={13} />
      </button>
      <button className={cls} onClick={() => setRows((rs) => { const k = rs.findIndex((x) => x.id === r.id); return [...rs.slice(0, k + 1), { id: rid(), type: 'clause', clause: '', text: '', remarks: '', status: '' }, ...rs.slice(k + 1)]; })} aria-label="Insert row below" title="Insert row below">
        <Plus size={13} />
      </button>
      <button className={cls} onClick={() => upd(r.id, { hidden: !r.hidden })} aria-label={r.hidden ? 'Include row' : 'Exclude row'} title={r.hidden ? 'Include in PDF' : 'Exclude from PDF'}>
        <EyeOff size={13} />
      </button>
      <button className={`${cls} hover:!text-red-400`} onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))} aria-label="Delete row">
        <Trash2 size={13} />
      </button>
    </div>
  );
}

const titleCase = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
