import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampN, oceanDepth, depthZone, ambientDarkness, leviathanAscent, submersibleEaten,
  finalePhase, ABYSS_CHOMP_MS, ABYSS_FINALE_TOTAL_MS,
} from '../js/themes/abyss.js';

test('oceanDepth: maps progress smoothly from surface (0m) to trench (11,000m)', () => {
  assert.equal(oceanDepth(0), 0);
  assert.equal(oceanDepth(0.5), 5500);
  assert.equal(oceanDepth(1.0), 11000);
  assert.equal(oceanDepth(-0.2), 0);
  assert.equal(oceanDepth(1.5), 11000);
});

test('depthZone: categorizes oceanic zones from surface shallows to leviathan stalk', () => {
  assert.equal(depthZone(0), 'surface_shallows');
  assert.equal(depthZone(0.24), 'surface_shallows');
  assert.equal(depthZone(0.25), 'twilight_kraken');
  assert.equal(depthZone(0.49), 'twilight_kraken');
  assert.equal(depthZone(0.50), 'atlantis_ruins');
  assert.equal(depthZone(0.74), 'atlantis_ruins');
  assert.equal(depthZone(0.75), 'abyssal_trench');
  assert.equal(depthZone(0.94), 'abyssal_trench');
  assert.equal(depthZone(0.95), 'leviathan_stalk');
  assert.equal(depthZone(1.0), 'leviathan_stalk');
});

test('ambientDarkness: darkness deepens with depth', () => {
  assert.equal(ambientDarkness(0), 0);
  assert.ok(ambientDarkness(0.5) > 0.4);
  assert.equal(ambientDarkness(1.0), 0.92);
});

test('leviathanAscent & submersibleEaten: jaws surge upward then chomp the diving bell', () => {
  assert.equal(leviathanAscent(0, 100), 0);
  const mid = leviathanAscent(350, 100);
  assert.ok(mid > 0 && mid < 100);
  assert.equal(Math.round(leviathanAscent(700, 100)), 100);

  assert.equal(submersibleEaten(0), false);
  assert.equal(submersibleEaten(ABYSS_CHOMP_MS - 1), false);
  assert.equal(submersibleEaten(ABYSS_CHOMP_MS), true);
  assert.equal(submersibleEaten(ABYSS_CHOMP_MS + 500), true);
});

test('finalePhase: moves through jaws_open, leviathan_chomp, into_the_belly, abyss_reclaims, to done', () => {
  assert.equal(finalePhase(-1), 'idle');
  assert.equal(finalePhase(0), 'jaws_open');
  assert.equal(finalePhase(ABYSS_CHOMP_MS), 'leviathan_chomp');
  assert.equal(finalePhase(1800), 'into_the_belly');
  assert.equal(finalePhase(3500), 'abyss_reclaims');
  assert.equal(finalePhase(ABYSS_FINALE_TOTAL_MS), 'done');
});
