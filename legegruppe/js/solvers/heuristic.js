/* Solver A - greedy construction plus simulated annealing.
   Browser: window.LG.Heuristic   Node: require('./heuristic.js') */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../model.js'), require('../constraints.js'), require('../scoring.js'));
  } else {
    root.LG = Object.assign(root.LG || {}, {
      Heuristic: factory(root.LG.Model, root.LG.Constraints, root.LG.Scoring)
    });
  }
})(typeof self !== 'undefined' ? self : this, function (Model, Constraints, Scoring) {
  'use strict';

  const GROUP_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  /**
   * Split `n` children into as-equal-as-possible groups within [min, max].
   * Returns sizes in descending order, or null when no split exists.
   */
  function planGroupSizes(n, min, max) {
    if (n < min) return null;
    for (let count = Math.ceil(n / max); count <= Math.floor(n / min); count++) {
      const base = Math.floor(n / count);
      const remainder = n % count;
      const sizes = [];
      for (let i = 0; i < count; i++) sizes.push(base + (i < remainder ? 1 : 0));
      if (sizes.every(s => s >= min && s <= max)) return sizes.sort((a, b) => b - a);
    }
    return null;
  }

  /** Fisher-Yates with a seeded generator, so shuffles are reproducible. */
  function shuffle(arr, rand) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  /** Greedy fill: place each child in the legal group where it scores best. */
  function construct(problem, sizes, lockMap, rand) {
    const groups = sizes.map(() => []);
    const placed = new Set();

    // Locked children first - the admin's decisions are not negotiable.
    Object.keys(lockMap).forEach(childId => {
      const idx = lockMap[childId];
      if (idx >= 0 && idx < groups.length && groups[idx].length < sizes[idx]) {
        groups[idx].push(childId);
        placed.add(childId);
      }
    });

    const remaining = shuffle(
      problem.children.map(c => c.childId).filter(id => !placed.has(id)), rand);

    for (const childId of remaining) {
      let bestIdx = -1, bestScore = -Infinity;
      for (let i = 0; i < groups.length; i++) {
        if (groups[i].length >= sizes[i]) continue;
        const candidate = groups[i].concat([childId]);
        // Reject only violations that a partial group can already prove.
        const check = Constraints.groupFeasibility(candidate, problem);
        if (check.violations.some(v => v.code === 'H1')) continue;
        const s = Scoring.scoreGroup(candidate, problem, problem._weights).total
          + 0.001 * rand();
        if (s > bestScore) { bestScore = s; bestIdx = i; }
      }
      if (bestIdx === -1) return null;
      groups[bestIdx].push(childId);
    }
    return groups;
  }

  const feasible = (childIds, problem) =>
    Constraints.groupFeasibility(childIds, problem).ok;

  function totalScore(groups, problem, weights) {
    let sum = 0;
    groups.forEach(g => { sum += Scoring.scoreGroup(g, problem, weights).total; });
    return groups.length ? sum / groups.length : 0;
  }

  /**
   * Simulated annealing over swaps and moves. Any state that would violate a hard
   * requirement is rejected, so the incumbent is always a valid solution.
   */
  function anneal(groups, sizes, problem, weights, rand, deadline, locked) {
    let current = groups.map(g => g.slice());
    let currentScore = totalScore(current, problem, weights);
    let best = current.map(g => g.slice());
    let bestScore = currentScore;

    let temperature = 0.15;
    let iterations = 0;

    while (Date.now() < deadline) {
      iterations++;
      if (iterations % 200 === 0) temperature *= 0.92;

      const gi = Math.floor(rand() * current.length);
      let gj = Math.floor(rand() * current.length);
      if (gi === gj) gj = (gj + 1) % current.length;
      if (current[gi].length === 0 || current[gj].length === 0) continue;

      const ii = Math.floor(rand() * current[gi].length);
      const ji = Math.floor(rand() * current[gj].length);
      const a = current[gi][ii], b = current[gj][ji];
      if (locked.has(a) || locked.has(b)) continue;

      const newI = current[gi].slice(); newI[ii] = b;
      const newJ = current[gj].slice(); newJ[ji] = a;
      if (!feasible(newI, problem) || !feasible(newJ, problem)) continue;

      const before = Scoring.scoreGroup(current[gi], problem, weights).total
        + Scoring.scoreGroup(current[gj], problem, weights).total;
      const after = Scoring.scoreGroup(newI, problem, weights).total
        + Scoring.scoreGroup(newJ, problem, weights).total;
      const delta = (after - before) / current.length;

      if (delta > 0 || rand() < Math.exp(delta / Math.max(temperature, 1e-6))) {
        current[gi] = newI; current[gj] = newJ;
        currentScore += delta;
        if (currentScore > bestScore) {
          bestScore = currentScore;
          best = current.map(g => g.slice());
        }
      }
    }
    return { groups: best, score: bestScore, iterations };
  }

  /** Why is this class unsolvable? Reported per child, deduplicated. */
  function findBlockers(problem) {
    const sizes = planGroupSizes(problem.children.length, problem.groupSizeMin, problem.groupSizeMax);
    if (sizes === null) {
      return [{ code: 'H2', message: 'Klassen har ' + problem.children.length +
        ' børn, som ikke kan deles op i grupper på ' + problem.groupSizeMin + '-' +
        problem.groupSizeMax + '.' }];
    }
    const seen = new Map();
    problem.families.forEach(f => {
      if (f.hostCapacity === 0 && !f.canHostOutdoor) {
        seen.set('H3', { code: 'H3', message: 'Der er for få familier der kan afholde et møde.' });
      }
    });
    const totalFetch = problem.families.reduce((s, f) => s + f.fetchCapacity, 0);
    if (totalFetch < problem.children.length) {
      seen.set('H5', { code: 'H5', message: 'Klassens samlede hentekapacitet er ' + totalFetch +
        ', men der er ' + problem.children.length + ' børn der skal transporteres.' });
    }
    const dayCoverage = [0, 0, 0, 0, 0, 0];
    problem.families.forEach(f => f.availableWeekdays.forEach(d => { dayCoverage[d]++; }));
    if (dayCoverage.every(n => n < problem.groupSizeMin)) {
      seen.set('H4', { code: 'H4', message: 'Ingen hverdag har nok familier til at fylde en gruppe.' });
    }
    if (seen.size === 0) {
      seen.set('UNKNOWN', { code: 'UNKNOWN',
        message: 'Der findes ingen gyldig opdeling med de nuværende svar. Prøv den eksakte løser for en præcis forklaring.' });
    }
    return Array.from(seen.values());
  }

  /** Solver A. Signature matches solvers/index.js. */
  function solve(problem, options) {
    const opts = options || {};
    const weights = opts.weights || Scoring.DEFAULT_WEIGHTS;
    problem._weights = weights;
    const started = Date.now();
    const budget = typeof opts.timeBudgetMs === 'number' ? opts.timeBudgetMs : 200;
    const rand = Model.rng(typeof opts.seed === 'number' ? opts.seed : 1);

    const sizes = planGroupSizes(problem.children.length, problem.groupSizeMin, problem.groupSizeMax);
    if (sizes === null) {
      return { status: 'infeasible', groups: [], score: null, explanation: [],
        blockers: findBlockers(problem), meta: { solver: 'heuristic', runtimeMs: Date.now() - started } };
    }

    const lockMap = {};
    (opts.locks || []).forEach(l => { lockMap[l.childId] = l.groupIndex; });
    const locked = new Set(Object.keys(lockMap));

    // Restart construction until every group is feasible or the budget runs out.
    let start = null;
    for (let attempt = 0; attempt < 60 && Date.now() - started < budget; attempt++) {
      const candidate = construct(problem, sizes, lockMap, rand);
      if (candidate && candidate.every(g => feasible(g, problem))) { start = candidate; break; }
    }
    if (!start) {
      return { status: 'infeasible', groups: [], score: null, explanation: [],
        blockers: findBlockers(problem),
        meta: { solver: 'heuristic', runtimeMs: Date.now() - started, seed: opts.seed } };
    }

    const initialScore = totalScore(start, problem, weights);
    const deadline = started + budget;
    const result = anneal(start, sizes, problem, weights, rand, deadline, locked);

    const groups = result.groups.map((childIds, i) => ({
      id: GROUP_LETTERS[i] || String(i + 1),
      childIds: childIds.slice(),
      why: Scoring.explainGroup(childIds, problem, weights)
    }));

    return {
      status: 'ok',
      groups: groups,
      score: Scoring.scoreSolution({ groups: groups }, problem, weights),
      explanation: groups.map(g => 'Gruppe ' + g.id + ': ' + g.why.join(' ')),
      blockers: [],
      meta: {
        solver: 'heuristic', runtimeMs: Date.now() - started, seed: opts.seed,
        iterations: result.iterations, initialScore: initialScore
      }
    };
  }

  return { solve, planGroupSizes, construct, findBlockers };
});
