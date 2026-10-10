// Tests for js/links.js: which recorded sessions count for a planned workout.
// Every activity and session here is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_LINKS, healthSessions, canLink, linkedSessions, linkedTotals, comparisonLine, sessionStats,
  linkCandidates, linksBody, linksError, hasUnlinkedMatch,
} from '../js/links.js';

const RUN = 'w-2026-10-13-run', CORE = 'w-2026-10-13-strength';
const WARM_UP = 904, MORNING = 902, COMMUTE = 903;

const workouts = () => [
  { id: RUN, date: '2026-10-13', sport: 'run', title: 'Easy run', distanceKm: 5, durationMin: null, status: 'done' },
  { id: CORE, date: '2026-10-13', sport: 'strength', title: 'Core & mobility', distanceKm: null, durationMin: 20, status: 'planned' },
];
const activities = () => [
  { id: MORNING, startUtc: '2026-10-13T05:58:00Z', sportType: 'Run', name: 'Morning Run', distanceKm: 5.21, movingMin: 31.6, commute: false, workoutId: RUN, linkSource: null },
  { id: COMMUTE, startUtc: '2026-10-13T07:40:00Z', sportType: 'Ride', name: 'Commute to work', distanceKm: 6.1, movingMin: 19, commute: true, workoutId: null, linkSource: null },
  { id: WARM_UP, startUtc: '2026-10-13T05:49:00Z', sportType: 'Run', name: 'Warm-up jog', distanceKm: 1.2, movingMin: 8.1, commute: false, workoutId: null, linkSource: null },
];
const exercise = () => [
  { id: 'hc-walk', type: 'walking', startUtc: '2026-10-13T10:30:00Z', durationMin: 25, distanceKm: 1.9, duplicateOfStrava: false, workoutId: null },
  { id: 'hc-copy', type: 'running', startUtc: '2026-10-13T05:58:00Z', durationMin: 32, distanceKm: 5.1, duplicateOfStrava: true, workoutId: null },
];
const makeDay = (over = {}) => ({ date: '2026-10-13', workouts: workouts(), activities: activities(), health: { steps: 9000, exercise: exercise() }, ...over });
const healthOnly = (session = {}) => makeDay({
  activities: [],
  health: { exercise: [{ id: 'hc-run', type: 'running', startUtc: '2026-10-13T06:10:00Z', durationMin: 47, distanceKm: 7.2, duplicateOfStrava: false, workoutId: null, ...session }] },
});
const pick = (list, ...keys) => list.map(row => keys.map(k => row[k]));

// ── what the day holds ──────────────────────────────────────────────────────

test('health sessions: by start time, and only those the backend gave an id', () => {
  assert.deepEqual(healthSessions(makeDay()).map(s => s.id), ['hc-copy', 'hc-walk']);
  const old = makeDay({ health: { exercise: [{ type: 'running', startUtc: '2026-10-13T05:58:00Z', durationMin: 32, distanceKm: 5.1, duplicateOfStrava: false }] } });
  assert.deepEqual(healthSessions(old), [], 'a payload from before ids existed has nothing to link');
  assert.deepEqual(healthSessions(makeDay({ health: null })), []);
  assert.deepEqual(healthSessions(undefined), []);
});

test('canLink: a session can be given what was recorded on its day, a Strava activity or a Health Connect session', () => {
  const [run, core] = workouts();
  assert.equal(canLink(run, makeDay()), true);
  assert.equal(canLink(core, makeDay()), true, 'whatever its sport');
  assert.equal(canLink(run, healthOnly()), true);
  assert.equal(canLink(run, makeDay({ activities: [], health: null })), false, 'nothing recorded, nothing to choose from');
  assert.equal(canLink(run, makeDay({ activities: [], health: { exercise: [] } })), false);
  assert.equal(canLink(run, null), false, 'the week could not be read');
});

test('canLink: a rest day has nothing to link, whatever was recorded', () => {
  const rest = { id: 'w-rest', date: '2026-10-13', sport: 'rest', title: 'Rest' };
  assert.equal(canLink(rest, makeDay()), false);
  assert.equal(canLink(rest, healthOnly()), false);
});

// ── what counts for a workout ───────────────────────────────────────────────

test('linked sessions: the workout’s Strava activities and Health Connect sessions, by start time', () => {
  const day = makeDay();
  day.activities.find(a => a.id === WARM_UP).workoutId = RUN;
  day.health.exercise.find(s => s.id === 'hc-walk').workoutId = RUN;
  const linked = linkedSessions(day, RUN);
  assert.deepEqual(linked.activities.map(a => a.id), [WARM_UP, MORNING]);
  assert.deepEqual(linked.health.map(s => s.id), ['hc-walk']);
  assert.deepEqual(linkedSessions(day, CORE), { activities: [], health: [] });
  assert.deepEqual(linkedSessions(null, RUN), { activities: [], health: [] });
});

test('linked sessions: a Health Connect copy of a Strava activity never counts', () => {
  const day = makeDay();
  day.health.exercise.find(s => s.id === 'hc-copy').workoutId = RUN;
  assert.deepEqual(linkedSessions(day, RUN).health, []);
  assert.equal(linkedTotals(linkedSessions(day, RUN)).distanceKm, 5.21);
});

test('totals: distance and time of both kinds together', () => {
  const day = makeDay();
  day.activities.find(a => a.id === WARM_UP).workoutId = RUN;
  day.health.exercise.find(s => s.id === 'hc-walk').workoutId = RUN;
  const totals = linkedTotals(linkedSessions(day, RUN));
  assert.equal(totals.count, 3);
  assert.equal(Math.round(totals.distanceKm * 100) / 100, 8.31);
  assert.equal(Math.round(totals.durationMin * 10) / 10, 64.7);
  assert.deepEqual(linkedTotals(linkedSessions(day, CORE)), { count: 0, distanceKm: 0, durationMin: 0 });
  const noDistance = linkedTotals({ activities: [], health: [{ id: 'x', type: 'strength_training', durationMin: 25, distanceKm: null }] });
  assert.deepEqual(noDistance, { count: 1, distanceKm: 0, durationMin: 25 });
});

test('comparison line: against the planned distance, with the total when several count', () => {
  const run = { distanceKm: 5 };
  assert.equal(comparisonLine(run, { count: 1, distanceKm: 5.21, durationMin: 31.6 }), '0.2 km more than planned.');
  assert.equal(comparisonLine(run, { count: 1, distanceKm: 5.04, durationMin: 30 }), 'Exactly as planned.');
  assert.equal(comparisonLine(run, { count: 1, distanceKm: 1.2, durationMin: 8 }), '3.8 km short of the plan.');
  assert.equal(comparisonLine(run, { count: 2, distanceKm: 6.41, durationMin: 39.7 }), '6.4 km together. 1.4 km more than planned.');
  assert.equal(comparisonLine(run, { count: 0, distanceKm: 0, durationMin: 0 }), '');
  assert.equal(comparisonLine({ distanceKm: null, durationMin: 45 }, { count: 1, distanceKm: 18.4, durationMin: 46 }), '', 'no planned distance, nothing to compare');
  assert.equal(comparisonLine(run, { count: 1, distanceKm: 0, durationMin: 25 }), '', 'a session without a distance says nothing about the distance');
});

test('session stats: distance, duration, start time; no distance when none was recorded', () => {
  assert.equal(sessionStats({ distanceKm: 5.1, durationMin: 32, startUtc: '2026-10-13T05:02:00Z' }), '5.1 km · 32 min · 07:02');
  assert.equal(sessionStats({ distanceKm: null, durationMin: 25, startUtc: '2026-10-06T17:00:00Z' }), '25 min · 19:00');
  assert.equal(sessionStats({ distanceKm: 7.2, durationMin: 47, startUtc: null }), '7.2 km · 47 min');
});

// ── the editor ──────────────────────────────────────────────────────────────

test('candidates: every session of the day, Strava first, then Health Connect, each by start time', () => {
  const list = linkCandidates(makeDay(), RUN);
  assert.deepEqual(pick(list, 'key', 'source', 'name'), [
    ['activity:904', 'Strava', 'Warm-up jog'],
    ['activity:902', 'Strava', 'Morning Run'],
    ['activity:903', 'Strava', 'Commute to work'],
    ['health:hc-copy', 'Health Connect', 'Run'],
    ['health:hc-walk', 'Health Connect', 'Walk'],
  ]);
  assert.deepEqual(pick(list, 'kind', 'id').slice(0, 1), [['activity', '904']], 'ids are strings, as the API takes them');
  assert.deepEqual(list.map(c => c.stats), [
    '1.2 km · 8 min · 07:49', '5.2 km · 32 min · 07:58', '6.1 km · 19 min · 09:40', '5.1 km · 32 min · 07:58', '1.9 km · 25 min · 12:30',
  ]);
  assert.deepEqual(list.map(c => c.commute), [false, false, true, false, false]);
});

test('candidates: an activity without a name goes by its sport type', () => {
  const day = makeDay();
  day.activities[0].name = '';
  assert.equal(linkCandidates(day, RUN).find(c => c.id === String(MORNING)).name, 'Run');
});

test('candidates: what is linked now is ticked', () => {
  const day = makeDay();
  day.health.exercise.find(s => s.id === 'hc-walk').workoutId = RUN;
  const list = linkCandidates(day, RUN);
  assert.deepEqual(list.filter(c => c.linked).map(c => c.key), ['activity:902', 'health:hc-walk']);
  assert.deepEqual(linkCandidates(day, CORE).filter(c => c.linked), []);
});

test('candidates: a Health Connect copy of a Strava activity cannot be ticked', () => {
  const day = makeDay();
  day.health.exercise.find(s => s.id === 'hc-copy').workoutId = RUN; // must not happen; never trust it
  const copy = linkCandidates(day, RUN).find(c => c.key === 'health:hc-copy');
  assert.deepEqual([copy.disabled, copy.linked, copy.note], [true, false, 'Same as the Strava activity']);
  assert.deepEqual(linkCandidates(day, RUN).filter(c => c.linked).map(c => c.key), ['activity:902']);
  assert.ok(linkCandidates(day, RUN).filter(c => c.key !== 'health:hc-copy').every(c => !c.disabled));
});

test('candidates: a session linked to another workout of the day says which', () => {
  const list = linkCandidates(makeDay(), CORE);
  const morning = list.find(c => c.key === 'activity:902');
  assert.deepEqual([morning.linked, morning.disabled, morning.note], [false, false, 'Linked to Easy run']);
  assert.equal(list.find(c => c.key === 'activity:904').note, null);

  const moved = makeDay();
  moved.activities[0].workoutId = 'w-gone'; // its workout has left the day
  moved.health.exercise.find(s => s.id === 'hc-walk').workoutId = RUN;
  const other = linkCandidates(moved, CORE);
  assert.equal(other.find(c => c.key === 'activity:902').note, 'Linked to another session');
  assert.equal(other.find(c => c.key === 'health:hc-walk').note, 'Linked to Easy run');
});

test('request body: the complete set that counts, ids as strings, in the order shown', () => {
  const list = linkCandidates(makeDay(), RUN);
  assert.deepEqual(linksBody(list, ['activity:904']), { activityIds: ['904'], healthIds: [] });
  assert.deepEqual(linksBody(list, ['health:hc-walk', 'activity:902', 'activity:904']), { activityIds: ['904', '902'], healthIds: ['hc-walk'] });
  assert.deepEqual(linksBody(list, []), { activityIds: [], healthIds: [] }, 'nothing ticked unlinks everything');
});

test('request body: a disabled or unknown session is never sent', () => {
  const list = linkCandidates(makeDay(), RUN);
  assert.deepEqual(linksBody(list, ['health:hc-copy', 'activity:1', 'activity:902', 'activity:902']), { activityIds: ['902'], healthIds: [] });
});

test('a Health Connect session alone can count', () => {
  const day = healthOnly();
  const longRun = { id: RUN, distanceKm: 7 };
  const list = linkCandidates(day, RUN);
  assert.deepEqual(pick(list, 'key', 'name', 'stats', 'linked'), [['health:hc-run', 'Run', '7.2 km · 47 min · 08:10', false]]);
  assert.deepEqual(linksBody(list, ['health:hc-run']), { activityIds: [], healthIds: ['hc-run'] });
  const after = healthOnly({ workoutId: RUN });
  assert.equal(comparisonLine(longRun, linkedTotals(linkedSessions(after, RUN))), '0.2 km more than planned.');
});

test('the backend takes at most ten of each kind', () => {
  assert.equal(MAX_LINKS, 10);
  const ids = n => Array.from({ length: n }, (_, i) => String(i));
  assert.equal(linksError({ activityIds: ids(10), healthIds: ids(10) }), null);
  assert.match(linksError({ activityIds: ids(11), healthIds: [] }), /at most 10 Strava activities/);
  assert.match(linksError({ activityIds: [], healthIds: ids(11) }), /at most 10 Health Connect sessions/);
});

// ── Today's hint ────────────────────────────────────────────────────────────

test('unlinked match: a recorded session of the workout’s own sport that counts for nothing yet', () => {
  const [run, core] = workouts();
  assert.equal(hasUnlinkedMatch(makeDay(), run), true, 'the warm-up is a run nobody claimed');
  assert.equal(hasUnlinkedMatch(makeDay(), core), false, 'nothing recorded was strength work');
  assert.equal(hasUnlinkedMatch(healthOnly(), run), true, 'a Health Connect run counts as one');
  assert.equal(hasUnlinkedMatch(healthOnly({ workoutId: RUN }), run), false);
});

test('unlinked match: a commute, a walk or a Strava copy does not prompt on a planned run', () => {
  const [run] = workouts();
  const day = makeDay();
  day.activities = day.activities.filter(a => a.id === COMMUTE);
  assert.equal(hasUnlinkedMatch(day, run), false, 'the ride to work and a walk are not the run');
  day.health.exercise.find(s => s.id === 'hc-copy').workoutId = null;
  assert.equal(hasUnlinkedMatch(day, run), false, 'a copy of a Strava activity is not a second run');
});

test('unlinked match: a session whose workout left the day is free again; rest days never prompt', () => {
  const [run] = workouts();
  const day = makeDay();
  day.activities = [{ ...day.activities[0], workoutId: 'w-gone' }];
  assert.equal(hasUnlinkedMatch(day, run), true);
  assert.equal(hasUnlinkedMatch(makeDay(), { id: 'w-rest', sport: 'rest' }), false);
  const ride = { id: 'w-ride', sport: 'ride' };
  assert.equal(hasUnlinkedMatch(makeDay(), ride), false, 'a commute never prompts on a planned ride either');
  assert.equal(hasUnlinkedMatch(makeDay(), { id: 'w-race', sport: 'race' }), true, 'a race is a run');
});
