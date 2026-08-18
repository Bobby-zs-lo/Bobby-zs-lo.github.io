/* Finds the smallest relaxation that would make an infeasible class solvable.
   Browser: window.LG.Infeasibility   Node: require('./infeasibility.js') */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../model.js'), require('./heuristic.js'));
  } else {
    root.LG = Object.assign(root.LG || {}, {
      Infeasibility: factory(root.LG.Model, root.LG.Heuristic)
    });
  }
})(typeof self !== 'undefined' ? self : this, function (Model, Heuristic) {
  'use strict';

  /**
   * Each relaxation rewrites the raw input. H1 is deliberately absent: forbidden
   * pairs are a social decision, not a logistics dial, and must never be suggested.
   * Transport is absent too, for a different reason - it stopped being a hard
   * requirement, so it can no longer be what blocks a class.
   */
  const RELAXATIONS = [
    {
      code: 'H3',
      message: 'Mindst én gruppe kan ikke mødes hjemme hos nogen.',
      action: 'Spørg om én familie kan tage gruppen med på legepladsen eller i parken i stedet.',
      apply: function (input) {
        return Object.assign({}, input, {
          families: input.families.map(f => Object.assign({}, f, {
            meetingPlace: 'both',
            hostCapacity: Math.max(1, parseInt(f.hostCapacity, 10) || 0)
          }))
        });
      }
    },
    {
      code: 'H4',
      message: 'Familierne har ingen fælles hverdag.',
      action: 'Spørg om én familie kan tilføje en ekstra ugedag.',
      apply: function (input) {
        return Object.assign({}, input, {
          families: input.families.map(f => Object.assign({}, f, {
            availableWeekdays: [1, 2, 3, 4, 5]
          }))
        });
      }
    },
    {
      code: 'H2',
      message: 'Klassens størrelse går ikke op i grupper på den valgte størrelse.',
      action: 'Tillad grupper på 3 til 6 børn i stedet.',
      apply: function (input) {
        return Object.assign({}, input, { groupSizeMin: 3, groupSizeMax: 6 });
      }
    }
  ];

  /** Cheap feasibility probe: can the heuristic find any valid solution at all? */
  function solvable(input, budget) {
    const problem = Model.buildProblem(input);
    const result = Heuristic.solve(problem, { seed: 1, timeBudgetMs: budget });
    return result.status === 'ok';
  }

  /**
   * Try no relaxation, then each single one, then each pair. Returns the smallest
   * set that works, with Danish prose the admin can act on.
   */
  function diagnose(problem, options) {
    const opts = options || {};
    const total = typeof opts.timeBudgetMs === 'number' ? opts.timeBudgetMs : 4000;
    const input = problem._input;
    const probe = Math.max(60, Math.floor(total / (RELAXATIONS.length * 2 + 2)));

    if (solvable(input, probe)) {
      return { needsRelaxation: false, relaxations: [], summary: 'Klassen kan gå op som den er.' };
    }

    for (const r of RELAXATIONS) {
      if (solvable(r.apply(input), probe)) {
        return {
          needsRelaxation: true,
          relaxations: [{ code: r.code, message: r.message, action: r.action }],
          summary: r.message + ' ' + r.action
        };
      }
    }

    for (let i = 0; i < RELAXATIONS.length; i++) {
      for (let j = i + 1; j < RELAXATIONS.length; j++) {
        const combined = RELAXATIONS[j].apply(RELAXATIONS[i].apply(input));
        if (solvable(combined, probe)) {
          const pair = [RELAXATIONS[i], RELAXATIONS[j]];
          return {
            needsRelaxation: true,
            relaxations: pair.map(r => ({ code: r.code, message: r.message, action: r.action })),
            summary: 'Der skal to ting til: ' + pair.map(r => r.action).join(' Og: ')
          };
        }
      }
    }

    return {
      needsRelaxation: true,
      relaxations: RELAXATIONS.map(r => ({ code: r.code, message: r.message, action: r.action })),
      summary: 'Klassen kan ikke gå op, selv hvis alle logistiske krav lempes. ' +
        'Se om der er for mange forbudte par, eller om for få familier har svaret.'
    };
  }

  return { diagnose, RELAXATIONS };
});
