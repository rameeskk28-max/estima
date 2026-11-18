import { useMemo, useState } from 'react';
import { FileText, Save, RotateCcw, Download, LoaderCircle, Gauge, ClipboardList } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { CALCULATORS, SECTION_CATEGORIES } from '../../lib/calcs/index.js';
import { fmt, mToBar, mToKPa } from '../../lib/hydraulics.js';
import { buildCalcSheetPdf } from '../../lib/pdf/calcSheet.js';
import { Card, Kpi, CheckList, NumField, TextField, SelectField, downloadBytes, safeName } from '../../components/ui.jsx';
import { SheetPreviewModal } from '../../components/SheetPreview.jsx';

export function CalcShell({ calcKey, icon, description, children }) {
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
    notify(`${i.tag} ${replaced ? 'updated in' : 'added to'} pump schedule → ${SECTION_CATEGORIES[i.category]}`);
  };
  const onPdf = async () => {
    setBusy(true);
    try {
      downloadBytes(await buildCalcSheetPdf(result.sheet, project, await getLogo()), `${safeName(i.tag)}_Calculation_Sheet.pdf`);
    } finally {
      setBusy(false);
    }
  };

  const Icon = icon;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
            <Icon className="text-brand-400" size={22} /> {calc.label} Calculator
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => setCalcInputs(calcKey, calc.defaults())} title="Restore example inputs">
            <RotateCcw size={16} /> Reset
          </button>
          <button className="btn-secondary" onClick={onPdf} disabled={!result || busy}>
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />} PDF
          </button>
          <button className="btn-primary" onClick={() => setPreview(true)} disabled={!result}>
            <FileText size={16} /> Generate A4 Calculation Sheet
          </button>
          <button className="btn-success" onClick={onSave} disabled={!result}>
            <Save size={16} /> {exists ? 'Update' : 'Save to'} Pump Schedule
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Card title="Equipment Identification" icon={ClipboardList}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <TextField label="Equipment tag" value={i.tag} onChange={(v) => set({ tag: v })} />
              <TextField label="Service / description" value={i.service} onChange={(v) => set({ service: v })} />
              <SelectField label="Submittal section" value={i.category} onChange={(v) => set({ category: v })} options={Object.entries(SECTION_CATEGORIES).map(([value, label]) => ({ value, label }))} />
              {'duty' in i ? (
                <div className="grid grid-cols-2 gap-2">
                  <NumField label="Duty" value={i.duty} min={1} step={1} onChange={(v) => set({ duty: v })} />
                  <NumField label="Standby" value={i.standby} min={0} step={1} onChange={(v) => set({ standby: v })} />
                </div>
              ) : (
                <div />
              )}
            </div>
          </Card>
          {children(i, set, result)}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <Card title="Results" icon={Gauge} actions={<span className="rounded bg-brand-500/15 px-2 py-0.5 text-[11px] font-medium text-brand-300">LIVE</span>}>
            {!result ? (
              <p className="text-sm text-red-300">Check inputs – calculation could not be completed.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2.5">
                  {result.kpis.map((k) => (
                    <Kpi key={k.label} {...k} />
                  ))}
                </div>
                {result.duty.headM != null && (
                  <div className="grid grid-cols-3 gap-2 rounded-lg bg-ink-950/60 p-2.5 text-center text-xs tabular-nums">
                    <div>
                      <div className="text-slate-500">Head</div>
                      <div className="font-semibold text-white">{fmt(result.duty.headM, 2)} m</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Pressure</div>
                      <div className="font-semibold text-white">{fmt(mToBar(result.duty.headM), 2)} bar</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Pressure</div>
                      <div className="font-semibold text-white">{fmt(mToKPa(result.duty.headM), 1)} kPa</div>
                    </div>
                  </div>
                )}
                {result.breakdown?.length > 0 && <Breakdown items={result.breakdown} total={result.duty.headM} />}
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

function Breakdown({ items, total }) {
  const max = Math.max(...items.map((x) => Math.abs(x.m)), 0.001);
  return (
    <div>
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">Head build-up</div>
      <div className="space-y-1.5">
        {items.map((x) => (
          <div key={x.label} className="grid grid-cols-[110px_1fr_56px] items-center gap-2 text-xs">
            <span className="truncate text-slate-400" title={x.label}>
              {x.label}
            </span>
            <div className="h-2 rounded-full bg-ink-950">
              <div className={`h-2 rounded-full ${x.m < 0 ? 'bg-amber-400/80' : 'bg-brand-500'}`} style={{ width: `${(Math.abs(x.m) / max) * 100}%` }} />
            </div>
            <span className="text-right tabular-nums text-slate-200">{fmt(x.m, 2)}</span>
          </div>
        ))}
        <div className="grid grid-cols-[110px_1fr_56px] gap-2 border-t border-line pt-1.5 text-xs font-semibold">
          <span className="text-slate-200">Total</span>
          <span />
          <span className="text-right tabular-nums text-brand-300">{fmt(total, 2)} m</span>
        </div>
      </div>
    </div>
  );
}
