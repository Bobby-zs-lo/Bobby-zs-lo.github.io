/* Soft objectives S1-S5. Every objective is per-group and returns [0, 1], 1 = best.
   Browser: window.LG.Scoring   Node: require('./scoring.js') */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LG = Object.assign(root.LG || {}, { Scoring: factory() });
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_WEIGHTS = {
    novelty: 1.00,
    robustness: 0.70,
    capacityAdequacy: 0.70,
    transportCoverage: 0.60,
    weekdayBreadth: 0.40,
    capacityBalance: 0.40
  };

  const clamp01 = x => Math.min(1, Math.max(0, x));

  function familiesOf(childIds, problem) {
    return childIds.map(id => problem.familyOf(id)).filter(Boolean);
  }

  /** S1 - how many of this group's pairs are new? Repeat encounters decay geometrically. */
  function novelty(childIds, problem) {
    let pairs = 0, freshness = 0;
    for (let i = 0; i < childIds.length; i++) {
      for (let j = i + 1; j < childIds.length; j++) {
        pairs++;
        const times = problem.timesTogether(childIds[i], childIds[j]);
        freshness += times === 0 ? 1 : Math.pow(0.35, times);
      }
    }
    return pairs === 0 ? 1 : clamp01(freshness / pairs);
  }

  /** S2 - does the group survive one family dropping out? Hosts and days both count. */
  function robustness(childIds, problem) {
    const size = childIds.length;
    const fams = familiesOf(childIds, problem);
    let hosts = 0;
    fams.forEach(f => {
      if (f.hostCapacity > 0 && (f.canHostOutdoor || f.maxChildrenAtHome >= size - 1)) hosts++;
    });
    const dayCounts = [0, 0, 0, 0, 0, 0];
    fams.forEach(f => f.availableWeekdays.forEach(d => { dayCounts[d]++; }));
    const sharedDays = dayCounts.filter(n => n === fams.length).length;
    return clamp01(0.6 * Math.min(1, hosts / 3) + 0.4 * Math.min(1, sharedDays / 2));
  }

  /** S3 - does declared host capacity cover the round's meetings? */
  function capacityAdequacy(childIds, problem) {
    const supply = familiesOf(childIds, problem).reduce((s, f) => s + f.hostCapacity, 0);
    const needed = problem.meetingsPerGroup || 1;
    return clamp01(supply / needed);
  }

  /**
   * S6 - can the group cover its own transport, or must the parents negotiate it?
   *
   * This used to be a hard requirement, which rejected workable groups outright.
   * As a soft objective it still steers the solver towards groups where the lifts
   * fall into place, while allowing "aftal indbyrdes" where they do not.
   */
  function transportCoverage(childIds, problem) {
    const size = childIds.length;
    if (size <= 1) return 1;
    const supply = familiesOf(childIds, problem).reduce((s, f) => s + f.fetchCapacity, 0);
    return clamp01(supply / (size - 1));
  }

  /** S4 - how many weekdays does the whole group share? */
  function weekdayBreadth(childIds, problem) {
    const fams = familiesOf(childIds, problem);
    if (fams.length === 0) return 0;
    const counts = [0, 0, 0, 0, 0, 0];
    fams.forEach(f => f.availableWeekdays.forEach(d => { counts[d]++; }));
    const shared = counts.filter(n => n === fams.length).length;
    return clamp01(shared / 3);
  }

  /** Mean host capacity per child across the whole class. Cached on the problem. */
  function classTarget(problem) {
    if (problem._capTarget == null) {
      let sum = 0;
      problem.children.forEach(c => {
        const f = problem.familyOf(c.childId);
        sum += f ? f.hostCapacity : 0;
      });
      problem._capTarget = problem.children.length ? sum / problem.children.length : 0;
    }
    return problem._capTarget;
  }

  /** S5 - penalise groups whose capacity per child strays from the class average. */
  function capacityBalance(childIds, problem) {
    const target = classTarget(problem);
    if (target <= 0) return 1;
    const fams = familiesOf(childIds, problem);
    if (fams.length === 0) return 0;
    const mine = fams.reduce((s, f) => s + f.hostCapacity, 0) / fams.length;
    return clamp01(1 - Math.abs(mine - target) / target);
  }

  const OBJECTIVES = { novelty, robustness, capacityAdequacy, transportCoverage,
    weekdayBreadth, capacityBalance };

  /** Weighted mean of all objectives -> { total, parts }. */
  function scoreGroup(childIds, problem, weights) {
    const w = weights || DEFAULT_WEIGHTS;
    const parts = {};
    let sum = 0, weightSum = 0;
    Object.keys(OBJECTIVES).forEach(name => {
      const value = OBJECTIVES[name](childIds, problem);
      parts[name] = value;
      const weight = typeof w[name] === 'number' ? w[name] : 0;
      sum += weight * value;
      weightSum += weight;
    });
    return { total: weightSum > 0 ? sum / weightSum : 0, parts };
  }

  /** What the exact solver minimises. Exact complement of scoreGroup().total. */
  function groupCost(childIds, problem, weights) {
    return 1 - scoreGroup(childIds, problem, weights).total;
  }

  function scoreSolution(solution, problem, weights) {
    const perGroup = (solution.groups || []).map(g => {
      const s = scoreGroup(g.childIds, problem, weights);
      return { id: g.id, total: s.total, parts: s.parts };
    });
    const total = perGroup.length
      ? perGroup.reduce((s, g) => s + g.total, 0) / perGroup.length
      : 0;
    return { total, perGroup };
  }

  const LABELS = {
    novelty: 'børnene har ikke leget sammen før',
    robustness: 'flere familier kan lægge hus til',
    capacityAdequacy: 'der er værter nok til alle møderne',
    transportCoverage: 'gruppen kan selv hente børnene fra skole',
    weekdayBreadth: 'gruppen deler flere hverdage',
    capacityBalance: 'gruppen har en jævn fordeling af overskud'
  };

  /** Danish sentences describing why this group holds together, strongest first. */
  function explainGroup(childIds, problem, weights) {
    const scored = scoreGroup(childIds, problem, weights);
    const parts = scored.parts;
    const ranked = Object.keys(parts)
      .map(name => ({ name: name, value: parts[name] }))
      .sort((a, b) => b.value - a.value);
    const lines = [];
    ranked.slice(0, 2).filter(r => r.value >= 0.6)
      .forEach(r => lines.push('Stærk her: ' + LABELS[r.name] + '.'));
    ranked.slice(-1).filter(r => r.value < 0.4)
      .forEach(r => lines.push('Svag her: ' + LABELS[r.name] + '.'));
    if (lines.length === 0) lines.push('Gruppen er en jævn mellemvare på alle hensyn.');
    return lines;
  }

  return {
    DEFAULT_WEIGHTS: DEFAULT_WEIGHTS, OBJECTIVES: OBJECTIVES, LABELS: LABELS,
    novelty, robustness, capacityAdequacy, transportCoverage,
    weekdayBreadth, capacityBalance,
    scoreGroup, groupCost, scoreSolution, explainGroup
  };
});
