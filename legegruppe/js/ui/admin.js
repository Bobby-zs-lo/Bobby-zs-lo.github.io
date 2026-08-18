/* Admin console logic. Pure — the page wires these to elements.
   Browser: window.LG.Admin   Node: require('./admin.js') */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LG = Object.assign(root.LG || {}, { Admin: factory() });
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Families that have not filled in the questionnaire yet. */
  function missingResponses(snapshot) {
    return (snapshot.families || []).filter(f => !f.consentAt && !f.updatedAt);
  }

  /**
   * Families who changed their answers after the current round went live.
   * The plan is never rebuilt automatically — nobody should discover on a Tuesday
   * morning that their group changed. The admin decides. See spec section 10.
   */
  function changedSincePublish(snapshot) {
    const published = (snapshot.rounds || [])
      .filter(r => r.status === 'published' && r.publishedAt)
      .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))[0];
    if (!published) return [];
    return (snapshot.families || []).filter(f =>
      f.updatedAt && String(f.updatedAt) > String(published.publishedAt));
  }

  /** Ready-to-paste reminder for Aula. Names only those who still owe an answer. */
  function reminderText(snapshot) {
    const missing = missingResponses(snapshot);
    if (missing.length === 0) {
      return 'Alle har svaret. Så er vi klar til at danne legegrupperne.';
    }
    const names = missing.map(f => f.parentName || 'en familie');
    const who = names.length === 1
      ? names[0]
      : names.slice(0, -1).join(', ') + ' og ' + names[names.length - 1];
    return 'Hej alle. Vi mangler stadig svar fra ' + who + ' til legegrupperne. ' +
      'Det tager under to minutter, og I har fået jeres personlige link tidligere. ' +
      'Skriv til mig hvis I har mistet det, så sender jeg et nyt.';
  }

  /** Inclusive week range that wraps across the new year. */
  function weekRange(from, to) {
    const weeks = [];
    let week = from;
    for (let guard = 0; guard < 60; guard++) {
      weeks.push(week);
      if (week === to) break;
      week = week >= 53 ? 1 : week + 1;
    }
    return weeks;
  }

  /** Move a child to another group. Returns new arrays; never mutates. */
  function moveChild(groups, childId, targetIndex) {
    const currentIndex = groups.findIndex(g => g.childIds.indexOf(childId) !== -1);
    if (currentIndex === -1 || currentIndex === targetIndex) return groups;
    return groups.map(function (g, i) {
      if (i === currentIndex) {
        return Object.assign({}, g, { childIds: g.childIds.filter(id => id !== childId) });
      }
      if (i === targetIndex) {
        return Object.assign({}, g, { childIds: g.childIds.concat([childId]) });
      }
      return g;
    });
  }

  /** Pin the listed children to wherever they currently sit. */
  function locksFrom(groups, lockedChildIds) {
    return (lockedChildIds || []).map(childId => ({
      childId: childId,
      groupIndex: groups.findIndex(g => g.childIds.indexOf(childId) !== -1)
    })).filter(l => l.groupIndex !== -1);
  }

  /** Slider strings → numeric weights. */
  function readWeights(values) {
    const weights = {};
    Object.keys(values || {}).forEach(function (name) {
      const n = parseFloat(values[name]);
      weights[name] = Number.isFinite(n) ? n : 0;
    });
    return weights;
  }

  function publishPayload(state) {
    return {
      result: state.result,
      weeks: state.weeks,
      meetingsPerGroup: state.meetingsPerGroup,
      groupSizeMin: state.groupSizeMin,
      groupSizeMax: state.groupSizeMax,
      solver: state.solver,
      weights: state.weights
    };
  }

  /** Publishing requires a solved round that the independent verifier signed off. */
  function canPublish(result) {
    if (!result) return false;
    if (result.status !== 'ok') return false;
    return Array.isArray(result.verification) && result.verification.length === 0;
  }

  function publishBlockReason(result) {
    if (!result) return 'Kør en runde først.';
    if (result.status === 'infeasible') {
      return (result.diagnosis && result.diagnosis.summary) ||
        'Der findes ingen gyldig opdeling med de nuværende svar.';
    }
    if (result.verification && result.verification.length) {
      return 'Planen bryder et hårdt krav og kan ikke udgives: ' +
        result.verification.map(v => v.message).join(' ');
    }
    return 'Planen er ikke klar til udgivelse.';
  }

  return { missingResponses, changedSincePublish, reminderText, weekRange, moveChild,
    locksFrom, readWeights, publishPayload, canPublish, publishBlockReason };
});
