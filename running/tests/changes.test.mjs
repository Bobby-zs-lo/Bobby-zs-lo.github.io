import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeChange, parseWorkoutId, undoableId, parseReviewBody } from '../js/changes.js';
import { groupByPhase } from '../js/views/plan.js';
import { readFileSync } from 'node:fs';

const plan = JSON.parse(readFileSync(new URL('./fixtures/plan.json', import.meta.url)));
const idx = new Map(plan.weeks.flatMap(w => w.workouts).map(w => [w.id, w]));
const lookup = id => idx.get(id);

test('workout ids parse to date and sport', () => {
  assert.deepEqual(parseWorkoutId('w-2026-10-13-run'), { date: '2026-10-13', sport: 'run' });
  assert.deepEqual(parseWorkoutId('w-2026-10-13-ride-2'), { date: '2026-10-13', sport: 'ride' });
  assert.equal(parseWorkoutId('x'), null);
});

test('every op has a readable description', () => {
  assert.equal(describeChange({ op: 'move', workoutId: 'w-2026-10-17-run', toDate: '2026-10-18' }, lookup), 'Move Long run (Sat 17 Oct) to Sun 18 Oct');
  assert.equal(describeChange({ op: 'update', workoutId: 'w-2026-10-13-run', set: { distanceKm: 6, paceKey: 'E' } }, lookup), 'Change Easy run (Tue 13 Oct): 6 km, E pace');
  assert.equal(describeChange({ op: 'remove', workoutId: 'w-2099-01-01-ride' }, lookup), 'Remove Ride session (Thu 1 Jan)');
  assert.equal(describeChange({ op: 'add', date: '2026-10-29', workout: { title: 'Strides', distanceKm: 4 } }), 'Add Strides (4 km) on Thu 29 Oct');
  assert.equal(describeChange({ op: 'replace', workoutId: 'w-2026-10-13-run', with: { title: 'Easy spin', durationMin: 45 } }, lookup), 'Replace Easy run (Tue 13 Oct) with Easy spin (45 min)');
  assert.match(describeChange({ op: 'repeat_week', weekIndex: 12 }), /^Repeat week 12/);
  assert.equal(describeChange({ op: 'set_week_target', weekIndex: 14, targetRunKm: 38 }), 'Set week 14 running volume to 38 km');
  assert.equal(describeChange({ op: 'set_paces', fiveKSeconds: 1380 }), 'Update training paces from a 5K of 23:00');
  assert.equal(describeChange({ op: 'explode' }), 'Unknown change (explode)');
});

test('only the newest non-undone changeset is undoable', () => {
  assert.equal(undoableId([
    { id: 'a', createdAt: '2026-10-12T03:00:00Z', undone: false },
    { id: 'b', createdAt: '2026-10-13T03:00:00Z', undone: true },
    { id: 'c', createdAt: '2026-10-10T03:00:00Z', undone: false },
  ]), 'a');
  assert.equal(undoableId([{ id: 'x', undone: true }]), null);
  assert.equal(undoableId([]), null);
});

test('review body accepts object, JSON string or plain markdown', () => {
  assert.equal(parseReviewBody({ headline: 'h' }).headline, 'h');
  assert.equal(parseReviewBody('{"headline":"j"}').headline, 'j');
  assert.equal(parseReviewBody('Just **text**').summary, 'Just **text**');
  assert.deepEqual(parseReviewBody(null), {});
});

test('plan fixture groups into the seven phases in order', () => {
  const groups = groupByPhase(plan.weeks);
  assert.deepEqual(groups.map(g => g.phase), ['reentry', 'base', 'halfbuild', 'recovery', 'base2', 'marathon', 'taper']);
  assert.equal(groups[0].weeks[0].index, 0); // week 0 joins re-entry
  assert.equal(groups.at(-1).weeks.length, 3);
});
