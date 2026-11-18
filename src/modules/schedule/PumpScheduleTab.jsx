import { useState } from 'react';
import { TableProperties, Plus, Download, FileSpreadsheet, Eye, ArrowUp, ArrowDown, Copy, Trash2, Import, Sparkles, LoaderCircle, Eraser } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { Card, TextField, downloadBytes, safeName } from '../../components/ui.jsx';
import { SCHEDULE_COLUMNS, emptyScheduleRow, EXAMPLE_SCHEDULE, buildSchedulePdf, scheduleCsv } from '../../lib/pdf/schedulePdf.js';

const label = (c) => c.label.replace('- ', '');
const WIDE = { system: 'min-w-[150px]', model: 'min-w-[150px]', moc: 'min-w-[220px]', type: 'min-w-[120px]', brand: 'min-w-[110px]', header: 'min-w-[120px]', certs: 'min-w-[100px]', motorClass: 'min-w-[90px]' };

export function PumpScheduleTab() {
  const { schedule, setSchedule, importDutiesToSchedule, project, duties, notify } = useStore();
  const [busy, setBusy] = useState(false);
  const rows = schedule.rows;
  const setRows = (fn) => setSchedule((s) => ({ ...s, rows: typeof fn === 'function' ? fn(s.rows) : fn }));
  const upd = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const move = (k, dir) =>
    setRows((rs) => {
      const c = [...rs];
      const j = k + dir;
      if (j < 0 || j >= c.length) return rs;
      [c[k], c[j]] = [c[j], c[k]];
      return c;
    });

  const pdf = async (open) => {
    setBusy(true);
    try {
      const bytes = await buildSchedulePdf(schedule, project);
      if (open) {
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else downloadBytes(bytes, `${safeName(project.refNo || 'Pump')}_Pump_Schedule.pdf`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-50">
            <TableProperties className="text-brand-400" size={22} /> Pump Schedule
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Enter the pump schedule manually in the Greenland SOM format, or import duties saved from the calculators and complete brand, model and motor data. It is used for section “Pump Schedule” in the submittal.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => downloadBytes(new TextEncoder().encode(scheduleCsv(schedule)), `${safeName(project.refNo || 'Pump')}_Pump_Schedule.csv`, 'text/csv')} disabled={!rows.length}>
            <FileSpreadsheet size={16} /> Excel (CSV)
          </button>
          <button className="btn-secondary" onClick={() => pdf(true)} disabled={busy}>
            <Eye size={16} /> Preview
          </button>
          <button className="btn-primary" onClick={() => pdf(false)} disabled={busy}>
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />} Download A4 PDF
          </button>
        </div>
      </div>

      <Card title="Schedule Header" icon={TableProperties}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <TextField label="Title" value={schedule.title} onChange={(v) => setSchedule((s) => ({ ...s, title: v }))} />
          <TextField label="Sub-title (e.g. brand — system)" value={schedule.subtitle} onChange={(v) => setSchedule((s) => ({ ...s, subtitle: v }))} placeholder="FRANKLIN ELECTRIC PUMPS — WATER SUPPLY" />
          <TextField label="Notes (printed below table)" value={schedule.notes} onChange={(v) => setSchedule((s) => ({ ...s, notes: v }))} />
        </div>
      </Card>

      <Card
        title={`Pumps (${rows.length})`}
        icon={TableProperties}
        bodyClass="p-0"
        actions={
          <>
            <button
              className="btn-secondary !py-1 text-xs"
              onClick={() => {
                const n = importDutiesToSchedule();
                notify(n ? `${n} pump duty(ies) imported from calculators` : duties.length ? 'All saved duties are already in the schedule' : 'No saved duties – use “Save to Submittal” in a calculator first', n ? 'ok' : 'bad');
              }}
            >
              <Import size={14} /> Import from calculators
            </button>
            {!rows.length && (
              <button className="btn-ghost !py-1 text-xs" onClick={() => setRows(EXAMPLE_SCHEDULE())}>
                <Sparkles size={14} /> Load example
              </button>
            )}
            {rows.length > 0 && (
              <button className="btn-ghost !py-1 text-xs hover:!text-red-400" onClick={() => confirm('Remove all rows from the pump schedule?') && setRows([])}>
                <Eraser size={14} /> Clear
              </button>
            )}
            <button className="btn-primary !py-1 text-xs" onClick={() => setRows((rs) => [...rs, emptyScheduleRow()])}>
              <Plus size={14} /> Add pump
            </button>
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-max min-w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wide">
              <tr className="bg-brand-600 text-white">
                {SCHEDULE_COLUMNS.map((c, k) => {
                  if (c.group) {
                    const first = SCHEDULE_COLUMNS.findIndex((x) => x.group === c.group) === k;
                    return first ? (
                      <th key={k} colSpan={2} className="border-x border-white/30 px-2 py-1.5 text-center">
                        {c.group}
                      </th>
                    ) : null;
                  }
                  return (
                    <th key={k} rowSpan={2} className={`border-x border-white/30 px-2 py-1.5 text-center ${k < 2 ? 'sticky z-10 bg-brand-600' : ''} ${k === 0 ? 'left-0' : k === 1 ? 'left-10' : ''}`}>
                      {label(c)}
                    </th>
                  );
                })}
                <th rowSpan={2} className="px-2" />
              </tr>
              <tr className="bg-brand-600 text-white">
                {SCHEDULE_COLUMNS.filter((c) => c.group).map((c, k) => (
                  <th key={k} className="border-x border-t border-white/30 px-2 py-1 text-center">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {!rows.length && (
                <tr>
                  <td colSpan={SCHEDULE_COLUMNS.length + 1} className="px-4 py-8 text-center text-sm text-slate-400">
                    No pumps yet – click <b>Add pump</b>, <b>Import from calculators</b> or <b>Load example</b>.
                  </td>
                </tr>
              )}
              {rows.map((r, k) => (
                <tr key={r.id} className="bg-ink-850 hover:bg-ink-800/60">
                  {SCHEDULE_COLUMNS.map((c, ci) =>
                    c.key === 'sl' ? (
                      <td key={c.key} className="sticky left-0 z-10 w-10 bg-inherit px-2 text-center font-semibold text-slate-400">
                        {k + 1}
                      </td>
                    ) : (
                      <td key={c.key} className={`px-1 py-1 ${ci === 1 ? 'sticky left-10 z-10 bg-inherit' : ''}`}>
                        {c.key === 'moc' ? (
                          <textarea rows={2} className={`field !rounded !px-1.5 !py-1 text-xs ${WIDE[c.key]}`} value={r[c.key] ?? ''} onChange={(e) => upd(r.id, { [c.key]: e.target.value })} />
                        ) : (
                          <input
                            className={`field !rounded !px-1.5 !py-1 text-xs ${WIDE[c.key] || 'w-20 text-center'} ${c.bold ? 'font-semibold' : ''}`}
                            value={r[c.key] ?? ''}
                            inputMode={c.input === 'num' ? 'decimal' : undefined}
                            onChange={(e) => upd(r.id, { [c.key]: e.target.value })}
                            aria-label={`${label(c)} row ${k + 1}`}
                          />
                        )}
                      </td>
                    ),
                  )}
                  <td className="whitespace-nowrap px-1 text-right">
                    <button className="btn-ghost !p-0.5" onClick={() => move(k, -1)} disabled={k === 0} aria-label="Move up">
                      <ArrowUp size={13} />
                    </button>
                    <button className="btn-ghost !p-0.5" onClick={() => move(k, 1)} disabled={k === rows.length - 1} aria-label="Move down">
                      <ArrowDown size={13} />
                    </button>
                    <button className="btn-ghost !p-0.5" onClick={() => setRows((rs) => [...rs.slice(0, k + 1), { ...r, id: Math.random().toString(36).slice(2, 10), tag: undefined }, ...rs.slice(k + 1)])} aria-label="Duplicate">
                      <Copy size={13} />
                    </button>
                    <button className="btn-ghost !p-0.5 hover:!text-red-400" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))} aria-label="Delete">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-3 py-2 text-[11px] text-slate-500">
          Specified = consultant duty; Proposed = selected pump duty point. Import fills system, configuration, specified (parsed from “Specified duty”) and proposed flow/head from the calculators.
        </p>
      </Card>
    </div>
  );
}
