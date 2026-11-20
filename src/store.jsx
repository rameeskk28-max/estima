import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CALCULATORS } from './lib/calcs/index.js';
import { DEFAULT_INDEX, DEFAULT_PROJECT } from './lib/submittalDefaults.js';
import { fileStore } from './lib/fileStore.js';
import { BRAND, brandLogoBytes } from './brand.js';
import { emptyScheduleRow } from './lib/pdf/schedulePdf.js';
import { newLiterature } from './lib/literature.js';
import { newReply, annexureSlot, prevSlot } from './lib/replies.js';
import { TOOLS } from './lib/tools.js';
import { DEFAULT_LIBRARY } from './lib/quote/generate.js';
import { makeBackup, isLibrarySlot } from './lib/backup.js';
import * as cloud from './lib/cloud.js';
import { defaultDrawing } from './lib/drawing/building.js';

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

export const DEFAULT_COMPLIANCE = () => ({
  specNo: '',
  specName: '',
  subtitle: '',
  brandOffered: 'Franklin Electric Pumps',
  supplier: 'M/S. Greenland Equipment & Machinery EST LLC',
  rows: [],
  keyItems: null,
  signFor: 'For: GREENLAND EQUIPMENT & MACHINERY EST. L.L.C',
  signName: '',
  signLines: '',
  showStamp: true,
  sourceName: '',
});

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
  const [library, setLibrary] = useState(() => {
    const d = DEFAULT_LIBRARY();
    const l = saved?.library || {};
    return { models: l.models || [], settings: { ...d.settings, ...(l.settings || {}), certs: { ...d.settings.certs, ...(l.settings?.certs || {}) } } };
  });
  const [warrantyDoc, setWarrantyDoc] = useState(() => saved?.warrantyDoc || { period: 'THREE years from the date of Initial Start', equipment: 'pump sets' });
  const [quoteDraft, setQuoteDraft] = useState(() => saved?.quoteDraft || null);
  const [compliance, setCompliance] = useState(() => ({ ...DEFAULT_COMPLIANCE(), ...(saved?.compliance || {}) }));
  const [drawing, setDrawing] = useState(() => ({ ...defaultDrawing(), ...(saved?.drawing || {}) }));
  const [files, setFiles] = useState({}); // entryId -> [{id,name,size,pages,bytes}]
  const [cloudState, setCloudState] = useState({ configured: cloud.cloudConfigured, ready: !cloud.cloudConfigured, user: null, status: 'off', msg: '' });
  const userRef = useRef(null);
  const filesRef = useRef(files);
  const libraryRef = useRef(null);
  filesRef.current = files;
  libraryRef.current = library;
  const pulledRef = useRef(false);
  const [logo, setLogo] = useState(saved?.logo || null); // {dataUrl,type,name}
  const [toast, setToast] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ project, entries, duties, inputs, logo, schedule, uiTheme: theme, literature, replies, stamp, toolInputs, library, warrantyDoc, quoteDraft, compliance, drawing }));
    } catch {
      /* quota – ignore */
    }
  }, [project, entries, duties, inputs, logo, schedule, theme, literature, replies, stamp, toolInputs, library, warrantyDoc, quoteDraft, compliance, drawing]);

  useEffect(() => {
    fileStore.all().then((recs) => {
      const map = {};
      recs.sort((a, b) => a.order - b.order).forEach((r) => (map[r.entryId] ||= []).push(r));
      setFiles(map);
    });
  }, []);

  /* ---------- Cloud Document Library (Supabase) ---------- */
  const cloudRun = useCallback(async (msg, fn) => {
    if (msg) setCloudState((c) => ({ ...c, status: 'syncing', msg }));
    try {
      await fn();
      setCloudState((c) => ({ ...c, status: 'ok', msg: `Saved to cloud ${new Date().toLocaleTimeString()}` }));
    } catch (e) {
      console.error(e);
      setCloudState((c) => ({ ...c, status: 'error', msg: e.message || 'Cloud sync failed' }));
    }
  }, []);

  /** Pull the shared library from the cloud; on this browser's first sync, local-only items are uploaded too. */
  const cloudSync = useCallback(
    (user = userRef.current) =>
      user &&
      cloudRun('Syncing library with the cloud…', async () => {
        const firstKey = `gl-cloud-synced-${user.id}`;
        const first = !localStorage.getItem(firstKey);
        const remote = await cloud.pullState();
        let lib = libraryRef.current;
        if (remote?.data?.models) {
          lib = { models: first ? mergeModels(remote.data.models, lib.models) : remote.data.models, settings: { ...DEFAULT_LIBRARY().settings, ...remote.data.settings } };
          setLibrary(lib);
        }
        const rows = await cloud.listFiles();
        const remoteIds = new Set(rows.map((r) => r.id));
        const local = Object.entries(filesRef.current).filter(([k]) => isLibrarySlot(k)).flatMap(([, arr]) => arr);
        const localIds = new Set(local.map((f) => f.id));
        const fetched = [];
        for (const [i, row] of rows.filter((r) => !localIds.has(r.id)).entries()) {
          setCloudState((c) => ({ ...c, msg: `Downloading ${row.name} (${i + 1})…` }));
          const rec = await cloud.downloadFile(row);
          await fileStore.put(rec);
          fetched.push(rec);
        }
        const extra = local.filter((f) => !remoteIds.has(f.id));
        if (first) for (const f of extra) await cloud.uploadFile(f);
        else for (const f of extra) await fileStore.remove(f.id);
        const drop = first ? new Set() : new Set(extra.map((f) => f.id));
        setFiles((m) => {
          const n = Object.fromEntries(Object.entries(m).map(([k, arr]) => [k, arr.filter((f) => !drop.has(f.id))]));
          for (const f of fetched) n[f.entryId] = [...(n[f.entryId] || []), f].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          return n;
        });
        if (!remote?.data?.models || first) await cloud.pushState(lib);
        localStorage.setItem(firstKey, '1');
        pulledRef.current = true;
      }),
    [cloudRun],
  );

  useEffect(() => {
    if (!cloud.cloudConfigured) return;
    const apply = (user) => {
      const was = userRef.current?.id;
      userRef.current = user;
      pulledRef.current = false;
      setCloudState((c) => ({ ...c, ready: true, user, status: user ? c.status : 'off', msg: user ? c.msg : '' }));
      if (user && user.id !== was) cloudSync(user);
    };
    cloud.currentUser().then(apply, () => apply(null));
    return cloud.onAuth(apply);
  }, [cloudSync]);

  // push library state (models, defaults, warranty texts) after changes
  useEffect(() => {
    if (!userRef.current || !pulledRef.current) return;
    const t = setTimeout(() => cloudRun('', () => cloud.pushState(library)), 1200);
    return () => clearTimeout(t);
  }, [library, cloudRun]);

  const cloudSignIn = useCallback(async (email, pw) => {
    await cloud.signIn(email, pw);
  }, []);
  const cloudSignOut = useCallback(async () => {
    await cloud.signOut();
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
    if (userRef.current && isLibrarySlot(entryId)) cloudRun(`Uploading ${withMeta.length} file(s) to the cloud…`, async () => { for (const r of withMeta) await cloud.uploadFile(r); });
  }, [files]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeFile = useCallback(async (entryId, fileId) => {
    setFiles((m) => ({ ...m, [entryId]: (m[entryId] || []).filter((f) => f.id !== fileId) }));
    await fileStore.remove(fileId);
    if (userRef.current && isLibrarySlot(entryId)) cloudRun('Removing from the cloud…', () => cloud.deleteFile(fileId));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        if (userRef.current && isLibrarySlot(entryId)) cloudRun('', () => cloud.updateFileOrder(f));
      });
      return { ...m, [entryId]: list };
    });
  }, []);

  const resetAll = useCallback(async () => {
    setProject(DEFAULT_PROJECT());
    setEntries(DEFAULT_INDEX());
    setDuties([]);
    setInputs(defaultInputs());
    setLogo(null);
    setSchedule(DEFAULT_SCHEDULE());
    setLiterature([]);
    setReplies([]);
    setToolInputs(Object.fromEntries(Object.values(TOOLS).map((t) => [t.key, t.defaults()])));
    setStamp(null);
    // keep the Document Library (constant documents & pump models)
    for (const r of await fileStore.all()) if (!isLibrarySlot(r.entryId)) await fileStore.remove(r.id);
    setFiles((m) => Object.fromEntries(Object.entries(m).filter(([k]) => isLibrarySlot(k))));
    setQuoteDraft(null);
    setCompliance(DEFAULT_COMPLIANCE());
    setDrawing(defaultDrawing());
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

  /* ---------- Document library & quote → submittal ---------- */
  const addModel = useCallback((model) => {
    const id = uid();
    setLibrary((l) => ({ ...l, models: [...l.models, { id, model: String(model || '').trim(), notes: '' }] }));
    return id;
  }, []);
  const updateModel = useCallback((id, patch) => setLibrary((l) => ({ ...l, models: l.models.map((m) => (m.id === id ? { ...m, ...patch } : m)) })), []);
  const removeModel = useCallback(
    async (id) => {
      for (const k of ['datasheet', 'drawing', 'catalogue']) for (const f of files[`libm-${id}-${k}`] || []) await removeFile(`libm-${id}-${k}`, f.id);
      setLibrary((l) => ({ ...l, models: l.models.filter((m) => m.id !== id) }));
    },
    [files, removeFile],
  );
  const setLibrarySettings = useCallback((patch) => setLibrary((l) => ({ ...l, settings: { ...l.settings, ...patch } })), []);

  /** Apply a generated submittal (from a quote) to the workspace. */
  const applyQuote = useCallback((gen) => {
    setProject((p) => ({ ...p, ...gen.project }));
    setSchedule(gen.schedule);
    setLiterature((l) => [...l.filter((x) => !x.fromQuote), ...gen.literature]);
    setEntries(gen.entries);
    setWarrantyDoc(gen.warranty);
  }, []);

  /** Download-ready JSON backup of the library or the whole workspace. */
  const exportBackup = useCallback(
    (kind) =>
      makeBackup(
        kind,
        kind === 'library' ? { library } : { project, entries, duties, inputs, logo, schedule, literature, replies, stamp, toolInputs, library, warrantyDoc, quoteDraft, compliance, drawing },
        files,
      ),
    [library, project, entries, duties, inputs, logo, schedule, literature, replies, stamp, toolInputs, warrantyDoc, quoteDraft, compliance, drawing, files],
  );
  /** Restore a backup (from readBackup). Library imports merge; workspace imports replace. */
  const importBackup = useCallback(async (b) => {
    for (const f of b.files) await fileStore.put(f);
    setFiles((m) => {
      const n = { ...m };
      for (const f of b.files) n[f.entryId] = [...(n[f.entryId] || []).filter((x) => x.id !== f.id), f].sort((a, c) => (a.order ?? 0) - (c.order ?? 0));
      return n;
    });
    const st = b.state || {};
    if (st.library)
      setLibrary((l) => {
        const ids = new Set(st.library.models.map((m) => m.id));
        return { models: [...l.models.filter((m) => !ids.has(m.id)), ...st.library.models], settings: { ...l.settings, ...st.library.settings } };
      });
    if (b.kind === 'workspace') {
      if (st.project) setProject(st.project);
      if (st.entries) setEntries(st.entries);
      if (st.duties) setDuties(st.duties);
      if (st.inputs) setInputs(mergeInputs(st.inputs));
      if ('logo' in st) setLogo(st.logo);
      if (st.schedule) setSchedule(st.schedule);
      if (st.literature) setLiterature(st.literature);
      if (st.replies) setReplies(st.replies);
      if ('stamp' in st) setStamp(st.stamp);
      if (st.toolInputs) setToolInputs((t) => ({ ...t, ...st.toolInputs }));
      if (st.warrantyDoc) setWarrantyDoc(st.warrantyDoc);
      if ('quoteDraft' in st) setQuoteDraft(st.quoteDraft);
      if (st.compliance) setCompliance(st.compliance);
      if (st.drawing) setDrawing(st.drawing);
    }
  }, []);

  const value = {
    cloud: cloudState, cloudSync, cloudSignIn, cloudSignOut, cloudChangePassword: cloud.changePassword,
    library, setLibrary, addModel, updateModel, removeModel, setLibrarySettings,
    drawing, setDrawing,
    compliance, setCompliance, warrantyDoc, setWarrantyDoc, quoteDraft, setQuoteDraft, applyQuote, exportBackup, importBackup,
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

function mergeModels(remote, local) {
  const ids = new Set(remote.map((m) => m.id));
  return [...remote, ...local.filter((m) => !ids.has(m.id))];
}
