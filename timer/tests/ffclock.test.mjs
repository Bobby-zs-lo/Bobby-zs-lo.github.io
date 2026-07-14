import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScaledClock } from '../js/ffclock.js';
import { TimerEngine } from '../js/timer.js';

function fakeNow(start = 0) {
  let t = start;
  const fn = () => t;
  fn.advance = (ms) => { t += ms; };
  return fn;
}

test('runs at 1x by default', () => {
  const real = fakeNow(1000);
  const clock = createScaledClock(real);
  assert.equal(clock.now(), 1000);
  real.advance(500);
  assert.equal(clock.now(), 1500);
  assert.equal(clock.getSpeed(), 1);
});

test('advances virtual time at the set multiplier', () => {
  const real = fakeNow();
  const clock = createScaledClock(real);
  clock.setSpeed(5);
  real.advance(100);
  assert.equal(clock.now(), 500);
});

test('virtual time is continuous across speed changes', () => {
  const real = fakeNow();
  const clock = createScaledClock(real);
  real.advance(1000);          // 1000 virtual at 1x
  clock.setSpeed(10);
  real.advance(100);           // +1000 virtual at 10x
  clock.setSpeed(1);
  const atSwitch = clock.now();
  assert.equal(atSwitch, 2000);
  real.advance(250);           // +250 virtual at 1x
  assert.equal(clock.now(), 2250);
});

test('ignores invalid speeds', () => {
  const real = fakeNow();
  const clock = createScaledClock(real);
  clock.setSpeed(0);
  clock.setSpeed(-2);
  clock.setSpeed(NaN);
  assert.equal(clock.getSpeed(), 1);
  real.advance(100);
  assert.equal(clock.now(), 100);
});

test('drives a TimerEngine to completion faster at 10x', () => {
  const real = fakeNow();
  const clock = createScaledClock(real);
  let completed = false;
  const engine = new TimerEngine(60_000, {
    now: clock.now,
    onComplete: () => { completed = true; },
  });
  engine.start();
  clock.setSpeed(10);
  real.advance(3_000);         // 30s of virtual time
  engine.tick();
  assert.equal(completed, false);
  assert.equal(engine.getRemainingMs(), 30_000);
  real.advance(3_000);         // remaining 30s at 10x
  engine.tick();
  assert.equal(completed, true);
  assert.equal(engine.state, 'done');
});

test('pause/resume stays consistent under fast-forward', () => {
  const real = fakeNow();
  const clock = createScaledClock(real);
  const engine = new TimerEngine(60_000, { now: clock.now });
  engine.start();
  clock.setSpeed(5);
  real.advance(2_000);         // 10s virtual elapsed
  engine.pause();
  real.advance(10_000);        // paused: no change
  assert.equal(engine.getRemainingMs(), 50_000);
  engine.resume();
  real.advance(1_000);         // +5s virtual
  assert.equal(engine.getRemainingMs(), 45_000);
});
