// The Overview's pure parts: the model behind every tile, the table sort, the heatmap's
// framing and the form words. The DOM side is covered by screenshots on the preview server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildModel, displayRange, MAX_BAR_WEEKS } from '../js/views/overview-model.js';
import { sortActivities, firstDirection } from '../js/views/tiles-table.js';
import { coreLines } from '../js/views/tiles-map.js';
import { formWord } from '../js/views/tiles.js';
import { addDays } from '../js/format.js';

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

test('the heatmap frames the central starts and leaves a far-away trip out', () => {
  const home = Array.from({ length: 20 }, (_, i) => ({ id: i, points: [[55.68 + i * 0.001, 12.55 + i * 0.001], [55.69, 12.56]] }));
  const trip = { id: 'trip', points: [[48.85, 2.35], [48.86, 2.36]] };
  const core = coreLines([...home, trip]);
  assert.ok(!core.includes(trip));
  assert.ok(core.length >= 17);
  assert.deepEqual(coreLines(home.slice(0, 3)), home.slice(0, 3)); // too few to call anything an outlier
});

test('form words: fresh above +5, tired below -10', () => {
  assert.equal(formWord(5.1), 'fresh');
  assert.equal(formWord(5), 'neutral');
  assert.equal(formWord(-10), 'neutral');
  assert.equal(formWord(-10.1), 'tired');
});
