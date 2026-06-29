import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampN, goldRemaining, chestFill, finalePhase, fireActive,
  DRAGON_WAKE_MS, DRAGON_FIRE_MS,
} from '../js/themes/dragon.js';

// ── Gold pile shrinks as progress (elapsed fraction) grows ───────────────────
test('goldRemaining: full hoard at start, empty at completion', () => {
  assert.equal(goldRemaining(0), 1);       // start: full pile
  assert.equal(goldRemaining(0.25), 0.75);
  assert.equal(goldRemaining(0.5), 0.5);
  assert.equal(goldRemaining(1), 0);       // 0:00: gold gone
  assert.equal(goldRemaining(1.5), 0);     // clamped
  assert.equal(goldRemaining(-0.2), 1);    // clamped
});

// ── Chest fills in discrete milestone ticks ──────────────────────────────────
test('chestFill: 0..1 across the 5 milestone ticks', () => {
  assert.equal(chestFill(0, 5), 0);
  assert.equal(chestFill(1, 5), 0.2);
  assert.equal(chestFill(3, 5), 0.6);
  assert.equal(chestFill(5, 5), 1);
  assert.equal(chestFill(7, 5), 1);        // clamped
  assert.equal(chestFill(2, 0), 0);        // guard divide-by-zero
});

// ── Finale pose sequence: sleep → wake → roar ────────────────────────────────
test('finalePhase: asleep until finale, then wake then roar', () => {
  assert.equal(finalePhase(0), 'sleep');
  assert.equal(finalePhase(-10), 'sleep');
  assert.equal(finalePhase(1), 'wake');
  assert.equal(finalePhase(DRAGON_WAKE_MS - 1), 'wake');
  assert.equal(finalePhase(DRAGON_WAKE_MS), 'roar');
  assert.equal(finalePhase(DRAGON_FIRE_MS + 500), 'roar');
});

// ── Fire breath ignites only after the roar winds up ─────────────────────────
test('fireActive: fire begins at DRAGON_FIRE_MS into the finale', () => {
  assert.equal(fireActive(0), false);
  assert.equal(fireActive(DRAGON_WAKE_MS), false);   // roaring, not yet breathing
  assert.equal(fireActive(DRAGON_FIRE_MS - 1), false);
  assert.equal(fireActive(DRAGON_FIRE_MS), true);
  assert.equal(fireActive(DRAGON_FIRE_MS + 2000), true);
  assert.ok(DRAGON_FIRE_MS > DRAGON_WAKE_MS);        // fire after the rear-up
});

test('clampN basic', () => {
  assert.equal(clampN(5, 0, 3), 3);
  assert.equal(clampN(-1, 0, 3), 0);
  assert.equal(clampN(2, 0, 3), 2);
});
