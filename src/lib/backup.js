// Backup files: move the Document Library (or the whole workspace) to another computer.
const APP = 'greenland-pump-suite';

function toB64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Library slots: constant documents (lib-*) and pump-model files (libm-*). */
export const isLibrarySlot = (slot) => slot.startsWith('lib-') || slot.startsWith('libm-');

/**
 * @param {'library'|'workspace'} kind
 * @param {object} state  serialisable app state (library only, or everything)
 * @param {Record<string, {id,name,size,pages,encrypted,order,bytes}[]>} files
 */
export function makeBackup(kind, state, files) {
  const list = [];
  for (const [slot, arr] of Object.entries(files || {})) {
    if (kind === 'library' && !isLibrarySlot(slot)) continue;
    for (const f of arr || []) list.push({ slot, id: f.id, name: f.name, size: f.size, pages: f.pages, encrypted: !!f.encrypted, order: f.order ?? 0, data: toB64(f.bytes) });
  }
  return JSON.stringify({ app: APP, kind, version: 1, created: new Date().toISOString(), state, files: list });
}

export function readBackup(text) {
  let o;
  try {
    o = JSON.parse(text);
  } catch {
    throw new Error('Not a valid backup file.');
  }
  if (o?.app !== APP || !Array.isArray(o.files)) throw new Error('This file is not a Greenland Pump Suite backup.');
  return {
    kind: o.kind,
    created: o.created,
    state: o.state || {},
    files: o.files.map((f) => ({ entryId: f.slot, id: f.id, name: f.name, size: f.size, pages: f.pages, encrypted: f.encrypted, order: f.order, bytes: fromB64(f.data) })),
  };
}
