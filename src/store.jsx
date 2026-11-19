import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CALCULATORS } from './lib/calcs/index.js';
import { DEFAULT_INDEX, DEFAULT_PROJECT } from './lib/submittalDefaults.js';
import { fileStore } from './lib/fileStore.js';
import { BRAND, brandLogoBytes } from './brand.js';
import { emptyScheduleRow } from './lib/pdf/schedulePdf.js';
import { newLiterature } from './lib/literature.js';
import { newReply, annexureSlot, prevSlot } from './lib/replies.js';
import { TOOLS } from './lib/tools.js';

const Ctx = createContext(null);
const KEY = 'pump-submittal-v2';
const OLD_KEY = 'pump-submittal-v1';

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
    // v1 → v2: keep project header, index and logo; calculators changed format.
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const o = JSON.parse(old);
      return { project: o.project, entries: o.entries, logo: o.logo };
    }
  } catch {
    /* ignore */
  }
  return null;
}

const DEFAULT_SCHEDULE = () => ({ title: 'PUMP SCHEDULE', subtitle: 'WATER SUPPLY & DRAINAGE PUMPS', notes: '', rows: [] });

/** Merge saved calculator inputs with defaults (drops inputs from an older format). */
function mergeInputs(saved) {
  const base = defaultInputs();
  for (const [k, v] of Object.entries(saved || {})) {
    if (!base[k] || !v) continue;
    const needsRows = 'rows' in base[k];
    if (needsRows && !Array.isArray(v.rows)) continue;
    base[k] = { ...base[k], ...v };
  }
  return base;
}

const defaultInputs = () => Object.fromEntries(Object.values(CALCULATORS).map((c) => [c.key, c.defaults()]));

export function StoreProvider({ children }) {
  const saved = useMemo(loadState, []);
  const [project, setProject] = useState(() => ({ ...DEFAULT_PROJECT(), ...(saved?.project || {}) }));
  const [entries, setEntries] = useState(() => saved?.entries || DEFAULT_INDEX());
  const [duties, setDuties] = useState(() => saved?.duties || []);
  const [inputs, setInputs] = useState(() => mergeInputs(saved?.inputs));
  const [schedule, setSchedule] = useState(() => ({ ...DEFAULT_SCHEDULE(), ...(saved?.schedule || {}) }));
  // v3 design: template dark look is the default (older saved 'theme' is ignored)
  const [theme, setThemeState] = useState(() => saved?.uiTheme || 'dark');
  const [literature, setLiterature] = useState(() => saved?.literature || []);
  const [replies, setReplies] = useState(() => saved?.replies || []);
  const [toolInputs, setToolInputs] = useState(() => Object.fromEntries(Object.values(TOOLS).map((t) => [t.key, { ...t.defaults(), ...(saved?.toolInputs?.[t.key] || {}) }])));
  const [stamp, setStamp] = useState(() => saved?.stamp || null);
  const [files, setFiles] = useState({}); // entryId -> [{id,name,size,pages,bytes}]
  const [logo, setLogo] = useState(saved?.logo || null); // {dataUrl,type,name}
  const [toast, setToast] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ project, entries, duties, inputs, logo, schedule, uiTheme: theme, literature, replies, stamp, toolInputs }));
    } catch {
      /* quota – ignore */
    }
  }, [project, entries, duties, inputs, logo, schedule, theme, literature, replies, stamp, toolInputs]);

  useEffect(() => {
    fileStore.all().then((recs) => {
      const map = {};
      recs.sort((a, b) => a.order - b.order).forEach((r) => (map[r.entryId] ||= []).push(r));
      setFiles(map);
    });
  }, []);

  const notify = useCallback((msg, tone = 'ok') => {
    setToast({ msg, tone, id: Date.now() });
    setTimeout(() => setToast((t) => (t && Date.now() - t.id >= 3400 ? null : t)), 3500);
  }, []);

  const setCalcInputs = useCallback((key, updater) => {
    setInputs((s) => ({ ...s, [key]: typeof updater === 'function' ? updater(s[key]) : updater }));
  }, []);

  const saveDuty = useCallback((calcKey, result) => {
    const d = result.duty;
    let replaced = false;
    setDuties((list) => {
      const idx = list.findIndex((x) => x.tag.trim().toUpperCase() === d.tag.trim().toUpperCase());
      const rec = { ...d, id: idx >= 0 ? list[idx].id : uid(), calcKey, sheet: result.sheet, inputs: inputs[calcKey], savedAt: new Date().toISOString() };
      if (idx >= 0) {
        replaced = true;
        const copy = [...list];
        copy[idx] = rec;
        return copy;
      }
      return [...list, rec];
    });
    return replaced;
  }, [inputs]);

  const addFiles = useCallback(async (entryId, recs) => {
    const existing = files[entryId] || [];
    const withMeta = recs.map((r, i) => ({ ...r, id: uid(), entryId, order: existing.length + i + Date.now() / 1e13 }));
    setFiles((m) => ({ ...m, [entryId]: [...(m[entryId] || []), ...withMeta] }));
    for (const r of withMeta) await fileStore.put(r);
  }, [files]);

  const removeFile = useCallback(async (entryId, fileId) => {
    setFiles((m) => ({ ...m, [entryId]: (m[entryId] || []).filter((f) => f.id !== fileId) }));
    await fileStore.remove(fileId);
  }, []);

  const moveFile = useCallback((entryId, fileId, dir) => {
    setFiles((m) => {
      const list = [...(m[entryId] || [])];
      const i = list.findIndex((f) => f.id === fileId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return m;
      [list[i], list[j]] = [list[j], list[i]];
      list.forEach((f, k) => {
        f.order = k;
        fileStore.put(f);
      });
      return { ...m, [entryId]: list };
    });
  }, []);

  const resetAll = useCallback(async () => {
    setProject(DEFAULT_PROJECT());
    setEntries(DEFAULT_INDEX());
    setDuties([]);
    setInputs(defaultInputs());
    setFiles({});
    setLogo(null);
    setSchedule(DEFAULT_SCHEDULE());
    setLiterature([]);
    setReplies([]);
    setToolInputs(Object.fromEntries(Object.values(TOOLS).map((t) => [t.key, t.defaults()])));
    setStamp(null);
    await fileStore.clear();
  }, []);

  // Logo used in PDFs & previews: custom upload, otherwise the supplier brand logo.
  const getLogo = useCallback(async () => {
    if (logo?.dataUrl) {
      const bin = atob(logo.dataUrl.split(',')[1]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { bytes, type: logo.type };
    }
    return brandLogoBytes();
  }, [logo]);
  const logoSrc = logo?.dataUrl || BRAND.logoUrl;

  const setTheme = useCallback((t) => setThemeState(t), []);
  /** Add schedule rows for saved pump duties that are not yet in the manual schedule. */
  const importDutiesToSchedule = useCallback(() => {
    const have = new Set(schedule.rows.map((r) => r.tag).filter(Boolean));
    const fresh = duties
      .filter((d) => d.kind === 'pump' && !have.has(d.tag))
      .map((d) => {
        const spec = String(d.specifiedDuty || '').match(/([\d.]+)\s*L\/?P?S.*?@\s*([\d.]+)\s*(BAR|M)/i);
        const specHead = spec ? (spec[3].toUpperCase() === 'BAR' ? (Number(spec[2]) * 10.197).toFixed(1) : spec[2]) : '';
        return emptyScheduleRow({
          tag: d.tag,
          system: d.service,
          config: d.arrangement,
          specFlow: spec ? spec[1] : '',
          specHead,
          propFlow: d.flowLps != null ? d.flowLps.toFixed(2) : '',
          propHead: d.headM != null ? d.headM.toFixed(1) : '',
          brand: d.brand || '',
          model: d.model || '',
        });
      });
    if (fresh.length) setSchedule((sc) => ({ ...sc, rows: [...sc.rows, ...fresh] }));
    return fresh.length;
  }, [duties, schedule]);

  const addLiterature = useCallback((template, o) => {
    const lit = newLiterature(template, o);
    setLiterature((l) => [...l, lit]);
    return lit.id;
  }, []);
  const updateLiterature = useCallback((id, patch) => setLiterature((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x))), []);
  const removeLiterature = useCallback(
    async (id) => {
      for (const slot of [`lit-${id}-datasheet`, `lit-${id}-drawing`]) for (const f of files[slot] || []) await removeFile(slot, f.id);
      setLiterature((l) => l.filter((x) => x.id !== id));
    },
    [files, removeFile],
  );

  const addReply = useCallback((o) => {
    const r = newReply(o);
    setReplies((l) => [...l, r]);
    return r.id;
  }, []);
  const updateReply = useCallback((id, patch) => setReplies((l) => l.map((x) => (x.id === id ? { ...x, ...(typeof patch === 'function' ? patch(x) : patch) } : x))), []);
  const removeReply = useCallback(
    async (id) => {
      const r = replies.find((x) => x.id === id);
      if (r) for (const slot of [...r.annexures.map((a) => annexureSlot(r, a)), prevSlot(r)]) for (const f of files[slot] || []) await removeFile(slot, f.id);
      setReplies((l) => l.filter((x) => x.id !== id));
    },
    [replies, files, removeFile],
  );

  const setTool = useCallback((key, patch) => setToolInputs((s) => ({ ...s, [key]: patch === null ? TOOLS[key].defaults() : { ...s[key], ...patch } })), []);

  const value = {
    toolInputs, setTool,
    replies, addReply, updateReply, removeReply, stamp, setStamp,
    literature, setLiterature, addLiterature, updateLiterature, removeLiterature,
    getLogo, logoSrc, schedule, setSchedule, importDutiesToSchedule, theme, setTheme,
    project, setProject, entries, setEntries, duties, setDuties, inputs, setCalcInputs, saveDuty,
    files, addFiles, removeFile, moveFile, logo, setLogo, toast, notify, resetAll, uid,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
