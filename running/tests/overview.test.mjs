// The Overview's pure parts: the model behind every tile, the request session, the table sort,
// the heatmap's framing and footnote, the form words. The DOM side is covered by screenshots on
// the preview server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildModel, displayRange, densestFrame, MAX_BAR_WEEKS } from '../js/views/overview-model.js';
import { sortActivities, firstDirection } from '../js/views/tiles-table.js';
import { emptyView, framedLines, heatCount, heatEmptyText } from '../js/views/tiles-map.js';
import { formWord } from '../js/views/tiles.js';
import { volumeTile } from '../js/views/tiles-charts.js';
import { createSession } from '../js/views/overview.js';
import { toString } from '../js/dom.js';
import { addDays } from '../js/format.js';
import { haversineKm } from '../js/geo.js';

const TODAY = '2026-10-13'; // a Tuesday
let nextId = 1;
const act = (date, km, sportType = 'Run', extra = {}) => ({
  id: nextId++, date, startUtc: `${date}T07:00:00Z`, sportType, name: `${sportType} ${date}`,
  distanceKm: km, movingMin: km * 6, avgPaceSecPerKm: sportType === 'Run' ? 360 : null, avgHr: 140, elevM: 10, ...extra,
});
const plan = {
  paces: { E: { min: '5:55', max: '6:30' }, M: { min: '5:08', max: '5:14' } },
  weeks: [
    { startDate: '2026-10-05', phase: 'reentry', label: 'Start', workouts: [
      { id: 'a', date: '2026-10-10', sport: 'run', kind: 'easy', distanceKm: 5, status: 'done' },
    ] },
    { startDate: '2026-10-12', phase: 'reentry', label: 'Re-entry 1', workouts: [
      { id: 'b', date: '2026-10-13', sport: 'run', kind: 'easy', distanceKm: 5, status: 'done' },
      { id: 'c', date: '2026-10-15', sport: 'run', kind: 'easy', distanceKm: 4, status: 'planned' },
      { id: 'd', date: '2026-10-17', sport: 'run', kind: 'long', distanceKm: 7, status: 'planned', key: true },
    ] },
  ],
};
const model = (acts, filters = {}, extra = {}) => buildModel({
  today: TODAY, settings: { raceDate: '2026-11-01', raceName: 'Test race' }, plan, acts, health: [],
  filters: { p: '12w', s: 'run', w: null, ...filters }, ...extra,
});

test("'all' starts at the first activity, not in the year 2000", () => {
  assert.deepEqual(displayRange('all', TODAY, plan, [act('2026-03-04', 5)]), { from: '2026-03-04', to: TODAY });
  assert.equal(displayRange('all', TODAY, plan, []).from, addDays(TODAY, -364));
});

test("'all' keeps only the last two years of bars and says so", () => {
  const m = model([act('2022-01-03', 5), act('2026-10-12', 5)], { p: 'all' });
  assert.equal(m.weekRows.length, MAX_BAR_WEEKS);
  assert.ok(m.capped && m.totalWeeks > MAX_BAR_WEEKS);
  assert.equal(m.weekRows[m.weekRows.length - 1].week, '2026-10-12');
});

test('a picked week scopes the table and last activity; one outside the bars is dropped', () => {
  const acts = [act('2026-09-29', 8), act('2026-10-01', 6), act('2026-10-12', 5)];
  const picked = model(acts, { w: '2026-09-28' });
  assert.equal(picked.sel, '2026-09-28');
  assert.deepEqual(picked.scoped.map(a => a.date), ['2026-09-29', '2026-10-01']);
  assert.equal(picked.last.date, '2026-10-01');
  assert.equal(picked.weekRow.actualKm, 14);
  const outside = model(acts, { p: '4w', w: '2026-06-01' });
  assert.equal(outside.sel, null);
  assert.equal(outside.filters.w, null);
});

test("'Everything' measures the plan by run km while the total counts every sport", () => {
  const m = model([act('2026-10-12', 20, 'Ride'), act('2026-10-13', 5)], { s: 'all' });
  assert.equal(m.weekRow.actualKm, 25);
  assert.equal(m.weekRunKm, 5);
  assert.equal(m.weekRow.plannedKm, 16);
});

test('rides have no plan: their bars say so rather than "planned 0 km"', () => {
  const acts = [act('2026-10-12', 20, 'Ride'), act('2026-10-13', 5)];
  const rides = model(acts, { s: 'ride' });
  assert.ok(rides.weekRows.every(r => r.plannedKm === null));
  assert.equal(rides.weekRow.plannedKm, null);
  const svg = toString(volumeTile(rides, 'ov-volume', 720));
  assert.match(svg, /aria-label="12 Oct: no plan, actual 20 km"/);
  assert.doesNotMatch(svg, /planned 0 km/);
  assert.doesNotMatch(svg, /bar--planned/);
});

test('the next run skips closed sessions; a picked week shows its key session', () => {
  assert.equal(model([]).next.pick.id, 'c');
  assert.deepEqual(model([]).next.then.map(w => w.id), ['d']);
  const week = model([act('2026-10-13', 5)], { w: '2026-10-12' }).next;
  assert.equal(week.mode, 'week');
  assert.equal(week.pick.id, 'd');
});

test('a rest day today does not break the current streak', () => {
  const m = model([act('2026-10-10', 5), act('2026-10-11', 5), act('2026-10-12', 5)]);
  assert.equal(m.cal.current, 3);
  assert.equal(m.cal.longest, 3);
  assert.equal(m.cal.active, 3);
  assert.equal(m.cal.weekdays.reduce((s, d) => s + d.active, 0), 3);
});

test('rides have no pace zones; the sport filter reaches the calendar', () => {
  const acts = [act('2026-10-12', 20, 'Ride'), act('2026-10-13', 5)];
  const rides = model(acts, { s: 'ride' });
  assert.equal(rides.zones, null);
  assert.equal(rides.cal.km.get('2026-10-13'), undefined);
  assert.equal(rides.cal.km.get('2026-10-12'), 20);
});

test('empty data gives empty aggregates, never NaN', () => {
  const m = model([], {}, { plan: null, settings: {} });
  assert.equal(m.race, null);
  assert.equal(m.last, null);
  assert.equal(m.load.length, 0);
  assert.ok(!JSON.stringify(m, (k, v) => (v instanceof Map ? [...v] : v)).includes('NaN'));
});

test('sorting keeps missing values last in both directions', () => {
  const rows = [act('2026-10-01', 5, 'Run', { avgHr: null }), act('2026-10-02', 7), act('2026-10-03', 3, 'Run', { avgHr: 150 })];
  const sessions = new Map();
  assert.deepEqual(sortActivities(rows, { key: 'hr', dir: 'desc' }, sessions).map(a => a.avgHr), [150, 140, null]);
  assert.deepEqual(sortActivities(rows, { key: 'hr', dir: 'asc' }, sessions).map(a => a.avgHr), [140, 150, null]);
  assert.deepEqual(sortActivities(rows, { key: 'date', dir: 'desc' }, sessions).map(a => a.date), ['2026-10-03', '2026-10-02', '2026-10-01']);
  assert.equal(firstDirection('name'), 'asc');
  assert.equal(firstDirection('km'), 'desc');
  assert.equal(firstDirection('pace'), 'asc');
});

// --- the heatmap's framing ----------------------------------------------------------

const KM_PER_DEG = 6371.0088 * Math.PI / 180;
/** A point `north` and `east` km from `from`. */
const offset = ([lat, lng], north, east = 0) => [lat + north / KM_PER_DEG, lng + east / (KM_PER_DEG * Math.cos(lat * Math.PI / 180))];
const CPH = [55.68, 12.57];
const TOKYO = [35.68, 139.69];
const NEW_YORK = [40.71, -74.0];
// Eight runs from around home (within 3 km), newest first, with the newest of all a trip abroad.
const HOME_STARTS = [[0, 0], [1, 1], [-2, 0.5], [0.5, -2], [2.5, 1], [-1, -1], [1.5, 2], [-2.5, -1.5]].map(([n, e]) => offset(CPH, n, e));
const WITH_TRIPS = [TOKYO, ...HOME_STARTS.slice(0, 4), NEW_YORK, ...HOME_STARTS.slice(4)];

test('the densest frame is the home cluster, however recent or far a trip abroad', () => {
  const frame = densestFrame(WITH_TRIPS);
  assert.deepEqual(frame.members, [1, 2, 3, 4, 6, 7, 8, 9]);
  assert.ok(haversineKm(frame.centre, CPH) < 3, 'centred on home');
});

test('the densest frame: a tie goes to the cell with the most recent start', () => {
  const aarhus = [56.157, 10.21]; // clear of a cell edge (56.16 / 0.045 is a whole number)
  const cph = [CPH, offset(CPH, 0.1, 0.1)];
  const two = [aarhus, offset(aarhus, 0.1, 0.1)];
  assert.deepEqual(densestFrame([cph[0], two[0], two[1], cph[1]]).members, [0, 3]);
  assert.deepEqual(densestFrame([two[0], cph[0], cph[1], two[1]]).members, [0, 3]);
  assert.ok(haversineKm(densestFrame([two[0], cph[0], cph[1], two[1]]).centre, aarhus) < 1);
});

test('the densest frame of one start is that start; of none, null', () => {
  assert.deepEqual(densestFrame([TOKYO]), { centre: TOKYO, members: [0] });
  assert.equal(densestFrame([]), null);
  assert.equal(densestFrame(null), null);
  assert.equal(densestFrame([null, [NaN, 12], 'x']), null);
  assert.deepEqual(densestFrame([null, CPH]).members, [1]); // a start that is not a point is skipped
});

test('the densest frame takes every start within the radius of the cluster, and no further', () => {
  const centre = [55.6, 12.5];
  const inside = offset(centre, 14.9);
  const outside = offset(centre, -15.1);
  assert.ok(haversineKm(inside, centre) < 15 && haversineKm(outside, centre) > 15);
  const starts = [inside, centre, centre, centre, centre, centre, outside];
  assert.deepEqual(densestFrame(starts).members, [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(densestFrame(starts, { radiusKm: 16 }).members, [0, 1, 2, 3, 4, 5, 6]);
  // A radius inside the cell still frames something: the cell's newest start.
  assert.deepEqual(densestFrame([offset(centre, 1), offset(centre, -1)], { radiusKm: 0.1 }).members, [0]);
});

test('the heatmap frames whole routes from home, the picked week first', () => {
  // Oldest first, as the period lists them: the trips are the newest two.
  const lines = HOME_STARTS.map((s, i) => ({ id: `h${i}`, points: [s, offset(s, 20)] }))
    .concat([{ id: 'ny', points: [NEW_YORK, offset(NEW_YORK, 1)] }, { id: 'tokyo', points: [TOKYO, offset(TOKYO, 1)] }]);
  const framed = framedLines(lines);
  assert.deepEqual(framed.map(l => l.id).sort(), HOME_STARTS.map((_, i) => `h${i}`).sort());
  assert.ok(framed.every(l => l.points.length === 2), 'the routes go to the map whole, not just their starts');
  const week = [lines[8]];
  assert.equal(framedLines(lines, week), week);
  assert.deepEqual(framedLines(lines, []).length, 8);
  assert.deepEqual(framedLines([]), []);
});

test('an empty heatmap opens on home or Copenhagen, and says why it is empty', () => {
  assert.deepEqual(emptyView([55.7, 12.55]), { centre: [55.7, 12.55], zoom: 11 });
  assert.deepEqual(emptyView(null), { centre: [55.68, 12.57], zoom: 11 });
  assert.equal(heatEmptyText(0), 'No routes in this period.');
  assert.equal(heatEmptyText(4), 'No route lines yet — Settings › Import past activities fetches them.');
  assert.deepEqual(model([], {}, { settings: { home: { lat: 55.7, lng: 12.55 } } }).home, [55.7, 12.55]);
  assert.equal(model([], {}, { settings: { home: { lat: 'x', lng: 12 } } }).home, null);
  assert.equal(model([]).home, null);
});

test('the heatmap footnote counts the period, then says how many of it are on the map', () => {
  assert.equal(heatCount(250), '250 activities');
  assert.equal(heatCount(1), '1 activity');
  assert.equal(heatCount(250, 250), '250 activities');
  assert.equal(heatCount(250, 212), '212 of 250 activities on the map');
  assert.equal(heatCount(0, 0), '0 activities');
});

// --- the request session --------------------------------------------------------

const FROM = '2026-01-05', TO = TODAY;
const fakeGet = (respond = url => [{ url }]) => {
  const calls = [];
  return { calls, get: url => { calls.push(url); return Promise.resolve().then(() => respond(url)); } };
};

test('session: a span inside one already loaded reuses it; a wider one asks again', async () => {
  const { calls, get } = fakeGet();
  const s = createSession(get);
  await s.load('acts', FROM, TO);
  await s.load('acts', addDays(FROM, 28), TO);
  assert.deepEqual(calls, [`/api/activities?from=${FROM}&to=${TO}`]);
  await s.load('acts', addDays(FROM, -7), TO);
  assert.equal(calls.length, 2);
  // Kinds never share a response: route lines are a different, larger request.
  await s.load('health', FROM, TO);
  await s.load('routes', FROM, TO);
  assert.deepEqual(calls.slice(2), [`/api/health?from=${FROM}&to=${TO}`, `/api/activities?from=${FROM}&to=${TO}&with=polyline`]);
});

test('session: two loads of one span in flight share a request', async () => {
  const { calls, get } = fakeGet();
  const s = createSession(get);
  const [a, b] = await Promise.all([s.load('acts', FROM, TO), s.load('acts', FROM, TO)]);
  assert.equal(calls.length, 1);
  assert.equal(a, b);
});

test('session: each visit starts empty, so nothing outlives it (or a sign-out)', async () => {
  const { calls, get } = fakeGet();
  await createSession(get).load('acts', FROM, TO);
  await createSession(get).load('acts', FROM, TO);
  assert.equal(calls.length, 2);
});

test('session: a failed request is dropped, so the next load retries; odd bodies read as no rows', async () => {
  let fail = true;
  const { calls, get } = fakeGet(() => { if (fail) throw new Error('offline'); return { not: 'rows' }; });
  const s = createSession(get);
  await assert.rejects(s.load('acts', FROM, TO), /offline/);
  fail = false;
  assert.deepEqual(await s.load('acts', FROM, TO), []);
  assert.equal(calls.length, 2);
});

test('form words: fresh above +5, tired below -10', () => {
  assert.equal(formWord(5.1), 'fresh');
  assert.equal(formWord(5), 'neutral');
  assert.equal(formWord(-10), 'neutral');
  assert.equal(formWord(-10.1), 'tired');
});
