/* Run: node legegruppe/tests/infeasibility.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../js/model.js');
const I = require('../js/solvers/infeasibility.js');

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

// --- a solvable class needs no relaxation ---
const fine = makeProblem(8);
const okDiag = I.diagnose(fine, { timeBudgetMs: 2000 });
assert.equal(okDiag.needsRelaxation, false);
assert.deepEqual(okDiag.relaxations, []);

// --- nobody can fetch: that is no longer a problem to be solved ---
// Transport stopped being a hard requirement, so a class where nobody can collect
// the children goes up perfectly well. The parents arrange the lifts themselves and
// the rota marks those meetings 'aftales'. Nothing needs relaxing.
const noFetch = makeProblem(8, { fetchCapacity: 0 });
const d1 = I.diagnose(noFetch, { timeBudgetMs: 3000 });
assert.equal(d1.needsRelaxation, false,
  'a class that cannot fetch is still a workable class: ' + JSON.stringify(d1.relaxations));

// --- and transport is never offered as something to loosen, since it is not binding ---
[d1].concat([I.diagnose(makeProblem(8, { maxChildrenAtHome: 1 }), { timeBudgetMs: 3000 })])
  .forEach(d => d.relaxations.forEach(r => assert.notEqual(r.code, 'H5')));

// --- nobody has room at home, but going outdoors would fix it ---
const noRoom = makeProblem(8, { maxChildrenAtHome: 1 });
const d2 = I.diagnose(noRoom, { timeBudgetMs: 3000 });
assert.equal(d2.needsRelaxation, true);
assert.ok(d2.relaxations.some(r => r.code === 'H3'));

// --- everyone free on a different day ---
const noDay = makeProblem(8, i => ({ availableWeekdays: [(i % 5) + 1] }));
const d3 = I.diagnose(noDay, { timeBudgetMs: 3000 });
assert.equal(d3.needsRelaxation, true);
assert.ok(d3.relaxations.some(r => r.code === 'H4' || r.code === 'H5'));

// --- H1 is never suggested as something to relax ---
const blocked = makeProblem(8, {}, {
  blockedPairs: [['k0', 'k1'], ['k0', 'k2'], ['k0', 'k3'], ['k0', 'k4'],
    ['k0', 'k5'], ['k0', 'k6'], ['k0', 'k7']]
});
const d4 = I.diagnose(blocked, { timeBudgetMs: 3000 });
d4.relaxations.forEach(r => assert.notEqual(r.code, 'H1'));
assert.ok(d4.summary.length > 20);

// --- every relaxation comes with actionable Danish prose ---
[d2, d3].forEach(d => {
  assert.ok(typeof d.summary === 'string' && d.summary.length > 20, d.summary);
  d.relaxations.forEach(r => {
    assert.ok(typeof r.message === 'string' && r.message.length > 15);
    assert.ok(typeof r.action === 'string' && r.action.length > 10);
  });
});

// --- the class size itself can be the problem ---
const seven = makeProblem(7);
const d5 = I.diagnose(seven, { timeBudgetMs: 2000 });
assert.equal(d5.needsRelaxation, true);
assert.ok(d5.relaxations.some(r => r.code === 'H2'));

console.log('ok - infeasibility');
