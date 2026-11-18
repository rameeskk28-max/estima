// IndexedDB persistence for uploaded PDFs (too large for localStorage).
const DB = 'pump-submittal';
const STORE = 'files';

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    const r = fn(s);
    t.oncomplete = () => resolve(r?.result);
    t.onerror = () => reject(t.error);
  });
}

export const fileStore = {
  async all() {
    try {
      return (await tx('readonly', (s) => s.getAll())) || [];
    } catch {
      return [];
    }
  },
  async put(rec) {
    try {
      await tx('readwrite', (s) => s.put(rec));
    } catch {
      /* in-memory only */
    }
  },
  async remove(id) {
    try {
      await tx('readwrite', (s) => s.delete(id));
    } catch {
      /* ignore */
    }
  },
  async clear() {
    try {
      await tx('readwrite', (s) => s.clear());
    } catch {
      /* ignore */
    }
  },
};
