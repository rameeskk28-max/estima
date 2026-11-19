import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Calculator, TableProperties, BookOpen, Package, MessageSquareReply, Wrench, Check, FileCheck2, Gauge, Building2, ArrowUpDown, Waves, Snowflake, Cylinder } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { CALCULATORS } from '../../lib/calcs/index.js';
import { fmtN } from '../../lib/ipc.js';
import { PumpScene } from '../../components/PumpScene.jsx';

export const CALC_ITEMS = [
  { key: 'booster', label: 'Booster Pump Set', icon: Building2, desc: 'Fixture units (IPC) → demand, head loss & final head' },
  { key: 'transfer', label: 'Transfer Pump Set', icon: ArrowUpDown, desc: 'Tank volume & filling time → flow and head' },
  { key: 'sump', label: 'Sump / Sewage Pump Set', icon: Waves, desc: 'Pit volume & emptying time → flow and head' },
  { key: 'chw', label: 'Chilled Water Pump Set', icon: Snowflake, desc: 'Cooling load & ΔT → flow; closed-loop head' },
  { key: 'vessel', label: 'Pressure Vessel', icon: Cylinder, desc: "Boyle's law vessel volume & pre-charge" },
];

export const FOLDERS = [
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
  const { inputs, duties, schedule, literature, entries, replies } = useStore();
  const ref = useReveal();
  const booster = useMemo(() => {
    try {
      return CALCULATORS.booster.compute(inputs.booster);
    } catch {
      return null;
    }
  }, [inputs.booster]);
  const counts = { tools: 8, calc: duties.length, schedule: schedule.rows.length, literature: literature.length, submittal: entries.filter((e) => e.include !== false).length, replies: replies.length };
  const countLabel = { tools: 'tools', calc: 'saved duties', schedule: 'pumps', literature: 'documents', submittal: 'sections', replies: 'replies' };

  const strip = ['IPC 2009 APPENDIX E', 'HAZEN-WILLIAMS', 'EQUIVALENT LENGTH METHOD', "BOYLE'S LAW VESSEL SIZING", 'A4 CALCULATION SHEETS', 'SOM PUMP SCHEDULE', 'TECHNICAL LITERATURE', 'SUBMITTAL COMPILER'];

  return (
    <div ref={ref} className="-mx-4 sm:-mx-6">
      {/* HERO */}
      <section className="relative px-4 pb-16 pt-10 sm:px-6 lg:pb-24 lg:pt-16">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-12 lg:gap-8">
          <div className="text-center lg:col-span-7 lg:text-left">
            <div className="glass-pill reveal-up mb-6 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium text-brand-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-brand-400" />
              <span>GREENLAND // MEP &amp; HVAC PUMP ENGINEERING SUITE</span>
            </div>
            <h1 className="reveal-up mb-6 font-display text-4xl font-bold leading-[1.08] tracking-tight text-slate-50 sm:text-6xl lg:text-[4.2rem]" style={{ transitionDelay: '100ms' }}>
              Pump calculations &amp; submittals, <br className="hidden sm:block" />
              <span className="text-gradient-kinetic">engineered &amp; documented</span>
              <br />
              <KineticWord />
            </h1>
            <p className="reveal-up mx-auto mb-8 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg lg:mx-0" style={{ transitionDelay: '200ms' }}>
              Size booster, transfer, sump and chilled-water pump sets and diaphragm vessels, build the pump schedule and technical literature, and compile a consultant-ready A4 submittal – all in your browser, nothing to install.
            </p>
            <div className="reveal-up flex flex-col items-center justify-center gap-4 sm:flex-row lg:justify-start" style={{ transitionDelay: '300ms' }}>
              <button onClick={() => go('calc/booster')} className="group flex w-full items-center justify-center gap-2 rounded-xl bg-white px-7 py-3.5 text-sm font-semibold text-slate-950 shadow-xl shadow-white/10 transition hover:bg-slate-100 sm:w-auto">
                Start a calculation <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </button>
              <button onClick={() => go('submittal')} className="glass-pill flex w-full items-center justify-center gap-2 rounded-xl px-7 py-3.5 text-sm font-medium text-slate-50 transition hover:bg-white/10 sm:w-auto">
                <FileCheck2 size={16} className="text-brand-400" /> Build a submittal
              </button>
            </div>
          </div>

          <div className="reveal-up relative flex h-[380px] items-center justify-center sm:h-[430px] lg:col-span-5" style={{ transitionDelay: '200ms' }}>
            <div className="card relative z-20 w-full max-w-md rounded-3xl p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-rose-500/80" />
                  <span className="h-3 w-3 rounded-full bg-amber-400/80" />
                  <span className="h-3 w-3 rounded-full bg-emerald-400/80" />
                </div>
                <span className="font-mono text-xs text-slate-400">SYS.BOOSTER // LIVE</span>
              </div>
              <PumpScene type="booster" anim={booster?.anim} />
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="glass-pill rounded-xl p-3">
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">Flow / pump</p>
                  <p className="mt-0.5 font-display text-base font-semibold text-slate-50">{fmtN(booster?.duty?.flowLps, 2)} L/s</p>
                </div>
                <div className="glass-pill rounded-xl p-3">
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">Proposed head</p>
                  <p className="mt-0.5 font-display text-base font-semibold text-brand-400">{fmtN(booster?.duty?.headM, 1)} m</p>
                </div>
              </div>
            </div>
            <div className="card absolute -top-2 right-0 z-30 flex animate-float-slow items-center gap-3 rounded-2xl px-4 py-3 sm:right-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/20 text-brand-400">
                <Check size={18} />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-50">IPC 2009 referenced</p>
                <p className="text-[11px] text-slate-400">Every step explained</p>
              </div>
            </div>
            <div className="card absolute -bottom-3 left-0 z-30 flex animate-float-medium items-center gap-3 rounded-2xl px-4 py-3 sm:left-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy-500/20 text-navy-400">
                <Gauge size={18} />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-50">A4 PDF ready</p>
                <p className="text-[11px] text-slate-400">Sheets, schedule &amp; literature</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MARQUEE */}
      <section className="overflow-hidden border-y border-line py-7">
        <p className="mb-4 text-center font-mono text-xs uppercase tracking-[0.2em] text-slate-500">Engineering methods built in</p>
        <div className="relative flex overflow-x-hidden">
          <div className="flex animate-marquee items-center gap-14 whitespace-nowrap py-1 font-display text-lg font-semibold tracking-wider text-slate-400/80">
            {[...strip, ...strip].map((s, k) => (
              <span key={k} className="flex items-center gap-14">
                <span>{s}</span>
                <span className="text-brand-500">•</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* FOLDERS */}
      <section className="px-4 py-20 sm:px-6 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="reveal-up mx-auto mb-14 max-w-3xl text-center">
            <span className="font-mono text-xs uppercase tracking-widest text-brand-400">Workspace</span>
            <h2 className="mb-4 mt-3 font-display text-3xl font-bold text-slate-50 sm:text-5xl">Six folders, one workflow</h2>
            <p className="text-base text-slate-400 sm:text-lg">Everything is grouped by what you deliver. Open a folder to work on its documents – your data is saved automatically in this browser.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:gap-8 xl:grid-cols-6">
            {FOLDERS.map((f, i) => (
              <div
                key={f.key}
                {...tilt}
                onClick={() => go(f.route)}
                role="link"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && go(f.route)}
                className={`card tilt-card reveal-up group cursor-pointer rounded-3xl p-7 sm:p-8 xl:col-span-2 ${f.tone === 'brand' ? 'hover:border-brand-500/50' : 'hover:border-navy-400/50'}`}
                style={{ transitionDelay: `${i * 90}ms` }}
              >
                <div className="tilt-card-content">
                  <div className="mb-6 flex items-start justify-between gap-4">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${f.tone === 'brand' ? 'border-brand-500/25 bg-brand-500/15 text-brand-400' : 'border-navy-400/25 bg-navy-500/15 text-navy-400'}`}>
                      <f.icon size={22} />
                    </div>
                    <span className="glass-pill rounded-full px-3 py-1 text-xs text-slate-300">
                      <b className="text-slate-50">{counts[f.key]}</b> {countLabel[f.key]}
                    </span>
                  </div>
                  <div className="mb-1 font-mono text-[11px] uppercase tracking-widest text-slate-500">Folder 0{i + 1}</div>
                  <h3 className="mb-3 font-display text-2xl font-bold text-slate-50">{f.label}</h3>
                  <p className="mb-5 text-sm leading-relaxed text-slate-400">{f.desc}</p>
                  <ul className="mb-6 space-y-1.5">
                    {f.items.map((it) => (
                      <li key={it.label}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            go(it.route);
                          }}
                          className="flex items-center gap-2 text-sm text-slate-300 transition hover:text-brand-400"
                        >
                          <span className={f.tone === 'brand' ? 'text-brand-400' : 'text-navy-400'}>✓</span> {it.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${f.tone === 'brand' ? 'text-brand-400' : 'text-navy-400'}`}>
                    Open folder <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WORKFLOW */}
      <section className="border-y border-line px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="reveal-up mb-10">
            <span className="font-mono text-xs uppercase tracking-widest text-navy-400">How it works</span>
            <h2 className="mt-2 font-display text-3xl font-bold text-slate-50 sm:text-5xl">From duty point to submittal</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
            {[
              ['01', 'Calculate', 'Enter the tank, fixtures or load. Flow, head loss and final head are calculated live and saved as an A4 sheet.'],
              ['02', 'Schedule', 'Import the duties into the SOM pump schedule and add brand, model, MOC and motor data.'],
              ['03', 'Literature', 'Generate technical literature per system and attach the pump datasheet and drawing.'],
              ['04', 'Compile', 'Add certificates and profiles, then compile one A4 PDF with cover, TOC and dividers.'],
              ['05', 'Reply', 'When comments come back, answer each one with status and annexure, and re-issue the revision.'],
            ].map(([n, t, d], i) => (
              <div key={n} className="card reveal-up rounded-2xl p-6" style={{ transitionDelay: `${i * 90}ms` }}>
                <div className="mb-3 font-display text-3xl font-bold text-brand-500/80">{n}</div>
                <div className="mb-2 font-display text-lg font-semibold text-slate-50">{t}</div>
                <p className="text-sm leading-relaxed text-slate-400">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* METRICS */}
      <section className="px-4 py-20 sm:px-6">
        <div className="card reveal-up mx-auto max-w-7xl rounded-3xl p-8 sm:p-14">
          <div className="grid grid-cols-2 gap-8 text-center lg:grid-cols-4">
            <div>
              <Counter to={5} suffix=" calcs" />
              <p className="mt-2 text-xs uppercase tracking-wider text-slate-400 sm:text-sm">Pump & vessel calculators</p>
            </div>
            <div>
              <Counter to={21} suffix=" cols" tone="text-navy-400" />
              <p className="mt-2 text-xs uppercase tracking-wider text-slate-400 sm:text-sm">SOM pump schedule</p>
            </div>
            <div>
              <Counter to={14} suffix=" items" />
              <p className="mt-2 text-xs uppercase tracking-wider text-slate-400 sm:text-sm">UAE submittal index</p>
            </div>
            <div>
              <Counter to={100} suffix="%" tone="text-navy-400" />
              <p className="mt-2 text-xs uppercase tracking-wider text-slate-400 sm:text-sm">In-browser, A4 output</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
