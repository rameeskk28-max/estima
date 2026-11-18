import { ArrowDown, ArrowUp, Copy, Plus, Trash2, Table2, Users } from 'lucide-react';
import { Card, Field, NumInput, NumField } from '../../components/ui.jsx';
import { FITTING_ITEMS, PIPE_SIZES_IN, MATERIAL_NAMES, MATERIALS, sizeLabel, equivalentLength, fmtN, FIXTURES } from '../../lib/ipc.js';
import { row, rid } from '../../lib/calcs/engine.js';

const move = (list, idx, dir) => {
  const c = [...list];
  const j = idx + dir;
  if (j < 0 || j >= c.length) return list;
  [c[idx], c[j]] = [c[j], c[idx]];
  return c;
};

const cell = 'field !rounded !px-1.5 !py-1 text-xs';

/** Section 3 – head-loss table editor (same columns as the Excel template). */
export function HeadLossEditor({ i, set, result, designLabel = 'design flow per pump' }) {
  const rows = i.rows || [];
  const calc = result?.hl?.rows || [];
  const upd = (id, patch) => set({ rows: rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const designFlow = calc[0] && rows[0] && (rows[0].flow === '' || rows[0].flow == null) ? calc[0].q : result?.duty?.flowLps;
  return (
    <Card
      title="3. Head Loss Calculation – Fittings & Pipe Friction"
      icon={Table2}
      bodyClass="p-0"
      actions={
        <button className="btn-secondary !py-1 text-xs" onClick={() => set({ rows: [...rows, row('90° Elbow', rows.at(-1)?.size || 2, 1)] })}>
          <Plus size={14} /> Add item
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-3 border-b border-line p-3 md:grid-cols-4">
        <Field label="Pipe material (C-factor)">
          <select className="field" value={i.material} onChange={(e) => set({ material: e.target.value })}>
            {MATERIAL_NAMES.map((m) => (
              <option key={m} value={m}>
                {m} – C {MATERIALS[m].C}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Pipe ID basis">
          <select className="field" value={i.idBasis || 'nominal'} onChange={(e) => set({ idBasis: e.target.value })}>
            <option value="nominal">Nominal size (as template)</option>
            <option value="actual">Actual ID of material</option>
          </select>
        </Field>
        <NumField label="Velocity limit" unit="m/s" value={i.velLimit} onChange={(v) => set({ velLimit: v })} step={0.1} min={0.1} />
        <div className="self-end pb-1 text-[11px] leading-snug text-slate-500">
          Blank flow = {designLabel} ({fmtN(designFlow, 2)} L/s). Blank Eq. length / ID = automatic.
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-xs">
          <thead className="bg-ink-800 text-[10px] uppercase tracking-wide text-slate-400">
            <tr className="text-center">
              <th className="px-2 py-2">No.</th>
              <th className="px-2 py-2 text-left">Pipes & Fittings</th>
              <th className="px-2 py-2">Size (in)</th>
              <th className="px-2 py-2">Flow (L/s)</th>
              <th className="px-2 py-2">Qty</th>
              <th className="px-2 py-2">Length (m)</th>
              <th className="px-2 py-2">Eq. L / item (ft)</th>
              <th className="px-2 py-2">C</th>
              <th className="px-2 py-2">ID (in)</th>
              <th className="px-2 py-2">Vel. (m/s)</th>
              <th className="px-2 py-2">psi/100ft</th>
              <th className="px-2 py-2">Loss (bar)</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, k) => {
              const c = calc[k] || {};
              const straight = r.item === 'Straight Pipe';
              const look = equivalentLength(r.item, Number(r.size));
              return (
                <tr key={r.id} className="hover:bg-ink-800/40">
                  <td className="px-2 py-1 text-center text-slate-500">{k + 1}</td>
                  <td className="px-1 py-1">
                    <select className={`${cell} min-w-[150px]`} value={r.item} onChange={(e) => upd(r.id, { item: e.target.value, eq: '' })}>
                      {FITTING_ITEMS.map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <select className={`${cell} w-16`} value={r.size} onChange={(e) => upd(r.id, { size: Number(e.target.value), eq: '' })}>
                      {PIPE_SIZES_IN.map((s) => (
                        <option key={s} value={s}>
                          {sizeLabel(s)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <NumInput className={`${cell} w-16 text-center`} value={r.flow} placeholder={fmtN(c.q, 2)} onChange={(v) => upd(r.id, { flow: v })} min={0} />
                  </td>
                  <td className="px-1 py-1">
                    <NumInput className={`${cell} w-14 text-center`} value={straight ? '' : r.qty} disabled={straight} placeholder={straight ? '–' : ''} onChange={(v) => upd(r.id, { qty: v })} min={0} step={1} />
                  </td>
                  <td className="px-1 py-1">
                    <NumInput className={`${cell} w-16 text-center`} value={straight ? r.length : ''} disabled={!straight} placeholder={straight ? '' : '–'} onChange={(v) => upd(r.id, { length: v })} min={0} />
                  </td>
                  <td className="px-1 py-1">
                    {straight ? (
                      <div className="text-center tabular-nums text-slate-300">{fmtN(c.eqFt, 1)}</div>
                    ) : (
                      <NumInput
                        className={`${cell} w-16 text-center ${c.missingEq ? '!border-amber-500' : ''}`}
                        value={r.eq}
                        placeholder={look.ft != null ? fmtN(look.ft, 1) : 'enter'}
                        title={look.source}
                        onChange={(v) => upd(r.id, { eq: v })}
                        min={0}
                      />
                    )}
                  </td>
                  <td className="px-2 py-1 text-center tabular-nums text-slate-400">{c.C}</td>
                  <td className="px-1 py-1">
                    <NumInput className={`${cell} w-16 text-center`} value={r.idIn} placeholder={fmtN(c.idIn, 3)} onChange={(v) => upd(r.id, { idIn: v })} min={0} />
                  </td>
                  <td className={`px-2 py-1 text-center tabular-nums font-semibold ${c.vOk === false ? 'text-red-400' : 'text-slate-200'}`} title={c.vOk === false ? `Above ${i.velLimit} m/s` : 'OK'}>
                    {fmtN(c.v, 2)}
                  </td>
                  <td className="px-2 py-1 text-center tabular-nums text-slate-300">{fmtN(c.psi100, 2)}</td>
                  <td className="px-2 py-1 text-center tabular-nums font-semibold text-slate-100">{fmtN(c.lossBar, 3)}</td>
                  <td className="whitespace-nowrap px-1 py-1 text-right">
                    <button className="btn-ghost !p-0.5" onClick={() => set({ rows: move(rows, k, -1) })} disabled={k === 0} aria-label="Move up">
                      <ArrowUp size={13} />
                    </button>
                    <button className="btn-ghost !p-0.5" onClick={() => set({ rows: move(rows, k, 1) })} disabled={k === rows.length - 1} aria-label="Move down">
                      <ArrowDown size={13} />
                    </button>
                    <button className="btn-ghost !p-0.5" onClick={() => set({ rows: [...rows.slice(0, k + 1), { ...r, id: rid() }, ...rows.slice(k + 1)] })} aria-label="Duplicate">
                      <Copy size={13} />
                    </button>
                    <button className="btn-ghost !p-0.5 hover:!text-red-400" onClick={() => set({ rows: rows.filter((x) => x.id !== r.id) })} aria-label="Delete">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-brand-500/10 font-semibold">
              <td colSpan={13} className="px-3 py-2 text-slate-200">
                TOTAL FRICTION LOSS = <span className="tabular-nums text-brand-300">{fmtN(result?.hl?.totalBar, 3)} bar</span>
                <span className="ml-2 font-normal text-slate-400">({fmtN((result?.hl?.totalBar || 0) * 10.197, 2)} m head)</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="px-3 py-2 text-[11px] text-slate-500">
        Equivalent lengths: IPC 2009 Table E103.3(5) for ½"–3"; Crane TP-410 (L/D) for larger sizes. Strainers, flexible connectors, reducers etc. need a manual value from the manufacturer.
      </p>
    </Card>
  );
}

/** Booster – fixture unit table. */
export function FixtureEditor({ i, set }) {
  const list = i.fixtures || [];
  const upd = (id, patch) => set({ fixtures: list.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  const total = list.reduce((s, f) => s + (Number(f.qty) || 0) * (Number(f.wsfu) || 0), 0);
  return (
    <Card
      title="2. Domestic Water Demand – Fixture Unit Method"
      icon={Users}
      bodyClass="p-0"
      actions={
        <button className="btn-secondary !py-1 text-xs" onClick={() => set({ fixtures: [...list, { id: rid(), name: 'Wash Basin / Lavatory', qty: 1, wsfu: 1 }] })}>
          <Plus size={14} /> Add fixture
        </button>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="bg-ink-800 text-[10px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left">No.</th>
              <th className="px-2 py-2 text-left">Fixture / Appliance</th>
              <th className="px-2 py-2">Qty</th>
              <th className="px-2 py-2">WSFU / Fixture</th>
              <th className="px-2 py-2">Total WSFU</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((f, k) => (
              <tr key={f.id}>
                <td className="px-3 py-1 text-slate-500">{k + 1}</td>
                <td className="px-1 py-1">
                  <input list="fixture-list" className={`${cell} w-full`} value={f.name} onChange={(e) => {
                    const known = FIXTURES.find((x) => x.name === e.target.value);
                    upd(f.id, known ? { name: known.name, wsfu: known.wsfu } : { name: e.target.value });
                  }} />
                </td>
                <td className="px-1 py-1">
                  <NumInput className={`${cell} w-20 text-center`} value={f.qty} onChange={(v) => upd(f.id, { qty: v })} min={0} step={1} />
                </td>
                <td className="px-1 py-1">
                  <NumInput className={`${cell} w-20 text-center`} value={f.wsfu} onChange={(v) => upd(f.id, { wsfu: v })} min={0} step={0.5} />
                </td>
                <td className="px-2 py-1 text-center font-semibold tabular-nums text-slate-100">{fmtN((Number(f.qty) || 0) * (Number(f.wsfu) || 0), 1)}</td>
                <td className="px-1 py-1 text-right">
                  <button className="btn-ghost !p-0.5 hover:!text-red-400" onClick={() => set({ fixtures: list.filter((x) => x.id !== f.id) })} aria-label="Delete fixture">
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-brand-500/10 font-semibold">
              <td colSpan={4} className="px-3 py-2 text-right text-slate-200">
                TOTAL WSFU
              </td>
              <td className="px-2 py-2 text-center tabular-nums text-brand-300">{fmtN(total, 1)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
        <datalist id="fixture-list">
          {FIXTURES.map((f) => (
            <option key={f.name} value={f.name} />
          ))}
        </datalist>
      </div>
      <p className="px-3 py-2 text-[11px] text-slate-500">WSFU values per IPC 2009 Appendix E (editable). Pick a fixture from the list to load its standard value.</p>
    </Card>
  );
}
