import { useEffect, useMemo, useRef, useState } from 'react';
import { Route, Upload, LoaderCircle, Layers, Trash2, Eye, Crosshair, Flag, Wand2, X, Plus, Building2, ZoomIn, Tag, ListOrdered, Settings2, Check, Save, FileText } from 'lucide-react';
import { HeadLossEditor, FixtureEditor } from '../calculators/Editors.jsx';
import { SheetPreviewModal } from '../../components/SheetPreview.jsx';
import { useStore } from '../../store.jsx';
import { Card, NumField, SelectField } from '../../components/ui.jsx';
import { CALCULATORS, SECTION_CATEGORIES } from '../../lib/calcs/index.js';
import { fmtN } from '../../lib/ipc.js';
import { buildNetwork, analyse, autoSource, routeRows, fixtureWsfu, UNASSIGNED, findViews, DEFAULT_SYMBOLS, symbolKey, classifyBlock, FITTING_KINDS, findTanks, mainRoute } from '../../lib/drawing/network.js';
import { FIXTURES } from '../../lib/ipc.js';
import { buildingResult, calcPatch, DRAWING_SYSTEMS, levelsWithHeight } from '../../lib/drawing/building.js';
import { PPR, PN_CLASSES } from '../../lib/drawing/ppr.js';
import { drawPlan, netBounds, routeImage, OD_COLORS } from '../../lib/drawing/draw.js';

// heavy drawing data stays in memory (not in localStorage)
const CACHE = new Map(); // plan id → { fileId, flat, net, nodes (view), src, target, res, route }
const FILES = new Map(); // file id → { flat, layers: string[], net, views }
const pid = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** Layers that normally carry the pipes of this system (hot water excluded unless it is a hot/chilled loop). */
const isPipeLayerName = (name, hot) =>
  /PIPE|PLUMB|WATER|CWS|BCWS|BCCWS|\bCW\b|^CW|^WS\b|^WS[ -]|W-CWS|P-W|CHW|DRAIN|SANR-PIPE|PL[-_]CW/i.test(name) && !/IDEN|TEXT|TXT|ANNO|TAG|DIM|ARROW|EQUI|DETAIL|SECTION|LEADER|LDR|NOTE|HEATER|HETER|\$0\$/i.test(name) && (hot || !/HOT|HWS|HWR|RETURN|CHW|CHILL/i.test(name));
const defaultLayers = (flat, system) => [...new Set(flat.lines.map((l) => l.layer))].filter((n) => isPipeLayerName(n, system === 'chw'));
const symbolsOf = (d) => ({ ...DEFAULT_SYMBOLS, ...(d.symbols || {}) });
function buildFile(file, d) {
  const layers = new Set(file.layers);
  file.net = buildNetwork(file.flat, { include: (l) => layers.has(l.layer), symbols: symbolsOf(d), sizeBasis: d.sizeBasis });
  file.views = findViews(file.flat, file.net);
}
const viewNodes = (file, title) => (title ? file.views.find((v) => v.title === title)?.nodes || null : null);

/** Guess the floors a plan covers from its title ("3rd, 5th & 7th Floor Typical Floor Plan"). */
function guessLevels(title, levels) {
  const t = String(title || '').toUpperCase();
  const hits = levels.filter((l) => {
    const m = l.name.toUpperCase().match(/^(\d+)(ST|ND|RD|TH)/);
    if (m) return new RegExp(`(^|[^0-9])${m[1]}(ST|ND|RD|TH)`).test(t);
    const w = l.name.toUpperCase().replace(/\s*FLOOR$/, '');
    return w.length > 2 && t.includes(w);
  });
  return hits.map((l) => l.name);
}

/** Fixture types from clicks (assign) and typed counts (manual): unmarked outlets share the remaining WSFU. */
function applyFixtureTypes(net, plan) {
  const assign = plan?.assign || {};
  const manual = plan?.manual || null;
  for (const f of net.fixtures) {
    if (f.kind0 === undefined) f.kind0 = f.kind;
    const k = assign[f.id] || f.kind0;
    f.kind = k;
    f.wsfu = k === 'ignore' ? 0 : fixtureWsfu(k);
  }
  const open = net.fixtures.filter((f) => f.kind === UNASSIGNED);
  if (open.length) {
    const typed = manual ? Object.entries(manual).reduce((s2, [k, n]) => s2 + (Number(n) || 0) * fixtureWsfu(k), 0) : 0;
    const known = net.fixtures.filter((f) => f.kind !== UNASSIGNED).reduce((s2, f) => s2 + f.wsfu, 0);
    const share = manual ? Math.max(0, typed - known) / open.length : 1;
    for (const f of open) f.wsfu = share;
  }
}

function analysePlan(entry, d, flowLps, override = {}, plan = null) {
  const { net } = entry;
  const sys = DRAWING_SYSTEMS[d.system];
  applyFixtureTypes(net, plan);
  // transfer / sump / loop: the main (largest labelled run) instead of the farthest fixture
  if (!sys.fixtures && override.src == null && entry.src == null && override.target == null) {
    const m = mainRoute(net, entry.flat, d.system, entry.nodes);
    if (m) override = { ...override, src: m.src, target: m.target };
  }
  const src = override.src ?? entry.src ?? autoSource(net, entry.nodes);
  const res = analyse(net, src, { supplyType: d.supplyType, pn: d.pn, fixtures: sys.fixtures, flowLps: sys.fixtures ? null : flowLps });
  const target = override.target ?? entry.target ?? null;
  const route = target != null ? res.evaluate(target) || res.critical : res.critical;
  entry.src = src;
  entry.target = target;
  entry.res = res;
  entry.route = route;
  const fixtures = {};
  for (const f of res.reached) if (f.kind !== UNASSIGNED && f.kind !== 'ignore') fixtures[f.kind] = (fixtures[f.kind] || 0) + 1;
  const unmarked = res.reached.filter((f) => f.kind === UNASSIGNED).length;
  const tgtFix = route?.fixtures?.[0];
  return {
    fixtures,
    wsfu: res.totalWsfu,
    unreached: (entry.nodes ? net.fixtures.filter((f) => (f.nodes || [f.node]).some((id) => entry.nodes.has(id))) : net.fixtures).filter((f) => f.at == null && f.kind !== 'ignore').length,
    unmarked,
    outlets: res.reached.length,
    pdf: entry.flat.source === 'pdf' ? { scale: entry.flat.scale } : null,
    loose: net.loose?.length || 0,
    lengthM: route?.lengthM || 0,
    frictionM: route?.frictionM || 0,
    rows: route ? routeRows(route.items, d.pn) : [],
    targetLabel: tgtFix ? tgtFix.kind.split(' –')[0].split(' /')[0] : 'end of pipe',
    pipesM: net.edges.filter((e) => !entry.nodes || entry.nodes.has(e.u)).reduce((s2, e) => s2 + e.L, 0) / 1000,
    sizes: [...new Set(net.edges.filter((e) => !entry.nodes || entry.nodes.has(e.u)).map((e) => e.od))].sort((a, b) => a - b),
    maxV: route ? Math.max(...route.items.filter((i) => i.type === 'pipe').map((i) => (4 * (i.q / 1000)) / (Math.PI * (i.idMm / 1000) ** 2))) : 0,
    image: route ? routeImage(entry.flat, net, route, src, route.target) : '',
  };
}

const STEPS = ['Drawings', 'Building', 'Floors & route', 'Review & save'];
const FILE_KINDS = { plans: 'Floor plan(s)', riser: 'Riser / schematic', ignore: 'Ignore' };

/** What is in a drawing: a riser diagram (level names, schematic) or floor plans. */
function classifyDrawing(flat, fileName, views, levelNames, fixtures) {
  // a sheet with two or more titled floor plans is a plan sheet, even if a small schematic sits beside them
  if (views.length >= 2) return 'plans';
  const riserWords = /RISER|SCHEMATIC|DIAGRAM/i.test(fileName) || flat.texts.some((t) => /^(WATER SUPPLY |DOMESTIC WATER |PLUMBING )?(RISER|SCHEMATIC)( DIAGRAM)?$/i.test(t.text.trim()));
  if (riserWords && levelNames.length >= 3) return 'riser';
  if (views.length) return 'plans';
  if (levelNames.length >= 6 && fixtures < 3) return 'riser';
  return 'plans';
}

export function DrawingTab({ preset } = {}) {
  const { drawing: d, setDrawing, inputs, setCalcInputs, saveDuty, project, notify } = useStore();
  const set = (patch) => setDrawing((x) => ({ ...x, ...(typeof patch === 'function' ? patch(x) : patch) }));
  const [busy, setBusy] = useState('');
  const [settingsFor, setSettingsFor] = useState(null);
  const [view, setView] = useState(null);
  const [editFloor, setEditFloor] = useState(null);
  const [preview, setPreview] = useState(false);
  const [, force] = useState(0);
  const inputRef = useRef(null);
  const sys = DRAWING_SYSTEMS[d.system] || DRAWING_SYSTEMS.booster;
  const calcKey = sys.calc;
  const step = d.step || 1;
  useEffect(() => {
    if (preset && d.system !== preset) setDrawing((x) => ({ ...x, system: preset, review: null }));
  }, [preset]); // eslint-disable-line react-hooks/exhaustive-deps
  const calcRes = useMemo(() => {
    try {
      return CALCULATORS[calcKey].compute(inputs[calcKey]);
    } catch {
      return null;
    }
  }, [calcKey, inputs]);
  const flowLps = calcRes?.duty?.flowLps ?? 0;
  const res = useMemo(() => buildingResult(d, { duty: (d.review || inputs[calcKey])?.duty, designFlowLps: calcRes?.duty?.totalFlowLps }), [d, inputs, calcKey, calcRes]);

  const readFile = async (file) => {
    if (/\.pdf$/i.test(file.name)) {
      const [pdfjs, worker, { readPdfDrawing }] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url'), import('../../lib/drawing/readPdf.js')]);
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const flat = await readPdfDrawing(new Uint8Array(await file.arrayBuffer()), pdfjs);
      if (flat.lines.length < 200) throw new Error(`${file.name} has almost no line work – it looks scanned. Use a PDF exported from AutoCAD / Revit, or the DWG.`);
      return flat;
    }
    if (!/\.dwg$/i.test(file.name)) throw new Error(`${file.name}: upload DWG or PDF drawings.`);
    const { readDwgFile } = await import('../../lib/drawing/readDwg.js');
    return readDwgFile(file);
  };

  /** Floor plans of one file → plan entries (one per floor view). */
  const plansFromFile = (fileId, fileName, levels, dd = d) => {
    const fe = FILES.get(fileId);
    const views = fe.views.filter((v) => !/^OTHER/.test(v.title));
    const parts = views.length ? views : [null];
    const out = [];
    for (const v of parts) {
      const id = pid();
      const entry = { fileId, flat: fe.flat, net: fe.net, nodes: v ? v.nodes : null };
      const summary = analysePlan(entry, dd, flowLps);
      if (v && sys.fixtures && parts.length > 1 && !Object.keys(summary.fixtures).length && !summary.unmarked) continue; // tank roof, details
      CACHE.set(id, entry);
      const title = (v ? v.title : fe.flat.texts.find((t) => /FLOOR PLAN|LAYOUT|PLAN$/i.test(t.text) && t.text.length < 60)?.text || fileName.replace(/\.(dwg|pdf)$/i, '')).replace(/\s+/g, ' ').trim();
      out.push({ id, name: v ? title : title, fileName, fileId, viewTitle: v?.title || null, levels: guessLevels(`${title} ${v ? '' : fileName.replace(/_/g, ' ')}`, levels), summary });
    }
    return out;
  };

  /** One upload for everything: risers, plan sheets, multi-floor sheets. */
  const onFiles = async (fileList) => {
    const list = [...(fileList || [])];
    if (!list.length) return;
    const { levelsFromTexts } = await import('../../lib/drawing/readDwg.js');
    const read = [];
    for (const file of list) {
      setBusy(`Reading ${file.name} (${read.length + 1} of ${list.length})…`);
      try {
        const flat = await readFile(file);
        await new Promise((r) => setTimeout(r, 10));
        const fe = { flat, layers: defaultLayers(flat, d.system) };
        buildFile(fe, d);
        const fileId = pid();
        FILES.set(fileId, fe);
        const views = fe.views.filter((v) => !/^OTHER/.test(v.title));
        const levelNames = levelsFromTexts(flat.texts);
        const kind = classifyDrawing(flat, file.name, views, levelNames, fe.net.fixtures.length);
        read.push({ fileId, name: file.name, kind, views: views.length, levelNames, fixtures: fe.net.fixtures.length, pipesM: Math.round(fe.net.edges.reduce((s2, e) => s2 + e.L, 0) / 1000) });
        read.at(-1).tanks = findTanks(flat, file.name);
      } catch (e) {
        console.error(e);
        notify(e.message || `Could not read ${file.name}`, 'bad');
      }
    }
    // building levels: riser first, then floor titles of the plan sheets
    let levels = d.levels;
    const riser = read.find((r) => r.kind === 'riser' && r.levelNames.length);
    if (riser && (!levels.length || levels.length < riser.levelNames.length)) levels = levelsWithHeight(riser.levelNames, Number(d.typicalHeight) || 4);
    if (!levels.length) {
      const titles = read.filter((r) => r.kind === 'plans').flatMap((r) => FILES.get(r.fileId).views.map((v) => ({ text: v.title, x: 0, y: 0 })));
      const names = levelsFromTexts(titles);
      if (names.length) levels = levelsWithHeight(names, Number(d.typicalHeight) || 4);
    }
    const newPlans = [];
    setBusy('Tracing pipes and fixtures…');
    for (const r of read.filter((x) => x.kind === 'plans')) newPlans.push(...plansFromFile(r.fileId, r.name, levels));
    // one plan per floor: the first plan claiming a level keeps it
    const taken = new Set(d.plans.flatMap((p) => p.levels || []));
    for (const p of newPlans) p.levels = p.levels.filter((l) => (taken.has(l) ? false : (taken.add(l), true)));
    set((x) => ({
      files: [...(x.files || []), ...read.map(({ fileId, name, kind, views, levelNames, fixtures, pipesM }) => ({ id: fileId, name, kind, views, levels: levelNames.length, fixtures, pipesM }))],
      tanks: [...(x.tanks || []), ...read.flatMap((r) => r.tanks || [])].filter((t, i, arr) => arr.findIndex((y) => y.text === t.text) === i),
      tankVolume: x.tankVolume || (() => { const all = [...(x.tanks || []), ...read.flatMap((r) => r.tanks || [])].filter((t) => t.kind === 'tank' && t.volume); const up = all.find((t) => t.where === 'upper') || all.find((t) => t.where !== 'lower'); return up ? up.volume : ''; })(),
      pit: x.pit || (() => { const p2 = read.flatMap((r) => r.tanks || []).find((t) => t.kind === 'pit' && t.dims); return p2 ? { L: p2.dims[0], W: p2.dims[1], D: p2.dims[2] } : null; })(),
      plans: [...x.plans, ...newPlans],
      levels,
      pumpLevel: x.pumpLevel && levels.some((l) => l.name === x.pumpLevel) ? x.pumpLevel : levels[0]?.name || '',
      review: null,
    }));
    setBusy('');
    if (read.length) notify(`${read.length} drawing(s) read – ${read.filter((r) => r.kind === 'riser').length} riser, ${newPlans.length} floor plan view(s)`);
  };

  const setFileKind = (fileId, kind) => {
    const f = (d.files || []).find((x) => x.id === fileId);
    if (!f) return;
    let plans = d.plans.filter((p) => p.fileId !== fileId);
    let levels = d.levels;
    if (kind === 'plans' && FILES.has(fileId)) plans = [...plans, ...plansFromFile(fileId, f.name, levels)];
    if (kind === 'riser' && FILES.has(fileId)) {
      import('../../lib/drawing/readDwg.js').then(({ levelsFromTexts }) => {
        const names = levelsFromTexts(FILES.get(fileId).flat.texts);
        if (names.length) set({ levels: levelsWithHeight(names, Number(d.typicalHeight) || 4) });
      });
    }
    set((x) => ({ files: x.files.map((y) => (y.id === fileId ? { ...y, kind } : y)), plans, levels, review: null }));
  };
  const removeFile = (fileId) => {
    FILES.delete(fileId);
    set((x) => ({ files: x.files.filter((y) => y.id !== fileId), plans: x.plans.filter((p) => p.fileId !== fileId), review: null }));
  };

  /** Rebuild a file's network after its layers / the symbol dictionary / size basis changed. */
  const rebuildFile = (fileId, dd = d) => {
    const fe = FILES.get(fileId);
    if (!fe) return;
    buildFile(fe, dd);
    const updates = {};
    for (const p of dd.plans.filter((x) => x.fileId === fileId)) {
      const entry = CACHE.get(p.id);
      if (!entry) continue;
      Object.assign(entry, { net: fe.net, nodes: viewNodes(fe, p.viewTitle), src: undefined, target: undefined });
      updates[p.id] = analysePlan(entry, dd, flowLps, {}, p);
    }
    set((x) => ({ plans: x.plans.map((p) => (updates[p.id] ? { ...p, summary: updates[p.id] } : p)) }));
    force((n) => n + 1);
  };
  const reanalyse = (planId, override) => {
    const entry = CACHE.get(planId);
    if (!entry) return notify('Upload the drawing again to change its route (drawings are kept only while the page is open).', 'bad');
    const plan = d.plans.find((p) => p.id === planId);
    const summary = analysePlan(entry, d, flowLps, override, plan);
    set((x) => ({ plans: x.plans.map((p) => (p.id === planId ? { ...p, summary } : p)) }));
    force((n) => n + 1);
  };
  // a different system needs a different route (fixture route vs. transfer / discharge main)
  const lastSystem = useRef(d.system);
  if (lastSystem.current !== d.system) {
    for (const e of CACHE.values()) (e.src = undefined), (e.target = undefined);
    lastSystem.current = d.system;
  }
  useEffect(() => {
    for (const p of d.plans) if (CACHE.has(p.id)) reanalyse(p.id, {});
  }, [d.pn, d.supplyType, d.system, Math.round(flowLps * 100), JSON.stringify(d.plans.map((p) => [p.manual, p.assign]))]); // eslint-disable-line react-hooks/exhaustive-deps

  const setLevelPlan = (level, planId) => set((x) => ({ plans: x.plans.map((p) => ({ ...p, levels: p.id === planId ? [...new Set([...(p.levels || []), level])] : (p.levels || []).filter((l) => l !== level) })), review: null }));
  const setFloorFix = (level, fx) => set((x) => ({ floorFix: { ...(x.floorFix || {}), [level]: fx }, review: null }));

  /* ---------- review ---------- */
  const prepareReview = () => {
    if (!res.crit && sys.fixtures) return notify('No floor with fixtures yet – assign plans or type fixture counts in step 3.', 'bad');
    const patch = calcPatch(d, res);
    const base = inputs[calcKey] || CALCULATORS[calcKey].defaults();
    const tag = base.tag;
    set({ review: { ...base, ...patch, tag, system: base.system }, step: 4 });
  };
  const review = d.review;
  const setReview = (patch) => set((x) => ({ review: { ...x.review, ...(typeof patch === 'function' ? patch(x.review) : patch) } }));
  const reviewRes = useMemo(() => {
    if (!review) return null;
    try {
      return CALCULATORS[calcKey].compute(review);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [review, calcKey]);
  const saveToSubmittal = () => {
    if (!reviewRes) return;
    if (!String(review.tag || '').trim()) return notify('Enter an equipment tag first', 'bad');
    setCalcInputs(calcKey, review);
    const replaced = saveDuty(calcKey, reviewRes, review);
    notify(`${review.tag} ${replaced ? 'updated in' : 'saved to'} the submittal – calculation sheet with route drawing`);
  };
  const openInCalculator = () => {
    setCalcInputs(calcKey, review);
    window.location.hash = `/calc/${calcKey}`;
    window.scrollTo({ top: 0 });
  };

  const goStep = (n) => (n === 4 && !review ? prepareReview() : set({ step: n }));
  const viewPlan = d.plans.find((p) => p.id === view);
  const levelsTopDown = [...d.levels].reverse();
  const servedNames = new Set(res.floors.map((f) => f.level));
  const files = d.files || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-slate-50">
            <Route className="text-brand-400" size={22} /> Calculation from Drawings
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">Upload all drawings of the building at once (riser + floor plans, DWG or CAD PDF). The app works out what each drawing is, which floors exist and what each floor needs – you check each step, then save the calculation to the submittal.</p>
        </div>
        <SelectField label="System" value={d.system} onChange={(v) => set({ system: v, review: null })} options={Object.entries(DRAWING_SYSTEMS).map(([value, x]) => ({ value, label: x.label }))} />
      </div>

      {/* stepper */}
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map((t, i) => {
          const n = i + 1;
          const done = n < step;
          return (
            <li key={t}>
              <button onClick={() => goStep(n)} className={`flex w-full items-center gap-2 rounded-2xl border px-3 py-2.5 text-left text-sm transition ${n === step ? 'border-brand-500 bg-brand-500/15 text-slate-50' : done ? 'border-brand-500/30 text-slate-200' : 'border-line text-slate-400 hover:text-slate-200'}`}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${n === step || done ? 'bg-brand-500 text-white' : 'bg-ink-800 text-slate-400'}`}>{done ? <Check size={13} /> : n}</span>
                <span className="font-semibold">{t}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {busy && (
        <div className="card flex items-center gap-2 rounded-2xl p-3 text-sm text-brand-300">
          <LoaderCircle size={16} className="animate-spin" /> {busy}
        </div>
      )}

      {/* ---------------- STEP 1: drawings ---------------- */}
      {step === 1 && (
        <Card title="1. Upload all drawings" icon={Upload}>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => (e.preventDefault(), onFiles(e.dataTransfer.files))}
            onClick={() => !busy && inputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line p-8 text-center transition hover:border-brand-500/60"
          >
            <Upload className="text-brand-400" size={28} />
            <div className="font-display text-lg font-bold text-slate-50">Drop all drawings here – or click to choose</div>
            <div className="text-xs text-slate-400">Riser diagram, floor plans, typical floors, villa sheets with several floors · DWG or PDF from CAD · select many files at once</div>
            <input ref={inputRef} type="file" accept=".dwg,.pdf" multiple className="hidden" onChange={(e) => (onFiles(e.target.files), (e.target.value = ''))} />
          </div>
          {files.length > 0 && (
            <div className="mt-4 overflow-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs text-slate-400">
                  <tr>
                    <th className="px-2 py-1">Drawing</th>
                    <th className="px-2 py-1">What it is</th>
                    <th className="px-2 py-1">Found</th>
                    <th className="px-2 py-1" />
                  </tr>
                </thead>
                <tbody>
                  {files.map((f) => {
                    const plans = d.plans.filter((p) => p.fileId === f.id);
                    return (
                      <tr key={f.id} className="border-t border-line align-top">
                        <td className="px-2 py-2 font-medium text-slate-100">{f.name}</td>
                        <td className="px-2 py-2">
                          <select className="field !w-auto !py-1 text-xs" value={f.kind} onChange={(e) => setFileKind(f.id, e.target.value)} aria-label="Drawing type">
                            {Object.entries(FILE_KINDS).map(([k, l]) => (
                              <option key={k} value={k}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2 text-xs text-slate-400">
                          {f.kind === 'riser' && `${f.levels} level names`}
                          {f.kind === 'plans' && (plans.length ? `${plans.length} floor view(s): ${plans.map((p) => p.name).join(', ')}` : 'no floor plan with fixtures found')}
                          {f.kind === 'ignore' && 'not used'}
                          <span className="block text-slate-500">{f.pipesM} m of pipe traced</span>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right">
                          <button className="btn-ghost !py-1 text-xs" onClick={() => (FILES.has(f.id) ? setSettingsFor(f.id) : notify('Upload the drawing again to change its layers / symbols.', 'bad'))}>
                            <Settings2 size={13} /> Layers & symbols
                          </button>
                          <button className="btn-ghost !p-1 hover:!text-red-400" onClick={() => removeFile(f.id)} aria-label="Remove drawing">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <StepNav next={files.length ? () => set({ step: 2 }) : null} nextLabel="Next: building" />
        </Card>
      )}

      {/* ---------------- STEP 2: building ---------------- */}
      {step === 2 && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Card title="2. Building levels" icon={Layers}>
            <div className="mb-3 flex flex-wrap items-end gap-3">
              <NumField label="Typical floor height" unit="m" value={d.typicalHeight} onChange={(v) => set((x) => ({ typicalHeight: v, levels: levelsWithHeight(x.levels.map((l) => l.name), Number(v) || 4), review: null }))} min={0} step={0.1} />
              <button className="btn-ghost" onClick={() => set((x) => ({ levels: [...x.levels, { name: `Level ${x.levels.length + 1}`, elev: Number(((x.levels.at(-1)?.elev ?? -x.typicalHeight) + Number(x.typicalHeight || 4)).toFixed(2)) }] }))}>
                <Plus size={15} /> Add level on top
              </button>
            </div>
            {!d.levels.length ? (
              <p className="text-sm text-amber-400">No levels found – upload the riser diagram in step 1, or add the levels here.</p>
            ) : (
              <div className="max-h-[420px] overflow-auto rounded-xl border border-line">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-ink-800 text-slate-400">
                    <tr>
                      <th className="px-2 py-1 text-left">Level (top → bottom)</th>
                      <th className="px-2 py-1 text-right">Elevation (m)</th>
                      <th className="px-2 py-1 text-left">Floor plan</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {levelsTopDown.map((l) => {
                      const plan = d.plans.find((p) => (p.levels || []).includes(l.name));
                      return (
                        <tr key={l.name} className={`border-t border-line ${l.name === d.pumpLevel ? 'bg-brand-500/10' : ''}`}>
                          <td className="px-2 py-0.5">
                            <input className="field !py-0.5 text-xs" value={l.name} onChange={(e) => set((x) => ({ levels: x.levels.map((y) => (y === l ? { ...y, name: e.target.value } : y)) }))} aria-label="Level name" />
                          </td>
                          <td className="px-2 py-0.5">
                            <input type="number" step="0.1" className="field !py-0.5 text-right text-xs" value={l.elev} onChange={(e) => set((x) => ({ levels: x.levels.map((y) => (y === l ? { ...y, elev: Number(e.target.value) } : y)), review: null }))} aria-label="Elevation" />
                          </td>
                          <td className="px-2 py-0.5 text-slate-400">{plan ? plan.name : '–'}</td>
                          <td>
                            <button className="btn-ghost !p-1 hover:!text-red-400" onClick={() => set((x) => ({ levels: x.levels.filter((y) => y !== l) }))} aria-label="Remove level">
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-[11px] text-slate-500">Riser diagrams are not to scale – heights use the typical floor height; edit any level.</p>
          </Card>
          <Card title={`${sys.short} – where & what it serves`} icon={Building2}>
            <div className="grid gap-3">
              <LevelSelect label={sys.from} value={d.pumpLevel} levels={d.levels} onChange={(v) => set({ pumpLevel: v, review: null })} />
              {sys.range && <LevelSelect label="Lowest floor served" value={d.servedFrom} levels={d.levels} empty="— lowest level —" onChange={(v) => set({ servedFrom: v, review: null })} />}
              <LevelSelect label={sys.to} value={d.servedTo} levels={d.levels} empty={sys.range ? '— top level —' : '— top level —'} onChange={(v) => set({ servedTo: v, review: null })} />
              {sys.fixtures && <NumField label="Outlet height above floor" unit="m" value={d.outletHeight} onChange={(v) => set({ outletHeight: v, review: null })} step={0.1} />}
              <div className="grid grid-cols-2 gap-3">
                <SelectField label="Riser pipe" value={String(d.riserOd)} onChange={(v) => set({ riserOd: Number(v), review: null })} options={Object.keys(PPR).map((o) => ({ value: o, label: `Ø${o} PPR` }))} />
                <NumField label="Riser horizontal runs" unit="m" value={d.riserExtra} onChange={(v) => set({ riserExtra: v, review: null })} min={0} step={0.5} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <SelectField label="PPR class (internal Ø)" value={d.pn} onChange={(v) => set({ pn: v, review: null })} options={PN_CLASSES.map((p2) => ({ value: p2, label: p2 }))} />
                {sys.fixtures ? (
                  <SelectField label="Fixtures predominantly" value={d.supplyType} onChange={(v) => set({ supplyType: v, review: null })} options={[{ value: 'tank', label: 'Flush tanks' }, { value: 'valve', label: 'Flush valves' }]} />
                ) : d.system === 'chw' ? (
                  <NumField label="Loop factor" value={d.loopFactor} onChange={(v) => set({ loopFactor: v, review: null })} min={1} step={0.5} />
                ) : (
                  <NumField label="Extra static lift" unit="m" value={d.extraRise} onChange={(v) => set({ extraRise: v, review: null })} step={0.5} />
                )}
              </div>
              {sys.fixtures && <SelectField label="Static height" value={d.staticMode} onChange={(v) => set({ staticMode: v, review: null })} options={[{ value: 'positive', label: 'Down-feed counts as 0 (conservative)' }, { value: 'signed', label: 'Signed (gravity helps down-feed)' }]} />}
            </div>
            {d.system === 'transfer' && (
              <div className="mt-4 rounded-xl border border-line p-3">
                <NumField label="Upper (roof) tank volume for the filling flow" unit="m³" value={d.tankVolume} onChange={(v) => set({ tankVolume: v, review: null })} min={0} />
                <TankList tanks={(d.tanks || []).filter((t) => t.kind === 'tank')} onUse={(t) => set({ tankVolume: t.volume, review: null })} label="Use this volume" />
              </div>
            )}
            {d.system === 'sump' && (
              <div className="mt-4 rounded-xl border border-line p-3">
                <div className="grid grid-cols-3 gap-2">
                  {['L', 'W', 'D'].map((k) => (
                    <NumField key={k} label={{ L: 'Pit length', W: 'Pit width', D: 'Effective depth' }[k]} unit="m" value={d.pit?.[k] ?? ''} onChange={(v) => set((x) => ({ pit: { ...(x.pit || {}), [k]: v }, review: null }))} step={0.1} />
                  ))}
                </div>
                <TankList tanks={(d.tanks || []).filter((t) => t.kind === 'pit' || t.dims)} onUse={(t) => t.dims && set({ pit: { L: t.dims[0], W: t.dims[1], D: t.dims[2] }, review: null })} label="Use this size" />
              </div>
            )}
            <div className="mt-4 rounded-xl bg-brand-500/10 p-3 text-sm text-slate-200">
              <b>{d.levels.length}</b> levels{d.levels.length ? ` (${d.levels[0].name} → ${d.levels.at(-1).name})` : ''}.{' '}
              {sys.fixtures
                ? `Booster at ${res.pump.name || '—'} serves ${res.served} floor(s)${res.floors.length ? ` (${res.floors[0].level} → ${res.floors.at(-1).level})` : ''}.`
                : `${sys.short} from ${res.pump.name || '—'} to ${res.floors[0]?.level || '—'}: ${fmtN(Math.abs(res.floors[0]?.dz || 0), 1)} m difference.`}
            </div>
            <StepNav back={() => set({ step: 1 })} next={() => set({ step: 3 })} nextLabel="Next: floors & route" />
          </Card>
        </div>
      )}

      {/* ---------------- STEP 3: floors ---------------- */}
      {step === 3 && (
        <Card title={sys.fixtures ? '3. Floors served – fixtures & head per floor' : '3. Pipe route'} icon={Route}>
          {sys.fixtures ? (
            <>
              <div className="mb-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-lg bg-ink-800 px-2 py-1">{res.served} floors served</span>
                <span className="rounded-lg bg-ink-800 px-2 py-1">Total {fmtN(res.totalWsfu, 1)} WSFU</span>
                <span className="rounded-lg bg-ink-800 px-2 py-1">Demand {fmtN(res.demand.gpm, 1)} GPM = {fmtN(res.qTotal, 2)} L/s for the whole set</span>
                {res.crit && <span className="rounded-lg bg-red-500/15 px-2 py-1 text-red-300">Critical: {res.crit.level} – {fmtN(res.crit.totalM, 2)} m (before residual & safety)</span>}
              </div>
              <div className="overflow-auto">
                <table className="w-full min-w-[900px] text-xs">
                  <thead className="text-left text-slate-400">
                    <tr>
                      <th className="px-2 py-1">Floor</th>
                      <th className="px-2 py-1">Drawing for this floor</th>
                      <th className="px-2 py-1">Fixtures</th>
                      <th className="px-2 py-1 text-right">WSFU</th>
                      <th className="px-2 py-1 text-right">Route (m)</th>
                      <th className="px-2 py-1 text-right">Floor loss (m)</th>
                      <th className="px-2 py-1 text-right">Riser loss (m)</th>
                      <th className="px-2 py-1 text-right">Static (m)</th>
                      <th className="px-2 py-1 text-right">Total (m)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...res.floors].reverse().map((f) => {
                      const isCrit = res.crit && f.level === res.crit.level;
                      const typed = d.floorFix?.[f.level] && Object.values(d.floorFix[f.level]).some((v) => v !== undefined && v !== '');
                      return (
                        <FloorRow key={f.level} f={f} isCrit={isCrit} typed={typed} plans={d.plans} open={editFloor === f.level} onToggle={() => setEditFloor(editFloor === f.level ? null : f.level)} onPlan={(pidv) => setLevelPlan(f.level, pidv)} onFix={(fx) => setFloorFix(f.level, fx)} onRoute={() => f.plan && (CACHE.has(f.plan.id) ? setView(f.plan.id) : notify('Upload the drawing again to open its route.', 'bad'))} />
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-line font-semibold text-slate-100">
                      <td className="px-2 py-1">TOTAL</td>
                      <td />
                      <td className="px-2 py-1 text-slate-400">{Object.entries(res.fixtures).map(([k, n]) => `${n} ${k.split(' –')[0].split(' /')[0]}`).join(' · ')}</td>
                      <td className="px-2 py-1 text-right">{fmtN(res.totalWsfu, 1)}</td>
                      <td colSpan={5} />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">Pick the drawing for each floor (a typical plan can serve several floors). Click a floor’s fixtures to type or correct the counts for that floor. The floor with the highest total head becomes the critical floor.</p>
            </>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <SelectField label="Horizontal route drawing (optional)" value={d.routePlan || ''} onChange={(v) => set({ routePlan: v, review: null })} options={[{ value: '', label: '— none: riser length only —' }, ...d.plans.map((p) => ({ value: p.id, label: p.name }))]} />
                <button className="btn-secondary" onClick={() => { const id = d.routePlan; if (id && CACHE.has(id)) setView(id); else notify(id ? 'Upload the drawing again to open its route.' : 'Choose a drawing first.', 'bad'); }} disabled={!d.routePlan}>
                  <Eye size={15} /> Open route – pick start & end of the main
                </button>
                <p className="text-[11px] text-slate-500">The riser length (level difference + horizontal runs from step 2) is always counted. Add a plan only for a long horizontal run – e.g. pump room to riser shaft on the basement plan; the largest labelled main is picked automatically and can be corrected in the route view.</p>
              </div>
              <div className="rounded-xl bg-ink-950/40 p-3 text-sm">
                {res.floors[0] ? (
                  <>
                    <div>Route on plan: <b>{fmtN(res.floors[0].plan?.summary?.lengthM || 0, 1)} m</b> · friction {fmtN(res.floors[0].floorM, 2)} m</div>
                    <div>Riser {res.pump.name} → {res.floors[0].level}: {fmtN(res.floors[0].riserLen, 1)} m · friction {fmtN(res.floors[0].riserM, 2)} m</div>
                    <div>Static: {fmtN(res.floors[0].stat, 2)} m</div>
                    <div className="mt-1 text-slate-400">Flow from the {CALCULATORS[calcKey].label} inputs: {fmtN(res.qTotal, 2)} L/s (edit in step 4)</div>
                  </>
                ) : (
                  'Upload a drawing with the route.'
                )}
              </div>
            </div>
          )}
          <StepNav back={() => set({ step: 2 })} next={prepareReview} nextLabel="Next: review & save" />
        </Card>
      )}

      {/* ---------------- STEP 4: review & save ---------------- */}
      {step === 4 && review && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-4">
            <Card title="4. Review – every value can be edited" icon={ListOrdered} actions={<button className="btn-ghost !py-1 text-xs" onClick={() => confirm('Rebuild the review from the drawings? Your edits here will be replaced.') && prepareReview()}>Rebuild from drawings</button>}>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <TextFieldInline label="Equipment tag" value={review.tag} onChange={(v) => setReview({ tag: v })} />
                <TextFieldInline label="System" value={review.system} onChange={(v) => setReview({ system: v })} />
                <NumField label="Duty pumps" value={review.duty} min={1} step={1} onChange={(v) => setReview({ duty: v })} />
                <NumField label="Standby" value={review.standby} min={0} step={1} onChange={(v) => setReview({ standby: v })} />
                {calcKey !== 'chw' && <NumField label="Static height" unit="m" value={review.staticHeight} onChange={(v) => setReview({ staticHeight: v })} step={0.1} />}
                {calcKey !== 'chw' && <NumField label="Residual pressure" unit="m" value={review.residual} onChange={(v) => setReview({ residual: v })} step={0.1} />}
                <NumField label="Factor of safety" unit="%" value={review.fos} onChange={(v) => setReview({ fos: v })} step={1} />
                {calcKey === 'transfer' && (
                  <>
                    <NumField label="Roof tank volume" unit="m³" value={review.tankVolume} onChange={(v) => setReview({ tankVolume: v })} />
                    <NumField label="Filling time" unit="h" value={review.fillTime} onChange={(v) => setReview({ fillTime: v })} step={0.1} />
                  </>
                )}
                {calcKey === 'sump' && (
                  <>
                    <NumField label="Pit length" unit="m" value={review.pitL} onChange={(v) => setReview({ pitL: v })} step={0.1} />
                    <NumField label="Pit width" unit="m" value={review.pitW} onChange={(v) => setReview({ pitW: v })} step={0.1} />
                    <NumField label="Effective depth" unit="m" value={review.pitD} onChange={(v) => setReview({ pitD: v })} step={0.1} />
                    <NumField label="Emptying time" unit="h" value={review.emptyTime} onChange={(v) => setReview({ emptyTime: v })} step={0.01} />
                  </>
                )}
                {calcKey === 'chw' && (
                  <>
                    <NumField label={`Cooling load (${review.loadUnit})`} value={review.load} onChange={(v) => setReview({ load: v })} />
                    <NumField label="ΔT" unit="°C" value={review.deltaT} onChange={(v) => setReview({ deltaT: v })} step={0.1} />
                  </>
                )}
              </div>
            </Card>
            {sys.fixtures && <FixtureEditor i={review} set={setReview} />}
            <HeadLossEditor i={review} set={setReview} result={reviewRes} />
            {review.routeImages?.length > 0 && (
              <Card title="Route drawing on the calculation sheet" icon={Route} actions={<button className="btn-ghost !py-1 text-xs" onClick={() => setReview({ routeImages: [], routeNote: '' })}>Remove</button>}>
                <img src={review.routeImages[0].src} alt="Critical route" className="max-h-80 rounded-lg border border-line bg-white" />
                <p className="mt-1 text-[11px] text-slate-500">{review.routeImages[0].caption}</p>
              </Card>
            )}
          </div>
          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <Card title="Result" icon={Building2}>
              {!reviewRes ? (
                <p className="text-sm text-red-400">Check the inputs – the calculation could not be completed.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {reviewRes.kpis.map((k) => (
                    <div key={k.label} className={`rounded-xl border p-3 ${k.tone === 'ok' ? 'border-brand-500/40 bg-brand-500/10' : 'border-line'}`}>
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">{k.label}</div>
                      <div className="font-display text-xl font-bold text-slate-50">
                        {k.value} <span className="text-xs font-normal text-slate-400">{k.unit}</span>
                      </div>
                      <div className="text-[10px] text-slate-500">{k.sub}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 grid gap-2">
                <button className="btn-primary !py-3" onClick={saveToSubmittal} disabled={!reviewRes}>
                  <Save size={16} /> Save to Submittal
                </button>
                <button className="btn-secondary" onClick={() => setPreview(true)} disabled={!reviewRes}>
                  <FileText size={15} /> Preview A4 calculation sheet
                </button>
                <button className="btn-ghost" onClick={openInCalculator}>
                  Open in {CALCULATORS[calcKey].label} calculator
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">Saved sheets go to the submittal section “{SECTION_CATEGORIES[review.category] || review.category}” – compile from Submittal Package.</p>
            </Card>
          </aside>
          {reviewRes && <SheetPreviewModal open={preview} onClose={() => setPreview(false)} sheet={reviewRes.sheet} project={project} />}
        </div>
      )}

      {settingsFor && FILES.get(settingsFor) && (
        <DrawingSettings
          file={FILES.get(settingsFor)}
          d={d}
          onClose={() => setSettingsFor(null)}
          onLayers={(layers) => {
            FILES.get(settingsFor).layers = layers;
            rebuildFile(settingsFor);
          }}
          onSymbol={(key, kind) => {
            const dd = { ...d, symbols: { ...(d.symbols || {}), [key]: kind } };
            set({ symbols: dd.symbols });
            for (const fid of new Set(d.plans.map((p) => p.fileId).filter((x) => FILES.has(x)))) rebuildFile(fid, dd);
          }}
          onSizeBasis={(v) => {
            const dd = { ...d, sizeBasis: v };
            set({ sizeBasis: v });
            for (const fid of new Set(d.plans.map((p) => p.fileId).filter((x) => FILES.has(x)))) rebuildFile(fid, dd);
          }}
        />
      )}
      {viewPlan && CACHE.get(viewPlan.id) && <RouteViewer plan={viewPlan} entry={CACHE.get(viewPlan.id)} onClose={() => setView(null)} onPick={(o) => reanalyse(viewPlan.id, o)} onAssign={(fid, kind) => set((x) => ({ plans: x.plans.map((p) => (p.id === viewPlan.id ? { ...p, assign: { ...(p.assign || {}), [fid]: kind } } : p)) }))} />}
    </div>
  );
}

function StepNav({ back, next, nextLabel }) {
  return (
    <div className="mt-4 flex justify-between gap-2 border-t border-line pt-3">
      {back ? (
        <button className="btn-ghost" onClick={back}>
          ← Back
        </button>
      ) : (
        <span />
      )}
      {next && (
        <button className="btn-primary" onClick={next}>
          {nextLabel} →
        </button>
      )}
    </div>
  );
}

function LevelSelect({ label, value, levels, onChange, empty }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
      {label}
      <select className="field mt-1 !py-2 text-sm normal-case" value={value || ''} onChange={(e) => onChange(e.target.value)}>
        {empty && <option value="">{empty}</option>}
        {!empty && !value && <option value="">— choose —</option>}
        {[...levels].reverse().map((l) => (
          <option key={l.name} value={l.name}>
            {l.name} ({fmtN(l.elev, 1)} m)
          </option>
        ))}
      </select>
    </label>
  );
}

function TextFieldInline({ label, value, onChange }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
      {label}
      <input className="field mt-1 normal-case" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function FloorRow({ f, isCrit, typed, plans, open, onToggle, onPlan, onFix, onRoute }) {
  const kinds = FIXTURES.filter((x) => x.name !== 'Custom fixture');
  const chips = Object.entries(f.fixtures || {}).filter(([, n]) => Number(n) > 0);
  return (
    <>
      <tr className={`border-t border-line ${isCrit ? 'bg-red-500/10' : ''}`}>
        <td className={`px-2 py-1.5 font-semibold ${isCrit ? 'text-red-300' : 'text-slate-100'}`}>
          {f.level} {isCrit && <Flag size={11} className="inline" />}
        </td>
        <td className="px-2 py-1.5">
          <div className="flex items-center gap-1">
            <select className="field !w-56 !py-0.5 text-xs" value={f.plan?.id || ''} onChange={(e) => onPlan(e.target.value)} aria-label={`Drawing for ${f.level}`}>
              <option value="">— no drawing (type fixtures) —</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {f.plan && (
              <button className="btn-ghost !p-1" onClick={onRoute} title="Open route" aria-label="Open route">
                <Eye size={13} />
              </button>
            )}
          </div>
        </td>
        <td className="px-2 py-1.5">
          <button className="text-left text-slate-300 hover:text-brand-400" onClick={onToggle}>
            {chips.length ? chips.map(([k, n]) => `${n} ${k.split(' –')[0].split(' /')[0]}`).join(' · ') : <span className="text-amber-400">add fixtures</span>}
            {typed && <span className="ml-1 rounded bg-brand-500/20 px-1 text-[10px] text-brand-300">typed</span>}
          </button>
        </td>
        <td className="px-2 py-1.5 text-right">{fmtN(f.wsfu, 1)}</td>
        <td className="px-2 py-1.5 text-right">{fmtN(f.plan?.summary?.lengthM || 0, 1)}</td>
        <td className="px-2 py-1.5 text-right">{fmtN(f.floorM, 2)}</td>
        <td className="px-2 py-1.5 text-right">{fmtN(f.riserM, 2)}</td>
        <td className="px-2 py-1.5 text-right">{fmtN(f.stat, 2)}</td>
        <td className={`px-2 py-1.5 text-right font-semibold ${isCrit ? 'text-red-300' : ''}`}>{f.contributes ? fmtN(f.totalM, 2) : '–'}</td>
      </tr>
      {open && (
        <tr className="border-t border-line bg-ink-950/40">
          <td colSpan={9} className="px-2 py-2">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
              {kinds.map((k) => (
                <label key={k.name} className="text-[11px] text-slate-400">
                  <span className="block truncate" title={k.name}>
                    {k.name.split(' –')[0]}
                  </span>
                  <input type="number" min="0" className="field !py-0.5 text-xs" value={f.fixtures?.[k.name] ?? ''} placeholder="0" onChange={(e) => onFix({ ...(f.fixtures || {}), [k.name]: e.target.value === '' ? 0 : Number(e.target.value) })} />
                </label>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-slate-500">
              <span>Counts for {f.level} only. They replace what was found on the drawing.</span>
              {typed && (
                <button className="text-brand-400" onClick={() => onFix(null)}>
                  Use drawing count
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function viewBounds(entry) {
  if (!entry.nodes?.size) return netBounds(entry.net);
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const id of entry.nodes) {
    const g = entry.net.nodes[id];
    if (!g) continue;
    minx = Math.min(minx, g.x); maxx = Math.max(maxx, g.x); miny = Math.min(miny, g.y); maxy = Math.max(maxy, g.y);
  }
  const pad = Math.max(1500, 0.08 * Math.max(maxx - minx, maxy - miny));
  return { minx: minx - pad, miny: miny - pad, maxx: maxx + pad, maxy: maxy + pad };
}

/* ------------------------------------------------------------------ */
function RouteViewer({ plan, entry, onClose, onPick, onAssign }) {
  const [markKind, setMarkKind] = useState(FIXTURES[0].name);
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [mode, setMode] = useState(null); // 'src' | 'target'
  const fit = () => viewBounds(entry);
  const [vb, setVb] = useState(fit);
  const drag = useRef(null);
  const geo = useRef(null);
  const { theme } = useStore();

  useEffect(() => {
    const c = canvasRef.current;
    const w = wrapRef.current.clientWidth;
    const h = wrapRef.current.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr;
    c.height = h * dpr;
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    geo.current = drawPlan(g, { flat: entry.flat, net: entry.net, route: entry.route, src: entry.src, target: entry.route?.target, view: vb, w, h, dark: theme !== 'light' });
  }, [vb, entry, entry.route, entry.src, theme, plan.summary]);

  const nearest = (wx, wy, pred) => {
    let best = null;
    let bd = Infinity;
    for (const n of entry.net.nodes) {
      if (pred && !pred(n)) continue;
      const dd = Math.hypot(n.x - wx, n.y - wy);
      if (dd < bd) (bd = dd), (best = n);
    }
    return best;
  };
  const onClick = (e) => {
    if (drag.current?.moved || !mode || !geo.current) return;
    const r = canvasRef.current.getBoundingClientRect();
    const p = geo.current.toWorld(e.clientX - r.left, e.clientY - r.top);
    if (mode === 'mark') {
      let best = null;
      let bd = Infinity;
      for (const f of entry.net.fixtures) {
        const dd = Math.hypot(f.x - p.x, f.y - p.y);
        if (dd < bd) (bd = dd), (best = f);
      }
      if (best) onAssign(best.id, markKind);
      return; // stay in marking mode
    }
    if (mode === 'src') {
      const n = nearest(p.x, p.y);
      if (n) onPick({ src: n.id, target: null });
    } else {
      const outlets = new Set(entry.net.fixtures.map((f) => f.at).filter((x) => x != null));
      const n = nearest(p.x, p.y, (x) => outlets.has(x.id) || x.edges.length === 1);
      if (n) onPick({ target: n.id });
    }
    setMode(null);
  };
  const onWheel = (e) => {
    e.preventDefault();
    if (!geo.current) return;
    const r = canvasRef.current.getBoundingClientRect();
    const p = geo.current.toWorld(e.clientX - r.left, e.clientY - r.top);
    const f = e.deltaY > 0 ? 1.18 : 1 / 1.18;
    setVb((v) => ({ minx: p.x - (p.x - v.minx) * f, maxx: p.x + (v.maxx - p.x) * f, miny: p.y - (p.y - v.miny) * f, maxy: p.y + (v.maxy - p.y) * f }));
  };
  useEffect(() => {
    const c = canvasRef.current;
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  });
  const onDown = (e) => (drag.current = { x: e.clientX, y: e.clientY, vb, moved: false });
  const onMove = (e) => {
    const dr = drag.current;
    if (!dr || !geo.current) return;
    const dx = e.clientX - dr.x;
    const dy = e.clientY - dr.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) dr.moved = true;
    if (!dr.moved) return;
    const s = geo.current.s;
    setVb({ minx: dr.vb.minx - dx / s, maxx: dr.vb.maxx - dx / s, miny: dr.vb.miny + dy / s, maxy: dr.vb.maxy + dy / s });
  };
  const s = plan.summary || {};

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70 p-2 sm:p-4" role="dialog" aria-modal="true">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-ink-900 shadow-2xl">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="mr-auto min-w-0">
            <div className="truncate font-display font-bold text-slate-50">{plan.name}</div>
            <div className="text-[11px] text-slate-400">
              Route {fmtN(s.lengthM, 1)} m · friction {fmtN(s.frictionM, 2)} m · to {s.targetLabel} · scroll to zoom, drag to pan
            </div>
          </div>
          <button className={`btn-ghost !py-1 text-xs ${mode === 'src' ? '!bg-brand-500/20 !text-brand-300' : ''}`} onClick={() => setMode(mode === 'src' ? null : 'src')}>
            <Crosshair size={14} /> Pick supply point
          </button>
          <button className={`btn-ghost !py-1 text-xs ${mode === 'target' ? '!bg-red-500/20 !text-red-300' : ''}`} onClick={() => setMode(mode === 'target' ? null : 'target')}>
            <Flag size={14} /> Pick critical outlet
          </button>
          <span className="flex items-center gap-1">
            <button className={`btn-ghost !py-1 text-xs ${mode === 'mark' ? '!bg-emerald-500/20 !text-emerald-300' : ''}`} onClick={() => setMode(mode === 'mark' ? null : 'mark')}>
              <Tag size={14} /> Mark fixtures
            </button>
            {mode === 'mark' && (
              <select className="field !w-auto !py-0.5 text-xs" value={markKind} onChange={(e) => setMarkKind(e.target.value)} aria-label="Fixture type">
                {FIXTURES.filter((f) => f.name !== 'Custom fixture').map((f) => (
                  <option key={f.name}>{f.name}</option>
                ))}
                <option value="ignore">Not a fixture</option>
              </select>
            )}
          </span>
          <button className="btn-ghost !py-1 text-xs" onClick={() => onPick({ src: autoSource(entry.net, entry.nodes), target: null })}>
            <Wand2 size={14} /> Auto
          </button>
          <button className="btn-ghost !py-1 text-xs" onClick={() => setVb(fit())}>
            <ZoomIn size={14} /> Fit
          </button>
          <button className="btn-ghost !p-1" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {mode && <div className="bg-brand-500/15 px-3 py-1 text-xs text-brand-200">{mode === 'src' ? 'Click where the supply enters this floor (riser / meter / pump).' : mode === 'mark' ? `Click fixture symbols to mark them as “${markKind === 'ignore' ? 'not a fixture' : markKind}”. Click Mark fixtures again to finish.` : 'Click the outlet to use as the critical (index) fixture.'}</div>}
        <div ref={wrapRef} className={`relative min-h-0 flex-1 ${mode ? 'cursor-crosshair' : 'cursor-grab'}`}>
          <canvas ref={canvasRef} onClick={onClick} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={() => setTimeout(() => (drag.current = null), 0)} onMouseLeave={() => (drag.current = null)} />
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line p-2 text-[11px] text-slate-400">
          {s.sizes?.map((od) => (
            <span key={od} className="flex items-center gap-1">
              <span className="inline-block h-1 w-5 rounded" style={{ background: OD_COLORS[od] || '#334155' }} /> Ø{od}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-5 rounded bg-red-600" /> critical route
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-green-600" /> fixture
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-orange-500" /> not connected
          </span>
        </div>
      </div>
    </div>
  );
}



/* ------------------------------------------------------------------ */
function CountsEditor({ plan, onChange }) {
  const [open, setOpen] = useState(false);
  const detected = plan.summary?.fixtures || {};
  const manual = plan.manual || null;
  const kinds = FIXTURES.filter((f) => f.name !== 'Custom fixture');
  return (
    <div className="mt-1">
      <button className="btn-ghost !px-0 !py-0.5 text-[11px] text-brand-400" onClick={() => setOpen(!open)}>
        <ListOrdered size={12} /> {manual ? 'Fixture counts typed for this plan (per floor) – edit' : 'Type / correct fixture counts'}
      </button>
      {open && (
        <div className="mt-1 grid grid-cols-2 gap-1.5 rounded-lg border border-line p-2 sm:grid-cols-3">
          {kinds.map((f) => (
            <label key={f.name} className="flex items-center justify-between gap-1 text-[11px] text-slate-300">
              <span className="truncate" title={f.name}>
                {f.name.split(' –')[0]}
              </span>
              <input
                type="number"
                min="0"
                className="field !w-16 !py-0.5 text-right text-xs"
                placeholder={String(detected[f.name] || 0)}
                value={manual?.[f.name] ?? ''}
                onChange={(e) => onChange({ ...(manual || {}), [f.name]: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
            </label>
          ))}
          <div className="col-span-full flex justify-between text-[11px] text-slate-500">
            <span>Grey = found on the drawing. Typed values replace them in the totals (per floor of this plan).</span>
            {manual && (
              <button className="text-brand-400" onClick={() => onChange(null)}>
                Use detected
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/** Teach the reader a drafting standard: which layers are pipes, what each symbol is, how sizes are written. */
function DrawingSettings({ file, d, onClose, onLayers, onSymbol, onSizeBasis }) {
  const { flat, net } = file;
  const k = flat.unitToMm || 1;
  const [layers, setLayers] = useState(file.layers);
  const [q, setQ] = useState('');
  const symbols = { ...DEFAULT_SYMBOLS, ...(d.symbols || {}) };
  const layerList = useMemo(() => {
    const c = {};
    for (const l of flat.lines) c[l.layer] = (c[l.layer] || 0) + 1;
    return Object.entries(c)
      .map(([name, n]) => ({ name, n }))
      .sort((a, b) => (file.layers.includes(b.name) ? 1 : 0) - (file.layers.includes(a.name) ? 1 : 0) || b.n - a.n);
  }, [flat, file.layers]);
  // symbols that sit on / near the pipe network
  const symList = useMemo(() => {
    const grid = new Map();
    const cell = 1500;
    for (const g of net.nodes) {
      const key = `${Math.floor(g.x / cell)},${Math.floor(g.y / cell)}`;
      grid.set(key, true);
    }
    const near = (b) => {
      const cx = Math.floor((b.x * k) / cell);
      const cy = Math.floor((b.y * k) / cell);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (grid.has(`${cx + i},${cy + j}`)) return true;
      return false;
    };
    const by = new Map();
    for (const b of flat.blocks) {
      if (b.preset || !near(b)) continue;
      const key = symbolKey(b.name);
      if (!key) continue;
      const e = by.get(key) || { key, n: 0, sample: b, layer: b.layer };
      e.n++;
      by.set(key, e);
    }
    return [...by.values()].sort((a, b) => b.n - a.n).slice(0, 80);
  }, [flat, net, k]);
  const options = [
    ['', '— automatic (by name) —'],
    ...FIXTURES.filter((f) => f.name !== 'Custom fixture').map((f) => [f.name, `Fixture: ${f.name}`]),
    ...FITTING_KINDS.map((f) => [f, `Valve / fitting: ${f}`]),
    ['equipment', 'Equipment (tank, heater, pump)'],
    ['ignore', 'Ignore'],
  ];
  const shown = symList.filter((s2) => !q || s2.key.includes(q.toLowerCase()));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line bg-ink-900 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-line p-3">
          <Settings2 size={18} className="text-brand-400" />
          <div className="mr-auto">
            <div className="font-display font-bold text-slate-50">Layers & symbols</div>
            <div className="text-[11px] text-slate-400">Teach the reader this drafting standard once – symbol choices are remembered for every drawing.</div>
          </div>
          <button className="btn-ghost !p-1" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden md:grid-cols-[320px_1fr]">
          <div className="min-h-0 overflow-auto border-b border-line p-3 md:border-b-0 md:border-r">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Pipe layers</div>
            <label className="mb-3 block text-xs text-slate-300">
              Sizes written on the drawing are
              <select className="field mt-1 !py-1 text-xs" value={d.sizeBasis || 'od'} onChange={(e) => onSizeBasis(e.target.value)}>
                <option value="od">PPR outside diameter (Ø20, Ø25, Ø32 …)</option>
                <option value="dn">Nominal bore DN (Ø15 = ½″, Ø25 = 1″ → PPR one size up)</option>
              </select>
            </label>
            <div className="space-y-0.5">
              {layerList.slice(0, 120).map((l) => (
                <label key={l.name} className="flex items-center gap-2 text-[11px] text-slate-300">
                  <input type="checkbox" className="accent-brand-500" checked={layers.includes(l.name)} onChange={(e) => setLayers((x) => (e.target.checked ? [...x, l.name] : x.filter((y) => y !== l.name)))} />
                  <span className="truncate" title={l.name}>
                    {l.name}
                  </span>
                  <span className="ml-auto text-slate-500">{l.n}</span>
                </label>
              ))}
            </div>
            <button className="btn-primary mt-3 w-full !py-1.5 text-xs" onClick={() => onLayers(layers)}>
              Apply layers & re-trace
            </button>
          </div>
          <div className="min-h-0 overflow-auto p-3">
            <div className="mb-2 flex items-center gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Symbols near the pipes ({symList.length})</div>
              <input className="field ml-auto !w-40 !py-0.5 text-xs" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {shown.map((s2) => {
                const auto = classifyBlock({ ...s2.sample, name: s2.sample.name }, null);
                return (
                  <div key={s2.key} className="flex items-center gap-2 rounded-xl border border-line p-2">
                    <SymbolThumb flat={flat} block={s2.sample} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-slate-100" title={s2.sample.name}>
                        {s2.key} <span className="font-normal text-slate-500">× {s2.n}</span>
                      </div>
                      <div className="truncate text-[10px] text-slate-500">
                        layer {s2.layer.split('$0$').pop()} · auto: {auto.cls === 'other' ? 'not used' : `${auto.cls} ${auto.kind}`}
                      </div>
                      <select className="field mt-1 !py-0.5 text-[11px]" value={symbols[s2.key] || ''} onChange={(e) => onSymbol(s2.key, e.target.value || undefined)}>
                        {options.map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SymbolThumb({ flat, block }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const g = c.getContext('2d');
    const w = 56;
    c.width = w * 2;
    c.height = w * 2;
    g.scale(2, 2);
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, w);
    const pad = Math.max(block.maxx - block.minx, block.maxy - block.miny) * 0.25 || 0.1;
    const minx = block.minx - pad, miny = block.miny - pad, maxx = block.maxx + pad, maxy = block.maxy + pad;
    const s = Math.min(w / (maxx - minx || 1), w / (maxy - miny || 1));
    const X = (x) => (x - minx) * s + (w - (maxx - minx) * s) / 2;
    const Y = (y) => w - ((y - miny) * s + (w - (maxy - miny) * s) / 2);
    g.lineWidth = 1;
    g.beginPath();
    let n = 0;
    for (const l of flat.lines) {
      if (Math.max(l.a.x, l.b.x) < minx || Math.min(l.a.x, l.b.x) > maxx || Math.max(l.a.y, l.b.y) < miny || Math.min(l.a.y, l.b.y) > maxy) continue;
      g.strokeStyle = l.owner === block.id ? '#be123c' : '#cbd5e1';
      g.moveTo(X(l.a.x), Y(l.a.y));
      g.lineTo(X(l.b.x), Y(l.b.y));
      if (++n > 3000) break;
    }
    g.stroke();
    g.beginPath();
    g.strokeStyle = '#be123c';
    for (const l of flat.lines) {
      if (l.owner !== block.id) continue;
      g.moveTo(X(l.a.x), Y(l.a.y));
      g.lineTo(X(l.b.x), Y(l.b.y));
    }
    g.stroke();
  }, [flat, block]);
  return <canvas ref={ref} className="h-14 w-14 shrink-0 rounded border border-line" />;
}

function TankList({ tanks, onUse, label }) {
  if (!tanks.length) return <p className="mt-2 text-[11px] text-slate-500">No tank / pit notes found on the drawings – type the value.</p>;
  return (
    <div className="mt-2 space-y-1">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Found on the drawings</div>
      {tanks.map((t) => (
        <div key={t.text} className="flex items-start gap-2 rounded-lg bg-ink-950/40 p-2 text-[11px]">
          <span className="flex-1 text-slate-300">
            <b className="text-slate-100">{t.volume ? `${t.volume} m³` : '–'}</b>
            {t.dims ? ` · ${t.dims.join(' × ')} m` : ''}
            {t.where ? ` · ${t.where}` : ''}
            <span className="block truncate text-slate-500" title={t.text}>
              {t.text}
            </span>
          </span>
          <button className="btn-ghost !py-0.5 text-[11px] text-brand-400" onClick={() => onUse(t)}>
            {label}
          </button>
        </div>
      ))}
    </div>
  );
}
