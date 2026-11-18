import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, FilePlus2, Copy, Trash2, Download, Eye, ImagePlus, X, RefreshCw, LoaderCircle, Plus, Wand2, FileText } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { Card, Field, TextField, SelectField, downloadBytes, safeName } from '../../components/ui.jsx';
import { FileSlot } from '../../components/FileSlot.jsx';
import { LIT_TEMPLATES, fillText, lines, parseDuty, dutyText, configText, literatureSheet } from '../../lib/literature.js';
import { SheetHtml } from '../../components/SheetPreview.jsx';
import { buildLiteraturePdf } from '../../lib/pdf/literaturePdf.js';
import { SECTION_CATEGORIES } from '../../lib/calcs/index.js';

export function LiteratureTab() {
  const { literature, addLiterature } = useStore();
  const [sel, setSel] = useState(() => literature[0]?.id || null);
  const current = literature.find((l) => l.id === sel) || literature[0] || null;
  useEffect(() => {
    if (!current && literature[0]) setSel(literature[0].id);
  }, [current, literature]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-slate-50">
          <BookOpen className="text-brand-400" size={22} /> Technical Literature Builder
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Create the technical literature for each pump system using the Greenland wording, attach the pump datasheet and drawing, and download it – or let the Submittal Builder insert it into the matching “Technical Literature” section automatically.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <Card title="New literature" icon={FilePlus2} bodyClass="p-2 space-y-1">
            {Object.entries(LIT_TEMPLATES).map(([k, t]) => (
              <button key={k} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-slate-300 transition hover:bg-brand-500/10 hover:text-brand-300" onClick={() => setSel(addLiterature(k))}>
                <Plus size={14} className="shrink-0 text-brand-400" /> {t.label}
              </button>
            ))}
          </Card>
          <Card title={`Documents (${literature.length})`} icon={FileText} bodyClass="p-2 space-y-1">
            {!literature.length && <p className="p-2 text-xs text-slate-500">No literature yet – pick a system above.</p>}
            {literature.map((l) => (
              <button
                key={l.id}
                onClick={() => setSel(l.id)}
                className={`w-full rounded-md border px-2.5 py-2 text-left transition ${current?.id === l.id ? 'border-brand-500 bg-brand-500/10' : 'border-transparent hover:bg-ink-800'}`}
              >
                <div className="truncate text-sm font-semibold text-slate-100">{l.title || 'Untitled'}</div>
                <div className="truncate text-[11px] text-slate-400">
                  {LIT_TEMPLATES[l.template]?.label} · {dutyText(l.propFlow, l.propHead)}
                </div>
              </button>
            ))}
          </Card>
        </aside>
        {current ? <Editor key={current.id} lit={current} onSelect={setSel} /> : <EmptyState />}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card flex min-h-[320px] flex-col items-center justify-center gap-3 p-8 text-center">
      <BookOpen size={40} className="text-brand-400" />
      <div className="text-lg font-semibold text-slate-100">Start a technical literature</div>
      <p className="max-w-md text-sm text-slate-400">Choose Transfer, Booster (with or without VFD), Circulation or Sump on the left. The wording is pre-filled from the Greenland templates and updates automatically with the pump model, brand and configuration.</p>
    </div>
  );
}

function Editor({ lit, onSelect }) {
  const { updateLiterature, removeLiterature, addLiterature, duties, schedule, project, getLogo, files, notify } = useStore();
  const set = (patch) => updateLiterature(lit.id, patch);
  const t = LIT_TEMPLATES[lit.template];
  const [busy, setBusy] = useState(false);

  const attachments = () => [...(files[`lit-${lit.id}-datasheet`] || []), ...(files[`lit-${lit.id}-drawing`] || [])];
  const make = async (withFiles) => buildLiteraturePdf(lit, project, { logo: await getLogo(), attachments: withFiles ? attachments() : [] });

  const download = async () => {
    setBusy(true);
    try {
      const { bytes, warnings } = await make(true);
      downloadBytes(bytes, `${safeName(lit.title)}_Technical_Literature.pdf`);
      if (warnings.length) notify(warnings[0], 'bad');
    } finally {
      setBusy(false);
    }
  };

  const fillFromDuty = (id) => {
    const d = duties.find((x) => x.id === id);
    if (!d) return;
    const spec = parseDuty(d.specifiedDuty);
    set({
      config: d.arrangement || lit.config,
      reqFlow: spec?.flow ?? lit.reqFlow,
      reqHead: spec?.head ?? lit.reqHead,
      propFlow: d.flowLps != null ? d.flowLps.toFixed(2) : lit.propFlow,
      propHead: d.headM != null ? d.headM.toFixed(1) : lit.propHead,
      model: d.model || lit.model,
      brand: d.brand ? d.brand.toUpperCase() : lit.brand,
      tag: d.tag || lit.tag,
    });
    notify(`Filled from calculator ${d.tag}`);
  };
  const fillFromSchedule = (id) => {
    const r = schedule.rows.find((x) => x.id === id);
    if (!r) return;
    set({
      title: r.system || lit.title,
      config: r.config || lit.config,
      reqFlow: r.specFlow || lit.reqFlow,
      reqHead: r.specHead || lit.reqHead,
      propFlow: r.propFlow || lit.propFlow,
      propHead: r.propHead || lit.propHead,
      brand: r.brand ? r.brand.toUpperCase() : lit.brand,
      model: r.model || lit.model,
      pumpType: r.type || lit.pumpType,
      certification: r.certs && r.certs !== 'NA' ? r.certs : lit.certification,
      motor: r.power ? `TEFC, IEC, ${r.power} KW, ${r.phase || 3} PHASE, 400V, 50HZ` : lit.motor,
      header: r.header && r.header !== 'NA' ? r.header.replace(/\s*SS\s*304|\s*copper/gi, '').trim() : lit.header,
      vessel: r.vessel && r.vessel !== 'NA' ? String(r.vessel).replace(/\s*L(iter|itre)?s?$/i, '') : lit.vessel,
    });
    notify(`Filled from pump schedule – ${r.system || 'row'}`);
  };

  const resetWording = () => {
    if (!confirm('Replace control features, mechanical features, logic of operation, scope and MOC with the template wording?')) return;
    set({ control: t.control.join('\n'), mechanical: t.mechanical.join('\n'), logic: t.logic.join('\n'), logicStyle: t.logicStyle, scope: t.scope, moc: t.moc.map(([k, v]) => ({ k, v })) });
  };

  return (
    <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_440px]">
      <div className="min-w-0 space-y-4">
        <div className="card flex flex-wrap items-center gap-2 p-3">
          <span className="rounded-md bg-brand-500/15 px-2 py-1 text-xs font-semibold text-brand-300">{t.label}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button className="btn-ghost !py-1.5 text-xs" onClick={resetWording} title="Reload template wording">
              <RefreshCw size={14} /> Template wording
            </button>
            <button className="btn-ghost !py-1.5 text-xs" onClick={() => onSelect(addLiterature(lit.template, { ...lit, id: undefined, title: `${lit.title} (copy)` }))}>
              <Copy size={14} /> Duplicate
            </button>
            <button className="btn-ghost !py-1.5 text-xs hover:!text-red-400" onClick={async () => confirm(`Delete “${lit.title}” and its attached files?`) && (await removeLiterature(lit.id))}>
              <Trash2 size={14} /> Delete
            </button>
            <button className="btn-primary !py-1.5 text-sm" onClick={download} disabled={busy}>
              {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Download size={15} />} Download PDF
            </button>
          </div>
        </div>

        <Card title="Quick fill" icon={Wand2}>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="From a saved calculator duty">
              <select className="field" value="" onChange={(e) => fillFromDuty(e.target.value)} disabled={!duties.some((d) => d.kind === 'pump')}>
                <option value="">{duties.some((d) => d.kind === 'pump') ? 'Select duty…' : 'No saved calculator duties'}</option>
                {duties
                  .filter((d) => d.kind === 'pump')
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.tag} – {d.service}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="From the pump schedule">
              <select className="field" value="" onChange={(e) => fillFromSchedule(e.target.value)} disabled={!schedule.rows.length}>
                <option value="">{schedule.rows.length ? 'Select pump…' : 'Pump schedule is empty'}</option>
                {schedule.rows.map((r, i) => (
                  <option key={r.id} value={r.id}>
                    {i + 1}. {r.system} {r.model ? `– ${r.model}` : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        <Card title="System & Pump" icon={BookOpen}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <TextField label="System (title)" value={lit.title} onChange={(v) => set({ title: v })} className="sm:col-span-2" />
            <TextField label="Equipment tag" value={lit.tag} onChange={(v) => set({ tag: v })} placeholder="e.g. TPS-01" />
            <SelectField label="Submittal section" value={lit.category} onChange={(v) => set({ category: v })} options={Object.entries(SECTION_CATEGORIES).map(([value, label]) => ({ value, label }))} />
            <TextField label="Configuration" value={lit.config} onChange={(v) => set({ config: v })} hint={configText(lit.config)} />
            <TextField label="Brand" value={lit.brand} onChange={(v) => set({ brand: v })} />
            <TextField label="Pump model" value={lit.model} onChange={(v) => set({ model: v })} placeholder="e.g. 5FMHN5B-53 E0" />
            <TextField label="Pump type" value={lit.pumpType} onChange={(v) => set({ pumpType: v })} />
            <TextField label="Motor" value={lit.motor} onChange={(v) => set({ motor: v })} className="sm:col-span-2" />
            <TextField label="Certification" value={lit.certification} onChange={(v) => set({ certification: v })} placeholder="e.g. WRAS, ACS" />
            {(t.header || lit.header) && <TextField label="Header / manifold size" value={lit.header} onChange={(v) => set({ header: v })} />}
            {(t.vessel || lit.vessel) && <TextField label="Pressure vessel (L)" value={lit.vessel} onChange={(v) => set({ vessel: v })} />}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <TextField label="Requested flow (LPS)" value={lit.reqFlow} onChange={(v) => set({ reqFlow: v })} />
            <TextField label="Requested head (M)" value={lit.reqHead} onChange={(v) => set({ reqHead: v })} />
            <TextField label="Proposed flow (LPS)" value={lit.propFlow} onChange={(v) => set({ propFlow: v })} />
            <TextField label="Proposed head (M)" value={lit.propHead} onChange={(v) => set({ propHead: v })} />
          </div>
        </Card>

        <Card title="Material of Construction" icon={BookOpen} actions={<button className="btn-secondary !py-1 text-xs" onClick={() => set({ moc: [...lit.moc, { k: '', v: '' }] })}><Plus size={13} /> Add</button>}>
          <div className="space-y-2">
            {lit.moc.map((m, k) => (
              <div key={k} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-2">
                <input className="field uppercase" value={m.k} placeholder="PART" onChange={(e) => set({ moc: lit.moc.map((x, j) => (j === k ? { ...x, k: e.target.value } : x)) })} aria-label="Part" />
                <input className="field" value={m.v} placeholder="Material" onChange={(e) => set({ moc: lit.moc.map((x, j) => (j === k ? { ...x, v: e.target.value } : x)) })} aria-label="Material" />
                <button className="btn-ghost !p-1.5 hover:!text-red-400" onClick={() => set({ moc: lit.moc.filter((_, j) => j !== k) })} aria-label="Remove">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Wording" icon={FileText}>
          <p className="mb-3 text-[11px] text-slate-500">
            One item per line. Placeholders are filled automatically: <Code>{'{brand}'}</Code> <Code>{'{model}'}</Code> <Code>{'{type}'}</Code> <Code>{'{n}'}</Code> (no. of pumps) <Code>{'{configText}'}</Code> <Code>{'{header}'}</Code> <Code>{'{vessel}'}</Code>
          </p>
          <div className="grid gap-3 xl:grid-cols-2">
            <ListArea label="Control features" value={lit.control} onChange={(v) => set({ control: v })} lit={lit} rows={7} />
            <ListArea label="Mechanical features" value={lit.mechanical} onChange={(v) => set({ mechanical: v })} lit={lit} rows={7} />
          </div>
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="lbl !mb-0">Logic of operation</span>
              <select className="field !w-auto !py-0.5 text-xs" value={lit.logicStyle} onChange={(e) => set({ logicStyle: e.target.value })} aria-label="Logic layout">
                <option value="bullets">Bullet points</option>
                <option value="paragraphs">Paragraphs</option>
              </select>
            </div>
            <ListArea value={lit.logic} onChange={(v) => set({ logic: v })} lit={lit} rows={8} />
          </div>
          <div className="mt-3">
            <ListArea label="Scope of supply" value={lit.scope} onChange={(v) => set({ scope: v })} lit={lit} rows={2} />
          </div>
        </Card>

        <Card title="Product Photo, Datasheet & Drawing" icon={ImagePlus}>
          <div className="grid gap-4 md:grid-cols-2">
            <ProductImage lit={lit} set={set} />
            <p className="self-center text-xs text-slate-400">The literature uses the same header, title bar, tables and signature block as the hydraulic calculation sheets. A product photo (optional) is shown in its own “Product Image” section.</p>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <div className="lbl">Pump datasheet &amp; performance curves</div>
              <FileSlot slotId={`lit-${lit.id}-datasheet`} label="Upload datasheet PDF" />
            </div>
            <div>
              <div className="lbl">Drawing / skid layout</div>
              <FileSlot slotId={`lit-${lit.id}-drawing`} label="Upload drawing PDF" />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">In the submittal the order is: technical literature → datasheet &amp; curves → hydraulic calculation → drawing. All pages are normalised to A4.</p>
        </Card>
      </div>

      <LivePreview lit={lit} project={project} />
    </div>
  );
}

const Code = ({ children }) => <code className="rounded bg-ink-800 px-1 py-0.5 text-[10px] text-brand-300">{children}</code>;

function ListArea({ label, value, onChange, lit, rows = 5 }) {
  const preview = useMemo(() => lines(value).map((l) => fillText(l, lit)), [value, lit]);
  const hasTokens = /\{\w+\}/.test(value || '');
  return (
    <div>
      {label && <span className="lbl">{label}</span>}
      <textarea className="field font-mono text-xs leading-relaxed" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      {hasTokens && <div className="mt-1 line-clamp-2 text-[11px] italic text-slate-500">→ {preview.find((p, i) => /\{\w+\}/.test(lines(value)[i])) || preview[0]}</div>}
    </div>
  );
}

function ProductImage({ lit, set }) {
  const ref = useRef(null);
  const onFile = (f) => {
    if (!f || !/image\/(png|jpe?g)/.test(f.type)) return;
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      const max = 1100;
      const sc = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * sc);
      c.height = Math.round(img.height * sc);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      set({ image: c.toDataURL('image/jpeg', 0.82) });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };
  return (
    <div>
      <div className="lbl">Product photo (optional)</div>
      <div className="flex items-center gap-3">
        <div className="flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-line bg-ink-950">
          {lit.image ? <img src={lit.image} alt="Product" className="h-full w-full object-contain" /> : <ImagePlus className="text-slate-500" size={26} />}
        </div>
        <div className="flex flex-col gap-1.5">
          <button className="btn-secondary !py-1.5 text-xs" onClick={() => ref.current?.click()}>
            <ImagePlus size={14} /> {lit.image ? 'Replace photo' : 'Upload photo'}
          </button>
          {lit.image && (
            <button className="btn-ghost !py-1 text-xs hover:!text-red-400" onClick={() => set({ image: null })}>
              <X size={13} /> Remove
            </button>
          )}
          <span className="text-[10px] text-slate-500">PNG / JPG, resized automatically</span>
        </div>
        <input ref={ref} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => (onFile(e.target.files?.[0]), (e.target.value = ''))} />
      </div>
    </div>
  );
}

function LivePreview({ lit, project }) {
  const sheet = useMemo(() => literatureSheet(lit, { imageSrc: lit.image }), [lit]);
  const boxRef = useRef(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(Math.min(1, (e.contentRect.width - 16) / 794)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <aside className="2xl:sticky 2xl:top-24 2xl:self-start">
      <Card title="Live preview" icon={Eye} bodyClass="p-0">
        <div ref={boxRef} className="max-h-[760px] overflow-auto rounded-b-2xl bg-slate-500/20 p-2">
          <div style={{ width: 794 * scale, height: 'auto' }}>
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 794 }}>
              <SheetHtml sheet={sheet} project={project} />
            </div>
          </div>
        </div>
      </Card>
    </aside>
  );
}
