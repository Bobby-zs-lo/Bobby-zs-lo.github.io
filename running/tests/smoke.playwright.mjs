// Playwright smoke test for the Running PWA against a mocked API.
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
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { API_BASE } from '../js/config.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const SHOTS = process.env.SHOTS_DIR || '/tmp/running-shots';
const fx = name => JSON.parse(readFileSync(join(HERE, 'fixtures', name), 'utf8'));

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

// ── API mock (spec 4.6) ─────────────────────────────────────────────────────
function mockApi(log) {
  const state = fx('state.json');
  const week = fx('week-2026-10-12.json');
  const plan = fx('plan.json');
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS' };
  return async route => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    log.push({ method, path: url.pathname, search: url.search, body, auth: req.headers().authorization || null });
    const json = (data, status = 200) => route.fulfill({ status, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const p = url.pathname;
    if (p !== '/api/login' && req.headers().authorization !== 'Bearer test-token') return json({ error: 'Unauthorized' }, 401);
    if (method === 'POST' && p === '/api/login') return body.passphrase === 'correct horse' ? json({ token: 'test-token' }) : json({ error: 'Wrong passphrase' }, 401);
    if (p === '/api/state') return json(state);
    if (p === '/api/plan') return json(plan);
    if (p === '/api/week') {
      const d = url.searchParams.get('date');
      if (!d || (d >= '2026-10-12' && d <= '2026-10-18')) return json(week);
      const w = plan.weeks.find(x => d >= x.startDate && d <= x.startDate.replace(/\d+$/, n => String(+n + 6).padStart(2, '0'))) || plan.weeks[2];
      const days = Array.from({ length: 7 }, (_, k) => {
        const dt = new Date(w.startDate + 'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate() + k);
        const date = dt.toISOString().slice(0, 10);
        return { date, workouts: w.workouts.filter(x => x.date === date), activities: [], checkin: null, health: null };
      });
      return json({ week: w, days });
    }
    if (p === '/api/health') return json(fx('health.json'));
    if (p === '/api/reviews') return json(fx('reviews.json'));
    if (p === '/api/proposals') return json(fx('proposals.json'));
    if (p === '/api/changesets') return json(fx('changesets.json'));
    let m;
    if (method === 'POST' && (m = /^\/api\/workouts\/([^/]+)\/action$/.exec(p))) {
      const id = decodeURIComponent(m[1]);
      const w = week.week.workouts.find(x => x.id === id);
      const status = { done: 'done', skip: 'skipped', move_tomorrow: 'moved', undo_status: 'planned' }[body.action];
      return json({ workout: { ...w, status } });
    }
    if (method === 'POST' && p === '/api/checkin') return json({ ok: true });
    if (method === 'PUT' && p === '/api/settings') return json({ ...state.settings, ...body });
    if (method === 'POST') return json({ ok: true, sent: 1 });
    return json({ error: `no mock for ${method} ${p}` }, 404);
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────
async function overflow(page) {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.position === 'fixed') continue;
      if (el.closest('.sr-only,.skip,.toasts')) continue;
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
const browser = await chromium.launch({ executablePath });
const srv = await serve();
const ORIGIN = `http://127.0.0.1:${srv.address().port}`;
const APP = `${ORIGIN}/running/`;
await mkdir(SHOTS, { recursive: true });

async function newPage({ token = true, scheme = 'light', sw = 'block' } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    colorScheme: scheme, serviceWorkers: sw, timezoneId: 'Europe/Copenhagen', locale: 'en-GB',
  });
  // Fonts come from Google; keep the test hermetic and fast.
  // REAL_FONTS=1 fetches them through Node (honours the proxy) for nicer screenshots.
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, async r => {
    if (process.env.REAL_FONTS) { try { return await r.fulfill({ response: await r.fetch() }); } catch { /* offline */ } }
    return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
  });
  const log = [];
  await ctx.route(`${API_BASE}/**`, mockApi(log));
  if (token) await ctx.addInitScript(() => { try { localStorage.setItem('running.token', 'test-token'); } catch {} });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return { ctx, page, log, errors };
}
async function go(page, route) {
  await page.goto(`${APP}#/${route}`);
  await page.waitForSelector('.view > :not(.state)', { timeout: 10000 });
  await page.waitForTimeout(150);
}

try {
  await step('login screen renders when no token', async () => {
    const { ctx, page, errors, log } = await newPage({ token: false });
    await page.goto(APP);
    await page.waitForSelector('#login-form');
    assert.equal(new URL(page.url()).hash, '#/login');
    assert.ok(await page.isVisible('#passphrase'));
    assert.ok(!(await page.isVisible('#tabs')), 'tab bar hidden on login');
    assert.notEqual(await page.inputValue('#deviceName'), '');
    assert.equal(await page.getAttribute('meta[name=robots]', 'content'), 'noindex,nofollow');
    // wrong, then right passphrase
    await page.fill('#passphrase', 'nope');
    await page.click('button[type=submit]');
    await page.waitForSelector('#login-error:not([hidden])');
    await page.fill('#passphrase', 'correct horse');
    await page.click('button[type=submit]');
    await page.waitForSelector('.workout-title');
    assert.equal(await page.evaluate(() => localStorage.getItem('running.token')), 'test-token');
    assert.ok(log.some(l => l.path === '/api/login' && l.body.deviceName));
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await step('login screenshots', async () => {
    for (const scheme of ['light', 'dark']) {
      const { ctx, page } = await newPage({ token: false, scheme });
      await page.goto(APP); await page.waitForSelector('#login-form');
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
    assert.match(await page.textContent('.kmbar'), /5\.2\s*\/\s*12 km/);
    await page.click('[data-go="7"]');
    await page.waitForFunction(() => location.hash.includes('2026-10-19'));
    await page.waitForSelector('.day');
    assert.match(await page.textContent('h1'), /19–25 Oct/);

    await go(page, 'health');
    assert.equal(await page.$$eval('.metric svg[role=img]', e => e.length), 5);
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

  await step('401 sends you to login', async () => {
    const { ctx, page } = await newPage({ token: false });
    await ctx.addInitScript(() => { try { localStorage.setItem('running.token', 'expired'); } catch {} });
    await page.goto(`${APP}#/today`);
    await page.waitForSelector('#login-form');
    assert.equal(await page.evaluate(() => localStorage.getItem('running.token')), null);
    await ctx.close();
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

  await step('service worker installs (module type), precaches the shell, answers offline', async () => {
    const { ctx, page } = await newPage({ sw: 'allow' });
    await page.goto(`${APP}#/login`);
    const info = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      const keys = await caches.keys();
      const shell = keys.find(k => k.startsWith('running-shell-'));
      const c = await caches.open(shell);
      return { url: reg.active.scriptURL, keys, n: (await c.keys()).length, idx: !!(await c.match('./index.html')) };
    });
    assert.match(info.url, /\/running\/sw\.js$/);
    assert.ok(info.n >= 25, `precached ${info.n}`);
    assert.ok(info.idx);
    // With the SW in control, the API host (a placeholder) is unreachable: the
    // SW must answer /api/state itself with the offline marker → badge shows.
    await ctx.unroute(`${API_BASE}/**`);
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller);
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
