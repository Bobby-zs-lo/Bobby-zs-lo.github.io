/* Hard requirements H1-H4 plus an independent whole-solution verifier.
   Transport is NOT a hard requirement - see viableDays for why.
   Browser: window.LG.Constraints   Node: require('./constraints.js') */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LG = Object.assign(root.LG || {}, { Constraints: factory() });
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const v = (code, message) => ({ code, message });

  /** Families of the children in a group, in the same order. */
  function familiesOf(childIds, problem) {
    return childIds.map(id => problem.familyOf(id)).filter(Boolean);
  }

  /** Can this family host a group of `size` — at home, or outdoors? */
  function canHost(family, size) {
    if (family.hostCapacity <= 0) return false;
    if (family.canHostOutdoor) return true;
    return family.maxChildrenAtHome >= size - 1; // own child is already home
  }

  /** Weekdays on which `family` is available, as a Set. */
  function daysOf(family) {
    return new Set(family.availableWeekdays);
  }

  /**
   * Is there a weekday on which every family can take part and at least one of
   * them can host? Returns the viable days.
   *
   * Transport is deliberately NOT part of this test. A group where nobody can
   * collect the children from school is still a workable group - the parents
   * arrange the lifts between themselves, or meet at the school playground.
   * Making it a hard requirement rejected groups that would have been fine.
   * The rota marks such meetings 'aftales', and scoring still prefers groups
   * where the transport falls into place on its own.
   */
  function viableDays(childIds, problem) {
    const fams = familiesOf(childIds, problem);
    const size = childIds.length;
    const days = [];
    for (let d = 1; d <= 5; d++) {
      // Every family in the group must be available that day — a child whose
      // own family cannot do weekday d does not attend, regardless of who
      // might otherwise host or fetch.
      if (!fams.every(f => daysOf(f).has(d))) continue;
      const hosts = fams.filter(f => canHost(f, size));
      if (hosts.length === 0) continue;
      days.push(d);
    }
    return days;
  }

  /** Check one candidate group against H1-H4. Pure; no side effects. */
  function groupFeasibility(childIds, problem) {
    const violations = [];
    const size = childIds.length;

    // H2 — size
    if (size < problem.groupSizeMin || size > problem.groupSizeMax) {
      violations.push(v('H2', 'Gruppen har ' + size + ' børn. Den skal have mellem ' +
        problem.groupSizeMin + ' og ' + problem.groupSizeMax + '.'));
    }

    // H1 — blocked pairs
    for (let i = 0; i < childIds.length; i++) {
      for (let j = i + 1; j < childIds.length; j++) {
        if (problem.isBlocked(childIds[i], childIds[j])) {
          const a = (problem.childById.get(childIds[i]) || {}).name || childIds[i];
          const b = (problem.childById.get(childIds[j]) || {}).name || childIds[j];
          violations.push(v('H1', a + ' og ' + b + ' må ikke være i samme gruppe.'));
        }
      }
    }

    const fams = familiesOf(childIds, problem);

    // H3 — at least one possible host
    const hosts = fams.filter(f => canHost(f, size));
    if (hosts.length === 0) {
      violations.push(v('H3', 'Ingen familie i gruppen kan afholde et møde — hverken hjemme eller ude.'));
    }

    // H4 — a weekday that works for a host and the fetchers at the same time
    const days = viableDays(childIds, problem);
    if (days.length === 0 && hosts.length > 0) {
      violations.push(v('H4', 'Der er ingen hverdag hvor alle familier i gruppen kan.'));
    }

    return { ok: violations.length === 0, violations, viableDays: days, possibleHosts: hosts.length };
  }

  /**
   * Independent audit of a complete solution. Deliberately re-derives everything
   * rather than trusting the solver, and additionally checks that every child is
   * covered exactly once.
   */
  function verifySolution(solution, problem) {
    const violations = [];
    const seen = new Map();

    (solution.groups || []).forEach(g => {
      (g.childIds || []).forEach(id => seen.set(id, (seen.get(id) || 0) + 1));
      groupFeasibility(g.childIds || [], problem).violations.forEach(x => {
        violations.push({ code: x.code, groupId: g.id, message: x.message });
      });
    });

    problem.children.forEach(c => {
      const n = seen.get(c.childId) || 0;
      if (n !== 1) {
        violations.push({
          code: 'COVER', groupId: null,
          message: (c.name || c.childId) + ' optræder i ' + n + ' grupper. Hvert barn skal være i præcis én.'
        });
      }
    });

    seen.forEach((_, id) => {
      if (!problem.childById.has(id)) {
        violations.push({ code: 'COVER', groupId: null, message: 'Ukendt barn i løsningen: ' + id });
      }
    });

    return violations;
  }

  return { groupFeasibility, verifySolution, canHost, viableDays };
});
