import { useMemo, useState } from 'react';
import { ArrowLeftRight, Gauge, Ruler, Waves, Zap, RefreshCcw, Droplet, Cylinder, Copy, FileText, Download, LoaderCircle, RotateCcw, Calculator, Wrench } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { Card, Field, NumInput, TextField, SelectField, Kpi, CheckList, downloadBytes, safeName } from '../../components/ui.jsx';
import { SheetPreviewModal } from '../../components/SheetPreview.jsx';
import { buildCalcSheetPdf } from '../../lib/pdf/calcSheet.js';
import { QUANTITIES, convert, fmtSmart } from '../../lib/units.js';
import { TOOLS, MATERIAL_NAMES, PIPE_SIZES_IN, sizeLabel, ROUGHNESS_MM } from '../../lib/tools.js';
import { MATERIALS, dnOf } from '../../lib/ipc.js';

export const TOOL_ITEMS = [
  { key: 'converter', label: 'Unit Converter', icon: ArrowLeftRight, desc: 'Flow, pressure/head, length, power, volume, temperature and more' },
  { key: 'velocity', label: 'Velocity', icon: Gauge, desc: 'Pipe velocity & velocity head for any size' },
  { key: 'sizer', label: 'Pipe Sizer', icon: Ruler, desc: 'Smallest pipe meeting velocity & friction limits' },
  { key: 'friction', label: 'Friction Loss', icon: Waves, desc: 'Hazen-Williams or Darcy-Weisbach + fittings' },
  { key: 'power', label: 'Pump Power', icon: Zap, desc: 'Hydraulic / shaft / input kW, motor & current' },
  { key: 'affinity', label: 'Affinity Laws', icon: RefreshCcw, desc: 'New duty for speed change or impeller trim' },
  { key: 'npsh', label: 'NPSH', icon: Droplet, desc: 'NPSH available vs required (temperature, altitude)' },
  { key: 'tank', label: 'Tank & Sump', icon: Cylinder, desc: 'Tank volume & filling flow; sump volume & cycles' },
];

/** Number + unit dropdown; switching unit converts the value. */
export function UnitInput({ label, q, value, onChange, hint, units, min }) {
  const list = units || Object.keys(QUANTITIES[q].units);
  return (
    <Field label={label} hint={hint}>
      <div className="flex">
        <NumInput value={value.v} min={min} onChange={(v) => onChange({ ...value, v })} className="rounded-r-none" />
        <select
          className="field w-auto max-w-[120px] rounded-l-none border-l-0 bg-ink-800 text-xs"
          value={value.u}
          onChange={(e) => {
            const u = e.target.value;
            const c = convert(value.v, value.u, u, q);
            onChange({ v: Number.isFinite(c) ? Number(fmtSmart(c, 6).replace(/,/g, '')) : value.v, u });
          }}
          aria-label={`${label} unit`}
        >
          {list.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
      </div>
    </Field>
  );
}

const FLOW_U = ['L/s', 'm³/h', 'L/min', 'US gpm', 'UK gpm', 'ft³/s'];
const HEAD_U = ['m', 'ft'];
const VEL_U = ['m/s', 'ft/s'];

function PipeInput({ pipe, onChange }) {
  const set = (p) => onChange({ ...pipe, ...p });
  const mat = MATERIALS[pipe.material];
  return (
    <>
      <SelectField label="Pipe definition" value={pipe.mode} onChange={(v) => set({ mode: v })} options={[{ value: 'standard', label: 'Material & nominal size' }, { value: 'custom', label: 'Custom internal Ø' }]} />
      {pipe.mode === 'custom' ? (
        <UnitInput label="Internal diameter" q="diameter" value={pipe.id} onChange={(id) => set({ id })} />
      ) : (
        <>
          <SelectField label="Material" value={pipe.material} onChange={(v) => set({ material: v })} options={MATERIAL_NAMES.map((m) => ({ value: m, label: m }))} />
          <Field label="Nominal size" hint={mat ? `ID ${((mat.id(Number(pipe.size)) || 0) * 25.4).toFixed(1)} mm – ${mat.idBasis}` : ''}>
            <select className="field" value={pipe.size} onChange={(e) => set({ size: Number(e.target.value) })}>
              {PIPE_SIZES_IN.map((s) => (
                <option key={s} value={s}>
                  {sizeLabel(s)} – DN{dnOf(s)}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}
    </>
  );
}

/* ------------------------------ per-tool forms ------------------------------ */
const FORMS = {
  converter: ({ i, set }) => (
    <>
      <SelectField label="Quantity" value={i.q} onChange={(q) => set({ q, u: Object.keys(QUANTITIES[q].units)[0] })} options={Object.entries(QUANTITIES).filter(([k]) => k !== 'diameter' && k !== 'head').map(([k, x]) => ({ value: k, label: x.label }))} />
      <UnitInput label="Value" q={i.q} value={{ v: i.v, u: i.u }} onChange={(x) => set({ v: x.v, u: x.u })} />
    </>
  ),
  velocity: ({ i, set }) => (
    <>
      <UnitInput label="Flow rate" q="flow" units={FLOW_U} value={i.flow} onChange={(flow) => set({ flow })} />
      <PipeInput pipe={i.pipe} onChange={(pipe) => set({ pipe })} />
      <UnitInput label="Min. velocity" q="velocity" units={VEL_U} value={i.vmin} onChange={(vmin) => set({ vmin })} />
      <UnitInput label="Max. velocity" q="velocity" units={VEL_U} value={i.vmax} onChange={(vmax) => set({ vmax })} />
    </>
  ),
  sizer: ({ i, set }) => (
    <>
      <UnitInput label="Design flow" q="flow" units={FLOW_U} value={i.flow} onChange={(flow) => set({ flow })} />
      <SelectField label="Pipe material" value={i.material} onChange={(material) => set({ material, C: '' })} options={MATERIAL_NAMES.map((m) => ({ value: m, label: m }))} />
      <SelectField label="Friction method" value={i.method} onChange={(method) => set({ method })} options={[{ value: 'hw', label: 'Hazen-Williams' }, { value: 'dw', label: 'Darcy-Weisbach' }]} />
      {i.method === 'hw' ? (
        <Field label="C-factor" hint={`Default ${MATERIALS[i.material].C}`}>
          <NumInput value={i.C} placeholder={String(MATERIALS[i.material].C)} onChange={(C) => set({ C })} />
        </Field>
      ) : (
        <UnitInput label="Water temperature" q="temperature" value={i.temp} onChange={(temp) => set({ temp })} />
      )}
      <UnitInput label="Max. velocity" q="velocity" units={VEL_U} value={i.vmax} onChange={(vmax) => set({ vmax })} />
      <UnitInput label="Min. velocity (warning)" q="velocity" units={VEL_U} value={i.vmin} onChange={(vmin) => set({ vmin })} />
      <Field label="Friction limit">
        <label className="mb-1.5 flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" className="accent-brand-500" checked={i.useFriction} onChange={(e) => set({ useFriction: e.target.checked })} /> Apply friction-rate limit
        </label>
      </Field>
      {i.useFriction && <UnitInput label="Max. friction rate" q="frictionRate" value={i.fmax} onChange={(fmax) => set({ fmax })} />}
    </>
  ),
  friction: ({ i, set }) => (
    <>
      <UnitInput label="Flow rate" q="flow" units={FLOW_U} value={i.flow} onChange={(flow) => set({ flow })} />
      <PipeInput pipe={i.pipe} onChange={(pipe) => set({ pipe, C: '', eps: '' })} />
      <UnitInput label="Pipe length" q="length" units={['m', 'ft']} value={i.length} onChange={(length) => set({ length })} />
      <SelectField label="Method" value={i.method} onChange={(method) => set({ method })} options={[{ value: 'hw', label: 'Hazen-Williams' }, { value: 'dw', label: 'Darcy-Weisbach (Colebrook)' }]} />
      {i.method === 'hw' ? (
        <Field label="C-factor" hint={`Default ${(MATERIALS[i.pipe.material] || MATERIALS['PPR / uPVC']).C}`}>
          <NumInput value={i.C} placeholder={String((MATERIALS[i.pipe.material] || MATERIALS['PPR / uPVC']).C)} onChange={(C) => set({ C })} />
        </Field>
      ) : (
        <>
          <Field label="Roughness ε (mm)" hint={`Default ${ROUGHNESS_MM[i.pipe.material] ?? 0.05} mm`}>
            <NumInput value={i.eps} placeholder={String(ROUGHNESS_MM[i.pipe.material] ?? 0.05)} onChange={(eps) => set({ eps })} />
          </Field>
          <UnitInput label="Water temperature" q="temperature" value={i.temp} onChange={(temp) => set({ temp })} />
        </>
      )}
      <Field label="Sum of fitting K (optional)">
        <NumInput value={i.sumK} min={0} onChange={(sumK) => set({ sumK })} />
      </Field>
    </>
  ),
  power: ({ i, set }) => (
    <>
      <UnitInput label="Flow rate" q="flow" units={FLOW_U} value={i.flow} onChange={(flow) => set({ flow })} />
      <UnitInput label="Pump head" q="head" value={i.head} onChange={(head) => set({ head })} />
      <Field label="Specific gravity">
        <NumInput value={i.sg} step={0.01} onChange={(sg) => set({ sg })} />
      </Field>
      <Field label="Pump efficiency (%)">
        <NumInput value={i.pumpEff} onChange={(pumpEff) => set({ pumpEff })} />
      </Field>
      <Field label="Motor efficiency (%)">
        <NumInput value={i.motorEff} onChange={(motorEff) => set({ motorEff })} />
      </Field>
      <Field label="Motor margin (%)">
        <NumInput value={i.margin} onChange={(margin) => set({ margin })} />
      </Field>
      <Field label="Supply voltage (V, 3-phase)">
        <NumInput value={i.voltage} onChange={(voltage) => set({ voltage })} />
      </Field>
      <Field label="Power factor">
        <NumInput value={i.pf} step={0.01} onChange={(pf) => set({ pf })} />
      </Field>
    </>
  ),
  affinity: ({ i, set }) => (
    <>
      <SelectField label="Change" value={i.mode} onChange={(mode) => set({ mode, x1: mode === 'speed' ? 2900 : 200, x2: mode === 'speed' ? 2400 : 180 })} options={[{ value: 'speed', label: 'Speed (VFD)' }, { value: 'diameter', label: 'Impeller trim' }]} />
      <UnitInput label="Flow Q1" q="flow" units={FLOW_U} value={i.flow} onChange={(flow) => set({ flow })} />
      <UnitInput label="Head H1" q="head" value={i.head} onChange={(head) => set({ head })} />
      <UnitInput label="Power P1" q="power" units={['kW', 'HP']} value={i.power} onChange={(power) => set({ power })} />
      <Field label={i.mode === 'speed' ? 'Speed N1 (rpm)' : 'Impeller D1 (mm)'}>
        <NumInput value={i.x1} onChange={(x1) => set({ x1 })} />
      </Field>
      <Field label={i.mode === 'speed' ? 'Speed N2 (rpm)' : 'Impeller D2 (mm)'}>
        <NumInput value={i.x2} onChange={(x2) => set({ x2 })} />
      </Field>
    </>
  ),
  npsh: ({ i, set }) => (
    <>
      <UnitInput label="Water temperature" q="temperature" value={i.temp} onChange={(temp) => set({ temp })} />
      <UnitInput label="Site altitude" q="length" units={['m', 'ft']} value={i.altitude} onChange={(altitude) => set({ altitude })} />
      <UnitInput label="Static suction head (+ flooded / − lift)" q="head" value={i.staticHead} onChange={(staticHead) => set({ staticHead })} />
      <UnitInput label="Suction line losses" q="head" value={i.suctionLoss} onChange={(suctionLoss) => set({ suctionLoss })} />
      <UnitInput label="NPSH required (pump curve)" q="head" value={i.npshr} onChange={(npshr) => set({ npshr })} />
      <UnitInput label="Safety margin" q="head" value={i.margin} onChange={(margin) => set({ margin })} />
    </>
  ),
  tank: ({ i, set }) => (
    <>
      <SelectField label="Calculation" value={i.mode} onChange={(mode) => set({ mode })} options={[{ value: 'tank', label: 'Tank volume & filling flow' }, { value: 'sump', label: 'Sump volume & pump cycles' }]} />
      {i.mode === 'tank' ? (
        <>
          <SelectField label="Tank shape" value={i.shape} onChange={(shape) => set({ shape })} options={[{ value: 'rect', label: 'Rectangular' }, { value: 'cyl', label: 'Cylindrical (vertical)' }]} />
          {i.shape === 'cyl' ? (
            <UnitInput label="Diameter" q="length" units={['m', 'ft', 'mm']} value={i.D} onChange={(D) => set({ D })} />
          ) : (
            <>
              <UnitInput label="Length" q="length" units={['m', 'ft', 'mm']} value={i.L} onChange={(L) => set({ L })} />
              <UnitInput label="Width" q="length" units={['m', 'ft', 'mm']} value={i.W} onChange={(W) => set({ W })} />
            </>
          )}
          <UnitInput label="Water depth" q="length" units={['m', 'ft', 'mm']} value={i.H} onChange={(H) => set({ H })} />
          <Field label="Effective volume (%)">
            <NumInput value={i.eff} onChange={(eff) => set({ eff })} />
          </Field>
          <UnitInput label="Filling time" q="time" units={['h', 'min']} value={i.time} onChange={(time) => set({ time })} />
        </>
      ) : (
        <>
          <UnitInput label="Pump flow" q="flow" units={FLOW_U} value={i.pumpFlow} onChange={(pumpFlow) => set({ pumpFlow })} />
          <Field label="Max. starts per hour">
            <NumInput value={i.starts} onChange={(starts) => set({ starts })} />
          </Field>
          <UnitInput label="Inflow to sump" q="flow" units={FLOW_U} value={i.inflow} onChange={(inflow) => set({ inflow })} />
        </>
      )}
    </>
  ),
};

/* ------------------------------ results extras ------------------------------ */
function Extras({ toolKey, r, i }) {
  if (toolKey === 'converter')
    return (
      <Card title={`${QUANTITIES[i.q].label} – all units`} icon={ArrowLeftRight} bodyClass="p-0">
        <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0">
          {r.rows.map((x) => (
            <div key={x.unit} className={`flex items-center justify-between gap-3 border-line px-4 py-2.5 sm:border-b ${x.unit === i.u ? 'bg-brand-500/10' : ''}`}>
              <span className="text-sm text-slate-400">{x.unit}</span>
              <span className="font-display text-lg font-semibold tabular-nums text-slate-50">{fmtSmart(x.value, 6)}</span>
            </div>
          ))}
        </div>
      </Card>
    );
  const grid = r.sheet.sections.find((s) => s.type === 'grid');
  if (!grid) return null;
  return (
    <Card title={grid.title.replace(/^\d+\.\s*/, '')} icon={Ruler} bodyClass="p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-ink-800 text-[10px] uppercase tracking-wide text-slate-400">
            <tr>
              {grid.columns.map((c) => (
                <th key={c.label} className="px-3 py-2 text-center">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {grid.rows.map((row, k) => (
              <tr key={k} className={row.bold ? 'bg-brand-500/10 font-semibold' : ''}>
                {row.c.map((c, j) => (
                  <td key={j} className={`px-3 py-1.5 text-center tabular-nums ${row.flag === j ? 'text-red-400' : j === row.c.length - 1 && !row.flag ? 'text-brand-400' : 'text-slate-200'}`}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ------------------------------ page ------------------------------ */
export function ToolPage({ toolKey }) {
  const { toolInputs, setTool, project, getLogo, notify } = useStore();
  const tool = TOOLS[toolKey];
  const meta = TOOL_ITEMS.find((t) => t.key === toolKey);
  const i = toolInputs[toolKey];
  const set = (p) => setTool(toolKey, p);
  const r = useMemo(() => {
    try {
      return tool.compute(i);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [tool, i]);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const Form = FORMS[toolKey];
  const steps = r?.sheet.sections.find((s) => s.type === 'steps')?.steps || [];

  const copy = async () => {
    const lines = [`${meta.label}${i.ref ? ` – ${i.ref}` : ''}`];
    if (toolKey === 'converter') r.rows.forEach((x) => lines.push(`${fmtSmart(x.value, 6)} ${x.unit}`));
    else steps.forEach((s) => lines.push(`${s.calc}: ${s.value} ${s.unit}`.trim()));
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      notify('Results copied to clipboard');
    } catch {
      notify('Copy not allowed by the browser', 'bad');
    }
  };
  const pdf = async () => {
    setBusy(true);
    try {
      downloadBytes(await buildCalcSheetPdf(r.sheet, project, await getLogo()), `${safeName(meta.label)}${i.ref ? `_${safeName(i.ref)}` : ''}.pdf`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-slate-50">
            <meta.icon className="text-brand-400" size={22} /> {meta.label}
          </h1>
          <p className="mt-1 text-sm text-slate-400">{meta.desc}. Every input accepts metric or imperial units.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => set(null)} title="Reset inputs">
            <RotateCcw size={16} /> Reset
          </button>
          <button className="btn-secondary" onClick={copy} disabled={!r}>
            <Copy size={16} /> Copy results
          </button>
          <button className="btn-secondary" onClick={() => setPreview(true)} disabled={!r}>
            <FileText size={16} /> A4 sheet
          </button>
          <button className="btn-primary" onClick={pdf} disabled={!r || busy}>
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />} PDF
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
        <Card title="Inputs" icon={Wrench} className="xl:sticky xl:top-24 xl:self-start">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <Form i={i} set={set} />
            <TextField label="Reference / tag (for the A4 sheet)" value={i.ref} onChange={(ref) => set({ ref })} placeholder="e.g. BPS-01 header" />
          </div>
        </Card>
        <div className="min-w-0 space-y-4">
          {!r ? (
            <Card>
              <p className="text-sm text-red-400">Check the inputs – the calculation could not be completed.</p>
            </Card>
          ) : (
            <>
              {r.kpis.length > 0 && (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {r.kpis.map((k) => (
                    <Kpi key={k.label} {...k} />
                  ))}
                </div>
              )}
              {r.checks?.length > 0 && <CheckList checks={r.checks} />}
              <Extras toolKey={toolKey} r={r} i={i} />
              {steps.length > 0 && (
                <Card title="Calculation steps" icon={Calculator} bodyClass="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="bg-ink-800 text-[10px] uppercase tracking-wide text-slate-400">
                        <tr>
                          <th className="px-3 py-2 text-left">Calculation</th>
                          <th className="px-3 py-2 text-left">Formula</th>
                          <th className="px-3 py-2 text-right">Result</th>
                          <th className="px-3 py-2 text-left">Reference / basis</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {steps.map((s) => (
                          <tr key={s.n} className={s.bold ? 'bg-brand-500/10' : ''}>
                            <td className="px-3 py-2 font-medium text-slate-200">{s.calc}</td>
                            <td className="px-3 py-2 font-mono text-xs text-slate-400">{s.formula}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-slate-50">
                              {s.value} <span className="text-xs font-normal text-slate-400">{s.unit}</span>
                            </td>
                            <td className="px-3 py-2 text-xs italic text-slate-400">{s.ref}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
      {r && <SheetPreviewModal open={preview} onClose={() => setPreview(false)} sheet={r.sheet} project={project} />}
    </div>
  );
}

export function ToolsFolder({ go }) {
  return (
    <div>
      <div className="mb-8 max-w-3xl">
        <span className="font-mono text-xs uppercase tracking-widest text-brand-400">Folder 07</span>
        <h1 className="mt-2 font-display text-3xl font-bold text-slate-50 sm:text-4xl">Engineering Tools</h1>
        <p className="mt-3 text-slate-400">Quick pump & piping calculators with metric and imperial units. Each result can be copied or printed as an A4 sheet in the Greenland format.</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {TOOL_ITEMS.map((t) => (
          <button key={t.key} onClick={() => go(`tools/${t.key}`)} className="card group rounded-3xl p-6 text-left transition hover:border-brand-500/50">
            <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-brand-500/25 bg-brand-500/15 text-brand-400">
              <t.icon size={20} />
            </span>
            <h3 className="font-display text-lg font-bold text-slate-50">{t.label}</h3>
            <p className="mt-1.5 text-sm text-slate-400">{t.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
