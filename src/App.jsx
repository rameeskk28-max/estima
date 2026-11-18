import { useEffect, useState } from 'react';
import { Building2, ArrowUpDown, Waves, Cylinder, Snowflake, Package, RotateCcw, Menu, X, LogOut } from 'lucide-react';
import { StoreProvider, useStore } from './store.jsx';
import { BoosterCalc, TransferCalc, SumpCalc, VesselCalc, ChwCalc } from './modules/calculators/Calculators.jsx';
import { SubmittalBuilder } from './modules/submittal/SubmittalBuilder.jsx';
import { Toast } from './components/ui.jsx';
import { BRAND } from './brand.js';

const NAV = [
  { group: 'Module 1 · Hydraulic Calculators' },
  { key: 'booster', label: 'Booster Pump Set', icon: Building2, el: BoosterCalc },
  { key: 'transfer', label: 'Transfer Pump', icon: ArrowUpDown, el: TransferCalc },
  { key: 'sump', label: 'Sump / Drainage Pump', icon: Waves, el: SumpCalc },
  { key: 'vessel', label: 'Pressure Vessel', icon: Cylinder, el: VesselCalc },
  { key: 'chw', label: 'Chilled Water Pump', icon: Snowflake, el: ChwCalc },
  { group: 'Module 2 · Submittal' },
  { key: 'submittal', label: 'Submittal Builder', icon: Package, el: SubmittalBuilder },
];
const PAGES = NAV.filter((n) => n.key);
const fromHash = () => {
  const k = window.location.hash.replace(/^#\/?/, '');
  return PAGES.some((p) => p.key === k) ? k : 'booster';
};

function Shell() {
  const [view, setView] = useState(fromHash);
  const [open, setOpen] = useState(false);
  const { toast, duties, project, setProject, resetAll, notify } = useStore();
  const user = useSessionUser();
  useEffect(() => {
    if (user?.name) setProject((p) => (p.preparedBy ? p : { ...p, preparedBy: user.name }));
  }, [user, setProject]);
  useEffect(() => {
    const h = () => setView(fromHash());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  const go = (k) => {
    window.location.hash = `/${k}`;
    setOpen(false);
    window.scrollTo({ top: 0 });
  };
  const Page = PAGES.find((p) => p.key === view).el;

  return (
    <div className="flex min-h-full">
      <aside className={`no-print fixed inset-y-0 left-0 z-40 w-64 shrink-0 border-r border-line bg-ink-950 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="relative border-b border-line px-4 py-4">
          <div className="rounded-lg bg-white px-3 py-2.5 shadow-inner">
            <img src={BRAND.logoUrl} alt={BRAND.legalName} className="h-auto w-full" />
          </div>
          <div className="mt-2.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-400">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> Pump Engineering Suite
          </div>
          <button className="btn-ghost absolute right-1 top-1 !p-1 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>
        <nav className="space-y-0.5 p-3">
          {NAV.map((n, i) =>
            n.group ? (
              <div key={i} className="px-2 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-widest text-slate-500 first:pt-1">
                {n.group}
              </div>
            ) : (
              <button
                key={n.key}
                onClick={() => go(n.key)}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition ${view === n.key ? 'bg-brand-600/15 font-medium text-brand-200 ring-1 ring-brand-500/30' : 'text-slate-400 hover:bg-ink-800 hover:text-slate-100'}`}
              >
                <n.icon size={16} />
                {n.label}
                {n.key === 'submittal' && duties.length > 0 && <span className="ml-auto rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold text-white">{duties.length}</span>}
              </button>
            ),
          )}
        </nav>
        <div className="absolute inset-x-0 bottom-0 border-t border-line p-3 text-[11px] text-slate-500">
          {user && (
            <div className="mb-3 flex items-center gap-2.5 rounded-lg border border-line bg-ink-850 p-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{initials(user.name)}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-slate-100" title={user.name}>
                  {user.name}
                </div>
                <div className="truncate text-[10px] text-slate-500">@{user.username}</div>
              </div>
              <a href="/api/logout" className="btn-ghost !p-1.5 hover:!text-red-300" title="Sign out" aria-label="Sign out">
                <LogOut size={15} />
              </a>
            </div>
          )}
          <div className="truncate" title={project.projectName}>
            {project.projectName || 'No project set'}
          </div>
          <button
            className="mt-2 flex items-center gap-1.5 text-slate-500 hover:text-red-300"
            onClick={async () => {
              if (confirm('Clear ALL data (project header, saved duties, index, uploaded files and calculator inputs)?')) {
                await resetAll();
                notify('Workspace cleared');
              }
            }}
          >
            <RotateCcw size={12} /> Reset workspace
          </button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-ink-900/90 px-4 py-2.5 backdrop-blur lg:hidden">
          <button className="btn-ghost !p-1" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <img src={BRAND.markUrl} alt="" className="h-7 w-7 rounded" />
          <span className="text-sm font-bold tracking-wide text-white">
            GREEN<span className="text-brand-400">LAND</span> <span className="font-normal text-slate-400">Pump Suite</span>
          </span>
        </header>
        <main className="mx-auto max-w-[1500px] p-4 sm:p-6">
          <Page />
        </main>
      </div>
      <Toast toast={toast} />
    </div>
  );
}

const initials = (n) =>
  String(n || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

/** Signed-in user from the Netlify edge auth (null when running without it, e.g. `npm run dev`). */
function useSessionUser() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch('/api/me', { credentials: 'same-origin', headers: { accept: 'application/json' } });
        const isJson = (r.headers.get('content-type') || '').includes('application/json');
        if (!isJson) return; // local dev – no auth layer
        if (r.status === 401) {
          window.location.href = `/login/?next=${encodeURIComponent(window.location.pathname + window.location.hash)}`;
          return;
        }
        const d = await r.json();
        if (alive && d.user) setUser(d.user);
      } catch {
        /* offline – keep working */
      }
    };
    check();
    const t = setInterval(check, 5 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return user;
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
