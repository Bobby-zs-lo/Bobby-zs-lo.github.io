/* Run: node legegruppe/tests/heuristic.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../js/model.js');
const C = require('../js/constraints.js');
const S = require('../js/scoring.js');
const H = require('../js/solvers/heuristic.js');

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

// --- group size planning ---
assert.deepEqual(H.planGroupSizes(24, 4, 5), [5, 5, 5, 5, 4]);
assert.deepEqual(H.planGroupSizes(20, 4, 5), [5, 5, 5, 5]);
assert.deepEqual(H.planGroupSizes(8, 4, 5), [4, 4]);
assert.deepEqual(H.planGroupSizes(9, 4, 5), [5, 4]);
assert.equal(H.planGroupSizes(3, 4, 5), null);   // impossible
assert.equal(H.planGroupSizes(7, 4, 5), null);   // 7 cannot be split into 4s and 5s

// every plan sums to n and stays inside the bounds
for (let n = 8; n <= 40; n++) {
  const sizes = H.planGroupSizes(n, 4, 5);
  if (sizes === null) continue;
  assert.equal(sizes.reduce((a, b) => a + b, 0), n, 'sizes must sum to ' + n);
  assert.ok(sizes.every(s => s >= 4 && s <= 5));
}

// --- a comfortable class solves cleanly and passes the independent verifier ---
const easy = makeProblem(24);
const r = H.solve(easy, { seed: 1, timeBudgetMs: 300, weights: S.DEFAULT_WEIGHTS });
assert.equal(r.status, 'ok');
assert.equal(r.groups.length, 5);
assert.deepEqual(C.verifySolution(r, easy), []);
assert.equal(r.meta.solver, 'heuristic');
assert.ok(r.meta.runtimeMs >= 0);

// --- determinism: same seed, identical output ---
const a = H.solve(easy, { seed: 7, timeBudgetMs: 200, weights: S.DEFAULT_WEIGHTS });
const b = H.solve(easy, { seed: 7, timeBudgetMs: 200, weights: S.DEFAULT_WEIGHTS });
assert.deepEqual(a.groups.map(g => g.childIds), b.groups.map(g => g.childIds));

// --- annealing actually improves on the constructed start ---
assert.ok(r.score.total >= r.meta.initialScore - 1e-9,
  'final score must be at least as good as the starting one');

// --- blocked pairs are honoured, never merely penalised ---
const blocked = makeProblem(24, {}, { blockedPairs: [['k0', 'k1'], ['k2', 'k3'], ['k0', 'k5']] });
const rb = H.solve(blocked, { seed: 3, timeBudgetMs: 300, weights: S.DEFAULT_WEIGHTS });
assert.equal(rb.status, 'ok');
assert.deepEqual(C.verifySolution(rb, blocked), []);

// --- locks: a pinned child stays where the admin put it ---
const locked = H.solve(easy, {
  seed: 5, timeBudgetMs: 300, weights: S.DEFAULT_WEIGHTS,
  locks: [{ childId: 'k0', groupIndex: 2 }, { childId: 'k1', groupIndex: 2 }]
});
assert.equal(locked.status, 'ok');
assert.ok(locked.groups[2].childIds.includes('k0'));
assert.ok(locked.groups[2].childIds.includes('k1'));
assert.deepEqual(C.verifySolution(locked, easy), []);

// --- history is actually used: the previous round's groups get broken up ---
const history = [];
[[0, 1, 2, 3, 4], [5, 6, 7, 8, 9]].forEach(grp => {
  for (let i = 0; i < grp.length; i++)
    for (let j = i + 1; j < grp.length; j++)
      history.push({ childA: 'k' + grp[i], childB: 'k' + grp[j] });
});
const second = makeProblem(24, {}, { history });
const r2 = H.solve(second, { seed: 11, timeBudgetMs: 500, weights: S.DEFAULT_WEIGHTS });
const g0 = r2.groups.find(g => g.childIds.includes('k0'));
const repeats = ['k1', 'k2', 'k3', 'k4'].filter(id => g0.childIds.includes(id)).length;
assert.ok(repeats <= 1, 'should not simply rebuild last round: ' + repeats + ' repeats');

// --- an impossible class returns infeasible, not a broken solution ---
const hopeless = makeProblem(24, { hostCapacity: 0, fetchCapacity: 0, maxChildrenAtHome: 0 });
const rh = H.solve(hopeless, { seed: 1, timeBudgetMs: 200, weights: S.DEFAULT_WEIGHTS });
assert.equal(rh.status, 'infeasible');
assert.ok(Array.isArray(rh.blockers) && rh.blockers.length > 0);

// --- groups carry Danish explanations ---
r.groups.forEach(g => {
  assert.ok(Array.isArray(g.why) && g.why.length > 0);
  assert.equal(typeof g.id, 'string');
});

// --- REGRESSION: determinism must not depend on machine speed ---
// The first full acceptance run failed here. Annealing used to stop on the wall
// clock, so a busier machine did fewer iterations and the same seed produced
// different groups. Repeating the same call many times, with deliberate noise in
// between, is what catches that; a single a-vs-b comparison did not.
const sameSeedRuns = [];
for (let i = 0; i < 25; i++) {
  // Burn a varying amount of time so each call starts at a different clock offset.
  let burn = 0;
  for (let j = 0; j < i * 40000; j++) burn += j % 7;
  if (burn < 0) throw new Error('unreachable');
  const run = H.solve(easy, { seed: 99, timeBudgetMs: 120, weights: S.DEFAULT_WEIGHTS });
  sameSeedRuns.push(JSON.stringify(run.groups.map(g => g.childIds)));
}
assert.equal(new Set(sameSeedRuns).size, 1,
  "same seed gave " + new Set(sameSeedRuns).size + " different answers across 25 runs");

// The iteration budget is what makes that true, so pin it.
const pinned = H.solve(easy, { seed: 99, timeBudgetMs: 120, weights: S.DEFAULT_WEIGHTS });
assert.equal(pinned.meta.iterations, pinned.meta.maxIterations,
  'the run should end because it hit its iteration budget, not the clock');
// There is deliberately no wall-clock escape hatch: one was tried and removed,
// because it only ever fired on a loaded machine — exactly when a stable answer
// matters most.
assert.equal(pinned.meta.deadlineHit, undefined,
  'annealing must not be bounded by the clock in any form');

console.log('ok - heuristic');
