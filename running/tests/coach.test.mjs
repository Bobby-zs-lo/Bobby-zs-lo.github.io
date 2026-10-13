// The thread with the coach as pure logic (js/coach.js), and the mock that stands in for the
// backend's coach routes (tests/mock-coach.mjs through tests/mock-api.mjs). Invented data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseAbout, aboutParam, aboutLabel, aboutHref, outcomeLines, OUTCOME_TAGS, waitingState, newReplies, foldThread,
  checkMessage, countdown, goalFacts, sortGoals, goalFromForm, levelFromForm, parseTarget, outlookLine, notInPlanLine, MAX_MESSAGE_CHARS,
} from '../js/coach.js';
import { describeChange } from '../js/changes.js';
import { createMockApi } from './mock-api.mjs';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const OWNER = 'Bearer test-token';

// ── what a message is about ─────────────────────────────────────────────────

test('about: the address form parses to a reference and back, and nothing else gets through', () => {
  assert.deepEqual(parseAbout('workout:w-2026-10-22-run'), { type: 'workout', id: 'w-2026-10-22-run' });
  assert.deepEqual(parseAbout('review:r-2026-10-13-a1'), { type: 'review', id: 'r-2026-10-13-a1' });
  assert.deepEqual(parseAbout('goal:main'), { type: 'goal', id: 'main' });
  assert.deepEqual(parseAbout('plan'), { type: 'plan' });
  for (const bad of ['', undefined, 'workout', 'workout:', ':x', 'activity:123', 'nonsense:1']) assert.equal(parseAbout(bad), null, String(bad));
  for (const a of [{ type: 'workout', id: 'w-2026-10-22-run' }, { type: 'plan' }, { type: 'proposal', id: 'p:1' }]) {
    assert.deepEqual(parseAbout(aboutParam(a)), a);
  }
});

test('about: the label names the thing, with or without the details the server adds', () => {
  assert.equal(aboutLabel({ type: 'workout', id: 'w-2026-10-22-run', date: '2026-10-22', title: 'Easy run + strides' }), 'Easy run + strides, Thu 22 Oct');
  assert.equal(aboutLabel({ type: 'workout', id: 'w-2026-10-22-run' }), 'A planned session');
  assert.equal(aboutLabel({ type: 'review', id: 'r1', weekStart: '2026-10-05' }), 'Review of 5–11 Oct');
  assert.equal(aboutLabel({ type: 'proposal', id: 'p1', summary: 'Two bigger changes' }), 'Proposal: Two bigger changes');
  assert.equal(aboutLabel({ type: 'goal', id: 'main', title: 'Berlin Marathon' }), 'Goal: Berlin Marathon');
  assert.equal(aboutLabel({ type: 'plan' }), 'The plan as a whole');
  assert.equal(aboutLabel(null), '');
  assert.equal(aboutLabel({ type: 'activity', id: '1' }), '');
  assert.equal(aboutHref({ type: 'workout', id: 'w-2026-10-22-run' }), '#/workout/w-2026-10-22-run');
  assert.equal(aboutHref({ type: 'review', id: 'r1' }), null);
  assert.equal(aboutHref(null), null);
});

// ── a reply's outcome ───────────────────────────────────────────────────────

test('outcome: what waits for him first, then what was done, then what could not be', () => {
  const lookup = id => (id === 'w-2026-10-17-run' ? { id, title: 'Long run', date: '2026-10-17' } : undefined);
  const result = {
    applied: [{ op: 'update', workoutId: 'w-2026-10-17-run', set: { distanceKm: 6 }, reason: 'Easier week' }],
    proposed: [{ op: 'set_race', raceDate: '2027-10-31', raceName: 'Frankfurt Marathon', reason: 'You asked' }],
    rejected: [{ change: { op: 'update', workoutId: 'w-2026-10-17-run', set: { distanceKm: 40 } }, error: 'run longer than 35 km' }],
    goals: {
      applied: [
        { op: 'add', goal: { id: 'g1', title: 'Half marathon', targetSeconds: 6300, status: 'active' } },
        { op: 'update', goal: { id: 'main', title: null, targetSeconds: 13500 } },
        { op: 'update', goal: { id: 'g2', title: '5 km under 22:00', targetSeconds: null, status: 'dropped' } },
        { op: 'remove', goal: { id: 'g3', title: 'Old goal', targetSeconds: 1500 } },
      ],
      rejected: [{ change: { op: 'remove', goalId: 'x' }, error: 'No such goal' }],
    },
    notes: { applied: [{ op: 'add', note: { id: 'n1', text: 'No runs on Tuesdays' } }, { op: 'remove', note: { id: 'n2', text: 'Old note' } }], rejected: [{ change: {}, error: 'No such note' }] },
  };
  const lines = outcomeLines(result, lookup);
  assert.deepEqual(lines.map(l => [l.kind, l.text, l.reason]), [
    ['proposed', 'Make the main race Sun 31 Oct 2027 (Frankfurt Marathon): every future week is rebuilt', 'You asked'],
    ['applied', 'Change Long run (Sat 17 Oct): 6 km', 'Easier week'],
    ['goal', 'Goal added: Half marathon, target 1:45:00', null],
    ['goal', 'Goal updated: the marathon, target 3:45:00', null],
    ['goal', 'Goal updated: 5 km under 22:00 (dropped)', null],
    ['goal', 'Goal removed: Old goal', null],
    ['note', 'Noted: “No runs on Tuesdays”', null],
    ['note', 'Note dropped: “Old note”', null],
    ['rejected', 'Change Long run (Sat 17 Oct): 40 km', 'run longer than 35 km'],
    ['rejected', 'A goal change', 'No such goal'],
    ['rejected', 'A note change', 'No such note'],
  ]);
  for (const l of lines) assert.ok(OUTCOME_TAGS[l.kind], `a tag for ${l.kind}`);
  // What became of the proposal shows on the reply that made it; unknown (an old reply) says only that it was one.
  const fate = proposal => { const [first] = outcomeLines(result, lookup, proposal); return [first.kind, OUTCOME_TAGS[first.kind]]; };
  assert.deepEqual([fate('pending'), fate('accepted'), fate('rejected'), fate(null), fate(undefined)],
    [['waiting', 'Needs you'], ['accepted', 'Accepted'], ['declined', 'Declined'], ['proposed', 'Proposed'], ['proposed', 'Proposed']]);
  assert.deepEqual(outcomeLines(null), []);
  assert.deepEqual(outcomeLines({}), []);
  assert.equal(describeChange({ op: 'set_race', raceDate: '2027-10-31' }), 'Make the main race Sun 31 Oct 2027: every future week is rebuilt');
});

// ── waiting ─────────────────────────────────────────────────────────────────

test('waiting: only a run under way is polled, only a stalled one offers Try again', () => {
  assert.deepEqual(waitingState({ state: 'idle' }), { line: null, poll: false, retry: false });
  assert.deepEqual(waitingState(undefined), { line: null, poll: false, retry: false });
  const thinking = waitingState({ state: 'thinking', since: '2026-10-12T08:00:00Z' });
  assert.deepEqual([thinking.poll, thinking.retry], [true, false]);
  assert.match(thinking.line, /two to three minutes/);
  const stalled = waitingState({ state: 'stalled' });
  assert.deepEqual([stalled.poll, stalled.retry], [false, true]);
  const offline = waitingState({ state: 'offline' });
  assert.deepEqual([offline.poll, offline.retry], [false, false]);
  assert.match(offline.line, /next weekly review/);
});

test('thread: new replies are the coach\'s messages not seen before; the fold keeps the newest', () => {
  const before = [{ id: 'a', role: 'user' }, { id: 'b', role: 'coach' }];
  const after = [...before, { id: 'c', role: 'user' }, { id: 'd', role: 'coach' }];
  assert.deepEqual(newReplies(before, after), ['d']);
  assert.deepEqual(newReplies(before, before), []);
  assert.deepEqual(newReplies(null, after), ['b', 'd']);
  const ten = Array.from({ length: 10 }, (_, i) => ({ id: `m${i}` }));
  assert.deepEqual(foldThread(ten, 8), { hidden: 2, shown: ten.slice(2) });
  assert.deepEqual(foldThread(ten.slice(0, 3), 8), { hidden: 0, shown: ten.slice(0, 3) });
  assert.deepEqual(foldThread(null, 8), { hidden: 0, shown: [] });
});

test('a message is trimmed, and refused when empty or too long', () => {
  assert.deepEqual(checkMessage('  Hej  '), { text: 'Hej' });
  assert.match(checkMessage('   ').error, /Write something/);
  assert.match(checkMessage('x'.repeat(MAX_MESSAGE_CHARS + 1)).error, /2001 characters/);
  assert.deepEqual(checkMessage('x'.repeat(MAX_MESSAGE_CHARS)), { text: 'x'.repeat(MAX_MESSAGE_CHARS) });
});

// ── goals ───────────────────────────────────────────────────────────────────

test('goals: countdown, facts on one line, and the order they are listed in', () => {
  const today = '2026-10-13';
  assert.deepEqual(['2026-10-13', '2026-10-14', '2026-10-12', '2027-04-18', '2026-10-01', null].map(d => countdown(d, today)),
    ['today', 'tomorrow', 'yesterday', 'in 187 days', '12 days ago', '']);
  assert.equal(goalFacts({ date: '2027-04-18', distanceKm: 21.0975, targetSeconds: 6300, status: 'active' }, today), 'Sun 18 Apr 2027 · in 187 days · 21.1 km · target 1:45:00');
  assert.equal(goalFacts({ date: '2026-10-01', distanceKm: 5, targetSeconds: 1320, status: 'achieved' }, today), 'Thu 1 Oct 2026 · 5 km · target 22:00');
  assert.equal(goalFacts({ date: null, distanceKm: null, targetSeconds: null, status: 'active' }, today), '');
  const order = sortGoals([
    { id: 'dropped', status: 'dropped', date: '2026-11-01' }, { id: 'undated', status: 'active', date: null },
    { id: 'april', status: 'active', date: '2027-04-18' }, { id: 'done', status: 'achieved', date: '2026-10-01' }, { id: 'march', status: 'active', date: '2027-03-01' },
  ]).map(g => g.id);
  assert.deepEqual(order, ['march', 'april', 'undated', 'done', 'dropped']);
  assert.deepEqual(sortGoals(null), []);
});

test('goal form: what he typed becomes what the API takes, or the field to go back to', () => {
  assert.deepEqual(goalFromForm({ title: ' Halvmaraton ', kind: 'race', date: '2027-04-18', distanceKm: '21,1', target: '1:45:00', note: ' i København ' }),
    { body: { title: 'Halvmaraton', kind: 'race', date: '2027-04-18', distanceKm: 21.1, targetSeconds: 6300, note: 'i København' } });
  assert.deepEqual(goalFromForm({ title: '10 km', kind: 'anything', date: '', distanceKm: '', target: '', note: '' }),
    { body: { title: '10 km', kind: 'milestone', date: null, distanceKm: null, targetSeconds: null, note: null } });
  assert.equal(goalFromForm({ title: '  ' }).field, 'title');
  assert.equal(goalFromForm({ title: 'x'.repeat(81) }).field, 'title');
  assert.equal(goalFromForm({ title: 'x', distanceKm: 'far' }).field, 'distanceKm');
  assert.equal(goalFromForm({ title: 'x', distanceKm: '0' }).field, 'distanceKm');
  assert.equal(goalFromForm({ title: 'x', target: '1:75:00' }).field, 'target');
  assert.equal(goalFromForm({ title: 'x', note: 'n'.repeat(301) }).field, 'note');
  // The target field is always h:mm:ss, its colons filled in as he types digits (maskTime).
  assert.deepEqual(parseTarget(''), { seconds: null });
  assert.deepEqual(parseTarget('3:45:00'), { seconds: 13500 });
  assert.deepEqual(parseTarget('0:22:30'), { seconds: 1350 });
  assert.deepEqual([parseTarget('1:45'), parseTarget('3')], [{ seconds: 6300 }, { seconds: 10800 }], 'stopped after the minutes, or after the hour');
  for (const half of ['1:4', '1:45:0', '1:75:00', '1:45:75', '0:00:05']) assert.match(parseTarget(half).error, /Type the digits only/, half);
});

test('levelFromForm: where he is now, in his own figures, or nothing', () => {
  assert.deepEqual(levelFromForm({ weekly: '', long: '' }), { level: null });
  assert.deepEqual(levelFromForm({ weekly: ' 30 ', long: '' }), { level: { weeklyRunKm: 30 } });
  assert.deepEqual(levelFromForm({ weekly: '27,5', long: '14' }), { level: { weeklyRunKm: 27.5, longRunKm: 14 } });
  assert.deepEqual(levelFromForm({ weekly: '0', long: '0' }), { level: { weeklyRunKm: 0, longRunKm: 0 } });
  assert.equal(levelFromForm({ weekly: '', long: '12' }).field, 'weekly');
  for (const weekly of ['-1', '151', 'lots']) assert.equal(levelFromForm({ weekly, long: '' }).field, 'weekly', weekly);
  for (const long of ['-1', '46', 'far']) assert.equal(levelFromForm({ weekly: '30', long }).field, 'long', long);
});

test('outlook: how a goal looks from the 5K time, and why one is not in the plan', () => {
  const event = { id: 'main', kind: 'race', predictedSeconds: 6486, targetSeconds: 6300, requiredFiveKSeconds: 1370, verdict: 'within_reach' };
  assert.equal(outlookLine(event), 'Your 5K predicts 1:48:06. The target needs a 5K near 22:50: within reach.');
  assert.match(outlookLine({ ...event, verdict: 'in_hand' }), /your 5K already points past it\.$/);
  // A goal on the way the plan cannot prepare says so, with or without a target; a prepared one says nothing more.
  const short = { id: 'g', predictedSeconds: 6486, targetSeconds: null, verdict: null, longestRunBeforeKm: 11, prepared: false };
  assert.equal(outlookLine(short), 'Your 5K predicts 1:48:06. The longest run in the plan before it is 11 km, short for this distance: run it easy, or ask the coach to move it.');
  assert.match(outlookLine({ ...event, longestRunBeforeKm: 11, prepared: false }), /: within reach\. The longest run in the plan before it is 11 km/);
  assert.equal(outlookLine({ ...short, longestRunBeforeKm: 18, prepared: true }), 'Your 5K predicts 1:48:06.');
  // A target ahead of the 5K time: held back, or gone for because he chose to (Settings › Race pace).
  assert.match(outlookLine({ ...event, verdict: 'ambitious', racePaceSec: 298, held: true }), /: ambitious; race pace is held at 4:58\/km for now\.$/);
  assert.match(outlookLine({ ...event, verdict: 'ambitious', racePaceSec: 284, held: false }), /: ambitious; the plan goes for 4:44\/km all the same, as you have chosen\.$/);
  assert.match(outlookLine({ ...event, verdict: 'beyond', racePaceSec: 275, held: true }), /: well ahead of your current fitness; race pace is held at 4:35\/km for now\.$/);
  // Within reach of the 5K time and still faster than the pace above it: held, and said so.
  assert.match(outlookLine({ ...event, racePaceSec: 298, held: true }), /: within reach; race pace is held at 4:58\/km for now\.$/);
  // A milestone is a time trial at the pace he set: nothing is held and nothing was chosen.
  assert.match(outlookLine({ ...event, kind: 'trial', verdict: 'beyond', racePaceSec: 240, held: false }), /: well ahead of your current fitness\.$/);
  // A plan built before the choice existed says only how the target looks; a target within reach needs no note.
  assert.match(outlookLine({ ...event, verdict: 'ambitious' }), /: ambitious\.$/);
  assert.match(outlookLine({ ...event, racePaceSec: 299, held: false }), /: within reach\.$/);
  assert.equal(outlookLine({ id: 'g', predictedSeconds: 2925, targetSeconds: null, verdict: null }), 'Your 5K predicts 48:45.');
  assert.deepEqual([outlookLine(null), outlookLine(undefined), outlookLine({})], ['', '', '']);
  const notInPlan = [{ id: 'late', reason: 'after_main_race' }, { id: 'tight', reason: 'no_room' }, { id: 'open', reason: 'no_distance' }];
  assert.match(notInPlanLine('open', notInPlan), /give it a distance/);
  assert.match(notInPlanLine('late', notInPlan), /after the main race/);
  assert.match(notInPlanLine('tight', notInPlan), /already holds another goal/);
  assert.deepEqual([notInPlanLine('other', notInPlan), notInPlanLine('late', null)], ['', '']);
  // The two operations on the plan as a whole read as what they do.
  assert.equal(describeChange({ op: 'rebuild_plan' }), 'Rebuild every future week for your goals');
  assert.equal(describeChange({ op: 'rebuild_plan', level: { weeklyRunKm: 30, longRunKm: 14 } }), 'Rebuild every future week for your goals, starting from 30 km a week and a 14 km long run');
  assert.equal(describeChange({ op: 'set_race', raceDate: '2027-04-11', raceName: 'City Half', distanceKm: 21.0975, targetSeconds: 6300 }),
    'Make the main race Sun 11 Apr 2027 (City Half, 21.1 km, target 1:45:00): every future week is rebuilt');
});

// ── the mock's coach ────────────────────────────────────────────────────────

function mockCoach({ replyDelayMs = 1000 } = {}) {
  let t = Date.parse('2026-10-13T08:00:00Z');
  const api = createMockApi({ fixturesDir: FIXTURES, routeDelayMs: 0, planDelayMs: 0, replyDelayMs, now: () => t });
  const call = async (method, path, body = null, authz = OWNER) => api({ method, path, body, authz });
  return { call, wait: ms => { t += ms; } };
}

test('mock: the page opens on a seeded thread, the marathon as main goal, and two notes', async () => {
  const { call } = mockCoach();
  const { status, json } = await call('GET', '/api/coach');
  assert.equal(status, 200);
  assert.deepEqual(Object.keys(json).sort(), ['goals', 'messages', 'notes', 'plan', 'status']);
  assert.deepEqual(json.messages.map(m => m.role), ['user', 'coach']);
  assert.deepEqual(json.status, { state: 'idle' });
  assert.deepEqual([json.goals.main.id, json.goals.main.title, json.goals.main.date, json.goals.main.targetSeconds], ['main', 'Berlin Marathon', '2027-09-26', null]);
  assert.equal(json.goals.items.length, 1);
  assert.equal(json.notes.length, 2);
  assert.equal((await call('GET', '/api/coach', null, 'Bearer stranger-token')).status, 403);
  assert.equal((await call('GET', '/api/coach', null, null)).status, 401);
});

test('mock: a message waits while the coach reads, then the reply is there with what it did', async () => {
  const { call, wait } = mockCoach();
  const sent = await call('POST', '/api/coach/messages', { text: ' A new goal: a half marathon. Never on Tuesday. Easier please. A 40 km run is impossible? ', about: { type: 'workout', id: 'w-2026-10-17-run' } });
  assert.equal(sent.status, 200);
  assert.deepEqual(sent.json.fire, { fired: true });
  assert.equal(sent.json.status.state, 'thinking');
  const mine = sent.json.messages.at(-1);
  assert.deepEqual([mine.id, mine.role, mine.status, mine.about], [sent.json.sent, 'user', 'pending', { type: 'workout', id: 'w-2026-10-17-run', date: '2026-10-17', title: 'Long run' }]);
  assert.equal(mine.text.startsWith('A new goal'), true);

  wait(500);
  assert.equal((await call('GET', '/api/coach')).json.status.state, 'thinking');
  const second = await call('POST', '/api/coach/messages', { text: 'One more thing' });
  assert.deepEqual(second.json.fire, { fired: false, reason: 'in_flight' });
  wait(600);
  const { json } = await call('GET', '/api/coach');
  assert.deepEqual(json.status, { state: 'idle' });
  const reply = json.messages.at(-1);
  assert.equal(reply.role, 'coach');
  assert.deepEqual(reply.replyTo, [sent.json.sent, second.json.sent]);
  assert.deepEqual([reply.result.applied.length, reply.result.rejected.length, reply.result.goals.applied.length, reply.result.notes.applied.length], [1, 1, 1, 1]);
  assert.deepEqual(json.messages.filter(m => m.role === 'user').map(m => m.status), ['answered', 'answered', 'answered']);
  assert.deepEqual(json.goals.items.map(g => g.title), ['10 km under 50:00', 'Half marathon']);
  assert.equal(json.notes.at(-1).text, 'No runs on Tuesdays');
});

test('mock: a message met with silence stalls, and Try again gets it answered', async () => {
  const { call, wait } = mockCoach();
  assert.equal((await call('POST', '/api/coach/retry')).status, 409);
  await call('POST', '/api/coach/messages', { text: 'silence' });
  wait(1500);
  assert.deepEqual((await call('GET', '/api/coach')).json.status, { state: 'stalled' });
  const again = await call('POST', '/api/coach/retry');
  assert.deepEqual([again.status, again.json.fire, again.json.status.state], [200, { fired: true }, 'thinking']);
  wait(1500);
  assert.equal((await call('GET', '/api/coach')).json.status.state, 'idle');
});

test('mock: messages, goals and notes are checked in the backend\'s words', async () => {
  const { call } = mockCoach();
  const error = async (method, path, body) => { const r = await call(method, path, body); return [r.status, r.json.error]; };
  assert.deepEqual(await error('POST', '/api/coach/messages', { text: '  ' }), [400, 'A message needs 1–2000 characters']);
  assert.deepEqual(await error('POST', '/api/coach/messages', { text: 'x', about: { type: 'activity', id: '1' } }), [400, 'about must name a review, a proposal, a session, a goal or the plan']);
  assert.deepEqual(await error('POST', '/api/coach/messages', { text: 'x', about: { type: 'workout', id: 'w-1999-01-01-run' } }), [404, 'That session is no longer in the plan']);
  assert.equal((await call('POST', '/api/coach/messages', { text: 'x', about: { type: 'review', id: 'r-2026-10-13-a1' } })).json.messages.at(-1).about.weekStart, '2026-10-05');

  assert.deepEqual(await error('POST', '/api/goals', { date: '2027-04-18' }), [400, 'A goal needs a title of 1–80 characters']);
  assert.deepEqual(await error('POST', '/api/goals', { title: 'x', date: '2027-02-30' }), [400, 'The date must be a real date, YYYY-MM-DD']);
  assert.deepEqual(await error('PUT', '/api/goals/main', { title: 'Paris' }), [400, 'title cannot be set here']);
  assert.deepEqual(await error('DELETE', '/api/goals/main'), [400, 'The main goal cannot be removed. Change the race in Settings instead']);
  assert.deepEqual(await error('DELETE', '/api/goals/nope'), [404, 'No such goal']);
  const goal = (await call('POST', '/api/goals', { title: 'Halvmaraton', kind: 'race', date: '2027-04-18', distanceKm: 21.1, targetSeconds: 6300, note: null })).json.goal;
  assert.deepEqual([goal.kind, goal.status, goal.by], ['race', 'active', 'user']);
  assert.equal((await call('PUT', `/api/goals/${goal.id}`, { status: 'achieved' })).json.goal.status, 'achieved');
  assert.deepEqual((await call('PUT', '/api/goals/main', { targetSeconds: 13500, note: null })).json.goal, { id: 'main', targetSeconds: 13500, note: null });
  assert.equal((await call('GET', '/api/coach')).json.goals.main.targetSeconds, 13500);
  assert.deepEqual((await call('DELETE', `/api/goals/${goal.id}`)).json, { ok: true });

  assert.deepEqual(await error('POST', '/api/coach/notes', { text: '' }), [400, 'A note needs 1–240 characters']);
  assert.deepEqual(await error('POST', '/api/coach/notes', { text: 'long run on saturdays' }), [400, 'That note is already there']);
  const note = (await call('POST', '/api/coach/notes', { text: 'Travelling 20–27 Oct' })).json.note;
  assert.deepEqual([note.text, note.by], ['Travelling 20–27 Oct', 'user']);
  assert.deepEqual((await call('DELETE', `/api/coach/notes/${note.id}`)).json, { ok: true });
  assert.deepEqual(await error('DELETE', `/api/coach/notes/${note.id}`), [404, 'No such note']);
});

test('mock: the Coach replies switch is a setting like the others', async () => {
  const { call } = mockCoach();
  const saved = await call('PUT', '/api/settings', { notify: { coach: false } });
  assert.equal(saved.json.notify.coach, false);
  assert.equal(saved.json.notify.weekly, true);
});

test('mock: the plan goes stale when a goal that shapes it changes, and Rebuild makes it current', async () => {
  const { call } = mockCoach();
  const plan = async () => (await call('GET', '/api/coach')).json.plan;
  const first = await plan();
  assert.deepEqual([first.stale, first.notInPlan, first.events.map(e => [e.id, e.main, e.kind])], [false, [], [['main', true, 'race'], ['g1', false, 'trial']]]);
  assert.ok(first.events[0].predictedSeconds > 3 * 3600 && first.events[1].verdict, 'each goal has its outlook');
  await call('PUT', '/api/goals/main', { targetSeconds: 13500, note: null });
  assert.equal((await plan()).stale, true);
  assert.equal((await plan()).events[0].targetSeconds, null, 'the plan still is what it was built for');
  assert.deepEqual((await call('POST', '/api/plan/rebuild')).json, { ok: true });
  // His own rebuild may say where he is; a level out of range is refused in the backend's words.
  assert.deepEqual((await call('POST', '/api/plan/rebuild', { level: { weeklyRunKm: 30, longRunKm: 14 } })).json, { ok: true });
  const refused = await call('POST', '/api/plan/rebuild', { level: { weeklyRunKm: 400 } });
  assert.deepEqual([refused.status, refused.json.error], [400, 'Level.weeklyRunKm must be 0–150']);
  // The race pace is at the target by default: a target ahead of the 5K time is gone for, or held when he says so.
  assert.equal((await call('GET', '/api/state')).json.settings.racePaceMode, 'target');
  await call('PUT', '/api/goals/main', { targetSeconds: 11400, note: null });
  await call('POST', '/api/plan/rebuild');
  assert.deepEqual([(await plan()).events[0].held, (await plan()).events[0].verdict], [false, 'beyond']);
  assert.equal((await call('PUT', '/api/settings', { racePaceMode: 'carried' })).json.racePaceMode, 'carried');
  assert.equal((await plan()).stale, true, 'another pace is another plan');
  await call('POST', '/api/plan/rebuild');
  assert.equal((await plan()).events[0].held, true);
  assert.equal((await call('PUT', '/api/settings', { racePaceMode: 'fast' })).status, 400);
  await call('PUT', '/api/settings', { racePaceMode: 'target' });
  await call('PUT', '/api/goals/main', { targetSeconds: 13500, note: null });
  await call('POST', '/api/plan/rebuild');
  const rebuilt = await plan();
  assert.deepEqual([rebuilt.stale, rebuilt.events[0].targetSeconds], [false, 13500]);
  // A note or a goal without a date changes nothing about the plan; one after the main race is not in it.
  await call('PUT', '/api/goals/main', { targetSeconds: 13500, note: 'Flat course' });
  await call('POST', '/api/goals', { title: 'Run three times a week' });
  assert.equal((await plan()).stale, false);
  const late = (await call('POST', '/api/goals', { title: 'Frankfurt', kind: 'race', date: '2027-10-31', distanceKm: 42.195 })).json.goal;
  assert.deepEqual((await plan()).notInPlan, [{ id: late.id, name: 'Frankfurt', date: '2027-10-31', reason: 'after_main_race' }]);
  // A dated race without a distance cannot be placed, and says so; a goal on the way says whether the plan prepares it.
  const open = (await call('POST', '/api/goals', { title: 'A race in March', kind: 'race', date: '2027-03-07' })).json.goal;
  assert.deepEqual((await plan()).notInPlan.map(x => [x.id, x.reason]), [[late.id, 'after_main_race'], [open.id, 'no_distance']]);
  assert.deepEqual(rebuilt.events.map(e => [e.main, e.prepared]), [[true, undefined], [false, true]]);
  // The distance in Settings is his to set, within bounds.
  assert.equal((await call('GET', '/api/state')).json.settings.raceDistanceKm, 42.195);
  assert.equal((await call('PUT', '/api/settings', { raceDistanceKm: 21.0975 })).json.raceDistanceKm, 21.0975);
  assert.equal((await call('PUT', '/api/settings', { raceDistanceKm: 1 })).status, 400);
  assert.equal((await call('GET', '/api/coach')).json.goals.main.distanceKm, 21.0975);
});
