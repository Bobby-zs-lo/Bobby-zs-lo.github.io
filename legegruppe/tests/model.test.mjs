/* Run: node legegruppe/tests/model.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../js/model.js');

// --- pairKey: order-independent, stable ---
assert.equal(M.pairKey('b', 'a'), 'a|b');
assert.equal(M.pairKey('a', 'b'), 'a|b');

// --- normaliseFamily: fills every derived field ---
const raw = {
  familyId: 'f1', classId: 'c1', parentName: 'Anne', contact: 'anne@example.dk',
  hostCapacity: '2', maxChildrenAtHome: '4', availableWeekdays: ['2', '4'],
  fetchCapacity: '3', meetingPlace: 'home', blackoutWeeks: '42, 43',
  note: 'Vi har hund', consentAt: '2026-08-01T10:00:00Z'
};
const f = M.normaliseFamily(raw);
assert.equal(f.hostCapacity, 2);
assert.equal(f.maxChildrenAtHome, 4);
assert.deepEqual(f.availableWeekdays, [2, 4]);
assert.equal(f.fetchCapacity, 3);
assert.equal(f.canHostOutdoor, false);
assert.equal(f.requiresChildrenBrought, false);
assert.deepEqual(f.blackoutWeeks, [42, 43]);

// --- meetingPlace variants ---
assert.equal(M.normaliseFamily({ ...raw, meetingPlace: 'outdoor' }).canHostOutdoor, true);
assert.equal(M.normaliseFamily({ ...raw, meetingPlace: 'both' }).canHostOutdoor, true);

// --- fetchCapacity 0 means children must be brought to us ---
assert.equal(M.normaliseFamily({ ...raw, fetchCapacity: '0' }).requiresChildrenBrought, true);

// --- missing / hostile input never throws, always yields a safe family ---
const empty = M.normaliseFamily({ familyId: 'f9', classId: 'c1' });
assert.equal(empty.hostCapacity, 0);
assert.equal(empty.maxChildrenAtHome, 0);
assert.deepEqual(empty.availableWeekdays, []);
assert.equal(empty.fetchCapacity, 0);
assert.equal(empty.hasResponded, false);
assert.equal(f.hasResponded, true);

// --- values are clamped, not trusted ---
const wild = M.normaliseFamily({ ...raw, hostCapacity: '99', maxChildrenAtHome: '-4',
  fetchCapacity: '12', availableWeekdays: ['0', '9', '3'] });
assert.equal(wild.hostCapacity, 3);
assert.equal(wild.maxChildrenAtHome, 0);
assert.equal(wild.fetchCapacity, 5);
assert.deepEqual(wild.availableWeekdays, [3]);

// --- buildProblem indexes families, children and history for fast lookup ---
const problem = M.buildProblem({
  classId: 'c1',
  children: [
    { childId: 'k1', familyId: 'f1', name: 'Alma' },
    { childId: 'k2', familyId: 'f2', name: 'Bo' }
  ],
  families: [raw, { familyId: 'f2', classId: 'c1', parentName: 'Bent', hostCapacity: '1',
    maxChildrenAtHome: '5', availableWeekdays: ['2'], fetchCapacity: '4' }],
  blockedPairs: [['k2', 'k1']],
  history: [{ childA: 'k1', childB: 'k2' }],
  groupSizeMin: 4, groupSizeMax: 5, weeks: [34, 35], meetingsPerGroup: 2
});
assert.equal(problem.familyOf('k1').parentName, 'Anne');
assert.equal(problem.isBlocked('k1', 'k2'), true);
assert.equal(problem.timesTogether('k1', 'k2'), 1);
assert.equal(problem.timesTogether('k1', 'nobody'), 0);
assert.equal(problem.children.length, 2);

// --- seeded RNG is deterministic and in range ---
const r1 = M.rng(42), r2 = M.rng(42);
const a = [r1(), r1(), r1()], b = [r2(), r2(), r2()];
assert.deepEqual(a, b);
assert.ok(a.every(v => v >= 0 && v < 1));
assert.notDeepEqual(a, [M.rng(43)(), M.rng(43)(), M.rng(43)()]);

// --- the problem keeps its raw input so it can be rebuilt with relaxed rules ---
assert.equal(problem._input.classId, 'c1');
assert.equal(problem._input.blockedPairs.length, 1);

console.log('ok - model');
