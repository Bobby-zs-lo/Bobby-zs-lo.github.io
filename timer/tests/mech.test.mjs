import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampN, mechPhase, assemblyPartsVisible, gantryRetract, thrusterPower, launchEjectionY,
  finalePhase, MECH_LAUNCH_MS, MECH_FINALE_TOTAL_MS,
} from '../js/themes/mech.js';

test('mechPhase: advances through frame, torso, arms, head_activate, catapult_lock', () => {
  assert.equal(mechPhase(0), 'frame');
  assert.equal(mechPhase(0.24), 'frame');
  assert.equal(mechPhase(0.25), 'torso');
  assert.equal(mechPhase(0.49), 'torso');
  assert.equal(mechPhase(0.50), 'arms');
  assert.equal(mechPhase(0.74), 'arms');
  assert.equal(mechPhase(0.75), 'head_activate');
  assert.equal(mechPhase(0.94), 'head_activate');
  assert.equal(mechPhase(0.95), 'catapult_lock');
  assert.equal(mechPhase(1.0), 'catapult_lock');
});

test('assemblyPartsVisible: parts unlock progressively, visor eyes light up late', () => {
  const p0 = assemblyPartsVisible(0.1);
  assert.equal(p0.frame, true);
  assert.equal(p0.torso, false);
  assert.equal(p0.arms, false);
  assert.equal(p0.head, false);
  assert.equal(p0.eyesLit, false);

  const pTorso = assemblyPartsVisible(0.35);
  assert.equal(pTorso.torso, true);
  assert.equal(pTorso.arms, false);

  const pArms = assemblyPartsVisible(0.60);
  assert.equal(pArms.arms, true);
  assert.equal(pArms.head, false);

  const pHead = assemblyPartsVisible(0.80);
  assert.equal(pHead.head, true);
  assert.equal(pHead.eyesLit, false);

  const pEyes = assemblyPartsVisible(0.90);
  assert.equal(pEyes.head, true);
  assert.equal(pEyes.eyesLit, true);
});

test('gantryRetract: clamps stay locked until catapult prep, then retract', () => {
  assert.equal(gantryRetract(0), 0);
  assert.equal(gantryRetract(0.80), 0);
  assert.ok(gantryRetract(0.90) > 0 && gantryRetract(0.90) < 1);
  assert.equal(gantryRetract(1.0), 1);
});

test('thrusterPower: zero before testing, then climbs to full launch thrust', () => {
  assert.equal(thrusterPower(0), 0);
  assert.equal(thrusterPower(0.59), 0);
  assert.ok(thrusterPower(0.75) > 0);
  assert.equal(thrusterPower(1.0), 1.0);
});

test('launchEjectionY: zero before launch time, accelerates upwards rapidly', () => {
  assert.equal(launchEjectionY(0, 300), 0);
  assert.equal(launchEjectionY(MECH_LAUNCH_MS - 1, 300), 0);
  const mid = launchEjectionY(MECH_LAUNCH_MS + 700, 300);
  assert.ok(mid > 0 && mid < 300);
  assert.equal(launchEjectionY(MECH_LAUNCH_MS + 1400, 300), 300);
});

test('finalePhase: progresses through ignition, catapult launch, cleared, to done', () => {
  assert.equal(finalePhase(-5), 'idle');
  assert.equal(finalePhase(0), 'ignition_flash');
  assert.equal(finalePhase(MECH_LAUNCH_MS), 'catapult_launch');
  assert.equal(finalePhase(2400), 'launch_cleared');
  assert.equal(finalePhase(MECH_FINALE_TOTAL_MS), 'done');
});
