/**
 * AlchemyScene – Chrono-Warp: Earth in Reverse Countdown.
 *
 * An epic cosmic hourglass that flows in REVERSE, rewinding entropy and journeying
 * backward through Earth's history before culminating in the ultimate origin of everything:
 * The Big Bang!
 *
 * Reverse Epochs (Earth History Rewind):
 *   - 0.00 .. 0.20: Modern Digital Era (2026 AD: neon cyberpunk skyline, cyber grids)
 *   - 0.20 .. 0.40: Victorian Steam Age (1880 AD: steam locomotive chugging, cobblestone city)
 *   - 0.40 .. 0.60: Ancient Civilizations (2500 BC: Great Pyramids under desert sun)
 *   - 0.60 .. 0.80: Jurassic Dinosaurs (150M BC: prehistoric jungle, roaring T-Rex)
 *   - 0.80 .. 0.95: Primordial Molten Earth (4.5B BC: magma sea, flaming meteors)
 *   - 0.95 .. 1.00: Cosmic Singularity (T = 0: space contracts into an infinitely dense point)
 *
 * Finale (at 0:00):
 *   - 0 .. 600ms: Singularity contracts to infinite density.
 *   - 600 .. 2500ms: THE BIG BANG! Cosmic inflation detonation birthing light, stars, and galaxies!
 *   - 2500 .. 4600ms: Cosmic Dawn with expanding nebulae and spiral galaxies.
 */
import { Scene, blit } from '../scene.js';
import { audio }       from '../audio.js';

export const CHRONO_BANG_MS = 600;
export const CHRONO_FINALE_TOTAL_MS = 4600;

export function clampN(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export function chronoEra(progress) {
  const p = clampN(progress, 0, 1);
  if (p < 0.20) return 'modern_cyber';
  if (p < 0.40) return 'victorian_steam';
  if (p < 0.60) return 'ancient_egypt';
  if (p < 0.80) return 'jurassic_dinosaurs';
  if (p < 0.95) return 'primordial_earth';
  return 'singularity_pre_bang';
}

// In reverse time, the top bulb fills up as time winds backward!
export function topBulbFill(progress) {
  return clampN(progress, 0, 1);
}

export function bottomBulbFill(progress) {
  return 1 - clampN(progress, 0, 1);
}

export function bigBangScale(elapsedMs, maxScale) {
  if (elapsedMs < CHRONO_BANG_MS) return 0;
  const t = clampN((elapsedMs - CHRONO_BANG_MS) / 1600, 0, 1);
  return maxScale * Math.sin(t * Math.PI * 0.5);
}

export function finalePhase(elapsedMs) {
  if (elapsedMs < 0) return 'idle';
  if (elapsedMs < CHRONO_BANG_MS) return 'singularity_collapse';
  if (elapsedMs < 2500) return 'the_big_bang';
  if (elapsedMs < CHRONO_FINALE_TOTAL_MS) return 'cosmic_dawn';
  return 'done';
}

const C = {
  cyberDark: '#080512',
  victorianSepia: '#1c1510',
  egyptGold: '#2d1b08',
  jurassicGreen: '#061a0e',
  primordialRed: '#260408',
  spaceBlack: '#020008',
  brassGold: '#ffd166',
  cyan: '#00f5d4',
  magenta: '#ff007f',
  white: '#ffffff',
  sand: '#ffe082',
};

export class AlchemyScene extends Scene {
  constructor(ctx, assets, opts) {
    super(ctx, assets, opts);
    this.time = 0;
    this.progress = 0;
    this.remainingMs = 0;

    this.cx = 120;
    this.cy = 110;

    this.reverseGrains = [];
    this.cosmicSparks = [];
    this.trainX = -45;
    this.meteorY = -30;

    this.finaleActive = false;
    this.finaleElapsed = 0;
    this.sfxPlayedBang = false;

    this._initGrains();
  }

  _initGrains() {
    this.reverseGrains = [];
    for (let i = 0; i < 20; i++) {
      this.reverseGrains.push({
        x: this.cx + (Math.random() - 0.5) * 6,
        y: this.cy + 15 + Math.random() * 25,
        vy: -0.08 - Math.random() * 0.12,
        life: 1.0,
      });
    }
  }

  layout(W, H) {
    super.layout(W, H);
    this.cx = Math.round(W * 0.5);
    this.cy = Math.round(H * 0.46);
  }

  init(durationMs) {
    this.time = 0;
    this.progress = 0;
    this.remainingMs = durationMs;
    this.cosmicSparks = [];
    this.trainX = -45;
    this.meteorY = -30;
    this.finaleActive = false;
    this.finaleElapsed = 0;
    this.sfxPlayedBang = false;
  }

  update(progress, dtMs, remainingMs) {
    this.time += dtMs;
    this.progress = clampN(progress, 0, 1);
    this.remainingMs = remainingMs;

    const era = chronoEra(this.progress);

    // Grains stream UPWARD from bottom to top (time reversing!)
    if (this.progress < 0.98) {
      if (Math.random() < 0.25) {
        this.reverseGrains.push({
          x: this.cx + (Math.random() - 0.5) * 4,
          y: this.cy + 22,
          vy: -0.09 - Math.random() * 0.12,
          life: 1.0,
        });
      }
    }

    for (let i = this.reverseGrains.length - 1; i >= 0; i--) {
      const g = this.reverseGrains[i];
      g.y += g.vy * dtMs;
      g.life -= 0.002 * dtMs;
      if (g.life <= 0 || g.y < this.cy - 24) {
        this.reverseGrains.splice(i, 1);
      }
    }

    // Victorian train chugging
    if (era === 'victorian_steam') {
      this.trainX += 0.05 * dtMs;
      if (this.trainX > this.W + 40) this.trainX = -45;
    }

    // Primordial meteor streaking
    if (era === 'primordial_earth') {
      this.meteorY += 0.12 * dtMs;
      if (this.meteorY > this.H + 30) this.meteorY = -30;
    }

    // Finale Big Bang Logic
    if (this.finaleActive) {
      this.finaleElapsed += dtMs;
      if (this.finaleElapsed >= CHRONO_BANG_MS && !this.sfxPlayedBang) {
        this.sfxPlayedBang = true;
        audio.sfx('win');

        // Explosive burst of cosmic particles
        for (let i = 0; i < 40; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 1.2 + Math.random() * 4.5;
          this.cosmicSparks.push({
            x: this.cx,
            y: this.cy,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            alpha: 1.0,
            size: 1 + Math.floor(Math.random() * 3),
            color: (Math.random() < 0.33) ? C.brassGold : (Math.random() < 0.66 ? C.cyan : C.magenta),
          });
        }
      }

      for (let i = this.cosmicSparks.length - 1; i >= 0; i--) {
        const s = this.cosmicSparks[i];
        s.x += s.vx * (dtMs / 16.6);
        s.y += s.vy * (dtMs / 16.6);
        s.alpha -= 0.01 * (dtMs / 16.6);
        if (s.alpha <= 0) this.cosmicSparks.splice(i, 1);
      }
    }
  }

  onMilestone(i, total) {
    audio.sfx('magic');
    // Cosmic pulse
    for (let j = 0; j < 12; j++) {
      this.cosmicSparks.push({
        x: this.cx + (Math.random() - 0.5) * 20,
        y: this.cy + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 3,
        vy: (Math.random() - 0.5) * 3,
        alpha: 1.0,
        size: 2,
        color: C.brassGold,
      });
    }
  }

  onComplete() {
    this.finaleActive = true;
    this.finaleElapsed = 0;
  }

  isFinaleDone() {
    return this.finaleActive && this.finaleElapsed >= CHRONO_FINALE_TOTAL_MS;
  }

  render() {
    const c = this.ctx;
    const W = this.W, H = this.H;
    const cx = this.cx, cy = this.cy;
    const p = this.progress;
    const era = chronoEra(p);
    const topF = topBulbFill(p);
    const botF = bottomBulbFill(p);

    // 1. Era-Specific Historical Background
    this._renderHistoricalEra(c, W, H, era);

    // 2. Central Chrono-Warp Hourglass
    if (!this.finaleActive || this.finaleElapsed < CHRONO_BANG_MS + 400) {
      this._renderHourglass(c, cx, cy, topF, botF, p);
    }

    // 3. The Big Bang Finale Explosion
    if (this.finaleActive) {
      this._renderBigBangFinale(c, cx, cy);
    }

    // 4. Era Readout HUD Banner
    this._renderEraHUD(c, W, era, p);
  }

  _renderHistoricalEra(c, W, H, era) {
    if (era === 'modern_cyber') {
      // 2026 AD: Cyberpunk Skyline
      c.fillStyle = C.cyberDark;
      c.fillRect(0, 0, W, H);
      // Neon towers silhouette
      c.fillStyle = '#150d2e';
      c.fillRect(10, H - 70, 35, 70);
      c.fillRect(55, H - 95, 40, 95);
      c.fillRect(W - 90, H - 85, 38, 85);
      c.fillRect(W - 45, H - 65, 35, 65);
      // Neon window lights
      c.fillStyle = C.cyan;
      c.fillRect(20, H - 50, 2, 2);
      c.fillRect(70, H - 80, 2, 2);
      c.fillRect(W - 75, H - 60, 2, 2);
      c.fillStyle = C.magenta;
      c.fillRect(24, H - 35, 2, 2);
      c.fillRect(80, H - 40, 2, 2);
    } else if (era === 'victorian_steam') {
      // 1880 AD: Victorian London
      c.fillStyle = C.victorianSepia;
      c.fillRect(0, 0, W, H);
      // Big Ben / clocktower silhouette
      c.fillStyle = '#2d2218';
      c.fillRect(15, H - 85, 24, 85);
      c.beginPath();
      c.moveTo(12, H - 85); c.lineTo(27, H - 105); c.lineTo(42, H - 85);
      c.fill();
      // Steam train chugging past
      blit(c, this.assets, 'steam_train', Math.round(this.trainX), H - 34, 1);
      // Coal smoke puffs
      c.fillStyle = 'rgba(210, 200, 190, 0.4)';
      c.beginPath();
      c.arc(Math.round(this.trainX) + 8, H - 42, 6, 0, Math.PI * 2);
      c.arc(Math.round(this.trainX) - 4, H - 48, 9, 0, Math.PI * 2);
      c.fill();
    } else if (era === 'ancient_egypt') {
      // 2500 BC: Ancient Egypt & Pyramids
      c.fillStyle = C.egyptGold;
      c.fillRect(0, 0, W, H);
      // Blazing sun disk
      c.fillStyle = '#ffaa00';
      c.beginPath();
      c.arc(W - 45, 45, 18, 0, Math.PI * 2);
      c.fill();
      // Great Pyramid
      blit(c, this.assets, 'pyramid', 20, H - 46, 1);
      blit(c, this.assets, 'pyramid', W - 65, H - 42, 1);
      // Desert sand dunes
      c.fillStyle = '#c98a28';
      c.beginPath();
      c.moveTo(0, H - 18);
      c.bezierCurveTo(60, H - 28, 140, H - 10, W, H - 20);
      c.lineTo(W, H); c.lineTo(0, H);
      c.fill();
    } else if (era === 'jurassic_dinosaurs') {
      // 150M BC: Jurassic Jungle & Roaring T-Rex
      c.fillStyle = C.jurassicGreen;
      c.fillRect(0, 0, W, H);
      // Smoking volcano
      c.fillStyle = '#1e2d1a';
      c.beginPath();
      c.moveTo(W - 85, H); c.lineTo(W - 45, H - 65); c.lineTo(W - 5, H);
      c.fill();
      // Volcano smoke plume
      c.fillStyle = 'rgba(80, 50, 40, 0.5)';
      c.beginPath();
      c.arc(W - 45, H - 75, 10, 0, Math.PI * 2);
      c.arc(W - 35, H - 90, 14, 0, Math.PI * 2);
      c.fill();
      // Roaring T-Rex
      blit(c, this.assets, 'trex', 18, H - 46, 1);
    } else if (era === 'primordial_earth') {
      // 4.5B BC: Molten Magma Earth & Meteors
      c.fillStyle = C.primordialRed;
      c.fillRect(0, 0, W, H);
      // Magma boiling ocean
      c.fillStyle = '#d63012';
      c.fillRect(0, H - 22, W, 22);
      c.fillStyle = '#ffe033';
      c.fillRect(0, H - 24, W, 3);
      // Fiery Meteor Falling
      blit(c, this.assets, 'meteor', 35, Math.round(this.meteorY), 1);
      blit(c, this.assets, 'meteor', W - 55, Math.round(this.meteorY - 40), 1);
    } else {
      // T = 0: Singularity Pre-Bang (Space collapsed into darkness)
      c.fillStyle = C.spaceBlack;
      c.fillRect(0, 0, W, H);
    }
  }

  _renderHourglass(c, cx, cy, topF, botF, p) {
    const hw = 16, hh = 24;

    c.save();
    // Glass Chamber Fill
    // Top bulb liquid (fills up as time reverses!)
    if (topF > 0.05) {
      const fillH = Math.round(topF * 18);
      c.fillStyle = C.sand;
      c.fillRect(cx - 10, cy - 6 - fillH, 20, fillH);
    }

    // Bottom bulb liquid (drains as time reverses!)
    if (botF > 0.05) {
      const fillH = Math.round(botF * 18);
      c.fillStyle = C.sand;
      c.fillRect(cx - 10, (cy + 22) - fillH, 20, fillH);
    }

    // Reverse sand grains streaming UPWARD
    c.fillStyle = C.brassGold;
    for (const g of this.reverseGrains) {
      c.fillRect(Math.round(g.x), Math.round(g.y), 2, 2);
    }

    // Hourglass Frame Sprite (32x48)
    blit(c, this.assets, 'hourglass_frame', cx - 16, cy - 24, 1);

    // Singularity glow at t = 0
    if (p >= 0.95) {
      const singGrad = c.createRadialGradient(cx, cy, 2, cx, cy, 28);
      singGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      singGrad.addColorStop(0.5, 'rgba(0, 245, 212, 0.5)');
      singGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      c.fillStyle = singGrad;
      c.beginPath();
      c.arc(cx, cy, 28, 0, Math.PI * 2);
      c.fill();
    }

    c.restore();
  }

  _renderBigBangFinale(c, cx, cy) {
    const elapsed = this.finaleElapsed;
    const scale = bigBangScale(elapsed, 1.8);

    if (scale > 0) {
      c.save();
      // Blinding Big Bang Flash
      const bbGrad = c.createRadialGradient(cx, cy, 5, cx, cy, 95 * scale);
      bbGrad.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
      bbGrad.addColorStop(0.3, 'rgba(255, 209, 102, 0.85)');
      bbGrad.addColorStop(0.6, 'rgba(0, 245, 212, 0.5)');
      bbGrad.addColorStop(0.85, 'rgba(255, 0, 127, 0.3)');
      bbGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      c.fillStyle = bbGrad;
      c.beginPath();
      c.arc(cx, cy, 95 * scale, 0, Math.PI * 2);
      c.fill();

      // Cosmic Shockwave Expansion Rings
      c.strokeStyle = C.white;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(cx, cy, 75 * scale, 0, Math.PI * 2);
      c.stroke();

      // Expanding Cosmic Sparks
      for (const s of this.cosmicSparks) {
        c.fillStyle = s.color;
        c.globalAlpha = s.alpha;
        c.fillRect(Math.round(s.x), Math.round(s.y), s.size, s.size);
      }
      c.restore();
    }
  }

  _renderEraHUD(c, W, era, p) {
    c.save();
    c.fillStyle = 'rgba(2, 0, 8, 0.85)';
    c.fillRect(W - 84, 8, 78, 28);
    c.strokeStyle = C.brassGold;
    c.lineWidth = 1;
    c.strokeRect(W - 84, 8, 78, 28);

    c.fillStyle = C.brassGold;
    c.font = '8px monospace';
    const eraText = (era === 'modern_cyber') ? '2026 AD' :
                    (era === 'victorian_steam') ? '1880 AD' :
                    (era === 'ancient_egypt') ? '2500 BC' :
                    (era === 'jurassic_dinosaurs') ? '150M BC' :
                    (era === 'primordial_earth') ? '4.5B BC' : 'T = 0';
    c.fillText(eraText, W - 78, 20);

    c.font = '7px monospace';
    c.fillStyle = C.cyan;
    const eraSub = (era === 'modern_cyber') ? 'DIGITAL' :
                   (era === 'victorian_steam') ? 'STEAM' :
                   (era === 'ancient_egypt') ? 'EGYPT' :
                   (era === 'jurassic_dinosaurs') ? 'JURASSIC' :
                   (era === 'primordial_earth') ? 'HADEAN' : 'BIG BANG';
    c.fillText(eraSub, W - 78, 31);
    c.restore();
  }

  dispose() {
    this.reverseGrains = [];
    this.cosmicSparks = [];
  }
}
