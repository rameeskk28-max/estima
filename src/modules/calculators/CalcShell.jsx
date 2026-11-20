import { useMemo, useState } from 'react';
import { FileText, Save, RotateCcw, Download, LoaderCircle, Gauge, ClipboardList, Flag } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { CALCULATORS, SECTION_CATEGORIES } from '../../lib/calcs/index.js';
import { fmtN, M_PER_BAR } from '../../lib/ipc.js';
import { buildCalcSheetPdf } from '../../lib/pdf/calcSheet.js';
import { Card, Kpi, CheckList, NumField, TextField, SelectField, downloadBytes, safeName } from '../../components/ui.jsx';
import { SheetPreviewModal } from '../../components/SheetPreview.jsx';
import { PumpScene } from '../../components/PumpScene.jsx';

export function CalcShell({ calcKey, icon, description, children, pump = true }) {
  const { inputs, setCalcInputs, saveDuty, project, notify, duties, getLogo } = useStore();
  const calc = CALCULATORS[calcKey];
  const i = inputs[calcKey];
  const set = (patch) => setCalcInputs(calcKey, (s) => ({ ...s, ...patch }));
  const result = useMemo(() => {
    try {
      return calc.compute(i);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [calc, i]);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const exists = duties.some((d) => d.tag.trim().toUpperCase() === String(i.tag).trim().toUpperCase());

  const onSave = () => {
    if (!result) return;
    if (!String(i.tag).trim()) return notify('Enter an equipment tag first', 'bad');
    const replaced = saveDuty(calcKey, result);
    notify(`${i.tag} ${replaced ? 'updated in' : 'added to'} submittal → ${SECTION_CATEGORIES[i.category]}`);
  };
  const onPdf = async () => {
    setBusy(true);
    try {
      downloadBytes(await buildCalcSheetPdf(result.sheet, project, await getLogo()), `${safeName(i.tag)}_Hydraulic_Calculation.pdf`);
    } finally {
      setBusy(false);
    }
  };

  const Icon = icon;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-slate-50">
            <Icon className="text-brand-400" size={22} /> {calc.label}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => confirm('Restore the example inputs for this calculator?') && setCalcInputs(calcKey, calc.defaults())} title="Restore example inputs">
            <RotateCcw size={16} /> Reset
          </button>
          <button className="btn-secondary" onClick={onPdf} disabled={!result || busy}>
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />} PDF
          </button>
          <button className="btn-secondary" onClick={() => setPreview(true)} disabled={!result}>
            <FileText size={16} /> Preview A4 Sheet
          </button>
          <button className="btn-success" onClick={onSave} disabled={!result}>
            <Save size={16} /> {exists ? 'Update' : 'Save to'} Submittal
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-4">
          <Card title="1. Project / Design Information" icon={ClipboardList}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <TextField label="Equipment tag" value={i.tag} onChange={(v) => set({ tag: v })} />
              <TextField label="System" value={i.system} onChange={(v) => set({ system: v })} className="col-span-2" />
              <TextField label="Specified duty (consultant)" value={i.specifiedDuty} onChange={(v) => set({ specifiedDuty: v })} placeholder="e.g. 6.2 LPS @ 4 BAR" className="col-span-2 lg:col-span-1" />
              {pump && (
                <div className="grid grid-cols-2 gap-2">
                  <NumField label="Duty" value={i.duty} min={1} step={1} onChange={(v) => set({ duty: v })} />
                  <NumField label="Standby" value={i.standby} min={0} step={1} onChange={(v) => set({ standby: v })} />
                </div>
              )}
              <SelectField label="Submittal section" value={i.category} onChange={(v) => set({ category: v })} options={Object.entries(SECTION_CATEGORIES).map(([value, label]) => ({ value, label }))} />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">Project, client and consultant are taken from the Submittal Builder → Project Header.</p>
          </Card>
          {i.routeImages?.length > 0 && (
            <Card title="Pipe route from drawing" icon={ClipboardList} actions={<button className="btn-ghost !py-1 text-xs" onClick={() => confirm('Remove the drawing route pages from this calculation sheet?') && set({ routeImages: [], routeNote: '' })}>Remove</button>}>
              <div className="flex flex-wrap gap-3">
                {i.routeImages.map((img, k) => (
                  <figure key={k} className="w-56">
                    <img src={img.src} alt={img.caption} className="rounded-lg border border-line bg-white" />
                    <figcaption className="mt-1 text-[11px] text-slate-400">{img.caption}</figcaption>
                  </figure>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">Head-loss rows, fixture counts and static height came from Calculations → From Drawing. Edit anything below – the route pages print at the end of the calculation sheet.</p>
            </Card>
          )}
          {children(i, set, result)}
          {pump && result?.fh && <FinalHeadCard i={i} set={set} result={result} closedLoop={calcKey === 'chw'} />}
        </div>

        <aside className="order-first grid gap-4 lg:grid-cols-2 xl:order-none xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:grid-cols-1 xl:self-start xl:overflow-auto">
          <PumpScene type={calcKey} anim={result?.anim} className="order-last self-start" />
          <Card title="Results" icon={Gauge} actions={<span className="rounded bg-brand-500/15 px-2 py-0.5 text-[11px] font-semibold text-brand-300">LIVE</span>}>
            {!result ? (
              <p className="text-sm text-red-400">Check inputs – calculation could not be completed.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2.5">
                  {result.kpis.map((k) => (
                    <Kpi key={k.label} {...k} />
                  ))}
                </div>
                {result.fh && <Breakdown fh={result.fh} hl={result.hl} />}
                <CheckList checks={result.checks} />
              </div>
            )}
          </Card>
        </aside>
      </div>

      {result && <SheetPreviewModal open={preview} onClose={() => setPreview(false)} sheet={result.sheet} project={project} />}
    </div>
  );
}

function FinalHeadCard({ i, set, result, closedLoop }) {
  const { fh } = result;
  return (
    <Card title="4. Final Head Calculation & Selected Pump" icon={Flag}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {!closedLoop && (
          <>
            <NumField label="End / residual pressure" unit="m" value={i.residual} onChange={(v) => set({ residual: v })} min={0} hint={`= ${fmtN((Number(i.residual) || 0) / M_PER_BAR, 2)} bar`} />
            <NumField label="Static height" unit="m" value={i.staticHeight} onChange={(v) => set({ staticHeight: v })} />
          </>
        )}
        <NumField label="Factor of safety" unit="%" value={i.fos} onChange={(v) => set({ fos: v })} min={0} />
        <TextField label="Pump brand" value={i.pumpBrand} onChange={(v) => set({ pumpBrand: v })} placeholder="e.g. Franklin Electric" />
        <TextField label="Pump model" value={i.pumpModel} onChange={(v) => set({ pumpModel: v })} placeholder="e.g. 15EVR0700" />
        <TextField label="Remarks (printed below result)" value={i.remarks} onChange={(v) => set({ remarks: v })} className="col-span-2 md:col-span-3" />
      </div>
      <div className="mt-3 rounded-lg border border-brand-500/40 bg-brand-500/10 px-3 py-2 text-sm font-semibold text-brand-300">
        Selected pump: {fmtN(result.duty.flowLps, 2)} L/s @ {fmtN(fh.proposed, 1)} m ({fmtN(fh.proposed / M_PER_BAR, 2)} bar) – {result.duty.arrangement}
      </div>
    </Card>
  );
}

function Breakdown({ fh, hl }) {
  const items = [
    { label: 'Friction (pipes & fittings)', m: fh.frictionM },
    ...fh.steps.filter((s) => /pressure drop|Other components|residual|Static height/i.test(s.calc) && s.unit === 'm').map((s) => ({ label: s.calc, m: Number(String(s.value).replace(/,/g, '')) || 0 })),
    { label: 'Safety allowance', m: fh.allowance },
  ];
  const max = Math.max(...items.map((x) => Math.abs(x.m)), 0.001);
  return (
    <div>
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">Head build-up</div>
      <div className="space-y-1.5">
        {items.map((x) => (
          <div key={x.label} className="grid grid-cols-[120px_1fr_52px] items-center gap-2 text-xs">
            <span className="truncate text-slate-400" title={x.label}>
              {x.label}
            </span>
            <div className="h-2 rounded-full bg-ink-950">
              <div className="h-2 rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${(Math.abs(x.m) / max) * 100}%` }} />
            </div>
            <span className="text-right tabular-nums text-slate-200">{fmtN(x.m, 2)}</span>
          </div>
        ))}
        <div className="grid grid-cols-[120px_1fr_52px] gap-2 border-t border-line pt-1.5 text-xs font-semibold">
          <span className="text-slate-200">Total proposed</span>
          <span />
          <span className="text-right tabular-nums text-brand-300">{fmtN(fh.proposed, 2)} m</span>
        </div>
        {hl && <div className="pt-1 text-[11px] text-slate-500">{hl.rows.length} head-loss items · total {fmtN(hl.totalBar, 3)} bar</div>}
      </div>
    </div>
  );
}
