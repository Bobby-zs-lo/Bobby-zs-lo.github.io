import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appleCountForDuration, eatState, cellForApple, gridDims, clampN,
} from '../js/themes/mouse.js';

test('appleCountForDuration: ~1 apple per 10s, clamped 5..48', () => {
  assert.equal(appleCountForDuration(60_000), 6);     // 1 min -> 6
  assert.equal(appleCountForDuration(10_000), 5);     // below min -> 5
  assert.equal(appleCountForDuration(0), 5);          // floor at 5
  assert.equal(appleCountForDuration(300_000), 30);   // 5 min -> 30
  assert.equal(appleCountForDuration(3_600_000), 48); // cap at 48
});

test('eatState: apples deplete with progress; active = -1 when done', () => {
  const A = 6;
  assert.deepEqual(eatState(0, A), { eaten: 0, active: 0 });
  assert.deepEqual(eatState(0.5, A), { eaten: 3, active: 3 });
  assert.deepEqual(eatState(0.99, A), { eaten: 5, active: 5 });
  assert.deepEqual(eatState(1, A), { eaten: 6, active: -1 });
});

test('cellForApple: reverse eat order — last apple first, cell 1 last', () => {
  const A = 6;
  assert.equal(cellForApple(0, A), 6);   // first eaten = highest cell
  assert.equal(cellForApple(5, A), 1);   // last eaten = cell next to cheese
  // cheese is cell 0 and is never an apple cell
  assert.ok(cellForApple(A - 1, A) >= 1);
});

test('gridDims: single row for small totals, balanced wrap when large', () => {
  assert.deepEqual(gridDims(6, 6, 8), { cols: 6, rows: 1 });
  assert.deepEqual(gridDims(7, 6, 8), { cols: 4, rows: 2 });   // balanced 4x2
  assert.deepEqual(gridDims(12, 6, 8), { cols: 6, rows: 2 });
  const g = gridDims(40, 6, 8);
  assert.ok(g.cols <= 6 && g.rows <= 8 && g.cols * g.rows >= 40);
});

test('gridDims respects the row cap (within capacity)', () => {
  // Scene caps total to colCap*rowCap before calling gridDims.
  const g = gridDims(27, 9, 3);   // landscape-ish caps, exactly at capacity
  assert.ok(g.rows <= 3 && g.cols <= 9 && g.cols * g.rows >= 27);
});

test('clampN basic', () => {
  assert.equal(clampN(5, 0, 3), 3);
  assert.equal(clampN(-1, 0, 3), 0);
  assert.equal(clampN(2, 0, 3), 2);
});
