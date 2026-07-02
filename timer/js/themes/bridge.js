/**
 * BridgeScene – Canyon Bridge.
 *
 * A brave little adventurer must cross a deep synthwave canyon. An automated
 * golden tower crane builds the bridge one segment at a time: the span is
 * divided into N_SEG segments; the remaining time shows as ghostly cyan
 * OUTLINE segments hanging over the gap, and as time elapses (progress 0→1)
 * the crane trolley carries a solid segment out along the jib and lowers it
 * into place where a ghost was — ghost count shrinks, solid bridge grows.
 * The LAST segment is reserved for 0:00.
 *
 * Milestones (5): flash + audio.sfx('build') + a dust "clunk" beat at the
 * newest placed segment (regular segment locks use the lighter 'click').
 *
 * Finale: the crane rushes the final segment into the last slot; it LOCKS in
 * (flash + 'build'), the bridge is complete, and the adventurer runs across
 * the finished deck to the far cliff — feet ON the deck the whole way — then
 * cheers at the flag (sparkles + 'coin'). isFinaleDone() only after that.
 *
 * reducedMotion: no grid scroll, crane sway, run-bob, dust or sparkles; the
 * segments simply appear solid at the progress count and the crossing is a
 * plain linear walk (static frame). The finale timer always advances BEFORE
 * the reduced-motion early return so isFinaleDone() still fires.
 *
 * Sprite sheet: assets/bridge.png + bridge.json
 * Frames: seg, seg_ghost, crane_cab, trolley,
 *         hero_idle0, hero_idle1, hero_run0, hero_run1, hero_cheer,
 *         flag, rock0, rock1, cactus, sparkle0, sparkle1, sparkle2, puff
 */
import { Scene, blit } from '../scene.js';
import { audio }       from '../audio.js';
import { lerpHex }     from '../palette.js';

// ── Palette (matches gen_bridge.py + thumb_bridge) ───────────────────────────
const C = {
  sky0:    '#140a33',
  sky1:    '#ff6a4a',
  sun_top: '#ffd166',
  sun_bot: '#ff2e88',
  ground:  '#2a0d30',
  grid:    '#a03276',
  wall_hi: '#b04a86',
  wall_md: '#5e2248',
  wall_dk: '#2c0c26',
  pit0:    '#240a2c',
  pit1:    '#07030e',
  river:   '#00e5ff',
  cable:   '#ffe9a0',
  accent:  '#00f5d4',
};

// ── Sprite base dimensions (1:1 with sheet) ──────────────────────────────────
const SEG_W = 16, SEG_H = 12;
const HERO_W = 16, HERO_H = 22;
const CAB_W = 22, CAB_H = 16;
const TRO_W = 10, TRO_H = 7;

export const N_SEG = 10;               // bridge segments across the canyon

// ── Delivery / finale timings (ms) ───────────────────────────────────────────
const MOVE_MS  = 520;                  // trolley travels to the slot
const LOWER_MS = 680;                  // segment descends to the deck
const LOCK_MS  = 200;                  // clunk beat
export const LAST_DROP_MS   = 950;     // finale: last segment rush-drop → LOCK
export const CROSS_START_MS = 1300;    // hero starts running across
export const CROSS_MS       = 2100;    // crossing duration
export const CHEER_MS       = CROSS_START_MS + CROSS_MS;   // arrival cheer
const FINALE_DONE_MS = 4800;

// ── Pure logic (exported for unit tests) ─────────────────────────────────────
export function clampN(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/** Solid segments earned by elapsed progress. The LAST slot is reserved for
 *  the finale, so during the countdown this caps at N_SEG-1. */
export function segmentsPlaced(progress, n = N_SEG) {
  if (progress >= 1) return n;
  return clampN(Math.floor(progress * n), 0, n - 1);
}

/** Ghost segments still hanging over the gap (== remaining time). */
export function ghostCount(placed, n = N_SEG) { return clampN(n - placed, 0, n); }

/** Hero deck-crossing parameter 0..1 for a finale-elapsed time (ms). */
export function crossT(finaleMs) {
  return clampN((finaleMs - CROSS_START_MS) / CROSS_MS, 0, 1);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const lerp  = (a, b, t) => a + (b - a) * t;
const lerpH = (a, b, t) => lerpHex(a, b, clampN(t, 0, 1));
const easeOut = t => 1 - Math.pow(1 - t, 2);

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

// ── BridgeScene ──────────────────────────────────────────────────────────────
export class BridgeScene extends Scene {

  layout(W, H) {
    this.W = W;
    this.H = H;
    this._layoutDone = true;
    const landscape = W > H;
    const minDim = Math.min(W, H);

    // Deck line = cliff-top surface. Sits high enough to show canyon depth.
    this.GY = Math.round(H * (landscape ? 0.60 : 0.56));

    // Canyon gap (two cliff edges anchored as fractions of W)
    this.gapX0 = Math.round(W * 0.20);
    this.gapX1 = Math.round(W * 0.78);
    const gapW = this.gapX1 - this.gapX0;

    // Segment slots: integer x edges so the deck tiles with no gaps
    this.segX = [];
    for (let i = 0; i <= N_SEG; i++) this.segX.push(this.gapX0 + Math.round(i * gapW / N_SEG));
    this.segScale = (gapW / N_SEG) / SEG_W;
    this.segH = SEG_H * this.segScale;

    // Actors
    this.heroScale = Math.max(1, minDim / 130);
    this.heroHomeX = this.gapX0 - Math.round(HERO_W * this.heroScale * 0.75);
    this.heroGoalX = this.gapX1 + Math.round(W * 0.045);

    // Crane on the RIGHT cliff (solid ground), jib spanning the whole gap
    this.craneScale = Math.max(1, minDim / 150);
    this.towerX = Math.round(this.gapX1 + (W - this.gapX1) * 0.62);
    this.jibY = Math.round(this.GY - H * (landscape ? 0.34 : 0.26));
    this.jibX0 = this.gapX0 - Math.round(W * 0.02);   // jib tip past the far edge
    this.jibX1 = Math.round(this.towerX + Math.min(W - this.towerX - 2, W * 0.055)); // counter-jib
    this.apexY = this.jibY - Math.round(H * 0.05);

    // Canyon interior (walls narrow slightly toward the bottom)
    this.wallIn = Math.round(gapW * 0.055);

    // Flag on the far cliff
    this.flagScale = Math.max(1, minDim / 160);
    this.flagX = Math.min(this.heroGoalX + Math.round(W * 0.055), W - Math.round(14 * this.flagScale) - 2);

    // Retro sun (over the canyon center, behind the bridge)
    this.sunX = Math.round((this.gapX0 + this.gapX1) / 2);
    this.sunY = Math.round(H * 0.30);
    this.sunR = Math.round(minDim * 0.11);

    // Décor spots (deterministic, resolution-relative)
    this.decor = [
      { f: 'rock0',  x: W * 0.035, s: 1.0 },
      { f: 'cactus', x: W * 0.10,  s: 1.1 },
      { f: 'rock1',  x: this.gapX0 - W * 0.16, s: 0.9 },
      { f: 'rock1',  x: this.gapX1 + W * 0.015, s: 0.8 },
      { f: 'cactus', x: W * 0.955, s: 0.9 },
    ];

    // Static stars in the upper sky (seeded)
    let s = 0xb21d;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    this.stars = [];
    for (let i = 0; i < 14; i++) this.stars.push({ x: rnd() * W, y: rnd() * H * 0.20, b: 0.4 + rnd() * 0.6 });

    if (this._trolleyX === undefined) this._trolleyX = this.towerX;
  }

  init(durationMs) {
    if (!this._layoutDone) this.layout(this.ctx.canvas.width, this.ctx.canvas.height);

    this.t = 0;
    this.progress = 0;
    this.finale = 0;

    this._placed = 0;              // solid segments locked in
    this._deliv = null;            // active crane delivery {idx, phase, t, fromX}
    this._trolleyX = this.towerX;
    this._sway = 0;                // hanging-load pendulum phase

    this._flashA = 0;              // milestone flash
    this._lockFlashA = 0;          // finale last-lock flash
    this._milestonesFired = 0;

    this._lastDropped = false;     // finale: final segment locked
    this._crossed = false;         // finale: hero reached the far side
    this._cheered = false;         // finale: arrival celebration fired
    this._runFr = 0;
    this._runT = 0;
    this._dustT = 0;

    this._parts = [];              // dust puffs / sparkles
  }

  _spawnPuff(x, y, big) {
    if (this.reducedMotion) return;
    this._parts.push({
      kind: 'puff', x, y,
      vx: (Math.random() * 2 - 1) * 24, vy: -10 - Math.random() * 14,
      age: 0, max: big ? 560 : 420,
    });
  }

  _spawnSparkBurst(x, y, n) {
    if (this.reducedMotion) return;
    for (let i = 0; i < n; i++) {
      this._parts.push({
        kind: 'spark', x, y,
        vx: (Math.random() * 2 - 1) * 55,
        vy: -35 - Math.random() * 60,
        age: 0, max: 500 + Math.random() * 300,
      });
    }
  }

  update(progress, dtMs) {
    this.t += dtMs;
    this.progress = progress;

    // GOTCHA: advance the finale timer BEFORE any reduced-motion early return
    // so isFinaleDone() can eventually fire and the run screen advances.
    if (this.finale > 0) this.finale += dtMs;

    // Flash fades (cheap; keep under reduced motion too)
    if (this._flashA > 0) { this._flashA -= dtMs / 320; if (this._flashA < 0) this._flashA = 0; }
    if (this._lockFlashA > 0) { this._lockFlashA -= dtMs / 300; if (this._lockFlashA < 0) this._lockFlashA = 0; }

    const target = this.finale > 0 ? N_SEG - 1 : segmentsPlaced(progress);

    if (this.reducedMotion) {
      // Essential progress only: segments appear at the earned count.
      this._parts.length = 0;
      this._deliv = null;
      this._placed = Math.max(this._placed, target);
      if (this.finale > LAST_DROP_MS) this._lastDropped = true;
      if (this._lastDropped) this._placed = N_SEG;
      return;
    }

    // ── Crane delivery state machine (countdown) ────────────────────────────
    if (this.finale === 0) {
      // Instant catch-up if we fall ≥2 segments behind (short timers, resume)
      if (target - this._placed >= 2) this._placed = target - 1;

      if (!this._deliv && this._placed < target) {
        this._deliv = { idx: this._placed, phase: 'move', t: 0, fromX: this._trolleyX };
      }
      this._tickDelivery(dtMs, MOVE_MS, LOWER_MS);
    } else {
      this._tickFinale(dtMs);
    }

    // Hanging-load pendulum sway
    this._sway += dtMs / 420;

    // Hero run-cycle timer
    this._runT += dtMs;
    if (this._runT >= 110) { this._runFr ^= 1; this._runT = 0; }

    // ── Particles ───────────────────────────────────────────────────────────
    if (this._parts.length) {
      const g = 150;
      for (const p of this._parts) {
        p.age += dtMs;
        p.x += p.vx * (dtMs / 1000);
        p.y += p.vy * (dtMs / 1000);
        if (p.kind === 'spark') p.vy += g * (dtMs / 1000);
      }
      this._parts = this._parts.filter(p => p.age < p.max);
    }
  }

  /** Advance the active delivery. Returns true when a segment locks. */
  _tickDelivery(dtMs, moveMs, lowerMs) {
    const dv = this._deliv;
    if (!dv) return false;
    dv.t += dtMs;
    const slotCX = (this.segX[dv.idx] + this.segX[dv.idx + 1]) / 2;

    if (dv.phase === 'move') {
      const k = easeOut(clampN(dv.t / moveMs, 0, 1));
      this._trolleyX = lerp(dv.fromX, slotCX, k);
      if (dv.t >= moveMs) { dv.phase = 'lower'; dv.t = 0; }
    } else if (dv.phase === 'lower') {
      this._trolleyX = slotCX;
      if (dv.t >= lowerMs) {
        dv.phase = 'lock'; dv.t = 0;
        this._placed = dv.idx + 1;
        audio.sfx('click');
        this._spawnPuff(this.segX[dv.idx] + 2, this.GY + 2);
        this._spawnPuff(this.segX[dv.idx + 1] - 2, this.GY + 2);
      }
    } else if (dv.phase === 'lock') {
      if (dv.t >= LOCK_MS) { this._deliv = null; return true; }
    }
    return false;
  }

  _tickFinale(dtMs) {
    // Rush the LAST segment into its slot, then the hero crosses.
    if (!this._lastDropped) {
      if (!this._deliv || this._deliv.idx !== N_SEG - 1) {
        this._deliv = { idx: N_SEG - 1, phase: 'move', t: 0, fromX: this._trolleyX };
      }
      // Faster finale drop timings so it locks by ~LAST_DROP_MS
      this._tickDelivery(dtMs, 300, 520);
      if (this._placed >= N_SEG || this.finale >= LAST_DROP_MS) {
        this._placed = N_SEG;
        if (!this._lastDropped) {
          this._lastDropped = true;
          this._deliv = null;
          this._lockFlashA = 0.5;
          audio.sfx('build');
          const cx = (this.segX[N_SEG - 1] + this.segX[N_SEG]) / 2;
          this._spawnPuff(cx - 4, this.GY + 2, true);
          this._spawnPuff(cx + 4, this.GY + 2, true);
          this._spawnSparkBurst(cx, this.GY - 4, 8);
        }
      }
    }

    // Running dust at the hero's feet during the crossing
    const ct = crossT(this.finale);
    if (ct > 0 && ct < 1) {
      this._dustT += dtMs;
      if (this._dustT >= 260) {
        this._dustT = 0;
        this._spawnPuff(this._heroX ?? this.heroHomeX, this.GY + 1);
      }
    }

    // Arrival cheer: sparkles + coin ping (one-shot)
    if (this.finale >= CHEER_MS && !this._cheered) {
      this._cheered = true;
      audio.sfx('coin');
      this._spawnSparkBurst(this.heroGoalX, this.GY - HERO_H * this.heroScale, 10);
      this._spawnSparkBurst(this.flagX + 7 * this.flagScale, this.GY - 14 * this.flagScale, 6);
    }
  }

  onMilestone(i, total) {
    this._milestonesFired = i;          // i is 1-indexed (1..total)
    this._flashA = 0.4;
    audio.sfx('build');
    // Dust clunk beat at the newest placed segment edge
    const idx = clampN(this._placed, 0, N_SEG - 1);
    this._spawnPuff(this.segX[idx], this.GY + 2, true);
    this._spawnSparkBurst(this.segX[idx], this.GY - 2, 5);
  }

  onComplete() {
    this.finale = 1;
    this._milestonesFired = 5;
    audio.sfx('win');
  }

  isFinaleDone() { return this.finale > FINALE_DONE_MS; }

  // ── Rendering ────────────────────────────────────────────────────────────────
  render() {
    const ctx = this.ctx, W = this.W, H = this.H, GY = this.GY, sh = this.assets;
    ctx.imageSmoothingEnabled = false;

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, GY);
    sky.addColorStop(0, C.sky0); sky.addColorStop(1, C.sky1);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, GY);

    // Stars
    for (const st of this.stars) {
      ctx.fillStyle = `rgba(233,233,255,${(st.b * 0.7).toFixed(2)})`;
      ctx.fillRect(Math.round(st.x), Math.round(st.y), 1, 1);
    }

    // Retro sun behind the canyon
    drawSun(ctx, this.sunX, this.sunY, this.sunR, C.sun_top, C.sun_bot);

    // Ground plateaus + synthwave grid (then the canyon is carved over it)
    ctx.fillStyle = C.ground; ctx.fillRect(0, GY, W, H - GY);
    const scrollT = this.reducedMotion ? 0 : (this.t / 3600) % 1;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, GY, W, H - GY); ctx.clip();
    drawGrid(ctx, W, H, GY, C.grid, scrollT);
    ctx.restore();

    this._drawCanyon(ctx);

    if (sh) {
      this._drawDecor(ctx, sh);
      this._drawFlag(ctx, sh);
      this._drawSegments(ctx, sh);
      this._drawCrane(ctx, sh);
      this._drawHero(ctx, sh);
      this._drawParticles(ctx, sh);
    }

    // Milestone / finale-lock flashes
    if (this._flashA > 0) {
      ctx.fillStyle = `rgba(0,229,255,${this._flashA.toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (this._lockFlashA > 0) {
      ctx.fillStyle = `rgba(255,240,170,${this._lockFlashA.toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  _drawCanyon(ctx) {
    const GY = this.GY, H = this.H;
    const x0 = this.gapX0, x1 = this.gapX1, inn = this.wallIn;

    // Dark pit (vertical gradient), walls narrowing toward the bottom
    const pit = ctx.createLinearGradient(0, GY, 0, H);
    pit.addColorStop(0, C.pit0); pit.addColorStop(1, C.pit1);
    ctx.fillStyle = pit;
    ctx.beginPath();
    ctx.moveTo(x0, GY); ctx.lineTo(x1, GY);
    ctx.lineTo(x1 - inn, H); ctx.lineTo(x0 + inn, H);
    ctx.closePath(); ctx.fill();

    // Cliff wall faces: strata ledges fading with depth
    const depth = H - GY;
    for (let k = 1; k <= 6; k++) {
      const t = k / 7;
      const y = Math.round(GY + depth * t);
      const fade = 1 - t * 0.8;
      const lw = Math.max(2, Math.round((this.W * 0.035) * (1 - t * 0.5)));
      ctx.fillStyle = lerpH(C.wall_hi, C.wall_dk, 1 - fade);
      ctx.fillRect(Math.round(x0 + inn * t), y, lw, 1);                    // left wall ledge
      ctx.fillRect(Math.round(x1 - inn * t) - lw, y, lw, 1);               // right wall ledge
    }
    // Bright cliff rims
    ctx.fillStyle = C.wall_hi;
    ctx.fillRect(x0 - 1, GY, 2, 1);
    ctx.fillRect(x1 - 1, GY, 2, 1);
    ctx.fillStyle = C.wall_md;
    ctx.fillRect(x0 - 1, GY + 1, 2, 3);
    ctx.fillRect(x1 - 1, GY + 1, 2, 3);

    // Glowing river at the very bottom
    const ry = H - Math.max(3, Math.round(H * 0.012)) - 1;
    const shimmer = this.reducedMotion ? 0 : Math.round(Math.sin(this.t / 500) * 2);
    ctx.fillStyle = 'rgba(0,229,255,0.18)';
    ctx.fillRect(x0 + inn, ry - 2, (x1 - inn) - (x0 + inn), 5);
    ctx.fillStyle = C.river;
    ctx.fillRect(x0 + inn + 2 + shimmer, ry, (x1 - inn) - (x0 + inn) - 4, 1);
    ctx.fillStyle = 'rgba(180,250,255,0.8)';
    ctx.fillRect(x0 + inn + 6 - shimmer, ry + 1, Math.round((x1 - x0) * 0.3), 1);
  }

  _drawDecor(ctx, sh) {
    for (const dc of this.decor) {
      const s = Math.max(1, this.heroScale * 0.8 * dc.s);
      const f = sh.frames[dc.f]; if (!f) continue;
      blit(ctx, sh, dc.f, Math.round(dc.x), Math.round(this.GY - f[3] * s + 1), s);
    }
  }

  _drawFlag(ctx, sh) {
    const s = this.flagScale;
    blit(ctx, sh, 'flag', Math.round(this.flagX), Math.round(this.GY - 18 * s + 1), s);
  }

  _drawSegments(ctx, sh) {
    const GY = this.GY;
    // Ghost outlines for every unbuilt slot (== remaining time), gentle pulse
    for (let i = this._placed; i < N_SEG; i++) {
      if (this._deliv && this._deliv.idx === i && this._deliv.phase === 'lower' && !this.reducedMotion) {
        // keep the ghost under the descending segment — it reads as the target
      }
      const w = this.segX[i + 1] - this.segX[i];
      const a = this.reducedMotion ? 0.65 : 0.45 + 0.25 * Math.sin(this.t / 420 + i * 0.9);
      ctx.globalAlpha = clampN(a, 0.2, 0.9);
      blit(ctx, sh, 'seg_ghost', this.segX[i], GY, w / SEG_W);
      ctx.globalAlpha = 1;
    }
    // Solid placed segments
    for (let i = 0; i < this._placed && i < N_SEG; i++) {
      const w = this.segX[i + 1] - this.segX[i];
      blit(ctx, sh, 'seg', this.segX[i], GY, w / SEG_W);
    }
  }

  _drawCrane(ctx, sh) {
    const GY = this.GY, cs = this.craneScale;
    const tx = this.towerX;
    const jibY = this.jibY, apexY = this.apexY;
    const rail = Math.max(1, Math.round(cs));
    const gold = '#ffd24a', goldD = '#b0801f', goldH = '#ffe9a0';

    // Tower lattice (from cab top up to the jib)
    const towerW = Math.max(3, Math.round(4 * cs));
    const cabTop = GY - CAB_H * cs;
    ctx.fillStyle = goldD;
    ctx.fillRect(Math.round(tx - towerW / 2), jibY, rail, cabTop - jibY);
    ctx.fillStyle = gold;
    ctx.fillRect(Math.round(tx + towerW / 2) - rail, jibY, rail, cabTop - jibY);
    ctx.strokeStyle = goldD; ctx.lineWidth = 1;
    const zz = Math.max(4, Math.round(6 * cs));
    for (let y = jibY, k = 0; y < cabTop - zz; y += zz, k++) {
      ctx.beginPath();
      if (k % 2) { ctx.moveTo(tx - towerW / 2, y); ctx.lineTo(tx + towerW / 2, y + zz); }
      else       { ctx.moveTo(tx + towerW / 2, y); ctx.lineTo(tx - towerW / 2, y + zz); }
      ctx.stroke();
    }

    // Jib (double chord) spanning the gap + short counter-jib
    ctx.fillStyle = gold;
    ctx.fillRect(this.jibX0, jibY, this.jibX1 - this.jibX0, rail);
    ctx.fillStyle = goldD;
    const chordGap = Math.max(2, Math.round(3 * cs));
    ctx.fillRect(this.jibX0, jibY + chordGap, this.jibX1 - this.jibX0, rail);
    // Jib lattice verticals
    ctx.strokeStyle = goldD;
    const step = Math.max(6, Math.round(9 * cs));
    for (let x = this.jibX0, k = 0; x < this.jibX1; x += step, k++) {
      ctx.beginPath(); ctx.moveTo(x, jibY); ctx.lineTo(x + (k % 2 ? step : -step) / 2, jibY + chordGap); ctx.stroke();
    }
    // Apex + tie cables to jib tip and counter-jib
    ctx.fillStyle = gold;
    ctx.fillRect(Math.round(tx - rail / 2), apexY, rail, jibY - apexY);
    ctx.strokeStyle = C.cable;
    ctx.beginPath(); ctx.moveTo(tx, apexY); ctx.lineTo(this.jibX0 + 1, jibY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tx, apexY); ctx.lineTo(this.jibX1 - 1, jibY); ctx.stroke();
    // Counterweight
    ctx.fillStyle = '#22142c';
    const cwW = Math.max(4, Math.round(6 * cs)), cwH = Math.max(4, Math.round(6 * cs));
    ctx.fillRect(this.jibX1 - cwW, jibY + chordGap + rail, cwW, cwH);
    ctx.fillStyle = goldH;
    ctx.fillRect(this.jibX1 - cwW, jibY + chordGap + rail, cwW, 1);

    // Cab sprite at the tower base (grounded on the right cliff)
    blit(ctx, sh, 'crane_cab', Math.round(tx - 15 * cs), Math.round(cabTop + 1), cs);

    // Trolley + cable + hanging segment (during a delivery)
    const trX = Math.round(this._trolleyX);
    blit(ctx, sh, 'trolley', Math.round(trX - TRO_W * cs / 2), jibY + chordGap + rail, cs);

    const dv = this._deliv;
    if (dv && (dv.phase === 'move' || dv.phase === 'lower')) {
      const hangTop = jibY + chordGap + rail + TRO_H * cs;
      const segS = this.segScale;
      let segTopY;
      if (dv.phase === 'move') segTopY = hangTop + Math.round(4 * cs);
      else {
        const dropMs = this.finale > 0 ? 520 : LOWER_MS;
        const k = easeOut(clampN(dv.t / dropMs, 0, 1));
        segTopY = Math.round(lerp(hangTop + 4 * cs, GY, k));
      }
      const swayX = (this.reducedMotion || dv.phase === 'lower') ? 0
        : Math.round(Math.sin(this._sway) * 2);
      const segCX = trX + swayX;
      // Cable
      ctx.strokeStyle = C.cable;
      ctx.beginPath(); ctx.moveTo(trX, hangTop - Math.round(2 * cs)); ctx.lineTo(segCX, segTopY); ctx.stroke();
      blit(ctx, sh, 'seg', Math.round(segCX - SEG_W * segS / 2), segTopY, segS);
    } else if (!this.reducedMotion) {
      // Idle: short empty hook cable swaying gently
      const hangTop = jibY + chordGap + rail + TRO_H * cs;
      const swayX = Math.round(Math.sin(this._sway * 0.7) * 1.5);
      ctx.strokeStyle = C.cable;
      ctx.beginPath(); ctx.moveTo(trX, hangTop - Math.round(2 * cs));
      ctx.lineTo(trX + swayX, hangTop + Math.round(6 * cs)); ctx.stroke();
      ctx.fillStyle = '#ffe9a0';
      ctx.fillRect(trX + swayX - 1, hangTop + Math.round(6 * cs), 2, 2);
    }
  }

  _drawHero(ctx, sh) {
    const s = this.heroScale, GY = this.GY;
    const ct = crossT(this.finale);
    let x = Math.round(lerp(this.heroHomeX, this.heroGoalX, ct));
    let frame;
    if (this.finale >= CHEER_MS) {
      frame = 'hero_cheer';
      x = this.heroGoalX;
    } else if (ct > 0) {
      frame = this.reducedMotion ? 'hero_run0' : (this._runFr ? 'hero_run1' : 'hero_run0');
    } else {
      frame = this.reducedMotion ? 'hero_idle0'
        : (Math.floor(this.t / 640) % 2 ? 'hero_idle1' : 'hero_idle0');
    }
    this._heroX = x;
    // Feet planted ON the surface: cliff top / bridge deck are the same line (GY).
    const topY = Math.round(GY - HERO_H * s + 1);
    // Soft ground shadow keeps him visually anchored
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(Math.round(x - 5 * s), GY, Math.round(10 * s), 1);
    blit(ctx, sh, frame, Math.round(x - HERO_W * s / 2), topY, s);
  }

  _drawParticles(ctx, sh) {
    if (this.reducedMotion || !this._parts.length) return;
    for (const p of this._parts) {
      const a = 1 - p.age / p.max;
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      if (p.kind === 'puff') {
        blit(ctx, sh, 'puff', Math.round(p.x - 9), Math.round(p.y - 7), Math.max(1, this.heroScale * 0.7));
      } else {
        const fr = ['sparkle0', 'sparkle1', 'sparkle2'][Math.floor(p.age / 120) % 3];
        blit(ctx, sh, fr, Math.round(p.x - 4), Math.round(p.y - 4), 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  dispose() {}
}
