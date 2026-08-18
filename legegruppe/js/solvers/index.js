/* The single entry point the UI calls. Grouping + rota + independent verification.
   Browser: window.LG.Solve   Node: require('./index.js') */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../constraints.js'), require('../scoring.js'),
      require('./heuristic.js'), require('./exact.js'), require('./rota.js'),
      require('./infeasibility.js'));
  } else {
    root.LG = Object.assign(root.LG || {}, {
      Solve: factory(root.LG.Constraints, root.LG.Scoring, root.LG.Heuristic,
        root.LG.Exact, root.LG.Rota, root.LG.Infeasibility)
    });
  }
})(typeof self !== 'undefined' ? self : this, function (
  Constraints, Scoring, Heuristic, Exact, Rota, Infeasibility) {
  'use strict';

  const SOLVERS = { heuristic: Heuristic, exact: Exact };

  /**
   * Run one solver end to end.
   * options: { solver, seed, timeBudgetMs, weights, locks }
   */
  function solve(problem, options) {
    const opts = options || {};
    const name = SOLVERS[opts.solver] ? opts.solver : 'heuristic';
    const started = Date.now();

    const grouping = SOLVERS[name].solve(problem, {
      seed: typeof opts.seed === 'number' ? opts.seed : 1,
      timeBudgetMs: opts.timeBudgetMs,
      weights: opts.weights || Scoring.DEFAULT_WEIGHTS,
      locks: opts.locks || []
    });

    if (grouping.status !== 'ok') {
      // A timeout or a size refusal is a statement about the *solver*, not about the
      // class. Diagnosing relaxations there would tell the admin to loosen constraints
      // that were never the problem, so pass the blocker through untouched.
      const solverLimited = (grouping.blockers || [])
        .some(b => b.code === 'TIMEOUT' || b.code === 'TOO_LARGE');
      return Object.assign({}, grouping, {
        rota: null,
        verification: null,
        diagnosis: solverLimited
          ? { needsRelaxation: false, relaxations: [],
              summary: grouping.blockers.map(b => b.message).join(' ') }
          : Infeasibility.diagnose(problem, { timeBudgetMs: 4000 }),
        meta: Object.assign({}, grouping.meta, { solver: name, runtimeMs: Date.now() - started })
      });
    }

    // Independent audit. A solver bug must never reach a published plan.
    const verification = Constraints.verifySolution(grouping, problem);
    if (verification.length > 0) {
      return {
        status: 'invalid',
        groups: grouping.groups,
        score: grouping.score,
        explanation: grouping.explanation,
        blockers: [],
        rota: null,
        verification: verification,
        diagnosis: null,
        meta: Object.assign({}, grouping.meta, { solver: name, runtimeMs: Date.now() - started })
      };
    }

    const rota = Rota.buildRota(grouping, problem, { seed: opts.seed });

    return {
      status: 'ok',
      groups: grouping.groups,
      score: grouping.score,
      explanation: grouping.explanation,
      blockers: [],
      rota: rota,
      verification: [],
      diagnosis: null,
      meta: Object.assign({}, grouping.meta, { solver: name, runtimeMs: Date.now() - started })
    };
  }

  /** How many children would end up with different groupmates under the other solver? */
  function countDifferences(a, b) {
    if (a.status !== 'ok' || b.status !== 'ok') return 0;
    const mates = solution => {
      const map = new Map();
      solution.groups.forEach(g => g.childIds.forEach(id => {
        map.set(id, g.childIds.filter(x => x !== id).sort().join(','));
      }));
      return map;
    };
    const ma = mates(a), mb = mates(b);
    let differ = 0;
    ma.forEach((value, id) => { if (mb.get(id) !== value) differ++; });
    return differ;
  }

  /** Run both solvers on the same problem and describe the difference. */
  function compare(problem, options) {
    const opts = options || {};
    const heuristic = solve(problem, Object.assign({}, opts, { solver: 'heuristic' }));
    const exact = solve(problem, Object.assign({}, opts, { solver: 'exact' }));
    const differentChildren = countDifferences(heuristic, exact);

    let summary;
    if (exact.status !== 'ok') {
      summary = 'Den eksakte løser kom ikke igennem. Brug heuristikkens forslag.';
    } else if (heuristic.status !== 'ok') {
      summary = 'Heuristikken fandt ingen løsning, men den eksakte gjorde. Brug den eksakte.';
    } else if (differentChildren === 0) {
      summary = 'De to løsere er nået frem til nøjagtig samme opdeling.';
    } else {
      const gap = ((exact.score.total - heuristic.score.total) * 100).toFixed(1);
      summary = differentChildren + ' børn får andre gruppekammerater. Den eksakte scorer ' +
        gap + ' procentpoint højere.';
    }
    return { heuristic, exact, differentChildren, summary };
  }

  return { solve, compare, SOLVERS };
});
