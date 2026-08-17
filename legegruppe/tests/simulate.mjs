/* The 1000-simulation acceptance harness. ESM.
   Standalone: node legegruppe/tests/simulate.mjs [count] */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const M = require('../js/model.js');
const C = require('../js/constraints.js');
const Solve = require('../js/solvers/index.js');
import { generateClass, PROFILES } from './generate.mjs';

export const THRESHOLDS = {
  heuristicMedianMs: 500,
  heuristicP99Ms: 2000,
  exactMedianMs: 5000,
  qualityWithin5pct: 0.90
};

/** Profile mix: mostly realistic classes, with a steady diet of hostile ones. */
const MIX = [
  ['realistic', 60], ['strained', 15], ['generous', 10],
  ['onlyThursday', 5], ['noDrivers', 5], ['fewHosts', 5]
];

function profileFor(index) {
  const total = MIX.reduce((s, m) => s + m[1], 0);
  let slot = (index * 7919) % total;   // deterministic spread across the mix
  for (const [name, weight] of MIX) {
    slot -= weight;
    if (slot < 0) return name;
  }
  return 'realistic';
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

function stats(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return {
    n: sorted.length,
    median: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    p99: percentile(sorted, 0.99),
    max: sorted.length ? sorted[sorted.length - 1] : 0
  };
}

/** Did the rota schedule anybody beyond their own declared host capacity? */
function capacityBreaches(result, problem) {
  if (!result.rota) return 0;
  const counts = {};
  result.rota.groups.forEach(g => g.meetings.forEach(m => {
    counts[m.hostFamilyId] = (counts[m.hostFamilyId] || 0) + 1;
  }));
  let breaches = 0;
  Object.keys(counts).forEach(fid => {
    const family = problem.familyById(fid);
    if (family && counts[fid] > family.hostCapacity) breaches++;
  });
  return breaches;
}

/** A result is acceptable if it solved, or explained itself in actionable Danish. */
function isExplained(result) {
  if (result.status === 'ok') return true;
  if (result.status !== 'infeasible') return false;
  const d = result.diagnosis;
  return Boolean(d && typeof d.summary === 'string' && d.summary.length > 20);
}

export function runSimulations(options) {
  const opts = options || {};
  const count = opts.count || 1000;
  const childCount = opts.childCount || 24;
  const exactEvery = opts.exactEvery || 5;

  const report = {
    total: count, exactRuns: 0,
    solved: { heuristic: 0, exact: 0 },
    infeasible: { heuristic: 0, exact: 0 },
    hardViolations: { heuristic: 0, exact: 0 },
    unexplained: 0, nondeterministic: 0, capacityBreaches: 0, exactTimeouts: 0,
    runtime: { heuristic: [], exact: [], exactGaveUp: [] },
    scores: { heuristic: [], exact: [] },
    qualityGaps: [], qualityWithin5pct: 0,
    byProfile: {}, failures: [], text: ''
  };

  Object.keys(PROFILES).forEach(name => {
    report.byProfile[name] = { runs: 0, solved: 0, infeasible: 0 };
  });

  const note = (seed, profile, what) => {
    if (report.failures.length < 20) report.failures.push({ seed, profile, what });
  };

  for (let i = 0; i < count; i++) {
    const seed = 1000 + i;
    const profile = profileFor(i);
    const input = generateClass({
      seed: seed, childCount: childCount, profile: profile,
      previousRounds: i % 3, blockedPairCount: i % 4
    });
    const problem = M.buildProblem(input);
    const bucket = report.byProfile[profile];
    bucket.runs++;

    // --- solver A ---
    const h = Solve.solve(problem, { solver: 'heuristic', seed: 1, timeBudgetMs: 300 });
    report.runtime.heuristic.push(h.meta.runtimeMs);
    if (h.status === 'ok') {
      report.solved.heuristic++;
      bucket.solved++;
      report.scores.heuristic.push(h.score.total);
      const violations = C.verifySolution(h, problem);
      if (violations.length > 0) {
        report.hardViolations.heuristic++;
        note(seed, profile, 'heuristic violated: ' + violations[0].code);
      }
      const breaches = capacityBreaches(h, problem);
      if (breaches > 0) {
        report.capacityBreaches += breaches;
        note(seed, profile, 'rota exceeded declared host capacity');
      }
    } else {
      report.infeasible.heuristic++;
      bucket.infeasible++;
    }
    if (!isExplained(h)) {
      report.unexplained++;
      note(seed, profile, 'heuristic neither solved nor explained');
    }

    // --- determinism, checked on every tenth run ---
    if (i % 10 === 0) {
      const again = Solve.solve(problem, { solver: 'heuristic', seed: 1, timeBudgetMs: 300 });
      const same = JSON.stringify(again.groups.map(g => g.childIds)) ===
        JSON.stringify(h.groups.map(g => g.childIds));
      if (!same) {
        report.nondeterministic++;
        note(seed, profile, 'heuristic was not deterministic');
      }
    }

    // --- solver B, on a subsample ---
    if (i % exactEvery === 0) {
      report.exactRuns++;
      // 15s: the exact solver proves a 24-child class in ~4s median, but a hard
      // instance can take three or four times that. Timeouts are counted, not hidden.
      const e = Solve.solve(problem, { solver: 'exact', seed: 1, timeBudgetMs: 15000 });
      // Two different questions, so two different measurements. "How long does it
      // take to PROVE an optimum" is the number that matters for the solver's
      // usefulness; a run that gave up simply spent the whole budget, and averaging
      // those in would report the budget back to us dressed up as a measurement.
      if (e.status === 'ok') report.runtime.exact.push(e.meta.runtimeMs);
      else report.runtime.exactGaveUp.push(e.meta.runtimeMs);
      if ((e.blockers || []).some(b => b.code === 'TIMEOUT')) report.exactTimeouts++;
      if (e.status === 'ok') {
        report.solved.exact++;
        report.scores.exact.push(e.score.total);
        const violations = C.verifySolution(e, problem);
        if (violations.length > 0) {
          report.hardViolations.exact++;
          note(seed, profile, 'exact violated: ' + violations[0].code);
        }
        if (h.status === 'ok' && e.score.total > 0) {
          const gap = (e.score.total - h.score.total) / e.score.total;
          report.qualityGaps.push(gap);
        }
      } else {
        report.infeasible.exact++;
      }
      if (!isExplained(e)) {
        report.unexplained++;
        note(seed, profile, 'exact neither solved nor explained');
      }
    }

    if (!opts.quiet && (i + 1) % 100 === 0) {
      process.stdout.write('  ' + (i + 1) + '/' + count + ' simulationer\n');
    }
  }

  report.runtime.heuristic = stats(report.runtime.heuristic);
  report.runtime.exact = stats(report.runtime.exact);
  report.runtime.exactGaveUp = stats(report.runtime.exactGaveUp);
  const within = report.qualityGaps.filter(g => g <= 0.05).length;
  report.qualityWithin5pct = report.qualityGaps.length ? within / report.qualityGaps.length : 1;

  const meanScore = list => list.length
    ? (list.reduce((a, b) => a + b, 0) / list.length).toFixed(3) : 'n/a';

  const lines = [];
  lines.push('');
  lines.push('=== Legegruppe: ' + count + ' simulationer à ' + childCount + ' børn ===');
  lines.push('Løser A kørt på alle ' + count + '. Løser B kørt på hver ' + exactEvery +
    '. (' + report.exactRuns + ' kørsler).');
  lines.push('');
  lines.push('Løsninger fundet    A: ' + report.solved.heuristic + '/' + count +
    '   B: ' + report.solved.exact + '/' + report.exactRuns);
  lines.push('Uløselige           A: ' + report.infeasible.heuristic +
    '   B: ' + report.infeasible.exact);
  lines.push('Brud på hårde krav  A: ' + report.hardViolations.heuristic +
    '   B: ' + report.hardViolations.exact + '   (krav: 0)');
  lines.push('Uden forklaring     ' + report.unexplained + '   (krav: 0)');
  lines.push('Ikke-deterministisk ' + report.nondeterministic + '   (krav: 0)');
  lines.push('Kapacitetsbrud      ' + report.capacityBreaches + '   (krav: 0)');
  lines.push('B løb tør for tid   ' + report.exactTimeouts + '/' + report.exactRuns +
    '   (tilladt — rapporteres ærligt som timeout, ikke som uløselig klasse)');
  lines.push('');
  lines.push('Køretid A (ms)      median ' + report.runtime.heuristic.median +
    '  p90 ' + report.runtime.heuristic.p90 +
    '  p99 ' + report.runtime.heuristic.p99 +
    '  max ' + report.runtime.heuristic.max);
  lines.push('Køretid B, bevist   median ' + report.runtime.exact.median +
    '  p90 ' + report.runtime.exact.p90 +
    '  max ' + report.runtime.exact.max +
    '   (' + report.runtime.exact.n + ' kørsler)');
  lines.push('Køretid B, opgav    median ' + report.runtime.exactGaveUp.median +
    '  max ' + report.runtime.exactGaveUp.max +
    '   (' + report.runtime.exactGaveUp.n + ' kørsler — brugte tidsbudgettet op)');
  lines.push('');
  lines.push('Score A (middel)    ' + meanScore(report.scores.heuristic));
  lines.push('Score B (middel)    ' + meanScore(report.scores.exact));
  lines.push('A inden for 5% af B ' + (report.qualityWithin5pct * 100).toFixed(1) +
    '%   (krav: ' + (THRESHOLDS.qualityWithin5pct * 100) + '%)');
  lines.push('');
  lines.push('Per profil:');
  Object.keys(report.byProfile).forEach(name => {
    const b = report.byProfile[name];
    if (b.runs === 0) return;
    lines.push('  ' + name.padEnd(14) + b.runs + ' kørsler, ' +
      b.solved + ' løst, ' + b.infeasible + ' uløselige');
  });
  if (report.failures.length) {
    lines.push('');
    lines.push('Første fejl (reproducér med seed):');
    report.failures.slice(0, 10).forEach(f =>
      lines.push('  seed ' + f.seed + ' [' + f.profile + '] ' + f.what));
  }
  lines.push('');
  report.text = lines.join('\n');
  return report;
}

// Standalone invocation prints the report and exits non-zero on any breach.
// (Compare resolved filesystem paths, not raw URL strings: on Windows,
// 'file://' + argv[1] loses the third slash before the drive letter that
// import.meta.url always has, so a naive string comparison never matches.)
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const count = parseInt(process.argv[2], 10) || 1000;
  const report = runSimulations({ count: count });
  console.log(report.text);
  const failed = report.hardViolations.heuristic + report.hardViolations.exact +
    report.unexplained + report.nondeterministic + report.capacityBreaches;
  process.exit(failed > 0 ? 1 : 0);
}
