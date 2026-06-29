/**
 * DragonScene – Dragon Sleep Timer.
 *
 * A majestic violet dragon sleeps atop a glittering gold hoard. Sneaky thieves
 * shuttle gold from the hoard into a treasure chest. Time remaining == size of
 * the gold pile: it starts large and SHRINKS as the countdown elapses (driven by
 * engine progress 0→1). The dragon rests ON the pile, so it sinks lower as the
 * gold disappears (always grounded — never floating). The chest fills in five
 * discrete ticks (one per milestone). At 0:00 the dragon WAKES (eye snaps open),
 * rears up, ROARS and breathes a fire plume that scatters the fleeing thieves.
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
const FIRE = { fire0: [48, 30], fire1: [72, 42], fire2: [96, 52] };

// Dragon mouth position in the roar frame, as a fraction of the sprite box
// (fire originates here and blasts LEFT).
const MOUTH_FX = 18 / DRG_W, MOUTH_FY = 18 / DRG_H;

// ── Finale timeline (ms into this.finale) ────────────────────────────────────
export const DRAGON_WAKE_MS = 480;   // sleep → wake (eye snaps open) → roar
export const DRAGON_FIRE_MS = 950;   // roar → fire breath begins
const FINALE_DONE_MS = 3000;

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
    this.moundMinW = Math.round(W * 0.30);
    this.moundFullH = Math.round(H * (landscape ? 0.20 : 0.22));
    this.moundMinH = Math.round(H * 0.05);

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
    if (this._stirT > 0) this._stirT -= dtMs;

    if (this.reducedMotion) { this._parts.length = 0; return; }

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

  _tickFinale(dtMs) {
    if (!this._fleeing) {
      this._fleeing = true;
      for (const th of this._thieves) th.state = 'flee';
    }
    const fleeSp = this.thiefSpeed * 2.2 * (dtMs / 1000);
    const fireOn = fireActive(this.finale);
    const fireFront = this._fireFrontX();
    const all = this._thieves.concat(this._dashers);
    for (const th of all) {
      th.x -= fleeSp;
      // Roasted when the fire front sweeps past a fleeing thief
      if (fireOn && !th.roast && th.x > fireFront && th.x < fireFront + this.W * 0.18) {
        th.roast = true;
        this._spawnPuff(th.x, this.GY - THIEF_H * this.thiefScale * 0.5);
      }
    }
    this._thieves = this._thieves.filter(th => th.x > -THIEF_W * this.thiefScale && !th.roast);
    this._dashers = this._dashers.filter(th => th.x > -THIEF_W * this.thiefScale && !th.roast);

    // Fire ignite flash + ember spray
    if (fireOn) {
      if (this._finFlashA <= 0 && this.finale < DRAGON_FIRE_MS + dtMs + 1) {
        this._finFlashA = 0.5;
        audio.sfx('magic');
      }
      this._emberT = (this._emberT || 0) + dtMs;
      if (this._emberT >= 70) {
        this._emberT = 0;
        const fx = this._fireFrontX();
        this._parts.push({
          kind: 'spark', x: fx + Math.random() * this.W * 0.1,
          y: this.GY - this.moundH - Math.random() * 10,
          vx: -60 - Math.random() * 80, vy: -20 - Math.random() * 50, age: 0, max: 600,
        });
      }
    }
  }

  /** Left-most reach of the fire plume in canvas px (for roast detection). */
  _fireFrontX() {
    const mouthX = this.dragonCX - DRG_W * this.dScale / 2 + MOUTH_FX * DRG_W * this.dScale;
    return mouthX - FIRE.fire2[0] * this.dScale * 1.15;
  }

  onMilestone(i, total) {
    this._milestonesFired = i;          // i is 1-indexed (1..total)
    this._flashA = 0.4;
    this._stirT = 420;
    audio.sfx('coin');
    // A thief dashes off with a bulging sack
    this._dashers.push({ x: this.grabX, state: 'toChest' });
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

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, GY);
    sky.addColorStop(0, C.sky0); sky.addColorStop(1, C.sky1);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, GY);

    // Ground
    ctx.fillStyle = C.ground; ctx.fillRect(0, GY, W, H - GY);

    // Sun + perspective grid
    drawSun(ctx, this.sunX, this.sunY, this.sunR, C.sun_top, C.sun_bot);
    const scrollT = this.reducedMotion ? 0 : (this.t / 3200) % 1;
    drawGrid(ctx, W, H, GY, C.grid, scrollT);

    if (!sh) return;

    // Current hoard size (the heart of the timer: shrinks with progress)
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

    // Milestone + finale flashes
    if (this._flashA > 0) {
      ctx.fillStyle = `rgba(255,210,74,${this._flashA.toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (this._finFlashA > 0) {
      ctx.fillStyle = `rgba(255,120,30,${this._finFlashA.toFixed(2)})`;
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

    // Scattered coins (static texture) hugging the dome surface
    for (const a of this._coins) {
      const t = a.v, hw = this.domeHalfW(t);
      const x = cx + a.u * hw * 0.92;
      const y = top + t * this.moundH;
      blit(ctx, sh, 'coin', Math.round(x - 6), Math.round(y - 5), 1);
    }
    // Twinkling glitter
    const twinkle = ['sparkle0', 'sparkle1', 'sparkle2'];
    for (const a of this._sparks) {
      const t = a.v, hw = this.domeHalfW(t);
      if (hw < 2) continue;
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
      if (th.state === 'flee') {
        frame = 'thief_flee';
      } else if (th.state === 'toChest' || th.state === 'drop') {
        frame = this._walkFr ? 'thief_loot1' : 'thief_loot0';
      } else {
        frame = this._walkFr ? 'thief_walk1' : 'thief_walk0';
        flip = true;   // walking right (back to the hoard) → face right
      }
      blit(ctx, sh, frame, Math.round(th.x - THIEF_W * s / 2), topY, s, flip);
    };
    for (const th of this._dashers) draw(th);
    for (const th of this._thieves) draw(th);
  }

  _drawFire(ctx, sh) {
    if (!fireActive(this.finale)) return;
    const sc = this.dScale * 1.15;
    const ft = this.finale - DRAGON_FIRE_MS;
    let name;
    if (this.reducedMotion) name = 'fire2';
    else if (ft < 130) name = 'fire0';
    else name = (Math.floor(ft / 120) % 2) ? 'fire1' : 'fire2';
    const [fw, fh] = FIRE[name];
    const mouthX = this.dragonCX - DRG_W * this.dScale / 2 + MOUTH_FX * DRG_W * this.dScale;
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
