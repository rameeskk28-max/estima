// Local preview of the production build WITH the Netlify edge auth function.
//   npm run build && AUTH_SECRET=... APP_USERS='[...]' npm run preview:auth
// (On Netlify itself the edge function runs automatically – this is only for local testing.)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.Netlify = { env: { get: (k) => process.env[k] } };
const { default: auth } = await import('../netlify/edge-functions/auth.js');
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const PORT = Number(process.env.PORT || 8888);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const PUBLIC = [/^\/brand\//, /^\/favicon\.png$/, /^\/icon-\d+\.png$/, /^\/manifest\.webmanifest$/];

async function serveStatic(pathname) {
  let p = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, p);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    await stat(file);
  } catch {
    file = join(DIST, 'index.html'); // SPA fallback (netlify.toml redirect)
  }
  return new Response(await readFile(file), { headers: { 'content-type': TYPES[extname(file)] || 'application/octet-stream' } });
}

createServer(async (req, res) => {
  const url = `http://localhost:${PORT}${req.url}`;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
  const { pathname } = new URL(url);
  const response = PUBLIC.some((r) => r.test(pathname)) ? await serveStatic(pathname) : await auth(request, { next: () => serveStatic(pathname) });
  const headers = {};
  response.headers.forEach((v, k) => (headers[k] = v));
  // allow the Secure cookie over plain http on localhost
  if (headers['set-cookie']) headers['set-cookie'] = headers['set-cookie'].replace('; Secure', '');
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(PORT, () => console.log(`Auth preview on http://localhost:${PORT}`));
