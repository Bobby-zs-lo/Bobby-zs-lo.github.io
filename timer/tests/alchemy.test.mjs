import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampN, topBulbFill, bottomBulbFill, alchemyPhase, lotusBloomScale,
  finalePhase, ALCHEMY_BLOOM_MS, ALCHEMY_FINALE_TOTAL_MS,
} from '../js/themes/alchemy.js';

test('topBulbFill / bottomBulbFill: liquid drains from top to bottom perfectly', () => {
  assert.equal(topBulbFill(0), 1);
  assert.equal(bottomBulbFill(0), 0);

  assert.equal(topBulbFill(0.5), 0.5);
  assert.equal(bottomBulbFill(0.5), 0.5);

  assert.equal(topBulbFill(1), 0);
  assert.equal(bottomBulbFill(1), 1);
});

test('alchemyPhase: progresses through reservoir, transmutation, crucible, mandalas, critical_drop', () => {
  assert.equal(alchemyPhase(0), 'reservoir');
  assert.equal(alchemyPhase(0.24), 'reservoir');
  assert.equal(alchemyPhase(0.25), 'transmutation');
  assert.equal(alchemyPhase(0.49), 'transmutation');
  assert.equal(alchemyPhase(0.50), 'crucible');
  assert.equal(alchemyPhase(0.74), 'crucible');
  assert.equal(alchemyPhase(0.75), 'mandalas');
  assert.equal(alchemyPhase(0.94), 'mandalas');
  assert.equal(alchemyPhase(0.95), 'critical_drop');
  assert.equal(alchemyPhase(1.0), 'critical_drop');
});

test('lotusBloomScale: zero before bloom time, expands smoothly to max', () => {
  assert.equal(lotusBloomScale(0, 1.5), 0);
  assert.equal(lotusBloomScale(ALCHEMY_BLOOM_MS - 1, 1.5), 0);
  const mid = lotusBloomScale(ALCHEMY_BLOOM_MS + 800, 1.5);
  assert.ok(mid > 0 && mid < 1.5);
  assert.equal(Math.round(lotusBloomScale(ALCHEMY_BLOOM_MS + 1600, 1.5) * 10) / 10, 1.5);
});

test('finalePhase: transitions through impact, bloom, settle to done', () => {
  assert.equal(finalePhase(-1), 'idle');
  assert.equal(finalePhase(0), 'impact_flash');
  assert.equal(finalePhase(ALCHEMY_BLOOM_MS), 'lotus_bloom');
  assert.equal(finalePhase(2500), 'mandala_settle');
  assert.equal(finalePhase(ALCHEMY_FINALE_TOTAL_MS), 'done');
});
