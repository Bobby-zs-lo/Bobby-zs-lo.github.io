/* Solver B - exact set partitioning by branch-and-bound with an incumbent from solver A,
   an admissible per-child lower bound, and bounded bitmask memoisation near the root.
   Browser: window.LG.Exact   Node: require('./exact.js') */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../constraints.js'), require('../scoring.js'), require('./heuristic.js'));
  } else {
    root.LG = Object.assign(root.LG || {}, {
      Exact: factory(root.LG.Constraints, root.LG.Scoring, root.LG.Heuristic)
    });
  }
})(typeof self !== 'undefined' ? self : this, function (Constraints, Scoring, Heuristic) {
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

  // Popcount for masks up to 30 bits.
  function popcount(x) {
    let c = 0;
    while (x) { x &= (x - 1); c++; }
    return c;
  }

  // Masks are cached only near the root (few children covered, few distinct masks reachable
  // there because it takes only 2-3 columns to reach this popcount). Deeper masks - close to
  // the full cover - are where the naive DP's memo blew past 1,000,000 entries, because there
  // are astronomically many ways to reach a near-complete cover. We recompute those on demand
  // instead of storing them; each such recomputation is cheap since little remains uncovered.
  const MEMO_POPCOUNT_LIMIT = 10;
  const MEMO_CAP = 200000;

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

    // Admissible per-child lower bound: r[i] = cheapest cost-per-child among all columns
    // covering child i. For any set of still-uncovered children, the sum of their r[i] is a
    // valid lower bound on the cost still required to cover them, because whichever column
    // eventually covers child i contributes at least its own cost/size share.
    const r = new Array(n).fill(Infinity);
    columns.forEach(col => {
      const share = col.cost / col.childIds.length;
      for (let i = 0; i < n; i++) {
        if ((col.mask & (1 << i)) && share < r[i]) r[i] = share;
      }
    });
    let totalR = 0;
    for (let i = 0; i < n; i++) totalR += r[i];
    columns.forEach(col => {
      let s = 0;
      for (let i = 0; i < n; i++) if (col.mask & (1 << i)) s += r[i];
      col.rSum = s;
    });

    // Seed the incumbent from solver A (fast, near-optimal). A strong starting upper bound
    // is what makes the lower-bound pruning below actually cut branches.
    let incumbentCost = Infinity;
    let incumbentColumns = null;
    if (Heuristic && typeof Heuristic.solve === 'function') {
      const seedBudget = typeof opts.heuristicSeedMs === 'number' ? opts.heuristicSeedMs : 500;
      const seed = Heuristic.solve(problem,
        { seed: 1, timeBudgetMs: seedBudget, weights: weights, locks: opts.locks });
      if (seed.status === 'ok') {
        const candidateCols = seed.groups.map(g => ({
          childIds: g.childIds.slice(),
          cost: Scoring.groupCost(g.childIds, problem, weights)
        }));
        const valid = candidateCols.every(col =>
          Constraints.groupFeasibility(col.childIds, problem).ok &&
          lockSets.every(set => {
            const inside = set.filter(id => col.childIds.includes(id)).length;
            return inside === 0 || inside === set.length;
          }));
        if (valid) {
          incumbentCost = candidateCols.reduce((s, c) => s + c.cost, 0);
          incumbentColumns = candidateCols;
        }
      }
    }

    const memo = new Map();
    let expired = false;
    let checks = 0;

    /**
     * Cheapest cover of the children not yet in `mask`, provided it costs strictly less than
     * `bound` - or null if no such cover exists (which includes "the true cheapest cover is
     * >= bound", not just "we ran out of time to check").
     *
     * Soundness of memoisation: a value is cached only when `localBest.cost < bound`. Because
     * every discarded candidate at this node was proven (via the admissible r[] bound) to cost
     * >= bound > localBest.cost, `localBest` is the true global optimum for `mask` - not merely
     * "the best found under this particular bound" - so it is safe to reuse for any future call
     * on the same mask regardless of what bound that future call passes in.
     */
    function best(mask, coveredR, bound) {
      if (expired) return null;
      if (mask === fullMask) return { cost: 0, chosen: [] };

      const memoEligible = popcount(mask) <= MEMO_POPCOUNT_LIMIT;
      if (memoEligible && memo.has(mask)) {
        const cached = memo.get(mask);
        return cached.cost < bound ? cached : null;
      }
      if ((++checks & 1023) === 0 && Date.now() - started > budget) { expired = true; return null; }

      let lowest = 0;
      while (lowest < n && (mask & (1 << lowest))) lowest++;

      let localBest = null;
      const candidates = byLowest[lowest];
      for (let i = 0; i < candidates.length; i++) {
        if (expired) break;
        const col = candidates[i];
        if (col.mask & mask) continue;
        if (col.cost >= bound) break; // sorted ascending: nothing cheaper follows
        const newMask = mask | col.mask;
        const newCoveredR = coveredR + col.rSum;
        const remainingBound = totalR - newCoveredR;
        if (col.cost + remainingBound >= bound) continue; // this column can't beat the bound
        let effectiveBound = bound - col.cost;
        if (localBest && localBest.cost - col.cost < effectiveBound) {
          effectiveBound = localBest.cost - col.cost;
        }
        if (effectiveBound <= 0) continue;
        const rest = best(newMask, newCoveredR, effectiveBound);
        if (!rest) continue;
        const cost = col.cost + rest.cost;
        if (!localBest || cost < localBest.cost) {
          localBest = { cost: cost, chosen: [col].concat(rest.chosen) };
        }
      }
      if (expired) return null;
      if (memoEligible && memo.size < MEMO_CAP && localBest) {
        memo.set(mask, localBest);
      }
      return localBest;
    }

    const rootResult = best(0, 0, incumbentCost);

    // `expired` must be checked before trusting anything: once the budget is hit deep in the
    // recursion, ancestor calls can still return a non-null (but unproven) result. Any expiry
    // is a timeout, not a solution - matches the original solver's contract exactly.
    if (expired) {
      return fail([{ code: 'TIMEOUT', message: 'Den eksakte løser nåede ikke frem inden for ' +
        'tidsgrænsen. Brug heuristikken (løser A), eller giv den eksakte mere tid.' }]);
    }

    // rootResult, if present, was found strictly cheaper than incumbentCost and is - by the
    // soundness argument above - the proven global optimum. If rootResult is null, the search
    // proved no cover beats incumbentCost; since incumbentColumns is an actual achievable
    // partition at exactly incumbentCost, incumbentCost is itself the proven optimum.
    const result = rootResult || (incumbentColumns && { cost: incumbentCost, chosen: incumbentColumns });

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
