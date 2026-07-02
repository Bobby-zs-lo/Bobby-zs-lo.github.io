import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  N_SEG, segmentsPlaced, ghostCount, crossT,
  CROSS_START_MS, CROSS_MS,
} from '../js/themes/bridge.js';

test('segmentsPlaced maps progress to solid segments, reserving the last slot', () => {
  assert.equal(segmentsPlaced(0), 0);
  assert.equal(segmentsPlaced(0.05), 0);
  assert.equal(segmentsPlaced(0.1), 1);
  assert.equal(segmentsPlaced(0.55), 5);
  assert.equal(segmentsPlaced(0.999), N_SEG - 1);  // last slot waits for the finale
  assert.equal(segmentsPlaced(1), N_SEG);          // finale locks it in
});

test('ghostCount is the remaining-time complement of placed segments', () => {
  assert.equal(ghostCount(0), N_SEG);
  assert.equal(ghostCount(4), N_SEG - 4);
  assert.equal(ghostCount(N_SEG), 0);
  assert.equal(ghostCount(N_SEG + 5), 0);          // clamped
});

test('crossT: hero crossing parameter clamps to 0..1 across the finale window', () => {
  assert.equal(crossT(0), 0);
  assert.equal(crossT(CROSS_START_MS), 0);
  assert.equal(crossT(CROSS_START_MS + CROSS_MS / 2), 0.5);
  assert.equal(crossT(CROSS_START_MS + CROSS_MS), 1);
  assert.equal(crossT(CROSS_START_MS + CROSS_MS * 3), 1);
});
