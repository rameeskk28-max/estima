import { useEffect, useState } from 'react';
import { Building2, ArrowUpDown, Waves, Cylinder, Snowflake, Package, RotateCcw, Menu, X, TableProperties, Sun, Moon, BookOpen } from 'lucide-react';
import { StoreProvider, useStore } from './store.jsx';
import { BoosterCalc, TransferCalc, SumpCalc, VesselCalc, ChwCalc } from './modules/calculators/Calculators.jsx';
import { SubmittalBuilder } from './modules/submittal/SubmittalBuilder.jsx';
import { PumpScheduleTab } from './modules/schedule/PumpScheduleTab.jsx';
import { LiteratureTab } from './modules/literature/LiteratureTab.jsx';
import { Toast } from './components/ui.jsx';
import { BRAND } from './brand.js';

const NAV = [
  { group: 'Module 1 · Hydraulic Calculators' },
  { key: 'booster', label: 'Booster Pump Set', icon: Building2, el: BoosterCalc },
  { key: 'transfer', label: 'Transfer Pump', icon: ArrowUpDown, el: TransferCalc },
  { key: 'sump', label: 'Sump / Sewage Pump', icon: Waves, el: SumpCalc },
  { key: 'vessel', label: 'Pressure Vessel', icon: Cylinder, el: VesselCalc },
  { key: 'chw', label: 'Chilled Water Pump', icon: Snowflake, el: ChwCalc },
  { group: 'Module 2 · Submittal' },
  { key: 'schedule', label: 'Pump Schedule', icon: TableProperties, el: PumpScheduleTab },
  { key: 'literature', label: 'Technical Literature', icon: BookOpen, el: LiteratureTab },
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
  const { toast, duties, project, resetAll, notify, theme, setTheme, schedule, literature } = useStore();
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
      <aside style={{ background: 'linear-gradient(180deg, #153963 0%, #0d2440 45%, #06111f 100%)' }} className={`no-print fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-line transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
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
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-3">
          {NAV.map((n, i) =>
            n.group ? (
              <div key={i} className="px-2 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-widest text-slate-500 first:pt-1">
                {n.group}
              </div>
            ) : (
              <button
                key={n.key}
                onClick={() => go(n.key)}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition ${view === n.key ? 'bg-brand-500 font-semibold text-white shadow-lg shadow-brand-500/25' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
              >
                <n.icon size={16} />
                {n.label}
                {n.key === 'submittal' && duties.length > 0 && <span className="ml-auto rounded-full bg-white/20 px-1.5 text-[10px] font-semibold text-white">{duties.length}</span>}
                {n.key === 'literature' && literature.length > 0 && <span className="ml-auto rounded-full bg-white/20 px-1.5 text-[10px] font-semibold text-white">{literature.length}</span>}
                {n.key === 'schedule' && schedule.rows.length > 0 && <span className="ml-auto rounded-full bg-white/20 px-1.5 text-[10px] font-semibold text-white">{schedule.rows.length}</span>}
              </button>
            ),
          )}
        </nav>
        <div className="shrink-0 border-t border-white/10 p-3 text-[11px] text-slate-400">
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-black/25 p-1" role="radiogroup" aria-label="Theme">
            {[
              ['light', 'Light', Sun],
              ['dark', 'Dark', Moon],
            ].map(([k, lbl, Ic]) => (
              <button key={k} role="radio" aria-checked={theme === k} onClick={() => setTheme(k)} className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition ${theme === k ? 'bg-white text-ink-600 shadow' : 'text-slate-300 hover:text-white'}`}>
                <Ic size={13} /> {lbl}
              </button>
            ))}
          </div>
          <div className="truncate" title={project.projectName}>
            {project.projectName || 'No project set'}
          </div>
          <button
            className="mt-2 flex items-center gap-1.5 text-slate-400 hover:text-red-300"
            onClick={async () => {
              if (confirm('Clear ALL data (project header, saved duties, index, uploaded files and calculator inputs)?')) {
                await resetAll();
                notify('Workspace cleared');
              }
            }}
          >
            <RotateCcw size={12} /> Reset workspace
          </button>
          <DeveloperCredit className="mt-3 border-t border-white/10 pt-3" />
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setOpen(false)} />}

      <div className={`min-h-screen min-w-0 flex-1 bg-ink-900 text-slate-200 ${theme === 'light' ? 'theme-light' : ''}`}>
        <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-ink-900/90 px-4 py-2.5 backdrop-blur lg:hidden">
          <button className="btn-ghost !p-1" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <img src={BRAND.markUrl} alt="" className="h-7 w-7 rounded" />
          <span className="text-sm font-bold tracking-wide text-slate-50">
            GREEN<span className="text-brand-400">LAND</span> <span className="font-normal text-slate-400">Pump Suite</span>
          </span>
        </header>
        <main className="mx-auto max-w-[1500px] p-4 sm:p-6">
          <Page />
          <footer className="no-print mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-xs text-slate-500">
            <span>© {new Date().getFullYear()} {BRAND.legalName}</span>
            <DeveloperCredit light />
          </footer>
        </main>
      </div>
      <Toast toast={toast} />
    </div>
  );
}

const LinkedInIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z" />
  </svg>
);

/** "Designed & developed by" credit linking to the developer's LinkedIn profile. */
function DeveloperCredit({ className = '', light }) {
  const d = BRAND.developer;
  return (
    <a
      href={d.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group flex items-center gap-2 text-[11px] transition ${light ? 'text-slate-500 hover:text-[#0a66c2]' : 'text-slate-400 hover:text-white'} ${className}`}
      title="Developer's LinkedIn profile"
    >
      <span className="flex h-5 w-5 items-center justify-center rounded bg-[#0a66c2] text-white">
        <LinkedInIcon size={12} />
      </span>
      <span>
        {d.label} <span className="font-semibold underline-offset-2 group-hover:underline">{d.handle}</span>
      </span>
    </a>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
