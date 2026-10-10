// Playwright smoke test for the Running PWA against the shared mock API (tests/mock-api.mjs,
// invented fixtures only) and a fake Firebase Auth (globalThis.__RUNNING_TEST_AUTH__, injected
// with addInitScript, so the real Firebase SDK is never loaded). Nothing reaches the live API,
// Strava or OpenRouteService; the maps load Leaflet from cdnjs and tiles from openstreetmap.org
// (no personal data), and links out to Google, Strava, Garmin and CCC are aborted.
//
//   node running/tests/smoke.playwright.mjs
//
// Env:
//   PLAYWRIGHT_NODE_MODULES  node_modules dir that contains `playwright` (it is
//                            not a dependency of this repo)
//   CHROMIUM_PATH            browser binary (default: /opt/pw-browsers/chromium if present)
//   SHOTS_DIR                where screenshots go (default: /tmp/running-shots)
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { API_BASE, APP_VERSION } from '../js/config.js';
import { formatDistance } from '../js/format.js';
import { decodePolyline } from '../js/polyline.js';
import { createMockApi, MOCK_TOKENS } from './mock-api.mjs';
import { linkSteps } from './smoke-links.playwright.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const SHOTS = process.env.SHOTS_DIR || '/tmp/running-shots';
const API_PREFIX = new URL(API_BASE).pathname.replace(/\/+$/, ''); // Cloud Function path, e.g. '/api'
const FIXTURES = join(HERE, 'fixtures');
// 'expired' is no token the mock knows, so it answers 401; the others are the mock's own.
const TOKENS = { owner: MOCK_TOKENS.owner, stranger: MOCK_TOKENS.stranger, expired: 'expired-token' };

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fall through */ }
  const dir = process.env.PLAYWRIGHT_NODE_MODULES;
  if (!dir) throw new Error('playwright not found: set PLAYWRIGHT_NODE_MODULES=/path/to/node_modules');
  return createRequire(join(dir, 'noop.js'))('playwright');
}

// ── static server for the repo root ─────────────────────────────────────────
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
function serve() {
  const srv = createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(REPO, p));
    if (!file.startsWith(REPO)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch { res.writeHead(404).end('not found'); }
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

// ── API transport ───────────────────────────────────────────────────────────
// The behaviour is tests/mock-api.mjs (shared with the preview server); this only moves a
// Playwright request into its { method, path, search, body, authz } form and its answer back out.
// Fixtures are the invented ones in tests/fixtures/. The live API is never called.
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS' };
function apiRoute(api, log) {
  const answer = (route, status, data) => route.fulfill({ status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  return async route => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    const authz = req.headers().authorization || null;
    const entry = { method, path: url.pathname, search: url.search, body, auth: authz };
    log.push(entry);
    if (!url.pathname.startsWith(API_PREFIX + '/')) return answer(route, 404, { error: 'outside the API prefix' });
    entry.path = url.pathname.slice(API_PREFIX.length);
    const { status, json } = await api({ method, path: entry.path, search: url.search, body, authz });
    return answer(route, status, json);
  };
}

// ── fake Firebase Auth (runs in the page before any app code) ──────────────
function fakeAuth(cfg) {
  const TOKENS = cfg.tokens;
  const mk = kind => ({ uid: `uid-${kind}`, email: `${kind}@example.com`, displayName: kind, kind });
  let user = cfg.user ? mk(cfg.user) : null;
  let fails = cfg.signInFails || 0;
  const listeners = new Set();
  const emit = () => listeners.forEach(cb => cb(user));
  const calls = window.__authCalls = [];
  globalThis.__RUNNING_TEST_AUTH__ = {
    initAuth: () => new Promise(r => setTimeout(() => r(user), cfg.delay || 0)),
    onUser: cb => { listeners.add(cb); return () => listeners.delete(cb); },
    signIn: async () => {
      calls.push('signIn');
      if (fails-- > 0) throw Object.assign(new Error('Firebase: Error (auth/popup-blocked).'), { code: 'auth/popup-blocked' });
      user = mk(cfg.signInAs || 'owner'); emit(); return user;
    },
    signOut: async () => { calls.push('signOut'); user = null; emit(); },
    getIdToken: async () => (user ? TOKENS[user.kind] : null),
    currentUser: () => user,
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────
async function overflow(page) {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const bad = [];
    // Content inside a box that scrolls or clips sideways (the Health log table) may run past the
    // viewport on purpose; the box itself is still checked. <body> clips too, so stop below it.
    const contained = el => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        if (getComputedStyle(a).overflowX !== 'visible') return true;
      }
      return false;
    };
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.position === 'fixed') continue;
      if (el.closest('.sr-only,.skip,.toasts') || contained(el)) continue;
      if (r.right > W + 0.5 || r.left < -0.5) bad.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} [${Math.round(r.left)}..${Math.round(r.right)}]`);
    }
    return { W, scrollW: document.documentElement.scrollWidth, bad: bad.slice(0, 8) };
  });
}

let passed = 0;
async function step(name, fn) {
  try { await fn(); passed++; console.log(`ok - ${name}`); }
  catch (e) { console.log(`not ok - ${name}`); throw e; }
}

// ── run ─────────────────────────────────────────────────────────────────────
const { chromium } = await loadPlaywright();
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
// A backstop under the route handlers further down: in this browser the live API's host does not
// resolve. A request that slips past the handlers (Playwright lets one out to the network when its
// handler is removed while it is in flight) then fails by name instead of reaching the backend.
const LIVE_API_UNREACHABLE = `--host-resolver-rules=MAP ${new URL(API_BASE).hostname} ~NOTFOUND`;
const browser = await chromium.launch({ executablePath, args: [LIVE_API_UNREACHABLE] });
const srv = await serve();
const ORIGIN = `http://127.0.0.1:${srv.address().port}`;
const APP = `${ORIGIN}/running/`;
await mkdir(SHOTS, { recursive: true });

// Links and imports the app can open in a new tab: nothing of the sort may load in a test.
const EXTERNAL_HOST = /^(.+\.)?(google|strava|garmin)\.com$|^(.+\.)?ccc-bike\.com$/;

// desk: a 1440 × 900 desktop window (≥ 1100 px, so js/layout.js picks the rail layout).
// settings: overrides for the mock's settings, e.g. a home location for the route generator.
async function newPage({ user = 'owner', signInFails = 0, delay = 0, scheme = 'light', sw = 'block', desk = false, settings } = {}) {
  const device = desk
    ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false }
    : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const ctx = await browser.newContext({
    ...device,
    colorScheme: scheme, serviceWorkers: sw, timezoneId: 'Europe/Copenhagen', locale: 'en-GB',
  });
  // Fonts come from Google; keep the test hermetic and fast.
  // REAL_FONTS=1 fetches them through Node (honours the proxy) for nicer screenshots.
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, async r => {
    if (process.env.REAL_FONTS) { try { return await r.fulfill({ response: await r.fetch() }); } catch { /* offline */ } }
    return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
  });
  await ctx.route(url => EXTERNAL_HOST.test(url.hostname), r => r.abort());
  const log = [];
  const api = createMockApi({ fixturesDir: FIXTURES, routeDelayMs: 0, planDelayMs: 0, ...(settings ? { settings } : {}) });
  await ctx.route(`${new URL(API_BASE).origin}/**`, apiRoute(api, log));
  // Test mode must never load the real SDK; count any attempt.
  const sdkRequests = [];
  await ctx.route(/www\.gstatic\.com\/firebasejs\//, r => { sdkRequests.push(r.request().url()); return r.abort(); });
  await ctx.addInitScript(fakeAuth, { user, signInFails, delay, tokens: TOKENS });
  const page = await ctx.newPage();
  page.sdkRequests = sdkRequests;
  const popups = [];
  ctx.on('page', p => popups.push(p.url()));
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return { ctx, page, log, errors, popups };
}
async function go(page, route) {
  await page.goto(`${APP}#/${route}`);
  await page.waitForSelector('.view > :not(.state)', { timeout: 10000 });
  await page.waitForTimeout(150);
}
const MIN_TILES = 10;
// Overview paints its own header and 16 tiles at once, each saying "Loading…" until the data is in.
// Ready means the h1 is there, the dashboard is no longer busy and no tile is still loading.
async function overviewReady(page) {
  await page.waitForSelector('#view > .ov-head h1');
  await page.waitForSelector('.dash[aria-busy="false"]', { timeout: 15000 });
  assert.equal(await page.textContent('#view h1'), 'Overview');
  const tiles = await page.locator('#view .tile').count();
  assert.ok(tiles >= MIN_TILES, `Overview renders ${tiles} tiles`);
  assert.equal(await page.locator('#view .ov-loading').count(), 0, 'no tile still loading');
}
// After a viewport change: the charts redraw on the next animation frame, so give them two and a beat.
const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 250)))));

try {
  await step('login screen (Google sign-in) when signed out; popup blocked, then sign in', async () => {
    const { ctx, page, errors, log } = await newPage({ user: null, signInFails: 1 });
    await page.goto(APP);
    await page.waitForSelector('#google-signin');
    assert.equal(new URL(page.url()).hash, '#/login');
    assert.match(await page.textContent('#google-signin'), /Sign in with Google/);
    assert.match(await page.textContent('.login'), /Only Bobby’s Google account can open this app\./);
    assert.equal(await page.$$eval('input', e => e.length), 0, 'no passphrase or device-name fields');
    assert.ok(!(await page.isVisible('#tabs')), 'tab bar hidden on login');
    assert.equal(await page.getAttribute('meta[name=robots]', 'content'), 'noindex,nofollow');
    // popup blocked → error toast suggesting another try
    await page.click('#google-signin');
    await page.waitForSelector('.toast--error');
    assert.match(await page.textContent('.toast--error'), /blocked.*try again/i);
    assert.equal(new URL(page.url()).hash, '#/login');
    // second try succeeds → Today
    await page.click('#google-signin');
    await page.waitForSelector('.workout-title');
    assert.equal(new URL(page.url()).hash, '#/today');
    assert.deepEqual(await page.evaluate(() => window.__authCalls), ['signIn', 'signIn']);
    assert.ok(log.length && log.every(l => l.auth === 'Bearer test-token'));
    assert.ok(!log.some(l => l.path === '/api/login'), 'no passphrase login call');
    assert.deepEqual(page.sdkRequests, [], 'fake auth: Firebase SDK not loaded');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await step('router waits for auth state (loading), then decides', async () => {
    const { ctx, page, errors } = await newPage({ user: null, delay: 600 });
    await page.goto(`${APP}#/today`);
    await page.waitForSelector('.state--loading');
    assert.match(await page.textContent('.state--loading'), /Checking sign-in/);
    assert.ok(!(await page.isVisible('#tabs')), 'tab bar hidden while auth resolves');
    assert.equal(new URL(page.url()).hash, '#/today', 'no redirect before auth resolves');
    await page.waitForSelector('#google-signin');
    assert.equal(new URL(page.url()).hash, '#/login');
    assert.deepEqual(errors, []);
    await ctx.close();
    // signed in + slow auth on #/login → ends on Today
    const b = await newPage({ delay: 600 });
    await b.page.goto(`${APP}#/login`);
    await b.page.waitForSelector('.workout-title');
    assert.equal(new URL(b.page.url()).hash, '#/today');
    await b.ctx.close();
  });

  await step('login screenshots', async () => {
    for (const scheme of ['light', 'dark']) {
      const { ctx, page } = await newPage({ user: null, scheme });
      await page.goto(APP); await page.waitForSelector('#google-signin');
      await page.screenshot({ path: join(SHOTS, `login-${scheme}.png`) });
      await ctx.close();
    }
  });

  await step('Today renders fixture workouts, matched activity, actions, check-in', async () => {
    const { ctx, page, log, errors } = await newPage();
    await go(page, 'today');
    const titles = await page.$$eval('.workout-title', els => els.map(e => e.textContent.trim()));
    assert.deepEqual(titles, ['Easy run', 'Core & mobility']);
    const text = await page.textContent('#view');
    assert.match(text, /5:55–6:30\/km/);
    assert.match(text, /Morning Run/);
    assert.match(text, /6:04\/km/);
    assert.match(text, /Commute to Rigshospitalet/);
    assert.match(text, /Week at a glance/);
    assert.equal(await page.$$eval('.strip-day', e => e.length), 7);
    assert.ok(log.every(l => l.auth === 'Bearer test-token'));
    // Done on the strength session
    const card = page.locator('.workout', { hasText: 'Core & mobility' });
    await card.locator('[data-action=done]').click();
    await page.waitForSelector('.workout:has-text("Core & mobility") .chip--done');
    const act = log.find(l => l.path.endsWith('/action'));
    assert.equal(act.path, '/api/workouts/w-2026-10-13-strength/action');
    assert.deepEqual(act.body, { action: 'done' });
    // check-in
    await page.fill('#sleepHours', '7.5');
    await page.check('input[name=sleepQuality][value="4"]', { force: true });
    await page.check('input[name=mood][value="3"]', { force: true });
    await page.check('input[name=energy][value="5"]', { force: true });
    await page.fill('#note', 'Fine');
    await page.click('#checkin button[type=submit]');
    await page.waitForSelector('.toast');
    const ci = log.find(l => l.path === '/api/checkin');
    assert.deepEqual(ci.body, { date: '2026-10-13', sleepHours: 7.5, sleepQuality: 4, soreness: 0, mood: 3, energy: 5, note: 'Fine' });
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await step('Plan renders phase headers and highlights the current week', async () => {
    const { ctx, page, errors } = await newPage();
    await go(page, 'plan');
    const phases = await page.$$eval('.phase-title', els => els.map(e => e.textContent.trim()));
    assert.deepEqual(phases, ['Re-entry', 'Base', 'Half-marathon build', 'Recovery', 'Base II', 'Marathon build', 'Taper']);
    assert.equal(await page.$$eval('.wk.is-current', e => e.length), 1);
    assert.equal(await page.$eval('.wk.is-current details', d => d.open), true);
    assert.ok(await page.$('.wk.is-raceweek .wk-w.is-race'), 'race day marked');
    const y = await page.evaluate(() => window.scrollY);
    assert.ok(y > 0 || (await page.$eval('.wk.is-current', e => e.getBoundingClientRect().top < innerHeight)), 'current week in view');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await step('Week, Health, Reviews, Settings render', async () => {
    const { ctx, page, errors, log } = await newPage();
    await go(page, 'week');
    assert.equal(await page.$$eval('.day', e => e.length), 7);
    assert.match(await page.textContent('.kmbar'), /6\.4\s*\/\s*12 km/); // Tuesday's 5.21 km run and its 1.2 km warm-up
    await page.click('[data-go="7"]');
    await page.waitForFunction(() => location.hash.includes('2026-10-19'));
    // The hash changes before the view does, so the old week's days can still be there: wait for the new heading.
    await page.waitForFunction(() => /19–25 Oct/.test((document.querySelector('#view h1') || {}).textContent || ''));
    await page.waitForSelector('.day');
    assert.match(await page.textContent('h1'), /19–25 Oct/);

    await go(page, 'health');
    // One sparkline per entry in METRICS (js/views/health.js): ten since the Health Connect expansion.
    assert.equal(await page.$$eval('.metric svg[role=img]', e => e.length), 10);
    assert.ok(await page.$('.session.is-dup'));

    await go(page, 'reviews');
    assert.equal(await page.$$eval('.proposal', e => e.length), 1);
    assert.match(await page.textContent('.proposal'), /Set week 4 running volume to 16 km/);
    assert.equal(await page.$$eval('[data-undo]', e => e.length), 1);
    assert.match(await page.textContent('.review'), /exactly/);
    assert.ok(await page.$('.review .md strong'));
    assert.ok(await page.$('.badge--on_track'));

    await go(page, 'settings?strava=ok');
    await page.waitForSelector('.toast');
    assert.match(await page.textContent('.toast'), /Strava connected/);
    assert.equal(new URL(page.url()).hash, '#/settings');
    assert.match(await page.textContent('#view'), /\/ingest\/health/);
    assert.match(await page.textContent('#view'), /X-Ingest-Key/);
    assert.equal(await page.inputValue('#fiveK'), '23:30');
    await page.click('#settings-form [name=hasWatch] + .switch-ui');
    await page.click('#settings-form button[type=submit]');
    await page.waitForFunction(() => document.querySelectorAll('.toast').length >= 2);
    const put = log.find(l => l.method === 'PUT');
    assert.deepEqual(put.body, { hasWatch: true });
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await step('401 signs out of Firebase and sends you to login', async () => {
    const { ctx, page, log } = await newPage({ user: 'expired' });
    await page.goto(`${APP}#/today`);
    await page.waitForSelector('#google-signin');
    assert.ok(log.some(l => l.auth === `Bearer ${TOKENS.expired}`));
    assert.ok((await page.evaluate(() => window.__authCalls)).includes('signOut'));
    assert.equal(await page.evaluate(() => globalThis.__RUNNING_TEST_AUTH__.currentUser()), null);
    await ctx.close();
  });

  await step('403 "not the owner" shows a toast and signs out', async () => {
    const { ctx, page } = await newPage({ user: 'stranger' });
    await page.goto(`${APP}#/today`);
    await page.waitForSelector('#google-signin');
    await page.waitForSelector('.toast--error');
    assert.match(await page.textContent('.toasts'), /This account isn’t allowed/);
    assert.ok((await page.evaluate(() => window.__authCalls)).includes('signOut'));
    await ctx.close();
  });

  await step('Settings: Sign out (Firebase only) and Sign out everywhere (POST /api/logout-all)', async () => {
    const a = await newPage();
    await go(a.page, 'settings');
    assert.equal(await a.page.$$eval('#settings-form ~ section .actions button', b => b.length) >= 2, true);
    await a.page.click('#logout');
    await a.page.waitForSelector('#google-signin');
    assert.deepEqual(await a.page.evaluate(() => window.__authCalls), ['signOut']);
    assert.ok(!a.log.some(l => l.method === 'POST' && /logout/.test(l.path)), 'plain sign-out makes no server call');
    await a.ctx.close();

    const b = await newPage();
    await go(b.page, 'settings');
    b.page.once('dialog', d => d.accept());
    await b.page.click('#logout-all');
    await b.page.waitForSelector('#google-signin');
    const call = b.log.find(l => l.method === 'POST' && l.path === '/api/logout-all');
    assert.ok(call && call.auth === 'Bearer test-token', 'logout-all sent with the ID token');
    assert.deepEqual(await b.page.evaluate(() => window.__authCalls), ['signOut']);
    await b.ctx.close();
  });

  for (const scheme of ['light', 'dark']) {
    await step(`no horizontal overflow at 390px + screenshots (${scheme})`, async () => {
      const { ctx, page } = await newPage({ scheme });
      for (const r of ['today', 'week', 'plan', 'health', 'reviews', 'settings']) {
        await go(page, r);
        const o = await overflow(page);
        assert.ok(o.scrollW <= o.W && o.bad.length === 0, `${r} (${scheme}) overflows: ${JSON.stringify(o)}`);
        if (r === 'plan') await page.waitForTimeout(100);
        await page.screenshot({ path: join(SHOTS, `${r}-${scheme}.png`) });
        await page.screenshot({ path: join(SHOTS, `${r}-${scheme}-full.png`), fullPage: true });
      }
      await ctx.close();
    });
  }

  await step('desk (1440 px): Overview by default, rail left of the view, no overflow', async () => {
    for (const scheme of ['light', 'dark']) {
      const { ctx, page, errors } = await newPage({ desk: true, scheme });
      const suffix = scheme === 'dark' ? '-dark' : '';
      const railLeftOfView = async () => {
        const nav = await page.locator('nav.tabs').boundingBox();
        const main = await page.locator('#view').boundingBox();
        assert.ok(nav && main && nav.x + nav.width <= main.x + 0.5, `rail left of view: ${JSON.stringify({ nav, main })}`);
        assert.ok(nav.height >= 900 - 80, `rail runs the full height (${nav.height})`);
      };
      await page.goto(APP);
      await page.waitForFunction(() => location.hash === '#/overview');
      await overviewReady(page);
      assert.equal(await page.getAttribute('html', 'data-layout'), 'desk');
      assert.equal(await page.textContent('#view h1'), 'Overview');
      await railLeftOfView();
      assert.equal(await page.locator('.tab--desk:visible').count(), 1);
      assert.equal(await page.locator('.tab:visible').count(), 7);
      assert.equal(await page.getAttribute('.tab[data-tab=overview]', 'aria-current'), 'page');
      assert.equal(await page.getAttribute('.brand', 'href'), '#/overview');
      let o = await overflow(page);
      assert.ok(o.scrollW <= o.W && o.bad.length === 0, `overview (${scheme}) overflows: ${JSON.stringify(o)}`);
      await page.screenshot({ path: join(SHOTS, `desk-overview${suffix}.png`) });

      // An unknown route lands where a bare URL does: Overview on a desk.
      await page.evaluate(() => { location.hash = '#/nowhere'; });
      await page.waitForFunction(() => location.hash === '#/overview');
      await overviewReady(page);

      await page.goto(`${APP}#/today`);
      await page.waitForSelector('.workout-title');
      await page.waitForTimeout(150);
      await railLeftOfView();
      assert.equal(await page.getAttribute('.tab[data-tab=today]', 'aria-current'), 'page');
      o = await overflow(page);
      assert.ok(o.scrollW <= o.W && o.bad.length === 0, `today (${scheme}) overflows: ${JSON.stringify(o)}`);
      await page.screenshot({ path: join(SHOTS, `desk-today${suffix}.png`) });

      if (scheme === 'light') {
        // Crossing the breakpoint switches the layout and the brand's home link live.
        await page.setViewportSize({ width: 1000, height: 900 });
        await page.waitForFunction(() => document.documentElement.dataset.layout === 'phone');
        assert.equal(await page.getAttribute('.brand', 'href'), '#/today');
        assert.equal(await page.locator('.tab--desk:visible').count(), 0);
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.waitForFunction(() => document.documentElement.dataset.layout === 'desk');
        assert.equal(await page.getAttribute('.brand', 'href'), '#/overview');
      }
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  });

  await step('desk Overview: tiles, week pick, range chip, no overflow at 1440 and 1100, screenshots', async () => {
    const { ctx, page, errors } = await newPage({ desk: true });
    const hashParam = name => page.evaluate(n => new URLSearchParams(location.hash.split('?')[1] || '').get(n), name);
    const weekLabel = () => page.textContent('#ov-kpi-week .tile-label');
    await page.goto(`${APP}#/overview`);
    await overviewReady(page);
    assert.equal(await weekLabel(), 'This week');
    assert.equal(await page.getAttribute('[data-period="12w"]', 'aria-pressed'), 'true', 'default range');
    for (const width of [1440, 1100]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForFunction(() => document.documentElement.dataset.layout === 'desk');
      await settle(page);
      const o = await overflow(page);
      assert.ok(o.scrollW <= o.W && o.bad.length === 0, `overview at ${width} px overflows: ${JSON.stringify(o)}`);
      assert.ok(await page.locator('#ov-volume .chart--bars').count(), `volume chart drawn at ${width} px`);
    }
    await page.screenshot({ path: join(SHOTS, 'overview-1100-light.png') });
    await page.setViewportSize({ width: 1440, height: 900 });
    await settle(page);
    await page.screenshot({ path: join(SHOTS, 'overview-light.png') });
    await page.screenshot({ path: join(SHOTS, 'overview-light-full.png'), fullPage: true });

    // A click on a week's bars filters the whole page to that week: w= in the hash, the Week KPI renamed.
    const bars = page.locator('#ov-volume .bars[data-key]');
    const n = await bars.count();
    assert.ok(n >= 4, `weekly bars (${n})`);
    const bar = bars.nth(n - 3);
    const key = await bar.getAttribute('data-key');
    await bar.scrollIntoViewIfNeeded();
    const box = await bar.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(k => new URLSearchParams(location.hash.split('?')[1] || '').get('w') === k, key);
    await page.waitForFunction(() => /^Week of /.test(document.querySelector('#ov-kpi-week .tile-label').textContent));
    assert.match(await weekLabel(), /^Week of \d+ \w+$/);
    assert.equal(await hashParam('p'), '12w');
    assert.ok(await page.isVisible('[data-week-group]'), 'focus chip shown');
    assert.equal(await page.getAttribute(`#ov-volume .bars[data-key="${key}"]`, 'aria-pressed'), 'true');

    // The range chip rewrites p= and keeps the picked week (it is inside a year).
    await page.click('[data-period="1y"]');
    await page.waitForFunction(() => new URLSearchParams(location.hash.split('?')[1] || '').get('p') === '1y');
    await page.waitForFunction(() => document.querySelector('[data-period="1y"]').getAttribute('aria-pressed') === 'true');
    await page.waitForSelector('.dash[aria-busy="false"]');
    assert.equal(await hashParam('w'), key);
    assert.match(await weekLabel(), /^Week of /);
    await page.screenshot({ path: join(SHOTS, 'overview-week-light.png') });

    // Clearing the week gives the KPI its name back and drops w= from the hash.
    await page.click('[data-clear-week="chip"]');
    await page.waitForFunction(() => !new URLSearchParams(location.hash.split('?')[1] || '').has('w'));
    await page.waitForFunction(() => document.querySelector('#ov-kpi-week .tile-label').textContent === 'This week');
    assert.equal(await hashParam('p'), '1y');
    const o = await overflow(page);
    assert.ok(o.scrollW <= o.W && o.bad.length === 0, `overview (1 year) overflows: ${JSON.stringify(o)}`);
    assert.deepEqual(errors, []);
    await ctx.close();

    // The same page in the dark, once its maps have drawn.
    const dark = await newPage({ desk: true, scheme: 'dark' });
    await dark.page.goto(`${APP}#/overview`);
    await overviewReady(dark.page);
    await dark.page.waitForSelector('#ov-heat .leaflet-container canvas', { timeout: 20000 });
    await dark.page.waitForTimeout(800); // tiles
    await dark.page.screenshot({ path: join(SHOTS, 'overview-dark.png') });
    await dark.page.screenshot({ path: join(SHOTS, 'overview-dark-full.png'), fullPage: true });
    assert.deepEqual(dark.errors, []);
    await dark.ctx.close();
  });

  await step('desk Activity: route on a Leaflet canvas, Strava link, three stream charts', async () => {
    const { ctx, page, log, errors } = await newPage({ desk: true });
    await go(page, 'activity/16000000001');
    await page.waitForSelector('[data-map]');
    await page.waitForSelector('[data-map].leaflet-container canvas', { timeout: 20000 });
    assert.equal(await page.locator('.map-error').count(), 0, 'map did not fail to load');
    const strava = await page.getAttribute('a.strava-link', 'href');
    assert.match(strava, /^https:\/\/(www\.)?strava\.com\//);
    assert.match(await page.textContent('a.strava-link'), /View on Strava/);
    assert.equal(await page.locator('[data-streams-result]').count(), 0, 'streams are fetched only on request');
    assert.ok(!log.some(l => /\/streams$/.test(l.path)));
    await page.click('[data-streams]');
    await page.waitForSelector('[data-streams-result]');
    assert.equal(await page.locator('[data-streams-result] .stream').count(), 3);
    assert.equal(await page.locator('[data-streams-result] .stream svg').count(), 3);
    assert.ok(log.some(l => l.path === '/api/activities/16000000001/streams'));
    await page.waitForTimeout(500); // tiles
    await page.screenshot({ path: join(SHOTS, 'desk-activity.png') });
    await page.screenshot({ path: join(SHOTS, 'desk-activity-full.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, 'no horizontal scroll');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await step('desk Routes: three variants from home, pick the second, GPX download', async () => {
    const { ctx, page, log, errors, popups } = await newPage({ desk: true, settings: { home: { lat: 55.7, lng: 12.55 } } });
    await go(page, 'routes?km=10');
    assert.equal(await page.inputValue('#rt-km'), '10');
    assert.match(await page.textContent('#rt-start'), /Home/);
    await page.waitForSelector('#rt-map.leaflet-container', { timeout: 20000 });
    await page.waitForSelector('#rt-map-wait', { state: 'hidden' });
    const generated = page.waitForResponse(r => r.url().endsWith('/routes/generate'));
    await page.click('#rt-go');
    const { variants } = await (await generated).json();
    await page.waitForSelector('input[name=variant]');
    assert.equal(await page.locator('input[name=variant]').count(), 3);
    assert.equal(variants.length, 3);
    const req = log.find(l => l.path === '/api/routes/generate');
    assert.deepEqual({ ...req.body, seed: typeof req.body.seed }, { start: [55.7, 12.55], km: 10, profile: 'run', variants: 3, seed: 'number' });
    assert.equal(await page.isChecked('input[name=variant][value="0"]'), true, 'first variant preselected');
    await page.waitForSelector('#rt-map canvas');

    await page.locator('label.rt-variant').nth(1).click();
    assert.equal(await page.isChecked('input[name=variant][value="1"]'), true);
    assert.match(await page.textContent('.rt-cap'), /Elevation · B/);
    assert.match(await page.textContent('.rt-exports h3'), /route B/);

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-export=gpx]')]);
    assert.match(download.suggestedFilename(), /^run-10km-2026-10-13\.gpx$/);
    const gpx = await readFile(await download.path(), 'utf8');
    assert.ok(gpx.startsWith('<?xml'), `GPX starts with the XML declaration: ${gpx.slice(0, 20)}`);
    assert.ok(gpx.includes(`<name>Run ${formatDistance(variants[1].distanceKm)}</name>`), 'the GPX is route B');
    assert.equal(gpx.split('<trkpt').length - 1, decodePolyline(variants[1].polyline).length, 'every point of route B');
    await page.waitForTimeout(500); // tiles
    await page.screenshot({ path: join(SHOTS, 'desk-routes.png') });
    await page.screenshot({ path: join(SHOTS, 'desk-routes-full.png'), fullPage: true });
    assert.deepEqual(popups, [], 'no new tab opened');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  // Routes with handles: the route editor (js/views/routes-edit.js) and POST /api/routes/plan.
  const HOME = { lat: 55.7, lng: 12.55 };
  const planCalls = log => log.filter(l => l.method === 'POST' && l.path === '/api/routes/plan');
  const planAnswer = page => page.waitForResponse(r => r.url().endsWith('/routes/plan') && r.request().method() === 'POST');
  const planSettled = page => page.waitForSelector('#rt-results[aria-busy="false"] .rt-total');
  const routesMap = async page => {
    await page.waitForSelector('#rt-map.leaflet-container', { timeout: 20000 });
    await page.waitForSelector('#rt-map-wait', { state: 'hidden' });
    const box = await page.locator('#rt-map').boundingBox();
    return [box.x + box.width / 2, box.y + box.height / 2];
  };

  await step('desk Routes, Draw: three clicks from home plan a loop along paths; Undo; GPX download', async () => {
    const { ctx, page, log, errors, popups } = await newPage({ desk: true, settings: { home: HOME } });
    await go(page, 'routes?mode=draw&km=5');
    const centre = await routesMap(page);
    assert.equal(await page.isChecked('input[name=mode][value=draw]'), true);
    assert.equal(await page.isVisible('#rt-go'), false, 'no Generate button in Draw');
    assert.equal(await page.locator('#rt-map .map-handle').count(), 1, 'home is the first point');
    let route = null;
    for (const [dx, dy] of [[140, -110], [220, 70], [40, 170]]) {
      const answered = planAnswer(page);
      await page.mouse.click(centre[0] + dx, centre[1] + dy);
      route = (await (await answered).json()).route;
    }
    await planSettled(page);
    const calls = planCalls(log);
    assert.equal(calls.length, 3, 'one plan per click');
    const { points, loop, profile } = calls[2].body;
    assert.equal(points.length, 4);
    assert.deepEqual(points[0], [HOME.lat, HOME.lng], 'drawn from home');
    assert.deepEqual([loop, profile], [true, 'run'], 'back to start is on for a run');
    assert.equal(await page.locator('#rt-map .map-handle').count(), 4);
    assert.match(await page.textContent('#rt-live'), new RegExp(formatDistance(route.distanceKm).replace('.', '\\.')));
    await page.waitForTimeout(500); // tiles
    await page.screenshot({ path: join(SHOTS, 'desk-routes-draw.png') });

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-export=gpx]')]);
    assert.match(download.suggestedFilename(), /^run-\d+km-2026-10-13\.gpx$/);
    const gpx = await readFile(await download.path(), 'utf8');
    assert.equal(gpx.split('<trkpt').length - 1, decodePolyline(route.polyline).length, 'every point of the drawn route');

    // Undo goes back to the route through three points, which was already planned: no new request.
    await page.click('#rt-undo');
    await planSettled(page);
    assert.equal(await page.locator('#rt-map .map-handle').count(), 3);
    assert.equal(planCalls(log).length, 3);
    assert.deepEqual(popups, [], 'no new tab opened');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await step('desk Routes, Edit: a variant re-planned through handles; a dragged handle re-plans with the moved point', async () => {
    const { ctx, page, log, errors } = await newPage({ desk: true, settings: { home: HOME } });
    await go(page, 'routes?km=10');
    await routesMap(page);
    await page.click('#rt-go');
    await page.waitForSelector('[data-edit]');
    let answered = planAnswer(page);
    await page.click('[data-edit]');
    const before = (await (await answered).json()).route;
    await planSettled(page);
    const first = planCalls(log)[0].body;
    assert.equal(first.points.length, 7, 'the start and six handles along the variant');
    assert.deepEqual(first.points[0], [HOME.lat, HOME.lng]);
    assert.equal(first.loop, true);
    assert.match(await page.textContent('#rt-status'), /Re-routed through 6 handles — drag to reshape/);
    assert.equal(await page.locator('#rt-map .map-handle').count(), 7);

    const box = await page.locator('#rt-map .map-handle').nth(3).boundingBox();
    const from = [box.x + box.width / 2, box.y + box.height / 2];
    answered = planAnswer(page);
    await page.mouse.move(...from);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(from[0] + i * 10, from[1] - i * 8);
    await page.mouse.up();
    const after = (await (await answered).json()).route;
    await planSettled(page);
    const moved = planCalls(log).at(-1).body.points;
    assert.equal(moved.length, 7);
    assert.ok(moved[3][0] > first.points[3][0] && moved[3][1] > first.points[3][1], `handle 3 moved north-east, as dragged: ${moved[3]} from ${first.points[3]}`);
    for (const i of [0, 1, 2, 4, 5, 6]) assert.deepEqual(moved[i], first.points[i], `handle ${i} stayed`);
    assert.notEqual(after.distanceKm, before.distanceKm);
    await page.waitForTimeout(500); // tiles
    await page.screenshot({ path: join(SHOTS, 'desk-routes-edit.png') });
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await step('phone (390 px): Today by default, bottom tab bar with Routes, no desk tabs', async () => {
    const { ctx, page, errors } = await newPage();
    await page.goto(APP);
    await page.waitForSelector('.workout-title');
    assert.equal(new URL(page.url()).hash, '#/today');
    assert.equal(await page.getAttribute('html', 'data-layout'), 'phone');
    assert.equal(await page.locator('.tab--desk').count(), 1);
    assert.equal(await page.locator('.tab--desk:visible').count(), 0);
    assert.equal(await page.locator('.tab:visible').count(), 6);
    assert.ok(await page.isVisible('.tab[data-tab=routes]'), 'Routes is in the phone tab bar');
    // Six tabs must still fit a small phone: every label inside its own column.
    const tabs = await page.$$eval('.tab:not(.tab--desk)', ts => ts.map(t => ({ w: t.getBoundingClientRect().width, label: t.querySelector('span').scrollWidth })));
    assert.ok(tabs.every(t => t.label <= t.w), `tab labels fit: ${JSON.stringify(tabs)}`);
    const bar = await page.locator('nav.tabs').boundingBox();
    assert.ok(bar.y > 700, `tab bar at the bottom (top ${bar.y})`);
    assert.equal(await page.getAttribute('.brand', 'href'), '#/today');
    await page.screenshot({ path: join(SHOTS, 'phone-home.png') });
    // An unknown route lands where a bare URL does: Today on a phone.
    await page.evaluate(() => { location.hash = '#/nowhere'; });
    await page.waitForFunction(() => location.hash === '#/today');
    await page.waitForSelector('.workout-title');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  // Which recorded sessions count for a workout: four steps of their own (tests/smoke-links.playwright.mjs).
  await linkSteps({ step, newPage, go, overflow, APP, SHOTS });

  await step('phone (390 px): Routes (in the tab bar) and Overview (not) render without overflow', async () => {
    const { ctx, page, errors } = await newPage();
    await go(page, 'routes');
    await page.waitForSelector('#rt-form');
    assert.equal(await page.getAttribute('html', 'data-layout'), 'phone');
    assert.equal(await page.locator('.tab--desk:visible').count(), 0, 'no desk tabs on a phone');
    assert.ok(await page.isVisible('#rt-go'), 'generate button reachable');
    assert.ok(await page.isVisible('#rt-map'), 'map frame shown');
    let o = await overflow(page);
    assert.ok(o.scrollW <= o.W && o.bad.length === 0, `routes (phone) overflows: ${JSON.stringify(o)}`);
    await page.screenshot({ path: join(SHOTS, 'phone-routes.png') });
    await page.screenshot({ path: join(SHOTS, 'phone-routes-full.png'), fullPage: true });

    // A run's session page offers a route on the phone too.
    await go(page, 'workout/w-2026-10-13-run');
    assert.ok(await page.isVisible('a:has-text("Make a route for this run")'), 'route link on the phone workout page');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await step('phone (390 px): generate from home, then take the route to Garmin or Strava the phone way', async () => {
    const { ctx, page, errors, popups } = await newPage({ settings: { home: { lat: 55.7, lng: 12.55 } } });
    await go(page, 'routes?km=10');
    await page.waitForSelector('#rt-form');
    await page.click('#rt-go');
    await page.waitForSelector('[data-export="gpx"]');
    // A phone can't use the Strava or Garmin web import pages, so the help says what works there.
    assert.match(await page.textContent('[data-export="garmin"] + .help'), /Garmin Connect app/);
    assert.match(await page.textContent('[data-export="strava"] + .help'), /[Dd]esktop site/);
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-export="garmin"]')]);
    assert.match(download.suggestedFilename(), /\.gpx$/);
    assert.deepEqual(popups, [], 'no web import page opened on a phone');
    let o = await overflow(page);
    assert.ok(o.scrollW <= o.W && o.bad.length === 0, `routes exports (phone) overflow: ${JSON.stringify(o)}`);
    await page.screenshot({ path: join(SHOTS, 'phone-routes-exports-full.png'), fullPage: true });
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await step('phone (390 px): Overview renders without overflow though it is not in the tab bar', async () => {
    const { ctx, page, errors } = await newPage();
    let o;
    await go(page, 'overview');
    await overviewReady(page);
    assert.equal(await page.getAttribute('html', 'data-layout'), 'phone');
    o = await overflow(page);
    assert.ok(o.scrollW <= o.W && o.bad.length === 0, `overview (phone) overflows: ${JSON.stringify(o)}`);
    await page.screenshot({ path: join(SHOTS, 'phone-overview.png') });
    await page.screenshot({ path: join(SHOTS, 'phone-overview-full.png'), fullPage: true });
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await step('service worker installs (module type), precaches the shell, answers offline', async () => {
    const { ctx, page } = await newPage({ sw: 'allow' });
    await page.goto(`${APP}#/login`);
    const info = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      const keys = await caches.keys();
      const shell = keys.find(k => k.startsWith('running-shell-'));
      const c = await caches.open(shell);
      return { url: reg.active.scriptURL, keys, shell, n: (await c.keys()).length, idx: !!(await c.match('./index.html')), auth: !!(await c.match('./js/auth.js')) };
    });
    assert.match(info.url, /\/running\/sw\.js$/);
    assert.ok(info.n >= 26, `precached ${info.n}`);
    assert.ok(info.idx);
    assert.equal(info.shell, `running-shell-${APP_VERSION}`);
    assert.ok(info.auth, 'auth.js precached');
    // With the SW in control, the API host is unreachable: the SW must answer
    // /api/state itself with the offline marker → badge shows. API_BASE is the
    // live Cloud Function, so fail its requests here rather than letting them out.
    await ctx.unroute(`${new URL(API_BASE).origin}/**`);
    await ctx.route(`${new URL(API_BASE).origin}/**`, r => r.abort('internetdisconnected'));
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    // The SW passes Firebase SDK requests through untouched and never caches them.
    await ctx.unroute(/www\.gstatic\.com\/firebasejs\//);
    let sdkHits = 0;
    await ctx.route(/www\.gstatic\.com\/firebasejs\//, r => { sdkHits++; return r.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'export const ok = 1;' }); });
    const sdk = await page.evaluate(async u => {
      const r1 = await fetch(u); const r2 = await fetch(u, { cache: 'no-store' });
      const cached = [];
      for (const k of await caches.keys()) if (await (await caches.open(k)).match(u)) cached.push(k);
      return { ok: r1.ok && r2.ok, body: await r2.text(), cached };
    }, 'https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js');
    assert.ok(sdk.ok && /ok = 1/.test(sdk.body));
    assert.deepEqual(sdk.cached, [], 'Firebase SDK not in any cache');
    assert.ok(sdkHits >= 2, `SDK requests reached the network (${sdkHits})`);
    await page.goto(`${APP}#/today`);
    await page.waitForSelector('.state--error');
    assert.ok(await page.isVisible('#offline'), 'offline badge');
    assert.match(await page.textContent('.state--error'), /offline/i);
    await ctx.close();
  });

  console.log(`\n${passed} smoke checks passed. Screenshots: ${SHOTS}`);
} finally {
  await browser.close();
  srv.close();
}
