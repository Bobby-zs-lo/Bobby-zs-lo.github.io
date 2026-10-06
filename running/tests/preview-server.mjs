// Local preview of the Running PWA against invented data. No backend, no sign-in, no network but the fonts.
//
//   node running/tests/preview-server.mjs [--port 5173] [--home]
//
// Serves the portfolio repo root on 127.0.0.1 and then changes three things on the way out:
//   /running/js/config.js   API_BASE points at this server's /mock-api instead of the live Cloud Function.
//   /running/ (index.html)  an inline script, run before the app, installs a signed-in fake auth
//                           (globalThis.__RUNNING_TEST_AUTH__, the hook js/auth.js reads) and turns
//                           service-worker registration into a no-op, so nothing is cached.
//   /mock-api/*             answered by tests/mock-api.mjs from tests/fixtures/.
// --home gives the mock settings a home location (the fictional centre), so route generation has a start.
//
// Why: the app shows Strava data and Strava's API policy forbids that data reaching an AI, so a
// Claude session working on the app runs it here, on invented data only, and never calls the live API.
// Edit the real files and reload: nothing here is cached (Cache-Control: no-store).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMockApi, MOCK_TOKENS } from './mock-api.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..'); // the portfolio repo root: running/tests/ → running/ → root
const DEFAULT_PORT = 5173;
const API_MOUNT = '/mock-api';
const MAX_BODY_BYTES = 1_000_000;
const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/;
const FICTIONAL_HOME = { lat: 55.7, lng: 12.55 };

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.txt': 'text/plain', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.map': 'application/json',
};
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
};

// Same shape as fakeAuth in smoke.playwright.mjs: a signed-in owner; sign-out and sign-in both work.
// Plain ES5-ish text, because it is injected into the page verbatim.
const PREVIEW_SCRIPT = `<script>
// Injected by running/tests/preview-server.mjs: fake sign-in and no service worker. Not part of the app.
(function () {
  var TOKEN = ${JSON.stringify(MOCK_TOKENS.owner)};
  var owner = { uid: 'uid-owner', email: 'owner@example.com', displayName: 'owner', kind: 'owner' };
  var user = owner;
  var listeners = [];
  function emit() { listeners.slice().forEach(function (cb) { cb(user); }); }
  globalThis.__RUNNING_TEST_AUTH__ = {
    initAuth: function () { return Promise.resolve(user); },
    onUser: function (cb) { listeners.push(cb); return function () { listeners = listeners.filter(function (x) { return x !== cb; }); }; },
    signIn: function () { user = owner; emit(); return Promise.resolve(user); },
    signOut: function () { user = null; emit(); return Promise.resolve(); },
    getIdToken: function () { return Promise.resolve(user ? TOKEN : null); },
    currentUser: function () { return user; }
  };
  if (navigator.serviceWorker) {
    navigator.serviceWorker.register = function () { return Promise.resolve({}); };
  }
})();
</script>`;

function parseArgs(argv) {
  const opts = { port: DEFAULT_PORT, home: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--home') opts.home = true;
    else if (arg === '--port' || arg.startsWith('--port=')) {
      const value = arg === '--port' ? argv[++i] : arg.slice('--port='.length);
      const port = Number(value);
      if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`invalid --port: ${value}`);
      opts.port = port;
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return opts;
}

/** The app's config.js with API_BASE replaced. Throws if the declaration is not where it is expected. */
export function rewriteConfig(source, apiBase) {
  const declaration = /export const API_BASE\s*=\s*(['"`]).*?\1\s*;/;
  if (!declaration.test(source)) throw new Error('could not find "export const API_BASE = …;" in js/config.js');
  return source.replace(declaration, () => `export const API_BASE = ${JSON.stringify(apiBase)};`);
}

/** index.html with the preview script inserted before the first module script (or, failing that, before </head>). */
export function injectPreview(html) {
  const moduleScript = /<script\s[^>]*type=["']module["']/i;
  if (moduleScript.test(html)) return html.replace(moduleScript, (tag) => `${PREVIEW_SCRIPT}\n  ${tag}`);
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, (tag) => `${PREVIEW_SCRIPT}\n${tag}`);
  throw new Error('could not find a module <script> or </head> in running/index.html');
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Body too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
const sendJson = (res, status, data, headers = {}) => send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...headers });

// A path segment starting with '.' (.git, .claude, .env) is never served, even though this only listens on 127.0.0.1.
function resolveStatic(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (decoded.includes('\0') || decoded.split('/').some((segment) => segment.startsWith('.') || segment === '..')) return null;
  const file = resolve(join(REPO, decoded.endsWith('/') ? `${decoded}index.html` : decoded));
  return file.startsWith(REPO + sep) ? file : null;
}

// Case-insensitive on purpose: on Windows /Running/JS/Config.js is the same file, and it must not slip past the rewrite.
const isAppFile = (file, ...parts) => file.toLowerCase() === join(REPO, 'running', ...parts).toLowerCase();

export function createPreviewServer({ port, home = false }) {
  const settings = home ? { home: FICTIONAL_HOME } : {};
  const mock = createMockApi({ fixturesDir: join(HERE, 'fixtures'), settings });

  async function handleApi(req, res, url) {
    const path = url.pathname.slice(API_MOUNT.length) || '/';
    let body = null;
    try {
      const text = await readBody(req);
      if (text.trim()) {
        try { body = JSON.parse(text); } catch { return sendJson(res, 400, { error: 'Body must be JSON' }); }
      }
    } catch (e) {
      return sendJson(res, e.status || 400, { error: e.message });
    }
    const { status, json } = await mock({ method: req.method, path, search: url.search, body, authz: req.headers.authorization || null });
    console.log(`[mock-api] ${req.method} ${path}${url.search} -> ${status}`);
    return sendJson(res, status, json);
  }

  async function handleStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed', { Allow: 'GET, HEAD' });
    if (url.pathname === '/running') return send(res, 301, '', { Location: '/running/' });
    const file = resolveStatic(url.pathname);
    if (!file) return send(res, 403, 'forbidden');
    let content;
    try { content = await readFile(file); } catch { return send(res, 404, 'not found'); }
    const type = TYPES[extname(file)] || 'application/octet-stream';
    if (isAppFile(file, 'js', 'config.js')) {
      const host = LOCAL_HOST.test(req.headers.host || '') ? req.headers.host : `127.0.0.1:${port}`;
      content = rewriteConfig(content.toString('utf8'), `http://${host}${API_MOUNT}`);
    } else if (isAppFile(file, 'index.html')) {
      content = injectPreview(content.toString('utf8'));
    }
    return send(res, 200, req.method === 'HEAD' ? '' : content, { 'Content-Type': type });
  }

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (req.method === 'OPTIONS') return send(res, 204, '', CORS);
      if (url.pathname === API_MOUNT || url.pathname.startsWith(`${API_MOUNT}/`)) return await handleApi(req, res, url);
      return await handleStatic(req, res, url);
    } catch (e) {
      console.error(`[preview] ${req.method} ${req.url} failed: ${e.message}`);
      return send(res, 500, `preview server error: ${e.message}`);
    }
  });
}

// Only listen when run as a script, so the helpers above can be imported by tests.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) {
    console.error(`${e.message}\nusage: node running/tests/preview-server.mjs [--port 5173] [--home]`);
    process.exit(2);
  }
  const server = createPreviewServer(opts);
  server.on('error', (e) => { console.error(`cannot listen on 127.0.0.1:${opts.port}: ${e.message}`); process.exit(1); });
  server.listen(opts.port, '127.0.0.1', () => {
    console.log(`Preview: http://127.0.0.1:${server.address().port}/running/`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
