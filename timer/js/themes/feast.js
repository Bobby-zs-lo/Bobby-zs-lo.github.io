/**
 * FeastScene – Pikachu eats a 14-item feast as the countdown; finale = full-screen thunder storm.
 * Sprite sheet: assets/feeding.png + feeding.json (frame names are a HARD contract with art-src/gen_feast.py).
 */
import { Scene, blit } from '../scene.js';
import { audio } from '../audio.js';

const C = {
  body: '#FFDE00', bodyShadow: '#E8B93E', bodyHi: '#FFF3A6',
  cheek: '#FF3B30', dark: '#1A1A1A', innerEar: '#9A5B2E',
  tail: '#8A5A2B', tailUnder: '#C98A3D', belly: '#FFF0C2', mouth: '#7A3020',
  bg0: '#F5E3C0', bg1: '#E4C48F', cloth: '#D94F4F',
  boltCore: '#FFFFFF', boltGlow: '#FFE94D', ambient: '#FFF7B0',
};

export const ITEM_COUNT = 14;

// items fully eaten at progress p (item k is consumed during [k/14,(k+1)/14))
export function itemsEaten(p){
  return Math.max(0, Math.min(ITEM_COUNT, Math.floor(p * ITEM_COUNT + 1e-9)));
}

// 0..1 phase within the item currently being eaten (1 exactly at each boundary/end)
export function eatPhase(p){
  const x = p * ITEM_COUNT;
  const f = x - Math.floor(x);
  return (p <= 0) ? 0 : (f === 0 ? 1 : f);
}

// belly stage 0..3 across the whole countdown
export function bellyStage(p){
  return Math.max(0, Math.min(3, Math.floor(p * 4)));
}

// within one item slot: 'lean' (<0.18), 'chew' (<0.85), 'swallow' (else)
export function eatAction(phase){
  return phase < 0.18 ? 'lean' : phase < 0.85 ? 'chew' : 'swallow';
}

export class FeastScene extends Scene {}
