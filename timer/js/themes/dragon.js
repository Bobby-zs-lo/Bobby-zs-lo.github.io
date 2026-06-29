/**
 * DragonScene – Dragon Sleep Timer.
 *
 * A fierce RED dragon sleeps atop a glittering gold hoard. Sneaky thieves
 * shuttle gold from the hoard into a treasure chest. Time remaining == size of
 * the gold pile: it starts large and SHRINKS as the countdown elapses (driven by
 * engine progress 0→1) until it reaches ZERO — the hoard is fully drained and the
 * dragon ends up curled over bare ground. The dragon rests ON the pile, so it
 * sinks lower as the gold disappears (always grounded — never floating). The chest
 * fills in five discrete ticks (one per milestone). At 0:00 the dragon WAKES (eye
 * snaps open), rears up, ROARS and breathes a huge fire plume that ROASTS the
 * panicking thieves (they char and puff away) — a longer, screen-shaking finale.
 *
 * Milestones (5): a thief dashes off with a bulging sack, the chest ticks up,
 * the dragon stirs/grumbles, a coin-sparkle burst fires + audio.sfx('coin').
 *
 * reducedMotion: disables grid scroll, breathing bob, thief walking, particles
 * and screen-shake; keeps the essential gold-shrink, chest fill and a reduced
 * finale (dragon rears + roars + a static fire frame). The finale timer always
 * advances (before the reduced-motion early-return) so isFinaleDone() fires.
 *
 * Sprite sheet: assets/dragon.png + dragon.json
 * Frames: dragon_sleep, dragon_wake, dragon_roar,
 *         fire0, fire1, fire2, chest,
 *         thief_walk0, thief_walk1, thief_loot0, thief_loot1, thief_flee,
 *         coin, gem, sparkle0, sparkle1, sparkle2, puff
 */
import { Scene, blit } from '../scene.js';
import { audio }       from '../audio.js';
import { lerpHex }     from '../palette.js';

// ── Palette (matches gen_dragon.py + thumb_dragon) ───────────────────────────
const C = {
  sky0:    '#1a0833',
  sky1:    '#c23a86',
  sun_top: '#ffd166',
  sun_bot: '#ff2e88',
  ground:  '#160626',
  grid:    '#5a1e6e',
  gold:    '#ffd24a',
  gold_hi: '#ffe9a0',
  gold_dk: '#b07d20',
  gold_sh: '#6e4a12',
  accent:  '#00f5d4',
};

// ── Sprite base dimensions (1:1 with sheet) ──────────────────────────────────
const DRG_W = 152, DRG_H = 112;
const CHEST_W = 48, CHEST_H = 34;
const THIEF_W = 18, THIEF_H = 24;
const FIRE = { fire0: [64, 40], fire1: [100, 58], fire2: [140, 78], fire3: [176, 96] };

// Dragon mouth position in the roar frame, as a fraction of the sprite box
// (fire originates here and blasts LEFT).
const MOUTH_FX = 16 / DRG_W, MOUTH_FY = 28 / DRG_H;

// ── Finale timeline (ms into this.finale) ────────────────────────────────────
// Longer, punchier wake → rear-up → roar → fire sequence. The fire breath holds
// for several seconds so the burn fully plays out before the Done screen.
export const DRAGON_WAKE_MS = 650;    // sleep → wake (eye snaps open) → rear/roar
export const DRAGON_FIRE_MS = 1500;   // reared-roar buildup → fire breath begins
const FINALE_DONE_MS = 5200;          // finale length (isFinaleDone threshold)

// ── Pure logic (exported for unit tests) ─────────────────────────────────────
export function clampN(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/** Remaining gold-pile size as a 0..1 fraction (1 = full hoard, 0 = empty). */
export function goldRemaining(progress) { return clampN(1 - progress, 0, 1); }

/** Chest fill 0..1 from the number of milestones fired (discrete ticks). */
export function chestFill(fired, total) { return total > 0 ? clampN(fired / total, 0, 1) : 0; }

/** Finale pose for a given finale-elapsed time (ms). */
export function finalePhase(finaleMs) {
  if (finaleMs <= 0) return 'sleep';
  if (finaleMs < DRAGON_WAKE_MS) return 'wake';
  return 'roar';
}

/** Whether the fire breath is active at a given finale-elapsed time (ms). */
export function fireActive(finaleMs) { return finaleMs >= DRAGON_FIRE_MS; }

// ── Helpers ──────────────────────────────────────────────────────────────────
const lerp = (a, b, t) => a + (b - a) * t;
const lerpH = (a, b, t) => lerpHex(a, b, clampN(t, 0, 1));

function drawSun(ctx, cx, cy, r, top, bot) {
  for (let dy = -r; dy <= r; dy++) {
    const dx = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
    if (dx === 0) continue;
    if (dy > 0 && Math.floor((dy - 1) / 5) % 2 === 1) continue;
    ctx.fillStyle = lerpH(top, bot, clampN(dy / r, 0, 1));
    ctx.fillRect(cx - dx, cy + dy, dx * 2, 1);
  }
}

function drawGrid(ctx, W, H, horizon, color, scrollT) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  const VP = W / 2;
  for (let i = 0; i <= 10; i++) {
    const bx = (i / 10) * W;
    ctx.beginPath(); ctx.moveTo(bx, H); ctx.lineTo(VP, horizon); ctx.stroke();
  }
  for (let i = 1; i <= 8; i++) {
    const tt = ((i / 8) + scrollT) % 1;
    const y = horizon + (H - horizon) * (1 - Math.pow(1 - tt, 2.2));
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
}

// ── DragonScene ──────────────────────────────────────────────────────────────
export class DragonScene extends Scene {

  layout(W, H) {
    this.W = W;
    this.H = H;
    this._layoutDone = true;
    const landscape = W > H;
    const minDim = Math.min(W, H);
    this.GY = Math.round(H * (landscape ? 0.82 : 0.86));

    // Gold hoard mound (centered under the dragon)
    this.moundCX = Math.round(W * 0.60);
    this.moundFullW = Math.round(W * (landscape ? 0.46 : 0.54));
    this.moundMinW = 0;           // hoard fully drained (NONE) at 0:00
    this.moundFullH = Math.round(H * (landscape ? 0.20 : 0.22));
    this.moundMinH = 0;           // bare ground under the dragon at the finale

    // Dragon scale + center
    this.dScale = Math.min((W * 0.56) / DRG_W, (H * 0.46) / DRG_H);
    this.dragonCX = this.moundCX;
    this.rearLiftMax = Math.round(H * 0.06);

    // Treasure chest (far left, on the ground)
    this.chestScale = Math.max(1, (W * 0.18) / CHEST_W);
    this.chestX = Math.round(W * 0.05);
    this.chestTopY = this.GY - Math.round(CHEST_H * this.chestScale);

    // Thieves shuttle between the hoard (right) and the chest (left)
    this.thiefScale = Math.max(1, minDim / 130);
    this.grabX = Math.round(W * 0.46);
    this.chestDropX = this.chestX + Math.round(CHEST_W * this.chestScale * 0.55);
    this.thiefSpeed = W * 0.16;

    // Retro sun (left, balancing the dragon on the right)
    this.sunX = Math.round(W * 0.30);
    this.sunY = Math.round(H * 0.20);
    this.sunR = Math.round(minDim * 0.10);

    if (!this._anchors) this._makeAnchors();
  }

  /** Deterministic seeded glitter/coin anchors on the (unit) hoard dome. */
  _makeAnchors() {
    let s = 0x51ed;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    this._coins = [];
    this._sparks = [];
    for (let i = 0; i < 16; i++) this._coins.push({ u: (rnd() * 2 - 1) * 0.86, v: 0.2 + rnd() * 0.74 });
    for (let i = 0; i < 12; i++) this._sparks.push({ u: (rnd() * 2 - 1) * 0.8, v: 0.12 + rnd() * 0.72, ph: rnd() * 2000 });
    this._anchors = true;
  }

  init(durationMs) {
    if (!this._layoutDone) this.layout(this.ctx.canvas.width, this.ctx.canvas.height);

    this.t = 0;
    this.progress = 0;
    this.finale = 0;

    this._milestonesFired = 0;
    this._chestFill = 0;          // eased toward chestFill(fired,5)
    this._flashA = 0;            // milestone flash
    this._finFlashA = 0;         // finale (fire ignite) flash
    this._whiteFlashA = 0;       // bright ignite pop
    this._shake = 0;             // screen-shake magnitude (finale)
    this._ignited = false;       // fire-ignite one-shot
    this._rmCleared = false;     // reduced-motion finale thieves cleared once
    this._stirT = 0;            // dragon grumble timer

    this._walkT = 0;
    this._walkFr = 0;

    // Two shuttling thieves (offset phases)
    this._thieves = [
      { x: this.grabX, state: 'toChest', wait: 0 },
      { x: this.chestDropX, state: 'toMound', wait: 0 },
    ];
    this._dashers = [];          // milestone "dash off with sack" runners
    this._parts = [];            // puffs / embers / sparkle bursts
    this._fleeing = false;
  }

  _spawnSparkBurst(x, y, n) {
    if (this.reducedMotion) return;
    for (let i = 0; i < n; i++) {
      this._parts.push({
        kind: 'spark', x, y,
        vx: (Math.random() * 2 - 1) * 50,
        vy: -30 - Math.random() * 60,
        age: 0, max: 500 + Math.random() * 300,
      });
    }
  }

  _spawnPuff(x, y) {
    if (this.reducedMotion) return;
    this._parts.push({ kind: 'puff', x, y, vx: -20 - Math.random() * 30, vy: -16, age: 0, max: 520 });
  }

  update(progress, dtMs) {
    this.t += dtMs;
    this.progress = progress;

    // GOTCHA: advance the finale timer BEFORE any reduced-motion early return
    // so isFinaleDone() can eventually become true and the run screen advances.
    if (this.finale > 0) this.finale += dtMs;

    // Chest fills toward the milestone target (eases even under reduced motion).
    const target = chestFill(this._milestonesFired, 5);
    if (this._chestFill < target) {
      this._chestFill = Math.min(target, this._chestFill + dtMs / 900);
    }

    // Flash fades (cheap; keep under reduced motion too)
    if (this._flashA > 0) { this._flashA -= dtMs / 320; if (this._flashA < 0) this._flashA = 0; }
    if (this._finFlashA > 0) { this._finFlashA -= dtMs / 300; if (this._finFlashA < 0) this._finFlashA = 0; }
    if (this._whiteFlashA > 0) { this._whiteFlashA -= dtMs / 220; if (this._whiteFlashA < 0) this._whiteFlashA = 0; }
    if (this._stirT > 0) this._stirT -= dtMs;

    if (this.reducedMotion) {
      this._parts.length = 0;
      // Reduced finale: no shake/flash/particles, but clear the thieves once so the
      // scene still reads (dragon rears + roars + static fire over an empty hoard).
      if (this.finale > 0 && !this._rmCleared) {
        this._rmCleared = true; this._thieves.length = 0; this._dashers.length = 0;
      }
      return;
    }

    // ── Idle walk-cycle timer ───────────────────────────────────────────────
    this._walkT += dtMs;
    if (this._walkT >= 180) { this._walkFr ^= 1; this._walkT = 0; }

    // ── Fire-ignite flash + roast at finale ─────────────────────────────────
    if (this.finale > 0) {
      this._tickFinale(dtMs);
    } else {
      this._tickThieves(dtMs);
    }

    // ── Particles ───────────────────────────────────────────────────────────
    if (this._parts.length) {
      const g = 200;
      for (const p of this._parts) {
        p.age += dtMs;
        p.x += p.vx * (dtMs / 1000);
        p.y += p.vy * (dtMs / 1000);
        if (p.kind === 'spark') p.vy += g * (dtMs / 1000);
      }
      this._parts = this._parts.filter(p => p.age < p.max);
    }
  }

  _tickThieves(dtMs) {
    const sp = this.thiefSpeed * (dtMs / 1000);
    for (const th of this._thieves) {
      if (th.state === 'toChest') {
        th.x -= sp;
        if (th.x <= this.chestDropX) { th.x = this.chestDropX; th.state = 'drop'; th.wait = 320; }
      } else if (th.state === 'toMound') {
        th.x += sp;
        if (th.x >= this.grabX) { th.x = this.grabX; th.state = 'grab'; th.wait = 260; }
      } else {
        th.wait -= dtMs;
        if (th.wait <= 0) th.state = (th.state === 'drop') ? 'toMound' : 'toChest';
      }
    }
    // Milestone dashers race off to the chest carrying loot, then vanish
    for (const d of this._dashers) d.x -= this.thiefSpeed * 1.7 * (dtMs / 1000);
    this._dashers = this._dashers.filter(d => d.x > -THIEF_W * this.thiefScale);
  }

  /** Mouth (fire origin) x in canvas px. */
  _mouthX() {
    return this.dragonCX - DRG_W * this.dScale / 2 + MOUTH_FX * DRG_W * this.dScale;
  }

  /** Current fire frame name — plume grows fire0→fire3 then flickers big. */
  _curFireName() {
    if (this.reducedMotion) return 'fire3';
    const ft = this.finale - DRAGON_FIRE_MS;
    if (ft < 120) return 'fire0';
    if (ft < 260) return 'fire1';
    if (ft < 430) return 'fire2';
    return (Math.floor(ft / 110) % 2) ? 'fire2' : 'fire3';
  }

  /** Left-most reach of the current fire plume in canvas px (roast detection). */
  _fireFrontX() {
    return this._mouthX() - FIRE[this._curFireName()][0] * this.dScale * 1.2;
  }

  _tickFinale(dtMs) {
    const W = this.W;
    const fireOn = fireActive(this.finale);

    // One-time: thieves PANIC — scurry a little toward the chest then cower in the
    // dragon's fire path so the burn is clearly visible. Merge dashers in.
    if (!this._fleeing) {
      this._fleeing = true;
      this._thieves = this._thieves.concat(this._dashers);
      this._dashers = [];
      for (const th of this._thieves) {
        th.state = 'panic';
        th.roast = false; th.charT = 0; th._poofed = false;
        th.cowerX = clampN(th.x - W * 0.07, W * 0.18, W * 0.36);
      }
      audio.sfx('build');   // low rumble buildup
    }

    // Screen shake: rumble grows through the roar buildup, spikes hard at ignite.
    if (fireOn) {
      const ft = this.finale - DRAGON_FIRE_MS;
      this._shake = 1.8 + Math.max(0, 6 - ft / 45);
    } else {
      const k = clampN((this.finale - DRAGON_WAKE_MS) / (DRAGON_FIRE_MS - DRAGON_WAKE_MS), 0, 1);
      this._shake = 0.5 + k * 1.9;
    }

    // Thieves scurry to their cower spot, then panic in place.
    const sp = this.thiefSpeed * 2.4 * (dtMs / 1000);
    for (const th of this._thieves) {
      if (th.roast) { th.charT -= dtMs; continue; }
      if (th.x > th.cowerX + 1) th.x -= sp; else th.cowering = true;
    }

    if (fireOn) {
      // Ignite: bright pop + hard shake + whoosh (one-shot).
      if (!this._ignited) {
        this._ignited = true;
        this._finFlashA = 0.6;
        this._whiteFlashA = 0.85;
        audio.sfx('magic');
      }
      // Roast: char any thief caught under the sweeping plume.
      const mouthX = this._mouthX();
      const reach = this._fireFrontX();
      const footY = this.GY - THIEF_H * this.thiefScale * 0.5;
      for (const th of this._thieves) {
        if (!th.roast && th.x <= mouthX && th.x >= reach) {
          th.roast = true; th.charT = 700;
          this._spawnPuff(th.x, footY);
          this._spawnSparkBurst(th.x, footY - 6, 6);
          audio.sfx('hit');
        }
      }
      // Ember spray riding the plume front.
      this._emberT = (this._emberT || 0) + dtMs;
      if (this._emberT >= 60) {
        this._emberT = 0;
        const fx = this._fireFrontX();
        this._parts.push({
          kind: 'spark', x: fx + Math.random() * W * 0.12,
          y: this.GY - this.moundH - Math.random() * 14,
          vx: -70 - Math.random() * 90, vy: -25 - Math.random() * 55, age: 0, max: 650,
        });
      }
    }

    // Charred thieves poof out after their char hold (final smoke puff).
    for (const th of this._thieves) {
      if (th.roast && th.charT <= 0 && !th._poofed) {
        th._poofed = true;
        this._spawnPuff(th.x, this.GY - THIEF_H * this.thiefScale * 0.6);
      }
    }
    this._thieves = this._thieves.filter(
      th => !(th.roast && th.charT <= 0) && th.x > -THIEF_W * this.thiefScale
    );
  }

  onMilestone(i, total) {
    this._milestonesFired = i;          // i is 1-indexed (1..total)
    this._flashA = 0.4;
    this._stirT = 420;
    audio.sfx('coin');
    // A thief dashes off with a bulging sack
    if (!this.reducedMotion) this._dashers.push({ x: this.grabX, state: 'toChest' });
    // Coin-sparkle burst on the hoard's stolen-from edge
    const rem = goldRemaining(this.progress);
    const mW = lerp(this.moundMinW, this.moundFullW, rem);
    this._spawnSparkBurst(this.moundCX - mW * 0.32, this.GY - this.moundH * 0.6, 7);
  }

  onComplete() {
    this.finale = 1;
    this._milestonesFired = 5;
    audio.sfx('win');
  }

  isFinaleDone() { return this.finale > FINALE_DONE_MS; }

  // ── Rendering ────────────────────────────────────────────────────────────────
  domeHalfW(t) { return (this.moundW / 2) * Math.pow(clampN(t, 0, 1), 0.6); }

  render() {
    const ctx = this.ctx, W = this.W, H = this.H, GY = this.GY, sh = this.assets;
    ctx.imageSmoothingEnabled = false;

    // Screen shake (finale). The whole scene is drawn inside a translated context
    // with overscan so no background gap shows at the edges.
    let shx = 0, shy = 0;
    if (!this.reducedMotion && this._shake > 0.2) {
      shx = Math.round((Math.random() * 2 - 1) * this._shake);
      shy = Math.round((Math.random() * 2 - 1) * this._shake);
    }
    const OV = 10;
    ctx.save();
    ctx.translate(shx, shy);

    // Sky (overscanned)
    const sky = ctx.createLinearGradient(0, 0, 0, GY);
    sky.addColorStop(0, C.sky0); sky.addColorStop(1, C.sky1);
    ctx.fillStyle = sky; ctx.fillRect(-OV, -OV, W + OV * 2, GY + OV);

    // Ground
    ctx.fillStyle = C.ground; ctx.fillRect(-OV, GY, W + OV * 2, H - GY + OV);

    // Sun + perspective grid
    drawSun(ctx, this.sunX, this.sunY, this.sunR, C.sun_top, C.sun_bot);
    const scrollT = this.reducedMotion ? 0 : (this.t / 3200) % 1;
    drawGrid(ctx, W, H, GY, C.grid, scrollT);

    if (sh) {
      // Current hoard size (the heart of the timer: shrinks with progress to ZERO)
      const rem = goldRemaining(this.progress);
      this.moundW = Math.round(lerp(this.moundMinW, this.moundFullW, rem));
      this.moundH = Math.round(lerp(this.moundMinH, this.moundFullH, rem));
      this.moundTopY = GY - this.moundH;

      this._drawMound(ctx, sh);
      this._drawChest(ctx, sh);
      this._drawDragon(ctx, sh);
      this._drawThieves(ctx, sh);
      this._drawFire(ctx, sh);
      this._drawParticles(ctx, sh);
    }

    ctx.restore();

    // Sustained fire glow + flashes (full-screen, unshaken).
    if (!this.reducedMotion && fireActive(this.finale)) {
      const g = 0.10 + 0.05 * Math.abs(Math.sin(this.t / 70));
      ctx.fillStyle = `rgba(255,110,40,${g.toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (this._flashA > 0) {
      ctx.fillStyle = `rgba(255,210,74,${this._flashA.toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (this._finFlashA > 0) {
      ctx.fillStyle = `rgba(255,120,30,${this._finFlashA.toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (this._whiteFlashA > 0) {
      ctx.fillStyle = `rgba(255,250,230,${this._whiteFlashA.toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  _drawMound(ctx, sh) {
    const cx = this.moundCX, top = this.moundTopY, base = this.GY;
    const span = Math.max(1, base - top);
    for (let y = top; y <= base; y++) {
      const t = (y - top) / span;
      const hw = this.domeHalfW(t);
      if (hw < 1) continue;
      ctx.fillStyle = lerpH(C.gold_hi, C.gold_dk, t * 0.95);
      ctx.fillRect(Math.round(cx - hw), y, Math.round(hw * 2), 1);
    }
    // Base shadow
    ctx.fillStyle = C.gold_sh;
    ctx.fillRect(Math.round(cx - this.moundW / 2), this.GY - 2, this.moundW, 2);

    // Scattered coins (static texture) hugging the dome surface. Skip once the
    // hoard has shrunk away so the gold visibly reaches NONE at the finale.
    if (this.moundH > 7) {
      for (const a of this._coins) {
        const t = a.v, hw = this.domeHalfW(t);
        if (hw < 4) continue;
        const x = cx + a.u * hw * 0.92;
        const y = top + t * this.moundH;
        blit(ctx, sh, 'coin', Math.round(x - 6), Math.round(y - 5), 1);
      }
    }
    // Twinkling glitter
    const twinkle = ['sparkle0', 'sparkle1', 'sparkle2'];
    for (const a of this._sparks) {
      const t = a.v, hw = this.domeHalfW(t);
      if (hw < 3 || this.moundH <= 7) continue;
      const x = cx + a.u * hw * 0.9;
      const y = top + t * this.moundH;
      const phase = this.reducedMotion ? 1 : Math.floor((this.t + a.ph) / 200) % 4;
      if (phase === 3) continue;   // off-beat (dark)
      blit(ctx, sh, twinkle[phase], Math.round(x - 4), Math.round(y - 4), 1);
    }
  }

  _drawDragon(ctx, sh) {
    const sc = this.dScale;
    const phase = finalePhase(this.finale);
    const frame = phase === 'sleep' ? 'dragon_sleep'
                : phase === 'wake' ? 'dragon_wake' : 'dragon_roar';

    // Rear-up lift during the roar (eased) — part of the essential finale.
    let lift = 0;
    if (phase === 'roar') {
      lift = this.rearLiftMax * clampN((this.finale - DRAGON_WAKE_MS) / 420, 0, 1);
    }
    // Sleeping breathing bob + milestone stir jolt
    let bob = 0;
    if (!this.reducedMotion) {
      if (this.finale === 0) bob = Math.sin(this.t / 700) * 1.6 * sc;
      if (this._stirT > 0) bob -= Math.sin(this.t / 60) * 1.2 * sc * (this._stirT / 420);
    }

    const baseY = this.moundTopY + Math.round(this.moundH * 0.18);  // feet sink into gold
    const ox = this.dragonCX - DRG_W * sc / 2;
    const oy = baseY - DRG_H * sc - lift + bob;

    // Soft shadow under the dragon on the hoard
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(this.dragonCX, baseY, DRG_W * sc * 0.42, Math.max(2, 5 * sc), 0, 0, Math.PI * 2);
    ctx.fill();

    blit(ctx, sh, frame, Math.round(ox), Math.round(oy), sc);

    // Stir grumble breath puff at the nostril while sleeping
    this._dragonOX = ox; this._dragonOY = oy;
  }

  _drawChest(ctx, sh) {
    const s = this.chestScale;
    // Gold fill rising inside the open chest (drawn before the frame's metal rim)
    const ix = this.chestX + Math.round(5 * s);
    const iw = Math.round(38 * s);
    const iBot = this.chestTopY + Math.round(31 * s);
    const iTop = this.chestTopY + Math.round(15 * s);
    const fh = Math.round((iBot - iTop) * clampN(this._chestFill, 0, 1));
    if (fh > 0) {
      ctx.fillStyle = C.gold_dk; ctx.fillRect(ix, iBot - fh, iw, fh);
      ctx.fillStyle = C.gold; ctx.fillRect(ix, iBot - fh, iw, Math.max(1, Math.round(fh * 0.6)));
      ctx.fillStyle = C.gold_hi; ctx.fillRect(ix, iBot - fh, iw, Math.max(1, Math.round(2 * s)));
    }
    blit(ctx, sh, 'chest', this.chestX, this.chestTopY, s);
    // Coins heaping over the rim when nearly full
    if (this._chestFill > 0.55) {
      for (let i = 0; i < 4; i++) {
        blit(ctx, sh, 'coin', ix + Math.round(i * 9 * s), iBot - fh - Math.round(5 * s), Math.max(1, s * 0.8));
      }
    }
    // Sparkle ping on the chest right after a tick
    if (this._flashA > 0.15) {
      blit(ctx, sh, 'sparkle1', this.chestX + Math.round(CHEST_W * s * 0.5) - 4, this.chestTopY - 6, 1);
    }
  }

  _drawThieves(ctx, sh) {
    const s = this.thiefScale;
    const topY = this.GY - Math.round(THIEF_H * s);
    const draw = (th) => {
      let frame, flip = false;
      if (th.roast) {
        frame = 'thief_char';
      } else if (th.state === 'flee' || th.state === 'panic') {
        frame = 'thief_flee';
      } else if (th.state === 'toChest' || th.state === 'drop') {
        frame = this._walkFr ? 'thief_loot1' : 'thief_loot0';
      } else {
        frame = this._walkFr ? 'thief_walk1' : 'thief_walk0';
        flip = true;   // walking right (back to the hoard) → face right
      }
      // Panic jitter while cowering in place
      let jx = 0;
      if (th.cowering && !th.roast && !this.reducedMotion) {
        jx = Math.round(Math.sin(this.t / 45 + th.x) * 1.3);
      }
      blit(ctx, sh, frame, Math.round(th.x - THIEF_W * s / 2) + jx, topY, s, flip);
    };
    for (const th of this._dashers) draw(th);
    for (const th of this._thieves) draw(th);
  }

  _drawFire(ctx, sh) {
    if (!fireActive(this.finale)) return;
    const sc = this.dScale * 1.2;
    const name = this._curFireName();
    const [fw, fh] = FIRE[name];
    const mouthX = this._mouthX();
    const mouthY = (this._dragonOY ?? 0) + MOUTH_FY * DRG_H * this.dScale;
    blit(ctx, sh, name, Math.round(mouthX - fw * sc), Math.round(mouthY - fh * sc / 2), sc);
  }

  _drawParticles(ctx, sh) {
    if (this.reducedMotion || !this._parts.length) return;
    for (const p of this._parts) {
      const a = 1 - p.age / p.max;
      if (a <= 0) continue;
      if (p.kind === 'puff') {
        ctx.globalAlpha = a;
        blit(ctx, sh, 'puff', Math.round(p.x - 9), Math.round(p.y - 7), Math.max(1, this.thiefScale * 0.9));
      } else {
        ctx.globalAlpha = a < 1 ? a : 1;
        const fr = ['sparkle0', 'sparkle1', 'sparkle2'][Math.floor(p.age / 120) % 3];
        blit(ctx, sh, fr, Math.round(p.x - 4), Math.round(p.y - 4), 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  dispose() {}
}
