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

// ── Sprite base dimensions (1:1 with sheet) ──────────────────────────────────
const PIKA_W = 150, PIKA_SIT_H = 140, PIKA_STAND_H = 170; // pikachu boxes
const FOOD_W = 44, FOOD_H = 40;                            // food item box
const PLATE_W = 320, PLATE_H = 110;                        // platter box
const CRUMB_PX = 12;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export class FeastScene extends Scene {

  // Recompute ALL positions from W/H. Called before init() and on every resize.
  layout(W, H) {
    this.W = W;
    this.H = H;
    this._layoutDone = true;
    const landscape = W > H;
    const short = Math.min(W, H);

    // Platter (big oval of food) — sits low-centre / low-left of the stage.
    this.plateCX = landscape ? W * 0.42 : W * 0.5;
    this.plateCY = landscape ? H * 0.72 : H * 0.66;
    this.plateDrawW = landscape ? short * 0.95 : W * 0.88;
    this.plateScale = this.plateDrawW / PLATE_W;
    this.plateDrawH = PLATE_H * this.plateScale;

    // Pikachu — sits to the RIGHT of the platter, facing left, grounded at feet.
    this.pikaX = landscape ? W * 0.74 : W * 0.68;
    this.pikaY = H * 0.82;                       // feet baseline (grounded)
    this.pikaScale = (short * 0.55) / PIKA_SIT_H; // target sitting draw height

    // Food draw scale (~plateW/8.5 across).
    this.foodScale = (this.plateDrawW / 8.5) / FOOD_W;

    // Checker cloth region under the platter.
    this.clothX = Math.round(this.plateCX - this.plateDrawW * 0.62);
    this.clothW = Math.round(this.plateDrawW * 1.24);
    this.clothY = Math.round(this.plateCY - this.plateDrawH * 0.35);
    this.clothH = Math.round(H - this.clothY);
    this.clothSq = Math.max(6, Math.round(this.plateDrawW / 9));

    this._computeSlots();
  }

  // 14 food slots on the oval: a back arc of 6 (drawn first, slightly smaller)
  // and a front arc of 8. Positions are fractions of the plate half-extents.
  _computeSlots() {
    const cx = this.plateCX, cy = this.plateCY;
    const rx = this.plateDrawW * 0.5, ry = this.plateDrawH * 0.5;
    const slots = [];
    // back arc (indices 0..5): far edge of the oval, higher on screen, smaller.
    for (let i = 0; i < 6; i++) {
      const u = (i + 0.5) / 6;                 // 0..1 across the back
      const ang = Math.PI + u * Math.PI;       // π..2π → sin<0 → above centre
      slots.push({
        x: cx + Math.cos(ang) * rx * 0.78,
        y: cy + Math.sin(ang) * ry * 0.62 - ry * 0.06,
        s: 0.82,
      });
    }
    // front arc (indices 6..13, 13 = ketchup, nearest & eaten last): full size.
    for (let i = 0; i < 8; i++) {
      const u = (i + 0.5) / 8;                 // 0..1 across the front
      const ang = u * Math.PI;                 // 0..π → sin>0 → below centre
      slots.push({
        x: cx + Math.cos(ang) * rx * 0.86,
        y: cy + Math.sin(ang) * ry * 0.66 + ry * 0.04,
        s: 1.0,
      });
    }
    this.slots = slots;
  }

  init(durationMs) {
    if (!this._layoutDone) this.layout(this.ctx.canvas.width, this.ctx.canvas.height);
    this.t = 0;
    this.progress = 0;
    this.finale = 0;
    this.crumbs = [];
    this._lastEaten = 0;
    this._stormSfx = false;
    this._boltT = 0;
    this._bolts = [];
    this._flash = 0;
  }

  _spawnCrumb(x, y) {
    this.crumbs.push({
      x, y,
      vx: (Math.random() * 2 - 1) * 34,
      vy: -20 - Math.random() * 34,
      age: 0, max: 700,
      fr: Math.random() < 0.5 ? 'crumb0' : 'crumb1',
    });
  }

  update(progress, dtMs) {
    this.t += dtMs;
    this.progress = progress;

    // GOTCHA (§8): advance the finale timer BEFORE the reduced-motion return.
    if (this.finale > 0) this.finale += dtMs;

    // Storm entry sfx — fire once when the finale reaches the storm phase.
    if (this.finale >= 1200 && !this._stormSfx) {
      this._stormSfx = true;
      audio.sfx('alarm');
      audio.sfx('win');
    }

    // Eat detection (runs in both motion modes: sfx + flag stay consistent).
    if (this.finale === 0) {
      const eaten = itemsEaten(progress);
      if (eaten > this._lastEaten) {
        for (let k = this._lastEaten; k < eaten; k++) {
          audio.sfx('coin');
          if (!this.reducedMotion && this.slots) {
            const slot = this.slots[k];
            const n = 3 + Math.floor(Math.random() * 3);   // 3..5
            for (let j = 0; j < n; j++) this._spawnCrumb(slot.x, slot.y - 4);
          }
        }
        this._lastEaten = eaten;
      }
    }

    // Bolt regen during the storm — runs in both modes (different cadence) so
    // reduced-motion still shows bolts, just refreshed slowly.
    if (this.finale >= 1200 && this.finale < 3700) {
      const cadence = this.reducedMotion ? 400 : 90;
      if (this._bolts.length === 0 || this.finale - this._boltT > cadence) {
        this._boltT = this.finale;
        this._genBolts();
      }
    }

    if (this.reducedMotion) return;   // skip non-essential motion below

    // Milestone flash decay.
    if (this._flash > 0) { this._flash -= dtMs / 320; if (this._flash < 0) this._flash = 0; }

    // Advance crumb particles (gravity + fade).
    if (this.crumbs.length) {
      const g = 300;
      for (const cr of this.crumbs) {
        cr.age += dtMs;
        cr.x += cr.vx * (dtMs / 1000);
        cr.y += cr.vy * (dtMs / 1000);
        cr.vy += g * (dtMs / 1000);
      }
      this.crumbs = this.crumbs.filter(cr => cr.age < cr.max);
    }
  }

  onMilestone(i, total) {
    this._flash = 0.25;
    audio.sfx('build');
  }

  onComplete() {
    this.finale = 1;
    audio.sfx('magic');
  }

  isFinaleDone() {
    return this.finale > 5000;
  }

  // Build 5..7 jagged branching bolts (top → various ground points).
  _genBolts() {
    const W = this.W, groundY = this.pikaY;
    const n = 5 + Math.floor(Math.random() * 3);      // 5..7
    const bolts = [];
    for (let i = 0; i < n; i++) {
      const segs = 6 + Math.floor(Math.random() * 5); // 6..10
      const startX = W * (0.2 + Math.random() * 0.6);
      const endX = W * (0.1 + Math.random() * 0.8);
      const pts = [];
      for (let s = 0; s <= segs; s++) {
        const u = s / segs;
        const baseX = startX + (endX - startX) * u;
        const jitter = (s === 0 || s === segs) ? 0 : (Math.random() * 2 - 1) * W * 0.04;
        pts.push({ x: baseX + jitter, y: groundY * u });
      }
      bolts.push(pts);
    }
    this._bolts = bolts;
  }

  // ── Rendering ────────────────────────────────────────────────────────────────
  render() {
    const ctx = this.ctx, W = this.W, H = this.H, sh = this.assets, p = this.progress;
    ctx.imageSmoothingEnabled = false;

    // Backdrop: warm vertical gradient + soft vignette (mouse.js pattern).
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, C.bg0);
    g.addColorStop(1, C.bg1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const vr = Math.max(W, H) * 0.72;
    const vg = ctx.createRadialGradient(W / 2, H / 2, vr * 0.34, W / 2, H / 2, vr);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(60,32,10,0.30)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    if (!sh) return;

    const ms = this.finale;
    const inFinale = ms > 0;

    // Screen shake (storm only, not reduced motion) wraps ALL world drawing.
    let shx = 0, shy = 0;
    if (inFinale && ms >= 1200 && ms < 3700 && !this.reducedMotion) {
      shx = (Math.random() * 2 - 1) * 4;
      shy = (Math.random() * 2 - 1) * 4;
    }

    ctx.save();
    ctx.translate(shx, shy);

    // Red/white checker cloth under the platter (red squares at ~18% alpha).
    this._drawCloth(ctx);

    // Platter.
    blit(ctx, sh, 'plate',
      Math.round(this.plateCX - this.plateDrawW / 2),
      Math.round(this.plateCY - this.plateDrawH / 2),
      this.plateScale);

    // Uneaten food, back-to-front (slots ordered back arc → front arc).
    const eaten = itemsEaten(p);
    const phase = eatPhase(p);
    for (let i = 0; i < ITEM_COUNT; i++) {
      if (i < eaten) continue;                    // already eaten → gone
      let name = `food_${i}`;
      if (i === eaten && eaten < ITEM_COUNT && phase > 0.4) name = `food_${i}_bit`;
      this._drawFood(ctx, sh, name, this.slots[i]);
    }

    // Crumbs (particles from eating).
    if (!this.reducedMotion) {
      const cs = Math.max(1, (this.foodScale * FOOD_W / CRUMB_PX) * 0.55);
      for (const cr of this.crumbs) {
        const a = 1 - cr.age / cr.max;
        if (a <= 0) continue;
        ctx.globalAlpha = a < 1 ? a : 1;
        blit(ctx, sh, cr.fr, Math.round(cr.x - CRUMB_PX * cs / 2), Math.round(cr.y - CRUMB_PX * cs / 2), cs);
      }
      ctx.globalAlpha = 1;
    }

    // Pikachu (HD sprite: smoothing ON for its blit, restored to false).
    const frame = inFinale ? this._finaleFrame(ms) : this._eatFrame();
    const bob = (inFinale || this.reducedMotion) ? 0 : Math.sin(this.t / 300) * 1.5;
    const pd = this._drawPika(ctx, sh, frame, bob);   // returns {dw,dh}

    // Finale world-space effects (shake with Pikachu).
    if (inFinale) {
      if (ms < 1200) {
        if (!this.reducedMotion) this._drawCheekSparks(ctx, pd);
      } else if (ms < 3700) {
        this._drawStorm(ctx, pd);
      } else {
        this._drawSettle(ctx, pd);
      }
    }

    ctx.restore();

    // Full-screen storm flash pulse (not shaken; skipped under reduced motion).
    if (inFinale && ms >= 1200 && ms < 3700 && !this.reducedMotion) {
      const fa = 0.85 * (1 - ((ms - 1200) % 220) / 220);
      ctx.fillStyle = `rgba(255,255,255,${fa.toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Milestone soft flash (warm white; not under reduced motion).
    if (this._flash > 0 && !this.reducedMotion) {
      ctx.fillStyle = `rgba(255,245,220,${this._flash.toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // Checker cloth: only the red squares drawn (low alpha); gaps = gradient.
  _drawCloth(ctx) {
    const sq = this.clothSq;
    const x0 = this.clothX, y0 = this.clothY, w = this.clothW, h = this.clothH;
    ctx.fillStyle = C.cloth;
    ctx.globalAlpha = 0.18;
    const cols = Math.ceil(w / sq), rows = Math.ceil(h / sq);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if ((r + c) % 2 !== 0) continue;
        const x = x0 + c * sq, y = y0 + r * sq;
        ctx.fillRect(x, y, Math.min(sq, x0 + w - x), Math.min(sq, y0 + h - y));
      }
    }
    ctx.globalAlpha = 1;
  }

  _drawFood(ctx, sh, name, slot) {
    const scale = this.foodScale * slot.s;
    const dw = FOOD_W * scale, dh = FOOD_H * scale;
    blit(ctx, sh, name, Math.round(slot.x - dw / 2), Math.round(slot.y - dh / 2), scale);
  }

  // Sitting frame selection (pre-finale), driven by progress + this.t.
  _eatFrame() {
    const p = this.progress;
    const s = bellyStage(p);
    if (itemsEaten(p) >= ITEM_COUNT) return this._idleFrame(s);
    const act = eatAction(eatPhase(p));
    if (act === 'lean') return `pika_s${s}_lean`;
    if (act === 'chew') {
      const fr = this.reducedMotion ? 0 : Math.floor(this.t / 120) % 3;
      return `pika_s${s}_chew${fr}`;
    }
    return this._idleFrame(s);   // swallow → idle
  }

  _idleFrame(s) {
    const blink = !this.reducedMotion && (this.t % 3000) < 150;
    return `pika_s${s}_${blink ? 'idle1' : 'idle0'}`;
  }

  _finaleFrame(ms) {
    if (ms < 1200) {
      const cadence = this.reducedMotion ? 300 : 140;
      const idx = Math.floor(ms / cadence) % 3;
      return ['pika_stand', 'pika_charge0', 'pika_charge1'][idx];
    }
    if (ms < 3700) return 'pika_thunder';
    return 'pika_happy';
  }

  // Draw Pikachu grounded at its feet baseline. Returns draw box for effects.
  _drawPika(ctx, sh, frame, yOff) {
    const f = sh.frames[frame];
    const scale = this.pikaScale;
    const fw = f ? f[2] : PIKA_W, fh = f ? f[3] : PIKA_SIT_H;
    const dw = fw * scale, dh = fh * scale;
    const dx = this.pikaX - dw / 2;
    const dy = this.pikaY - dh + yOff;     // feet at pikaY → grounded
    ctx.imageSmoothingEnabled = true;
    blit(ctx, sh, frame, dx, dy, scale);
    ctx.imageSmoothingEnabled = false;
    return { dw, dh, cx: this.pikaX, topY: dy };
  }

  // Charge: small white spark dots/arcs near the cheeks.
  _drawCheekSparks(ctx, pd) {
    const cy = pd.topY + pd.dh * 0.5;      // cheek height
    const dx = pd.dw * 0.30;
    ctx.strokeStyle = '#FFFFFF';
    ctx.fillStyle = '#FFFFFF';
    ctx.lineWidth = Math.max(1, pd.dw * 0.02);
    for (let side = -1; side <= 1; side += 2) {
      const bx = pd.cx + side * dx;
      const n = 3;
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = pd.dw * (0.06 + Math.random() * 0.10);
        ctx.globalAlpha = 0.5 + Math.random() * 0.5;
        ctx.fillRect(bx + Math.cos(a) * r, cy + Math.sin(a) * r, 2, 2);
      }
      // little arc
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(bx, cy, pd.dw * 0.12, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Storm: central thunder column + procedural branching bolts.
  _drawStorm(ctx, pd) {
    const W = this.W;
    const colBottom = pd.topY + pd.dh * 0.45;   // down to Pikachu's body
    const wob = this.reducedMotion ? 0 : 0.08 * Math.sin(this.finale / 40);
    const colW = W * 0.16 * (1 + wob);
    // glow edges
    ctx.fillStyle = C.boltGlow;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(pd.cx - colW / 2, 0, colW, colBottom);
    // white core
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = C.boltCore;
    ctx.fillRect(pd.cx - colW * 0.28, 0, colW * 0.56, colBottom);
    ctx.globalAlpha = 1;

    // Bolt alpha: full when animating, gentle slow sine fade under reduced motion.
    const boltA = this.reducedMotion
      ? 0.30 + 0.08 * Math.sin(this.finale / 300)
      : 1;

    for (const pts of this._bolts) {
      // yellow glow pass
      ctx.strokeStyle = C.boltGlow;
      ctx.lineWidth = 7;
      ctx.globalAlpha = boltA * 0.7;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      // white core pass
      ctx.strokeStyle = C.boltCore;
      ctx.lineWidth = 3;
      ctx.globalAlpha = boltA;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
  }

  // Settle: soft yellow radial glow + a few drifting sparkles.
  _drawSettle(ctx, pd) {
    const cx = pd.cx, cy = pd.topY + pd.dh * 0.5;
    const r = pd.dw * 1.1;
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    rg.addColorStop(0, 'rgba(255,238,120,0.35)');
    rg.addColorStop(1, 'rgba(255,238,120,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    if (this.reducedMotion) return;
    ctx.fillStyle = C.ambient;
    for (let k = 0; k < 6; k++) {
      const a = (this.finale / 900 + k * 1.7);
      const sx = cx + Math.cos(a) * pd.dw * (0.5 + 0.3 * Math.sin(a * 1.3));
      const drift = ((this.finale / 12) + k * 40) % (pd.dh);
      const sy = pd.topY + pd.dh - drift;
      ctx.globalAlpha = 0.4 + 0.4 * Math.sin(a * 2);
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  dispose() {}
}
