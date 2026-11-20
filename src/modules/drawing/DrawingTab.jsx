import { useEffect, useMemo, useRef, useState } from 'react';
import { Route, Upload, LoaderCircle, Layers, Trash2, Eye, Send, Crosshair, Flag, Wand2, X, Plus, TriangleAlert, Building2, ZoomIn, Tag, ListOrdered, Settings2 } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { Card, NumField, SelectField } from '../../components/ui.jsx';
import { CALCULATORS } from '../../lib/calcs/index.js';
import { fmtN } from '../../lib/ipc.js';
import { buildNetwork, analyse, autoSource, routeRows, fixtureWsfu, UNASSIGNED, findViews, DEFAULT_SYMBOLS, symbolKey, classifyBlock, FITTING_KINDS } from '../../lib/drawing/network.js';
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

export function DrawingTab() {
  const { drawing: d, setDrawing, inputs, setCalcInputs, notify } = useStore();
  const set = (patch) => setDrawing((x) => ({ ...x, ...(typeof patch === 'function' ? patch(x) : patch) }));
  const [busy, setBusy] = useState('');
  const [ask, setAsk] = useState([]); // plan ids whose floors we still ask about (one dialog after another)
  const [settingsFor, setSettingsFor] = useState(null); // file id in the layers & symbols dialog
  const [view, setView] = useState(null); // plan id in the viewer
  const [, force] = useState(0);
  const riserRef = useRef(null);
  const planRef = useRef(null);
  const sys = DRAWING_SYSTEMS[d.system];
  const calcKey = sys.calc;
  const calcRes = useMemo(() => {
    try {
      return CALCULATORS[calcKey].compute(inputs[calcKey]);
    } catch {
      return null;
    }
  }, [calcKey, inputs]);
  const flowLps = calcRes?.duty?.flowLps ?? 0;
  const res = useMemo(() => buildingResult(d, { duty: inputs[calcKey]?.duty, designFlowLps: calcRes?.duty?.totalFlowLps }), [d, inputs, calcKey, calcRes]);

  const readFile = async (file) => {
    if (/\.pdf$/i.test(file.name)) {
      const [pdfjs, worker, { readPdfDrawing }] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url'), import('../../lib/drawing/readPdf.js')]);
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const flat = await readPdfDrawing(new Uint8Array(await file.arrayBuffer()), pdfjs);
      if (flat.lines.length < 200) throw new Error(`${file.name} has almost no line work – it looks scanned. Use a PDF exported from AutoCAD / Revit, or the DWG.`);
      return flat;
    }
    const { readDwgFile } = await import('../../lib/drawing/readDwg.js');
    return readDwgFile(file);
  };

  const onRiser = async (file) => {
    if (!file) return;
    setBusy('Reading riser diagram…');
    try {
      const flat = await readFile(file);
      const { levelsFromTexts } = await import('../../lib/drawing/readDwg.js');
      const names = levelsFromTexts(flat.texts);
      if (!names.length) throw new Error('No floor names (ROOF, 9th FLOOR, GROUND FLOOR…) found on this drawing – add the levels manually.');
      set({ levels: levelsWithHeight(names, Number(d.typicalHeight) || 4), pumpLevel: d.pumpLevel && names.includes(d.pumpLevel) ? d.pumpLevel : names[names.length - 1] });
      notify(`${names.length} levels read from the riser – check the heights`);
    } catch (e) {
      notify(e.message, 'bad');
    } finally {
      setBusy('');
    }
  };

  const onPlans = async (fileList) => {
    for (const file of [...(fileList || [])]) {
      setBusy(`Reading ${file.name}…`);
      try {
        const flat = await readFile(file);
        setBusy(`Tracing pipes in ${file.name}…`);
        await new Promise((r) => setTimeout(r, 20));
        const fileId = pid();
        const fe = { flat, layers: defaultLayers(flat, d.system) };
        buildFile(fe, d);
        if (!fe.net.edges.length) throw new Error(`No pipes found in ${file.name} – open “Layers & symbols” on the plan to choose the pipe layers.`);
        FILES.set(fileId, fe);
        // one sheet with several titled plans → one plan per floor view
        const views = fe.views.filter((v) => !/^OTHER/.test(v.title));
        const parts = views.length ? views : [null];
        const titleOf = (v) => (v ? v.title : (flat.texts.find((t) => /FLOOR PLAN|LAYOUT|PLAN$/i.test(t.text) && t.text.length < 60)?.text || file.name.replace(/\.(dwg|pdf)$/i, '')).replace(/\s+/g, ' ').trim());
        // no levels yet? make them from the view titles
        let levels = d.levels;
        if (views.length && !levels.length) {
          const { levelsFromTexts } = await import('../../lib/drawing/readDwg.js');
          const names = levelsFromTexts(views.map((v) => ({ text: v.title, x: 0, y: 0 })));
          if (names.length) {
            levels = levelsWithHeight(names, Number(d.typicalHeight) || 4);
            set((x) => ({ levels, pumpLevel: x.pumpLevel || names[0] }));
          }
        }
        const created = [];
        let skipped = 0;
        for (const v of parts) {
          const id = pid();
          const entry = { fileId, flat, net: fe.net, nodes: v ? v.nodes : null };
          const summary = analysePlan(entry, d, flowLps);
          // floor views without any fixtures (tank roof, details) are left out of a fixture-unit calculation
          if (v && sys.fixtures && parts.length > 1 && !Object.keys(summary.fixtures).length && !summary.unmarked) {
            skipped++;
            continue;
          }
          CACHE.set(id, entry);
          const name = titleOf(v);
          created.push({ id, name: v ? `${name} – ${file.name.replace(/\.(dwg|pdf)$/i, '')}` : name, fileName: file.name, fileId, viewTitle: v?.title || null, levels: guessLevels(`${name} ${v ? '' : file.name.replace(/_/g, ' ')}`, levels), floors: 1, summary });
        }
        set((x) => ({ plans: [...x.plans, ...created] }));
        setAsk(created.map((c) => c.id));
        const nFix = created.reduce((a2, c) => a2 + Object.values(c.summary.fixtures).reduce((a3, b3) => a3 + b3, 0), 0);
        notify(`${file.name}: ${views.length ? `${created.length} floor view(s)${skipped ? ` (${skipped} without fixtures left out)` : ''}, ` : ''}${nFix} fixtures`);
      } catch (e) {
        console.error(e);
        notify(e.message || `Could not read ${file.name}`, 'bad');
      }
    }
    setBusy('');
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
  // re-run when PN / supply type / system changes
  useEffect(() => {
    for (const p of d.plans) if (CACHE.has(p.id)) reanalyse(p.id, {});
  }, [d.pn, d.supplyType, d.system, Math.round(flowLps * 100), JSON.stringify(d.plans.map((p) => [p.manual, p.assign]))]); // eslint-disable-line react-hooks/exhaustive-deps

  const updPlan = (id, patch) => set((x) => ({ plans: x.plans.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const removePlan = (id) => {
    CACHE.delete(id);
    set((x) => ({ plans: x.plans.filter((p) => p.id !== id) }));
  };

  const send = () => {
    if (!res.crit) return notify('Add at least one floor plan first', 'bad');
    const patch = calcPatch(d, res);
    setCalcInputs(calcKey, (s) => ({ ...s, ...patch }));
    notify(`Sent to ${CALCULATORS[calcKey].label} – review and save the calculation sheet`);
    window.location.hash = `/calc/${calcKey}`;
    window.scrollTo({ top: 0 });
  };

  const askPlan = d.plans.find((p) => p.id === ask[0]);
  const viewPlan = d.plans.find((p) => p.id === view);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-slate-50">
            <Route className="text-brand-400" size={22} /> Calculation from Drawing
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Upload the riser diagram and floor plans (AutoCAD / Revit DWG, or PDF exported from CAD). The app traces the pipes, sizes them from the drawing, counts fixtures, finds the critical route and builds the head-loss table – then sends everything to the calculator for review. Everything runs in your browser; drawings are not uploaded anywhere.
          </p>
        </div>
        <button className="btn-primary" onClick={send} disabled={!res.crit}>
          <Send size={16} /> Send to {CALCULATORS[calcKey].label}
        </button>
      </div>

      {busy && (
        <div className="card flex items-center gap-2 rounded-2xl p-3 text-sm text-brand-300">
          <LoaderCircle size={16} className="animate-spin" /> {busy}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="1. System & levels" icon={Layers}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <SelectField label="System" value={d.system} onChange={(v) => set({ system: v })} options={Object.entries(DRAWING_SYSTEMS).map(([value, s]) => ({ value, label: s.label }))} />
            <NumField label="Typical floor height" unit="m" value={d.typicalHeight} onChange={(v) => set((x) => ({ typicalHeight: v, levels: levelsWithHeight(x.levels.map((l) => l.name), Number(v) || 4) }))} min={0} step={0.1} />
            <SelectField label="Pump located at" value={d.pumpLevel} onChange={(v) => set({ pumpLevel: v })} options={[{ value: '', label: '— lowest level —' }, ...d.levels.map((l) => ({ value: l.name, label: l.name }))]} />
            <NumField label="Outlet height above floor" unit="m" value={d.outletHeight} onChange={(v) => set({ outletHeight: v })} step={0.1} />
            <SelectField label="Static height" value={d.staticMode} onChange={(v) => set({ staticMode: v })} options={[{ value: 'positive', label: 'Down-feed counts as 0 (conservative)' }, { value: 'signed', label: 'Signed (gravity helps down-feed)' }]} />
            <SelectField label="PPR pressure class" value={d.pn} onChange={(v) => set({ pn: v })} options={PN_CLASSES.map((p) => ({ value: p, label: `${p} – actual ID` }))} />
            {sys.fixtures && <SelectField label="Fixtures predominantly" value={d.supplyType} onChange={(v) => set({ supplyType: v })} options={[{ value: 'tank', label: 'Flush tanks' }, { value: 'valve', label: 'Flush valves' }]} />}
            <SelectField label="Riser pipe (OD)" value={String(d.riserOd)} onChange={(v) => set({ riserOd: Number(v) })} options={Object.keys(PPR).map((o) => ({ value: o, label: `Ø${o} mm` }))} />
            <NumField label="Riser horizontal runs" unit="m" value={d.riserExtra} onChange={(v) => set({ riserExtra: v })} min={0} step={0.5} />
            {!sys.fixtures && d.system !== 'chw' && <NumField label="Extra static lift" unit="m" value={d.extraRise} onChange={(v) => set({ extraRise: v })} step={0.5} />}
            {d.system === 'chw' && <NumField label="Loop factor (supply + return)" value={d.loopFactor} onChange={(v) => set({ loopFactor: v })} min={1} step={0.5} />}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className="btn-secondary" onClick={() => riserRef.current?.click()} disabled={!!busy}>
              <Upload size={15} /> Read levels from riser (DWG / PDF)
            </button>
            <button className="btn-ghost" onClick={() => set((x) => ({ levels: [...x.levels, { name: `Level ${x.levels.length + 1}`, elev: Number(((x.levels.at(-1)?.elev ?? -x.typicalHeight) + Number(x.typicalHeight || 4)).toFixed(2)) }] }))}>
              <Plus size={15} /> Add level
            </button>
            <input ref={riserRef} type="file" accept=".dwg,.pdf" className="hidden" onChange={(e) => (onRiser(e.target.files?.[0]), (e.target.value = ''))} />
          </div>
          {d.levels.length > 0 && (
            <div className="mt-3 max-h-64 overflow-auto rounded-xl border border-line">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-ink-800 text-slate-400">
                  <tr>
                    <th className="px-2 py-1 text-left">Level</th>
                    <th className="px-2 py-1 text-right">Elevation (m)</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {[...d.levels].reverse().map((l) => (
                    <tr key={l.name} className="border-t border-line">
                      <td className="px-2 py-0.5">
                        <input className="field !py-0.5 text-xs" value={l.name} onChange={(e) => set((x) => ({ levels: x.levels.map((y) => (y === l ? { ...y, name: e.target.value } : y)) }))} />
                      </td>
                      <td className="px-2 py-0.5">
                        <input type="number" step="0.1" className="field !py-0.5 text-right text-xs" value={l.elev} onChange={(e) => set((x) => ({ levels: x.levels.map((y) => (y === l ? { ...y, elev: Number(e.target.value) } : y)) }))} />
                      </td>
                      <td>
                        <button className="btn-ghost !p-1 hover:!text-red-400" onClick={() => set((x) => ({ levels: x.levels.filter((y) => y !== l) }))} aria-label="Remove level">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-[11px] text-slate-500">Riser diagrams are usually not to scale, so heights come from the typical floor height ({fmtN(d.typicalHeight, 1)} m) – edit any level.</p>
        </Card>

        <Card title="2. Floor plans" icon={Building2}>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onPlans(e.dataTransfer.files);
            }}
            onClick={() => !busy && planRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line p-5 text-center transition hover:border-brand-500/60"
          >
            <Upload className="text-brand-400" size={24} />
            <div className="font-semibold text-slate-100">Drop floor plans (DWG or CAD PDF) here or click to upload</div>
            <div className="text-[11px] text-slate-400">One or more plans; you will be asked which floors each plan covers.</div>
            <input ref={planRef} type="file" accept=".dwg,.pdf" multiple className="hidden" onChange={(e) => (onPlans(e.target.files), (e.target.value = ''))} />
          </div>
          {!sys.fixtures && d.plans.length > 0 && (
            <p className="mt-2 flex items-center gap-1 text-[11px] text-amber-400">
              <TriangleAlert size={12} /> For {sys.label.split(' (')[0].toLowerCase()}, open <b>Route</b> and pick the start (pump / tank) and the end of the main – automatic picking follows the largest pipe only.
            </p>
          )}
          <div className="mt-3 space-y-2">
            {d.plans.map((p) => {
              const s = p.summary || {};
              const nFix = Object.values(s.fixtures || {}).reduce((a, b) => a + b, 0);
              return (
                <div key={p.id} className="rounded-xl border border-line bg-ink-950/40 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <input className="field min-w-[180px] flex-1 !py-1 text-sm font-semibold" value={p.name} onChange={(e) => updPlan(p.id, { name: e.target.value })} aria-label="Plan name" />
                    <button className="btn-ghost !py-1 text-xs" onClick={() => setAsk([p.id])}>
                      <Layers size={13} /> {p.levels?.length ? `${p.levels.length} floor(s)` : `${p.floors || 1} floor(s)`}
                    </button>
                    <button className="btn-ghost !py-1 text-xs" onClick={() => (CACHE.has(p.id) ? setView(p.id) : notify('Upload the drawing again to open it (drawings are kept only while the page is open).', 'bad'))}>
                      <Eye size={13} /> Route
                    </button>
                    <button className="btn-ghost !py-1 text-xs" onClick={() => (FILES.has(p.fileId) ? setSettingsFor(p.fileId) : notify('Upload the drawing again to change its layers / symbols.', 'bad'))}>
                      <Settings2 size={13} /> Layers & symbols
                    </button>
                    <button className="btn-ghost !p-1 hover:!text-red-400" onClick={() => removePlan(p.id)} aria-label="Remove plan">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="mt-2 grid gap-2 text-xs text-slate-300 sm:grid-cols-[1fr_auto]">
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(s.fixtures || {}).map(([k, n]) => (
                        <span key={k} className="rounded-md bg-ink-800 px-1.5 py-0.5">
                          {n} × {k.split(' –')[0]}
                        </span>
                      ))}
                      {sys.fixtures && !nFix && <span className="text-amber-400">No fixtures found</span>}
                    </div>
                    <div className="text-right text-slate-400">
                      {fmtN(s.pipesM, 0)} m pipe · route {fmtN(s.lengthM, 1)} m · <b className="text-slate-100">{fmtN(s.frictionM, 2)} m</b> friction
                    </div>
                  </div>
                  {s.pdf && (
                    <p className="mt-1 text-[11px] text-slate-400">
                      PDF drawing · scale 1:{s.pdf.scale} · {s.outlets} outlet(s) on the network{s.unmarked ? ` · ${s.unmarked} not typed – mark them in Route or type the counts` : ''}
                    </p>
                  )}
                  <CountsEditor plan={p} onChange={(manual) => updPlan(p.id, { manual })} />
                  {!s.lengthM && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-400">
                      <TriangleAlert size={12} /> No route found on this plan{sys.fixtures && !Object.keys(s.fixtures || {}).length ? ' (no fixtures connected to the pipes)' : ''} – open <b>Route</b> and pick the supply point and the end outlet.
                    </p>
                  )}
                  {(s.unreached > 0 || s.maxV > 2.5) && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-400">
                      <TriangleAlert size={12} /> {s.unreached > 0 ? `${s.unreached} fixture(s) not connected to the supply – check in Route view. ` : ''}
                      {s.maxV > 2.5 ? `Velocity up to ${fmtN(s.maxV, 1)} m/s on the route.` : ''}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card title="3. Head per floor" icon={Route}>
        {!res.floors.length ? (
          <p className="text-sm text-slate-400">Upload at least one floor plan.</p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-2 text-xs">
              {sys.fixtures && (
                <>
                  <span className="rounded-lg bg-ink-800 px-2 py-1">Total {fmtN(res.totalWsfu, 1)} WSFU</span>
                  <span className="rounded-lg bg-ink-800 px-2 py-1">Demand {fmtN(res.demand.gpm, 1)} GPM = {fmtN(res.qTotal, 2)} L/s</span>
                </>
              )}
              <span className="rounded-lg bg-ink-800 px-2 py-1">Flow per duty pump {fmtN(res.qPump, 2)} L/s</span>
              <span className="rounded-lg bg-ink-800 px-2 py-1">Pump at {res.pump.name || 'lowest level'} ({fmtN(res.pump.elev, 1)} m)</span>
            </div>
            <div className="overflow-auto">
              <table className="w-full min-w-[640px] text-xs">
                <thead className="text-slate-400">
                  <tr className="text-left">
                    <th className="px-2 py-1">Floor</th>
                    <th className="px-2 py-1">Plan</th>
                    <th className="px-2 py-1 text-right">Static (m)</th>
                    <th className="px-2 py-1 text-right">Riser (m)</th>
                    <th className="px-2 py-1 text-right">Riser loss (m)</th>
                    <th className="px-2 py-1 text-right">Floor route loss (m)</th>
                    <th className="px-2 py-1 text-right">Total (m)</th>
                  </tr>
                </thead>
                <tbody>
                  {res.floors.map((f, k) => (
                    <tr key={`${f.level}-${k}`} className={`border-t border-line ${k === 0 ? 'bg-red-500/10 font-semibold text-red-300' : ''}`}>
                      <td className="px-2 py-1">
                        {f.level} {k === 0 && <Flag size={11} className="inline" />}
                      </td>
                      <td className="px-2 py-1 text-slate-400">{f.plan.name}</td>
                      <td className="px-2 py-1 text-right">{fmtN(f.stat, 2)}</td>
                      <td className="px-2 py-1 text-right">{fmtN(f.riserLen, 1)}</td>
                      <td className="px-2 py-1 text-right">{fmtN(f.riserM, 2)}</td>
                      <td className="px-2 py-1 text-right">{fmtN(f.floorM, 2)}</td>
                      <td className="px-2 py-1 text-right">{fmtN(f.totalM, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Critical floor (red) goes to the calculator: riser + that floor's route as head-loss rows with section flows and PPR {d.pn} internal diameters, fixtures × floors, static height and the highlighted route drawing. Residual pressure, factor of safety and pump-room fittings are set in the calculator.
            </p>
          </>
        )}
      </Card>

      {askPlan && <FloorsDialog key={askPlan.id} plan={askPlan} levels={d.levels} pending={ask.length} onClose={() => setAsk((q) => q.slice(1))} onSave={(patch) => (updPlan(askPlan.id, patch), setAsk((q) => q.slice(1)))} />}
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
      {viewPlan && CACHE.get(viewPlan.id) && <RouteViewer plan={viewPlan} entry={CACHE.get(viewPlan.id)} onClose={() => setView(null)} onPick={(o) => reanalyse(viewPlan.id, o)} onAssign={(fid, kind) => updPlan(viewPlan.id, { assign: { ...(viewPlan.assign || {}), [fid]: kind } })} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
function FloorsDialog({ plan, levels, pending = 1, onClose, onSave }) {
  const [sel, setSel] = useState(plan.levels || []);
  const [floors, setFloors] = useState(plan.floors || 1);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-3xl border border-line bg-ink-900 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-50">Which floors does this plan cover?</h2>
            <p className="text-xs text-slate-400">
              {plan.name}
              {pending > 1 ? ` · ${pending - 1} more view(s) after this` : ''}
            </p>
          </div>
          <button className="btn-ghost !p-1" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {levels.length ? (
          <div className="mt-4 grid max-h-72 grid-cols-2 gap-1.5 overflow-auto sm:grid-cols-3">
            {[...levels].reverse().map((l) => (
              <label key={l.name} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-xs ${sel.includes(l.name) ? 'border-brand-500 bg-brand-500/15 text-slate-50' : 'border-line text-slate-300'}`}>
                <input type="checkbox" className="accent-brand-500" checked={sel.includes(l.name)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, l.name] : s.filter((x) => x !== l.name)))} />
                {l.name}
              </label>
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <NumField label="Number of floors this plan represents" value={floors} onChange={setFloors} min={1} step={1} />
            <p className="mt-1 text-[11px] text-slate-500">Tip: read the levels from the riser diagram first to pick floors by name.</p>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            Later
          </button>
          <button className="btn-primary" onClick={() => onSave(levels.length ? { levels: sel } : { floors: Math.max(1, Number(floors) || 1), levels: [] })} disabled={levels.length > 0 && !sel.length}>
            Save
          </button>
        </div>
      </div>
    </div>
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
