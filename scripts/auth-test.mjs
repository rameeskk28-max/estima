// Tests the Netlify edge auth function in Node with a simulated Netlify runtime.
//   npm run test:auth
import { pbkdf2Sync, randomBytes, createHmac } from 'node:crypto';

const salt = randomBytes(16);
const h = `pbkdf2_sha256$50000$${salt.toString('base64')}$${pbkdf2Sync('Greenland@2026', salt, 50000, 32, 'sha256').toString('base64')}`;
const ENV = { AUTH_SECRET: randomBytes(48).toString('base64url'), APP_USERS: JSON.stringify([{ u: 'engineer', n: 'Site Engineer', h }]) };
globalThis.Netlify = { env: { get: (k) => ENV[k] } };
const { default: auth } = await import('../netlify/edge-functions/auth.js');
const ctx = { next: async () => new Response('APP CONTENT', { headers: { 'content-type': 'text/html' } }) };
const req = (path, opts = {}) => new Request('https://site.netlify.app' + path, opts);

let fails = 0;
const ok = (c, m) => {
  console.log((c ? 'ok   ' : 'FAIL ') + m);
  if (!c) fails++;
};

let r = await auth(req('/', { headers: { accept: 'text/html' } }), ctx);
ok(r.status === 302 && r.headers.get('location') === '/login/', 'anonymous page -> redirect to /login/');
r = await auth(req('/assets/index.js'), ctx);
ok(r.status === 401, 'anonymous asset -> 401');
r = await auth(req('/login/'), ctx);
ok(r.status === 200 && (await r.text()) === 'APP CONTENT', 'login page is public');

const login = (u, p, remember) =>
  auth(req('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: p, remember }) }), ctx);
let t = Date.now();
r = await login('engineer', 'wrong');
ok(r.status === 401 && (await r.json()).error.includes('Incorrect'), `wrong password -> 401 (${Date.now() - t} ms)`);
r = await login('nobody', 'whatever');
ok(r.status === 401, 'unknown user -> 401 (same message)');
t = Date.now();
r = await login('ENGINEER', 'Greenland@2026', false);
const setCookie = r.headers.get('set-cookie') || '';
ok(r.status === 200 && /HttpOnly; Secure; SameSite=Lax; Max-Age=43200/.test(setCookie), `correct login -> cookie 12 h (${Date.now() - t} ms)`);
r = await login('engineer', 'Greenland@2026', true);
ok(/Max-Age=2592000/.test(r.headers.get('set-cookie')), 'remember me -> 30 days');

const cookie = setCookie.split(';')[0];
r = await auth(req('/', { headers: { cookie, accept: 'text/html' } }), ctx);
ok(r.status === 200 && (await r.text()) === 'APP CONTENT' && r.headers.get('cache-control').startsWith('private'), 'signed-in page served with private cache');
r = await auth(req('/api/me', { headers: { cookie } }), ctx);
const me = await r.json();
ok(r.status === 200 && me.user.name === 'Site Engineer', 'GET /api/me returns user');

const sig = cookie.split('=')[1].split('.')[1];
const forged = Buffer.from(JSON.stringify({ u: 'engineer', exp: Date.now() + 9e9 })).toString('base64url');
r = await auth(req('/', { headers: { cookie: `gl_session=${forged}.${sig}`, accept: 'text/html' } }), ctx);
ok(r.status === 302, 'forged cookie rejected');
const old = Buffer.from(JSON.stringify({ u: 'engineer', exp: Date.now() - 1000 })).toString('base64url');
const oldSig = createHmac('sha256', ENV.AUTH_SECRET).update(old).digest('base64url');
r = await auth(req('/api/me', { headers: { cookie: `gl_session=${old}.${oldSig}` } }), ctx);
ok(r.status === 401, 'expired cookie rejected');
const saved = ENV.APP_USERS;
ENV.APP_USERS = '[]';
r = await auth(req('/api/me', { headers: { cookie } }), ctx);
ok(r.status === 401, 'user removed from APP_USERS loses access');
ENV.APP_USERS = saved;
r = await auth(req('/api/logout'), ctx);
ok(r.status === 302 && /Max-Age=0/.test(r.headers.get('set-cookie')), 'logout clears cookie');
r = await auth(req('//evil.com', { headers: { accept: 'text/html' } }), ctx);
ok(!(r.headers.get('location') || '').includes('evil'), 'no open redirect');
ENV.AUTH_SECRET = '';
r = await login('engineer', 'Greenland@2026');
ok(r.status === 503, 'missing AUTH_SECRET -> sign-in disabled (fail closed)');
r = await auth(req('/', { headers: { accept: 'text/html' } }), ctx);
ok(r.status === 302, 'missing AUTH_SECRET -> app still locked');

if (fails) {
  console.error(`${fails} failure(s)`);
  process.exit(1);
}
console.log('All auth tests passed.');
