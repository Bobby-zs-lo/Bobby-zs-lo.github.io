import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ZONE_ORDER, periodRange, filterActivities, weeksBetween, weeklyVolume, planHitRate, easyTooFast,
  classifyPace, paceZoneShares, efficiencySeries, rollingMedian, hrDefaults, activityLoad,
  loadSeries, dailyKm, weekOf, firstActivityDate,
} from '../js/analytics.js';

const paces = {
  E: { min: '5:55', max: '6:30' }, M: { min: '5:08', max: '5:14' }, HM: { min: '4:58', max: '5:03' },
  T: { min: '4:50', max: '4:55' }, I: { min: '4:26', max: '4:30' }, R: { min: '4:08', max: '4:12' },
};
const plan = {
  weeks: [{
    index: 0, startDate: '2026-10-05', phase: 'reentry', label: 'Start', isCutback: false, workouts: [
      { id: 'a', date: '2026-10-06', sport: 'run', kind: 'easy', distanceKm: 6, status: 'done' },
      { id: 'b', date: '2026-10-08', sport: 'run', kind: 'tempo', distanceKm: 8, status: 'partial' },
      { id: 'c', date: '2026-10-10', sport: 'run', kind: 'long', distanceKm: 12, status: 'planned' },
      { id: 'd', date: '2026-10-11', sport: 'rest', kind: 'rest', distanceKm: null, status: 'planned' },
    ],
  }],
};
const run = (id, date, km, pace, extra = {}) => ({
  id, date, sportType: 'Run', distanceKm: km, movingMin: km * pace / 60, avgPaceSecPerKm: pace, ...extra,
});
const acts = [
  run(1, '2026-10-06', 6.1, 340, { workoutId: 'a', avgHr: 140 }),
  run(2, '2026-10-08', 5, 300, { workoutId: 'b', avgHr: 160 }),
  { id: 3, date: '2026-10-09', sportType: 'Ride', distanceKm: 30, movingMin: 70, avgHr: 120 },
];

test('ZONE_ORDER runs slowest to fastest', () => {
  assert.deepEqual(ZONE_ORDER, ['E', 'M', 'HM', 'T', 'I', 'R']);
});

// --- periods and filtering ---------------------------------------------------

test('periodRange', () => {
  assert.deepEqual(periodRange('4w', '2026-10-13', plan), { from: '2026-09-21', to: '2026-10-13' });
  assert.deepEqual(periodRange('season', '2026-10-13', plan), { from: '2026-10-05', to: '2026-10-13' });
});

test('periodRange: other keys, unknown keys, and a season that has not started', () => {
  assert.deepEqual(periodRange('12w', '2026-10-13', plan), { from: '2026-07-27', to: '2026-10-13' });
  assert.deepEqual(periodRange('1y', '2026-10-13', plan), { from: '2025-10-14', to: '2026-10-13' });
  assert.deepEqual(periodRange('all', '2026-10-13', plan), { from: '2000-01-01', to: '2026-10-13' });
  assert.deepEqual(periodRange('nonsense', '2026-10-13', plan), periodRange('12w', '2026-10-13', plan));
  // Before the plan begins the season shows its first week instead of an inverted range.
  assert.deepEqual(periodRange('season', '2026-09-20', plan), { from: '2026-10-05', to: '2026-10-11' });
});

test('periodRange: the season falls back to the 12w range when there is no plan', () => {
  assert.deepEqual(periodRange('season', '2026-10-13', null), periodRange('12w', '2026-10-13', null));
  assert.deepEqual(periodRange('season', '2026-10-13', { weeks: [] }), { from: '2026-07-27', to: '2026-10-13' });
});

test('filterActivities: inclusive dates and sport family', () => {
  const all = filterActivities(acts, { from: '2026-10-06', to: '2026-10-09' });
  assert.deepEqual(all.map(a => a.id), [1, 2, 3]);
  assert.deepEqual(filterActivities(acts, { from: '2026-10-06', to: '2026-10-09', sport: 'run' }).map(a => a.id), [1, 2]);
  assert.deepEqual(filterActivities(acts, { from: '2026-10-06', to: '2026-10-09', sport: 'ride' }).map(a => a.id), [3]);
  assert.deepEqual(filterActivities(acts, { from: '2026-10-07', to: '2026-10-08' }).map(a => a.id), [2]);
  assert.deepEqual(filterActivities([], { from: '2026-10-06', to: '2026-10-09' }), []);
  assert.deepEqual(filterActivities(null, { from: '2026-10-06', to: '2026-10-09' }), []);
});

test('filterActivities drops activities whose date is not YYYY-MM-DD', () => {
  const messy = [{ id: 1, date: '2026-10-06x' }, { id: 2, date: '2026-10-6' }, { id: 3, date: null }, { id: 4 }, { id: 5, date: '2026-10-07' }];
  assert.deepEqual(filterActivities(messy, { from: '2026-10-01', to: '2026-10-31' }).map(a => a.id), [5]);
  // weeklyVolume buckets by Monday, so a bad date must never reach it.
  assert.doesNotThrow(() => weeklyVolume(plan, messy, { from: '2026-10-05', to: '2026-10-11' }));
});

test('weeksBetween lists the Mondays that touch the range', () => {
  assert.deepEqual(weeksBetween('2026-10-07', '2026-10-21'), ['2026-10-05', '2026-10-12', '2026-10-19']);
  assert.deepEqual(weeksBetween('2026-10-05', '2026-10-11'), ['2026-10-05']);
  assert.deepEqual(weeksBetween('2026-10-14', '2026-10-14'), ['2026-10-12']);
  assert.deepEqual(weeksBetween('2026-10-20', '2026-10-05'), []);
});

// --- volume and plan adherence -----------------------------------------------

test('weeklyVolume', () => assert.deepEqual(weeklyVolume(plan, acts, { from: '2026-10-05', to: '2026-10-11', sport: 'run' }),
  [{ week: '2026-10-05', plannedKm: 26, actualKm: 11.1, label: 'Start', phase: 'reentry', isCutback: false }]));

test('weeklyVolume for rides has no plan', () => assert.equal(weeklyVolume(plan, acts, { from: '2026-10-05', to: '2026-10-11', sport: 'ride' })[0].plannedKm, 0));

test('weeklyVolume: only runs and the combined view carry the run plan', () => {
  const planned = sport => weeklyVolume(plan, acts, { from: '2026-10-05', to: '2026-10-11', sport })[0].plannedKm;
  assert.equal(planned('run'), 26);
  assert.equal(planned('all'), 26); // the plan only prescribes running, so 'all' shows that plan
  assert.equal(planned('ride'), 0);
  assert.equal(planned('other'), 0);
  assert.equal(planned('strength'), 0);
  // Still 0, not null, when the week is outside the plan.
  assert.equal(weeklyVolume(plan, acts, { from: '2026-09-28', to: '2026-09-28', sport: 'other' })[0].plannedKm, 0);
});

test('weeklyVolume: ride kilometres are summed and rest days add no planned km', () => {
  const rows = weeklyVolume(plan, acts, { from: '2026-10-05', to: '2026-10-11', sport: 'ride' });
  assert.equal(rows[0].actualKm, 30);
});

test('weeklyVolume: weeks outside the plan have null planned km and no label', () => {
  const rows = weeklyVolume(plan, acts, { from: '2026-09-28', to: '2026-10-11' });
  assert.deepEqual(rows[0], { week: '2026-09-28', plannedKm: null, actualKm: 0, label: null, phase: null, isCutback: false });
  assert.equal(rows[1].plannedKm, 26);
});

test('weeklyVolume: a week takes Monday to Sunday and ignores the range edges', () => {
  const edge = [run(10, '2026-10-04', 7, 330), run(11, '2026-10-05', 5.04, 330), run(12, '2026-10-11', 3.06, 330), run(13, '2026-10-12', 9, 330)];
  const rows = weeklyVolume(plan, edge, { from: '2026-10-07', to: '2026-10-08' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actualKm, 8.1); // 5.04 + 3.06, rounded to 0.1
});

test('weeklyVolume: sport all combines everything and empty inputs are fine', () => {
  assert.equal(weeklyVolume(plan, acts, { from: '2026-10-05', to: '2026-10-11', sport: 'all' })[0].actualKm, 41.1);
  assert.deepEqual(weeklyVolume({ weeks: [] }, [], { from: '2026-10-05', to: '2026-10-05' }),
    [{ week: '2026-10-05', plannedKm: null, actualKm: 0, label: null, phase: null, isCutback: false }]);
});

test('planHitRate counts only the past', () => assert.deepEqual(planHitRate(plan, { from: '2026-10-05', to: '2026-10-11', today: '2026-10-10' }),
  { done: 1, partial: 1, skipped: 0, missed: 0, total: 2, pct: 75 }));

test('planHitRate: planned and moved are missed, skipped is its own bucket, rest days never count', () => {
  const p = { weeks: [{ startDate: '2026-10-05', workouts: [
    { date: '2026-10-05', sport: 'run', status: 'done' },
    { date: '2026-10-06', sport: 'race', status: 'skipped' },
    { date: '2026-10-07', sport: 'run', status: 'planned' },
    { date: '2026-10-08', sport: 'run', status: 'moved' },
    { date: '2026-10-09', sport: 'ride', status: 'done' },
    { date: '2026-10-09', sport: 'rest', status: 'planned' },
  ] }] };
  assert.deepEqual(planHitRate(p, { from: '2026-10-05', to: '2026-10-11', today: '2026-10-11' }),
    { done: 1, partial: 0, skipped: 1, missed: 2, total: 4, pct: 25 });
});

test('planHitRate: today itself is not yet judged and the range is respected', () => {
  assert.deepEqual(planHitRate(plan, { from: '2026-10-07', to: '2026-10-11', today: '2026-10-08' }),
    { done: 0, partial: 0, skipped: 0, missed: 0, total: 0, pct: null });
  assert.deepEqual(planHitRate({ weeks: [] }, { from: '2026-10-05', to: '2026-10-11', today: '2026-10-12' }),
    { done: 0, partial: 0, skipped: 0, missed: 0, total: 0, pct: null });
});

// --- easy days and pace zones ------------------------------------------------

test('easyTooFast: 5:40 on an easy day is too fast', () => assert.deepEqual(easyTooFast(plan, acts, paces, { from: '2026-10-05', to: '2026-10-11' }),
  { count: 1, total: 1, ids: [1] }));

test('easyTooFast: the slack is strict and configurable, long and recovery runs count too', () => {
  const p = { weeks: [{ startDate: '2026-10-05', workouts: [
    { id: 'e', date: '2026-10-05', sport: 'run', kind: 'easy' },
    { id: 'l', date: '2026-10-10', sport: 'run', kind: 'long' },
    { id: 'r', date: '2026-10-11', sport: 'run', kind: 'recovery' },
  ] }] };
  const list = [
    run(1, '2026-10-05', 5, 345, { workoutId: 'e' }), // exactly at the slack: not too fast
    run(2, '2026-10-10', 15, 344, { workoutId: 'l' }), // one second inside: too fast
    run(3, '2026-10-11', 5, 330, { workoutId: 'r' }),
  ];
  assert.deepEqual(easyTooFast(p, list, paces, { from: '2026-10-05', to: '2026-10-11' }), { count: 2, total: 3, ids: [2, 3] });
  assert.deepEqual(easyTooFast(p, list, paces, { from: '2026-10-05', to: '2026-10-11', slackSec: 0 }), { count: 3, total: 3, ids: [1, 2, 3] });
});

test('easyTooFast: skips activities without a plan link or a pace, and rides', () => {
  const p = { weeks: [{ startDate: '2026-10-05', workouts: [{ id: 'e', date: '2026-10-05', sport: 'run', kind: 'easy' }] }] };
  const list = [
    run(1, '2026-10-05', 5, 300), // no workoutId
    run(2, '2026-10-05', 5, 300, { workoutId: 'e', avgPaceSecPerKm: null }),
    run(3, '2026-10-05', 5, 300, { workoutId: 'unknown' }),
    { id: 4, date: '2026-10-05', sportType: 'Ride', distanceKm: 20, movingMin: 50, workoutId: 'e', avgPaceSecPerKm: 100 },
    run(5, '2026-10-05', 5, 300, { workoutId: 'e', date: '2026-10-20' }), // out of range
  ];
  assert.deepEqual(easyTooFast(p, list, paces, { from: '2026-10-05', to: '2026-10-11' }), { count: 0, total: 0, ids: [] });
});

test('easyTooFast: without an easy pace there is nothing to judge against', () => {
  assert.deepEqual(easyTooFast(plan, acts, {}, { from: '2026-10-05', to: '2026-10-11' }), { count: 0, total: 0, ids: [] });
  assert.deepEqual(easyTooFast(plan, acts, null, { from: '2026-10-05', to: '2026-10-11' }), { count: 0, total: 0, ids: [] });
  assert.deepEqual(easyTooFast(plan, [], paces, { from: '2026-10-05', to: '2026-10-11' }), { count: 0, total: 0, ids: [] });
});

test('classifyPace', () => {
  assert.equal(classifyPace(400, paces), 'E');
  assert.equal(classifyPace(312, paces), 'M');
  assert.equal(classifyPace(240, paces), 'R');
  assert.equal(classifyPace(296, paces), 'T');
});

test('classifyPace: window edges, null input and missing paces', () => {
  assert.equal(classifyPace(355, paces), 'E');
  assert.equal(classifyPace(390, paces), 'E');
  assert.equal(classifyPace(308, paces), 'M');
  assert.equal(classifyPace(314, paces), 'M');
  assert.equal(classifyPace(null, paces), null);
  assert.equal(classifyPace(undefined, paces), null);
  assert.equal(classifyPace(300, {}), null);
  assert.equal(classifyPace(300, null), null);
});

test('classifyPace: a tie between two zones goes to the slower one', () => {
  const gap = { E: { min: '6:00', max: '6:30' }, M: { min: '5:00', max: '5:20' } };
  assert.equal(classifyPace(340, gap), 'E'); // 20 s from each window
  assert.equal(classifyPace(339, gap), 'M');
  assert.equal(classifyPace(341, gap), 'E');
});

test('classifyPace: works with a partial set of paces', () => {
  const some = { E: { min: '5:55', max: '6:30' }, T: { min: '4:50', max: '4:55' } };
  assert.equal(classifyPace(200, some), 'T'); // faster than the fastest window
  assert.equal(classifyPace(400, some), 'E');
  assert.equal(classifyPace(330, some), 'E'); // 25 s from E, 35 s from T
  assert.equal(classifyPace(310, some), 'T'); // 15 s from T, 45 s from E
  const fastOnly = { T: { min: '4:50', max: '4:55' } };
  assert.equal(classifyPace(500, fastOnly), 'T'); // no E window, so nearest wins
});

test('paceZoneShares weights each run by its moving time', () => {
  const list = [run(1, '2026-10-06', 10, 360, { movingMin: 60 }), run(2, '2026-10-08', 5, 312, { movingMin: 30 })];
  const shares = paceZoneShares(list, paces);
  assert.deepEqual(shares.map(s => s.key), ZONE_ORDER);
  assert.deepEqual(shares[0], { key: 'E', minutes: 60, share: 0.667 });
  assert.deepEqual(shares[1], { key: 'M', minutes: 30, share: 0.333 });
  assert.ok(shares.slice(2).every(s => s.minutes === 0 && s.share === 0));
});

test('paceZoneShares: no runs, no pace, other sports and no paces give all zeros', () => {
  const zero = ZONE_ORDER.map(key => ({ key, minutes: 0, share: 0 }));
  assert.deepEqual(paceZoneShares([], paces), zero);
  assert.deepEqual(paceZoneShares(null, paces), zero);
  assert.deepEqual(paceZoneShares([acts[2], run(9, '2026-10-06', 5, null, { avgPaceSecPerKm: null })], paces), zero);
  assert.deepEqual(paceZoneShares(acts.slice(0, 2), {}), zero);
});

// --- efficiency, medians and heart-rate defaults -----------------------------

test('efficiency and load are finite and ordered', () => {
  const e = efficiencySeries(acts);
  assert.equal(e.length, 2);
  assert.ok(e[0].ef > 0);
  const l = loadSeries(acts, { from: '2026-10-05', to: '2026-10-11', hrRest: 50, hrMax: 190 });
  assert.equal(l.length, 7);
  assert.ok(l.every((d) => Number.isFinite(d.fitness) && Number.isFinite(d.form)));
  assert.ok(l[1].load > 0);
});

test('efficiencySeries: metres per beat, sorted by date, skipping runs without usable HR or pace', () => {
  const list = [
    run(2, '2026-10-08', 5, 300, { avgHr: 160 }),
    run(1, '2026-10-06', 6, 340, { avgHr: 140 }),
    run(3, '2026-10-09', 5, 300, { avgHr: null }),
    run(4, '2026-10-10', 5, 300, { avgHr: 0 }),
    run(5, '2026-10-11', 5, null, { avgHr: 150, avgPaceSecPerKm: null }),
    { id: 6, date: '2026-10-07', sportType: 'Ride', distanceKm: 30, movingMin: 70, avgHr: 120, avgPaceSecPerKm: 140 },
  ];
  assert.deepEqual(efficiencySeries(list), [{ date: '2026-10-06', ef: 1.26 }, { date: '2026-10-08', ef: 1.25 }]);
  assert.deepEqual(efficiencySeries([]), []);
  assert.deepEqual(efficiencySeries(null), []);
});

test('rollingMedian looks back over (date - days, date]', () => {
  const series = [
    { date: '2026-10-01', ef: 1.0 }, { date: '2026-10-02', ef: 1.2 },
    { date: '2026-10-03', ef: 1.4 }, { date: '2026-10-05', ef: 1.6 },
  ];
  assert.deepEqual(rollingMedian(series, 3), [
    { date: '2026-10-01', value: 1 }, { date: '2026-10-02', value: 1.1 },
    { date: '2026-10-03', value: 1.2 }, { date: '2026-10-05', value: 1.5 },
  ]);
  assert.deepEqual(rollingMedian([], 28), []);
  assert.deepEqual(rollingMedian(null, 28), []);
});

test('rollingMedian: a long window takes the median of everything so far, and unsorted input is fine', () => {
  const series = [{ date: '2026-10-03', ef: 3 }, { date: '2026-10-01', ef: 1 }, { date: '2026-10-02', ef: 2 }];
  assert.deepEqual(rollingMedian(series, 28).map(p => p.value), [1, 1.5, 2]);
});

test('rollingMedian: points sharing a date all see the whole day', () => {
  const series = [{ date: '2026-10-01', ef: 1 }, { date: '2026-10-01', ef: 3 }, { date: '2026-10-02', ef: 2 }];
  assert.deepEqual(rollingMedian(series, 28).map(p => p.value), [2, 2, 2]);
});

test('efficiencySeries skips malformed dates so the rolling median stays safe', () => {
  const list = [run(1, 'bad', 5, 300, { avgHr: 150 }), run(2, '2026-10-06', 5, 300, { avgHr: 150 })];
  assert.deepEqual(efficiencySeries(list).map(p => p.date), ['2026-10-06']);
});

test('hrDefaults: median resting HR, highest recorded max HR', () => {
  const health = [{ restingHr: 50 }, { restingHr: null }, { restingHr: 54 }, { restingHr: 52 }];
  const list = [{ maxHr: 170 }, { maxHr: null }, { maxHr: 182 }];
  assert.deepEqual(hrDefaults(list, health), { hrRest: 52, hrMax: 182 });
  assert.equal(hrDefaults(list, [{ restingHr: 50 }, { restingHr: 54 }]).hrRest, 52);
});

test('hrDefaults ignores implausible max HR spikes above 220', () => {
  assert.equal(hrDefaults([{ maxHr: 182 }, { maxHr: 243 }], []).hrMax, 182);
  assert.equal(hrDefaults([{ maxHr: 220 }], []).hrMax, 220); // the limit itself is plausible
  assert.deepEqual(hrDefaults([{ maxHr: 243 }, { maxHr: 251 }], [{ restingHr: 52 }]), { hrRest: 52, hrMax: 190 });
});

test('hrDefaults: sensible fallbacks and a minimum spread', () => {
  assert.deepEqual(hrDefaults([], []), { hrRest: 55, hrMax: 190 });
  assert.deepEqual(hrDefaults(null, null), { hrRest: 55, hrMax: 190 });
  assert.deepEqual(hrDefaults([{ maxHr: null }], [{ restingHr: null }]), { hrRest: 55, hrMax: 190 });
  // A max below rest + 40 would make heart-rate reserve meaningless.
  assert.deepEqual(hrDefaults([{ maxHr: 120 }], [{ restingHr: 100 }]), { hrRest: 100, hrMax: 140 });
});

// --- load ------------------------------------------------------------------

test('activityLoad: Banister TRIMP when HR exists', () => {
  const hr = { hrRest: 50, hrMax: 190 };
  const hrr = (150 - 50) / (190 - 50);
  const expected = 60 * hrr * 0.64 * Math.exp(1.92 * hrr);
  assert.ok(Math.abs(activityLoad({ sportType: 'Run', movingMin: 60, avgHr: 150 }, hr) - expected) < 1e-9);
  assert.ok(Math.abs(expected - 108.1) < 0.1);
});

test('activityLoad: heart-rate reserve is clamped to 0..1', () => {
  const hr = { hrRest: 50, hrMax: 190 };
  assert.equal(activityLoad({ sportType: 'Run', movingMin: 60, avgHr: 45 }, hr), 0);
  assert.ok(Math.abs(activityLoad({ sportType: 'Run', movingMin: 60, avgHr: 200 }, hr) - 60 * 0.64 * Math.exp(1.92)) < 1e-9);
});

test('activityLoad: duration fallback without HR, and zero without a duration', () => {
  const hr = { hrRest: 50, hrMax: 190 };
  assert.equal(activityLoad({ sportType: 'Run', movingMin: 60, avgHr: null }, hr), 72);
  assert.equal(activityLoad({ sportType: 'TrailRun', movingMin: 60 }, hr), 72);
  assert.equal(activityLoad({ sportType: 'Ride', movingMin: 60 }, hr), 48);
  assert.equal(activityLoad({ sportType: 'Swim', movingMin: 60 }, hr), 36);
  assert.equal(activityLoad({ sportType: 'Run', avgHr: 150 }, hr), 0);
  assert.equal(activityLoad({ sportType: 'Run' }, hr), 0);
  // A degenerate HR range cannot yield a reserve, so the duration estimate is used.
  assert.equal(activityLoad({ sportType: 'Run', movingMin: 60, avgHr: 150 }, { hrRest: 190, hrMax: 190 }), 72);
});

test('loadSeries: fitness follows 42 days, fatigue 7 days, form is their difference', () => {
  const one = [{ id: 1, date: '2026-10-05', sportType: 'Run', movingMin: 35 }]; // 35 * 1.2 = 42
  const l = loadSeries(one, { from: '2026-10-05', to: '2026-10-06', hrRest: 50, hrMax: 190 });
  assert.deepEqual(l[0], { date: '2026-10-05', load: 42, fitness: 1, fatigue: 6, form: -5 });
  // Day two: 1 - 1/42 = 0.976, 6 - 6/7 = 5.143; the unrounded state carries forward.
  assert.deepEqual(l[1], { date: '2026-10-06', load: 0, fitness: 1, fatigue: 5.1, form: -4.2 });
});

test('loadSeries: activities before `from` warm the averages up but are not returned', () => {
  const early = [{ id: 1, date: '2026-09-01', sportType: 'Run', movingMin: 300 }];
  const l = loadSeries(early, { from: '2026-10-05', to: '2026-10-07', hrRest: 50, hrMax: 190 });
  assert.deepEqual(l.map(d => d.date), ['2026-10-05', '2026-10-06', '2026-10-07']);
  assert.ok(l[0].fitness > 0);
  assert.ok(l[0].fitness > l[2].fitness);
});

test('loadSeries: several activities a day add up, later ones are ignored, empty input stays at zero', () => {
  const list = [
    { id: 1, date: '2026-10-05', sportType: 'Run', movingMin: 10 },
    { id: 2, date: '2026-10-05', sportType: 'Ride', movingMin: 10 },
    { id: 3, date: '2026-10-09', sportType: 'Run', movingMin: 50 },
    { id: 4, date: null, sportType: 'Run', movingMin: 50 },
  ];
  const l = loadSeries(list, { from: '2026-10-05', to: '2026-10-06', hrRest: 50, hrMax: 190 });
  assert.equal(l.length, 2);
  assert.equal(l[0].load, 20); // 12 + 8
  assert.equal(l[1].load, 0);
  assert.deepEqual(loadSeries([], { from: '2026-10-05', to: '2026-10-06', hrRest: 50, hrMax: 190 }),
    [{ date: '2026-10-05', load: 0, fitness: 0, fatigue: 0, form: 0 }, { date: '2026-10-06', load: 0, fitness: 0, fatigue: 0, form: 0 }]);
  assert.deepEqual(loadSeries([], { from: '2026-10-06', to: '2026-10-05', hrRest: 50, hrMax: 190 }), []);
});

test('loadSeries skips activities with a malformed date instead of throwing', () => {
  const list = [
    { id: 1, date: '-1', sportType: 'Run', movingMin: 35 },
    { id: 2, date: ' 2026-10-05', sportType: 'Run', movingMin: 35 },
    { id: 3, date: '2026-1-5', sportType: 'Run', movingMin: 35 },
    { id: 4, date: 'garbage', sportType: 'Run', movingMin: 35 },
    { id: 5, date: '2026-10-05', sportType: 'Run', movingMin: 35 },
  ];
  let l;
  assert.doesNotThrow(() => { l = loadSeries(list, { from: '2026-10-05', to: '2026-10-06', hrRest: 50, hrMax: 190 }); });
  assert.deepEqual(l.map(d => [d.date, d.load]), [['2026-10-05', 42], ['2026-10-06', 0]]);
});

test('loadSeries handles fifteen years of daily activities quickly', () => {
  const many = [];
  for (let d = Date.UTC(2011, 0, 1); d < Date.UTC(2026, 0, 1); d += 86400000) {
    many.push({ id: many.length, date: new Date(d).toISOString().slice(0, 10), sportType: 'Run', movingMin: 45, avgHr: 145 });
  }
  const t0 = Date.now();
  const l = loadSeries(many, { from: '2025-01-01', to: '2026-01-01', hrRest: 50, hrMax: 190 });
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(l.length, 366);
  assert.ok(l.at(-1).fitness > 20); // a steady daily load settles near itself
});

test('dailyKm sums kilometres per date', () => {
  const m = dailyKm([run(1, '2026-10-06', 5.04, 330), run(2, '2026-10-06', 3.06, 330), { id: 3, date: '2026-10-07', distanceKm: null }]);
  assert.ok(m instanceof Map);
  assert.deepEqual([...m], [['2026-10-06', 8.1], ['2026-10-07', 0]]);
  assert.equal(dailyKm([]).size, 0);
  assert.equal(dailyKm(null).size, 0);
});

test('dailyKm skips malformed dates', () => {
  assert.deepEqual([...dailyKm([{ date: 'bad', distanceKm: 5 }, { date: '2026-10-06', distanceKm: 2 }])], [['2026-10-06', 2]]);
});

test('firstActivityDate is the earliest valid date, or null', () => {
  const list = [{ date: '2026-10-08' }, { date: 'bad' }, { date: '2024-03-02' }, { date: null }, { date: '2025-01-01' }, {}];
  assert.equal(firstActivityDate(list), '2024-03-02');
  assert.equal(firstActivityDate([{ date: 'bad' }, { date: null }]), null);
  assert.equal(firstActivityDate([]), null);
  assert.equal(firstActivityDate(null), null);
});

test('weekOf finds the plan week that holds a date', () => {
  assert.equal(weekOf(plan, '2026-10-08'), plan.weeks[0]);
  assert.equal(weekOf(plan, '2026-10-05'), plan.weeks[0]);
  assert.equal(weekOf(plan, '2026-10-11'), plan.weeks[0]);
  assert.equal(weekOf(plan, '2026-10-12'), null);
  assert.equal(weekOf({ weeks: [] }, '2026-10-12'), null);
  assert.equal(weekOf(null, '2026-10-12'), null);
});
