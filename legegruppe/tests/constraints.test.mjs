/* Run: node legegruppe/tests/constraints.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../js/model.js');
const C = require('../js/constraints.js');

/** One family per child, with overridable capacity fields. */
function makeProblem(specs, extra) {
  const children = specs.map((s, i) => ({ childId: 'k' + i, familyId: 'f' + i, name: 'B' + i }));
  const families = specs.map((s, i) => Object.assign({
    familyId: 'f' + i, classId: 'c1', parentName: 'P' + i, consentAt: '2026-08-01',
    hostCapacity: 2, maxChildrenAtHome: 5, availableWeekdays: [1, 2, 3, 4, 5], fetchCapacity: 4
  }, s));
  return M.buildProblem(Object.assign({
    classId: 'c1', children, families, groupSizeMin: 4, groupSizeMax: 5,
    weeks: [34, 35, 36, 37, 38, 39], meetingsPerGroup: 6
  }, extra || {}));
}

const ok4 = makeProblem([{}, {}, {}, {}]);
const all = ['k0', 'k1', 'k2', 'k3'];

// --- a well-resourced group of 4 passes everything ---
assert.deepEqual(C.groupFeasibility(all, ok4).violations, []);
assert.equal(C.groupFeasibility(all, ok4).ok, true);

// --- H1: blocked pairs ---
const blocked = makeProblem([{}, {}, {}, {}], { blockedPairs: [['k0', 'k2']] });
const h1 = C.groupFeasibility(all, blocked);
assert.equal(h1.ok, false);
assert.ok(h1.violations.some(v => v.code === 'H1'));

// --- H2: group size ---
assert.ok(C.groupFeasibility(['k0', 'k1', 'k2'], ok4).violations.some(v => v.code === 'H2'));
assert.ok(C.groupFeasibility(all, ok4).violations.every(v => v.code !== 'H2'));

// --- H3: somebody must be able to host, at home or outdoors ---
const noHost = makeProblem([
  { hostCapacity: 0 }, { hostCapacity: 0 }, { hostCapacity: 0 }, { hostCapacity: 0 }
]);
assert.ok(C.groupFeasibility(all, noHost).violations.some(v => v.code === 'H3'));

// a home too small for 3 guests does not count as a host …
const tooSmall = makeProblem([
  { maxChildrenAtHome: 2 }, { maxChildrenAtHome: 2 },
  { maxChildrenAtHome: 2 }, { maxChildrenAtHome: 2 }
]);
assert.ok(C.groupFeasibility(all, tooSmall).violations.some(v => v.code === 'H3'));

// … but the outdoor option rescues exactly that family
const outdoor = makeProblem([
  { maxChildrenAtHome: 2, meetingPlace: 'outdoor' }, { maxChildrenAtHome: 2 },
  { maxChildrenAtHome: 2 }, { maxChildrenAtHome: 2 }
]);
assert.ok(C.groupFeasibility(all, outdoor).violations.every(v => v.code !== 'H3'));

// --- H4: at least one weekday shared by a host and the fetchers ---
const noDay = makeProblem([
  { availableWeekdays: [1] }, { availableWeekdays: [2] },
  { availableWeekdays: [3] }, { availableWeekdays: [4] }
]);
assert.ok(C.groupFeasibility(all, noDay).violations.some(v => v.code === 'H4'));

// --- transport is NOT a hard requirement ---
// A group where nobody can collect the children is still a workable group: the
// parents arrange the lifts between themselves, or meet at the school playground.
// Requiring it up front rejected groups that would have been perfectly fine.
// Scoring still prefers groups that cover their own transport (see scoring.js).
const noFetch = makeProblem([
  { fetchCapacity: 0 }, { fetchCapacity: 0 }, { fetchCapacity: 0 }, { fetchCapacity: 0 }
]);
assert.deepEqual(C.groupFeasibility(all, noFetch).violations, [],
  'a group that cannot fetch must still be allowed to exist');
assert.ok(C.groupFeasibility(all, noFetch).viableDays.length > 0);

// but a group nobody can HOST is still rejected — that is the real requirement
const noHostAtAll = makeProblem([
  { hostCapacity: 0, fetchCapacity: 4 }, { hostCapacity: 0, fetchCapacity: 4 },
  { hostCapacity: 0, fetchCapacity: 4 }, { hostCapacity: 0, fetchCapacity: 4 }
]);
assert.ok(C.groupFeasibility(all, noHostAtAll).violations.some(v => v.code === 'H3'));

// --- every violation carries Danish, human-readable text ---
h1.violations.forEach(v => {
  assert.equal(typeof v.message, 'string');
  assert.ok(v.message.length > 10);
});

// --- verifySolution: independent audit of a whole solution ---
const six = makeProblem(new Array(8).fill({}));
const good = { groups: [
  { id: 'A', childIds: ['k0', 'k1', 'k2', 'k3'] },
  { id: 'B', childIds: ['k4', 'k5', 'k6', 'k7'] }
] };
assert.deepEqual(C.verifySolution(good, six), []);

// a child appearing twice is caught
const dup = { groups: [
  { id: 'A', childIds: ['k0', 'k1', 'k2', 'k3'] },
  { id: 'B', childIds: ['k0', 'k5', 'k6', 'k7'] }
] };
assert.ok(C.verifySolution(dup, six).some(v => v.code === 'COVER'));

// a child left out entirely is caught
const missing = { groups: [{ id: 'A', childIds: ['k0', 'k1', 'k2', 'k3'] }] };
assert.ok(C.verifySolution(missing, six).some(v => v.code === 'COVER'));

console.log('ok - constraints');
