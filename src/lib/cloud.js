// Supabase cloud storage for the shared Document Library.
// Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (Netlify → Site configuration → Environment variables).
import { createClient } from '@supabase/supabase-js';

const URL_ = import.meta.env?.VITE_SUPABASE_URL;
const KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY;
export const cloudConfigured = !!(URL_ && KEY);
export const sb = cloudConfigured ? createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
const BUCKET = 'library';

const need = () => {
  if (!sb) throw new Error('Cloud library is not configured.');
};
const check = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

export async function currentUser() {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user || null;
}
export function onAuth(cb) {
  if (!sb) return () => {};
  const { data } = sb.auth.onAuthStateChange((_e, s) => cb(s?.user || null));
  return () => data.subscription.unsubscribe();
}
// Team members sign in with a username; Supabase needs an email-shaped ID, so usernames map to
// <username>@glestima.netlify.app (no mail is ever sent there).
export const LOGIN_DOMAIN = 'glestima.netlify.app';
export const loginId = (u) => {
  const v = String(u || '').trim().toLowerCase();
  return v.includes('@') ? v : `${v}@${LOGIN_DOMAIN}`;
};
export const displayName = (user) => (user?.email || '').replace(`@${LOGIN_DOMAIN}`, '');
export async function signIn(username, password) {
  need();
  return check(await sb.auth.signInWithPassword({ email: loginId(username), password })).user;
}
export async function changePassword(password) {
  need();
  check(await sb.auth.updateUser({ password }));
}
export async function signOut() {
  if (sb) await sb.auth.signOut();
}

/** Library state (pump models + defaults/warranty texts). */
export async function pullState() {
  need();
  const rows = check(await sb.from('library_state').select('data, updated_at').eq('id', 'main').limit(1));
  return rows[0] || null;
}
export async function pushState(library) {
  need();
  check(await sb.from('library_state').upsert({ id: 'main', data: library, updated_at: new Date().toISOString() }));
}

/** File records (metadata only). */
export async function listFiles() {
  need();
  return check(await sb.from('library_files').select('*').order('ord'));
}
export async function uploadFile(rec) {
  need();
  const path = `${rec.entryId}/${rec.id}.pdf`;
  check(await sb.storage.from(BUCKET).upload(path, new Blob([rec.bytes], { type: 'application/pdf' }), { upsert: true, contentType: 'application/pdf' }));
  check(await sb.from('library_files').upsert({ id: rec.id, slot: rec.entryId, name: rec.name, size: rec.size ?? rec.bytes?.length ?? null, pages: rec.pages ?? null, encrypted: !!rec.encrypted, ord: rec.order ?? 0, path }));
}
export async function updateFileOrder(rec) {
  need();
  check(await sb.from('library_files').update({ ord: rec.order ?? 0 }).eq('id', rec.id));
}
export async function deleteFile(id) {
  need();
  const rows = check(await sb.from('library_files').select('path').eq('id', id));
  if (rows[0]) check(await sb.storage.from(BUCKET).remove([rows[0].path]));
  check(await sb.from('library_files').delete().eq('id', id));
}
export async function downloadFile(row) {
  need();
  const blob = check(await sb.storage.from(BUCKET).download(row.path));
  return { id: row.id, entryId: row.slot, name: row.name, size: row.size, pages: row.pages, encrypted: row.encrypted, order: row.ord, bytes: new Uint8Array(await blob.arrayBuffer()) };
}
