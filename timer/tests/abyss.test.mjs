import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampN, oceanDepth, depthZone, ambientDarkness, leviathanAscent,
  finalePhase, ABYSS_EMERGE_MS, ABYSS_FINALE_TOTAL_MS,
} from '../js/themes/abyss.js';

test('oceanDepth: maps progress smoothly from surface (0m) to trench (11,000m)', () => {
  assert.equal(oceanDepth(0), 0);
  assert.equal(oceanDepth(0.5), 5500);
  assert.equal(oceanDepth(1.0), 11000);
  assert.equal(oceanDepth(-0.2), 0);
  assert.equal(oceanDepth(1.5), 11000);
});

test('depthZone: categorizes oceanic zones from sunlit to awakening', () => {
  assert.equal(depthZone(0), 'sunlit');
  assert.equal(depthZone(0.24), 'sunlit');
  assert.equal(depthZone(0.25), 'twilight');
  assert.equal(depthZone(0.49), 'twilight');
  assert.equal(depthZone(0.50), 'midnight');
  assert.equal(depthZone(0.74), 'midnight');
  assert.equal(depthZone(0.75), 'hadal');
  assert.equal(depthZone(0.94), 'hadal');
  assert.equal(depthZone(0.95), 'awakening');
  assert.equal(depthZone(1.0), 'awakening');
});

test('ambientDarkness: darkness deepens with depth', () => {
  assert.equal(ambientDarkness(0), 0);
  assert.ok(ambientDarkness(0.5) > 0.4);
  assert.equal(ambientDarkness(1.0), 0.92);
});

test('leviathanAscent: zero before emergence, rises to max height', () => {
  assert.equal(leviathanAscent(0, 100), 0);
  assert.equal(leviathanAscent(ABYSS_EMERGE_MS - 1, 100), 0);
  const mid = leviathanAscent(ABYSS_EMERGE_MS + 900, 100);
  assert.ok(mid > 0 && mid < 100);
  assert.equal(Math.round(leviathanAscent(ABYSS_EMERGE_MS + 1800, 100)), 100);
});

test('finalePhase: moves through rumble, rise, bloom, done', () => {
  assert.equal(finalePhase(-1), 'idle');
  assert.equal(finalePhase(0), 'trench_rumble');
  assert.equal(finalePhase(ABYSS_EMERGE_MS), 'leviathan_rise');
  assert.equal(finalePhase(2500), 'bioluminescence_bloom');
  assert.equal(finalePhase(ABYSS_FINALE_TOTAL_MS), 'done');
});
