/* Host and fetcher rotation across week numbers. Shared by both solvers.
   Browser: window.LG.Rota   Node: require('./rota.js') */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../model.js'), require('../constraints.js'));
  } else {
    root.LG = Object.assign(root.LG || {}, {
      Rota: factory(root.LG.Model, root.LG.Constraints)
    });
  }
})(typeof self !== 'undefined' ? self : this, function (Model, Constraints) {
  'use strict';

  const DAY_NAMES = { 1: 'mandag', 2: 'tirsdag', 3: 'onsdag', 4: 'torsdag', 5: 'fredag' };

  /** Can this family host a group of `size`, at home or outdoors? */
  function canHost(family, size) {
    if (family.hostCapacity <= 0) return false;
    return family.canHostOutdoor || family.maxChildrenAtHome >= size - 1;
  }

  /** Pick `count` weeks spread as evenly as possible across the available weeks. */
  function spreadWeeks(weeks, count) {
    if (count >= weeks.length) return weeks.slice(0, count);
    const picked = [];
    const step = weeks.length / count;
    for (let i = 0; i < count; i++) picked.push(weeks[Math.floor(i * step)]);
    return picked;
  }

  /**
   * Build the meeting schedule for one group.
   * Returns { meetings, warnings }.
   */
  function buildGroupRota(group, problem, rand) {
    const size = group.childIds.length;
    const families = group.childIds.map(id => problem.familyOf(id)).filter(Boolean);
    const hosts = families.filter(f => canHost(f, size));
    const warnings = [];

    const capacity = hosts.reduce((s, f) => s + f.hostCapacity, 0);
    const wanted = problem.meetingsPerGroup;
    const planned = Math.min(wanted, capacity, problem.weeks.length);

    if (planned < wanted) {
      warnings.push('Gruppe ' + group.id + ' kan kun holde ' + planned + ' af ' + wanted +
        ' møder — familierne har tilsammen kapacitet til ' + capacity + '.');
    }
    if (planned === 0) return { meetings: [], warnings: warnings };

    const weeks = spreadWeeks(problem.weeks, planned);
    const hostCount = {};   // familyId -> times hosted so far
    const fetchCount = {};  // familyId -> times fetched so far
    hosts.forEach(f => { hostCount[f.familyId] = 0; });
    families.forEach(f => { fetchCount[f.familyId] = 0; });

    const meetings = [];

    weeks.forEach(week => {
      // Eligible hosts: capacity left, not on holiday this week.
      const eligible = hosts.filter(f =>
        hostCount[f.familyId] < f.hostCapacity && f.blackoutWeeks.indexOf(week) === -1);
      if (eligible.length === 0) {
        warnings.push('Ingen vært kunne findes til uge ' + week + ' i gruppe ' + group.id + '.');
        return;
      }

      // Furthest below their own declared share goes first. Ties broken deterministically.
      eligible.sort((a, b) => {
        const ra = hostCount[a.familyId] / a.hostCapacity;
        const rb = hostCount[b.familyId] / b.hostCapacity;
        if (ra !== rb) return ra - rb;
        return a.familyId < b.familyId ? -1 : 1;
      });
      const host = eligible[0];

      // The weekday must work for EVERY family in the group - a meeting needs all
      // the children present. Constraints.viableDays is the single source of truth
      // for that, so H4 and the published rota can never disagree.
      const days = Constraints.viableDays(group.childIds, problem)
        .filter(d => host.availableWeekdays.indexOf(d) !== -1);
      if (days.length === 0) {
        warnings.push('Ingen fælles hverdag for gruppe ' + group.id + ' i uge ' + week + '.');
        return;
      }
      const weekday = days[0];

      // Fetchers: available that weekday, capacity > 0, least-used first.
      //
      // Every child in the group has to get from school to the meeting - including
      // the host's own. This used to ask for size - 1 on the reasoning that the
      // host's child was already home, but the child is standing at the school gate
      // like everyone else, and the host collects their own alongside the guests.
      const needed = size;
      const pool = families.filter(f =>
        f.fetchCapacity > 0 && f.availableWeekdays.indexOf(weekday) !== -1);
      pool.sort((a, b) => {
        const d = fetchCount[a.familyId] - fetchCount[b.familyId];
        return d !== 0 ? d : (a.familyId < b.familyId ? -1 : 1);
      });

      const fetchers = [];
      let covered = 0;
      for (const f of pool) {
        if (covered >= needed) break;
        fetchers.push(f.familyId);
        covered += f.fetchCapacity;
      }

      const settled = covered >= needed;
      fetchers.forEach(id => { fetchCount[id] = (fetchCount[id] || 0) + 1; });
      hostCount[host.familyId]++;

      const atHome = host.maxChildrenAtHome >= size - 1;
      meetings.push({
        week: week,
        weekday: weekday,
        weekdayName: DAY_NAMES[weekday],
        hostFamilyId: host.familyId,
        place: atHome ? 'hjemme' : 'ude',
        fetchers: settled ? fetchers : [],
        transport: settled ? 'dækket' : 'aftales',
        transportNote: settled
          ? fetchers.map(id => (problem.familyById(id) || {}).parentName || id).join(' og ') +
            ' henter børnene fra skole.'
          : 'Ingen i gruppen kan hente den dag — aftal indbyrdes, eller mød på skolens legeplads.'
      });
    });

    return { meetings: meetings, warnings: warnings };
  }

  /** Build the rota for every group in a solution. */
  function buildRota(solution, problem, options) {
    const opts = options || {};
    const rand = Model.rng(typeof opts.seed === 'number' ? opts.seed : 1);
    const warnings = [];
    const groups = (solution.groups || []).map(g => {
      const built = buildGroupRota(g, problem, rand);
      built.warnings.forEach(w => warnings.push(w));
      return { id: g.id, childIds: g.childIds.slice(), meetings: built.meetings };
    });
    return { groups: groups, warnings: warnings };
  }

  return { buildRota, buildGroupRota, spreadWeeks, DAY_NAMES };
});
