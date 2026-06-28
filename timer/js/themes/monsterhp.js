/**
 * MonsterHpScene – 16-bit Monster HP Battle, responsive + weapon rotation.
 *
 * Sprite sheet: assets/monsterhp.png + monsterhp.json
 * Frames: hero_idle0/1, hero_draw0/1, hero_loose, hero_run0/1,
 *         hero_sword0/1/2, hero_cast0/1, hero_win,
 *         arrow, magic0/1, slash0/1, impact, skull,
 *         beast_idle0/1, beast_attack0/1,
 *         beast_hurt1/2/3, beast_dead,
 *         hpframe
 *
 * Attack rotation  (repeating cycle, skipped during finale / while casting):
 *   0 → bow shot       (~1 200 ms)
 *   1 → bow shot       (~1 200 ms)
 *   2 → sword combo    (~2 000 ms incl. dash)
 *
 * Magic special fires on each intermediate onMilestone (i = 1..4),
 * advancing beast_hurt tier and playing audio.sfx('magic').
 *
 * Monster fights back every ~4 s with a telegraphed lunge/swipe.
 *
 * reducedMotion: disables grid scroll, camera-shake, dash blur.
 *
 * Layout (resolution-relative, from layout(W,H)):
 *   GY  = H * 0.86 portrait | 0.82 landscape   (ground line, feet land here)
 *   hero feet at GY, hero X ≈ 0.16 * W
 *   beast feet at GY, beast X ≈ 0.62 * W
 */
import { Scene, blit } from '../scene.js';
import { audio }       from '../audio.js';
import { lerpHex }     from '../palette.js';

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  sky0:    '#1a0b2e',
  sky1:    '#00b4c8',
  sun_top: '#ffde50',
  sun_bot: '#ff5500',
  ground:  '#0a1820',
  grid:    '#006055',
  hpfull:  '#39ff14',
  hplow:   '#ff2db4',
};

// ── Sprite logical dimensions (base px, 1:1 with sheet) ───────────────────────
const HERO_W = 28,  HERO_H = 52;   // standard hero frame
const SWRD_W = 36,  SWRD_H = 52;   // sword frames (wider blade)
const BEAST_W = 80, BEAST_H = 82;
const DEAD_H  = 50;
const HP_W    = 120, HP_H = 14;
const SKULL_W = 12,  SKULL_H = 12;

// ── Helpers ───────────────────────────────────────────────────────────────────
function lerp(a, b, t)          { return a + (b - a) * t; }
function clamp(v, lo, hi)       { return v < lo ? lo : v > hi ? hi : v; }
function lerpH(a, b, t)         { return lerpHex(a, b, clamp(t, 0, 1)); }

function drawSun(ctx, cx, cy, r, top, bot) {
  for (let dy = -r; dy <= r; dy++) {
    const dx = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
    if (dx === 0) continue;
    if (dy > 0 && Math.floor((dy - 1) / 5) % 2 === 1) continue;
    ctx.fillStyle = lerpH(top, bot, clamp(dy / r, 0, 1));
    ctx.fillRect(cx - dx, cy + dy, dx * 2, 1);
  }
}

function drawGrid(ctx, W, H, gy, color, scrollT) {
  ctx.strokeStyle = color;
  ctx.lineWidth   = 1;
  const VP = W / 2;
  for (let i = 0; i <= 10; i++) {
    const bx = (i / 10) * W;
    ctx.beginPath(); ctx.moveTo(bx, H); ctx.lineTo(VP, gy); ctx.stroke();
  }
  for (let i = 1; i <= 8; i++) {
    const tt = ((i / 8) + scrollT) % 1;
    const y  = gy + (H - gy) * (1 - Math.pow(1 - tt, 2.2));
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
}

// ── Attack phase constants ────────────────────────────────────────────────────
// Each entry: { type, totalMs }
const ATTACK_CYCLE = [
  { type: 'bow',   totalMs: 1200 },
  { type: 'bow',   totalMs: 1200 },
  { type: 'sword', totalMs: 2000 },
];

// Bow phase offsets (ms into the attack slot)
const BOW_DRAW_START  = 0;
const BOW_DRAW_END    = 350;   // hero_draw0
const BOW_PULL_END    = 650;   // hero_draw1
const BOW_LOOSE_END   = 750;   // hero_loose
const BOW_FLY_END     = 1100;  // arrow flies

// Sword combo offsets
const SWD_RUN0_END    = 250;   // hero_run0 – start dash
const SWD_RUN1_END    = 500;   // hero_run1
const SWD_S0_END      = 750;   // sword0 hold (windup)
const SWD_S1_END      = 950;   // sword1 fast slash
const SWD_S2_END      = 1100;  // sword2 follow-through
const SWD_BACK0_END   = 1450;  // dash back run1
const SWD_BACK1_END   = 1800;  // dash back run0

// Magic cast offsets (ms from cast start, within onMilestone window)
const CAST_TOTAL      = 1600;
const CAST0_END       = 500;   // hero_cast0
const CAST1_END       = 900;   // hero_cast1 + bolt appears
const CAST_HIT_END    = 1200;  // bolt reaches beast

// Beast lunge interval
const BEAST_LUNGE_MS  = 4000;

// ── MonsterHpScene ────────────────────────────────────────────────────────────
export class MonsterHpScene extends Scene {

  /** Called by run.js on resize and before init(). */
  layout(W, H) {
    this.W = W;
    this.H = H;
    this._layoutDone = true;
    const landscape = W > H;
    this.GY = Math.round(H * (landscape ? 0.82 : 0.86));

    // Scale sprites so beast fits nicely (scale relative to canvas)
    const minDim    = Math.min(W, H);
    this.sc         = Math.max(1, Math.round(minDim / 120));  // base scale

    // Hero position – feet at GY
    this.heroBaseX  = Math.round(W * 0.16);
    this.heroFeetY  = this.GY;

    // Beast position – feet at GY
    this.beastBaseX = Math.round(W * 0.62);
    this.beastFeetY = this.GY;

    // Sun
    this.sunX = Math.round(W * 0.5);
    this.sunY = Math.round(H * 0.22);
    this.sunR = Math.round(Math.min(W, H) * 0.09);

    // HP bar: top-anchored, centered, always fully on-screen.
    // Placed below the clock row (top-left, ~fontScale-dependent height) to avoid overlap.
    const hpMargin  = Math.round(W * 0.06);
    const hpTargetW = Math.min(Math.round(W * 0.6), W - 2 * hpMargin);
    this.hpSc   = Math.max(0.5, hpTargetW / HP_W);
    this.hpBarW = Math.round(HP_W * this.hpSc);
    const hpCenterX = Math.round((W - this.hpBarW) / 2);
    this.hpX    = clamp(hpCenterX, hpMargin, W - hpMargin - this.hpBarW);
    const fontScale = Math.max(2, Math.round(W / 100));
    this.hpY    = Math.round(12 + 11 * fontScale);

    // Slash effect position (over the beast's torso)
    this.slashX = this.beastBaseX - Math.round(18 * this.sc);
    this.slashY = this.beastFeetY - Math.round(BEAST_H * this.sc * 0.75);
  }

  init(durationMs) {
    if (!this._layoutDone) {
      this.layout(this.ctx.canvas.width, this.ctx.canvas.height);
    }

    this.t        = 0;
    this.progress = 0;
    this.finale   = 0;

    // Beast hurt tier (0-3), advanced by onMilestone
    this.hurtTier  = 0;

    // Idle breathing
    this._idleFlip = 0;
    this._idleT    = 0;

    // Attack cycle
    this._cycleIdx  = 0;      // 0,1,2 cycling through ATTACK_CYCLE
    this._atkPhaseT = 0;      // ms into current cycle slot
    this._atkActive = false;  // prevents new attack starting mid-combo

    // Casting (magic special)
    this._casting   = false;
    this._castT     = 0;
    this._castHit   = false;

    // Arrow projectile
    this._arrowX    = -1;     // < 0 = not flying
    this._arrowY    = 0;

    // Camera shake
    this._shakeT    = 0;      // ms remaining
    this._shakeOX   = 0;
    this._shakeOY   = 0;

    // Beast lunge (cosmetic fight-back)
    this._beastLungeT    = 0;
    this._beastLungePhase = 0; // 0=idle, 1=windup, 2=lunge, 3=recover
    this._beastLungeAcc  = 1500; // initial offset so first lunge isn't instant

    // Claws-clash spark
    this._clashT    = 0;

    // Slash effect
    this._slashT    = 0;      // ms since slash started (0 = off)
    this._slashFr   = 0;

    // Impact burst
    this._impactT   = 0;

    // Magic bolt
    this._boltX     = -1;
    this._boltY     = 0;
    this._boltFr    = 0;
    this._boltFrT   = 0;

    // Milestone flash
    this._flashAlpha = 0;

    // Beast beast frame override (during beast lunge)
    this._beastFrame = null;  // null = use hurt-tier default
  }

  update(progress, dtMs) {
    this.t        += dtMs;
    this.progress  = progress;

    if (this.finale > 0) { this.finale += dtMs; return; }

    // ── Idle breathing ──────────────────────────────────────────────────────
    this._idleT += dtMs;
    if (this._idleT >= 440) { this._idleFlip = 1 - this._idleFlip; this._idleT = 0; }

    // ── Camera shake decay ──────────────────────────────────────────────────
    if (this._shakeT > 0) {
      this._shakeT -= dtMs;
      if (this._shakeT <= 0) {
        this._shakeT = 0; this._shakeOX = 0; this._shakeOY = 0;
      } else if (!this.reducedMotion) {
        const mag = Math.round(this._shakeT / 80);
        this._shakeOX = (Math.random() > 0.5 ? 1 : -1) * Math.min(3, mag);
        this._shakeOY = (Math.random() > 0.5 ? 1 : -1) * Math.min(2, mag);
      }
    }

    // ── Flash decay ─────────────────────────────────────────────────────────
    if (this._flashAlpha > 0) { this._flashAlpha -= dtMs / 350; if (this._flashAlpha < 0) this._flashAlpha = 0; }

    // ── Slash effect ────────────────────────────────────────────────────────
    if (this._slashT > 0) { this._slashT -= dtMs; if (this._slashT <= 0) this._slashT = 0; }

    // ── Impact burst ────────────────────────────────────────────────────────
    if (this._impactT > 0) { this._impactT -= dtMs; if (this._impactT <= 0) this._impactT = 0; }

    // ── Magic bolt ──────────────────────────────────────────────────────────
    if (this._boltX >= 0) {
      const beastCX = this.beastBaseX + Math.round(BEAST_W * this.sc * 0.4);
      this._boltX  += (beastCX - this._boltX) * clamp(dtMs / 120, 0, 0.5);
      this._boltFrT += dtMs;
      if (this._boltFrT >= 80) { this._boltFr = 1 - this._boltFr; this._boltFrT = 0; }
      if (Math.abs(this._boltX - beastCX) < 6 * this.sc) {
        this._boltX    = -1;
        this._impactT  = 300;
        this._flashAlpha = 0.3;
        audio.sfx('magic');
      }
    }

    // ── Casting (magic special) ─────────────────────────────────────────────
    if (this._casting) {
      this._castT += dtMs;
      if (this._castT >= CAST1_END && !this._castHit && this._boltX < 0) {
        // Launch bolt
        const heroX = this.heroBaseX + Math.round(HERO_W * this.sc * 0.8);
        this._boltX = heroX;
        this._boltY = this.heroFeetY - Math.round(HERO_H * this.sc * 0.65);
        this._boltFr = 0; this._boltFrT = 0;
        this._castHit = true;
      }
      if (this._castT >= CAST_TOTAL) {
        this._casting = false;
        this._atkPhaseT = 0;
        this._atkActive = false;
      }
      return;   // no weapon attack while casting
    }

    // ── Beast fight-back ────────────────────────────────────────────────────
    this._beastLungeAcc += dtMs;
    if (this._beastLungePhase === 0) {
      if (this._beastLungeAcc >= BEAST_LUNGE_MS) {
        this._beastLungeAcc   = 0;
        this._beastLungePhase = 1;   // windup
        this._beastLungeT     = 0;
        this._beastFrame      = 'beast_attack0';
      }
    } else {
      this._beastLungeT += dtMs;
      if (this._beastLungePhase === 1 && this._beastLungeT >= 350) {
        this._beastLungePhase = 2;
        this._beastFrame      = 'beast_attack1';
        // Clash check: hero currently dashing in?
        if (this._atkActive && ATTACK_CYCLE[this._cycleIdx].type === 'sword' &&
            this._atkPhaseT >= SWD_RUN0_END && this._atkPhaseT < SWD_S2_END) {
          this._clashT = 300;
        }
      } else if (this._beastLungePhase === 2 && this._beastLungeT >= 700) {
        this._beastLungePhase = 3;
        this._beastFrame      = 'beast_attack0';
      } else if (this._beastLungePhase === 3 && this._beastLungeT >= 1100) {
        this._beastLungePhase = 0;
        this._beastFrame      = null;
      }
    }
    if (this._clashT > 0) this._clashT -= dtMs;

    // ── Attack cycle ────────────────────────────────────────────────────────
    this._atkPhaseT += dtMs;
    const slot = ATTACK_CYCLE[this._cycleIdx];

    if (!this._atkActive) {
      // Idle gap between attacks – wait a short moment before starting
      if (this._atkPhaseT >= 200) {
        this._atkActive = true;
        this._atkPhaseT = 0;
        this._arrowX    = -1;
      }
    } else {
      if (slot.type === 'bow') this._tickBow(dtMs);
      else                     this._tickSword(dtMs);

      if (this._atkPhaseT >= slot.totalMs) {
        // Advance cycle
        this._cycleIdx  = (this._cycleIdx + 1) % ATTACK_CYCLE.length;
        this._atkPhaseT = 0;
        this._atkActive = false;
        this._arrowX    = -1;
      }
    }
  }

  _tickBow(dtMs) {
    const t = this._atkPhaseT;
    // Arrow flight
    if (t >= BOW_LOOSE_END && this._arrowX < 0) {
      // Spawn arrow from hero's right side
      this._arrowX = this.heroBaseX + Math.round(HERO_W * this.sc * 0.9);
      this._arrowY = this.heroFeetY - Math.round(HERO_H * this.sc * 0.55);
    }
    if (this._arrowX >= 0) {
      const speed = (this.beastBaseX - this.heroBaseX) / ((BOW_FLY_END - BOW_LOOSE_END) / 1000);
      this._arrowX += speed * (dtMs / 1000);
      const hitX = this.beastBaseX + Math.round(20 * this.sc);
      if (this._arrowX >= hitX) {
        this._arrowX   = -1;
        this._impactT  = 250;
        audio.sfx('hit');
      }
    }
  }

  _tickSword(dtMs) {
    const t = this._atkPhaseT;
    // Slash arc + shake on fast part of swing
    if (t >= SWD_S1_END - 20 && t <= SWD_S1_END + dtMs + 20 && this._slashT <= 0) {
      this._slashT  = 320;
      this._slashFr = 0;
      this._shakeT  = 260;
      audio.sfx('hit');
    }
    // Second slash frame
    if (t >= SWD_S2_END - 20 && this._slashFr === 0 && this._slashT > 0) {
      this._slashFr = 1;
    }
    if (this._slashT > 0) { this._slashT -= 0; }  // counted in update()
  }

  onMilestone(i, total) {
    // i=1..4 intermediate → magic special; i=total → no extra magic
    if (i < total) {
      this._casting    = true;
      this._castT      = 0;
      this._castHit    = false;
      this._atkActive  = false;
      this._atkPhaseT  = 0;
      this.hurtTier    = clamp(this.hurtTier + 1, 0, 3);
      this._flashAlpha = 0.4;
      // sfx fires when bolt hits (in update), but start cast sound immediately
    } else {
      // Final milestone: just advance hurt
      this.hurtTier = 3;
    }
    audio.sfx('hit');
  }

  onComplete() {
    this.finale      = 1;
    this._casting    = false;
    this._atkActive  = false;
    this._shakeT     = 0;
    this.hurtTier    = 3;
    audio.sfx('win');
  }

  isFinaleDone() { return this.finale > 2000; }

  render() {
    const ctx = this.ctx;
    const W   = this.W;
    const H   = this.H;
    const GY  = this.GY;
    const sh  = this.assets;
    const sc  = this.sc;

    ctx.imageSmoothingEnabled = false;

    // ── Camera shake offset ───────────────────────────────────────────────
    const ox = this._shakeOX;
    const oy = this._shakeOY;
    if (ox !== 0 || oy !== 0) ctx.save(), ctx.translate(ox, oy);

    // ── Sky gradient ──────────────────────────────────────────────────────
    const skyGrad = ctx.createLinearGradient(0, 0, 0, GY);
    skyGrad.addColorStop(0, C.sky0);
    skyGrad.addColorStop(1, C.sky1);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, GY);

    // ── Ground ────────────────────────────────────────────────────────────
    ctx.fillStyle = C.ground;
    ctx.fillRect(0, GY, W, H - GY);

    // ── Sun ───────────────────────────────────────────────────────────────
    drawSun(ctx, this.sunX, this.sunY, this.sunR, C.sun_top, C.sun_bot);

    // ── Grid ──────────────────────────────────────────────────────────────
    const scrollT = this.reducedMotion ? 0 : (this.t / 3200) % 1;
    drawGrid(ctx, W, H, GY, C.grid, scrollT);

    if (!sh) {
      if (ox !== 0 || oy !== 0) ctx.restore();
      return;
    }

    // ── HP Bar (top-anchored, centered, responsive) ───────────────────────
    const hpSc = this.hpSc;
    blit(ctx, sh, 'hpframe', this.hpX, this.hpY, hpSc);
    const hpRatio = Math.max(0, 1 - this.progress);
    const hpIW    = Math.round((HP_W - 6) * hpSc);
    const fillW   = Math.round(hpRatio * hpIW);
    if (fillW > 0) {
      ctx.fillStyle = lerpH(C.hpfull, C.hplow, this.progress);
      ctx.fillRect(this.hpX + Math.round(3 * hpSc), this.hpY + Math.round(3 * hpSc), fillW, Math.round(8 * hpSc));
    }
    // Skull marker at LEFT end of bar (inside on-screen area)
    const skullX = Math.max(Math.round(W * 0.06), this.hpX);
    blit(ctx, sh, 'skull', skullX, this.hpY + Math.round((HP_H - SKULL_H) / 2 * hpSc), hpSc);

    // ── Beast ─────────────────────────────────────────────────────────────
    const beastH = this.finale > 0 ? DEAD_H : BEAST_H;
    const beastY = this.beastFeetY - Math.round(beastH * sc);

    if (this.finale > 0) {
      blit(ctx, sh, 'beast_dead', this.beastBaseX, beastY, sc);
    } else {
      let bf = this._beastFrame;
      if (!bf) {
        const hurtFrames = ['beast_idle0', 'beast_hurt1', 'beast_hurt2', 'beast_hurt3'];
        const idlePick   = ['beast_idle0', 'beast_idle1'];
        if (this.hurtTier === 0) {
          bf = idlePick[this._idleFlip];
        } else {
          bf = hurtFrames[this.hurtTier];
        }
      }
      blit(ctx, sh, bf, this.beastBaseX, beastY, sc);
    }

    // ── Slash effect ──────────────────────────────────────────────────────
    if (this._slashT > 0) {
      const slN = this._slashFr === 0 ? 'slash0' : 'slash1';
      blit(ctx, sh, slN, this.slashX, this.slashY, sc);
    }

    // ── Impact burst ──────────────────────────────────────────────────────
    if (this._impactT > 0) {
      const ix = this.beastBaseX + Math.round(BEAST_W * sc * 0.35);
      const iy = this.beastFeetY - Math.round(BEAST_H * sc * 0.55);
      blit(ctx, sh, 'impact', ix - Math.round(9 * sc), iy - Math.round(9 * sc), sc);
    }

    // ── Hero ─────────────────────────────────────────────────────────────
    const heroY = this.heroFeetY - Math.round(HERO_H * sc);

    if (this.finale > 0) {
      blit(ctx, sh, 'hero_win', this.heroBaseX, heroY, sc);
    } else if (this._casting) {
      const cf = this._castT < CAST0_END ? 'hero_cast0' : 'hero_cast1';
      blit(ctx, sh, cf, this.heroBaseX, heroY, sc);
    } else if (!this._atkActive) {
      // Idle
      blit(ctx, sh, this._idleFlip ? 'hero_idle1' : 'hero_idle0', this.heroBaseX, heroY, sc);
    } else {
      const slot = ATTACK_CYCLE[this._cycleIdx];
      const t    = this._atkPhaseT;

      if (slot.type === 'bow') {
        let hf;
        if (t < BOW_DRAW_END)   hf = 'hero_draw0';
        else if (t < BOW_PULL_END)  hf = 'hero_draw1';
        else                     hf = 'hero_loose';
        blit(ctx, sh, hf, this.heroBaseX, heroY, sc);

        // Flying arrow
        if (this._arrowX >= 0) {
          blit(ctx, sh, 'arrow', Math.round(this._arrowX), Math.round(this._arrowY), sc);
        }
      } else {
        // Sword combo
        let hf, dashX = 0;
        if (t < SWD_RUN0_END) {
          hf = 'hero_run0'; dashX = Math.round(lerp(0, W * 0.2, t / SWD_RUN0_END));
        } else if (t < SWD_RUN1_END) {
          hf = 'hero_run1'; dashX = Math.round(W * 0.2);
          if (!this.reducedMotion) {
            // Motion-blur trail
            ctx.globalAlpha = 0.3;
            blit(ctx, sh, 'hero_run0', this.heroBaseX + dashX - Math.round(sc * 8), heroY, sc);
            ctx.globalAlpha = 1;
          }
        } else if (t < SWD_S0_END) {
          hf = 'hero_sword0'; dashX = Math.round(W * 0.2);
        } else if (t < SWD_S1_END) {
          const sw = sh.frames['hero_sword1'];
          hf = 'hero_sword1'; dashX = Math.round(W * 0.2);
        } else if (t < SWD_S2_END) {
          hf = 'hero_sword2'; dashX = Math.round(W * 0.2);
        } else if (t < SWD_BACK0_END) {
          hf = 'hero_run1'; dashX = Math.round(lerp(W * 0.2, 0, (t - SWD_S2_END) / (SWD_BACK0_END - SWD_S2_END)));
        } else {
          hf = 'hero_run0'; dashX = Math.round(lerp(0, 0, (t - SWD_BACK0_END) / (SWD_BACK1_END - SWD_BACK0_END)));
        }
        const sw = sh.frames[hf];
        const fw = sw ? sw[2] : HERO_W;
        blit(ctx, sh, hf, this.heroBaseX + dashX, heroY, sc);
      }
    }

    // ── Magic bolt ────────────────────────────────────────────────────────
    if (this._boltX >= 0) {
      const bn = this._boltFr === 0 ? 'magic0' : 'magic1';
      blit(ctx, sh, bn, Math.round(this._boltX) - Math.round(6 * sc), Math.round(this._boltY) - Math.round(6 * sc), sc);
    }

    // ── Clash spark ───────────────────────────────────────────────────────
    if (this._clashT > 0) {
      const cx2 = this.beastBaseX - Math.round(8 * sc);
      const cy2 = this.beastFeetY - Math.round(BEAST_H * sc * 0.5);
      ctx.fillStyle = 'rgba(255,220,40,0.85)';
      ctx.fillRect(cx2 - 3, cy2 - 3, 6, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(cx2 - 1, cy2 - 1, 2, 2);
    }

    // ── Milestone flash ───────────────────────────────────────────────────
    if (this._flashAlpha > 0) {
      ctx.fillStyle = `rgba(255,45,180,${this._flashAlpha.toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
    }

    if (ox !== 0 || oy !== 0) ctx.restore();
  }

  dispose() {}
}
