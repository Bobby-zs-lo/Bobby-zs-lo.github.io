/* Run: node tests/logic.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require('../js/logic.js');

// progressFrac
assert.equal(L.progressFrac(0, 5), 0);
assert.equal(L.progressFrac(3, 5), 0.6);
assert.equal(L.progressFrac(7, 5), 1);            // clamped
assert.equal(L.progressFrac(1, 0), 1);            // degenerate target

// formatClock
assert.equal(L.formatClock(600), '10:00');
assert.equal(L.formatClock(61), '01:01');
assert.equal(L.formatClock(0.4), '00:01');        // ceil while running
assert.equal(L.formatClock(-5), '00:00');         // never negative

// formatFinish
assert.equal(L.formatFinish(0), '0:00.0');
assert.equal(L.formatFinish(83450), '1:23.4');

// validateConfig clamps
const cfg = L.validateConfig({ players: 99, stars: -3, minutes: 500, seconds: 75 });
assert.deepEqual(cfg, { players: 10, stars: 1, minutes: 120, seconds: 59 });

// totalSeconds has a floor
assert.equal(L.totalSeconds({ minutes: 0, seconds: 0 }), 5);
assert.equal(L.totalSeconds({ minutes: 2, seconds: 30 }), 150);

// rankResults: winners by time, losers by stars
const { winners, losers } = L.rankResults([
  { name: 'a', stars: 5, finishMs: 9000 },
  { name: 'b', stars: 2, finishMs: null },
  { name: 'c', stars: 5, finishMs: 4000 },
  { name: 'd', stars: 4, finishMs: null },
]);
assert.deepEqual(winners.map(w => w.name), ['c', 'a']);
assert.deepEqual(losers.map(l => l.name), ['d', 'b']);

// placeMedal
assert.equal(L.placeMedal(0), '🥇');
assert.equal(L.placeMedal(3), '4.');

console.log('All logic tests passed.');
