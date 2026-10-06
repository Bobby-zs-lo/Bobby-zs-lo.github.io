import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampN, mechPhase, gantryRetract, thrusterPower, launchEjectionY,
  finalePhase, MECH_LAUNCH_MS, MECH_FINALE_TOTAL_MS,
} from '../js/themes/mech.js';

test('mechPhase: advances through diagnostic, ascent, thruster, breach, overload', () => {
  assert.equal(mechPhase(0), 'diagnostic');
  assert.equal(mechPhase(0.24), 'diagnostic');
  assert.equal(mechPhase(0.25), 'ascent');
  assert.equal(mechPhase(0.49), 'ascent');
  assert.equal(mechPhase(0.50), 'thruster');
  assert.equal(mechPhase(0.74), 'thruster');
  assert.equal(mechPhase(0.75), 'breach');
  assert.equal(mechPhase(0.94), 'breach');
  assert.equal(mechPhase(0.95), 'overload');
  assert.equal(mechPhase(1.0), 'overload');
});

test('gantryRetract: clamps stay locked initially, then retract during ascent', () => {
  assert.equal(gantryRetract(0), 0);
  assert.equal(gantryRetract(0.24), 0);
  assert.ok(gantryRetract(0.35) > 0 && gantryRetract(0.35) < 1);
  assert.equal(gantryRetract(0.50), 1);
  assert.equal(gantryRetract(0.9), 1);
});

test('thrusterPower: zero before 50%, builds to 100% full thrust', () => {
  assert.equal(thrusterPower(0), 0);
  assert.equal(thrusterPower(0.49), 0);
  assert.ok(thrusterPower(0.6) > 0);
  assert.equal(thrusterPower(1.0), 1.0);
});

test('launchEjectionY: zero before launch time, accelerates upwards rapidly', () => {
  assert.equal(launchEjectionY(0, 300), 0);
  assert.equal(launchEjectionY(MECH_LAUNCH_MS - 1, 300), 0);
  const mid = launchEjectionY(MECH_LAUNCH_MS + 600, 300);
  assert.ok(mid > 0 && mid < 300);
  assert.equal(launchEjectionY(MECH_LAUNCH_MS + 1200, 300), 300);
});

test('finalePhase: progresses through ignition, ejection, settle to done', () => {
  assert.equal(finalePhase(-5), 'idle');
  assert.equal(finalePhase(0), 'ignition_flash');
  assert.equal(finalePhase(MECH_LAUNCH_MS), 'ejection');
  assert.equal(finalePhase(2400), 'exhaust_settle');
  assert.equal(finalePhase(MECH_FINALE_TOTAL_MS), 'done');
});
