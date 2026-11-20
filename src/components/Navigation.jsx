import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, CornerDownLeft, X } from 'lucide-react';
import { NAV, groupOf, searchPages } from '../nav.js';

/** Top menu: Home · Design ▾ · Submittal ▾ · Replies */
export function MainNav({ route, go }) {
  const active = route.folder === 'home' ? 'home' : groupOf(route.folder);
  return (
    <nav className="hidden items-center gap-1 text-sm font-medium lg:flex" aria-label="Main">
      <TopLink active={active === 'home'} onClick={() => go('')}>
        Home
      </TopLink>
      {NAV.map((g) => (g.route ? <TopLink key={g.key} active={active === g.key} onClick={() => go(g.route)}>{g.label}</TopLink> : <MegaMenu key={g.key} group={g} active={active === g.key} go={go} />))}
    </nav>
  );
}

function TopLink({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={`rounded-xl px-4 py-2 transition ${active ? 'bg-brand-500/15 text-brand-400' : 'text-slate-300 hover:text-slate-50'}`}>
      {children}
    </button>
  );
}

function MegaMenu({ group, active, go }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const timer = useRef(null);
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const k = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => (document.removeEventListener('mousedown', h), document.removeEventListener('keydown', k));
  }, []);
  const cols = group.sections.length;
  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => (clearTimeout(timer.current), setOpen(true))}
      onMouseLeave={() => (timer.current = setTimeout(() => setOpen(false), 120))}
    >
      <button onClick={() => setOpen((o) => !o)} className={`flex items-center gap-1 rounded-xl px-4 py-2 transition ${active ? 'bg-brand-500/15 text-brand-400' : 'text-slate-300 hover:text-slate-50'}`} aria-expanded={open} aria-haspopup="true">
        {group.label} <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-1/2 top-full z-50 -translate-x-1/2 pt-2">
          <div className={`grid gap-1 rounded-2xl border border-line bg-ink-900 p-3 shadow-2xl shadow-black/40 ${cols >= 3 ? 'w-[860px] grid-cols-3' : 'w-[640px] grid-cols-2'}`}>
            {group.sections.map((s) => (
              <div key={s.title} className={s.items.length > 5 ? 'row-span-2' : ''}>
                <div className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{s.title}</div>
                {s.items.map((it) => (
                  <button
                    key={it.route}
                    onClick={() => {
                      setOpen(false);
                      go(it.route);
                    }}
                    className="flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-brand-500/10"
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
                      <it.icon size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-50">{it.label}</span>
                      <span className="block text-xs leading-snug text-slate-400">{it.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Phone / tablet menu – same groups, all pages listed. */
export function MobileNav({ go }) {
  return (
    <div className="space-y-4">
      <button onClick={() => go('')} className="block text-base font-semibold text-slate-100">
        Home
      </button>
      {NAV.map((g) => (
        <div key={g.key}>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-400">
            <g.icon size={14} /> {g.label}
          </div>
          <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
            {g.sections.flatMap((s) => s.items).map((it) => (
              <button key={it.route} onClick={() => go(it.route)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-slate-300 hover:bg-brand-500/10 hover:text-slate-50">
                <it.icon size={15} className="shrink-0 text-slate-500" /> {it.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Header button that opens the search. */
export function SearchButton({ onOpen, wide = false }) {
  const mac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
  return (
    <button onClick={onOpen} className={`glass-pill flex h-10 items-center gap-2 rounded-xl px-3 text-sm text-slate-400 transition hover:text-slate-100 ${wide ? 'w-full' : ''}`} aria-label="Search pages">
      <Search size={16} />
      <span className={wide ? '' : 'hidden xl:inline'}>Find a tool…</span>
      <kbd className={`ml-auto rounded-md border border-line px-1.5 py-0.5 text-[10px] text-slate-500 ${wide ? '' : 'hidden xl:inline'}`}>{mac ? '⌘' : 'Ctrl'} K</kbd>
    </button>
  );
}

/** Ctrl+K / ⌘K search across every page. */
export function CommandPalette({ open, onClose, go }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  const results = useMemo(() => searchPages(q), [q]);
  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);
  useEffect(() => setSel(0), [q]);
  if (!open) return null;
  const pick = (it) => {
    onClose();
    go(it.route);
  };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(results.length - 1, s + 1)));
    else if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(0, s - 1)));
    else if (e.key === 'Enter' && results[sel]) pick(results[sel]);
    else if (e.key === 'Escape') onClose();
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 p-4 pt-[12vh]" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label="Search">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-ink-900 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search size={18} className="text-slate-500" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search tools – e.g. booster, NPSH, compliance, drawing…" className="h-12 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500" />
          <button className="btn-ghost !p-1" onClick={onClose} aria-label="Close search">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[55vh] overflow-auto p-2">
          {!results.length && <p className="px-3 py-6 text-center text-sm text-slate-500">Nothing found for “{q}”.</p>}
          {results.map((it, i) => (
            <button key={it.route + i} onMouseEnter={() => setSel(i)} onClick={() => pick(it)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${i === sel ? 'bg-brand-500/15' : ''}`}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
                <it.icon size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-50">{it.label}</span>
                <span className="block truncate text-xs text-slate-400">{it.desc}</span>
              </span>
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-500">
                {it.group} · {it.section}
              </span>
              {i === sel && <CornerDownLeft size={14} className="shrink-0 text-brand-400" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
