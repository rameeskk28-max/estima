import { useEffect, useId, useState } from 'react';
import { CircleCheck, TriangleAlert, X } from 'lucide-react';
import { convertUnit } from '../lib/hydraulics.js';

export function Card({ title, icon: Icon, actions, children, className = '', bodyClass = 'p-4' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            {Icon && <Icon size={16} className="text-brand-400" />}
            {title}
          </h3>
          {actions && <div className="flex items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="lbl">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

/** Numeric input that keeps the user's raw text while typing. */
export function NumInput({ value, onChange, step = 'any', min, className = '', ...rest }) {
  const [text, setText] = useState(value ?? '');
  useEffect(() => {
    if (Number(text) !== Number(value) || text === '') setText(value ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      className={`field tabular-nums ${className}`}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        if (e.target.value === '' || Number.isFinite(Number(e.target.value))) onChange(e.target.value === '' ? '' : Number(e.target.value));
      }}
      {...rest}
    />
  );
}

export function NumField({ label, value, onChange, unit, hint, ...rest }) {
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <NumInput value={value} onChange={onChange} className={unit ? 'pr-12' : ''} {...rest} />
        {unit && <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-slate-500">{unit}</span>}
      </div>
    </Field>
  );
}

/** Value + unit selector with live conversion when the unit changes. */
export function UnitField({ label, value, onChange, table, hint, dp = 3 }) {
  const units = Object.keys(table);
  return (
    <Field label={label} hint={hint}>
      <div className="flex">
        <NumInput value={value.value} onChange={(v) => onChange({ ...value, value: v })} className="rounded-r-none" />
        <select
          className="field w-auto rounded-l-none border-l-0 bg-ink-800 text-xs"
          value={value.unit}
          onChange={(e) => {
            const to = e.target.value;
            const conv = convertUnit(value.value, value.unit, to, table);
            onChange({ value: typeof conv === 'number' ? Number(conv.toFixed(dp)) : conv, unit: to });
          }}
        >
          {units.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
      </div>
    </Field>
  );
}

export function TextField({ label, value, onChange, hint, className = '', ...rest }) {
  return (
    <Field label={label} hint={hint} className={className}>
      <input className="field" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />
    </Field>
  );
}

export function SelectField({ label, value, onChange, options, hint }) {
  return (
    <Field label={label} hint={hint}>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Kpi({ label, value, unit, sub, tone }) {
  const toneCls = tone === 'bad' ? 'border-red-500/50 bg-red-500/5' : tone === 'ok' ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-line bg-ink-800/60';
  return (
    <div className={`rounded-lg border p-3 ${toneCls}`}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-semibold tabular-nums text-white">{value}</span>
        <span className="text-sm text-brand-300">{unit}</span>
      </div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

export function CheckList({ checks }) {
  if (!checks?.length) return null;
  return (
    <ul className="space-y-1.5">
      {checks.map((c, i) => (
        <li key={i} className={`flex gap-2 rounded-md px-2.5 py-1.5 text-xs ${c.ok ? 'bg-emerald-500/10 text-emerald-200' : 'bg-amber-500/10 text-amber-200'}`}>
          {c.ok ? <CircleCheck size={14} className="mt-0.5 shrink-0" /> : <TriangleAlert size={14} className="mt-0.5 shrink-0" />}
          <span>{c.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function Modal({ open, onClose, title, children, wide, footer }) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/70 p-2 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby={id}>
      <div className={`flex w-full flex-col overflow-hidden rounded-xl border border-line bg-ink-900 ${wide ? 'max-w-[980px]' : 'max-w-xl'}`}>
        <header className="no-print flex items-center justify-between border-b border-line px-4 py-3">
          <h2 id={id} className="text-sm font-semibold text-white">
            {title}
          </h2>
          <div className="flex items-center gap-2">
            {footer}
            <button className="btn-ghost" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`no-print fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm shadow-xl ${toast.tone === 'bad' ? 'border-red-500/40 bg-red-950 text-red-100' : 'border-emerald-500/40 bg-emerald-950 text-emerald-100'}`}>
      {toast.tone === 'bad' ? <TriangleAlert size={16} /> : <CircleCheck size={16} />}
      {toast.msg}
    </div>
  );
}

export function downloadBytes(bytes, filename, type = 'application/pdf') {
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const safeName = (s) => String(s || 'document').replace(/[^\w\-. ]+/g, '_').replace(/\s+/g, '_').slice(0, 80);
