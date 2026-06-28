/**
 * MouseScene – Mouse-Timer style grid-depletion countdown.
 *
 * A cheese wedge marks the goal (cell 0, top-left corner). The remaining cells
 * are apples = remaining time (~1 apple per 10s, UNCAPPED). The mouse eats
 * apples one-by-one in REVERSE reading order (the farthest / bottom apple first,
 * ending at the apple next to the cheese), turning each into a persistent core,
 * so cores fill from the bottom up toward the cheese. When the countdown
 * completes the mouse reaches the cheese, nibbles it, then sits content with a
 * big round belly (finale).
 *
 * Grid scaling (the point of this revision):
 *   - appleCount = max(1, round(durationSec/10)); total = appleCount + 1.
 *   - NO CAP: a 60-min timer = 360 apples and they ALL fit on ONE screen.
 *   - Cells are SQUARE and their size is capped at a large max (~bandW/maxCols)
 *     so short timers show BIG apples in a few rows, vertically centered with
 *     empty margins. Columns grow (apples shrink) only when the grid would
 *     overflow the band height — guaranteeing a one-screen fit at any duration.
 *   - Below a size threshold a simplified small apple/core/cheese/mouse sprite
 *     tier is used so tiny apples still read cleanly (no muddy downscales).
 *
 * Resolution-relative: band + grid recomputed in layout(W,H); aspect-aware
 * (more columns allowed in landscape). Backdrop: warm tan gradient + vignette.
 *
 * Mixed fidelity (intentional): apples/cores/cheese/crumb are 16-bit PIXEL art
 * (nearest-neighbor); the MOUSE is a smooth, anti-aliased HD cartoon sprite drawn
 * with imageSmoothing ENABLED for just its blit, then restored to false.
 *
 * Sprite sheet: assets/mouse.png + mouse.json
 * Pixel frames: apple, apple_bite, core, cheese, crumb, apple_s, core_s, cheese_s
 * HD mouse frames (128x112 box, facing left):
 *         mouse_eat0..3 (chew cycle), mouse_hop0..2 (hop to next apple),
 *         mouse_cheese (nibble cheese finale), mouse_full (big-belly finale)
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
// Pixel apple/cheese — detailed (large-cell) tier
const APPLE_W = 22, APPLE_H = 26;
const CHEESE_W = 26, CHEESE_H = 20;
// Pixel apple/cheese — simplified (small-cell) tier
const APPLE_SW = 12, APPLE_SH = 13;
const CHEESE_SW = 14, CHEESE_SH = 11;

// HD mouse: every mouse frame shares one 128x112 box (smooth, anti-aliased).
const MOUSE_W = 128, MOUSE_H = 112;
const EAT_FRAMES = ['mouse_eat0', 'mouse_eat1', 'mouse_eat2', 'mouse_eat3'];
const CHEW_MS = 150;     // per chew frame
const TWEEN_MS = 300;    // hop travel time between apples
const MOUSE_FILL = 1.3;  // mouse ~1.3x a cell while eating
const MOUSE_MIN = 30;    // never smaller than this (readable at tiny 60-min cells)

// Cells whose square size (px) is below this use the simplified small pixel tier
// (mouse always uses the smooth HD frames, scaled, regardless of cell size).
const DETAIL_MIN = 26;
// How much of a cell a sprite fills (small consistent gaps, like the reference).
const FILL = 0.92;

// ── Pure logic (exported for unit tests) ─────────────────────────────────────
export function clampN(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/** Apples scale with duration: ~1 per 10s, minimum 1, NO maximum (no cap). */
export function appleCountForDuration(durationMs) {
  const secs = durationMs / 1000;
  return Math.max(1, Math.round(secs / 10));
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
 * Eat order is reversed so the LAST apple (highest cell = farthest, bottom) is
 * eaten first and the apple next to the cheese (cell 1) is eaten last.
 */
export function cellForApple(appleEatIndex, appleCount) {
  return appleCount - appleEatIndex;
}

/**
 * Uncapped, one-screen grid sizing.
 *
 * Cells are SQUARE with pitch `cell` (logical px). Cells start as big as the cap
 * allows (cell = bandW / maxCols) and the grid fills the width (up to maxCols).
 * Columns are added — shrinking the cell — ONLY when the grid would overflow the
 * band height, so the result always fits inside bandW × bandH no matter how many
 * cells there are. Returns { cols, rows, cell }.
 */
export function mouseGrid(total, bandW, bandH, maxCols) {
  total = Math.max(1, Math.round(total));
  maxCols = Math.max(1, Math.round(maxCols));
  const maxCell = bandW / maxCols;
  let cols = clampN(Math.min(total, maxCols), 1, total);
  let cell, rows;
  for (;;) {
    cell = Math.min(maxCell, bandW / cols);
    rows = Math.ceil(total / cols);
    if (rows * cell <= bandH || cols >= total) break;
    cols++;                                  // apples shrink, grid gets shorter
  }
  return { cols, rows, cell };
}

// ── MouseScene ───────────────────────────────────────────────────────────────
export class MouseScene extends Scene {

  layout(W, H) {
    this.W = W;
    this.H = H;
    this._layoutDone = true;

    // Large content band filling most of the stage. Top margin clears the
    // on-canvas HUD clock; the grid is centred inside the band so short timers
    // sit with generous empty margins above/below (NOT stretched to fill).
    this.bandX0 = Math.round(W * 0.04);
    this.bandX1 = Math.round(W * 0.96);
    this.bandY0 = Math.round(H * 0.085);
    this.bandY1 = Math.round(H * 0.965);
    this.bandW = this.bandX1 - this.bandX0;
    this.bandH = this.bandY1 - this.bandY0;

    if (this._durMs != null) this._computeGrid();
  }

  _computeGrid() {
    const landscape = this.W > this.H;
    const maxCols = landscape ? 9 : 6;       // aspect-aware big-cell column cap

    const total = appleCountForDuration(this._durMs) + 1;
    const { cols, rows, cell } = mouseGrid(total, this.bandW, this.bandH, maxCols);

    this.cols = cols;
    this.rows = rows;
    this.total = total;
    this.appleCount = total - 1;
    this.cell = cell;

    const gridW = cols * cell;
    const gridH = rows * cell;
    this.gridX = this.bandX0 + (this.bandW - gridW) / 2;
    this.gridY = this.bandY0 + (this.bandH - gridH) / 2;
  }

  /** Centre (cx,cy) of a reading-order cell; partial last row is centred. */
  _cellCenter(c) {
    const cell = this.cell;
    const row = Math.floor(c / this.cols);
    const col = c % this.cols;
    const cellsInRow = (row < this.rows - 1)
      ? this.cols
      : (this.total - this.cols * row);
    const rowOffset = (this.cols - cellsInRow) * cell / 2;
    const cx = this.gridX + rowOffset + col * cell + cell / 2;
    const cy = this.gridY + row * cell + cell / 2;
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
    this._chewFr = 0;         // index into EAT_FRAMES (0..3)
    this._tweenT = TWEEN_MS;  // >= TWEEN_MS means "not hopping"
    this._tweenFromCell = this.appleCount;   // start on the farthest apple
    this._tweenToCell = this.appleCount;
    this._crumbs = [];
    this._finCrumbT = 0;
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

    // Detect an apple being finished → "nom" sfx + crumb burst + start a hop
    // that tweens the mouse from the finished apple to the next one.
    if (this.finale === 0) {
      const { eaten, active } = eatState(progress, this.appleCount);
      if (eaten > this._lastEaten) {
        const fromCell = cellForApple(this._lastEaten, this.appleCount); // just-finished apple
        const toCell = active >= 0 ? cellForApple(active, this.appleCount) : 0; // next apple (or cheese)
        this._lastEaten = eaten;
        audio.sfx('coin');
        this._tweenFromCell = fromCell;
        this._tweenToCell = toCell;
        this._tweenT = 0;
        const { cx, cy } = this._cellCenter(fromCell);
        this._spawnCrumbs(cx - 0.2 * this.cell, cy - 0.1 * this.cell, 4);
      }
    }

    if (this.reducedMotion) { this._tweenT = TWEEN_MS; this._crumbs.length = 0; return; }

    // Chew animation (4-frame cycle) + hop tween advance
    this._chewT += dtMs;
    if (this._chewT >= CHEW_MS) { this._chewT -= CHEW_MS; this._chewFr = (this._chewFr + 1) % EAT_FRAMES.length; }
    if (this._tweenT < TWEEN_MS) { this._tweenT += dtMs; if (this._tweenT > TWEEN_MS) this._tweenT = TWEEN_MS; }

    // Finale: crumbs as the cheese is nibbled
    if (this.finale > 0 && this.finale < 850) {
      this._finCrumbT += dtMs;
      if (this._finCrumbT >= 110) {
        this._finCrumbT = 0;
        const { cx, cy } = this._cellCenter(0);
        this._spawnCrumbs(cx - 0.15 * this.cell, cy - 0.1 * this.cell, 3);
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
    const ctx = this.ctx, W = this.W, H = this.H, sh = this.assets;
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

    const cell = this.cell;
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
      this._shadow(ctx, cx, cy);

      if (c === 0) {
        // Cheese goal — vanishes as it is nibbled in the finale.
        if (!(inFinale && this.finale > 650)) this._blitCell(ctx, sh, 'cheese', cx, cy);
        continue;
      }
      const k = this.appleCount - c;          // eat-order index of this apple
      let kind;
      if (k < eatenEff) kind = 'core';
      else if (k === eatenEff && !inFinale) kind = 'apple_bite';
      else kind = 'apple';
      this._blitCell(ctx, sh, kind, cx, cy);
    }

    // ── Mouse (smooth HD sprite) ───────────────────────────────────────────────
    // Pre-anti-aliased, so we draw it with imageSmoothing ENABLED (interpolated)
    // and restore nearest-neighbor afterward so apples/cores/cheese stay crisp.
    {
      let mx, my, jumpY = 0, frame, target;

      if (inFinale) {
        const c = this._cellCenter(0);                 // at the cheese (goal)
        mx = c.cx; my = c.cy;
        frame = this.finale >= 850 ? 'mouse_full' : 'mouse_cheese';
        target = Math.max(cell * 1.45, 36);            // keep the climax clearly visible
      } else if (!this.reducedMotion && this._tweenT < TWEEN_MS) {
        // Hop: tween across the gap to the next apple with a jump arc.
        const tp = this._tweenT / TWEEN_MS;
        const a = this._cellCenter(this._tweenFromCell);
        const b = this._cellCenter(this._tweenToCell);
        mx = a.cx + (b.cx - a.cx) * tp;
        my = a.cy + (b.cy - a.cy) * tp;
        jumpY = -Math.sin(tp * Math.PI) * cell * 0.55;
        frame = tp < 0.34 ? 'mouse_hop0' : tp < 0.7 ? 'mouse_hop1' : 'mouse_hop2';
        target = Math.max(cell * MOUSE_FILL, MOUSE_MIN);
      } else {
        const c = this._cellCenter(activeCell);        // eating at the active apple
        mx = c.cx; my = c.cy;
        frame = this.reducedMotion ? EAT_FRAMES[0] : EAT_FRAMES[this._chewFr];
        target = Math.max(cell * MOUSE_FILL, MOUSE_MIN);
      }

      const scale = target / Math.max(MOUSE_W, MOUSE_H);
      const dw = MOUSE_W * scale, dh = MOUSE_H * scale;
      const dy = jumpY + cell * 0.06;                  // sit a touch over its cell
      ctx.imageSmoothingEnabled = true;
      blit(ctx, sh, frame, mx - dw / 2, my - dh / 2 + dy, scale);
      ctx.imageSmoothingEnabled = false;
    }

    // ── Crumb particles ────────────────────────────────────────────────────────
    if (!this.reducedMotion) {
      const cs = Math.max(1, cell / 14);
      for (const cr of this._crumbs) {
        const a = 1 - cr.age / cr.max;
        if (a <= 0) continue;
        ctx.globalAlpha = a < 1 ? a : 1;
        blit(ctx, sh, 'crumb', Math.round(cr.x), Math.round(cr.y), cs);
      }
      ctx.globalAlpha = 1;
    }
  }

  /** Soft contact shadow under a cell, sized to the cell. */
  _shadow(ctx, cx, cy) {
    const cell = this.cell;
    const rw = cell * 0.34;
    const rh = Math.max(1.5, cell * 0.07);
    const y = cy + cell * 0.36;
    ctx.fillStyle = C.shadow;
    ctx.beginPath();
    ctx.ellipse(cx, y, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Blit an apple/core/cheese frame, picking the detailed or simplified sprite
   * tier from the cell size, scaled (fractional, nearest-neighbor) to fill the
   * square cell and centred on (cx,cy).
   */
  _blitCell(ctx, sh, kind, cx, cy) {
    const cell = this.cell;
    const big = cell >= DETAIL_MIN;
    let name, nw, nh;
    if (kind === 'cheese') {
      if (big) { name = 'cheese'; nw = CHEESE_W; nh = CHEESE_H; }
      else     { name = 'cheese_s'; nw = CHEESE_SW; nh = CHEESE_SH; }
    } else if (kind === 'core') {
      if (big) { name = 'core'; nw = APPLE_W; nh = APPLE_H; }
      else     { name = 'core_s'; nw = APPLE_SW; nh = APPLE_SH; }
    } else { // apple or apple_bite
      if (big) { name = kind; nw = APPLE_W; nh = APPLE_H; }
      else     { name = 'apple_s'; nw = APPLE_SW; nh = APPLE_SH; }
    }
    const scale = cell * FILL / Math.max(nw, nh);   // fit the square cell
    const dw = nw * scale, dh = nh * scale;
    blit(ctx, sh, name, Math.round(cx - dw / 2), Math.round(cy - dh / 2), scale);
  }

  dispose() {}
}
