/* Run: node legegruppe/tests/scoring.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../js/model.js');
const S = require('../js/scoring.js');

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

const g = ['k0', 'k1', 'k2', 'k3'];

// --- S1 novelty: no shared history scores 1, all-shared scores 0 ---
const fresh = makeProblem(new Array(4).fill({}));
assert.equal(S.novelty(g, fresh), 1);

const allSeen = makeProblem(new Array(4).fill({}), {
  history: [
    { childA: 'k0', childB: 'k1' }, { childA: 'k0', childB: 'k2' }, { childA: 'k0', childB: 'k3' },
    { childA: 'k1', childB: 'k2' }, { childA: 'k1', childB: 'k3' }, { childA: 'k2', childB: 'k3' }
  ]
});
assert.ok(S.novelty(g, allSeen) < 0.4);

const someSeen = makeProblem(new Array(4).fill({}), {
  history: [{ childA: 'k0', childB: 'k1' }, { childA: 'k2', childB: 'k3' }]
});
const partial = S.novelty(g, someSeen);
assert.ok(partial > 0 && partial < 1, 'partial novelty should be strictly between 0 and 1');

// repeat encounters hurt more than a single one
const twice = makeProblem(new Array(4).fill({}), {
  history: [{ childA: 'k0', childB: 'k1' }, { childA: 'k0', childB: 'k1' }]
});
const once = makeProblem(new Array(4).fill({}), { history: [{ childA: 'k0', childB: 'k1' }] });
assert.ok(S.novelty(g, twice) < S.novelty(g, once));

// --- S2 robustness: more possible hosts and more shared days is better ---
const fragile = makeProblem([
  { hostCapacity: 1, availableWeekdays: [2] }, { hostCapacity: 0, availableWeekdays: [2] },
  { hostCapacity: 0, availableWeekdays: [2] }, { hostCapacity: 0, availableWeekdays: [2] }
]);
assert.ok(S.robustness(g, fragile) < S.robustness(g, fresh));
assert.ok(S.robustness(g, fresh) <= 1 && S.robustness(g, fragile) >= 0);

// --- S3 capacity adequacy: total declared host capacity vs meetings needed ---
const plenty = makeProblem(new Array(4).fill({ hostCapacity: 3 }));   // 12 >= 6
const scarce = makeProblem([{ hostCapacity: 1 }, { hostCapacity: 0 },
  { hostCapacity: 0 }, { hostCapacity: 0 }]);                          // 1 < 6
assert.equal(S.capacityAdequacy(g, plenty), 1);
assert.ok(S.capacityAdequacy(g, scarce) < 0.3);

// --- S4 weekday breadth ---
const oneDay = makeProblem(new Array(4).fill({ availableWeekdays: [3] }));
assert.ok(S.weekdayBreadth(g, oneDay) < S.weekdayBreadth(g, fresh));

// --- S5 capacity balance: closer to the class average is better ---
const mixed = makeProblem([
  { hostCapacity: 3 }, { hostCapacity: 3 }, { hostCapacity: 3 }, { hostCapacity: 3 },
  { hostCapacity: 0 }, { hostCapacity: 0 }, { hostCapacity: 0 }, { hostCapacity: 0 }
]);
const hoarding = S.capacityBalance(['k0', 'k1', 'k2', 'k3'], mixed);
const balanced = S.capacityBalance(['k0', 'k1', 'k4', 'k5'], mixed);
assert.ok(balanced > hoarding, 'a balanced group should score higher than one hoarding capacity');

// --- weights and aggregation ---
assert.equal(typeof S.DEFAULT_WEIGHTS.novelty, 'number');
const parts = S.scoreGroup(g, fresh, S.DEFAULT_WEIGHTS);
assert.ok(parts.total >= 0 && parts.total <= 1);
assert.equal(typeof parts.parts.novelty, 'number');

// zero weights must not divide by zero
const zeroed = S.scoreGroup(g, fresh, { novelty: 0, robustness: 0, capacityAdequacy: 0,
  weekdayBreadth: 0, capacityBalance: 0 });
assert.ok(Number.isFinite(zeroed.total));

// --- whole-solution score is the mean of its groups ---
const eight = makeProblem(new Array(8).fill({}));
const sol = { groups: [
  { id: 'A', childIds: ['k0', 'k1', 'k2', 'k3'] },
  { id: 'B', childIds: ['k4', 'k5', 'k6', 'k7'] }
] };
const total = S.scoreSolution(sol, eight, S.DEFAULT_WEIGHTS);
assert.ok(total.total > 0 && total.total <= 1);
assert.equal(total.perGroup.length, 2);

// --- cost is the exact complement, so the exact solver can minimise it ---
assert.ok(Math.abs(S.groupCost(g, fresh, S.DEFAULT_WEIGHTS) +
  S.scoreGroup(g, fresh, S.DEFAULT_WEIGHTS).total - 1) < 1e-12);

// --- explanations are Danish strings ---
const why = S.explainGroup(g, fresh, S.DEFAULT_WEIGHTS);
assert.ok(Array.isArray(why) && why.length > 0);
assert.ok(why.every(line => typeof line === 'string' && line.length > 5));

console.log('ok - scoring');
