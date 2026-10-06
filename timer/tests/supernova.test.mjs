import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampN,
  starEvolutionStage,
  coreRadius,
  accretionVelocity,
  finalePhase,
  shockwaveRadius,
  jetLength,
  FINALE_FLASH_MS,
  FINALE_BLAST_MS,
  FINALE_TOTAL_MS,
} from '../js/themes/supernova.js';

test('clampN: basic boundary checks', () => {
  assert.equal(clampN(5, 0, 10), 5);
  assert.equal(clampN(-2, 0, 10), 0);
  assert.equal(clampN(15, 0, 10), 10);
});

test('starEvolutionStage: progress stages through stellar evolution', () => {
  assert.equal(starEvolutionStage(0.0), 'hypergiant');
  assert.equal(starEvolutionStage(0.15), 'hypergiant');
  assert.equal(starEvolutionStage(0.24), 'hypergiant');
  assert.equal(starEvolutionStage(0.25), 'solar');
  assert.equal(starEvolutionStage(0.40), 'solar');
  assert.equal(starEvolutionStage(0.50), 'supergiant');
  assert.equal(starEvolutionStage(0.70), 'supergiant');
  assert.equal(starEvolutionStage(0.75), 'singularity');
  assert.equal(starEvolutionStage(0.90), 'singularity');
  assert.equal(starEvolutionStage(0.95), 'implosion');
  assert.equal(starEvolutionStage(1.0), 'implosion');
  // Clamping
  assert.equal(starEvolutionStage(-0.5), 'hypergiant');
  assert.equal(starEvolutionStage(1.5), 'implosion');
});

test('coreRadius: expands into red giant, then collapses to a singularity', () => {
  const base = 30;
  const r0 = coreRadius(0, base);
  const rSolar = coreRadius(0.35, base);
  const rGiant = coreRadius(0.70, base);
  const rSingularity = coreRadius(0.90, base);
  const rImplosion = coreRadius(1.0, base);

  assert.equal(r0, base);
  assert.ok(rSolar > r0, 'Solar phase is slightly expanded compared to initial base');
  assert.ok(rGiant > rSolar, 'Supergiant phase swells significantly larger');
  assert.ok(rSingularity < r0, 'Singularity collapses much smaller than initial star');
  assert.ok(rImplosion < rSingularity, 'Final implosion contracts matter down to near-zero');
});

test('accretionVelocity: steady initially, accelerates as singularity forms', () => {
  assert.equal(accretionVelocity(0), 1.0);
  assert.equal(accretionVelocity(0.5), 1.0);
  assert.equal(accretionVelocity(0.74), 1.0);
  assert.ok(accretionVelocity(0.85) > 1.0, 'Late accretion speeds up');
  assert.equal(accretionVelocity(1.0), 5.5);
});

test('finalePhase: progresses through flash, blast, and pulsar birth', () => {
  assert.equal(finalePhase(-10), 'idle');
  assert.equal(finalePhase(0), 'implosion_flash');
  assert.equal(finalePhase(FINALE_FLASH_MS - 1), 'implosion_flash');
  assert.equal(finalePhase(FINALE_FLASH_MS), 'blast_expansion');
  assert.equal(finalePhase(FINALE_BLAST_MS - 1), 'blast_expansion');
  assert.equal(finalePhase(FINALE_BLAST_MS), 'pulsar_birth');
  assert.equal(finalePhase(FINALE_TOTAL_MS - 1), 'pulsar_birth');
  assert.equal(finalePhase(FINALE_TOTAL_MS), 'done');
  assert.equal(finalePhase(FINALE_TOTAL_MS + 500), 'done');
});

test('shockwaveRadius: zero before flash ends, expands to max across blast', () => {
  assert.equal(shockwaveRadius(0, 100), 0);
  assert.equal(shockwaveRadius(FINALE_FLASH_MS, 100), 0);
  const mid = shockwaveRadius(FINALE_FLASH_MS + 800, 100);
  assert.ok(mid > 0 && mid < 100, 'Shockwave expands during blast');
  assert.equal(Math.round(shockwaveRadius(FINALE_BLAST_MS, 100)), 100);
});

test('jetLength: erupts after flash, then gradually fades', () => {
  assert.equal(jetLength(0, 200), 0);
  assert.equal(jetLength(FINALE_FLASH_MS - 1, 200), 0);
  const erupted = jetLength(FINALE_FLASH_MS + 350, 200);
  assert.ok(erupted > 150, 'Relativistic jet reaches peak quickly');
  const late = jetLength(FINALE_TOTAL_MS, 200);
  assert.ok(late < erupted, 'Jet energy dissipates late in the finale');
});
