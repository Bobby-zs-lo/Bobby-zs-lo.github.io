/* Run: node legegruppe/tests/exact.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../js/model.js');
const C = require('../js/constraints.js');
const S = require('../js/scoring.js');
const H = require('../js/solvers/heuristic.js');
const E = require('../js/solvers/exact.js');

function makeProblem(n, spec, extra) {
  const children = [], families = [];
  for (let i = 0; i < n; i++) {
    children.push({ childId: 'k' + i, familyId: 'f' + i, name: 'Barn' + i });
    families.push(Object.assign({
      familyId: 'f' + i, classId: 'c1', parentName: 'P' + i, consentAt: '2026-08-01',
      hostCapacity: 2, maxChildrenAtHome: 5, availableWeekdays: [1, 2, 3, 4, 5], fetchCapacity: 4
    }, typeof spec === 'function' ? spec(i) : (spec || {})));
  }
  return M.buildProblem(Object.assign({
    classId: 'c1', children, families, groupSizeMin: 4, groupSizeMax: 5,
    weeks: [34, 35, 36, 37, 38, 39], meetingsPerGroup: 6
  }, extra || {}));
}

// --- enumeration only yields groups that pass every hard requirement ---
const small = makeProblem(8);
const cols = E.enumerateGroups(small, S.DEFAULT_WEIGHTS, 100000);
assert.ok(cols.groups.length > 0);
assert.equal(cols.truncated, false);
cols.groups.forEach(col => {
  assert.deepEqual(C.groupFeasibility(col.childIds, small).violations, []);
  assert.ok(col.cost >= 0 && col.cost <= 1);
});

// --- blocked pairs never appear in any column ---
const blocked = makeProblem(8, {}, { blockedPairs: [['k0', 'k1']] });
E.enumerateGroups(blocked, S.DEFAULT_WEIGHTS, 100000).groups.forEach(col => {
  assert.ok(!(col.childIds.includes('k0') && col.childIds.includes('k1')));
});

// --- small instance: solved, verified, and proven optimal ---
const r8 = E.solve(small, { seed: 1, timeBudgetMs: 5000, weights: S.DEFAULT_WEIGHTS });
assert.equal(r8.status, 'ok');
assert.equal(r8.groups.length, 2);
assert.deepEqual(C.verifySolution(r8, small), []);
assert.equal(r8.meta.solver, 'exact');
assert.equal(r8.meta.provenOptimal, true);

// --- the exact solver is never worse than the heuristic on the same weights ---
const mid = makeProblem(12, i => ({
  hostCapacity: i % 3, availableWeekdays: i % 2 ? [1, 2, 3] : [2, 3, 4], fetchCapacity: 2 + (i % 3)
}));
const exact = E.solve(mid, { seed: 1, timeBudgetMs: 10000, weights: S.DEFAULT_WEIGHTS });
const heur = H.solve(mid, { seed: 1, timeBudgetMs: 500, weights: S.DEFAULT_WEIGHTS });
if (exact.status === 'ok' && heur.status === 'ok') {
  assert.ok(exact.score.total >= heur.score.total - 1e-9,
    'exact must be at least as good as the heuristic');
}

// --- determinism: the optimum must not depend on the seed ---
const x1 = E.solve(small, { seed: 4, timeBudgetMs: 5000, weights: S.DEFAULT_WEIGHTS });
const x2 = E.solve(small, { seed: 9, timeBudgetMs: 5000, weights: S.DEFAULT_WEIGHTS });
assert.deepEqual(x1.groups.map(g => g.childIds), x2.groups.map(g => g.childIds),
  'the exact optimum must not depend on the seed');

// --- a full 24-child class solves within the stated budget ---
const full = makeProblem(24, i => ({
  hostCapacity: [0, 1, 2, 3][i % 4],
  maxChildrenAtHome: [0, 3, 4, 5][i % 4],
  availableWeekdays: [[1, 2], [2, 3], [3, 4], [1, 3, 5]][i % 4],
  fetchCapacity: [0, 2, 3, 4][i % 4]
}));
const started = Date.now();
const r24 = E.solve(full, { seed: 1, timeBudgetMs: 20000, weights: S.DEFAULT_WEIGHTS });
assert.ok(Date.now() - started < 25000);
assert.ok(r24.status === 'ok' || r24.status === 'infeasible');
if (r24.status === 'ok') assert.deepEqual(C.verifySolution(r24, full), []);

// --- oversized classes refuse rather than freeze ---
const huge = makeProblem(40);
const rh = E.solve(huge, { seed: 1, timeBudgetMs: 1000, weights: S.DEFAULT_WEIGHTS });
assert.equal(rh.status, 'infeasible');
assert.ok(rh.blockers.some(b => b.code === 'TOO_LARGE'));
assert.ok(/heuristik/i.test(rh.blockers.map(b => b.message).join(' ')),
  'the message must point the admin at solver A');

// --- genuinely impossible classes are reported, not fudged ---
const hopeless = makeProblem(24, { hostCapacity: 0, fetchCapacity: 0, maxChildrenAtHome: 0 });
const rz = E.solve(hopeless, { seed: 1, timeBudgetMs: 2000, weights: S.DEFAULT_WEIGHTS });
assert.equal(rz.status, 'infeasible');
assert.ok(rz.blockers.length > 0);

// --- locks are respected ---
const rl = E.solve(small, {
  seed: 1, timeBudgetMs: 5000, weights: S.DEFAULT_WEIGHTS,
  locks: [{ childId: 'k0', groupIndex: 0 }, { childId: 'k7', groupIndex: 0 }]
});
assert.equal(rl.status, 'ok');
const together = rl.groups.find(g => g.childIds.includes('k0'));
assert.ok(together.childIds.includes('k7'), 'locked children must share a group');

console.log('ok - exact');
