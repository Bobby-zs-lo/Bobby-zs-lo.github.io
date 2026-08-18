/* Run: node legegruppe/tests/admin.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const A = require('../js/ui/admin.js');

const snapshot = {
  classId: 'c1',
  families: [
    { familyId: 'f0', parentName: 'Anne', consentAt: '2026-08-01', updatedAt: '2026-08-01' },
    { familyId: 'f1', parentName: 'Bent', consentAt: null, updatedAt: null },
    { familyId: 'f2', parentName: 'Cecilie', consentAt: '2026-08-03', updatedAt: '2026-08-03' }
  ],
  children: [
    { childId: 'k0', familyId: 'f0', name: 'Alma' },
    { childId: 'k1', familyId: 'f1', name: 'Bo' },
    { childId: 'k2', familyId: 'f2', name: 'Carla' }
  ]
};

// --- who has not answered ---
const missing = A.missingResponses(snapshot);
assert.equal(missing.length, 1);
assert.equal(missing[0].parentName, 'Bent');

// --- reminder text names them and is ready to paste ---
const reminder = A.reminderText(snapshot);
assert.ok(reminder.includes('Bent'));
assert.ok(!reminder.includes('Anne'), 'do not nag people who already answered');
assert.ok(reminder.length > 40);
assert.ok(!/[<>]/.test(reminder));

// --- families who changed their answers after the round was published ---
const afterPublish = {
  ...snapshot,
  families: [
    { familyId: 'f0', parentName: 'Anne', consentAt: '2026-08-01', updatedAt: '2026-08-20T10:00:00Z' },
    { familyId: 'f2', parentName: 'Cecilie', consentAt: '2026-08-03', updatedAt: '2026-08-03T10:00:00Z' }
  ],
  rounds: [{ roundId: 'r1', status: 'published', publishedAt: '2026-08-10T12:00:00Z' }]
};
const changed = A.changedSincePublish(afterPublish);
assert.equal(changed.length, 1);
assert.equal(changed[0].parentName, 'Anne');
// no published round means nothing to flag
assert.deepEqual(A.changedSincePublish({ ...afterPublish, rounds: [] }), []);
// a draft round is not a published one
assert.deepEqual(A.changedSincePublish({ ...afterPublish,
  rounds: [{ roundId: 'r2', status: 'draft', publishedAt: '2026-08-10T12:00:00Z' }] }), []);

// --- everyone answered: no reminder needed ---
const done = { ...snapshot, families: snapshot.families.map(f =>
  ({ ...f, consentAt: '2026-08-01' })) };
assert.equal(A.missingResponses(done).length, 0);
assert.ok(/alle har svaret/i.test(A.reminderText(done)));

// --- week ranges ---
assert.deepEqual(A.weekRange(34, 39), [34, 35, 36, 37, 38, 39]);
assert.deepEqual(A.weekRange(51, 3), [51, 52, 53, 1, 2, 3], 'must wrap across new year');
assert.deepEqual(A.weekRange(34, 34), [34]);

// --- moving a child between groups ---
const groups = [
  { id: 'A', childIds: ['k0', 'k1'] },
  { id: 'B', childIds: ['k2'] }
];
const moved = A.moveChild(groups, 'k1', 1);
assert.deepEqual(moved[0].childIds, ['k0']);
assert.deepEqual(moved[1].childIds, ['k2', 'k1']);
assert.deepEqual(groups[0].childIds, ['k0', 'k1'], 'the original must not be mutated');

// moving to the group it is already in changes nothing
assert.deepEqual(A.moveChild(groups, 'k0', 0), groups);
// an unknown child is a no-op, not a crash
assert.deepEqual(A.moveChild(groups, 'nobody', 1), groups);

// --- locks derived from the current arrangement ---
const locks = A.locksFrom([{ id: 'A', childIds: ['k0'] }, { id: 'B', childIds: ['k1', 'k2'] }],
  ['k1']);
assert.deepEqual(locks, [{ childId: 'k1', groupIndex: 1 }]);
// a locked child that is not in any group is dropped rather than sent as -1
assert.deepEqual(A.locksFrom([{ id: 'A', childIds: ['k0'] }], ['ghost']), []);

// --- weights read from slider values ---
const weights = A.readWeights({ novelty: '1', robustness: '0.5', capacityAdequacy: '0.7',
  weekdayBreadth: '0.4', capacityBalance: '0' });
assert.equal(weights.novelty, 1);
assert.equal(weights.capacityBalance, 0);
assert.equal(A.readWeights({ novelty: 'abc' }).novelty, 0, 'garbage becomes zero, not NaN');

// --- the publish payload carries everything the backend stores ---
const payload = A.publishPayload({
  result: { groups: [{ id: 'A', childIds: ['k0'] }], rota: { groups: [] },
    score: { total: 0.8 }, meta: { solver: 'exact' } },
  weeks: [34, 35], meetingsPerGroup: 6, groupSizeMin: 4, groupSizeMax: 5,
  solver: 'exact', weights: weights
});
assert.equal(payload.solver, 'exact');
assert.deepEqual(payload.weeks, [34, 35]);
assert.equal(payload.result.groups.length, 1);
assert.equal(payload.weights.novelty, 1);

// --- publishing is blocked while verification fails ---
assert.equal(A.canPublish({ status: 'ok', verification: [] }), true);
assert.equal(A.canPublish({ status: 'ok', verification: [{ code: 'H1' }] }), false);
assert.equal(A.canPublish({ status: 'invalid', verification: [{ code: 'COVER' }] }), false);
assert.equal(A.canPublish({ status: 'infeasible', verification: null }), false);
assert.equal(A.canPublish(null), false);

// --- the reason for blocking is stated in Danish ---
const reason = A.publishBlockReason({ status: 'ok',
  verification: [{ code: 'H1', groupId: 'A', message: 'Alma og Bo må ikke være i samme gruppe.' }] });
assert.ok(reason.includes('Alma'));
assert.ok(reason.length > 20);

// --- an infeasible round shows the diagnosis, not a generic apology ---
const infeasibleReason = A.publishBlockReason({ status: 'infeasible',
  diagnosis: { summary: 'Kun 3 familier kan hente 4+ børn, og de kan alle kun torsdag.' } });
assert.ok(/torsdag/.test(infeasibleReason));

console.log('ok - admin');
