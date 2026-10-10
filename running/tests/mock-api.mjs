// A mock of the Running API, backed by the invented fixtures in tests/fixtures/.
//
//   const api = createMockApi({ fixturesDir });
//   const { status, json } = await api({ method, path, search, body, authz });
//
// `path` is the API path after the API prefix ('/api/state'), `search` the query string
// ('?from=2026-09-01'), `body` the parsed JSON body (or null), `authz` the Authorization header.
// The transport (Playwright route, preview-server.mjs) only has to move those five values.
//
// Why it exists: the app shows Strava data and Strava's API policy forbids that data reaching
// an AI, so a Claude session developing the app must run it against these fixtures and never
// against the live API. The behaviour mirrors functions/src/app.js closely enough for the
// front end (auth, range validation, route-request validation, settings merge, a planned route
// through given points: tests/mock-plan.mjs, the sessions that count for a workout:
// tests/mock-links.mjs), and the fixtures are re-read when their file changes, so rebuilding
// them needs no server restart.
//
// Each createMockApi() call has its own state, and the fixtures are never written. PUT
// /api/settings changes its copy of the settings and GET /api/state reflects it. PUT
// /api/workouts/:id/links and a status action (done, skip, undo) change which sessions count and
// the workout statuses, and the week, the plan, the activities and the health rows reflect that.
// Everything else is read-only (a workout moved to tomorrow is answered, it does not move).
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { addDays, mondayOf } from '../js/format.js';
import { decodePolyline, encodePolyline } from '../js/polyline.js';
import { planRoute } from './mock-plan.mjs';
import { createLinkStore } from './mock-links.mjs';

export const MOCK_TOKENS = { owner: 'test-token', stranger: 'stranger-token' };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KM_RANGE = { run: [2, 60], trail: [2, 60], ride: [10, 200] };
const KM_PER_DEG = 111.195;
const DEFAULT_ROUTE_DELAY_MS = 600; // long enough that loading states are visible
const DEFAULT_PLAN_DELAY_MS = 300;  // a re-plan after a drag: long enough to see the old line fade
const SETTINGS_KEYS = ['raceDate', 'raceName', 'fiveKSeconds', 'hasWatch', 'morningHour', 'eveningHour', 'home', 'dashboard'];
const NOTIFY_KEYS = ['morning', 'evening', 'activity', 'weekly'];

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => { throw new ApiError(status, message); };
const round = (x, digits) => Math.round(x * 10 ** digits) / 10 ** digits;
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

/** Fixture reader that re-parses a file only when its modification time changes. */
function fixtureReader(dir) {
  const cache = new Map();
  return (name) => {
    const file = join(dir, name);
    const mtime = statSync(file).mtimeMs;
    const hit = cache.get(name);
    if (hit && hit.mtime === mtime) return hit.value;
    const value = JSON.parse(readFileSync(file, 'utf8'));
    cache.set(name, { mtime, value });
    return value;
  };
}

/** Small deterministic random source seeded from an id, so an activity's splits are the same on every request. */
function seededRandom(seed) {
  let a = Number(BigInt(seed) % 2147483647n) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 1 km splits (last one partial) whose times add up to the activity's moving time. Runs only. */
function makeSplits(activity) {
  const rand = seededRandom(activity.id);
  const movingS = Math.round(activity.movingMin * 60);
  const count = Math.ceil(activity.distanceKm);
  const lengths = Array.from({ length: count }, (_, i) => Math.min(1, activity.distanceKm - i));
  const weights = lengths.map((len) => len * (1 + (rand() - 0.5) * 0.08));
  const total = weights.reduce((a, b) => a + b, 0);
  const seconds = weights.map((w) => Math.round((movingS * w) / total));
  seconds[count - 1] += movingS - seconds.reduce((a, b) => a + b, 0); // rounding leftovers go to the last split, so the times add up exactly
  return lengths.map((len, i) => {
    const splitS = seconds[i];
    return {
      index: i + 1, distanceKm: round(len, 2), movingS: splitS,
      paceSecPerKm: len > 0 ? Math.round(splitS / len) : null,
      avgHr: activity.avgHr == null ? null : Math.round(activity.avgHr - 6 + (12 * i) / Math.max(1, count - 1) + (rand() - 0.5) * 4),
      elevM: Math.round((rand() - 0.5) * 10),
    };
  });
}

/** The list form of a history row: no route, no start point unless asked for (the real list omits them too). */
const listRow = (row, withPolyline) => {
  const { polyline, startLatLng, ...rest } = row;
  return withPolyline ? { ...rest, polyline, startLatLng } : rest;
};

function dateRange(q, today) {
  const to = q.get('to') || today;
  const from = q.get('from') || addDays(to, -27);
  if (!DATE.test(from) || !DATE.test(to) || from > to) fail(400, 'from/to must be YYYY-MM-DD');
  return [from, to];
}

/** Same rules, same messages as parseRouteRequest in functions/src/routing.js. */
function parseRouteRequest(b) {
  if (!b || typeof b !== 'object') fail(400, 'Body must be a JSON object');
  const { start, km, profile, variants, seed } = b;
  if (!Array.isArray(start) || start.length !== 2 || !start.every((x) => typeof x === 'number' && Number.isFinite(x))
    || Math.abs(start[0]) > 90 || Math.abs(start[1]) > 180) fail(400, 'start must be [lat, lng]');
  if (typeof profile !== 'string' || !Object.hasOwn(KM_RANGE, profile)) fail(400, 'profile must be run, trail or ride');
  const [lo, hi] = KM_RANGE[profile];
  if (typeof km !== 'number' || !Number.isFinite(km) || km < lo || km > hi) fail(400, `km must be ${lo}–${hi} for ${profile}`);
  if (variants !== undefined && !(Number.isInteger(variants) && variants >= 1 && variants <= 3)) fail(400, 'variants must be 1–3');
  if (seed !== undefined && !(Number.isInteger(seed) && seed >= 0 && seed <= 1e6)) fail(400, 'seed must be an integer 0–1000000');
  return { start, km, profile, variants: variants ?? 3, seed };
}

/**
 * The fixture's 10 km loop, moved so it starts at `start` and scaled to `factor` times its size, so a
 * request for 25 km from somewhere else on the map gets a route there and about that long.
 */
function placeVariant(variant, start, factor, seed) {
  const points = decodePolyline(variant.polyline);
  const [lat0, lng0] = points[0];
  const kmPerLng0 = KM_PER_DEG * Math.cos((lat0 * Math.PI) / 180);
  const kmPerLngNew = KM_PER_DEG * Math.cos((start[0] * Math.PI) / 180);
  const moved = points.map(([lat, lng]) => [start[0] + (lat - lat0) * factor, start[1] + ((lng - lng0) * kmPerLng0 * factor) / kmPerLngNew]);
  return {
    ...variant, seed, distanceKm: round(variant.distanceKm * factor, 2), ascentM: Math.round(variant.ascentM * factor),
    descentM: Math.round(variant.descentM * factor), polyline: encodePolyline(moved),
  };
}

// Mirrors validateDashboard in functions/src/service.js: the server checks the shape, the front end owns the catalogue.
const DASHBOARD_SPANS = [2, 3, 4, 6, 8, 12];
const isPlainObject = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);
const hasOnlyKeys = (o, keys) => Object.keys(o).length === keys.length && keys.every((k) => Object.hasOwn(o, k));
function validateDashboard(d) {
  if (d == null) return;
  const bad = (why) => fail(400, `dashboard invalid: ${why}`);
  if (!isPlainObject(d) || !hasOnlyKeys(d, ['version', 'tiles'])) bad('must be null or { version, tiles }');
  if (d.version !== 1) bad('version must be 1');
  if (!Array.isArray(d.tiles) || d.tiles.length < 1 || d.tiles.length > 40) bad('tiles must be a list of 1–40');
  const seen = new Set();
  for (const t of d.tiles) {
    if (!isPlainObject(t) || !hasOnlyKeys(t, ['id', 'span', 'hidden'])) bad('each tile must be { id, span, hidden }');
    if (typeof t.id !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(t.id)) bad('tile id must be lowercase letters, digits and dashes');
    if (seen.has(t.id)) bad(`tile id ${t.id} is used twice`);
    seen.add(t.id);
    if (!DASHBOARD_SPANS.includes(t.span)) bad(`tile span must be one of ${DASHBOARD_SPANS.join(', ')}`);
    if (typeof t.hidden !== 'boolean') bad('tile hidden must be true or false');
  }
}

function validateHome(home) {
  if (home != null && !(Number.isFinite(home.lat) && Number.isFinite(home.lng) && Math.abs(home.lat) <= 90 && Math.abs(home.lng) <= 180)) {
    fail(400, 'home must be null or { lat, lng } within ±90 and ±180');
  }
}

/** The plan workout with this id, preferring the fixture week (whose done/skipped statuses are the up-to-date ones). */
function findWorkout(id, week, plan) {
  return week.week.workouts.find((w) => w.id === id) || plan.weeks.flatMap((w) => w.workouts).find((w) => w.id === id) || null;
}

/** The Health Connect sessions in a list of daily health rows, each with its row's date. */
const sessionsOf = (rows) => rows.flatMap((row) => ((row && row.exercise) || []).map((e) => ({ ...e, date: row.date })));

export function createMockApi({ fixturesDir, routeDelayMs = DEFAULT_ROUTE_DELAY_MS, planDelayMs = DEFAULT_PLAN_DELAY_MS, settings: overrides = {} }) {
  const fx = fixtureReader(fixturesDir);
  let settings = structuredClone({ home: null, ...fx('state.json').settings, ...overrides });
  const links = createLinkStore({
    activities: () => fx('history.json'),
    // The year of health rows, and the fixture week's own: one of its days lies after "today", where the year ends.
    sessions: () => {
      const all = [...sessionsOf(fx('health-year.json')), ...sessionsOf(fx('week-2026-10-12.json').days.map((d) => d.health))];
      return [...new Map(all.map((s) => [s.id, s])).values()];
    },
    findWorkout: (id) => findWorkout(id, fx('week-2026-10-12.json'), fx('plan.json')),
    fail,
  });

  // Fixture rows as the API shows them now: with the links and the statuses this mock has been given.
  const healthRow = (row) => (row ? { ...row, exercise: (row.exercise || []).map(links.session) } : row);
  const planWeekNow = (w) => (w ? { ...w, workouts: w.workouts.map(links.workout) } : w);
  const dayNow = (d) => ({ ...d, workouts: d.workouts.map(links.workout), activities: d.activities.map(links.activity), health: healthRow(d.health) });

  const weekView = (date) => {
    const week = fx('week-2026-10-12.json');
    const plan = fx('plan.json');
    const today = fx('state.json').today;
    if (!date || (date >= week.days[0].date && date <= week.days[6].date)) return { week: planWeekNow(week.week), days: week.days.map(dayNow) };
    const monday = mondayOf(date);
    const planWeek = plan.weeks.find((w) => w.startDate === monday) || null;
    const history = fx('history.json');
    const health = fx('health-year.json');
    const days = Array.from({ length: 7 }, (_, k) => {
      const d = addDays(monday, k);
      return {
        date: d, workouts: planWeek ? planWeek.workouts.filter((w) => w.date === d) : [],
        activities: history.filter((a) => a.date === d).map((a) => listRow(a, false)),
        checkin: null, health: d <= today ? health.find((h) => h.date === d) || null : null,
      };
    });
    return { week: planWeekNow(planWeek), days: days.map(dayNow) };
  };

  const activityDetail = (id) => {
    const stored = fx('history.json').find((a) => String(a.id) === id) || fail(404, 'no such activity');
    const row = links.activity(stored);
    const week = fx('week-2026-10-12.json');
    const plan = fx('plan.json');
    const isRun = row.sportType === 'Run';
    const activity = { ...row, splits: row.splits ?? (isRun ? makeSplits(row) : null), stravaUrl: `https://www.strava.com/activities/${row.id}` };
    return { activity, workout: row.workoutId ? links.workout(findWorkout(row.workoutId, week, plan)) : null, paces: plan.paces };
  };

  // The one fixture stream is a 10 km run; stretch it to this activity's distance and time so the chart's axes agree with the page.
  const activityStreams = (id) => {
    const row = fx('history.json').find((a) => String(a.id) === id) || fail(404, 'no such activity');
    if (row.sportType !== 'Run') fail(404, 'no streams');
    const s = fx('streams.json');
    const kmScale = row.distanceKm / s.distanceKm.at(-1);
    const timeScale = (row.movingMin * 60) / s.timeS.at(-1);
    return { ...s, distanceKm: s.distanceKm.map((v) => round(v * kmScale, 3)), timeS: s.timeS.map((v) => Math.round(v * timeScale)) };
  };

  const updateSettings = (body) => {
    if (!body || typeof body !== 'object') fail(400, 'Body must be a JSON object');
    const next = { ...settings, ...pick(body, SETTINGS_KEYS) };
    if (body.notify) next.notify = { ...settings.notify, ...pick(body.notify, NOTIFY_KEYS) };
    validateHome(next.home);
    validateDashboard(next.dashboard);
    if (next.home) next.home = { lat: round(next.home.lat, 5), lng: round(next.home.lng, 5) };
    settings = next;
    return structuredClone(settings);
  };

  const generateRoutes = async (body) => {
    const { start, km, profile, variants, seed } = parseRouteRequest(body);
    const fixture = fx('routes-generate.json');
    await new Promise((resolve) => setTimeout(resolve, routeDelayMs));
    const factor = km / fixture.targetKm;
    return {
      profile, targetKm: km,
      variants: fixture.variants.slice(0, variants).map((v, i) => placeVariant(v, start, factor, seed === undefined ? v.seed : seed + i)),
    };
  };

  // [method, path pattern, handler({ q, body, params })]; first match wins, the catch-all POST is last.
  const routes = [
    ['GET', /^\/api\/state$/, () => ({ ...fx('state.json'), settings: structuredClone(settings) })],
    ['GET', /^\/api\/plan$/, () => {
      const plan = fx('plan.json');
      return { ...plan, weeks: plan.weeks.map(planWeekNow) };
    }],
    ['GET', /^\/api\/week$/, ({ q }) => {
      const date = q.get('date');
      if (date && !DATE.test(date)) fail(400, 'date must be YYYY-MM-DD');
      return weekView(date);
    }],
    ['GET', /^\/api\/activities$/, ({ q }) => {
      const withParam = q.get('with');
      if (withParam && withParam !== 'polyline') fail(400, 'with must be polyline');
      const [from, to] = dateRange(q, fx('state.json').today);
      return fx('history.json').filter((a) => a.date >= from && a.date <= to)
        .sort((a, b) => a.startUtc.localeCompare(b.startUtc)).map((a) => listRow(links.activity(a), withParam === 'polyline'));
    }],
    ['GET', /^\/api\/activities\/([^/]+)\/streams$/, ({ params }) => activityStreams(params[0])],
    ['GET', /^\/api\/activities\/([^/]+)$/, ({ params }) => activityDetail(params[0])],
    ['GET', /^\/api\/health$/, ({ q }) => {
      const [from, to] = dateRange(q, fx('state.json').today);
      return fx('health-year.json').filter((r) => r.date >= from && r.date <= to).map(healthRow);
    }],
    ['GET', /^\/api\/reviews$/, () => fx('reviews.json')],
    ['GET', /^\/api\/proposals$/, () => fx('proposals.json')],
    ['GET', /^\/api\/changesets$/, () => fx('changesets.json')],
    ['POST', /^\/api\/workouts\/([^/]+)\/action$/, ({ params, body }) => links.act(decodeURIComponent(params[0]), body?.action)],
    ['PUT', /^\/api\/workouts\/([^/]+)\/links$/, ({ params, body }) => links.save(decodeURIComponent(params[0]), body)],
    ['POST', /^\/api\/checkin$/, () => ({ ok: true })],
    ['POST', /^\/api\/routes\/generate$/, ({ body }) => generateRoutes(body)],
    ['POST', /^\/api\/routes\/plan$/, async ({ body }) => {
      const answer = planRoute(body, fail); // validates before waiting, as the backend does
      await new Promise((resolve) => setTimeout(resolve, planDelayMs));
      return answer;
    }],
    ['PUT', /^\/api\/settings$/, ({ body }) => updateSettings(body)],
    ['POST', /^\/.*$/, () => ({ ok: true, sent: 1 })],
  ];

  return async function handle({ method, path, search = '', body = null, authz = null }) {
    if (authz === `Bearer ${MOCK_TOKENS.stranger}`) return { status: 403, json: { error: 'not the owner' } };
    if (authz !== `Bearer ${MOCK_TOKENS.owner}`) return { status: 401, json: { error: 'Unauthorized' } };
    const q = search instanceof URLSearchParams ? search : new URLSearchParams(search);
    for (const [m, pattern, run] of routes) {
      const match = m === method && pattern.exec(path);
      if (!match) continue;
      try {
        return { status: 200, json: await run({ q, body, params: match.slice(1) }) };
      } catch (e) {
        if (e instanceof ApiError) return { status: e.status, json: { error: e.message } };
        return { status: 500, json: { error: `mock failed: ${e.message}` } };
      }
    }
    return { status: 404, json: { error: `no mock for ${method} ${path}` } };
  };
}
