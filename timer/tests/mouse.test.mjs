import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appleCountForDuration, eatState, cellForApple, mouseGrid, clampN,
} from '../js/themes/mouse.js';

// ── appleCount: ~1 per 10s minus one (final 10s is the cheese), min 1, no cap ──
// One fewer apple than round(sec/10): the last 10-second segment is the cheese,
// not an apple. Total cells = appleCount + 1 (the cheese).
test('appleCountForDuration: round(sec/10) - 1, min 1, uncapped', () => {
  assert.equal(appleCountForDuration(60_000), 5);       // 1 min  -> 5 apples (+cheese = 6)
  assert.equal(appleCountForDuration(600_000), 59);     // 10 min -> 59 apples (+cheese = 60)
  assert.equal(appleCountForDuration(1_800_000), 179);  // 30 min -> 179 apples
  assert.equal(appleCountForDuration(3_600_000), 359);  // 60 min -> 359 apples (NO cap)
  assert.equal(appleCountForDuration(10_000), 1);       // 10 s   -> floor at 1
  assert.equal(appleCountForDuration(0), 1);            // floor at 1
});

test('eatState: apples deplete with progress; active = -1 when done', () => {
  const A = 6;
  assert.deepEqual(eatState(0, A), { eaten: 0, active: 0 });
  assert.deepEqual(eatState(0.5, A), { eaten: 3, active: 3 });
  assert.deepEqual(eatState(0.99, A), { eaten: 5, active: 5 });
  assert.deepEqual(eatState(1, A), { eaten: 6, active: -1 });
});

test('cellForApple: reverse eat order — farthest apple first, cell 1 last', () => {
  const A = 6;
  assert.equal(cellForApple(0, A), 6);   // first eaten = highest cell (farthest)
  assert.equal(cellForApple(5, A), 1);   // last eaten = cell next to cheese
  assert.ok(cellForApple(A - 1, A) >= 1);
});

// ── Grid sizing: portrait phone band (390x844 -> stage 240x519) ──────────────
// Stage shorter side = 240; longer = round(240 * clamp(844/390,1.25,2.2)) = 519.
// Band = 0.04..0.96 W, 0.085..0.965 H  ->  bandW=220, bandH=457. maxCols(portrait)=6.
const BW = 220, BH = 457, MAXCOLS = 6;
const DETAIL_MIN_PROBE = 26;   // mirrors the scene's small/detailed tier threshold

function gridFor(durMin) {
  const total = appleCountForDuration(durMin * 60_000) + 1;
  const g = mouseGrid(total, BW, BH, MAXCOLS);
  return { total, ...g };
}

test('mouseGrid: 1 min -> 5 apples + cheese, BIG, fits one screen', () => {
  const g = gridFor(1);
  assert.equal(appleCountForDuration(60_000), 5);
  assert.equal(g.total, 6);                        // 5 apples + cheese
  assert.equal(g.total, appleCountForDuration(60_000) + 1);  // total = appleCount + 1
  assert.equal(g.cols, 6);
  assert.equal(g.rows, 1);
  assert.ok(g.cell > 30);                          // big apples (~36px cell)
  assert.ok(g.rows * g.cell <= BH);                // fits the band height
  assert.ok(g.cols * g.rows >= g.total);           // every cell has a slot
});

test('mouseGrid: 10 min -> 59 apples + cheese in a 6x10, fits one screen', () => {
  const g = gridFor(10);
  assert.equal(g.total, 60);                       // 59 apples + cheese
  assert.equal(g.total, appleCountForDuration(600_000) + 1);
  assert.equal(g.cols, 6);
  assert.equal(g.rows, 10);
  assert.ok(g.cell > 30);                          // still big apples
  assert.ok(g.rows * g.cell <= BH);
  assert.ok(g.cols * g.rows >= g.total);
});

test('mouseGrid: 30 min -> apples shrink, more rows, fits one screen', () => {
  const g = gridFor(30);
  assert.equal(g.total, 180);                      // 179 apples + cheese
  assert.equal(g.total, appleCountForDuration(1_800_000) + 1);
  assert.equal(g.cols, 10);
  assert.equal(g.rows, 18);
  assert.ok(g.cell < DETAIL_MIN_PROBE);            // small/medium apples
  assert.ok(g.rows * g.cell <= BH);
  assert.ok(g.cols * g.rows >= g.total);
});

test('mouseGrid: 60 min -> 359 apples + cheese, all on ONE screen (no cap)', () => {
  const g = gridFor(60);
  assert.equal(g.total, 360);                      // 359 apples + cheese
  assert.equal(g.total, appleCountForDuration(3_600_000) + 1);
  assert.equal(g.cols, 14);
  assert.equal(g.rows, 26);
  assert.ok(g.cell >= 14 && g.cell < 18);          // small crisp apples (~16px)
  assert.ok(g.rows * g.cell <= BH);                // fits one screen
  assert.ok(g.cols * g.rows >= g.total);           // holds all 360 cells
});

test('mouseGrid: cells are capped at the big maximum for short timers', () => {
  const maxCell = BW / MAXCOLS;
  const g = gridFor(1);
  assert.ok(g.cell <= maxCell + 1e-9);            // never larger than the cap
  assert.ok(Math.abs(g.cell - maxCell) < 1e-9);   // short timer uses the cap
});

test('mouseGrid: extreme duration still fits the band (truly uncapped)', () => {
  // 3 hours -> 1079 apples + cheese = 1080 cells, must still fit one screen.
  const total = appleCountForDuration(3 * 3600_000) + 1;
  assert.equal(total, 1080);
  const g = mouseGrid(total, BW, BH, MAXCOLS);
  assert.ok(g.rows * g.cell <= BH);
  assert.ok(g.cols * g.rows >= total);
});

test('mouseGrid: landscape allows more columns (wider grid)', () => {
  // Wide band, sparse timer -> a single wide-ish row of big apples.
  const g = mouseGrid(7, 460, 200, 9);
  assert.equal(g.rows, 1);
  assert.ok(g.cols >= 7);
  assert.ok(g.rows * g.cell <= 200);
});

test('clampN basic', () => {
  assert.equal(clampN(5, 0, 3), 3);
  assert.equal(clampN(-1, 0, 3), 0);
  assert.equal(clampN(2, 0, 3), 2);
});
