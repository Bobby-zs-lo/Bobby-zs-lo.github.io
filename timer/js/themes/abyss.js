/**
 * AbyssScene – Deep Sea Leviathan Countdown.
 *
 * An atmospheric descent from the sunlit ocean surface down to the Mariana Trench.
 *
 * Progress & Depth:
 *   - 0.00 .. 0.25 (0 – 2,750m): Sunlit Epipelagic (god rays, bubbles, turquoise waters)
 *   - 0.25 .. 0.50 (2,750 – 5,500m): Twilight Mesopelagic (translucent bioluminescent jellyfish)
 *   - 0.50 .. 0.75 (5,500 – 8,250m): Midnight Bathypelagic (headlights cut darkness, anglerfish)
 *   - 0.75 .. 0.95 (8,250 – 10,450m): Hadal Abyss (hydrothermal vents, giant scales in shadow)
 *   - 0.95 .. 1.00 (10,450 – 11,000m): The Awakening (ancient bioluminescent eyes open)
 *
 * Finale (at 0:00):
 *   - The majestic Ancient Leviathan rises from the trench, illuminating the abyss
 *     in glowing emerald radiance and shimmering aquatic spores.
 */
import { Scene, blit } from '../scene.js';
import { audio }       from '../audio.js';

export const ABYSS_EMERGE_MS = 600;
export const ABYSS_FINALE_TOTAL_MS = 4800;

export function clampN(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export function oceanDepth(progress) {
  return Math.round(clampN(progress, 0, 1) * 11000);
}

export function depthZone(progress) {
  const p = clampN(progress, 0, 1);
  if (p < 0.25) return 'sunlit';
  if (p < 0.50) return 'twilight';
  if (p < 0.75) return 'midnight';
  if (p < 0.95) return 'hadal';
  return 'awakening';
}

export function ambientDarkness(progress) {
  const p = clampN(progress, 0, 1);
  return clampN(p * 0.92, 0, 0.92);
}

export function leviathanAscent(elapsedMs, maxTravel) {
  if (elapsedMs < ABYSS_EMERGE_MS) return 0;
  const t = clampN((elapsedMs - ABYSS_EMERGE_MS) / 1800, 0, 1);
  return maxTravel * Math.sin(t * Math.PI * 0.5);
}

export function finalePhase(elapsedMs) {
  if (elapsedMs < 0) return 'idle';
  if (elapsedMs < ABYSS_EMERGE_MS) return 'trench_rumble';
  if (elapsedMs < 2500) return 'leviathan_rise';
  if (elapsedMs < ABYSS_FINALE_TOTAL_MS) return 'bioluminescence_bloom';
  return 'done';
}

const C = {
  sunlit0: '#0a4b6e',
  sunlit1: '#04273d',
  twilight0: '#052136',
  twilight1: '#020d1a',
  midnight0: '#020d1a',
  midnight1: '#01050c',
  hadal: '#010408',
  cyan: '#00f5d4',
  gold: '#ffd166',
  emerald: '#00ffbb',
  purple: '#9d4edd',
  white: '#ffffff',
};

export class AbyssScene extends Scene {
  constructor(ctx, assets, opts) {
    super(ctx, assets, opts);
    this.time = 0;
    this.progress = 0;
    this.remainingMs = 0;

    this.cx = 120;
    this.cy = 90;
    this.subY = 90;

    this.bubbles = [];
    this.jellies = [];
    this.sonarRipples = [];
    this.spores = [];

    this.finaleActive = false;
    this.finaleElapsed = 0;
    this.sfxPlayedRoar = false;

    this._initOceanLife();
  }

  _initOceanLife() {
    this.bubbles = [];
    for (let i = 0; i < 25; i++) {
      this.bubbles.push({
        xRatio: Math.random(),
        y: Math.random() * 240,
        speed: 0.04 + Math.random() * 0.08,
        type: i % 3,
      });
    }

    this.jellies = [
      { xRatio: 0.25, y: 150, vy: -0.02, phase: 0, type: 'jelly0' },
      { xRatio: 0.75, y: 190, vy: -0.015, phase: 2, type: 'jelly1' },
      { xRatio: 0.45, y: 220, vy: -0.025, phase: 4, type: 'jelly2' },
    ];
  }

  layout(W, H) {
    super.layout(W, H);
    this.cx = Math.round(W * 0.5);
    this.cy = Math.round(H * 0.42);
    this.subY = this.cy;
  }

  init(durationMs) {
    this.time = 0;
    this.progress = 0;
    this.remainingMs = durationMs;
    this.sonarRipples = [];
    this.spores = [];
    this.finaleActive = false;
    this.finaleElapsed = 0;
    this.sfxPlayedRoar = false;
  }

  update(progress, dtMs, remainingMs) {
    this.time += dtMs;
    this.progress = clampN(progress, 0, 1);
    this.remainingMs = remainingMs;

    // Submersible gentle bobbing
    this.subY = this.cy + Math.sin(this.time * 0.002) * 4;

    // Rising bubbles
    for (const b of this.bubbles) {
      b.y -= b.speed * dtMs;
      if (b.y < -10) b.y = this.H + 10;
    }

    // Drifting jellyfish
    for (const j of this.jellies) {
      j.y += j.vy * dtMs;
      j.phase += 0.003 * dtMs;
      if (j.y < -30) j.y = this.H + 20;
    }

    // Sonar ripples
    for (let i = this.sonarRipples.length - 1; i >= 0; i--) {
      const r = this.sonarRipples[i];
      r.radius += 0.12 * dtMs;
      r.alpha -= 0.0007 * dtMs;
      if (r.alpha <= 0) this.sonarRipples.splice(i, 1);
    }

    // Finale logic
    if (this.finaleActive) {
      this.finaleElapsed += dtMs;
      if (this.finaleElapsed >= ABYSS_EMERGE_MS && !this.sfxPlayedRoar) {
        this.sfxPlayedRoar = true;
        audio.sfx('win');
      }

      // Bioluminescent floating spores
      if (this.finaleElapsed > ABYSS_EMERGE_MS && Math.random() < 0.45) {
        this.spores.push({
          x: this.cx + (Math.random() - 0.5) * 140,
          y: this.H - 20 - Math.random() * 80,
          vx: (Math.random() - 0.5) * 0.8,
          vy: -0.3 - Math.random() * 0.8,
          alpha: 1.0,
          color: (Math.random() < 0.6) ? C.emerald : C.cyan,
          size: 1 + Math.floor(Math.random() * 3),
        });
      }

      for (let i = this.spores.length - 1; i >= 0; i--) {
        const sp = this.spores[i];
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.alpha -= 0.01 * (dtMs / 16.6);
        if (sp.alpha <= 0) this.spores.splice(i, 1);
      }
    }
  }

  onMilestone(i, total) {
    audio.sfx('coin'); // sonar ping chime
    this.sonarRipples.push({
      x: this.cx,
      y: this.subY,
      radius: 12,
      alpha: 1.0,
    });
  }

  onComplete() {
    this.finaleActive = true;
    this.finaleElapsed = 0;
  }

  isFinaleDone() {
    return this.finaleActive && this.finaleElapsed >= ABYSS_FINALE_TOTAL_MS;
  }

  render() {
    const c = this.ctx;
    const W = this.W, H = this.H;
    const cx = this.cx;
    const p = this.progress;
    const depth = oceanDepth(p);
    const zone = depthZone(p);

    // 1. Ocean Water Gradient
    const waterGrad = c.createLinearGradient(0, 0, 0, H);
    if (zone === 'sunlit') {
      waterGrad.addColorStop(0, C.sunlit0);
      waterGrad.addColorStop(1, C.sunlit1);
    } else if (zone === 'twilight') {
      waterGrad.addColorStop(0, C.twilight0);
      waterGrad.addColorStop(1, C.twilight1);
    } else {
      waterGrad.addColorStop(0, C.midnight0);
      waterGrad.addColorStop(1, C.hadal);
    }
    c.fillStyle = waterGrad;
    c.fillRect(0, 0, W, H);

    // 2. God rays at shallow depth
    if (zone === 'sunlit') {
      c.save();
      c.fillStyle = 'rgba(0, 245, 212, 0.08)';
      for (const rx of [20, 70, 130, 180]) {
        c.beginPath();
        c.moveTo(rx, 0); c.lineTo(rx + 15, 0);
        c.lineTo(rx + 45, H); c.lineTo(rx - 10, H);
        c.fill();
      }
      c.restore();
    }

    // 3. Drifting Bioluminescent Jellyfish
    if (zone !== 'sunlit') {
      for (const j of this.jellies) {
        const jx = Math.round(j.xRatio * W + Math.sin(j.phase) * 6);
        const jy = Math.round(j.y);
        blit(c, this.assets, j.type, jx - 12, jy - 12, 1);
        // Soft outer glow
        c.fillStyle = 'rgba(0, 245, 212, 0.12)';
        c.beginPath();
        c.arc(jx, jy, 16, 0, Math.PI * 2);
        c.fill();
      }
    }

    // 4. Trench Sea Floor & Hydrothermal Spires (Late stages)
    if (p >= 0.7) {
      c.fillStyle = '#060a12';
      c.beginPath();
      c.moveTo(0, H - 25);
      c.lineTo(W * 0.35, H - 40);
      c.lineTo(W * 0.7, H - 15);
      c.lineTo(W, H - 35);
      c.lineTo(W, H);
      c.lineTo(0, H);
      c.fill();

      // Hydrothermal vent smoke
      c.fillStyle = 'rgba(0, 255, 187, 0.15)';
      c.beginPath();
      c.arc(W * 0.35, H - 45, 12, 0, Math.PI * 2);
      c.arc(W * 0.7, H - 20, 10, 0, Math.PI * 2);
      c.fill();
    }

    // 5. Giant Ancient Leviathan (Emerges from Trench)
    if (zone === 'hadal' || zone === 'awakening' || this.finaleActive) {
      let levY = H + 20;
      if (this.finaleActive) {
        levY = (H + 20) - leviathanAscent(this.finaleElapsed, 85);
      } else if (zone === 'awakening') {
        levY = H - 15;
      }

      // Leviathan silhouette & glowing eyes/crown
      blit(c, this.assets, 'leviathan_head', cx - 24, levY - 24, 1);

      // Deep sea glow surrounding the leviathan
      const levGrad = c.createRadialGradient(cx, levY, 10, cx, levY, 70);
      levGrad.addColorStop(0, 'rgba(0, 255, 187, 0.45)');
      levGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      c.fillStyle = levGrad;
      c.beginPath();
      c.arc(cx, levY, 70, 0, Math.PI * 2);
      c.fill();
    }

    // 6. Bathysphere Submersible
    const subX = cx;
    const subY = Math.round(this.subY);

    // Forward Dual Headlight Cones (cut through deep sea darkness)
    if (zone !== 'sunlit') {
      c.save();
      const beamGrad = c.createRadialGradient(subX, subY, 8, subX, subY + 70, 75);
      beamGrad.addColorStop(0, 'rgba(0, 245, 212, 0.45)');
      beamGrad.addColorStop(0.7, 'rgba(0, 245, 212, 0.12)');
      beamGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      c.fillStyle = beamGrad;
      c.beginPath();
      c.moveTo(subX - 8, subY + 10);
      c.lineTo(subX - 35, subY + 95);
      c.lineTo(subX + 35, subY + 95);
      c.lineTo(subX + 8, subY + 10);
      c.fill();
      c.restore();
    }

    // Submersible Body
    blit(c, this.assets, 'submersible', subX - 16, subY - 16, 1);

    // 7. Rising Bubbles
    for (const b of this.bubbles) {
      const bx = Math.round(b.xRatio * W);
      const by = Math.round(b.y);
      blit(c, this.assets, `bubble${b.type}`, bx - 8, by - 8, 1);
    }

    // 8. Sonar Ping Ripples
    for (const r of this.sonarRipples) {
      c.save();
      c.strokeStyle = C.cyan;
      c.globalAlpha = Math.max(0, r.alpha);
      c.lineWidth = 2;
      c.beginPath();
      c.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }

    // 9. Finale Bioluminescent Spores
    for (const sp of this.spores) {
      c.fillStyle = sp.color;
      c.globalAlpha = sp.alpha;
      c.fillRect(Math.round(sp.x), Math.round(sp.y), sp.size, sp.size);
    }
    c.globalAlpha = 1.0;

    // 10. Depth HUD Meter (Top-Right)
    this._renderDepthHUD(c, W, depth);
  }

  _renderDepthHUD(c, W, depth) {
    c.save();
    c.fillStyle = 'rgba(2, 13, 26, 0.75)';
    c.fillRect(W - 74, 8, 68, 26);
    c.strokeStyle = C.cyan;
    c.lineWidth = 1;
    c.strokeRect(W - 74, 8, 68, 26);

    // Depth text readout
    c.fillStyle = C.cyan;
    c.font = '9px monospace';
    c.fillText(`-${depth}m`, W - 68, 24);
    c.restore();
  }

  dispose() {
    this.sonarRipples = [];
    this.spores = [];
  }
}
