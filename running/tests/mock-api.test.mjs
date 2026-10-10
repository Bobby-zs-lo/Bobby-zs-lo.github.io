// Tests for the invented fixtures, the mock API built on them, and the preview server's page rewriting.
// These are the pieces a Claude session relies on to work without real (Strava) data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMockApi } from './mock-api.mjs';
import { injectPreview, rewriteConfig } from './preview-server.mjs';
import { decodePolyline } from '../js/polyline.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (name) => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
const OWNER = 'Bearer test-token';
const CENTRE = [55.7, 12.55];

const km = ([lat1, lng1], [lat2, lng2]) => {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
};
const perimeterKm = (pts) => pts.reduce((sum, p, i) => (i ? sum + km(pts[i - 1], p) : 0), 0);
const newApi = () => createMockApi({ fixturesDir: FIXTURES, routeDelayMs: 0, planDelayMs: 0 });
const call = (api, method, path, { search = '', body = null, authz = OWNER } = {}) => api({ method, path, search, body, authz });

// ── fixtures ────────────────────────────────────────────────────────────────

test('history: a year of unique, time-ordered activities that keep the hand-written rows', () => {
  const history = fixture('history.json');
  assert.ok(history.length > 200);
  assert.equal(new Set(history.map((a) => a.id)).size, history.length);
  assert.deepEqual(history.map((a) => a.startUtc), history.map((a) => a.startUtc).sort());
  assert.ok(history[0].date >= '2025-10-13' && history.at(-1).date <= '2026-10-13');
  for (const original of fixture('activities.json')) {
    const kept = history.find((a) => a.id === original.id);
    assert.ok(kept, `original ${original.id} kept`);
    for (const [key, value] of Object.entries(original)) assert.deepEqual(kept[key], value, `${original.id}.${key}`);
  }
});

test('history: every route is a closed loop near the centre whose length matches the distance', () => {
  for (const a of fixture('history.json')) {
    const pts = decodePolyline(a.polyline);
    assert.ok(pts.length >= 8, `${a.id} has a route`);
    assert.ok(km(pts[0], pts.at(-1)) < 0.005, `${a.id} is closed`);
    assert.ok(Math.abs(perimeterKm(pts) - a.distanceKm) / a.distanceKm < 0.1, `${a.id} length`);
    assert.ok(km(a.startLatLng, CENTRE) < 1.6, `${a.id} starts near the centre`);
  }
});

test('health-year: 366 days ending today, same keys as health.json', () => {
  const year = fixture('health-year.json');
  assert.equal(year.length, 366);
  assert.equal(year.at(-1).date, fixture('state.json').today);
  assert.deepEqual(Object.keys(year[0]), Object.keys(fixture('health.json')[0]));
});

// ── mock API ────────────────────────────────────────────────────────────────

test('mock: only the owner token gets in', async () => {
  const api = newApi();
  assert.equal((await call(api, 'GET', '/api/state', { authz: null })).status, 401);
  assert.equal((await call(api, 'GET', '/api/state', { authz: 'Bearer expired-token' })).status, 401);
  const stranger = await call(api, 'GET', '/api/state', { authz: 'Bearer stranger-token' });
  assert.deepEqual([stranger.status, stranger.json], [403, { error: 'not the owner' }]);
  assert.equal((await call(api, 'GET', '/api/state')).status, 200);
});

test('mock: activities are listed by date range, without routes unless asked', async () => {
  const api = newApi();
  const plain = await call(api, 'GET', '/api/activities', { search: '?from=2026-09-01&to=2026-10-13' });
  assert.ok(plain.json.length > 10);
  assert.ok(plain.json.every((a) => a.date >= '2026-09-01' && a.date <= '2026-10-13' && !('polyline' in a) && !('startLatLng' in a)));
  assert.deepEqual(plain.json.map((a) => a.startUtc), plain.json.map((a) => a.startUtc).sort());
  const withRoutes = await call(api, 'GET', '/api/activities', { search: '?from=2026-09-01&to=2026-10-13&with=polyline' });
  assert.ok(withRoutes.json.every((a) => typeof a.polyline === 'string' && a.startLatLng.length === 2));
  assert.equal((await call(api, 'GET', '/api/activities', { search: '?with=splits' })).status, 400);
  assert.equal((await call(api, 'GET', '/api/activities', { search: '?from=2026-10-13&to=2026-09-01' })).status, 400);
});

test('mock: an activity in full has splits adding up, a Strava link and its planned workout', async () => {
  const api = newApi();
  const { status, json } = await call(api, 'GET', '/api/activities/15800000002');
  assert.equal(status, 200);
  const { activity } = json;
  assert.equal(activity.stravaUrl, 'https://www.strava.com/activities/15800000002');
  assert.equal(activity.splits.reduce((sum, s) => sum + s.movingS, 0), Math.round(activity.movingMin * 60));
  assert.ok(Math.abs(activity.splits.reduce((sum, s) => sum + s.distanceKm, 0) - activity.distanceKm) < 0.011);
  assert.equal(json.workout.id, 'w-2026-10-13-run');
  assert.ok(json.paces.E);
  assert.equal((await call(api, 'GET', '/api/activities/1')).status, 404);
});

test('mock: streams for runs fit the activity, rides have none', async () => {
  const api = newApi();
  const run = await call(api, 'GET', '/api/activities/15800000002/streams');
  assert.equal(run.json.distanceKm.length, 600);
  assert.equal(run.json.distanceKm.at(-1), 5.21);
  assert.equal(run.json.timeS.at(-1), Math.round(31.6 * 60));
  const ride = await call(api, 'GET', '/api/activities/15800000001/streams');
  assert.deepEqual([ride.status, ride.json], [404, { error: 'no streams' }]);
});

test('mock: health comes from the year file, by range', async () => {
  const { json } = await call(newApi(), 'GET', '/api/health', { search: '?from=2026-10-01&to=2026-10-13' });
  assert.equal(json.length, 13);
  assert.ok(json.some((row) => row.exercise.some((e) => e.duplicateOfStrava)));
});

test('mock: route requests are validated like the real backend', async () => {
  const api = newApi();
  const bad = async (body) => (await call(api, 'POST', '/api/routes/generate', { body })).status;
  assert.equal(await bad({ start: [55.7], profile: 'run', km: 10 }), 400);
  assert.equal(await bad({ start: [91, 12], profile: 'run', km: 10 }), 400);
  assert.equal(await bad({ start: [55, 12], profile: 'swim', km: 10 }), 400);
  assert.equal(await bad({ start: [55, 12], profile: 'run', km: 1 }), 400);
  assert.equal(await bad({ start: [55, 12], profile: 'ride', km: 5 }), 400);
  assert.equal(await bad({ start: [55, 12], profile: 'run', km: 10, variants: 4 }), 400);
  assert.equal(await bad({ start: [55, 12], profile: 'run', km: 10, seed: 1.5 }), 400);
  assert.equal(await bad(null), 400);
});

test('mock: generated routes start where asked and are about as long as asked', async () => {
  const api = newApi();
  const { status, json } = await call(api, 'POST', '/api/routes/generate', { body: { start: [56.1, 10.2], profile: 'ride', km: 25, variants: 2, seed: 7 } });
  assert.equal(status, 200);
  assert.equal(json.profile, 'ride');
  assert.equal(json.targetKm, 25);
  assert.deepEqual(json.variants.map((v) => v.seed), [7, 8]);
  for (const v of json.variants) {
    const pts = decodePolyline(v.polyline);
    assert.ok(km(pts[0], [56.1, 10.2]) < 0.01, 'starts at the requested point');
    assert.ok(Math.abs(perimeterKm(pts) - v.distanceKm) < 0.1);
    assert.ok(Math.abs(v.distanceKm - 25) < 1.5);
    assert.equal(v.elevations.length, pts.length);
  }
  const defaults = await call(api, 'POST', '/api/routes/generate', { body: { start: CENTRE, profile: 'run', km: 10 } });
  assert.equal(defaults.json.variants.length, 3);
});

test('mock: plan requests are validated like the contract', async () => {
  const api = newApi();
  const bad = async (body) => (await call(api, 'POST', '/api/routes/plan', { body })).status;
  const two = [CENTRE, [55.71, 12.56]];
  assert.equal(await bad({ points: [CENTRE], profile: 'run' }), 400, 'one point');
  assert.equal(await bad({ points: Array.from({ length: 31 }, (_, i) => [55.7 + i / 1000, 12.55]), profile: 'run' }), 400, '31 points');
  assert.equal(await bad({ points: [CENTRE, [55.7]], profile: 'run' }), 400, 'half a pair');
  assert.equal(await bad({ points: [CENTRE, [95, 12]], profile: 'run' }), 400, 'off the globe');
  assert.equal(await bad({ points: two, profile: 'swim' }), 400);
  assert.equal(await bad({ points: two, profile: 'run', loop: 'yes' }), 400);
  assert.equal(await bad(null), 400);
  const same = async (points, loop) => (await call(api, 'POST', '/api/routes/plan', { body: { points, profile: 'run', loop } })).json.error;
  assert.equal(await same([CENTRE, [55.71, 12.56], [55.71, 12.56]], false), 'points 2 and 3 are the same place');
  assert.equal(await same([CENTRE, [55.71, 12.56], [...CENTRE]], true), 'points 3 and 1 are the same place, and a loop already returns to the first');
  assert.equal((await call(api, 'POST', '/api/routes/plan', { body: { points: [CENTRE, [55.71, 12.56], [...CENTRE]], profile: 'run' } })).status, 200, 'one way, coming back to the start is fine');
  const half = await call(api, 'POST', '/api/routes/plan', { body: { points: [CENTRE, [55.7]], profile: 'run' } });
  assert.equal(half.json.error, 'point 2 must be [lat, lng]', 'the backend names the point');
  const ok = await call(api, 'POST', '/api/routes/plan', { body: { points: two, profile: 'ride' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.loop, false, 'loop defaults to false');
});

test('mock: a planned route passes through every point in order, and back to the start on a loop', async () => {
  const points = [CENTRE, [55.705, 12.565], [55.712, 12.55], [55.706, 12.535]];
  const { status, json } = await call(newApi(), 'POST', '/api/routes/plan', { body: { points, profile: 'run', loop: true } });
  assert.equal(status, 200);
  assert.deepEqual([json.profile, json.loop], ['run', true]);
  const { route } = json;
  const pts = decodePolyline(route.polyline);
  assert.equal(route.wayPoints.length, points.length + 1, 'every point, and the start again');
  assert.deepEqual(route.wayPoints, [...route.wayPoints].sort((a, b) => a - b), 'in order');
  [...points, points[0]].forEach((p, i) => assert.ok(km(pts[route.wayPoints[i]], p) < 0.002, `way point ${i} is on point ${i}`));
  assert.equal(route.wayPoints.at(-1), pts.length - 1);
  assert.ok(Math.abs(perimeterKm(pts) - route.distanceKm) < 0.01, 'the distance is the length of the line');
  const straight = perimeterKm([...points, points[0]]);
  assert.ok(route.distanceKm >= straight && route.distanceKm < straight * 1.15, `a little longer than straight lines (${route.distanceKm} vs ${straight})`);
  assert.ok(pts.every((p, i) => !i || km(pts[i - 1], p) < 0.07), 'densified to ~50 m steps');
  assert.equal(route.elevations.length, pts.length);
  assert.ok(route.elevations.every(Number.isFinite));
  assert.ok(route.ascentM > 0 && route.descentM > 0);
  assert.deepEqual(route.surface, { paved: 0.8, unpaved: 0.2, unknown: 0 });
});

test('mock: without a loop the route ends at the last point', async () => {
  const points = [CENTRE, [55.71, 12.56]];
  const { json } = await call(newApi(), 'POST', '/api/routes/plan', { body: { points, profile: 'trail', loop: false } });
  const pts = decodePolyline(json.route.polyline);
  assert.equal(json.route.wayPoints.length, 2);
  assert.ok(km(pts.at(-1), points[1]) < 0.002);
});

test('mock: a point in the sea is too far from any path (502, in OpenRouteService’s words)', async () => {
  const { status, json } = await call(newApi(), 'POST', '/api/routes/plan', { body: { points: [CENTRE, [55.705, 12.565], [55.7, 12.66]], profile: 'run', loop: true } });
  assert.equal(status, 502);
  assert.match(json.error, /Could not find routable point within a radius of 1000\.0 meters of specified coordinate 2/);
});

test('mock: settings changes (home included) show in state, per mock instance', async () => {
  const api = newApi();
  assert.equal((await call(api, 'GET', '/api/state')).json.settings.home, null);
  const put = await call(api, 'PUT', '/api/settings', { body: { hasWatch: true, home: { lat: 55.123456789, lng: 12.5 }, notify: { weekly: false } } });
  assert.deepEqual(put.json.home, { lat: 55.12346, lng: 12.5 });
  const { settings } = (await call(api, 'GET', '/api/state')).json;
  assert.equal(settings.hasWatch, true);
  assert.equal(settings.notify.weekly, false);
  assert.equal(settings.notify.morning, true);
  assert.equal((await call(api, 'PUT', '/api/settings', { body: { home: { lat: 100, lng: 0 } } })).status, 400);
  assert.equal((await call(newApi(), 'GET', '/api/state')).json.settings.hasWatch, false, 'a new mock starts from the fixture');
});

test('mock: weeks outside the fixture week come from the plan and the history', async () => {
  const api = newApi();
  const next = (await call(api, 'GET', '/api/week', { search: '?date=2026-10-19' })).json;
  assert.equal(next.week.startDate, '2026-10-19');
  assert.equal(next.days.length, 7);
  const before = (await call(api, 'GET', '/api/week', { search: '?date=2026-09-30' })).json;
  assert.equal(before.week, null);
  assert.ok(before.days.some((d) => d.activities.length));
  assert.equal((await call(api, 'GET', '/api/week', { search: '?date=soon' })).status, 400);
});

test('mock: workout actions answer, unknown paths 404, other POSTs are accepted', async () => {
  const api = newApi();
  const done = await call(api, 'POST', '/api/workouts/w-2026-10-13-strength/action', { body: { action: 'skip' } });
  assert.equal(done.json.workout.status, 'skipped');
  assert.equal((await call(api, 'POST', '/api/workouts/nope/action', { body: { action: 'done' } })).status, 404);
  assert.equal((await call(api, 'GET', '/api/nothing')).status, 404);
  assert.deepEqual((await call(api, 'POST', '/api/push/test', { body: {} })).json, { ok: true, sent: 1 });
});

// ── preview server page rewriting ───────────────────────────────────────────

test('preview: config.js gets the mock API base, and a changed file fails loudly', () => {
  const real = readFileSync(join(FIXTURES, '..', '..', 'js', 'config.js'), 'utf8');
  const out = rewriteConfig(real, 'http://127.0.0.1:5173/mock-api');
  assert.match(out, /export const API_BASE = "http:\/\/127\.0\.0\.1:5173\/mock-api";/);
  assert.ok(!out.includes('cloudfunctions.net'), 'live API host is gone');
  assert.throws(() => rewriteConfig('export const X = 1;', 'http://x'), /API_BASE/);
});

test('preview: the fake auth is injected before the module script', () => {
  const real = readFileSync(join(FIXTURES, '..', '..', 'index.html'), 'utf8');
  const out = injectPreview(real);
  const auth = out.indexOf('__RUNNING_TEST_AUTH__');
  assert.ok(auth > 0 && auth < out.search(/<script\s[^>]*type=["']module["']/i));
  assert.ok(out.includes('navigator.serviceWorker.register'));
  assert.throws(() => injectPreview('<p>no scripts</p>'), /module <script>/);
});

test('mock: a saved dashboard layout persists and is validated like the backend', async () => {
  const api = newApi();
  assert.equal((await call(api, 'GET', '/api/state')).json.settings.dashboard ?? null, null);
  const layout = { version: 1, tiles: [{ id: 'heatmap', span: 8, hidden: false }, { id: 'kpi-race', span: 2, hidden: true }] };
  assert.equal((await call(api, 'PUT', '/api/settings', { body: { dashboard: layout } })).status, 200);
  assert.deepEqual((await call(api, 'GET', '/api/state')).json.settings.dashboard, layout);
  for (const bad of [
    { version: 2, tiles: layout.tiles },
    { version: 1, tiles: [] },
    { version: 1, tiles: [{ id: 'Heat', span: 8, hidden: false }] },
    { version: 1, tiles: [{ id: 'a', span: 5, hidden: false }] },
    { version: 1, tiles: [{ id: 'a', span: 4, hidden: false }, { id: 'a', span: 4, hidden: false }] },
    { version: 1, tiles: [{ id: 'a', span: 4, hidden: 'no' }] },
    { version: 1, tiles: layout.tiles, extra: true },
  ]) {
    const r = await call(api, 'PUT', '/api/settings', { body: { dashboard: bad } });
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.match(r.json.error, /^dashboard invalid/);
  }
  assert.deepEqual((await call(api, 'GET', '/api/state')).json.settings.dashboard, layout);
  await call(api, 'PUT', '/api/settings', { body: { dashboard: null } });
  assert.equal((await call(api, 'GET', '/api/state')).json.settings.dashboard, null);
});

// ── which recorded sessions count for a workout (PUT /api/workouts/:id/links) ──

const RUN = 'w-2026-10-13-run', CORE = 'w-2026-10-13-strength', LONG_RUN = 'w-2026-10-17-run';
const MORNING = '15800000002', WARM_UP = '15800000004', COMMUTE = '15800000003', MONDAY_RIDE = '15800000001';
const TUESDAY = '2026-10-13', SATURDAY = '2026-10-17';
const UNTOUCHED = { [WARM_UP]: [null, null], [MORNING]: [RUN, null], [COMMUTE]: [null, null] };
const dayOf = async (api, date) => (await call(api, 'GET', '/api/week', { search: `?date=${date}` })).json.days.find((d) => d.date === date);
const putLinks = (api, id, activityIds, healthIds = []) => call(api, 'PUT', `/api/workouts/${id}/links`, { body: { activityIds, healthIds } });
const linksOf = (day) => Object.fromEntries(day.activities.map((a) => [a.id, [a.workoutId, a.linkSource]]));
const statusOf = (day, id) => day.workouts.find((w) => w.id === id).status;
const facts = (workout) => [workout.status, workout.statusSource, workout.linksBy];

test('fixtures: two runs and a Strava copy on Tuesday, Health Connect alone on Saturday, an id on every session', async () => {
  const api = newApi();
  const tue = await dayOf(api, TUESDAY);
  assert.deepEqual(linksOf(tue), UNTOUCHED);
  assert.deepEqual(tue.activities.map((a) => String(a.id)), [WARM_UP, MORNING, COMMUTE], 'by start time: the warm-up first');
  assert.deepEqual(tue.health.exercise.map((e) => [e.type, e.duplicateOfStrava, e.workoutId]), [['running', true, RUN]], 'the copy keeps a stale link');
  const sat = await dayOf(api, SATURDAY);
  assert.deepEqual(sat.activities, []);
  assert.deepEqual(sat.health.exercise.map((e) => [e.type, e.distanceKm, e.duplicateOfStrava, e.workoutId]), [['RUNNING', 7.2, false, null]]);
  assert.equal(statusOf(sat, LONG_RUN), 'planned');
  const year = (await call(api, 'GET', '/api/health', { search: '?from=2025-10-13&to=2026-10-13' })).json;
  const sessions = [...year.flatMap((row) => row.exercise), ...sat.health.exercise];
  assert.ok(sessions.length > 50 && sessions.every((e) => /^[0-9a-f]{64}$/.test(e.id) && 'workoutId' in e));
  assert.equal(new Set(sessions.map((e) => e.id)).size, sessions.length);
  assert.deepEqual(sessions.filter((e) => e.workoutId).map((e) => e.id), [tue.health.exercise[0].id], 'no other session is linked');
  assert.deepEqual(year.at(-1).exercise, tue.health.exercise, 'one session, one id and one link, in the week and in the health range');
});

test('links: a Health Connect copy that was linked before Strava had the session counts for nothing and cannot be sent', async () => {
  const api = newApi();
  const [copy] = (await dayOf(api, TUESDAY)).health.exercise;
  const refused = await putLinks(api, RUN, [MORNING], [copy.id]);
  assert.deepEqual([refused.status, refused.json], [400, { error: 'That Health Connect session is the same as a Strava activity of that day' }]);
  assert.equal((await dayOf(api, TUESDAY)).health.exercise[0].workoutId, RUN, 'refused: still as it was');
  // With the Strava run unlinked only the copy is left, and a copy is nothing: planned. The save drops its link too.
  assert.deepEqual(facts((await putLinks(api, RUN, [])).json.workout), ['planned', null, 'user']);
  assert.equal((await dayOf(api, TUESDAY)).health.exercise[0].workoutId, null);
});

test('links: swapping the matched run for the warm-up moves the link, locks both and leaves the session partial', async () => {
  const api = newApi();
  const put = await putLinks(api, RUN, [WARM_UP]);
  assert.deepEqual([put.status, put.json.ok, put.json.workout.id], [200, true, RUN]);
  assert.deepEqual(facts(put.json.workout), ['partial', 'strava', 'user'], '1.2 km is under 80 % of 5 km');
  const tue = await dayOf(api, TUESDAY);
  assert.deepEqual(linksOf(tue), { [WARM_UP]: [RUN, 'user'], [MORNING]: [null, 'user'], [COMMUTE]: [null, null] });
  assert.equal(statusOf(tue, RUN), 'partial');
  // every other read agrees
  assert.equal((await call(api, 'GET', `/api/activities/${MORNING}`)).json.workout, null);
  const warmUp = (await call(api, 'GET', `/api/activities/${WARM_UP}`)).json;
  assert.deepEqual([warmUp.workout.id, warmUp.workout.status, warmUp.activity.workoutId, warmUp.activity.linkSource], [RUN, 'partial', RUN, 'user']);
  const plan = (await call(api, 'GET', '/api/plan')).json;
  assert.equal(plan.weeks.flatMap((w) => w.workouts).find((w) => w.id === RUN).status, 'partial');
  const listed = (await call(api, 'GET', '/api/activities', { search: `?from=${TUESDAY}&to=${TUESDAY}` })).json;
  assert.deepEqual(listed.map((a) => [String(a.id), a.workoutId]), [[WARM_UP, RUN], [MORNING, null], [COMMUTE, null]]);
  assert.equal(statusOf(await dayOf(newApi(), TUESDAY), RUN), 'done', 'a new mock starts from the fixture');
});

test('links: several sessions count together; none puts a status that came from links back to planned', async () => {
  const api = newApi();
  assert.deepEqual(facts((await putLinks(api, RUN, [MORNING, WARM_UP])).json.workout), ['done', 'strava', 'user']);
  assert.equal((await putLinks(api, RUN, [WARM_UP, COMMUTE])).json.workout.status, 'done', '1.2 + 6.1 km: the sum decides');
  assert.deepEqual(facts((await putLinks(api, RUN, [])).json.workout), ['planned', null, 'user']);
  assert.deepEqual(linksOf(await dayOf(api, TUESDAY)), { [WARM_UP]: [null, 'user'], [MORNING]: [null, 'user'], [COMMUTE]: [null, 'user'] });
});

test('links: a Health Connect session alone can count', async () => {
  const api = newApi();
  const [run] = (await dayOf(api, SATURDAY)).health.exercise;
  const put = await putLinks(api, LONG_RUN, [], [run.id]);
  assert.deepEqual([put.status, ...facts(put.json.workout)], [200, 'done', 'health', 'user']);
  const sat = await dayOf(api, SATURDAY);
  assert.deepEqual([sat.health.exercise[0].workoutId, statusOf(sat, LONG_RUN)], [LONG_RUN, 'done']);
  assert.equal((await putLinks(api, LONG_RUN, [], [])).json.workout.status, 'planned');
  assert.equal((await dayOf(api, SATURDAY)).health.exercise[0].workoutId, null);
});

test('links: ticking a session that counts elsewhere moves it, and the workout that lost it follows', async () => {
  const api = newApi();
  assert.equal((await putLinks(api, CORE, [MORNING])).json.workout.status, 'done', '31.6 min against 20 planned');
  const tue = await dayOf(api, TUESDAY);
  assert.deepEqual(linksOf(tue)[MORNING], [CORE, 'user']);
  assert.equal(statusOf(tue, RUN), 'planned', 'the run lost its only session');
});

test('links: a status set by hand wins over the links, until it is undone', async () => {
  const api = newApi();
  const act = (id, action) => call(api, 'POST', `/api/workouts/${id}/action`, { body: { action } });
  assert.equal((await act(CORE, 'skip')).json.workout.status, 'skipped');
  assert.equal(statusOf(await dayOf(api, TUESDAY), CORE), 'skipped', 'a status action sticks, per mock');
  assert.equal((await putLinks(api, CORE, [COMMUTE])).json.workout.status, 'skipped');
  await act(RUN, 'done');
  assert.equal((await putLinks(api, RUN, [])).json.workout.status, 'done', 'done by hand stays done with nothing linked');
  // Undoing the mark hands the status back to the links, as on the backend: what is linked decides again.
  assert.deepEqual(facts((await act(CORE, 'undo_status')).json.workout), ['done', 'strava', 'user'], '19 of the 20 planned minutes were linked while it was skipped');
  assert.deepEqual(facts((await act(RUN, 'undo_status')).json.workout), ['planned', null, 'user'], 'nothing is linked to the run');
  assert.equal((await act(CORE, 'move_tomorrow')).json.workout.status, 'moved');
  assert.equal(statusOf(await dayOf(api, TUESDAY), CORE), 'done', 'a move only answers');
});

test('links: validated like the backend, in its words, and a refused request changes nothing', async () => {
  const api = newApi();
  const [saturdayRun] = (await dayOf(api, SATURDAY)).health.exercise;
  const put = async (id, body) => { const r = await call(api, 'PUT', `/api/workouts/${id}/links`, { body }); return [r.status, r.json.error]; };
  const badList = (key) => [400, `${key} must be a list of at most 10 different ids, each a string`];
  assert.deepEqual(await put('w-nope', { activityIds: [], healthIds: [] }), [404, 'Workout not found']);
  assert.deepEqual(await put(RUN, null), [400, 'Body must be { activityIds, healthIds }']);
  assert.deepEqual(await put(RUN, { activityIds: [WARM_UP] }), badList('healthIds'), 'both lists are required');
  assert.deepEqual(await put(RUN, { activityIds: [Number(WARM_UP)], healthIds: [] }), badList('activityIds'), 'ids are strings');
  assert.deepEqual(await put(RUN, { activityIds: [WARM_UP, WARM_UP], healthIds: [] }), badList('activityIds'), 'each id once');
  assert.deepEqual(await put(RUN, { activityIds: [], healthIds: Array.from({ length: 11 }, (_, i) => `h${i}`) }), badList('healthIds'), 'at most 10');
  assert.deepEqual(await put('w-nope', { activityIds: 'all', healthIds: [] }), badList('activityIds'), 'the body is read before the workout');
  // The words are shown to the owner as they are: they name the day and never an id.
  const notStrava = [400, "A Strava activity in the list isn't from 2026-10-13"];
  const notHealth = [400, "A Health Connect session in the list isn't from 2026-10-13"];
  assert.deepEqual(await put(RUN, { activityIds: ['1'], healthIds: [] }), notStrava, 'an unknown activity');
  assert.deepEqual(await put(RUN, { activityIds: [WARM_UP, MONDAY_RIDE], healthIds: [] }), notStrava, 'another day’s');
  assert.deepEqual(await put(RUN, { activityIds: [], healthIds: ['f'.repeat(64)] }), notHealth, 'an unknown session');
  assert.deepEqual(await put(RUN, { activityIds: [], healthIds: [saturdayRun.id] }), notHealth, 'another day’s');
  assert.deepEqual(await put(RUN, { activityIds: ['1'], healthIds: ['f'.repeat(64)] }), notHealth, 'Health Connect is checked first');
  assert.deepEqual(await put('w-2026-10-15-rest', { activityIds: [], healthIds: [] }), [400, 'A rest day has nothing to link']);
  assert.deepEqual(await put('w-2026-10-15-rest', { activityIds: [] }), badList('healthIds'), 'the body is read before the rest day is refused');
  const tue = await dayOf(api, TUESDAY);
  assert.deepEqual(linksOf(tue), UNTOUCHED);
  assert.equal(statusOf(tue, RUN), 'done');
});
