/* Run: node legegruppe/tests/acceptance.test.mjs
   The full gate. Slower than the unit tests - expect many minutes. */
import assert from 'node:assert/strict';
import { runSimulations, THRESHOLDS } from './simulate.mjs';

const report = runSimulations({ count: 1000, childCount: 24, exactEvery: 5, quiet: false });

// --- the run itself ---
assert.equal(report.total, 1000);
assert.ok(report.exactRuns >= 190 && report.exactRuns <= 210);

// --- ZERO hard-constraint violations. Non-negotiable, both solvers. ---
assert.equal(report.hardViolations.heuristic, 0,
  'heuristic produced invalid solutions: ' + JSON.stringify(report.failures.slice(0, 3)));
assert.equal(report.hardViolations.exact, 0,
  'exact produced invalid solutions: ' + JSON.stringify(report.failures.slice(0, 3)));

// --- every run ends in a solution or an actionable explanation. Never neither. ---
assert.equal(report.unexplained, 0,
  'runs that neither solved nor explained themselves: ' + JSON.stringify(report.failures.slice(0, 3)));

// --- determinism ---
assert.equal(report.nondeterministic, 0, 'same seed must give the same answer');

// --- runtime ---
assert.ok(report.runtime.heuristic.median < THRESHOLDS.heuristicMedianMs,
  'heuristic median ' + report.runtime.heuristic.median + 'ms');
assert.ok(report.runtime.heuristic.p99 < THRESHOLDS.heuristicP99Ms,
  'heuristic p99 ' + report.runtime.heuristic.p99 + 'ms');
// The exact-solver runtime is measured over runs that actually PROVED an optimum,
// because a run that gave up just spent its whole budget and would report the budget
// back as if it were a measurement. That makes the threshold meaningful — but it also
// means it would pass vacuously if every run gave up (n = 0, median = 0). So the
// solver has to earn the metric first. Roughly a fifth of the generated classes are
// infeasible by design, so the bar sits below that.
assert.ok(report.solved.exact / report.exactRuns >= 0.5,
  'exact proved an optimum in only ' + report.solved.exact + '/' + report.exactRuns +
  ' runs — the runtime threshold below would be measuring almost nothing');
assert.ok(report.runtime.exact.n > 0, 'no exact run ever reached a proven optimum');
assert.ok(report.runtime.exact.median < THRESHOLDS.exactMedianMs,
  'exact median (proven runs only) ' + report.runtime.exact.median + 'ms');

// --- the heuristic tracks the proven optimum closely ---
assert.ok(report.qualityWithin5pct >= THRESHOLDS.qualityWithin5pct,
  'heuristic was within 5% of optimum in only ' +
  (report.qualityWithin5pct * 100).toFixed(1) + '% of comparable runs');

// --- nobody is ever scheduled beyond their declared capacity ---
assert.equal(report.capacityBreaches, 0,
  'families scheduled to host more often than they said they could');

console.log(report.text);
console.log('ok - acceptance (1000 simulations)');
