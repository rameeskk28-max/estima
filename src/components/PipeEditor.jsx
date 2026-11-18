import { DN_LIST, FITTINGS, PIPE_MATERIALS, fmt, pipeLabel, evaluatePipe } from '../lib/hydraulics.js';
import { Field, NumField, NumInput } from './ui.jsx';

/** Pipe run editor: material, DN, internal Ø override, length and fittings counts. */
export function PipeEditor({ title, pipe, onChange, materials, qLps, showFittings = true }) {
  const set = (patch) => onChange({ ...pipe, ...patch });
  const mat = PIPE_MATERIALS[pipe.material];
  const res = evaluatePipe({ qLps, ...pipe });
  return (
    <div className="rounded-lg border border-line bg-ink-900/50 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-brand-300">{title}</h4>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400 tabular-nums">
          <span>v = <b className="text-slate-200">{fmt(res.v, 2)}</b> m/s</span>
          <span>hf = <b className="text-slate-200">{fmt(res.hf, 2)}</b> m</span>
          <span>hm = <b className="text-slate-200">{fmt(res.hm, 2)}</b> m</span>
          <span>{fmt(res.unitLoss, 2)} m/100 m</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Pipe material">
          <select className="field" value={pipe.material} onChange={(e) => set({ material: e.target.value, idMm: '' })}>
            {materials.map((m) => (
              <option key={m} value={m}>
                {PIPE_MATERIALS[m].label} – C={PIPE_MATERIALS[m].C}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nominal size">
          <select className="field" value={pipe.dn} onChange={(e) => set({ dn: Number(e.target.value), idMm: '' })}>
            {DN_LIST.map((d) => (
              <option key={d} value={d}>
                {pipeLabel(d, pipe.material)}
              </option>
            ))}
          </select>
        </Field>
        <NumField label="Internal Ø (override)" unit="mm" value={pipe.idMm} placeholder={fmt(mat?.idFor(pipe.dn), 1)} onChange={(v) => set({ idMm: v })} hint={`Default ${fmt(mat?.idFor(pipe.dn), 1)} mm`} />
        <NumField label="Equivalent length" unit="m" value={pipe.length} onChange={(v) => set({ length: v })} min={0} />
      </div>
      {showFittings && (
        <details className="group mt-3" open>
          <summary className="cursor-pointer select-none text-xs font-medium text-slate-300 hover:text-white">
            Fittings & valves – ΣK = <span className="tabular-nums text-brand-300">{fmt(res.K, 2)}</span>
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
            {Object.entries(FITTINGS).map(([k, f]) => (
              <label key={k} className="flex items-center justify-between gap-2 rounded border border-line/60 bg-ink-950/40 px-2 py-1">
                <span className="text-[11px] leading-tight text-slate-300">
                  {f.label}
                  <span className="block text-[10px] text-slate-500">K = {f.K}</span>
                </span>
                <NumInput className="!w-14 !px-1.5 !py-0.5 text-center" min={0} step={1} value={pipe.fittings?.[k] ?? 0} onChange={(v) => set({ fittings: { ...pipe.fittings, [k]: v === '' ? 0 : Math.max(0, v) } })} />
              </label>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
