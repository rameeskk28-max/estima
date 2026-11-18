import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CALCULATORS } from './lib/calcs/index.js';
import { DEFAULT_INDEX, DEFAULT_PROJECT } from './lib/submittalDefaults.js';
import { fileStore } from './lib/fileStore.js';
import { BRAND, brandLogoBytes } from './brand.js';

const Ctx = createContext(null);
const KEY = 'pump-submittal-v1';

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return null;
}

const defaultInputs = () => Object.fromEntries(Object.values(CALCULATORS).map((c) => [c.key, c.defaults()]));

export function StoreProvider({ children }) {
  const saved = useMemo(loadState, []);
  const [project, setProject] = useState(() => ({ ...DEFAULT_PROJECT(), ...(saved?.project || {}) }));
  const [entries, setEntries] = useState(() => saved?.entries || DEFAULT_INDEX());
  const [duties, setDuties] = useState(() => saved?.duties || []);
  const [inputs, setInputs] = useState(() => ({ ...defaultInputs(), ...(saved?.inputs || {}) }));
  const [files, setFiles] = useState({}); // entryId -> [{id,name,size,pages,bytes}]
  const [logo, setLogo] = useState(saved?.logo || null); // {dataUrl,type,name}
  const [toast, setToast] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ project, entries, duties, inputs, logo }));
    } catch {
      /* quota – ignore */
    }
  }, [project, entries, duties, inputs, logo]);

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

  const value = {
    getLogo, logoSrc,
    project, setProject, entries, setEntries, duties, setDuties, inputs, setCalcInputs, saveDuty,
    files, addFiles, removeFile, moveFile, logo, setLogo, toast, notify, resetAll, uid,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
