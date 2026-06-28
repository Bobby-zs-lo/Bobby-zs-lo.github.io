/**
 * MouseScene – Mouse-Timer style grid-depletion countdown.
 *
 * A cheese wedge marks the goal (cell 0, top-left). The remaining cells are
 * apples laid out in reading order; for short timers a single row, for long
 * timers a wrapped grid. The mouse eats apples in REVERSE reading order
 * (rightmost/last apple first, ending at the apple next to the cheese), turning
 * each into a persistent core. When the countdown completes the mouse reaches
 * the cheese, nibbles it, then sits content with a big round belly (finale).
 *
 * Resolution-relative: grid + sprite scale recomputed in layout(W,H).
 * Backdrop: warm tan/brown flat fill (per design).
 *
 * Sprite sheet: assets/mouse.png + mouse.json
 * Frames: apple, apple_bite, core, cheese, crumb,
 *         mouse_eat0, mouse_eat1, mouse_cheese, mouse_full
 */
import { Scene, blit } from '../scene.js';
import { audio }       from '../audio.js';

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  bg0: '#bb9166',   // warm tan (top)
  bg1: '#a87f53',   // warm tan (bottom, very slightly deeper)
  shadow: 'rgba(70,46,26,0.20)',
};

// ── Sprite base dimensions (1:1 with sheet) ──────────────────────────────────
const APPLE_W = 22, APPLE_H = 26;
const CHEESE_W = 26, CHEESE_H = 20;
const MOUSE_W = 26, MOUSE_H = 24;     // eat frames
const MOUSEC_W = 30, MOUSEC_H = 26;   // mouse_cheese
const MOUSEF_W = 30, MOUSEF_H = 24;   // mouse_full

// ── Pure logic (exported for unit tests) ─────────────────────────────────────
export function clampN(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/** Apples scale with duration: ~1 per 10s, min 5, hard-capped at 48. */
export function appleCountForDuration(durationMs) {
  const secs = durationMs / 1000;
  return clampN(Math.round(secs / 10), 5, 48);
}

/** Eaten/active apple state from progress. active = -1 when all apples eaten. */
export function eatState(progress, appleCount) {
  const p = clampN(progress, 0, 1);
  const eaten = Math.min(appleCount, Math.floor(p * appleCount));
  return { eaten, active: eaten < appleCount ? eaten : -1 };
}

/**
 * Cell index (reading order) for an apple's eat-order index.
 * Cell 0 is the cheese; apples occupy cells 1..appleCount.
 * Eat order is reversed so the LAST apple (highest cell) is eaten first and
 * the apple next to the cheese (cell 1) is eaten last.
 */
export function cellForApple(appleEatIndex, appleCount) {
  return appleCount - appleEatIndex;
}

/** Balanced grid (cols,rows) for `total` cells within column/row caps. */
export function gridDims(total, colCap, rowCap) {
  let rows = Math.max(1, Math.ceil(total / colCap));
  if (rows > rowCap) rows = rowCap;
  let cols = Math.max(1, Math.ceil(total / rows));
  if (cols > colCap) cols = colCap;
  rows = Math.max(1, Math.ceil(total / cols));   // ensure all cells fit
  return { cols, rows };
}

/**
 * Choose cols/rows so the grid's aspect roughly matches the band's aspect —
 * this fills the available stage (wide grid in landscape, taller grid in
 * portrait) instead of leaving a small centred block. Clamped to caps; if the
 * row count would overflow, fall back to the column cap.
 */
export function chooseGrid(total, bandW, bandH, colCap, rowCap) {
  const aspect = bandW / bandH;
  let cols = clampN(Math.round(Math.sqrt(total * aspect)), 1, colCap);
  let rows = Math.ceil(total / cols);
  if (rows > rowCap) {
    rows = rowCap;
    cols = clampN(Math.ceil(total / rows), 1, colCap);
    rows = Math.ceil(total / cols);
  }
  return { cols, rows };
}

// ── MouseScene ───────────────────────────────────────────────────────────────
export class MouseScene extends Scene {

  layout(W, H) {
    this.W = W;
    this.H = H;
    this._layoutDone = true;

    // Large content band that fills most of the stage while leaving safe
    // margins for the top-left clock and the bottom controls. Landscape keeps
    // a slightly taller top margin (the clock font scales with width).
    const landscape = W > H;
    this.bandX0 = Math.round(W * 0.05);
    this.bandX1 = Math.round(W * 0.95);
    this.bandY0 = Math.round(H * (landscape ? 0.17 : 0.13));
    this.bandY1 = Math.round(H * (landscape ? 0.85 : 0.87));
    this.bandW = this.bandX1 - this.bandX0;
    this.bandH = this.bandY1 - this.bandY0;

    if (this._durMs != null) this._computeGrid();
  }

  _computeGrid() {
    const landscape = this.W > this.H;
    const colCapHard = landscape ? 9 : 6;

    // Caps keep cells big enough for a readable sprite (>= ~scale 1).
    const MINW = APPLE_W * 1.05, MINH = APPLE_H * 1.05;
    const colCap = clampN(Math.floor(this.bandW / MINW), 1, colCapHard);
    const rowCap = Math.max(1, Math.floor(this.bandH / MINH));
    const capacity = colCap * rowCap;

    const total = Math.min(appleCountForDuration(this._durMs) + 1, capacity);
    const { cols, rows } = chooseGrid(total, this.bandW, this.bandH, colCap, rowCap);

    // Cells tile the WHOLE band (pitch = band / count) so the grid fills the
    // stage; the sprite is then drawn as large as fits a cell (with margin).
    const pitchW = this.bandW / cols;
    const pitchH = this.bandH / rows;
    const FILL = 0.82;
    let sc = Math.floor(Math.min(pitchW * FILL / APPLE_W, pitchH * FILL / APPLE_H));
    sc = clampN(sc, 1, 7);

    this.cols = cols;
    this.rows = rows;
    this.total = total;
    this.appleCount = total - 1;
    this.sc = sc;
    this.pitchW = Math.round(pitchW);
    this.pitchH = Math.round(pitchH);
    const gridW = this.cols * this.pitchW;
    const gridH = this.rows * this.pitchH;
    this.gridX = Math.round(this.bandX0 + (this.bandW - gridW) / 2);
    this.gridY = Math.round(this.bandY0 + (this.bandH - gridH) / 2);
  }

  /** Centre (cx,cy) of a reading-order cell; partial last row is centred. */
  _cellCenter(c) {
    const row = Math.floor(c / this.cols);
    const col = c % this.cols;
    const cellsInRow = (row < this.rows - 1)
      ? this.cols
      : (this.total - this.cols * row);
    const rowOffset = Math.round((this.cols - cellsInRow) * this.pitchW / 2);
    const cx = this.gridX + rowOffset + col * this.pitchW + this.pitchW / 2;
    const cy = this.gridY + row * this.pitchH + this.pitchH / 2;
    return { cx, cy };
  }

  init(durationMs) {
    if (!this._layoutDone) this.layout(this.ctx.canvas.width, this.ctx.canvas.height);
    this._durMs = durationMs;
    this._computeGrid();

    this.t = 0;
    this.progress = 0;
    this.finale = 0;

    this._lastEaten = 0;
    this._chewT = 0;
    this._chewFr = 0;
    this._hopT = 0;
    this._crumbs = [];
    this._finCrumbT = 0;
    this._milestoneFr = 0;
  }

  _spawnCrumbs(cx, cy, n) {
    if (this.reducedMotion) return;
    for (let i = 0; i < n; i++) {
      this._crumbs.push({
        x: cx, y: cy,
        vx: -20 - Math.random() * 40,                 // fly toward the mouth side (left)
        vy: -50 - Math.random() * 60,
        age: 0, max: 500 + Math.random() * 300,
      });
    }
  }

  update(progress, dtMs) {
    this.t += dtMs;
    this.progress = progress;

    // Advance finale timer BEFORE any reduced-motion early-return (run-screen gate).
    if (this.finale > 0) this.finale += dtMs;

    // Detect an apple being finished → "nom" sfx + crumb burst + hop.
    if (this.finale === 0) {
      const { eaten, active } = eatState(progress, this.appleCount);
      if (eaten > this._lastEaten) {
        this._lastEaten = eaten;
        audio.sfx('coin');
        this._hopT = 150;
        const cell = active >= 0 ? cellForApple(active, this.appleCount) : 0;
        const { cx, cy } = this._cellCenter(cell);
        this._spawnCrumbs(cx - 4 * this.sc, cy - 2 * this.sc, 4);
      }
    }

    if (this.reducedMotion) { this._crumbs.length = 0; return; }

    // Chew animation
    this._chewT += dtMs;
    if (this._chewT >= 170) { this._chewFr = 1 - this._chewFr; this._chewT = 0; }
    if (this._hopT > 0) { this._hopT -= dtMs; if (this._hopT < 0) this._hopT = 0; }

    // Finale: crumbs as the cheese is nibbled
    if (this.finale > 0 && this.finale < 850) {
      this._finCrumbT += dtMs;
      if (this._finCrumbT >= 110) {
        this._finCrumbT = 0;
        const { cx, cy } = this._cellCenter(0);
        this._spawnCrumbs(cx - 3 * this.sc, cy - 2 * this.sc, 3);
      }
    }

    // Advance crumb particles (gravity)
    if (this._crumbs.length) {
      const g = 240;
      for (const cr of this._crumbs) {
        cr.age += dtMs;
        cr.x += cr.vx * (dtMs / 1000);
        cr.y += cr.vy * (dtMs / 1000);
        cr.vy += g * (dtMs / 1000);
      }
      this._crumbs = this._crumbs.filter(cr => cr.age < cr.max);
    }
  }

  onMilestone(i, total) {
    // Light accent on each fifth; the per-apple "coin" sfx carries the main beat.
    this._milestoneFr = 1;
    audio.sfx('click');
  }

  onComplete() {
    this.finale = 1;
    this._lastEaten = this.appleCount;
    this._crumbs.length = 0;
    audio.sfx('win');
  }

  isFinaleDone() {
    return this.finale > 2600;
  }

  // ── Rendering ────────────────────────────────────────────────────────────────
  render() {
    const ctx = this.ctx, W = this.W, H = this.H, sh = this.assets, sc = this.sc;
    ctx.imageSmoothingEnabled = false;

    // Backdrop: warm tan with a subtle vertical gradient + soft vignette.
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, C.bg0);
    g.addColorStop(1, C.bg1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const vr = Math.max(W, H) * 0.72;
    const vg = ctx.createRadialGradient(W / 2, H / 2, vr * 0.34, W / 2, H / 2, vr);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(38,22,8,0.30)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    if (!sh) return;

    const { eaten, active } = eatState(this.progress, this.appleCount);
    const inFinale = this.finale > 0;
    // During finale all apples are cores and the cheese is the active cell.
    const eatenEff = inFinale ? this.appleCount : eaten;
    const activeCell = inFinale
      ? 0
      : (active >= 0 ? cellForApple(active, this.appleCount) : 0);

    // ── Draw cells (cheese + apples/cores) ─────────────────────────────────────
    for (let c = 0; c < this.total; c++) {
      const { cx, cy } = this._cellCenter(c);
      this._drawShadow(ctx, cx, cy);

      if (c === 0) {
        // Cheese goal — vanishes as it is nibbled in the finale.
        if (!(inFinale && this.finale > 650)) {
          this._sprite(ctx, sh, 'cheese', CHEESE_W, CHEESE_H, cx, cy);
        }
        continue;
      }
      const k = this.appleCount - c;          // eat-order index of this apple
      let name;
      if (k < eatenEff) name = 'core';
      else if (k === eatenEff && !inFinale) name = 'apple_bite';
      else name = 'apple';
      this._sprite(ctx, sh, name,
        name === 'core' ? APPLE_W : APPLE_W, APPLE_H, cx, cy);
    }

    // ── Mouse at the active cell ───────────────────────────────────────────────
    {
      const { cx, cy } = this._cellCenter(activeCell);
      const hop = (this._hopT > 0 && !this.reducedMotion)
        ? -Math.round(Math.sin((this._hopT / 150) * Math.PI) * 3 * sc) : 0;
      const chewBob = (!this.reducedMotion && this._chewFr) ? sc : 0;

      let name, bw, bh;
      if (inFinale && this.finale >= 850) { name = 'mouse_full'; bw = MOUSEF_W; bh = MOUSEF_H; }
      else if (inFinale) { name = 'mouse_cheese'; bw = MOUSEC_W; bh = MOUSEC_H; }
      else {
        name = this._chewFr ? 'mouse_eat1' : 'mouse_eat0';
        bw = MOUSE_W; bh = MOUSE_H;
      }
      // Mouse sits a little in front of/over its cell (feet near cell bottom).
      const dy = hop + chewBob + Math.round(2 * sc);
      this._sprite(ctx, sh, name, bw, bh, cx, cy, dy);
    }

    // ── Crumb particles ────────────────────────────────────────────────────────
    if (!this.reducedMotion) {
      for (const cr of this._crumbs) {
        const a = 1 - cr.age / cr.max;
        if (a <= 0) continue;
        ctx.globalAlpha = a < 1 ? a : 1;
        blit(ctx, sh, 'crumb', Math.round(cr.x), Math.round(cr.y), Math.max(1, sc));
      }
      ctx.globalAlpha = 1;
    }
  }

  _drawShadow(ctx, cx, cy) {
    const rw = Math.round(APPLE_W * this.sc * 0.42);
    const rh = Math.max(2, Math.round(this.sc * 2.4));
    const y = cy + Math.round(APPLE_H * this.sc * 0.42);
    ctx.fillStyle = C.shadow;
    ctx.beginPath();
    ctx.ellipse(cx, y, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Blit a frame centred on (cx,cy), bottom-aligned to the cell with optional dy. */
  _sprite(ctx, sh, name, baseW, baseH, cx, cy, dy = 0) {
    const sc = this.sc;
    const dx = Math.round(cx - (baseW * sc) / 2);
    const dyy = Math.round(cy - (baseH * sc) / 2 + dy);
    blit(ctx, sh, name, dx, dyy, sc);
  }

  dispose() {}
}
