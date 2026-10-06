/**
 * AlchemyScene – Chrono-Warp: Living Eras & The Reverse Hourglass.
 *
 * An epic cosmic hourglass that flows in REVERSE, rewinding entropy and journeying
 * backward through Earth's history before culminating in the ultimate origin of everything:
 * The Big Bang!
 *
 * Reverse Epochs (Living Animated Worlds):
 *   - 0.00 .. 0.20: Cyberpunk 2026 AD (neon skyline, holographic billboards, hover-cars zooming backwards,
 *     neon data rain rising upward in reverse)
 *   - 0.20 .. 0.40: Victorian Steam Age 1880 AD (cobblestone city, Big Ben clock hands spinning backwards,
 *     iron steam train chugging across railway in reverse with smoke puffs)
 *   - 0.40 .. 0.60: Ancient Egypt 2500 BC (Great Pyramids of Giza, desert camel caravan walking across dunes,
 *     golden sun disk of Ra)
 *   - 0.60 .. 0.80: Jurassic Dinosaurs 150M BC (prehistoric cycad jungle, smoking volcano, flying Pterodactyls
 *     flapping wings across sky, roaring T-Rex)
 *   - 0.80 .. 0.95: Primordial Molten Earth 4.5B BC (surging Hadean magma ocean, continuous fiery meteor showers)
 *   - 0.95 .. 1.00: Cosmic Singularity (T = 0: space-time collapses into an infinitely dense quantum point)
 *
 * Finale (at 0:00):
 *   - The hourglass shatters and space detonates into THE BIG BANG!
 *   - Blinding multi-spectral cosmic inflation explosion, prismatic expanding rings of light,
 *     and the cosmic dawn of newborn galaxies and stars.
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
  cyberDark: '#080514',
  victorianSepia: '#1c1510',
  egyptGold: '#281706',
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
    this.cy = 90;

    this.reverseGrains = [];
    this.cosmicSparks = [];
    this.risingRain = [];

    // Living epoch creature positions
    this.hoverCarX = 260;
    this.trainX = 270;
    this.camelX = -30;
    this.pteroX = -40;
    this.meteorY = -30;

    this.finaleActive = false;
    this.finaleElapsed = 0;
    this.sfxPlayedBang = false;

    this._initParticles();
  }

  _initParticles() {
    this.reverseGrains = [];
    for (let i = 0; i < 28; i++) {
      this.reverseGrains.push({
        x: this.cx + (Math.random() - 0.5) * 8,
        y: this.cy + 18 + Math.random() * 25,
        vy: -0.09 - Math.random() * 0.14,
        life: 1.0,
      });
    }

    this.risingRain = [];
    for (let i = 0; i < 18; i++) {
      this.risingRain.push({
        x: Math.random() * 240,
        y: Math.random() * 240,
        speed: 0.2 + Math.random() * 0.4,
      });
    }
  }

  layout(W, H) {
    super.layout(W, H);
    this.cx = Math.round(W * 0.5);
    this.cy = Math.round(H * 0.38);
  }

  init(durationMs) {
    this.time = 0;
    this.progress = 0;
    this.remainingMs = durationMs;
    this.cosmicSparks = [];
    this.hoverCarX = this.W + 20;
    this.trainX = this.W + 40;
    this.camelX = -30;
    this.pteroX = -40;
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

    // Grains stream UPWARD from bottom to top bulb
    if (this.progress < 0.98) {
      if (Math.random() < 0.35) {
        this.reverseGrains.push({
          x: this.cx + (Math.random() - 0.5) * 6,
          y: this.cy + 24,
          vy: -0.10 - Math.random() * 0.14,
          life: 1.0,
        });
      }
    }

    for (let i = this.reverseGrains.length - 1; i >= 0; i--) {
      const g = this.reverseGrains[i];
      g.y += g.vy * dtMs;
      g.life -= 0.002 * dtMs;
      if (g.life <= 0 || g.y < this.cy - 26) {
        this.reverseGrains.splice(i, 1);
      }
    }

    // Moving epoch creatures and reverse animations:
    // 1. Cyberpunk: Hover-cars zooming backwards
    if (era === 'modern_cyber') {
      this.hoverCarX -= 0.06 * dtMs;
      if (this.hoverCarX < -40) this.hoverCarX = this.W + 40;
      // Reverse rising rain
      for (const r of this.risingRain) {
        r.y -= r.speed * dtMs;
        if (r.y < 0) r.y = this.H;
      }
    }

    // 2. Victorian: Steam train chugging in reverse
    if (era === 'victorian_steam') {
      this.trainX -= 0.045 * dtMs;
      if (this.trainX < -50) this.trainX = this.W + 50;
    }

    // 3. Egypt: Camel caravan walking across dunes
    if (era === 'ancient_egypt') {
      this.camelX += 0.03 * dtMs;
      if (this.camelX > this.W + 40) this.camelX = -40;
    }

    // 4. Jurassic: Pterodactyl flying across sky
    if (era === 'jurassic_dinosaurs') {
      this.pteroX += 0.05 * dtMs;
      if (this.pteroX > this.W + 40) this.pteroX = -40;
    }

    // 5. Primordial: Fiery meteors crashing
    if (era === 'primordial_earth') {
      this.meteorY += 0.14 * dtMs;
      if (this.meteorY > this.H + 40) this.meteorY = -30;
    }

    // Finale Big Bang Logic
    if (this.finaleActive) {
      this.finaleElapsed += dtMs;
      if (this.finaleElapsed >= CHRONO_BANG_MS && !this.sfxPlayedBang) {
        this.sfxPlayedBang = true;
        audio.sfx('win');

        // Explosive burst of cosmic particles
        for (let i = 0; i < 45; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 1.2 + Math.random() * 4.8;
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
    for (let j = 0; j < 14; j++) {
      this.cosmicSparks.push({
        x: this.cx + (Math.random() - 0.5) * 24,
        y: this.cy + (Math.random() - 0.5) * 24,
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

    // 1. Living Historical Era Background
    this._renderHistoricalEra(c, W, H, era);

    // 2. Grand Ornate Celestial Hourglass (Clearly Identifiable!)
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
      // 2026 AD: Cyberpunk Skyline & Flying Spinners
      c.fillStyle = C.cyberDark;
      c.fillRect(0, 0, W, H);

      // Neon towers
      c.fillStyle = '#150d2e';
      c.fillRect(10, H - 75, 38, 75);
      c.fillRect(55, H - 100, 42, 100);
      c.fillRect(W - 95, H - 90, 40, 90);
      c.fillRect(W - 48, H - 70, 38, 70);

      // Windows
      c.fillStyle = C.cyan;
      c.fillRect(20, H - 55, 3, 3);
      c.fillRect(70, H - 85, 3, 3);
      c.fillRect(W - 80, H - 65, 3, 3);
      c.fillStyle = C.magenta;
      c.fillRect(26, H - 40, 3, 3);
      c.fillRect(80, H - 45, 3, 3);

      // Flying Hover-Car zooming backwards
      const carY = 55 + Math.sin(this.time * 0.003) * 6;
      blit(c, this.assets, 'hover_car', Math.round(this.hoverCarX), Math.round(carY), 1);

      // Reverse Rising Neon Code Rain
      c.fillStyle = 'rgba(0, 245, 212, 0.35)';
      for (const r of this.risingRain) {
        c.fillRect(Math.round(r.x), Math.round(r.y), 1, 4);
      }
    } else if (era === 'victorian_steam') {
      // 1880 AD: Victorian London & Reverse Steam Train
      c.fillStyle = C.victorianSepia;
      c.fillRect(0, 0, W, H);

      // Big Ben / Clocktower with reverse spinning hands
      c.fillStyle = '#2d2218';
      c.fillRect(15, H - 95, 26, 95);
      c.beginPath();
      c.moveTo(12, H - 95); c.lineTo(28, H - 118); c.lineTo(44, H - 95);
      c.fill();
      // Clockface
      c.fillStyle = '#fffae0';
      c.beginPath();
      c.arc(28, H - 85, 8, 0, Math.PI * 2);
      c.fill();
      // Reverse spinning hands
      const clockAngle = -this.time * 0.008;
      c.strokeStyle = '#000000';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(28, H - 85);
      c.lineTo(28 + Math.cos(clockAngle) * 5, (H - 85) + Math.sin(clockAngle) * 5);
      c.stroke();

      // Elevated brick railway bridge
      c.fillStyle = '#3a2b22';
      c.fillRect(0, H - 30, W, 8);

      // Steam Train chugging in reverse!
      blit(c, this.assets, 'steam_train', Math.round(this.trainX), H - 42, 1, true);

      // Rising coal smoke puffs
      c.fillStyle = 'rgba(210, 200, 190, 0.45)';
      c.beginPath();
      c.arc(Math.round(this.trainX) + 12, H - 48, 6, 0, Math.PI * 2);
      c.arc(Math.round(this.trainX) + 22, H - 54, 9, 0, Math.PI * 2);
      c.fill();
    } else if (era === 'ancient_egypt') {
      // 2500 BC: Ancient Egypt & Camel Caravan
      c.fillStyle = C.egyptGold;
      c.fillRect(0, 0, W, H);

      // Golden Sun of Ra
      c.fillStyle = '#ffaa00';
      c.beginPath();
      c.arc(W - 40, 40, 18, 0, Math.PI * 2);
      c.fill();

      // Great Pyramid of Giza
      blit(c, this.assets, 'pyramid', 16, H - 48, 1);
      blit(c, this.assets, 'pyramid', W - 60, H - 44, 1);

      // Desert sand dunes
      c.fillStyle = '#b8860b';
      c.beginPath();
      c.moveTo(0, H - 16);
      c.bezierCurveTo(60, H - 26, 140, H - 10, W, H - 18);
      c.lineTo(W, H); c.lineTo(0, H);
      c.fill();

      // Camel Caravan walking across the dunes!
      blit(c, this.assets, 'camel', Math.round(this.camelX), H - 28, 1);
    } else if (era === 'jurassic_dinosaurs') {
      // 150M BC: Jurassic Jungle, Flying Pterodactyl, Roaring T-Rex
      c.fillStyle = C.jurassicGreen;
      c.fillRect(0, 0, W, H);

      // Volcano in background
      c.fillStyle = '#1e2d1a';
      c.beginPath();
      c.moveTo(W - 85, H); c.lineTo(W - 45, H - 70); c.lineTo(W - 5, H);
      c.fill();
      // Lava crater smoke
      c.fillStyle = 'rgba(90, 50, 40, 0.5)';
      c.beginPath();
      c.arc(W - 45, H - 80, 10, 0, Math.PI * 2);
      c.arc(W - 35, H - 95, 14, 0, Math.PI * 2);
      c.fill();

      // Flying Pterodactyl soaring across sky!
      const pteroY = 50 + Math.sin(this.time * 0.004) * 8;
      blit(c, this.assets, 'pterodactyl', Math.round(this.pteroX), Math.round(pteroY), 1);

      // Roaring T-Rex!
      blit(c, this.assets, 'trex', 14, H - 50, 1);
    } else if (era === 'primordial_earth') {
      // 4.5B BC: Molten Magma Sea & Meteors
      c.fillStyle = C.primordialRed;
      c.fillRect(0, 0, W, H);

      // Boiling Magma Sea
      c.fillStyle = '#d63012';
      c.fillRect(0, H - 24, W, 24);
      c.fillStyle = '#ffe033';
      c.fillRect(0, H - 26, W, 4);

      // Flaming Meteors crashing
      blit(c, this.assets, 'meteor', 30, Math.round(this.meteorY), 1);
      blit(c, this.assets, 'meteor', W - 50, Math.round(this.meteorY - 45), 1);
    } else {
      // T = 0: Singularity Pre-Bang (Space collapsed into darkness)
      c.fillStyle = C.spaceBlack;
      c.fillRect(0, 0, W, H);
    }
  }

  _renderHourglass(c, cx, cy, topF, botF, p) {
    c.save();

    // 1. Grand Ornate Hourglass Frame (44x70)
    blit(c, this.assets, 'hourglass_frame', cx - 22, cy - 35, 1);

    // 2. Sand Chambers
    // Top bulb liquid (fills up as time winds backward!)
    if (topF > 0.04) {
      const fillH = Math.round(topF * 20);
      c.fillStyle = C.sand;
      c.beginPath();
      c.moveTo(cx - 12, (cy - 6) - fillH);
      c.lineTo(cx + 12, (cy - 6) - fillH);
      c.lineTo(cx + 4, cy - 6);
      c.lineTo(cx - 4, cy - 6);
      c.closePath();
      c.fill();
    }

    // Bottom bulb liquid (drains as time winds backward!)
    if (botF > 0.04) {
      const fillH = Math.round(botF * 20);
      c.fillStyle = C.sand;
      c.beginPath();
      c.moveTo(cx - 4, cy + 6);
      c.lineTo(cx + 4, cy + 6);
      c.lineTo(cx + 12, (cy + 6) + fillH);
      c.lineTo(cx - 12, (cy + 6) + fillH);
      c.closePath();
      c.fill();
    }

    // Reverse sand grains streaming UPWARD
    c.fillStyle = C.brassGold;
    for (const g of this.reverseGrains) {
      c.fillRect(Math.round(g.x), Math.round(g.y), 2, 2);
    }

    // Singularity glow at t = 0
    if (p >= 0.95) {
      blit(c, this.assets, 'singularity', cx - 14, cy - 14, 1);
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

      // Cosmic Shockwave Rings
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
    c.fillRect(W - 86, 8, 80, 28);
    c.strokeStyle = C.brassGold;
    c.lineWidth = 1;
    c.strokeRect(W - 86, 8, 80, 28);

    c.fillStyle = C.brassGold;
    c.font = '8px monospace';
    const eraText = (era === 'modern_cyber') ? '2026 AD' :
                    (era === 'victorian_steam') ? '1880 AD' :
                    (era === 'ancient_egypt') ? '2500 BC' :
                    (era === 'jurassic_dinosaurs') ? '150M BC' :
                    (era === 'primordial_earth') ? '4.5B BC' : 'T = 0';
    c.fillText(eraText, W - 80, 20);

    c.font = '7px monospace';
    c.fillStyle = C.cyan;
    const eraSub = (era === 'modern_cyber') ? 'DIGITAL' :
                   (era === 'victorian_steam') ? 'STEAM' :
                   (era === 'ancient_egypt') ? 'EGYPT' :
                   (era === 'jurassic_dinosaurs') ? 'JURASSIC' :
                   (era === 'primordial_earth') ? 'HADEAN' : 'BIG BANG';
    c.fillText(eraSub, W - 80, 31);
    c.restore();
  }

  dispose() {
    this.reverseGrains = [];
    this.cosmicSparks = [];
    this.risingRain = [];
  }
}
