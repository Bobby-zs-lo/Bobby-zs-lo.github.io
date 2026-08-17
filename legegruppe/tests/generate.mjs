/* Seeded synthetic class generator for the simulation harness. ESM. */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../js/model.js');

const NAMES = ['Alma', 'Bo', 'Carla', 'Dagmar', 'Emil', 'Freja', 'Gustav', 'Hannah',
  'Ida', 'Jonas', 'Karla', 'Lucas', 'Malou', 'Noah', 'Olivia', 'Pelle', 'Quinn',
  'Rosa', 'Storm', 'Tilde', 'Ursula', 'Villads', 'William', 'Xenia', 'Yrsa', 'Zakarias',
  'Astrid', 'Birk', 'Clara', 'Dicte', 'Elliot', 'Filippa', 'Gry', 'Halfdan', 'Iben',
  'Jens', 'Kaya', 'Liva', 'Merle', 'Nanna'];

const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];

/** Draw from a weighted distribution given as [[value, weight], ...]. */
function weighted(rand, pairs) {
  const total = pairs.reduce((s, p) => s + p[1], 0);
  let roll = rand() * total;
  for (const [value, weight] of pairs) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return pairs[pairs.length - 1][0];
}

/**
 * A random subset of the working week.
 * Deliberately generous: H4 requires a weekday shared by EVERY family in a group,
 * so if each of five families were free on only half the week, almost no group
 * could ever meet and the simulation would measure nothing but its own generator.
 * Real parents can usually do most weekdays; the hostile profiles below are where
 * scarcity is tested on purpose.
 */
function someWeekdays(rand, minDays) {
  const days = [1, 2, 3, 4, 5].filter(() => rand() < 0.8);
  while (days.length < (minDays || 1)) {
    const d = 1 + Math.floor(rand() * 5);
    if (days.indexOf(d) === -1) days.push(d);
  }
  return days.sort((a, b) => a - b);
}

/**
 * Named parent-population profiles. `realistic` is the default and is modelled on
 * a normal Danish class; the rest exist to prove the app degrades gracefully.
 */
export const PROFILES = {
  realistic: (rand) => ({
    hostCapacity: weighted(rand, [[0, 15], [1, 30], [2, 40], [3, 15]]),
    maxChildrenAtHome: weighted(rand, [[0, 8], [2, 12], [3, 25], [4, 35], [5, 20]]),
    availableWeekdays: someWeekdays(rand, 3),
    fetchCapacity: weighted(rand, [[0, 20], [1, 15], [2, 25], [3, 25], [4, 15]]),
    meetingPlace: weighted(rand, [['home', 70], ['both', 20], ['outdoor', 10]])
  }),
  generous: (rand) => ({
    hostCapacity: weighted(rand, [[2, 40], [3, 60]]),
    maxChildrenAtHome: weighted(rand, [[4, 40], [5, 60]]),
    availableWeekdays: someWeekdays(rand, 3),
    fetchCapacity: weighted(rand, [[3, 40], [4, 60]]),
    meetingPlace: 'both'
  }),
  strained: (rand) => ({
    hostCapacity: weighted(rand, [[0, 45], [1, 40], [2, 15]]),
    maxChildrenAtHome: weighted(rand, [[0, 30], [2, 30], [3, 25], [4, 15]]),
    availableWeekdays: someWeekdays(rand, 1),
    fetchCapacity: weighted(rand, [[0, 40], [1, 25], [2, 25], [3, 10]]),
    meetingPlace: weighted(rand, [['home', 60], ['both', 25], ['outdoor', 15]])
  }),
  onlyThursday: (rand) => ({
    hostCapacity: weighted(rand, [[1, 50], [2, 50]]),
    maxChildrenAtHome: 4,
    availableWeekdays: [4],
    fetchCapacity: weighted(rand, [[2, 50], [3, 50]]),
    meetingPlace: 'home'
  }),
  noDrivers: (rand, i) => ({
    hostCapacity: weighted(rand, [[1, 50], [2, 50]]),
    maxChildrenAtHome: 4,
    availableWeekdays: someWeekdays(rand, 2),
    fetchCapacity: i < 2 ? 4 : 0,
    meetingPlace: 'home'
  }),
  fewHosts: (rand, i) => ({
    hostCapacity: i < 6 ? 3 : 0,
    maxChildrenAtHome: i < 6 ? 5 : 0,
    availableWeekdays: someWeekdays(rand, 2),
    fetchCapacity: weighted(rand, [[2, 50], [3, 50]]),
    meetingPlace: 'home'
  })
};

/**
 * Generate a class. Returns a plain object ready for Model.buildProblem().
 * options: { seed, childCount, profile, previousRounds, blockedPairCount,
 *            weeks, meetingsPerGroup }
 */
export function generateClass(options) {
  const opts = options || {};
  const rand = M.rng(opts.seed || 1);
  const count = opts.childCount || 24;
  const profileName = opts.profile || 'realistic';
  const profile = PROFILES[profileName] || PROFILES.realistic;

  const children = [], families = [];
  for (let i = 0; i < count; i++) {
    const traits = profile(rand, i);
    children.push({
      childId: 'k' + i,
      familyId: 'f' + i,
      name: NAMES[i % NAMES.length] + (i >= NAMES.length ? ' ' + i : '')
    });
    families.push(Object.assign({
      familyId: 'f' + i,
      classId: 'sim',
      parentName: 'Forælder ' + i,
      contact: 'f' + i + '@example.dk',
      consentAt: '2026-08-01T09:00:00Z',
      blackoutWeeks: rand() < 0.25 ? [42, 43] : [],
      note: ''
    }, traits));
  }

  // History: simulate previous rounds by partitioning the class at random.
  const history = [];
  for (let round = 0; round < (opts.previousRounds || 0); round++) {
    const order = children.map(c => c.childId);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    for (let start = 0; start + 4 <= order.length; start += 4) {
      const group = order.slice(start, start + 4);
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++)
          history.push({ childA: group[i], childB: group[j] });
    }
  }

  const blockedPairs = [];
  const used = new Set();
  while (blockedPairs.length < (opts.blockedPairCount || 0)) {
    const a = pick(rand, children).childId;
    const b = pick(rand, children).childId;
    if (a === b) continue;
    const key = M.pairKey(a, b);
    if (used.has(key)) continue;
    used.add(key);
    blockedPairs.push([a, b]);
  }

  return {
    classId: 'sim',
    profile: profileName,
    seed: opts.seed || 1,
    children: children,
    families: families,
    blockedPairs: blockedPairs,
    history: history,
    groupSizeMin: 4,
    groupSizeMax: 5,
    weeks: opts.weeks || [34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45],
    meetingsPerGroup: opts.meetingsPerGroup || 6
  };
}
