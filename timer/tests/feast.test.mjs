import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEM_COUNT, itemsEaten, eatPhase, bellyStage, eatAction } from '../js/themes/feast.js';

test('itemsEaten: 14 fixed items over progress', () => {
  assert.equal(itemsEaten(0), 0);
  assert.equal(itemsEaten(1 / 14 - 1e-6), 0);
  assert.equal(itemsEaten(1 / 14 + 1e-6), 1);
  assert.equal(itemsEaten(0.5), 7);
  assert.equal(itemsEaten(1), ITEM_COUNT);
  assert.equal(itemsEaten(1.01), ITEM_COUNT);   // clamp
  assert.equal(itemsEaten(-0.1), 0);            // clamp
});

test('eatPhase: 0..1 within active item, 1 at boundaries', () => {
  assert.equal(eatPhase(0), 0);
  assert.ok(Math.abs(eatPhase(0.5 / 14) - 0.5) < 1e-9);
  assert.equal(eatPhase(1), 1);
});

test('bellyStage: 4 stages, clamped', () => {
  assert.equal(bellyStage(0), 0);
  assert.equal(bellyStage(0.26), 1);
  assert.equal(bellyStage(0.55), 2);
  assert.equal(bellyStage(0.8), 3);
  assert.equal(bellyStage(1), 3);   // clamp at final stage
});

test('eatAction phases', () => {
  assert.equal(eatAction(0.1), 'lean');
  assert.equal(eatAction(0.5), 'chew');
  assert.equal(eatAction(0.9), 'swallow');
});
