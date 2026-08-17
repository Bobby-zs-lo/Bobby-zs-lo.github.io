/* Solver B - exact set partitioning by branch-and-bound with bitmask memoisation.
   Browser: window.LG.Exact   Node: require('./exact.js') */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../constraints.js'), require('../scoring.js'));
  } else {
    root.LG = Object.assign(root.LG || {}, {
      Exact: factory(root.LG.Constraints, root.LG.Scoring)
    });
  }
})(typeof self !== 'undefined' ? self : this, function (Constraints, Scoring) {
  'use strict';

  const GROUP_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  // 30 keeps every bitmask inside the signed 32-bit range that `1 << i` produces,
  // and the column count manageable. Larger classes go to solver A.
  const MAX_CHILDREN = 30;
  const MAX_COLUMNS = 400000;  // hard ceiling on enumerated groups

  /**
   * Enumerate every group of legal size passing H1-H5, as { mask, childIds, cost }.
   * `cost` is 1 - groupScore, so the partition problem is a minimisation.
   */
  function enumerateGroups(problem, weights, columnLimit) {
    const ids = problem.children.map(c => c.childId);
    const n = ids.length;
    const limit = columnLimit || MAX_COLUMNS;
    const groups = [];
    let truncated = false;

    const combo = [];
    function recurse(start, size, target) {
      if (truncated) return;
      if (combo.length === target) {
        const childIds = combo.map(i => ids[i]);
        if (Constraints.groupFeasibility(childIds, problem).ok) {
          let mask = 0;
          combo.forEach(i => { mask |= (1 << i); });
          groups.push({
            mask: mask,
            childIds: childIds.slice(),
            lowest: combo[0],
            cost: Scoring.groupCost(childIds, problem, weights)
          });
          if (groups.length >= limit) truncated = true;
        }
        return;
      }
      for (let i = start; i < n; i++) {
        combo.push(i);
        recurse(i + 1, size, target);
        combo.pop();
        if (truncated) return;
      }
    }

    for (let size = problem.groupSizeMin; size <= problem.groupSizeMax; size++) {
      recurse(0, size, size);
    }
    return { groups: groups, truncated: truncated };
  }

  /** Groups indexed by the lowest child index they contain - the branching order. */
  function indexByLowest(columns, n) {
    const byLowest = [];
    for (let i = 0; i < n; i++) byLowest.push([]);
    columns.forEach(col => { byLowest[col.lowest].push(col); });
    // Cheapest first: a good incumbent early prunes hard.
    byLowest.forEach(list => list.sort((a, b) => a.cost - b.cost));
    return byLowest;
  }

  function solve(problem, options) {
    const opts = options || {};
    const weights = opts.weights || Scoring.DEFAULT_WEIGHTS;
    const started = Date.now();
    const budget = typeof opts.timeBudgetMs === 'number' ? opts.timeBudgetMs : 10000;
    const ids = problem.children.map(c => c.childId);
    const n = ids.length;

    const fail = blockers => ({
      status: 'infeasible', groups: [], score: null, explanation: [], blockers: blockers,
      meta: { solver: 'exact', runtimeMs: Date.now() - started, provenOptimal: false }
    });

    if (n > MAX_CHILDREN) {
      return fail([{ code: 'TOO_LARGE', message: 'Klassen har ' + n +
        ' børn. Den eksakte løser klarer op til ' + MAX_CHILDREN +
        '. Brug heuristikken (løser A) i stedet — den håndterer klasser af enhver størrelse.' }]);
    }

    const enumerated = enumerateGroups(problem, weights, MAX_COLUMNS);
    if (enumerated.truncated) {
      return fail([{ code: 'TOO_LARGE', message: 'Der er for mange mulige grupper til at ' +
        'gennemsøge dem alle. Brug heuristikken (løser A) i stedet.' }]);
    }
    if (enumerated.groups.length === 0) {
      return fail([{ code: 'H0', message: 'Der findes ikke en eneste lovlig gruppe med ' +
        'de nuværende svar. Mindst ét hårdt krav kan ikke opfyldes af nogen kombination af børn.' }]);
    }

    // Locks become an extra filter: locked children may only appear together.
    const lockGroups = {};
    (opts.locks || []).forEach(l => {
      lockGroups[l.groupIndex] = lockGroups[l.groupIndex] || [];
      lockGroups[l.groupIndex].push(l.childId);
    });
    const lockSets = Object.keys(lockGroups).map(k => lockGroups[k]);
    const columns = enumerated.groups.filter(col => lockSets.every(set => {
      const inside = set.filter(id => col.childIds.includes(id)).length;
      return inside === 0 || inside === set.length;
    }));
    if (columns.length === 0) {
      return fail([{ code: 'LOCK', message: 'De børn du har låst sammen kan ikke være i ' +
        'samme gruppe uden at bryde et hårdt krav.' }]);
    }

    const byLowest = indexByLowest(columns, n);
    const fullMask = (1 << n) - 1;   // safe: n <= MAX_CHILDREN (30)
    const memo = new Map();
    let expired = false;
    let checks = 0;

    /** Cheapest cover of the children not yet in `mask`, or null if none exists. */
    function best(mask) {
      if (mask === fullMask) return { cost: 0, chosen: [] };
      if (memo.has(mask)) return memo.get(mask);
      if ((++checks & 1023) === 0 && Date.now() - started > budget) { expired = true; return null; }
      if (expired) return null;

      let lowest = 0;
      while (lowest < n && (mask & (1 << lowest))) lowest++;

      let bestResult = null;
      const candidates = byLowest[lowest];
      for (let i = 0; i < candidates.length; i++) {
        const col = candidates[i];
        if (col.mask & mask) continue;
        if (bestResult && col.cost >= bestResult.cost) break; // sorted: nothing cheaper follows
        const rest = best(mask | col.mask);
        if (!rest) { if (expired) break; else continue; }
        const cost = col.cost + rest.cost;
        if (!bestResult || cost < bestResult.cost) {
          bestResult = { cost: cost, chosen: [col].concat(rest.chosen) };
        }
      }
      if (!expired) memo.set(mask, bestResult);
      return bestResult;
    }

    const result = best(0);

    // `expired` must be checked before trusting `result`: once the budget is hit deep in
    // the recursion, ancestor calls `break` out of their candidate loop early and can still
    // bubble up a non-null (but unproven, possibly suboptimal) bestResult. Treating that as
    // a genuine optimum would silently violate the "never hang or lie about optimality"
    // requirement, so any expiry — regardless of whether `result` came back null — is a
    // timeout, not a solution.
    if (expired) {
      return fail([{ code: 'TIMEOUT', message: 'Den eksakte løser nåede ikke frem inden for ' +
        'tidsgrænsen. Brug heuristikken (løser A), eller giv den eksakte mere tid.' }]);
    }
    if (!result) {
      return fail([{ code: 'PARTITION', message: 'Børnene kan ikke deles op i lovlige grupper. ' +
        'Der findes lovlige grupper, men ingen kombination dækker alle børn præcis én gang.' }]);
    }

    const groups = result.chosen.map((col, i) => ({
      id: GROUP_LETTERS[i] || String(i + 1),
      childIds: col.childIds.slice(),
      why: Scoring.explainGroup(col.childIds, problem, weights)
    }));

    return {
      status: 'ok',
      groups: groups,
      score: Scoring.scoreSolution({ groups: groups }, problem, weights),
      explanation: groups.map(g => 'Gruppe ' + g.id + ': ' + g.why.join(' ')),
      blockers: [],
      meta: {
        solver: 'exact', runtimeMs: Date.now() - started, provenOptimal: true,
        columns: columns.length, memoStates: memo.size
      }
    };
  }

  return { solve, enumerateGroups, MAX_CHILDREN: MAX_CHILDREN };
});
