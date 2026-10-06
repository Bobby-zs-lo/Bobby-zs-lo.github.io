import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampN, chronoEra, topBulbFill, bottomBulbFill, bigBangScale,
  finalePhase, CHRONO_BANG_MS, CHRONO_FINALE_TOTAL_MS,
} from '../js/themes/alchemy.js';

test('chronoEra: rewinds Earth history backwards towards the cosmic origin', () => {
  assert.equal(chronoEra(0), 'modern_cyber');
  assert.equal(chronoEra(0.19), 'modern_cyber');
  assert.equal(chronoEra(0.20), 'victorian_steam');
  assert.equal(chronoEra(0.39), 'victorian_steam');
  assert.equal(chronoEra(0.40), 'ancient_egypt');
  assert.equal(chronoEra(0.59), 'ancient_egypt');
  assert.equal(chronoEra(0.60), 'jurassic_dinosaurs');
  assert.equal(chronoEra(0.79), 'jurassic_dinosaurs');
  assert.equal(chronoEra(0.80), 'primordial_earth');
  assert.equal(chronoEra(0.94), 'primordial_earth');
  assert.equal(chronoEra(0.95), 'singularity_pre_bang');
  assert.equal(chronoEra(1.0), 'singularity_pre_bang');
});

test('topBulbFill & bottomBulbFill: hourglass flows in reverse, rewinding entropy', () => {
  // At start, bottom is full (1), top is empty (0)
  assert.equal(topBulbFill(0), 0);
  assert.equal(bottomBulbFill(0), 1);

  // At midpoint, half each
  assert.equal(topBulbFill(0.5), 0.5);
  assert.equal(bottomBulbFill(0.5), 0.5);

  // At completion, top is full (1), bottom is empty (0)
  assert.equal(topBulbFill(1), 1);
  assert.equal(bottomBulbFill(1), 0);
});

test('bigBangScale: zero before detonation, then expands smoothly to maximum cosmic scale', () => {
  assert.equal(bigBangScale(0, 1.8), 0);
  assert.equal(bigBangScale(CHRONO_BANG_MS - 1, 1.8), 0);
  const mid = bigBangScale(CHRONO_BANG_MS + 800, 1.8);
  assert.ok(mid > 0 && mid < 1.8);
  assert.equal(Math.round(bigBangScale(CHRONO_BANG_MS + 1600, 1.8) * 10) / 10, 1.8);
});

test('finalePhase: transitions through singularity collapse, the Big Bang, and cosmic dawn to done', () => {
  assert.equal(finalePhase(-1), 'idle');
  assert.equal(finalePhase(0), 'singularity_collapse');
  assert.equal(finalePhase(CHRONO_BANG_MS), 'the_big_bang');
  assert.equal(finalePhase(2500), 'cosmic_dawn');
  assert.equal(finalePhase(CHRONO_FINALE_TOTAL_MS), 'done');
});
