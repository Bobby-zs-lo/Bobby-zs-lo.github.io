/**
 * SupernovaScene – The Stellar Singularity Countdown.
 *
 * A celestial odyssey showcasing stellar evolution, gravitational collapse,
 * and the birth of a pulsar.
 *
 * Progress Evolution:
 *   - 0.00 .. 0.25: Azure Hypergiant (electric cyan/white corona & solar flares)
 *   - 0.25 .. 0.50: Golden Solar Phase (radiant solar wind & prominences)
 *   - 0.50 .. 0.75: Crimson Supergiant (swelling turbulent red giant)
 *   - 0.75 .. 0.95: Gravitational Singularity (black hole event horizon & Doppler accretion disk)
 *   - 0.95 .. 1.00: Critical Core Implosion (matter rushing violently inward)
 *
 * Milestones (20%, 40%, 60%, 80%):
 *   - Coronal Mass Ejection (CME) shockwaves rippling through the cosmos with celestial chimes.
 *
 * Finale (at 0:00):
 *   - 0 .. 500ms: Gravitational core collapse & gamma-ray flash (WCAG safe)
 *   - 500 .. 2400ms: Hypernova Blast with vertical relativistic plasma jets & chromatic shockwaves
 *   - 2400 .. 4800ms: Birth of a spinning Pulsar casting sweeping lighthouse beams across a glowing nebula
 *   - >= 4800ms: Finale resolves into the Done screen
 */
import { Scene, blit } from '../scene.js';
import { audio }       from '../audio.js';

// ── Timing Constants (ms) ───────────────────────────────────────────────────
export const FINALE_FLASH_MS = 500;
export const FINALE_BLAST_MS = 2400;
export const FINALE_TOTAL_MS = 4800;

// ── Pure Logic Functions (Exported for Unit Tests) ──────────────────────────
export function clampN(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Returns the stellar evolutionary stage based on progress (0..1) */
export function starEvolutionStage(progress) {
  const p = clampN(progress, 0, 1);
  if (p < 0.25) return 'hypergiant';
  if (p < 0.50) return 'solar';
  if (p < 0.75) return 'supergiant';
  if (p < 0.95) return 'singularity';
  return 'implosion';
}

/** Computes the effective visual radius of the stellar core */
export function coreRadius(progress, baseR) {
  const p = clampN(progress, 0, 1);
  if (p < 0.25) {
    return baseR;
  } else if (p < 0.50) {
    const t = (p - 0.25) / 0.25;
    return baseR * (1.0 + t * 0.2); // expands to 1.2x
  } else if (p < 0.75) {
    const t = (p - 0.50) / 0.25;
    return baseR * (1.2 + t * 0.35); // swells to 1.55x (red giant)
  } else if (p < 0.95) {
    const t = (p - 0.75) / 0.20;
    return baseR * (1.55 - t * 1.15); // collapses down to 0.4x (singularity)
  } else {
    const t = (p - 0.95) / 0.05;
    return baseR * (0.4 - t * 0.35); // critical implosion to 0.05x
  }
}

/** Angular accretion speed boost during late stages */
export function accretionVelocity(progress) {
  const p = clampN(progress, 0, 1);
  if (p < 0.75) return 1.0;
  const t = (p - 0.75) / 0.25;
  return 1.0 + t * t * 4.5; // accelerates up to 5.5x
}

/** Returns the current finale phase name from elapsed time in ms */
export function finalePhase(elapsedMs) {
  if (elapsedMs < 0) return 'idle';
  if (elapsedMs < FINALE_FLASH_MS) return 'implosion_flash';
  if (elapsedMs < FINALE_BLAST_MS) return 'blast_expansion';
  if (elapsedMs < FINALE_TOTAL_MS) return 'pulsar_birth';
  return 'done';
}

/** Computes expanding shockwave radius */
export function shockwaveRadius(elapsedMs, maxR) {
  if (elapsedMs < FINALE_FLASH_MS) return 0;
  const t = clampN((elapsedMs - FINALE_FLASH_MS) / (FINALE_BLAST_MS - FINALE_FLASH_MS), 0, 1);
  return maxR * Math.pow(t, 0.7);
}

/** Computes relativistic jet vertical length */
export function jetLength(elapsedMs, maxH) {
  if (elapsedMs < FINALE_FLASH_MS) return 0;
  const launchT = clampN((elapsedMs - FINALE_FLASH_MS) / 350, 0, 1);
  const fadeT = clampN((elapsedMs - 1200) / (FINALE_TOTAL_MS - 1200), 0, 1);
  return maxH * launchT * (1 - fadeT * 0.7);
}

// ── Palette ─────────────────────────────────────────────────────────────────
const PALETTE = {
  void0: '#04010d',
  void1: '#0e031f',
  void2: '#020b17',
  cyan: '#00f5d4',
  gold: '#ffd166',
  crimson: '#ff2a5f',
  purple: '#9d4edd',
  white: '#ffffff',
  ringTrack: 'rgba(110, 70, 160, 0.25)',
  ringTrackActive: 'rgba(0, 245, 212, 0.65)',
};

// ── Main Scene Class ────────────────────────────────────────────────────────
export class SupernovaScene extends Scene {
  constructor(ctx, assets, opts) {
    super(ctx, assets, opts);
    this.time = 0;
    this.progress = 0;
    this.remainingMs = 0;

    // Geometry layout caches
    this.cx = 120;
    this.cy = 110;
    this.ringR = 80;
    this.starBaseR = 30;

    // Milestone ripples
    this.ripples = [];

    // Finale state
    this.finaleActive = false;
    this.finaleElapsed = 0;
    this.sfxPlayedBlast = false;
    this.sfxPlayedPulsar = false;

    // Stars & Particles
    this.stars = [];
    this.accretionParticles = [];
    this.asteroids = [];
    this.finaleDebris = [];

    this._initCelestialObjects();
  }

  _initCelestialObjects() {
    // 1. Static background stars
    this.stars = [];
    for (let i = 0; i < 90; i++) {
      this.stars.push({
        xRatio: (Math.sin(i * 123.456) * 0.5 + 0.5),
        yRatio: (Math.cos(i * 789.012) * 0.5 + 0.5),
        size: (i % 5 === 0) ? 2 : 1,
        colorType: i % 4, // 0: blue, 1: gold, 2: magenta, 3: white
        twinkleSpeed: 0.002 + (i % 7) * 0.001,
        twinkleOffset: i * 0.7,
      });
    }

    // 2. Swirling accretion / solar wind particles
    this.accretionParticles = [];
    for (let i = 0; i < 50; i++) {
      this.accretionParticles.push({
        angle: (i / 50) * Math.PI * 2,
        distRatio: 0.4 + (i % 10) * 0.08,
        speed: 0.001 + (i % 5) * 0.0004,
        size: 1 + (i % 3),
        zTilt: 0.45, // elliptical compression
      });
    }

    // 3. Orbiting space asteroids & comets
    this.asteroids = [
      { dist: 0.65, angle: 0.2, speed: 0.0007, type: 'rock0', zTilt: 0.38, size: 10 },
      { dist: 0.75, angle: 2.1, speed: 0.0005, type: 'rock1', zTilt: 0.38, size: 8 },
      { dist: 0.88, angle: 4.3, speed: 0.0004, type: 'rock2', zTilt: 0.38, size: 12 },
      { dist: 1.05, angle: 1.1, speed: 0.0008, type: 'comet0', zTilt: 0.38, size: 12 },
      { dist: 1.18, angle: 3.4, speed: 0.0006, type: 'comet1', zTilt: 0.38, size: 12 },
    ];
  }

  layout(W, H) {
    super.layout(W, H);
    this.cx = Math.round(W * 0.5);
    // Positioned slightly above center so bottom controls don't overlap
    this.cy = Math.round(H * 0.45);
    this.ringR = Math.max(50, Math.round(Math.min(W, H) * 0.36));
    this.starBaseR = Math.max(16, Math.round(Math.min(W, H) * 0.13));
  }

  init(durationMs) {
    this.time = 0;
    this.progress = 0;
    this.remainingMs = durationMs;
    this.ripples = [];
    this.finaleActive = false;
    this.finaleElapsed = 0;
    this.sfxPlayedBlast = false;
    this.sfxPlayedPulsar = false;
    this.finaleDebris = [];
  }

  update(progress, dtMs, remainingMs) {
    this.time += dtMs;
    this.progress = clampN(progress, 0, 1);
    this.remainingMs = remainingMs;

    const stage = starEvolutionStage(this.progress);
    const speedBoost = accretionVelocity(this.progress);

    // Update accretion particles
    for (const p of this.accretionParticles) {
      p.angle += p.speed * dtMs * speedBoost;
      if (stage === 'singularity' || stage === 'implosion') {
        // Spiral inward toward the black hole
        p.distRatio -= 0.00008 * dtMs * speedBoost;
        if (p.distRatio < 0.2) p.distRatio = 0.95;
      }
    }

    // Update orbiting asteroids
    for (const a of this.asteroids) {
      a.angle += a.speed * dtMs;
    }

    // Update milestone ripples
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.radius += r.speed * dtMs;
      r.alpha -= 0.0008 * dtMs;
      if (r.alpha <= 0 || r.radius > Math.max(this.W, this.H) * 1.2) {
        this.ripples.splice(i, 1);
      }
    }

    // Finale logic
    if (this.finaleActive) {
      this.finaleElapsed += dtMs;

      // Audio cues during finale
      if (this.finaleElapsed >= FINALE_FLASH_MS && !this.sfxPlayedBlast) {
        this.sfxPlayedBlast = true;
        audio.sfx('hit');
      }
      if (this.finaleElapsed >= FINALE_BLAST_MS && !this.sfxPlayedPulsar) {
        this.sfxPlayedPulsar = true;
        audio.sfx('win');
      }

      // Update explosive debris particles
      for (const d of this.finaleDebris) {
        d.x += d.vx * (dtMs / 16.6);
        d.y += d.vy * (dtMs / 16.6);
        d.vx *= 0.985;
        d.vy *= 0.985;
        d.alpha = Math.max(0, d.alpha - d.decay * (dtMs / 16.6));
      }
    }
  }

  onMilestone(i, total) {
    // Coronal Mass Ejection wave
    const col = (i % 2 === 0) ? PALETTE.cyan : PALETTE.gold;
    this.ripples.push({
      radius: this.starBaseR,
      speed: 0.18,
      alpha: 1.0,
      color: col,
      width: 3,
    });
    audio.sfx('magic');
  }

  onComplete() {
    this.finaleActive = true;
    this.finaleElapsed = 0;

    // Spawn 80 hypernova explosion particles
    this.finaleDebris = [];
    const colors = [PALETTE.cyan, PALETTE.gold, PALETTE.crimson, PALETTE.purple, PALETTE.white];
    for (let i = 0; i < 85; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 5.5;
      this.finaleDebris.push({
        x: this.cx,
        y: this.cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 1.0,
        decay: 0.004 + Math.random() * 0.005,
        color: colors[i % colors.length],
        size: 1 + Math.floor(Math.random() * 3),
      });
    }
  }

  isFinaleDone() {
    return this.finaleActive && this.finaleElapsed >= FINALE_TOTAL_MS;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  render() {
    const c = this.ctx;
    const W = this.W;
    const H = this.H;
    const cx = this.cx;
    const cy = this.cy;
    const stage = starEvolutionStage(this.progress);
    const rCurrent = coreRadius(this.progress, this.starBaseR);

    // 1. Deep Space Cosmic Background
    c.fillStyle = PALETTE.void0;
    c.fillRect(0, 0, W, H);

    // Ambient space nebula gradient
    const nebGrad = c.createRadialGradient(cx, cy, 10, cx, cy, Math.max(W, H) * 0.7);
    if (stage === 'hypergiant') {
      nebGrad.addColorStop(0, 'rgba(0, 80, 160, 0.28)');
      nebGrad.addColorStop(0.5, 'rgba(30, 5, 60, 0.2)');
    } else if (stage === 'solar') {
      nebGrad.addColorStop(0, 'rgba(160, 90, 0, 0.25)');
      nebGrad.addColorStop(0.5, 'rgba(50, 10, 40, 0.2)');
    } else if (stage === 'supergiant') {
      nebGrad.addColorStop(0, 'rgba(180, 10, 40, 0.32)');
      nebGrad.addColorStop(0.5, 'rgba(70, 0, 40, 0.25)');
    } else {
      nebGrad.addColorStop(0, 'rgba(80, 0, 120, 0.35)');
      nebGrad.addColorStop(0.5, 'rgba(0, 100, 120, 0.22)');
    }
    nebGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    c.fillStyle = nebGrad;
    c.fillRect(0, 0, W, H);

    // 2. Parallax Twinkling Starfield
    this._renderStars(c, W, H, cx, cy, stage);

    // 3. Astrolabe Chrono-Ring (Progress Dial)
    this._renderChronoRing(c, cx, cy);

    // 4. Background Asteroids / Comets (Behind Star)
    this._renderAsteroids(c, cx, cy, true);

    // 5. Accretion Disk / Solar Wind Streams
    this._renderAccretion(c, cx, cy, stage);

    // 6. Stellar Core / Singularity
    if (!this.finaleActive || this.finaleElapsed < FINALE_FLASH_MS) {
      this._renderStellarCore(c, cx, cy, rCurrent, stage);
    }

    // 7. Foreground Asteroids / Comets (In Front of Star)
    this._renderAsteroids(c, cx, cy, false);

    // 8. Coronal Mass Ejection Waves (Milestones)
    this._renderMilestoneRipples(c, cx, cy);

    // 9. Finale Explosions & Relativistic Jets
    if (this.finaleActive) {
      this._renderFinale(c, W, H, cx, cy);
    }
  }

  // ── Render Subroutines ────────────────────────────────────────────────────
  _renderStars(c, W, H, cx, cy, stage) {
    const isWarped = (stage === 'singularity' || stage === 'implosion');
    const warpPower = (this.progress - 0.75) * 40;

    for (const star of this.stars) {
      let sx = star.xRatio * W;
      let sy = star.yRatio * H;

      // Gravitational lensing warp toward center during singularity
      if (isWarped) {
        const dx = sx - cx;
        const dy = sy - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 25 && d < 180) {
          const factor = warpPower / (d * 0.8);
          sx -= (dx / d) * factor;
          sy -= (dy / d) * factor;
        }
      }

      const twinkle = 0.5 + 0.5 * Math.sin(this.time * star.twinkleSpeed + star.twinkleOffset);
      let col = PALETTE.white;
      if (star.colorType === 0) col = PALETTE.cyan;
      else if (star.colorType === 1) col = PALETTE.gold;
      else if (star.colorType === 2) col = PALETTE.purple;

      c.fillStyle = col;
      c.globalAlpha = 0.35 + 0.65 * twinkle;
      c.fillRect(Math.round(sx), Math.round(sy), star.size, star.size);
    }
    c.globalAlpha = 1.0;
  }

  _renderChronoRing(c, cx, cy) {
    const r = this.ringR;
    const p = this.progress;

    // Track circle (background)
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.strokeStyle = PALETTE.ringTrack;
    c.lineWidth = 2;
    c.stroke();

    // Minor tick marks around track
    for (let deg = 0; deg < 360; deg += 30) {
      const rad = (deg - 90) * (Math.PI / 180);
      const inner = r - 4;
      const outer = r + 4;
      c.beginPath();
      c.moveTo(cx + Math.cos(rad) * inner, cy + Math.sin(rad) * inner);
      c.lineTo(cx + Math.cos(rad) * outer, cy + Math.sin(rad) * outer);
      c.strokeStyle = (deg % 90 === 0) ? PALETTE.cyan : PALETTE.ringTrack;
      c.lineWidth = 1;
      c.stroke();
    }

    // Active progress arc (starts at 12 o'clock, clockwise)
    if (p > 0) {
      const startAngle = -Math.PI / 2;
      const endAngle = startAngle + p * Math.PI * 2;

      c.save();
      c.beginPath();
      c.arc(cx, cy, r, startAngle, endAngle);
      // Stage-responsive arc color
      const stage = starEvolutionStage(p);
      let arcCol = PALETTE.cyan;
      if (stage === 'solar') arcCol = PALETTE.gold;
      else if (stage === 'supergiant') arcCol = PALETTE.crimson;
      else if (stage === 'singularity' || stage === 'implosion') arcCol = PALETTE.purple;

      c.strokeStyle = arcCol;
      c.lineWidth = 3;
      c.stroke();

      // Orbital head cursor
      const cursorX = cx + Math.cos(endAngle) * r;
      const cursorY = cy + Math.sin(endAngle) * r;

      // Cursor glow
      c.beginPath();
      c.arc(cursorX, cursorY, 4, 0, Math.PI * 2);
      c.fillStyle = PALETTE.white;
      c.fill();

      // Cursor sparkle cross
      c.strokeStyle = arcCol;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(cursorX - 6, cursorY); c.lineTo(cursorX + 6, cursorY);
      c.moveTo(cursorX, cursorY - 6); c.lineTo(cursorX, cursorY + 6);
      c.stroke();
      c.restore();
    }
  }

  _renderAsteroids(c, cx, cy, renderBehind) {
    for (const a of this.asteroids) {
      const isBehind = Math.sin(a.angle) < 0;
      if (isBehind !== renderBehind) continue;

      const orbitR = this.ringR * a.dist;
      const ax = cx + Math.cos(a.angle) * orbitR;
      const ay = cy + Math.sin(a.angle) * orbitR * a.zTilt;

      // Draw sprite
      const scale = isBehind ? 0.8 : 1.1;
      const drawX = Math.round(ax - (a.size * scale) / 2);
      const drawY = Math.round(ay - (a.size * scale) / 2);

      c.save();
      if (isBehind) c.globalAlpha = 0.65;
      blit(c, this.assets, a.type, drawX, drawY, scale);

      // Comet tail
      if (a.type.startsWith('comet')) {
        const tailX = ax - Math.cos(a.angle - 0.3) * (14 * scale);
        const tailY = ay - Math.sin(a.angle - 0.3) * (14 * scale * a.zTilt);
        c.beginPath();
        c.moveTo(ax, ay);
        c.lineTo(tailX, tailY);
        c.strokeStyle = 'rgba(0, 245, 212, 0.45)';
        c.lineWidth = 2 * scale;
        c.stroke();
      }
      c.restore();
    }
  }

  _renderAccretion(c, cx, cy, stage) {
    const isSingularity = (stage === 'singularity' || stage === 'implosion');

    for (const p of this.accretionParticles) {
      const dist = this.starBaseR * (isSingularity ? (0.6 + p.distRatio * 1.6) : (1.1 + p.distRatio * 1.4));
      const px = cx + Math.cos(p.angle) * dist;
      const py = cy + Math.sin(p.angle) * dist * p.zTilt;

      // Relativistic Doppler beaming: approaching side (cos < 0) is blue, receding is orange
      let col = PALETTE.cyan;
      if (isSingularity) {
        col = (Math.cos(p.angle) < 0) ? PALETTE.cyan : PALETTE.crimson;
      } else if (stage === 'solar') {
        col = (p.size === 1) ? PALETTE.gold : PALETTE.white;
      } else if (stage === 'supergiant') {
        col = (p.size === 1) ? PALETTE.crimson : PALETTE.gold;
      }

      c.fillStyle = col;
      c.fillRect(Math.round(px), Math.round(py), p.size, p.size);
    }
  }

  _renderStellarCore(c, cx, cy, r, stage) {
    c.save();

    if (stage === 'singularity' || stage === 'implosion') {
      // ── Gravitational Singularity (Black Hole) ──
      // Lensing Ring Glow
      const lenseR = r * 1.5;
      const lenseGrad = c.createRadialGradient(cx, cy, r, cx, cy, lenseR * 1.4);
      lenseGrad.addColorStop(0, 'rgba(0, 245, 212, 0.85)');
      lenseGrad.addColorStop(0.4, 'rgba(157, 78, 221, 0.45)');
      lenseGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      c.fillStyle = lenseGrad;
      c.beginPath();
      c.arc(cx, cy, lenseR * 1.4, 0, Math.PI * 2);
      c.fill();

      // Pitch-Black Event Horizon
      c.beginPath();
      c.arc(cx, cy, Math.max(3, r), 0, Math.PI * 2);
      c.fillStyle = '#000000';
      c.fill();
      c.strokeStyle = PALETTE.cyan;
      c.lineWidth = 1.5;
      c.stroke();

      // Implosion jitter
      if (stage === 'implosion') {
        const jitter = (Math.random() - 0.5) * 3;
        c.beginPath();
        c.arc(cx + jitter, cy + jitter, Math.max(2, r * 0.6), 0, Math.PI * 2);
        c.strokeStyle = PALETTE.white;
        c.lineWidth = 1;
        c.stroke();
      }
    } else {
      // ── Radiant Star Body ──
      // Dynamic breathing/pulsation
      const pulse = 1.0 + 0.05 * Math.sin(this.time * (stage === 'supergiant' ? 0.005 : 0.002));
      const currentR = r * pulse;

      // Outer Corona Gradient Glow
      const glowGrad = c.createRadialGradient(cx, cy, currentR * 0.3, cx, cy, currentR * 2.2);
      if (stage === 'hypergiant') {
        glowGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        glowGrad.addColorStop(0.3, 'rgba(0, 245, 212, 0.7)');
        glowGrad.addColorStop(0.7, 'rgba(112, 0, 255, 0.25)');
        glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else if (stage === 'solar') {
        glowGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        glowGrad.addColorStop(0.3, 'rgba(255, 209, 102, 0.75)');
        glowGrad.addColorStop(0.7, 'rgba(255, 100, 0, 0.25)');
        glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else { // supergiant
        glowGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        glowGrad.addColorStop(0.3, 'rgba(255, 42, 95, 0.8)');
        glowGrad.addColorStop(0.7, 'rgba(180, 0, 60, 0.3)');
        glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      }

      c.fillStyle = glowGrad;
      c.beginPath();
      c.arc(cx, cy, currentR * 2.2, 0, Math.PI * 2);
      c.fill();

      // Solid Core
      c.beginPath();
      c.arc(cx, cy, currentR, 0, Math.PI * 2);
      c.fillStyle = (stage === 'hypergiant') ? PALETTE.cyan
                  : (stage === 'solar') ? PALETTE.gold
                  : PALETTE.crimson;
      c.fill();

      // Inner White Center
      c.beginPath();
      c.arc(cx, cy, currentR * 0.5, 0, Math.PI * 2);
      c.fillStyle = PALETTE.white;
      c.fill();

      // Cross Flares (diffraction spikes)
      const spikeLen = currentR * 1.8;
      c.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(cx - spikeLen, cy); c.lineTo(cx + spikeLen, cy);
      c.moveTo(cx, cy - spikeLen); c.lineTo(cx, cy + spikeLen);
      c.stroke();
    }
    c.restore();
  }

  _renderMilestoneRipples(c, cx, cy) {
    for (const r of this.ripples) {
      c.save();
      c.beginPath();
      c.arc(cx, cy, r.radius, 0, Math.PI * 2);
      c.strokeStyle = r.color;
      c.globalAlpha = Math.max(0, r.alpha);
      c.lineWidth = r.width;
      c.stroke();
      c.restore();
    }
  }

  _renderFinale(c, W, H, cx, cy) {
    const elapsed = this.finaleElapsed;
    const phase = finalePhase(elapsed);

    // ── Phase 1: Core Implosion & Gamma Flash ──
    if (phase === 'implosion_flash') {
      const flashT = elapsed / FINALE_FLASH_MS;
      // Soft flash (WCAG safe, capped alpha)
      const flashAlpha = (1 - flashT) * 0.45;
      c.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
      c.fillRect(0, 0, W, H);
      return;
    }

    // ── Phase 2: Relativistic Jets & Blast Shockwaves ──
    if (phase === 'blast_expansion' || phase === 'pulsar_birth' || phase === 'done') {
      const blastMs = elapsed - FINALE_FLASH_MS;

      // 1. Relativistic Bipolar Jets (vertical beam of plasma)
      const maxJetH = H * 0.45;
      const currentJetH = jetLength(elapsed, maxJetH);

      if (currentJetH > 0) {
        c.save();
        // North & South jet columns
        const jetGrad = c.createLinearGradient(cx, cy - currentJetH, cx, cy + currentJetH);
        jetGrad.addColorStop(0, 'rgba(0, 245, 212, 0)');
        jetGrad.addColorStop(0.3, 'rgba(0, 245, 212, 0.7)');
        jetGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.9)');
        jetGrad.addColorStop(0.7, 'rgba(0, 245, 212, 0.7)');
        jetGrad.addColorStop(1, 'rgba(0, 245, 212, 0)');

        c.fillStyle = jetGrad;
        c.fillRect(cx - 3, cy - currentJetH, 6, currentJetH * 2);

        // Helical particle sparks along jet
        for (let j = 0; j < 12; j++) {
          const tHelix = (this.time * 0.003 + j * 0.3) % 1;
          const yOff = (tHelix * 2 - 1) * currentJetH;
          const xOff = Math.sin(tHelix * Math.PI * 6) * 6;
          c.fillStyle = PALETTE.white;
          c.fillRect(Math.round(cx + xOff), Math.round(cy + yOff), 2, 2);
        }
        c.restore();
      }

      // 2. Spherical Expanding Shockwaves
      const maxShockR = Math.max(W, H) * 0.85;
      const shockR = shockwaveRadius(elapsed, maxShockR);
      const shockAlpha = Math.max(0, 1 - shockR / maxShockR);

      if (shockR > 0 && shockAlpha > 0) {
        c.save();
        // Cyan Shockwave
        c.beginPath();
        c.arc(cx, cy, shockR, 0, Math.PI * 2);
        c.strokeStyle = PALETTE.cyan;
        c.globalAlpha = shockAlpha * 0.85;
        c.lineWidth = 3;
        c.stroke();

        // Magenta Secondary Shockwave
        if (shockR > 20) {
          c.beginPath();
          c.arc(cx, cy, shockR * 0.82, 0, Math.PI * 2);
          c.strokeStyle = PALETTE.crimson;
          c.globalAlpha = shockAlpha * 0.65;
          c.lineWidth = 2;
          c.stroke();
        }
        c.restore();
      }

      // 3. Explosive Debris Cloud
      for (const d of this.finaleDebris) {
        if (d.alpha <= 0) continue;
        c.save();
        c.globalAlpha = d.alpha;
        c.fillStyle = d.color;
        c.fillRect(Math.round(d.x), Math.round(d.y), d.size, d.size);
        c.restore();
      }

      // ── Phase 3: Birth of the Spinning Pulsar ──
      if (phase === 'pulsar_birth' || phase === 'done') {
        const pulsarElapsed = elapsed - FINALE_BLAST_MS;
        const pulsarAlpha = Math.min(1, pulsarElapsed / 500);

        c.save();
        c.globalAlpha = pulsarAlpha;

        // Rotating Lighthouse Beams
        const sweepAngle = (this.time * 0.004) % (Math.PI * 2);
        const beamLength = Math.max(W, H) * 0.6;
        const beamSpread = 0.22; // radians

        for (let dir = 0; dir < 2; dir++) {
          const baseAngle = sweepAngle + dir * Math.PI;
          c.beginPath();
          c.moveTo(cx, cy);
          c.arc(cx, cy, beamLength, baseAngle - beamSpread, baseAngle + beamSpread);
          c.closePath();

          const beamGrad = c.createRadialGradient(cx, cy, 5, cx, cy, beamLength);
          beamGrad.addColorStop(0, 'rgba(0, 245, 212, 0.55)');
          beamGrad.addColorStop(0.6, 'rgba(112, 0, 255, 0.15)');
          beamGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          c.fillStyle = beamGrad;
          c.fill();
        }

        // Central Pulsar Star Sprite
        blit(c, this.assets, 'pulsar', cx - 16, cy - 16, 1);

        // Core White Glint
        c.beginPath();
        c.arc(cx, cy, 3, 0, Math.PI * 2);
        c.fillStyle = PALETTE.white;
        c.fill();
        c.restore();
      }
    }
  }

  dispose() {
    this.ripples = [];
    this.finaleDebris = [];
  }
}
