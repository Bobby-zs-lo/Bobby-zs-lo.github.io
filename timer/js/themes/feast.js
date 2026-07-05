/**
 * FeastScene – Pikachu eats a 14-item feast as the countdown; finale = full-screen thunder storm.
 * Sprite sheet: assets/feeding.png + feeding.json (frame names are a HARD contract with art-src/gen_feast.py).
 *
 * V2 scene design (2026-07-05):
 *  - table horizon splits wall/table so the scene fills the stage (esp. portrait)
 *  - items are eaten FRONT arc first (EAT_ORDER), so progress is visible immediately
 *  - the active item flies from its slot into Pikachu's paws and is nibbled at the
 *    mouth (cause-and-effect); the ketchup bottle (always last) gets a chug beat
 *  - eaten slots leave persistent crumb residue: the plate tells the meal's story
 *  - storm bolts have a strike->afterglow lifecycle; the column is jagged; flashes
 *    stay capped at 3 discrete pulses (WCAG 2.3.1 — no strobing in a kids' app)
 */
import { Scene, blit } from '../scene.js';
import { audio } from '../audio.js';

const C = {
  bg0: '#F5E3C0', bg1: '#E4C48F', table: '#EBCB97', cloth: '#D94F4F',
  horizon: 'rgba(120,80,40,0.28)',
  boltCore: '#FFFFFF', boltGlow: '#FFE94D', ambient: '#FFF7B0',
};

export const ITEM_COUNT = 14;

// Slot layout: 3 arcs on the platter — back slots 0..4, mid 5..9, front 10..13.
// Eat sequence: FRONT arc outside-in first (visible progress from second one),
// then mid, then back; the ketchup bottle (slot 13) is ALWAYS eaten last.
export const EAT_ORDER = [10, 12, 11, 5, 9, 6, 8, 7, 0, 4, 1, 3, 2, 13];

// slot index eaten k-th (0-based)
export function eatOrder(k) {
  return EAT_ORDER[Math.max(0, Math.min(ITEM_COUNT - 1, k))];
}

// rank of a slot in the eat sequence (inverse permutation)
const EAT_RANK = [];
EAT_ORDER.forEach((slot, k) => { EAT_RANK[slot] = k; });

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
const KETCHUP_SLOT = 13;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
// deterministic -1..1 hash (layout reruns on resize — NO Math.random here)
const jit = (i, k) => {
  const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return (v - Math.floor(v)) * 2 - 1;
};

export class FeastScene extends Scene {

  // Recompute ALL positions from W/H. Called before init() and on every resize.
  layout(W, H) {
    this.W = W;
    this.H = H;
    this._layoutDone = true;
    const landscape = W > H;
    const short = Math.min(W, H);

    // Table horizon: wall above, cloth-covered table plane below.
    this.horizonY = Math.round(H * (landscape ? 0.40 : 0.36));

    // Pikachu — right of the platter, facing left, grounded at feet.
    this.pikaScale = (short * (landscape ? 0.62 : 0.64)) / PIKA_SIT_H;
    this.pikaX = landscape ? W * 0.72 : W * 0.70;
    this.pikaY = landscape ? H * 0.86 : H * 0.76;

    // Platter — sized to the food pile, not the stage; clear of Pikachu.
    this.plateCX = landscape ? W * 0.38 : W * 0.40;
    this.plateCY = landscape ? H * 0.74 : H * 0.62;
    this.plateDrawW = landscape ? short * 0.78 : W * 0.78;
    this.plateScale = this.plateDrawW / PLATE_W;
    this.plateDrawH = PLATE_H * this.plateScale;

    // Food draw scale (~plateW/5 across — items read as a heap).
    this.foodScale = (this.plateDrawW / 5) / FOOD_W;

    // Mouth anchor (stage-0 sit frame: mouth ≈ (56,63) in the 150x140 box).
    const s = this.pikaScale;
    this.mouthX = this.pikaX - (PIKA_W * s) / 2 + 56 * s;
    this.mouthY = this.pikaY - PIKA_SIT_H * s + 63 * s;

    this.clothSq = Math.max(8, Math.round(W / 14));

    this._computeSlots();
  }

  // 14 food slots piled ON the platter in three arcs (back smaller/higher).
  _computeSlots() {
    const cx = this.plateCX, cy = this.plateCY;
    const pw = this.plateDrawW, ph = this.plateDrawH;
    const slots = [];
    const arc = (count, baseIdx, yOff, spread, s) => {
      for (let i = 0; i < count; i++) {
        const u = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;   // -1..1
        slots[baseIdx + i] = {
          x: cx + u * pw * spread + jit(baseIdx + i, 1) * pw * 0.018,
          y: cy + yOff + jit(baseIdx + i, 2) * ph * 0.04,
          s,
        };
      }
    };
    arc(5, 0, -ph * 0.22, 0.26, 0.80);   // back arc  (slots 0..4)
    arc(5, 5, -ph * 0.02, 0.30, 0.92);   // mid arc   (slots 5..9)
    arc(4, 10, ph * 0.18, 0.28, 1.0);    // front arc (slots 10..13, 13 = ketchup)
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
    this._bolts = [];        // {pts, born}
    this._lastSpawn = -1e9;
    this._colJit = null;
    this._flash = 0;
    this._celebrate = 0;
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
        audio.sfx('coin');   // one ding per frame, even if a big dtMs eats several items
        if (!this.reducedMotion) {
          const n = 3 + Math.floor(Math.random() * 3);   // 3..5 crumbs from the mouth
          for (let j = 0; j < n; j++) this._spawnCrumb(this.mouthX, this.mouthY + 4);
        }
        this._lastEaten = eaten;
      }
    }

    // Storm bolt lifecycle: strikes spawn every ~300ms and afterglow-fade out
    // (runs in both motion modes; reduced motion spawns slower + draws gentler).
    if (this.finale >= 1200 && this.finale < 3700) {
      const cadence = this.reducedMotion ? 600 : 300;
      if (this.finale - this._lastSpawn > cadence || this._bolts.length === 0) {
        this._lastSpawn = this.finale;
        this._spawnBolt();
        if (!this.reducedMotion && Math.random() < 0.3) this._spawnBolt();
        this._colJit = this._makeColJit();
      }
      const life = this.reducedMotion ? 900 : 450;
      this._bolts = this._bolts.filter(b => this.finale - b.born < life);
    }

    // Milestone celebration timer (sparkles) — decays in both modes.
    if (this._celebrate > 0) { this._celebrate -= dtMs; if (this._celebrate < 0) this._celebrate = 0; }

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
    this._flash = 0.15;        // soft warm pulse only — Pikachu does the celebrating
    this._celebrate = 600;
    audio.sfx('build');
  }

  onComplete() {
    this.finale = 1;
    audio.sfx('magic');
  }

  isFinaleDone() {
    return this.finale > 5000;
  }

  // One jagged bolt from the sky to a ground point (world coords).
  _spawnBolt() {
    const W = this.W, groundY = this.pikaY;
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
    this._bolts.push({ pts, born: this.finale });
  }

  // Per-strike edge jitter for the jagged thunder column (8 segments).
  _makeColJit() {
    const arr = [];
    for (let i = 0; i <= 8; i++) arr.push((Math.random() * 2 - 1));
    return arr;
  }

  // ── Rendering ────────────────────────────────────────────────────────────────
  render() {
    const ctx = this.ctx, W = this.W, H = this.H, sh = this.assets, p = this.progress;

    // Backdrop: warm wall gradient above the horizon, table plane below.
    const g = ctx.createLinearGradient(0, 0, 0, this.horizonY);
    g.addColorStop(0, C.bg0);
    g.addColorStop(1, C.bg1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, this.horizonY);
    ctx.fillStyle = C.table;
    ctx.fillRect(0, this.horizonY, W, H - this.horizonY);

    // Soft vignette over the whole stage.
    const vr = Math.max(W, H) * 0.72;
    const vg = ctx.createRadialGradient(W / 2, H / 2, vr * 0.34, W / 2, H / 2, vr);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(60,32,10,0.30)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    if (!sh) return;
    ctx.imageSmoothingEnabled = true;   // the whole scene is HD LANCZOS art

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

    // Checker cloth across the WHOLE table plane (grounded, no floating patch).
    this._drawCloth(ctx);

    // Platter.
    blit(ctx, sh, 'plate',
      Math.round(this.plateCX - this.plateDrawW / 2),
      Math.round(this.plateCY - this.plateDrawH / 2),
      this.plateScale);

    // Persistent residue on eaten slots — the plate tells the meal's story.
    const eaten = itemsEaten(p);
    const phase = eatPhase(p);
    this._drawResidue(ctx, sh, eaten);

    // Uneaten food, painter-sorted back-to-front by slot y; the active item is
    // drawn separately (it is flying to / held at the mouth).
    const activeSlot = (this.finale === 0 && eaten < ITEM_COUNT) ? EAT_ORDER[eaten] : -1;
    const order = [...Array(ITEM_COUNT).keys()]
      .filter(i => EAT_RANK[i] > eaten || (EAT_RANK[i] === eaten && i !== activeSlot))
      .sort((a, b) => this.slots[a].y - this.slots[b].y);
    for (const i of order) this._drawFood(ctx, sh, `food_${i}`, this.slots[i]);

    // Crumb particles (from eating).
    if (!this.reducedMotion && this.crumbs.length) {
      const cs = Math.max(1, (this.foodScale * FOOD_W / CRUMB_PX) * 0.5);
      for (const cr of this.crumbs) {
        const a = 1 - cr.age / cr.max;
        if (a <= 0) continue;
        ctx.globalAlpha = a < 1 ? a : 1;
        blit(ctx, sh, cr.fr, Math.round(cr.x - CRUMB_PX * cs / 2), Math.round(cr.y - CRUMB_PX * cs / 2), cs);
      }
      ctx.globalAlpha = 1;
    }

    // Active item: fly-to-mouth arc during lean, held/nibbled at the paws while
    // chewing (the sprite's paw-at-mouth pose holds it), gone on swallow. The
    // ketchup chug beat instead draws AFTER Pikachu (in front of the face).
    const ketchupBeat = activeSlot === KETCHUP_SLOT && phase >= 0.18;
    if (activeSlot >= 0 && phase < 0.85 && !ketchupBeat) {
      this._drawActiveItem(ctx, sh, activeSlot, phase);
    }

    // Ground shadow under Pikachu.
    {
      const dw = PIKA_W * this.pikaScale;
      ctx.fillStyle = 'rgba(60,32,10,0.16)';
      ctx.beginPath();
      ctx.ellipse(this.pikaX, this.pikaY + 2, dw * 0.36, dw * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Storm-sky dim UNDER Pikachu/bolts: gives the bolts contrast (they wash
    // out over the beige backdrop) and carries the storm drama safely. Static
    // in reduced motion, where it also makes the gentle bolts visible at all.
    const dimA = inFinale ? this._stormDim(ms) : 0;
    if (dimA > 0) {
      ctx.fillStyle = `rgba(24,16,64,${dimA.toFixed(3)})`;
      ctx.fillRect(-8, -8, W + 16, H + 16);   // margin covers the shake offset
    }

    // Pikachu (HD sprite). Small dip "gulp" on swallow.
    const frame = inFinale ? this._finaleFrame(ms) : this._eatFrame();
    let bob = (inFinale || this.reducedMotion) ? 0 : Math.sin(this.t / 300) * 1.5;
    if (!inFinale && !this.reducedMotion && phase >= 0.85 && eaten < ITEM_COUNT) {
      bob += Math.sin(((phase - 0.85) / 0.15) * Math.PI) * 3;
    }
    const pd = this._drawPika(ctx, sh, frame, bob);   // returns {dw,dh}

    // Ketchup chug: tilted bottle in FRONT of the face (behind, it vanished).
    if (ketchupBeat && phase < 0.85) this._drawActiveItem(ctx, sh, activeSlot, phase);

    // Milestone celebration: star sparkles above the head (diegetic).
    if (this._celebrate > 0 && !inFinale && !this.reducedMotion) this._drawCelebrate(ctx, pd);

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

    // Storm flashes: 3 DISCRETE ≤120ms pulses, ≥900ms apart (WCAG 2.3.1 caps
    // general flashes at 3/s — a strobe here is a photosensitive-seizure risk
    // in a kids' app).
    if (inFinale && !this.reducedMotion) {
      for (const t0 of [1200, 2150, 3100]) {
        if (ms >= t0 && ms < t0 + 120) {
          const fa = 0.55 * (1 - (ms - t0) / 120);
          ctx.fillStyle = `rgba(255,255,255,${fa.toFixed(3)})`;
          ctx.fillRect(0, 0, W, H);
        }
      }
    }

    // Milestone soft flash (warm white; not under reduced motion).
    if (this._flash > 0 && !this.reducedMotion) {
      ctx.fillStyle = `rgba(255,245,220,${this._flash.toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.imageSmoothingEnabled = false;
  }

  // Checker cloth over the full table plane; red squares at low alpha, gaps =
  // table tone; a thin horizon line seats the wall/table split.
  _drawCloth(ctx) {
    const sq = this.clothSq;
    const y0 = this.horizonY, W = this.W, H = this.H;
    ctx.fillStyle = C.cloth;
    ctx.globalAlpha = 0.16;
    const cols = Math.ceil(W / sq) + 1, rows = Math.ceil((H - y0) / sq) + 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if ((r + c) % 2 !== 0) continue;
        ctx.fillRect(c * sq, y0 + r * sq, sq, Math.min(sq, H - (y0 + r * sq)));
      }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.horizon;
    ctx.fillRect(0, y0, W, 2);
  }

  _drawFood(ctx, sh, name, slot, sMul = 1, dx = 0, dy = 0) {
    const scale = this.foodScale * slot.s * sMul;
    const dw = FOOD_W * scale, dh = FOOD_H * scale;
    blit(ctx, sh, name, Math.round(slot.x + dx - dw / 2), Math.round(slot.y + dy - dh / 2), scale);
  }

  // Small deterministic crumb residue on each eaten slot.
  _drawResidue(ctx, sh, eaten) {
    const cs = Math.max(1, (this.foodScale * FOOD_W / CRUMB_PX) * 0.55);
    ctx.globalAlpha = 0.9;
    for (let k = 0; k < eaten; k++) {
      const i = EAT_ORDER[k];
      const slot = this.slots[i];
      for (let j = 0; j < 2; j++) {
        const rx = slot.x + jit(i, 3 + j) * this.foodScale * FOOD_W * 0.3;
        const ry = slot.y + this.plateDrawH * 0.06 + jit(i, 5 + j) * this.plateDrawH * 0.03;
        blit(ctx, sh, j === 0 ? 'crumb0' : 'crumb1',
          Math.round(rx - CRUMB_PX * cs / 2), Math.round(ry - CRUMB_PX * cs / 2), cs);
      }
    }
    ctx.globalAlpha = 1;
  }

  // The item currently being eaten: slot -> mouth arc, then held at the paws.
  _drawActiveItem(ctx, sh, slotIdx, phase) {
    const slot = this.slots[slotIdx];
    const name = `food_${slotIdx}` + (phase > 0.5 ? '_bit' : '');
    const heldScale = 0.62;

    if (slotIdx === KETCHUP_SLOT && phase >= 0.18) {
      // Ketchup chug beat: bottle tilted at the mouth, 3 chug bobs.
      const wob = this.reducedMotion ? 0 : Math.sin(phase * Math.PI * 6) * 0.12;
      const bobY = this.reducedMotion ? 0 : Math.sin(phase * Math.PI * 6) * 2;
      const scale = this.foodScale * heldScale;
      const f = sh.frames[name];
      if (!f) return;
      ctx.save();
      ctx.translate(this.mouthX + 4, this.mouthY + 2 + bobY);
      ctx.rotate(-0.95 + wob);   // ~-55° tilt, nozzle to the mouth
      ctx.drawImage(sh.image, f[0], f[1], f[2], f[3],
        Math.round(-f[2] * scale / 2), Math.round(-f[3] * scale / 2),
        Math.round(f[2] * scale), Math.round(f[3] * scale));
      ctx.restore();
      return;
    }

    if (phase < 0.18 && !this.reducedMotion) {
      // Fly to the mouth along a small arc, shrinking into "held" size.
      const t = clamp(phase / 0.18, 0, 1);
      const e = t * t * (3 - 2 * t);   // smoothstep
      const x = slot.x + (this.mouthX - slot.x) * e;
      const y = slot.y + (this.mouthY + 6 - slot.y) * e - Math.sin(e * Math.PI) * this.plateDrawH * 0.35;
      const sMul = slot.s + (heldScale - slot.s) * e;
      this._drawFood(ctx, sh, name, { x, y, s: 1 }, sMul);
    } else {
      // Held at the paws while nibbling; shrinks as it is eaten.
      const t = clamp((phase - 0.18) / 0.67, 0, 1);
      const sMul = heldScale * (1 - 0.35 * t);
      this._drawFood(ctx, sh, name, { x: this.mouthX, y: this.mouthY + 6, s: 1 }, sMul);
    }
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
    const blink = !this.reducedMotion && ((this.t + 2300) % 3000) < 150;
    return `pika_s${s}_${blink ? 'idle1' : 'idle0'}`;
  }

  // Storm-sky dim alpha: ramps in through late charge-up, holds through the
  // storm, fades out into the settle. Single slow transitions — not a flash.
  _stormDim(ms) {
    const base = this.reducedMotion ? 0.38 : 0.46;
    if (ms < 900) return 0;
    if (ms < 1200) return base * ((ms - 900) / 300);
    if (ms < 3700) return base;
    if (ms < 4100) return base * (1 - (ms - 3700) / 400);
    return 0;
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
    blit(ctx, sh, frame, dx, dy, scale);
    return { dw, dh, cx: this.pikaX, topY: dy };
  }

  // Milestone: 4 star sparkles twinkling above the head.
  _drawCelebrate(ctx, pd) {
    const a0 = this._celebrate / 600;
    ctx.fillStyle = C.ambient;
    for (let k = 0; k < 4; k++) {
      const px = pd.cx + (jit(k, 11) * pd.dw * 0.42);
      const py = pd.topY - 6 - jit(k, 13) * 8 - (1 - a0) * 10;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(this.t / 90 + k * 1.7));
      const r = (2 + (k % 2)) * tw;
      ctx.globalAlpha = a0 * tw;
      ctx.beginPath();
      ctx.moveTo(px, py - r * 1.8); ctx.lineTo(px + r * 0.55, py); ctx.lineTo(px, py + r * 1.8);
      ctx.lineTo(px - r * 0.55, py); ctx.closePath();
      ctx.fill();
      ctx.fillRect(px - r * 1.3, py - 0.5, r * 2.6, 1);
    }
    ctx.globalAlpha = 1;
  }

  // Charge: crackling arcs + inward spark streaks near the cheeks.
  _drawCheekSparks(ctx, pd) {
    const cy = pd.topY + pd.dh * 0.5;      // cheek height
    const dx = pd.dw * 0.30;
    ctx.strokeStyle = '#FFFFFF';
    ctx.fillStyle = '#FFFFFF';
    ctx.lineWidth = Math.max(1.5, pd.dw * 0.025);
    for (let side = -1; side <= 1; side += 2) {
      const bx = pd.cx + side * dx;
      for (let k = 0; k < 4; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = pd.dw * (0.08 + Math.random() * 0.14);
        ctx.globalAlpha = 0.5 + Math.random() * 0.5;
        ctx.fillRect(bx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.5, 2.5);
      }
      // crackle arcs
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(bx, cy, pd.dw * 0.16, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
      // inward streaks (energy gathering)
      for (let k = 0; k < 2; k++) {
        const a = Math.random() * Math.PI * 2;
        const r0 = pd.dw * 0.30, r1 = pd.dw * 0.18;
        ctx.globalAlpha = 0.35 + Math.random() * 0.3;
        ctx.beginPath();
        ctx.moveTo(bx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(bx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
  }

  // Storm: jagged central thunder column + strike/afterglow bolts.
  // The column ends just ABOVE Pikachu's head — he is the star of the finale
  // and must stay visible; an impact glow around him sells the hit instead.
  _drawStorm(ctx, pd) {
    const colBottom = pd.topY + pd.dh * 0.08;
    const colW = this.W * 0.11;
    const jitArr = this._colJit || [];

    // impact glow: charged aura around Pikachu
    {
      const gcx = pd.cx, gcy = pd.topY + pd.dh * 0.45;
      const gr = pd.dw * 0.95;
      const rg = ctx.createRadialGradient(gcx, gcy, 0, gcx, gcy, gr);
      rg.addColorStop(0, 'rgba(255,233,77,0.40)');
      rg.addColorStop(1, 'rgba(255,233,77,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(gcx - gr, gcy - gr, gr * 2, gr * 2);
    }

    // glow pass (soft, narrow)
    ctx.fillStyle = C.boltGlow;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(pd.cx - colW * 0.75, 0, colW * 1.5, colBottom);

    // jagged white core polygon
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = C.boltCore;
    ctx.beginPath();
    const segs = 8;
    for (let i = 0; i <= segs; i++) {
      const y = (colBottom * i) / segs;
      const off = (jitArr[i] || 0) * colW * 0.18;
      const xw = colW * (0.36 - 0.10 * (i / segs));   // slight taper downward
      if (i === 0) ctx.moveTo(pd.cx - xw + off, y);
      else ctx.lineTo(pd.cx - xw + off, y);
    }
    for (let i = segs; i >= 0; i--) {
      const y = (colBottom * i) / segs;
      const off = (jitArr[i] || 0) * colW * 0.18;
      const xw = colW * (0.36 - 0.10 * (i / segs));
      ctx.lineTo(pd.cx + xw + off, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // Bolts: bright strike (~100ms) then afterglow fade. Reduced motion gets
    // slower, gentler bolts (visible thanks to the storm-sky dim).
    for (const b of this._bolts) {
      const age = this.finale - b.born;
      let a = age < 100 ? 1 : Math.max(0, 1 - (age - 100) / 350);
      if (this.reducedMotion) a = Math.max(0, 0.4 * (1 - age / 900));
      if (a <= 0) continue;
      ctx.strokeStyle = C.boltGlow;
      ctx.lineWidth = 7;
      ctx.globalAlpha = a * 0.7;
      ctx.beginPath();
      ctx.moveTo(b.pts[0].x, b.pts[0].y);
      for (let i = 1; i < b.pts.length; i++) ctx.lineTo(b.pts[i].x, b.pts[i].y);
      ctx.stroke();
      ctx.strokeStyle = C.boltCore;
      ctx.lineWidth = 3;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.moveTo(b.pts[0].x, b.pts[0].y);
      for (let i = 1; i < b.pts.length; i++) ctx.lineTo(b.pts[i].x, b.pts[i].y);
      ctx.stroke();
      // ground impact spark
      const gp = b.pts[b.pts.length - 1];
      ctx.fillStyle = C.boltCore;
      ctx.globalAlpha = a * 0.8;
      ctx.beginPath();
      ctx.ellipse(gp.x, gp.y, 6 * a + 2, 2.4 * a + 1, 0, 0, Math.PI * 2);
      ctx.fill();
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
