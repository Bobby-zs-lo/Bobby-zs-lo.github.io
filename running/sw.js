// Running PWA service worker.
//
// Registered as a MODULE service worker (navigator.serviceWorker.register(
// './sw.js', { type: 'module' })), supported by Chrome/Android Chrome 91+.
// That lets it import API_BASE from js/config.js, so the Worker URL lives in
// exactly one file. Module SWs may not use importScripts() or dynamic import(),
// only static imports like this one. Chrome also byte-checks imported modules
// on update, so editing config.js alone triggers a service-worker update.
import { API_BASE, APP_VERSION } from './js/config.js';

const SHELL_CACHE = `running-shell-${APP_VERSION}`;
const API_CACHE = 'running-api';      // must match js/api.js
const FONT_CACHE = 'running-fonts';
const SCOPE = self.registration.scope; // https://bobbylo.dk/running/
const API_URL = new URL(API_BASE);
const API_ORIGIN = API_URL.origin;
const API_PREFIX = API_URL.pathname.replace(/\/+$/, ''); // '/api' for a Cloud Function named api
const CACHED_API = new Set(['/api/week', '/api/state', '/api/plan']);
// Firebase JS SDK (www.gstatic.com) and Google sign-in / token endpoints are
// never intercepted or cached here: the browser fetches them directly.
const PASS_THROUGH = /^(www\.gstatic\.com|apis\.google\.com|accounts\.google\.com|[a-z0-9-]+\.googleapis\.com|[a-z0-9-]+\.firebaseapp\.com|[a-z0-9-]+\.web\.app)$/;

const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/running.css',
  './js/config.js', './js/app.js', './js/api.js', './js/auth.js', './js/router.js', './js/format.js',
  './js/markdown.js', './js/push.js', './js/store.js', './js/dom.js', './js/ui.js',
  './js/icons.js', './js/sparkline.js', './js/changes.js',
  './js/views/common.js', './js/views/login.js', './js/views/today.js', './js/views/week.js',
  './js/views/plan.js', './js/views/health.js', './js/views/reviews.js', './js/views/settings.js',
  './assets/icon-192.png', './assets/icon-512.png', './assets/icon-maskable.png', './assets/badge-96.png',
];

const asset = p => new URL(p, SCOPE).href;
const ICON = asset('assets/icon-192.png');
const BADGE = asset('assets/badge-96.png');

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k.startsWith('running-shell-') && k !== SHELL_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// ── fetch ───────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === API_ORIGIN && url.pathname.startsWith(API_PREFIX + '/')) {
    if (CACHED_API.has(url.pathname.slice(API_PREFIX.length))) e.respondWith(apiNetworkFirst(req));
    return; // other API calls go straight to the network
  }
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    e.respondWith(cacheFirst(req, FONT_CACHE));
    return;
  }
  if (PASS_THROUGH.test(url.hostname)) return; // Firebase SDK and auth: network only
  if (url.origin !== self.location.origin || !req.url.startsWith(SCOPE)) return;

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(async () => (await caches.match(asset('index.html'))) || Response.error()));
    return;
  }
  // config.js and the manifest must never be answered from a stale cache: config.js carries
  // API_BASE, and a stale manifest keeps Chrome on an old app identity, which makes the install
  // state unrecoverable from inside the page. Both stay precached for offline use.
  if (url.pathname.endsWith('/js/config.js') || url.pathname.endsWith('/manifest.webmanifest')) {
    e.respondWith(shellNetworkFirst(req));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req)));
});

async function cacheFirst(req, name) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') (await caches.open(name)).put(req, res.clone());
  return res;
}

async function shellNetworkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(SHELL_CACHE)).put(req, res.clone());
    return res;
  } catch {
    return (await caches.match(req, { ignoreSearch: true })) || Response.error();
  }
}

/** Network first; on success store a copy stamped with X-Running-Saved-At.
 *  Offline: answer with that copy plus X-Running-Offline: 1 (the page shows a badge). */
async function apiNetworkFirst(req) {
  const cache = await caches.open(API_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) {
      const body = await res.clone().arrayBuffer();
      await cache.put(req.url, new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-Running-Saved-At': new Date().toISOString() },
      }));
    }
    return res;
  } catch {
    const hit = await cache.match(req.url);
    const headers = { 'Content-Type': 'application/json', 'X-Running-Offline': '1' };
    if (hit) {
      headers['X-Running-Saved-At'] = hit.headers.get('X-Running-Saved-At') || '';
      return new Response(await hit.arrayBuffer(), { status: 200, headers });
    }
    return new Response(JSON.stringify({ error: 'You’re offline and this page hasn’t been saved yet.' }), { status: 503, headers });
  }
}

// ── push ────────────────────────────────────────────────────────────────────
// Payload (spec 4.9): {title, body, url, tag, actions:[{action,title}], actionToken?}
// Plan actions POST to the API with the single-use action token in the body;
// no Firebase ID token is needed (or available) inside the service worker.
self.addEventListener('push', e => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch { p = { body: e.data ? e.data.text() : '' }; }
  const opts = {
    body: p.body || '',
    tag: p.tag || undefined,
    renotify: !!p.tag,
    icon: ICON,
    badge: BADGE,
    data: { url: p.url || './#/today', actionToken: p.actionToken || null },
    actions: Array.isArray(p.actions) ? p.actions.slice(0, 2).filter(a => a && a.action && a.title) : [],
  };
  e.waitUntil(self.registration.showNotification(p.title || 'Running', opts));
});

const CONFIRM = {
  done: 'Marked as done ✓',
  skip: 'Skipped. Rest well.',
  move_tomorrow: 'Moved to tomorrow',
  undo_status: 'Status reset',
};

/** Actions named open… just navigate; anything else is a plan action that needs the token. */
const isPlanAction = a => !!a && !a.startsWith('open');

self.addEventListener('notificationclick', e => {
  const n = e.notification;
  const { url, actionToken } = n.data || {};
  n.close();
  let target = new URL(url || './#/today', SCOPE).href;
  if (!target.startsWith(SCOPE)) target = new URL('./#/today', SCOPE).href; // never open other origins

  if (e.action && actionToken && isPlanAction(e.action)) {
    e.waitUntil((async () => {
      let ok = false, msg = '';
      try {
        const r = await fetch(`${API_BASE}/api/notification-action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: actionToken, action: e.action }),
        });
        ok = r.ok;
        if (!ok) { try { msg = (await r.json()).error || ''; } catch { /* not JSON */ } }
      } catch { msg = 'No connection.'; }
      await self.registration.showNotification(ok ? (CONFIRM[e.action] || 'Done') : 'Couldn’t update the plan', {
        body: ok ? '' : `${msg || 'Something went wrong.'} Tap to open the app.`,
        tag: 'running-action-result', icon: ICON, badge: BADGE, silent: ok,
        data: { url: target, actionToken: null },
      });
    })());
    return;
  }
  e.waitUntil(focusOrOpen(target));
});

async function focusOrOpen(target) {
  const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const mine = wins.find(c => c.url.startsWith(SCOPE));
  if (mine) {
    await mine.focus();
    const hash = new URL(target).hash;
    if (hash) mine.postMessage({ type: 'navigate', hash });
    return;
  }
  await self.clients.openWindow(target);
}
