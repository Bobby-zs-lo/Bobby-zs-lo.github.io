import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TimerEngine } from '../js/timer.js';

function fakeClock(start = 0){ let t = start; return { now: () => t, advance: ms => { t += ms; } }; }

test('starts idle and reports full remaining', () => {
  const c = fakeClock();
  const e = new TimerEngine(60000, { now: c.now });
  assert.equal(e.state, 'idle');
  assert.equal(e.getRemainingMs(), 60000);
  assert.equal(e.getProgress(), 0);
});

test('progress and remaining update with the clock', () => {
  const c = fakeClock();
  const e = new TimerEngine(60000, { now: c.now });
  e.start(); c.advance(15000);
  assert.equal(e.getRemainingMs(), 45000);
  assert.equal(e.getProgress(), 0.25);
});

test('pause freezes remaining, resume continues', () => {
  const c = fakeClock();
  const e = new TimerEngine(60000, { now: c.now });
  e.start(); c.advance(10000); e.pause(); c.advance(99999);
  assert.equal(e.getRemainingMs(), 50000);
  e.resume(); c.advance(10000);
  assert.equal(e.getRemainingMs(), 40000);
});

test('completes and clamps at zero', () => {
  const c = fakeClock(); let done = 0;
  const e = new TimerEngine(5000, { now: c.now, onComplete: () => done++ });
  e.start(); c.advance(6000); e.tick();
  assert.equal(e.getRemainingMs(), 0);
  assert.equal(e.getProgress(), 1);
  assert.equal(e.state, 'done');
  assert.equal(done, 1);
});

test('milestones fire once each at even fractions', () => {
  const c = fakeClock(); const hits = [];
  const e = new TimerEngine(10000, { now: c.now, milestones: 5, onMilestone: i => hits.push(i) });
  e.start();
  for (let i = 0; i < 10; i++){ c.advance(1000); e.tick(); }
  assert.deepEqual(hits, [1,2,3,4,5]);
});

test('reset returns to idle full', () => {
  const c = fakeClock();
  const e = new TimerEngine(60000, { now: c.now });
  e.start(); c.advance(30000); e.reset();
  assert.equal(e.state, 'idle');
  assert.equal(e.getRemainingMs(), 60000);
});
