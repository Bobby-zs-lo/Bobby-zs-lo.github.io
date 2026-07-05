import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEM_COUNT, itemsEaten, eatPhase, bellyStage, eatAction, EAT_ORDER, eatOrder } from '../js/themes/feast.js';

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

test('EAT_ORDER is a permutation of all 14 slots', () => {
  assert.equal(EAT_ORDER.length, ITEM_COUNT);
  assert.deepEqual([...EAT_ORDER].sort((a, b) => a - b),
    [...Array(ITEM_COUNT).keys()]);
});

test('ketchup (slot 13) is always eaten last', () => {
  assert.equal(EAT_ORDER[ITEM_COUNT - 1], 13);
  assert.equal(eatOrder(ITEM_COUNT - 1), 13);
});

test('front arc is eaten before mid, mid before back (visible progress)', () => {
  const rank = [];
  EAT_ORDER.forEach((slot, k) => { rank[slot] = k; });
  // front slots 10..12 rank before every mid slot 5..9 (13 = ketchup, last)
  for (const f of [10, 11, 12]) {
    for (let m = 5; m <= 9; m++) assert.ok(rank[f] < rank[m], `front ${f} before mid ${m}`);
  }
  // mid slots rank before every back slot 0..4
  for (let m = 5; m <= 9; m++) {
    for (let b = 0; b <= 4; b++) assert.ok(rank[m] < rank[b], `mid ${m} before back ${b}`);
  }
});

test('eatOrder clamps out-of-range k', () => {
  assert.equal(eatOrder(-1), EAT_ORDER[0]);
  assert.equal(eatOrder(99), EAT_ORDER[ITEM_COUNT - 1]);
});
