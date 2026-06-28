/**
 * CastleScene – 16-bit Castle Construction, section-by-section scaffold build.
 *
 * Build model: castle_full revealed BOTTOM-UP in ~13 DISCRETE COURSES.
 * The 5 milestone SECTIONS each wrap the active build band in procedurally-drawn
 * flat side-view wooden scaffolding (timber poles, 3 plank levels, diagonal braces,
 * ladder, cloud puffs). Worker stands ON the mid plank — never floating.
 * At each onMilestone: scaffold removed, relocated to next section. Torches mounted
 * on the wall — only visible where wall is already revealed.
 *
 * Sprite sheet: assets/castle.png + castle.json
 * Frames: castle_full, stone, worker0, worker1, worker_walk0, worker_walk1,
 *         flag, cannon_fire0, cannon_fire1, torch0, torch1,
 *         firework0, firework1, firework2
 */
import { Scene, blit } from '../scene.js';
import { audio }       from '../audio.js';
import { lerpHex }     from '../palette.js';

// ── Palette ─────────────────────────────────────────────────────────────────────
const C = {
  sky0:     '#2b0c3d',
  sky1:     '#ff5e94',
  sun_top:  '#ffdd66',
  sun_bot:  '#ff2e88',
  ground:   '#1c082a',
  grid:     '#7a1e5a',
  stone_hi: '#a878d2',
  accent:   '#00f5d4',
};

// Scaffold wood palette (approved in Task E spec)
const SC = {
  WOOD:  '#9c683a',
  WOODl: '#c4965e',
  WOODd: '#623e20',
  LASH:  '#281912',
  CLOUD: '#c4d6e0',
};

// ── Castle sprite dimensions ─────────────────────────────────────────────────────
const CF_W = 206;   // castle_full frame width  (px in sprite sheet)
const CF_H = 254;   // castle_full frame height

// ── Build model: 13 discrete courses across 5 milestone sections ─────────────────
const TOTAL_COURSES   = 13;
// Courses per section (bottom→top). Sum = 13, length = 5.
const SECTION_COURSES = [3, 3, 3, 2, 2];
// Cumulative prefix sums: [0, 3, 6, 9, 11, 13]
const SECTION_CUMUL   = SECTION_COURSES.reduce(
  (acc, n) => { acc.push(acc[acc.length - 1] + n); return acc; }, [0]
);

// Scaffold horizontal band per section, as sprite-fraction [fX0, fX1].
// Sections 0-2: keep body (sprite x=27..179).
// Sections 3-4: full tower span (sprite x=1..205).
const SECTION_XBANDS = [
  [27 / CF_W, 179 / CF_W],   // section 0 – keep
  [27 / CF_W, 179 / CF_W],   // section 1 – keep
  [27 / CF_W, 179 / CF_W],   // section 2 – keep
  [ 1 / CF_W, 205 / CF_W],   // section 3 – towers
  [ 1 / CF_W, 205 / CF_W],   // section 4 – towers
];

// ── Cannon barrel-tip positions (sprite fractions) ──────────────────────────────
const CANNON_SPOTS = [
  [42  / CF_W, 139 / CF_H],   // left  upper
  [188 / CF_W, 139 / CF_H],   // right upper
  [42  / CF_W, 183 / CF_H],   // left  lower
  [188 / CF_W, 183 / CF_H],   // right lower
];

// ── Torch wall-mount positions (sprite fractions) ────────────────────────────────
// Mounted flanking the keep entrance at y≈184/254 in sprite space.
const TORCH_SPOTS = [
  [36  / CF_W, 184 / CF_H],   // left  torch
  [166 / CF_W, 184 / CF_H],   // right torch
];

// ── Helpers ─────────────────────────────────────────────────────────────────────
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerpHexStr(a, b, t) { return lerpHex(a, b, clamp(t, 0, 1)); }

function drawSun(ctx, cx, cy, r, top, bot) {
  for (let dy = -r; dy <= r; dy++) {
    const dx = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
    if (dx === 0) continue;
    if (dy > 0 && Math.floor((dy - 1) / 5) % 2 === 1) continue;   // horizontal slits
    ctx.fillStyle = lerpHexStr(top, bot, clamp(dy / r, 0, 1));
    ctx.fillRect(cx - dx, cy + dy, dx * 2, 1);
  }
}

function drawGrid(ctx, W, H, horizon, color, scrollT) {
  ctx.strokeStyle = color;
  ctx.lineWidth   = 1;
  const VP = W / 2;
  for (let i = 0; i <= 10; i++) {
    const bx = (i / 10) * W;
    ctx.beginPath(); ctx.moveTo(bx, H); ctx.lineTo(VP, horizon); ctx.stroke();
  }
  for (let i = 1; i <= 8; i++) {
    const tt = ((i / 8) + scrollT) % 1;
    const y  = horizon + (H - horizon) * (1 - Math.pow(1 - tt, 2.2));
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
}

/**
 * Return an array of plank Y canvas positions for the full-height scaffold.
 * Produces one level per section boundary (SECTION_COURSES.length + 1 levels),
 * ordered from bottom (yBot, highest Y value) to top (yTop, lowest Y value).
 */
function scaffoldPlanks(yTop, yBot) {
  const n = SECTION_COURSES.length;   // 5 sections → 6 boundary levels
  return Array.from({ length: n + 1 }, (_, i) => Math.round(yBot - (i / n) * (yBot - yTop)));
}

/**
 * Draw full-height flat side-view wooden scaffolding (yTop..yBot).
 * Extended from reference_scaffold.py::wooden_scaffold() to span the full
 * castle height with one plank level per section boundary.
 * All dimensions scaled by `sc` (castleScale, >= 1).
 */
function drawScaffold(ctx, x0, x1, yTop, yBot, sc) {
  const p    = Math.max(1, Math.round(sc));       // base unit
  const pw   = Math.max(1, Math.round(sc * 3));   // pole width
  const ph   = Math.max(1, Math.round(sc * 3));   // plank height
  const w    = x1 - x0;
  const midX = x0 + Math.round(w / 2);

  // ── Cloud puffs at scaffold base ──────────────────────────────────────────
  ctx.fillStyle = SC.CLOUD;
  for (const cxp of [x0 - 6*p, x1 - 2*p, midX - 8*p]) {
    for (let k = 0; k < 3; k++) {
      ctx.fillRect(cxp - 4*p + k * 5*p, yBot - 3*p + (k % 2) * 2*p, 8*p, 5*p);
    }
  }

  // ── Vertical poles (left outer, mid, right outer) ─────────────────────────
  const poles = [x0 - 6*p, midX - p, x1 + 2*p];
  const poleH = yBot - yTop + 10*p;
  for (const px of poles) {
    ctx.fillStyle = SC.WOOD;
    ctx.fillRect(px, yTop - 6*p, pw, poleH);
    ctx.fillStyle = SC.WOODl;
    ctx.fillRect(px, yTop - 6*p, p, poleH);    // left-edge highlight
  }

  // ── Horizontal planks at regular intervals (one per section boundary) ─────
  const levels = scaffoldPlanks(yTop, yBot);
  const plankW = w + 12*p;
  for (const ly of levels) {
    ctx.fillStyle = SC.WOOD;
    ctx.fillRect(x0 - 7*p, ly, plankW, ph);
    ctx.fillStyle = SC.WOODl;
    ctx.fillRect(x0 - 7*p, ly, plankW, p);      // top highlight
    ctx.fillStyle = SC.WOODd;
    ctx.fillRect(x0 - 7*p, ly + ph, plankW, p); // bottom shadow
    // Lashings where planks cross poles
    for (const px of poles) {
      ctx.fillStyle = SC.LASH;
      ctx.fillRect(px - p, ly - p, 4*p, 5*p);
    }
  }

  // ── Diagonal cross-braces between consecutive plank levels ────────────────
  ctx.strokeStyle = SC.WOODd;
  ctx.lineWidth   = Math.max(1, p);
  for (let i = 0; i < levels.length - 1; i++) {
    const a = levels[i], b = levels[i + 1];
    ctx.beginPath(); ctx.moveTo(x0 - 6*p, a); ctx.lineTo(midX, b); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1 + 2*p,  a); ctx.lineTo(midX, b); ctx.stroke();
  }

  // ── Ladder on right pole ──────────────────────────────────────────────────
  const lx = x1 + 2*p;
  ctx.strokeStyle = SC.WOOD;
  ctx.lineWidth   = Math.max(1, p);
  ctx.beginPath(); ctx.moveTo(lx + 5*p, yTop - 6*p); ctx.lineTo(lx + 5*p, yBot); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(lx + 9*p, yTop - 6*p); ctx.lineTo(lx + 9*p, yBot); ctx.stroke();
  ctx.fillStyle = SC.WOODl;
  for (let ry = yTop - 4*p; ry < yBot; ry += 6*p) {
    ctx.fillRect(lx + 5*p, ry, 5*p, 2*p);   // rung
  }
}

// ── CastleScene ──────────────────────────────────────────────────────────────────
export class CastleScene extends Scene {

  /** Recompute all layout-dependent positions. Called by run.js on resize. */
  layout(W, H) {
    this.W = W;
    this.H = H;
    this._layoutDone = true;
    const isLandscape = W > H;
    this.GY = Math.round(H * (isLandscape ? 0.82 : 0.86));

    // Scale castle to fit canvas, keeping aspect ratio
    const availH = this.GY * 0.92;
    const availW = W * 0.88;
    this.castleScale = Math.min(availH / CF_H, availW / CF_W);
    this.castleW     = Math.round(CF_W * this.castleScale);
    this.castleH     = Math.round(CF_H * this.castleScale);
    this.castleX     = Math.round((W - this.castleW) / 2);
    this.castleTop   = this.GY - this.castleH;   // Y of fully-revealed castle top

    // Flag pole (right side)
    this.poleX   = Math.round(W * 0.83);
    this.poleTop = Math.round(H * 0.06);
    this.poleBot = this.GY;
    this.poleLen = this.poleBot - this.poleTop;

    // Sun
    this.sunX = Math.round(W * 0.5);
    this.sunY = Math.round(H * 0.22);
    this.sunR = Math.round(Math.min(W, H) * 0.09);

    // Full-height scaffold horizontal extents (widest tower-to-tower span)
    this.sfX0 = this.castleX + Math.round((1 / CF_W) * this.castleW);
    this.sfX1 = this.castleX + Math.round((205 / CF_W) * this.castleW);
  }

  init(durationMs) {
    if (!this._layoutDone) this.layout(this.ctx.canvas.width, this.ctx.canvas.height);

    this.t        = 0;
    this.progress = 0;
    this.finale   = 0;

    // Section tracking: how many milestones have fired (= index of active section)
    this._milestonesFired = 0;

    // Worker: walks on scaffold mid plank, hammers periodically
    this._wState    = 'walk';    // 'walk' | 'hammer'
    this._wWalkFr   = 0;         // walk animation frame (0/1)
    this._wHammerFr = 0;         // hammer animation frame (0/1)
    this._wWalkDir  = 1;         // +1 = right, -1 = left
    this._wFrameT   = 0;         // ms since last frame toggle
    this._wActionT  = 0;         // ms since last state transition

    // Initialise worker X to centre of full-height scaffold
    this._wX = Math.round((this.sfX0 + this.sfX1) / 2);

    // Torch flicker
    this._torchFr       = 0;
    this._torchT        = 0;
    this._torchInterval = 180;

    // Cannon
    this._cannonT        = 0;
    this._cannonInterval = 3200;
    this._cannonActive   = -1;
    this._cannonFr       = 0;
    this._cannonFrT      = 0;

    // Fireworks (finale)
    this._fwList   = [];
    this._fwSpawnT = 0;

    // Milestone flash overlay
    this._flashAlpha = 0;
  }

  update(progress, dtMs) {
    this.t        += dtMs;
    this.progress  = progress;

    // Advance finale timer even in reducedMotion so isFinaleDone() can return true.
    if (this.finale > 0) this.finale += dtMs;

    if (this.reducedMotion) return;

    // ── Worker climbs scaffold with the build front ──────────────────────────
    if (progress < 1) {
      const WALK_SPEED  = 18;     // canvas px / s
      const WALK_FR_INT = 220;    // ms per walk frame
      const HAMMER_INT  = 900;    // ms of walk before hammering
      const HAMMER_DUR  = 400;    // ms of hammer animation

      this._wFrameT  += dtMs;
      this._wActionT += dtMs;

      if (this._wState === 'walk') {
        // Walk back and forth within full scaffold x-extent
        this._wX += this._wWalkDir * WALK_SPEED * (dtMs / 1000);
        const xMin = this.sfX0 + 4;
        const xMax = this.sfX1 - 16;
        if (this._wX > xMax) { this._wX = xMax; this._wWalkDir = -1; }
        if (this._wX < xMin) { this._wX = xMin; this._wWalkDir =  1; }
        if (this._wFrameT >= WALK_FR_INT) {
          this._wWalkFr = 1 - this._wWalkFr;
          this._wFrameT = 0;
        }
        if (this._wActionT >= HAMMER_INT) {
          this._wState    = 'hammer';
          this._wActionT  = 0;
          this._wFrameT   = 0;
          this._wHammerFr = 0;
        }
      } else {
        // Hammer
        if (this._wFrameT >= 200) {
          this._wHammerFr = 1 - this._wHammerFr;
          this._wFrameT   = 0;
        }
        if (this._wActionT >= HAMMER_DUR) {
          this._wState   = 'walk';
          this._wActionT = 0;
        }
      }
    }

    // ── Torch flicker ─────────────────────────────────────────────────────────
    this._torchT += dtMs;
    if (this._torchT >= this._torchInterval) {
      this._torchFr       = 1 - this._torchFr;
      this._torchT        = 0;
      this._torchInterval = 120 + Math.random() * 140;
    }

    // ── Cannon (only after lower sections built) ──────────────────────────────
    if (progress > 0.25) {
      this._cannonT += dtMs;
      if (this._cannonActive < 0) {
        if (this._cannonT >= this._cannonInterval) {
          this._cannonActive   = Math.floor(Math.random() * 4);
          this._cannonFr       = 0;
          this._cannonFrT      = 0;
          this._cannonT        = 0;
          this._cannonInterval = 2800 + Math.random() * 2000;
        }
      } else {
        this._cannonFrT += dtMs;
        if      (this._cannonFrT < 180) this._cannonFr = 0;
        else if (this._cannonFrT < 360) this._cannonFr = 1;
        else                            this._cannonActive = -1;
      }
    }

    // ── Milestone flash fade ──────────────────────────────────────────────────
    if (this._flashAlpha > 0) {
      this._flashAlpha -= dtMs / 300;
      if (this._flashAlpha < 0) this._flashAlpha = 0;
    }

    // ── Finale fireworks ──────────────────────────────────────────────────────
    if (this.finale > 0) {
      this._fwSpawnT += dtMs;
      if (this._fwSpawnT >= 300) {
        this._fwSpawnT = 0;
        this._fwList.push({
          x:      this.castleX + Math.random() * this.castleW,
          y:      this.castleTop + Math.random() * this.castleH * 0.5,
          fr: 0, age: 0, maxAge: 700,
        });
      }
      for (const fw of this._fwList) {
        fw.age += dtMs;
        fw.fr   = Math.floor(fw.age / 233) % 3;
      }
      this._fwList = this._fwList.filter(fw => fw.age < fw.maxAge);
    }
  }

  onMilestone(i, total) {
    this._milestonesFired = i;   // i is 1-indexed (1..total); section index = i
    this._flashAlpha      = 0.45;
    audio.sfx('build');
    // Scaffold is always full-height; render places worker on nearest plank automatically.
    this._wWalkDir = 1;
    this._wState   = 'walk';
    this._wActionT = 0;
  }

  onComplete() {
    this.finale = 1;
    audio.sfx('win');
  }

  isFinaleDone() {
    return this.finale > 2500;
  }

  // ── Rendering ────────────────────────────────────────────────────────────────
  render() {
    const ctx = this.ctx;
    const W   = this.W;
    const H   = this.H;
    const sh  = this.assets;
    const GY  = this.GY;

    ctx.imageSmoothingEnabled = false;

    // ── Sky gradient ──────────────────────────────────────────────────────────
    const skyGrad = ctx.createLinearGradient(0, 0, 0, GY);
    skyGrad.addColorStop(0, C.sky0);
    skyGrad.addColorStop(1, C.sky1);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, GY);

    // ── Ground ────────────────────────────────────────────────────────────────
    ctx.fillStyle = C.ground;
    ctx.fillRect(0, GY, W, H - GY);

    // ── Sun ───────────────────────────────────────────────────────────────────
    drawSun(ctx, this.sunX, this.sunY, this.sunR, C.sun_top, C.sun_bot);

    // ── Perspective grid ──────────────────────────────────────────────────────
    const scrollT = this.reducedMotion ? 0 : (this.t / 3200) % 1;
    drawGrid(ctx, W, H, GY, C.grid, scrollT);

    if (!sh) return;

    // ── Discrete course reveal (bottom-up) ────────────────────────────────────
    // Ensure completed sections are always fully shown (min = courses in done sections).
    const minCourses     = SECTION_CUMUL[Math.min(this._milestonesFired, SECTION_CUMUL.length - 1)];
    const revealedCourses = Math.min(TOTAL_COURSES,
      Math.max(minCourses, Math.floor(this.progress * TOTAL_COURSES)));

    // buildY: canvas Y of the top edge of the current build front
    const buildY = this.GY - Math.round(revealedCourses * this.castleH / TOTAL_COURSES);

    // Draw revealed slice of castle_full
    const cfFrame = sh.frames['castle_full'];
    if (cfFrame) {
      const [cfx, cfy] = cfFrame;
      const srcH = Math.round(revealedCourses * CF_H / TOTAL_COURSES);
      if (srcH > 0) {
        const srcYSheet = cfy + CF_H - srcH;   // top of revealed band in sprite sheet
        const dstH      = Math.round(srcH * this.castleScale);
        const dstY      = GY - dstH;
        ctx.drawImage(sh.image,
          cfx, srcYSheet, CF_W, srcH,
          this.castleX, dstY, this.castleW, dstH
        );
      }
    }

    // ── Full-height scaffold (present from start, removed only at finale) ────
    const sc = Math.max(1, this.castleScale);
    if (this.finale === 0) {
      drawScaffold(ctx, this.sfX0, this.sfX1, this.castleTop, this.GY, sc);

      // ── Worker: stands on the plank level nearest the current build line ──
      // Find the highest-Y plank (lowest in world) that is still at or below buildY
      // so the worker reaches UP toward the next course to be built.
      const sfLevels = scaffoldPlanks(this.castleTop, this.GY);
      let workerPlankY = sfLevels[0]; // default: bottom plank
      for (let i = 0; i < sfLevels.length; i++) {
        if (sfLevels[i] >= buildY) workerPlankY = sfLevels[i];
        else break;
      }

      const wsc     = Math.max(1, Math.round(this.castleScale * 1.2));
      const wFrameH = Math.round(18 * wsc);

      const wName = this.reducedMotion
        ? 'worker0'
        : (this._wState === 'hammer'
            ? (this._wHammerFr ? 'worker1' : 'worker0')
            : (this._wWalkFr   ? 'worker_walk1' : 'worker_walk0'));

      blit(ctx, sh, wName, Math.round(this._wX), workerPlankY - wFrameH, wsc,
           this._wWalkDir < 0 /* flip when walking left */);
    }

    // ── Torches – only where wall is already revealed ─────────────────────────
    const tsc       = Math.max(1, Math.round(this.castleScale * 1.1));
    const torchName = this._torchFr ? 'torch1' : 'torch0';
    for (const [fx, fy] of TORCH_SPOTS) {
      // Canvas Y of this torch relative to the FULLY drawn castle
      const tx = this.castleX  + Math.round(fx * this.castleW);
      const ty = this.castleTop + Math.round(fy * this.castleH);
      if (ty >= buildY) {   // wall has been built at this height
        // Glow halo
        const gr = ctx.createRadialGradient(tx, ty, 0, tx, ty, 10 * tsc);
        gr.addColorStop(0, 'rgba(255,180,40,0.5)');
        gr.addColorStop(1, 'rgba(255,100,0,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(tx - 10*tsc, ty - 10*tsc, 20*tsc, 20*tsc);
        blit(ctx, sh, torchName, tx - 3*tsc, ty - 6*tsc, tsc);
      }
    }

    // ── Cannon fire – only where cannon is already revealed ───────────────────
    if (this._cannonActive >= 0) {
      const [fx, fy] = CANNON_SPOTS[this._cannonActive];
      const cx = this.castleX  + Math.round(fx * this.castleW);
      const cy = this.castleTop + Math.round(fy * this.castleH);
      if (cy >= buildY) {   // cannon revealed
        const csc = Math.max(1, Math.round(this.castleScale * 1.3));
        const gr2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, 14 * csc);
        gr2.addColorStop(0,   'rgba(255,230,80,0.9)');
        gr2.addColorStop(0.4, 'rgba(255,100,20,0.5)');
        gr2.addColorStop(1,   'rgba(255,40,0,0)');
        ctx.fillStyle = gr2;
        ctx.fillRect(cx - 14*csc, cy - 14*csc, 28*csc, 28*csc);
        blit(ctx, sh,
             this._cannonFr === 0 ? 'cannon_fire0' : 'cannon_fire1',
             cx - 6*csc, cy - 5*csc, csc);
      }
    }

    // ── Flag pole with climbing flag ──────────────────────────────────────────
    const pX = this.poleX;
    const pT = this.poleTop;
    const pB = this.poleBot;
    const pL = this.poleLen;
    // Pole
    ctx.fillStyle = C.stone_hi;
    ctx.fillRect(pX, pT, 2, pL);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(pX, pT, 1, pL);
    // Finial
    ctx.fillStyle = '#ffd250';
    ctx.fillRect(pX - 1, pT - 4, 4, 4);
    // 5 tier marks
    for (let m = 1; m <= 5; m++) {
      const my = pB - Math.round((pL * m) / 5);
      ctx.fillStyle = C.accent;
      ctx.fillRect(pX - 4, my, 4, 1);
    }
    // Flag climbs as progress increases
    const flagY = Math.round(pB - this.progress * pL);
    const fsc   = Math.max(1, Math.round(this.castleScale * 0.8));
    blit(ctx, sh, 'flag', pX + 2, flagY - 7 * fsc, fsc);

    // ── Milestone flash overlay ───────────────────────────────────────────────
    if (this._flashAlpha > 0) {
      ctx.fillStyle = `rgba(0,229,255,${this._flashAlpha.toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
    }

    // ── Fireworks (finale) ────────────────────────────────────────────────────
    if (this.finale > 0) {
      const fsc2 = Math.max(1, Math.round(this.castleScale * 1.1));
      for (const fw of this._fwList) {
        blit(ctx, sh,
             `firework${fw.fr}`,
             Math.round(fw.x - 14 * fsc2),
             Math.round(fw.y - 14 * fsc2),
             fsc2);
      }
    }
  }

  dispose() {}
}
