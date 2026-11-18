// Greenland Pump Engineering Suite – server-side authentication (Netlify Edge Function).
//
// Every request passes through here. Without a valid signed session cookie, pages
// redirect to /login/ and other files return 401, so nothing in the app (JS bundle,
// calculators, PDFs) is reachable before signing in.
//
// Configure in Netlify → Site configuration → Environment variables:
//   AUTH_SECRET  long random string used to sign session cookies (npm run gen-secret)
//   APP_USERS    JSON array of users created with `npm run add-user`
//                [{"u":"admin","n":"Full Name","h":"pbkdf2_sha256$50000$<salt>$<hash>"}]
// Missing or invalid settings fail closed: nobody can sign in.

const COOKIE = 'gl_session';
const SESSION_HOURS = 12;
const REMEMBER_DAYS = 30;
const enc = new TextEncoder();

/* ---------------- encoding helpers ---------------- */
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/* ---------------- configuration ---------------- */
function env(name) {
  try {
    return globalThis.Netlify?.env?.get(name) ?? globalThis.process?.env?.[name];
  } catch {
    return undefined;
  }
}

function loadUsers() {
  try {
    const list = JSON.parse(env('APP_USERS') || '[]');
    return Array.isArray(list) ? list.filter((x) => x && x.u && x.h) : [];
  } catch {
    return [];
  }
}

/* ---------------- crypto ---------------- */
async function verifyPassword(password, stored) {
  const [alg, iterStr, saltB64, hashB64] = String(stored).split('$');
  if (alg !== 'pbkdf2_sha256') return false;
  const iterations = Number(iterStr);
  if (!(iterations >= 10000 && iterations <= 200000)) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64(saltB64), iterations }, key, 256);
  return safeEqual(new Uint8Array(bits), b64(hashB64));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function signSession(payload, secret) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

async function readSession(request, secret) {
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [body, sig] = m[1].split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64url(sig), enc.encode(body));
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(unb64url(body)));
    if (!data.exp || data.exp < Date.now()) return null;
    // A user removed from APP_USERS loses access immediately.
    const user = loadUsers().find((x) => x.u.toLowerCase() === String(data.u).toLowerCase());
    if (!user) return null;
    return { username: user.u, name: user.n || user.u, role: user.r || 'user', exp: data.exp };
  } catch {
    return null;
  }
}

/* ---------------- responses ---------------- */
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

const cookieHeader = (value, maxAgeSec) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;

const safeNext = (n) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/login') ? n : '/');

/* ---------------- handler ---------------- */
export default async function auth(request, context) {
  const url = new URL(request.url);
  const path = url.pathname;
  const secret = env('AUTH_SECRET');
  const configured = !!secret && secret.length >= 32;

  // Login page itself is public
  if (path === '/login' || path.startsWith('/login/')) return context.next();

  if (path === '/api/login') {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    if (!configured) return json({ error: 'Sign-in is not configured on the server (AUTH_SECRET missing). Contact your administrator.' }, 503);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid request' }, 400);
    }
    const username = String(body?.username || '').trim().slice(0, 64);
    const password = String(body?.password || '').slice(0, 256);
    if (!username || !password) return json({ error: 'Enter your username and password.' }, 400);
    const users = loadUsers();
    if (!users.length) return json({ error: 'No user accounts are configured (APP_USERS). Contact your administrator.' }, 503);
    const user = users.find((x) => x.u.toLowerCase() === username.toLowerCase());
    // Always run a hash so response time does not reveal whether the username exists.
    const ok = await verifyPassword(password, user ? user.h : 'pbkdf2_sha256$50000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    if (!user || !ok || user.disabled) {
      await new Promise((r) => setTimeout(r, 400));
      return json({ error: 'Incorrect username or password.' }, 401);
    }
    const maxAge = body?.remember ? REMEMBER_DAYS * 86400 : SESSION_HOURS * 3600;
    const token = await signSession({ u: user.u, exp: Date.now() + maxAge * 1000, iat: Date.now() }, secret);
    return json({ ok: true, user: { username: user.u, name: user.n || user.u } }, 200, { 'set-cookie': cookieHeader(token, maxAge) });
  }

  if (path === '/api/logout') {
    return new Response(null, { status: 302, headers: { location: '/login/?signedout=1', 'set-cookie': cookieHeader('', 0), 'cache-control': 'no-store' } });
  }

  const session = configured ? await readSession(request, secret) : null;

  if (path === '/api/me') {
    return session ? json({ user: session }) : json({ error: 'Not signed in' }, 401);
  }

  if (!session) {
    const wantsHtml = request.method === 'GET' && (request.headers.get('accept') || '').includes('text/html');
    if (wantsHtml) {
      const next = safeNext(path + url.search);
      return new Response(null, { status: 302, headers: { location: `/login/${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`, 'cache-control': 'no-store' } });
    }
    return json({ error: 'Authentication required' }, 401);
  }

  const res = await context.next();
  // Authenticated content must never be stored by shared caches.
  const out = new Response(res.body, res);
  out.headers.set('cache-control', path.startsWith('/assets/') ? 'private, max-age=31536000, immutable' : 'private, no-cache');
  return out;
}

export const config = {
  path: '/*',
  excludedPath: ['/brand/*', '/favicon.png', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest'],
};
