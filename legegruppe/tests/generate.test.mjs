/* Run: node legegruppe/tests/generate.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../js/model.js');
import { generateClass, PROFILES } from './generate.mjs';

// --- deterministic from the seed alone ---
const a = generateClass({ seed: 123, childCount: 24 });
const b = generateClass({ seed: 123, childCount: 24 });
assert.deepEqual(a, b);
assert.notDeepEqual(a, generateClass({ seed: 124, childCount: 24 }));

// --- shape ---
assert.equal(a.children.length, 24);
assert.equal(a.families.length, 24);
assert.equal(a.groupSizeMin, 4);
assert.equal(a.groupSizeMax, 5);
assert.ok(a.weeks.length >= 6);

// --- it builds into a valid problem ---
const p = M.buildProblem(a);
assert.equal(p.children.length, 24);
assert.ok(p.familyOf('k0'));

// --- every named profile produces a class ---
Object.keys(PROFILES).forEach(name => {
  const cls = generateClass({ seed: 7, childCount: 24, profile: name });
  assert.equal(cls.children.length, 24, name);
  assert.equal(cls.families.length, 24, name);
  cls.families.forEach(f => {
    assert.ok(f.hostCapacity >= 0 && f.hostCapacity <= 3, name);
    assert.ok(f.fetchCapacity >= 0 && f.fetchCapacity <= 5, name);
    assert.ok(Array.isArray(f.availableWeekdays), name);
  });
});

// --- the adversarial profiles really are adversarial ---
const thursday = generateClass({ seed: 1, childCount: 24, profile: 'onlyThursday' });
thursday.families.forEach(f => assert.deepEqual(f.availableWeekdays, [4]));

const noDrivers = generateClass({ seed: 1, childCount: 24, profile: 'noDrivers' });
const canFetch = noDrivers.families.filter(f => f.fetchCapacity > 0).length;
assert.ok(canFetch <= 2, 'noDrivers should leave at most two fetching families');

const noHosts = generateClass({ seed: 1, childCount: 24, profile: 'fewHosts' });
assert.ok(noHosts.families.filter(f => f.hostCapacity > 0).length <= 12);

// --- history can be seeded from previous rounds ---
const withHistory = generateClass({ seed: 5, childCount: 24, previousRounds: 2 });
assert.ok(withHistory.history.length > 0);
withHistory.history.forEach(h => {
  assert.ok(typeof h.childA === 'string' && typeof h.childB === 'string');
  assert.notEqual(h.childA, h.childB);
});

// --- blocked pairs can be injected ---
const withBlocks = generateClass({ seed: 5, childCount: 24, blockedPairCount: 3 });
assert.equal(withBlocks.blockedPairs.length, 3);
withBlocks.blockedPairs.forEach(pair => assert.notEqual(pair[0], pair[1]));

console.log('ok - generate');
