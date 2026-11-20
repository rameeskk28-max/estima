import { useEffect, useRef, useState } from 'react';
import { RotateCcw, Menu, X, Sun, Moon, LogOut, ChevronDown, ChevronRight, Home as HomeIcon, ArrowRight } from 'lucide-react';
import { StoreProvider, useStore } from './store.jsx';
import { BoosterCalc, TransferCalc, SumpCalc, VesselCalc, ChwCalc } from './modules/calculators/Calculators.jsx';
import { SubmittalBuilder } from './modules/submittal/SubmittalBuilder.jsx';
import { PumpScheduleTab } from './modules/schedule/PumpScheduleTab.jsx';
import { LiteratureTab } from './modules/literature/LiteratureTab.jsx';
import { RepliesTab } from './modules/replies/RepliesTab.jsx';
import { Home, FOLDERS, CALC_ITEMS, useReveal } from './modules/home/Home.jsx';
import { TOOL_ITEMS, ToolPage, ToolsFolder } from './modules/tools/ToolsTab.jsx';
import { QUOTE_ITEMS, QuoteGenerator, DocumentLibrary } from './modules/quote/QuoteTab.jsx';
import { ComplianceTab } from './modules/quote/ComplianceTab.jsx';
import { DrawingTab } from './modules/drawing/DrawingTab.jsx';

const SUB = {
  calc: { items: CALC_ITEMS, short: (c) => c.label.replace(' Pump Set', '').replace('Sump / Sewage', 'Sump') },
  tools: { items: TOOL_ITEMS, short: (c) => c.label },
  quote: { items: QUOTE_ITEMS, short: (c) => c.label },
};
import { Toast } from './components/ui.jsx';
import { BRAND } from './brand.js';

const CALC_PAGES = { booster: BoosterCalc, transfer: TransferCalc, sump: SumpCalc, vessel: VesselCalc, chw: ChwCalc, drawing: DrawingTab };
const LEGACY = { booster: 'calc/booster', transfer: 'calc/transfer', sump: 'calc/sump', vessel: 'calc/vessel', chw: 'calc/chw' };

function parseRoute() {
  let r = window.location.hash.replace(/^#\/?/, '');
  if (LEGACY[r]) r = LEGACY[r];
  const [folder, item] = r.split('/');
  if (folder === 'calc') return { folder: 'calc', item: CALC_PAGES[item] ? item : null };
  if (folder === 'tools') return { folder: 'tools', item: TOOL_ITEMS.some((t) => t.key === item) ? item : null };
  if (folder === 'quote') return { folder: 'quote', item: ['library', 'compliance'].includes(item) ? item : 'generate' };
  if (['schedule', 'literature', 'submittal', 'replies'].includes(folder)) return { folder, item: null };
  return { folder: 'home', item: null };
}

function Shell() {
  const [route, setRoute] = useState(parseRoute);
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { toast, theme, setTheme, cloud, cloudSignOut } = useStore();

  useEffect(() => {
    const h = () => setRoute(parseRoute());
    window.addEventListener('hashchange', h);
    const s = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', s, { passive: true });
    return () => {
      window.removeEventListener('hashchange', h);
      window.removeEventListener('scroll', s);
    };
  }, []);

  const go = (r) => {
    window.location.hash = r ? `/${r}` : '/';
    setMenu(false);
    window.scrollTo({ top: 0 });
  };

  const light = theme === 'light';
  const key = `${route.folder}/${route.item || ''}`;

  return (
    <div className={`bg-grid-pattern relative min-h-screen bg-ink-900 text-slate-200 ${light ? 'theme-light' : ''}`}>
      {/* ambient glow orbs */}
      <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden" aria-hidden="true">
        <div className={`absolute -left-40 -top-40 h-[520px] w-[520px] animate-pulse-glow rounded-full blur-[130px] ${light ? 'bg-brand-500/15' : 'bg-brand-600/20'}`} />
        <div className={`absolute -right-40 top-1/3 h-[480px] w-[480px] animate-pulse-glow rounded-full blur-[130px] ${light ? 'bg-navy-500/10' : 'bg-navy-500/15'}`} style={{ animationDelay: '2s' }} />
      </div>

      <header className={`no-print sticky top-0 z-40 transition-all duration-300 ${scrolled || menu ? 'nav-glass border-b border-line' : 'border-b border-transparent'}`}>
        <div className="mx-auto flex h-[72px] max-w-[1500px] items-center justify-between gap-4 px-4 sm:px-6">
          <button onClick={() => go('')} className="group flex items-center gap-3" aria-label="Home">
            <span className="rounded-xl bg-white px-2.5 py-1.5 shadow-lg shadow-brand-500/10 transition-transform group-hover:scale-[1.03]">
              <img src={BRAND.logoUrl} alt={BRAND.legalName} className="h-7 w-auto" />
            </span>
            <span className="hidden font-display text-sm font-bold leading-tight tracking-tight text-slate-50 2xl:block">
              Pump Engineering
              <br />
              <span className="text-brand-400">Suite</span>
            </span>
          </button>

          <nav className="hidden items-center gap-0.5 text-sm font-medium xl:flex">
            <NavLink active={route.folder === 'home'} onClick={() => go('')}>
              Home
            </NavLink>
            {FOLDERS.map((f) =>
              SUB[f.key] ? (
                <DropMenu key={f.key} folder={f} active={route.folder === f.key} go={go} />
              ) : (
                <NavLink key={f.key} active={route.folder === f.key} onClick={() => go(f.route)}>
                  {f.nav || f.label}
                </NavLink>
              ),
            )}
          </nav>

          <div className="flex items-center gap-2">
            <button onClick={() => setTheme(light ? 'dark' : 'light')} className="glass-pill flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 transition hover:text-slate-50" title={light ? 'Switch to dark theme' : 'Switch to light theme'} aria-label="Toggle theme">
              {light ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            {cloud.user && (
              <button onClick={() => confirm('Sign out of the Pump Engineering Suite?') && cloudSignOut()} className="glass-pill flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm text-slate-300 transition hover:text-slate-50" title="Sign out" aria-label="Sign out">
                <LogOut size={16} /> <span className="hidden md:inline">Sign out</span>
              </button>
            )}
            <button onClick={() => go('submittal')} className="btn-primary hidden !px-5 !py-2.5 sm:inline-flex">
              Compile Submittal
            </button>
            <button onClick={() => setMenu((m) => !m)} className="glass-pill flex h-10 w-10 items-center justify-center rounded-xl text-slate-200 xl:hidden" aria-label="Toggle menu">
              {menu ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {menu && (
          <div className="border-t border-line px-5 py-5 xl:hidden">
            <button onClick={() => go('')} className="block py-1.5 text-base font-medium text-slate-200">
              Home
            </button>
            {FOLDERS.map((f) => (
              <div key={f.key} className="py-1.5">
                <button onClick={() => go(f.key)} className="flex items-center gap-2 text-base font-medium text-slate-200">
                  <f.icon size={16} className="text-brand-400" /> {f.label}
                </button>
                {SUB[f.key] && (
                  <div className="ml-6 mt-1 space-y-1 border-l border-line pl-3">
                    {SUB[f.key].items.map((c) => (
                      <button key={c.key} onClick={() => go(`${f.key}/${c.key}`)} className="block text-sm text-slate-400 hover:text-slate-50">
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <button onClick={() => go('submittal')} className="btn-primary mt-4 w-full">
              Compile Submittal
            </button>
          </div>
        )}
      </header>

      <main className="relative mx-auto max-w-[1500px] px-4 pb-10 sm:px-6">
        <div key={key} className="page-enter">
          {route.folder === 'home' ? <Home go={go} /> : <FolderPage route={route} go={go} />}
        </div>
      </main>

      <Footer go={go} />
      <Toast toast={toast} />
    </div>
  );
}

function NavLink({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={`rounded-xl px-3.5 py-2 transition ${active ? 'bg-brand-500/15 text-brand-400' : 'text-slate-300 hover:text-slate-50'}`}>
      {children}
    </button>
  );
}

function DropMenu({ folder, active, go }) {
  const items = SUB[folder.key].items;
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={ref} className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button onClick={() => setOpen((o) => !o)} className={`flex items-center gap-1 rounded-xl px-3.5 py-2 transition ${active ? 'bg-brand-500/15 text-brand-400' : 'text-slate-300 hover:text-slate-50'}`} aria-expanded={open}>
        {folder.nav || folder.label} <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 pt-2">
          <div className="card w-80 rounded-2xl p-2" style={{ background: 'var(--menu-bg, var(--glass-bg))' }}>
            {items.map((c) => (
              <button
                key={c.key}
                onClick={() => {
                  setOpen(false);
                  go(`${folder.key}/${c.key}`);
                }}
                className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-brand-500/10"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
                  <c.icon size={16} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-50">{c.label}</span>
                  <span className="block text-xs text-slate-400">{c.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Folder header (breadcrumb + tabs) and page content. */
function FolderPage({ route, go }) {
  const folder = FOLDERS.find((f) => f.key === route.folder);
  const sub = SUB[route.folder];
  const calcItem = sub?.items.find((c) => c.key === route.item);
  const Page =
    route.folder === 'calc'
      ? CALC_PAGES[route.item]
      : route.folder === 'tools' || route.folder === 'quote'
        ? null
        : { schedule: PumpScheduleTab, literature: LiteratureTab, submittal: SubmittalBuilder, replies: RepliesTab }[route.folder];
  return (
    <div className="pt-6">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-4">
        <nav className="flex items-center gap-1.5 text-xs text-slate-400" aria-label="Breadcrumb">
          <button onClick={() => go('')} className="flex items-center gap-1 hover:text-slate-50">
            <HomeIcon size={13} /> Home
          </button>
          <ChevronRight size={13} />
          <button onClick={() => go(folder.key)} className={calcItem ? 'hover:text-slate-50' : 'font-semibold text-slate-200'}>
            {folder.label}
          </button>
          {calcItem && (
            <>
              <ChevronRight size={13} />
              <span className="font-semibold text-slate-200">{calcItem.label}</span>
            </>
          )}
        </nav>
        {sub && (
          <div className="card inline-flex flex-wrap gap-1 rounded-2xl p-1.5" role="tablist">
            {sub.items.map((c) => (
              <button
                key={c.key}
                role="tab"
                aria-selected={route.item === c.key}
                onClick={() => go(`${route.folder}/${c.key}`)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition sm:text-sm ${route.item === c.key ? 'bg-brand-600 text-white shadow-md shadow-brand-600/25' : 'text-slate-400 hover:text-slate-50'}`}
              >
                <c.icon size={14} /> {sub.short(c)}
              </button>
            ))}
          </div>
        )}
      </div>
      {route.folder === 'quote' ? route.item === 'library' ? <DocumentLibrary /> : route.item === 'compliance' ? <ComplianceTab /> : <QuoteGenerator go={go} /> : route.folder === 'tools' ? route.item ? <ToolPage key={route.item} toolKey={route.item} /> : <ToolsFolder go={go} /> : Page ? <Page /> : <CalcFolder go={go} />}
    </div>
  );
}

function CalcFolder({ go }) {
  const { duties } = useStore();
  const ref = useReveal();
  return (
    <div ref={ref}>
      <div className="reveal-up mb-8 max-w-3xl">
        <span className="font-mono text-xs uppercase tracking-widest text-brand-400">Folder 02</span>
        <h1 className="mt-2 font-display text-3xl font-bold text-slate-50 sm:text-4xl">Hydraulic Calculations</h1>
        <p className="mt-3 text-slate-400">Each calculator follows the Greenland calculation-sheet format – project information, flow, head-loss table and final head – with a reference for every step.</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {CALC_ITEMS.map((c, i) => {
          const saved = duties.filter((d) => d.calcType && d.calcType.toLowerCase().includes(c.label.split(' ')[0].toLowerCase())).length;
          return (
            <button key={c.key} onClick={() => go(`calc/${c.key}`)} className="card reveal-up group rounded-3xl p-6 text-left transition hover:border-brand-500/50" style={{ transitionDelay: `${i * 70}ms` }}>
              <div className="mb-5 flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-brand-500/25 bg-brand-500/15 text-brand-400">
                  <c.icon size={20} />
                </span>
                {saved > 0 && <span className="glass-pill rounded-full px-2.5 py-0.5 text-xs text-slate-300">{saved} saved</span>}
              </div>
              <h3 className="font-display text-xl font-bold text-slate-50">{c.label}</h3>
              <p className="mt-2 text-sm text-slate-400">{c.desc}</p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-400">
                Open calculator <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const LinkedInIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z" />
  </svg>
);

/** "Designed & developed by Ramees" – the name links to LinkedIn. */
export function DeveloperCredit({ className = '' }) {
  const d = BRAND.developer;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-400 ${className}`}>
      {d.label}
      <a href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-slate-50 underline decoration-brand-500/60 underline-offset-4 transition hover:text-[#4c9be8] hover:decoration-[#4c9be8]" title="Ramees on LinkedIn">
        {d.name}
        <span className="flex h-4 w-4 items-center justify-center rounded-[3px] bg-[#0a66c2] text-white">
          <LinkedInIcon size={10} />
        </span>
      </a>
    </span>
  );
}

function Footer({ go }) {
  const { resetAll, notify } = useStore();
  return (
    <footer className="no-print relative z-10 border-t border-line py-10">
      <div className="mx-auto flex max-w-[1500px] flex-col items-center justify-between gap-5 px-4 sm:px-6 md:flex-row">
        <div className="flex flex-col items-center gap-1 md:items-start">
          <span className="font-display text-lg font-bold text-slate-50">
            GREEN<span className="text-brand-400">LAND</span>
            <span className="text-brand-400">.</span>
          </span>
          <span className="text-xs text-slate-500">
            © {new Date().getFullYear()} {BRAND.legalName}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-400">
          <button onClick={() => go('')} className="hover:text-slate-50">
            Home
          </button>
          {FOLDERS.map((f) => (
            <button key={f.key} onClick={() => go(f.key)} className="hover:text-slate-50">
              {f.label}
            </button>
          ))}
          <button
            className="flex items-center gap-1 hover:text-red-400"
            onClick={async () => {
              if (confirm('Clear ALL data (project header, saved duties, schedule, literature, index, uploaded files and calculator inputs)?')) {
                await resetAll();
                notify('Workspace cleared');
              }
            }}
          >
            <RotateCcw size={12} /> Reset workspace
          </button>
        </div>
        <DeveloperCredit />
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

