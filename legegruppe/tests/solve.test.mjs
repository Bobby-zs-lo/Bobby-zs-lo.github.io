/* Run: node legegruppe/tests/solve.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../js/model.js');
const Constraints = require('../js/constraints.js');
const Solve = require('../js/solvers/index.js');

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

const p = makeProblem(24);

// --- both solvers satisfy the same contract ---
['heuristic', 'exact'].forEach(name => {
  const r = Solve.solve(p, { solver: name, seed: 1, timeBudgetMs: 15000 });
  assert.equal(r.status, 'ok', name + ' should solve a comfortable class');
  assert.equal(r.meta.solver, name);
  assert.ok(Array.isArray(r.groups) && r.groups.length > 0);
  assert.ok(r.rota && Array.isArray(r.rota.groups));
  assert.equal(r.rota.groups.length, r.groups.length);
  assert.deepEqual(r.verification, []);
  assert.ok(typeof r.score.total === 'number');
  assert.ok(Array.isArray(r.explanation));
  assert.ok(typeof r.meta.runtimeMs === 'number');
});

// --- unknown solver names fall back to the heuristic rather than throwing ---
const fallback = Solve.solve(p, { solver: 'nonsense', seed: 1, timeBudgetMs: 500 });
assert.equal(fallback.meta.solver, 'heuristic');

// --- infeasible classes come back with a diagnosis attached ---
const hopeless = makeProblem(24, { hostCapacity: 0, maxChildrenAtHome: 0, fetchCapacity: 0 });
const bad = Solve.solve(hopeless, { solver: 'heuristic', seed: 1, timeBudgetMs: 800 });
assert.equal(bad.status, 'infeasible');
assert.ok(bad.diagnosis && typeof bad.diagnosis.summary === 'string');
assert.ok(bad.diagnosis.summary.length > 20);
assert.equal(bad.rota, null);

// --- a solver that merely ran out of time or refused on size must NOT be
//     diagnosed as an impossible class: that would tell the admin to loosen
//     the wrong thing entirely ---
const tooBig = makeProblem(40);
const refused = Solve.solve(tooBig, { solver: 'exact', seed: 1, timeBudgetMs: 500 });
assert.equal(refused.status, 'infeasible');
assert.equal(refused.diagnosis.needsRelaxation, false);
assert.ok(/heuristik/i.test(refused.diagnosis.summary), refused.diagnosis.summary);

// --- comparing the two solvers side by side ---
const cmp = Solve.compare(p, { seed: 1, timeBudgetMs: 15000 });
assert.ok(cmp.heuristic && cmp.exact);
assert.ok(typeof cmp.differentChildren === 'number');
assert.ok(cmp.differentChildren >= 0 && cmp.differentChildren <= p.children.length);
assert.ok(typeof cmp.summary === 'string' && cmp.summary.length > 10);

// --- the verification gate: a deliberately broken "solution" must be caught ---
// solve()'s 'invalid' branch exists to stop a buggy solver's output from ever
// reaching parents. We cannot force either real solver to produce a broken
// solution (both are internally consistent by construction), so we verify the
// gate's underlying mechanism directly: Constraints.verifySolution must detect
// a solution that violates H2 (group too large) and one that double-covers a
// child. This proves the check `solve()` relies on actually catches breakage;
// it does not exercise the 'invalid' return branch of solve() itself.
{
  const allIds = p.children.map(c => c.childId);
  const brokenTooBig = { groups: [{ id: 'A', childIds: allIds }] }; // one giant group, violates H2
  const brokenViolations = Constraints.verifySolution(brokenTooBig, p);
  assert.ok(brokenViolations.length > 0, 'verifySolution should catch an oversized group');
  assert.ok(brokenViolations.some(v => v.code === 'H2'));

  const half = Math.floor(allIds.length / 2);
  const brokenDoubleCover = {
    groups: [
      { id: 'A', childIds: allIds.slice(0, half + 1) },
      { id: 'B', childIds: allIds.slice(half - 1) } // overlaps with group A
    ]
  };
  const coverViolations = Constraints.verifySolution(brokenDoubleCover, p);
  assert.ok(coverViolations.some(v => v.code === 'COVER'), 'verifySolution should catch double coverage');
}

console.log('ok - solve');
