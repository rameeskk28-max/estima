import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Calculator, TableProperties, BookOpen, Package, MessageSquareReply, Wrench, FileInput, Check, FileCheck2, Gauge, Route, Search, ClipboardList } from 'lucide-react';
import { NAV } from '../../nav.js';
import { useStore } from '../../store.jsx';
import { CALCULATORS } from '../../lib/calcs/index.js';
import { fmtN } from '../../lib/ipc.js';
import { PumpScene } from '../../components/PumpScene.jsx';
import { CALC_ITEMS } from './items.js';

export { CALC_ITEMS };

export const FOLDERS = [
  {
    key: 'quote',
    route: 'quote',
    label: 'Quote to Submittal',
    nav: 'Quote',
    icon: FileInput,
    tone: 'brand',
    desc: 'Upload a quotation – pumps are read automatically and the whole submittal is generated with your saved company documents, datasheets and drawings.',
    items: [
      { label: 'Read quotation PDF', route: 'quote/generate' },
      { label: 'Document Library (save once)', route: 'quote/library' },
      { label: 'Generate full submittal', route: 'quote/generate' },
    ],
  },
  {
    key: 'calc',
    route: 'calc',
    label: 'Hydraulic Calculations',
    nav: 'Calculations',
    icon: Calculator,
    tone: 'brand',
    desc: 'Five calculators in the Greenland calculation-sheet format – every step with its reference, ready as an A4 sheet.',
    items: CALC_ITEMS.map((c) => ({ label: c.label, route: `calc/${c.key}` })),
  },
  {
    key: 'schedule',
    route: 'schedule',
    label: 'Pump Schedule',
    nav: 'Schedule',
    icon: TableProperties,
    tone: 'navy',
    desc: 'SOM-format pump schedule – specified vs proposed duty, model, MOC, motor and starter data.',
    items: [{ label: 'Edit schedule', route: 'schedule' }, { label: 'Import from calculators', route: 'schedule' }, { label: 'A4 PDF & Excel export', route: 'schedule' }],
  },
  {
    key: 'literature',
    route: 'literature',
    label: 'Technical Literature',
    nav: 'Literature',
    icon: BookOpen,
    tone: 'brand',
    desc: 'Transfer, booster (with / without VFD), circulation and sump literature with datasheet & drawing uploads.',
    items: [{ label: 'Transfer / Booster / Sump', route: 'literature' }, { label: 'Datasheet & drawing uploads', route: 'literature' }, { label: 'Same layout as calc sheets', route: 'literature' }],
  },
  {
    key: 'submittal',
    route: 'submittal',
    label: 'Submittal Package',
    nav: 'Submittal',
    icon: Package,
    tone: 'navy',
    desc: 'Project header, 14-point UAE index, PDF uploads and one-click compile to a single A4 submittal.',
    items: [{ label: 'Project header & index', route: 'submittal' }, { label: 'Attach certificates & profiles', route: 'submittal' }, { label: 'Compile final A4 PDF', route: 'submittal' }],
  },
  {
    key: 'replies',
    route: 'replies',
    label: 'Comment Replies',
    nav: 'Replies',
    icon: MessageSquareReply,
    tone: 'brand',
    desc: 'Reply to consultant comments per submittal revision – status, annexure references, annexure PDFs and the previous submittal in one A4 PDF.',
    items: [{ label: 'Comments, replies & status', route: 'replies' }, { label: 'Annexures & previous submittal', route: 'replies' }, { label: 'Combined A4 reply PDF', route: 'replies' }],
  },
  {
    key: 'orders',
    route: 'orders',
    label: 'Order Processing',
    nav: 'Orders',
    icon: ClipboardList,
    tone: 'brand',
    desc: 'Order file per job – final quote, LPO, costing & margin, item codes and pump datasheets compiled into one PDF.',
    items: [{ label: 'Costing & margin', route: 'orders' }, { label: 'Item codes & datasheets', route: 'orders' }, { label: 'Compiled order PDF', route: 'orders' }],
  },
  {
    key: 'tools',
    route: 'tools',
    label: 'Engineering Tools',
    nav: 'Tools',
    icon: Wrench,
    tone: 'navy',
    desc: 'Quick pump & piping calculators in metric or imperial units – each prints as an A4 sheet.',
    items: [
      { label: 'Unit converter & velocity', route: 'tools/converter' },
      { label: 'Pipe sizer & friction loss', route: 'tools/sizer' },
      { label: 'Pump power & affinity laws', route: 'tools/power' },
      { label: 'NPSH, tank & sump', route: 'tools/npsh' },
    ],
  },
];

/** Adds .is-visible to .reveal-up children when they scroll into view. */
export function useReveal(dep) {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = root.querySelectorAll('.reveal-up');
    if (!('IntersectionObserver' in window)) {
      els.forEach((e) => e.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add('is-visible');
            io.unobserve(en.target);
          }
        }),
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [dep]);
  return ref;
}

const tilt = {
  onMouseMove: (e) => {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    const card = e.currentTarget;
    const r = card.getBoundingClientRect();
    const rx = ((e.clientY - r.top - r.height / 2) / (r.height / 2)) * -6;
    const ry = ((e.clientX - r.left - r.width / 2) / (r.width / 2)) * 6;
    card.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.02,1.02,1.02)`;
  },
  onMouseLeave: (e) => {
    e.currentTarget.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale3d(1,1,1)';
  },
};

function KineticWord() {
  const words = ['in minutes.', 'to IPC 2009.', 'consultant-ready.', 'in one place.'];
  const [i, setI] = useState(0);
  const [show, setShow] = useState(true);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => {
      setShow(false);
      setTimeout(() => {
        setI((x) => (x + 1) % words.length);
        setShow(true);
      }, 260);
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <span className="inline-block border-b-2 border-brand-500 pb-1 text-slate-50 transition-all duration-300" style={{ opacity: show ? 1 : 0, transform: show ? 'none' : 'translateY(8px)' }}>
      {words[i]}
    </span>
  );
}

function Counter({ to, suffix, tone = 'text-brand-400' }) {
  const ref = useRef(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([en]) => {
        if (!en.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const step = (now) => {
          const p = Math.min((now - start) / 1500, 1);
          setV(Math.floor((1 - Math.pow(1 - p, 3)) * to));
          if (p < 1) requestAnimationFrame(step);
          else setV(to);
        };
        requestAnimationFrame(step);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to]);
  return (
    <div ref={ref} className="font-display text-4xl font-bold text-slate-50 sm:text-5xl">
      {v}
      <span className={tone}>{suffix}</span>
    </div>
  );
}

export function Home({ go }) {
  const { duties, schedule, literature, entries, replies, library, project, compliance, drawing, orders } = useStore();
  const openSearch = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
  const clauses = compliance.rows.filter((r) => r.type === 'clause').length;
  const progress = [
    { label: 'Calculations saved', n: duties.length, route: 'calc/booster', icon: Calculator },
    { label: 'Pumps in schedule', n: schedule.rows.length, route: 'schedule', icon: TableProperties },
    { label: 'Literature documents', n: literature.length, route: 'literature', icon: BookOpen },
    { label: 'Compliance clauses', n: clauses, route: 'quote/compliance', icon: FileCheck2 },
    { label: 'Submittal sections', n: entries.filter((e) => e.include !== false).length, route: 'submittal', icon: Package },
    { label: 'Comment replies', n: replies.length, route: 'replies', icon: MessageSquareReply },
    { label: 'Orders', n: orders.length, route: 'orders', icon: ClipboardList },
  ];
  const start = [
    {
      title: 'Start from a quotation',
      text: 'Upload the quotation PDF – pump items, schedule, literature and the full submittal index are generated for you.',
      icon: FileInput,
      cta: 'Quote → Submittal',
      route: 'quote/generate',
      tone: 'from-brand-500/25',
    },
    {
      title: 'Size a pump set',
      text: 'Booster, transfer, sump or chilled water – calculation sheets in the Greenland format with references on every step.',
      icon: Calculator,
      cta: 'Open calculators',
      route: 'calc/booster',
      chips: CALC_ITEMS.filter((c) => c.key !== 'drawing'),
      tone: 'from-navy-500/25',
    },
    {
      title: 'Calculate from drawings',
      text: 'Upload riser and floor plans (DWG or CAD PDF) – fixtures, pipe routes and fittings are read for the head calculation.',
      icon: Route,
      cta: 'From Drawing',
      route: 'calc/drawing',
      tone: 'from-emerald-500/20',
    },
  ];
  return (
    <div className="space-y-8 pt-6">
      {/* greeting + search */}
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-400">Greenland · Pump Engineering Suite</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">What would you like to do?</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">Calculations, pump schedule, technical literature, compliance and the compiled A4 submittal – in one place.</p>
        </div>
        <button onClick={openSearch} className="card flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm text-slate-400 transition hover:border-brand-500/50 lg:w-96">
          <Search size={18} className="text-brand-400" />
          <span className="flex-1">Find a tool – booster, NPSH, compliance…</span>
          <kbd className="rounded-md border border-line px-1.5 py-0.5 text-[10px] text-slate-500">Ctrl K</kbd>
        </button>
      </section>

      {/* start here */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Start here</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {start.map((c) => (
            <div key={c.title} className={`card group relative flex flex-col overflow-hidden rounded-3xl bg-gradient-to-br ${c.tone} to-transparent p-6`}>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-400">
                <c.icon size={22} />
              </span>
              <h3 className="mt-4 font-display text-lg font-bold text-slate-50">{c.title}</h3>
              <p className="mt-1 flex-1 text-sm leading-relaxed text-slate-400">{c.text}</p>
              {c.chips && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.chips.map((k) => (
                    <button key={k.key} onClick={() => go(`calc/${k.key}`)} className="glass-pill rounded-full px-2.5 py-1 text-xs text-slate-300 transition hover:text-brand-400">
                      {k.label.replace(' Pump Set', '').replace('Sump / Sewage', 'Sump')}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => go(c.route)} className="btn-primary mt-4 self-start">
                {c.cta} <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* every tool */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">All tools</h2>
          <div className="grid items-start gap-4 md:grid-cols-2 2xl:grid-cols-4">
            {NAV.map((g) => (
              <div key={g.key} className="card rounded-3xl p-4">
                <div className="mb-2 flex items-center gap-2 px-1">
                  <g.icon size={16} className="text-brand-400" />
                  <span className="font-display font-bold text-slate-50">{g.label}</span>
                </div>
                <p className="mb-3 px-1 text-xs text-slate-500">{g.desc}</p>
                {g.sections.map((s) => (
                  <div key={s.title} className="mb-2">
                    <div className="px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{s.title}</div>
                    {s.items.map((it) => (
                      <button key={it.route} onClick={() => go(it.route)} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-sm text-slate-300 transition hover:bg-brand-500/10 hover:text-slate-50">
                        <it.icon size={15} className="shrink-0 text-slate-500" />
                        <span className="truncate">{it.label}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        {/* current project */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Current project</h2>
          <div className="card rounded-3xl p-5">
            <div className="font-display text-lg font-bold text-slate-50">{project.projectName || 'No project set yet'}</div>
            <div className="text-xs text-slate-400">
              {[project.refNo, project.client, project.consultant].filter(Boolean).join(' · ') || 'Set the project header in Submittal Package'}
            </div>
            <div className="mt-4 space-y-1">
              {progress.map((p) => (
                <button key={p.label} onClick={() => go(p.route)} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-brand-500/10">
                  <p.icon size={15} className={p.n ? 'text-brand-400' : 'text-slate-600'} />
                  <span className="flex-1 text-slate-300">{p.label}</span>
                  <span className={`tabular-nums font-semibold ${p.n ? 'text-slate-50' : 'text-slate-600'}`}>{p.n}</span>
                </button>
              ))}
            </div>
            {drawing?.plans?.length > 0 && (
              <button onClick={() => go('calc/drawing')} className="mt-2 w-full rounded-lg bg-brand-500/10 px-3 py-2 text-left text-xs text-brand-300">
                {drawing.plans.length} drawing plan(s) open in Calculation from Drawing →
              </button>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => go('submittal')} className="btn-secondary !py-2 text-sm">
                <Package size={15} /> Package
              </button>
              <button onClick={() => go('submittal')} className="btn-primary !py-2 text-sm">
                Compile PDF
              </button>
            </div>
            <p className="mt-3 text-[11px] text-slate-500">{library.models.length} pump model(s) in the Document Library.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
