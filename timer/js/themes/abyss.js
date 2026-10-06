/**
 * AbyssScene – Deep Sea Descent & Mythical Leviathan Countdown.
 *
 * An atmospheric descent from the sunlit surface to the bottom of the Mariana Trench,
 * encountering mythical sea creatures and sunken ruins before the colossal Ancient Leviathan
 * surges up and chomps the diving bell whole!
 *
 * Progress & Depth:
 *   - 0.00 .. 0.25 (0 – 2,750m): Sunlit Surface (god rays, turquoise water, sea turtles gliding)
 *   - 0.25 .. 0.50 (2,750 – 5,500m): Twilight Zone (deep blue, mythical Giant Kraken Squid glides past)
 *   - 0.50 .. 0.75 (5,500 – 8,250m): Sunken Atlantis (midnight black, searchlights reveal ancient Atlantean columns)
 *   - 0.75 .. 0.95 (8,250 – 10,450m): Hadal Trench (hydrothermal vents, ominous glowing eyes stalking from abyss)
 *   - 0.95 .. 1.00 (10,450 – 11,000m): Leviathan Stalk (colossal shadow ascends directly beneath the diving bell)
 *
 * Finale (at 0:00):
 *   - 0 .. 600ms: The Ancient Leviathan jaws open wide around the diving bell.
 *   - 600 .. 1800ms: CHOMP! The colossal fangs snap shut, eating the diving bell! (Crunch hit SFX & screen shake).
 *   - 1800 .. 3500ms: Inside the glowing belly as it digests in the abyss.
 *   - 3500 .. 4800ms: Leviathan slumbers back into the eternal trench.
 */
import { Scene, blit } from '../scene.js';
import { audio }       from '../audio.js';

export const ABYSS_CHOMP_MS = 600;
export const ABYSS_FINALE_TOTAL_MS = 4800;

export function clampN(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export function oceanDepth(progress) {
  return Math.round(clampN(progress, 0, 1) * 11000);
}

export function depthZone(progress) {
  const p = clampN(progress, 0, 1);
  if (p < 0.25) return 'surface_shallows';
  if (p < 0.50) return 'twilight_kraken';
  if (p < 0.75) return 'atlantis_ruins';
  if (p < 0.95) return 'abyssal_trench';
  return 'leviathan_stalk';
}

export function ambientDarkness(progress) {
  const p = clampN(progress, 0, 1);
  return clampN(p * 0.92, 0, 0.92);
}

export function leviathanAscent(elapsedMs, maxTravel) {
  if (elapsedMs < 0) return 0;
  const t = clampN(elapsedMs / 700, 0, 1);
  return maxTravel * Math.sin(t * Math.PI * 0.5);
}

export function submersibleEaten(elapsedMs) {
  return elapsedMs >= ABYSS_CHOMP_MS;
}

export function finalePhase(elapsedMs) {
  if (elapsedMs < 0) return 'idle';
  if (elapsedMs < ABYSS_CHOMP_MS) return 'jaws_open';
  if (elapsedMs < 1800) return 'leviathan_chomp';
  if (elapsedMs < 3500) return 'into_the_belly';
  if (elapsedMs < ABYSS_FINALE_TOTAL_MS) return 'abyss_reclaims';
  return 'done';
}

const C = {
  sunlit0: '#0a5275',
  sunlit1: '#04273d',
  twilight0: '#06263d',
  twilight1: '#021021',
  midnight0: '#021021',
  midnight1: '#01050c',
  hadal: '#010307',
  cyan: '#00f5d4',
  gold: '#ffd166',
  emerald: '#00ffbb',
  crimson: '#ff2a5f',
  white: '#ffffff',
};

export class AbyssScene extends Scene {
  constructor(ctx, assets, opts) {
    super(ctx, assets, opts);
    this.time = 0;
    this.progress = 0;
    this.remainingMs = 0;

    this.cx = 120;
    this.cy = 95;
    this.subY = 95;

    this.bubbles = [];
    this.sonarRipples = [];
    this.bloodParticles = [];
    this.turtleX = -40;
    this.krakenX = 260;

    this.finaleActive = false;
    this.finaleElapsed = 0;
    this.sfxPlayedChomp = false;

    this._initBubbles();
  }

  _initBubbles() {
    this.bubbles = [];
    for (let i = 0; i < 28; i++) {
      this.bubbles.push({
        xRatio: Math.random(),
        y: Math.random() * 240,
        speed: 0.035 + Math.random() * 0.08,
        type: i % 3,
      });
    }
  }

  layout(W, H) {
    super.layout(W, H);
    this.cx = Math.round(W * 0.5);
    this.cy = Math.round(H * 0.44);
    this.subY = this.cy;
  }

  init(durationMs) {
    this.time = 0;
    this.progress = 0;
    this.remainingMs = durationMs;
    this.sonarRipples = [];
    this.bloodParticles = [];
    this.turtleX = -40;
    this.krakenX = 260;
    this.finaleActive = false;
    this.finaleElapsed = 0;
    this.sfxPlayedChomp = false;
  }

  update(progress, dtMs, remainingMs) {
    this.time += dtMs;
    this.progress = clampN(progress, 0, 1);
    this.remainingMs = remainingMs;

    const zone = depthZone(this.progress);

    // Submersible gentle aquatic floating bob
    this.subY = this.cy + Math.sin(this.time * 0.0025) * 3.5;

    // Rising air bubbles
    for (const b of this.bubbles) {
      b.y -= b.speed * dtMs;
      if (b.y < -12) b.y = this.H + 12;
    }

    // Creature movements:
    // Turtle swims across in stage 1
    if (zone === 'surface_shallows') {
      this.turtleX += 0.04 * dtMs;
      if (this.turtleX > this.W + 40) this.turtleX = -40;
    }

    // Kraken glides across in stage 2
    if (zone === 'twilight_kraken') {
      this.krakenX -= 0.035 * dtMs;
      if (this.krakenX < -50) this.krakenX = this.W + 50;
    }

    // Sonar ripples
    for (let i = this.sonarRipples.length - 1; i >= 0; i--) {
      const r = this.sonarRipples[i];
      r.radius += 0.13 * dtMs;
      r.alpha -= 0.0008 * dtMs;
      if (r.alpha <= 0) this.sonarRipples.splice(i, 1);
    }

    // Finale logic
    if (this.finaleActive) {
      this.finaleElapsed += dtMs;
      if (this.finaleElapsed >= ABYSS_CHOMP_MS && !this.sfxPlayedChomp) {
        this.sfxPlayedChomp = true;
        audio.sfx('hit'); // crunch sound!

        // Burst of violent crunch bubbles & debris
        for (let i = 0; i < 30; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 1 + Math.random() * 4;
          this.bloodParticles.push({
            x: this.cx,
            y: this.subY,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            alpha: 1.0,
            size: 2 + Math.floor(Math.random() * 4),
            color: Math.random() < 0.6 ? C.emerald : C.cyan,
          });
        }
      }

      for (let i = this.bloodParticles.length - 1; i >= 0; i--) {
        const bp = this.bloodParticles[i];
        bp.x += bp.vx * (dtMs / 16.6);
        bp.y += bp.vy * (dtMs / 16.6);
        bp.alpha -= 0.012 * (dtMs / 16.6);
        if (bp.alpha <= 0) this.bloodParticles.splice(i, 1);
      }
    }
  }

  onMilestone(i, total) {
    audio.sfx('coin'); // sonar ping chime
    this.sonarRipples.push({
      x: this.cx,
      y: this.subY,
      radius: 10,
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
    if (zone === 'surface_shallows') {
      waterGrad.addColorStop(0, C.sunlit0);
      waterGrad.addColorStop(1, C.sunlit1);
    } else if (zone === 'twilight_kraken') {
      waterGrad.addColorStop(0, C.twilight0);
      waterGrad.addColorStop(1, C.twilight1);
    } else {
      waterGrad.addColorStop(0, C.midnight0);
      waterGrad.addColorStop(1, C.hadal);
    }
    c.fillStyle = waterGrad;
    c.fillRect(0, 0, W, H);

    // 2. Sunlit God Rays in Surface Shallows
    if (zone === 'surface_shallows') {
      c.save();
      c.fillStyle = 'rgba(0, 245, 212, 0.09)';
      for (const rx of [18, 65, 125, 175, 210]) {
        c.beginPath();
        c.moveTo(rx, 0); c.lineTo(rx + 16, 0);
        c.lineTo(rx + 42, H); c.lineTo(rx - 8, H);
        c.fill();
      }
      c.restore();

      // Sea Turtle Swimming By
      const turtleY = 70 + Math.sin(this.time * 0.003) * 6;
      blit(c, this.assets, 'sea_turtle', Math.round(this.turtleX), Math.round(turtleY), 1);
    }

    // 3. Twilight Zone: Giant Kraken Squid
    if (zone === 'twilight_kraken') {
      const krakenY = 85 + Math.sin(this.time * 0.002) * 8;
      blit(c, this.assets, 'kraken_squid', Math.round(this.krakenX), Math.round(krakenY), 1);

      // Kraken ambient bioluminescent aura
      c.fillStyle = 'rgba(255, 120, 0, 0.12)';
      c.beginPath();
      c.arc(this.krakenX + 16, krakenY + 18, 28, 0, Math.PI * 2);
      c.fill();
    }

    // 4. Midnight Ocean: Sunken Atlantean Ruins
    if (zone === 'atlantis_ruins' || zone === 'abyssal_trench' || zone === 'leviathan_stalk') {
      // Seafloor bedrock
      c.fillStyle = '#05070d';
      c.beginPath();
      c.moveTo(0, H - 28);
      c.lineTo(W * 0.3, H - 42);
      c.lineTo(W * 0.65, H - 20);
      c.lineTo(W, H - 36);
      c.lineTo(W, H);
      c.lineTo(0, H);
      c.fill();

      // Atlantean Ancient Temple Columns
      blit(c, this.assets, 'atlantis_column', 28, H - 56, 1);
      blit(c, this.assets, 'atlantis_column', W - 48, H - 62, 1);

      // Glowing runes on ruins
      c.fillStyle = 'rgba(0, 245, 212, 0.25)';
      c.fillRect(36, H - 42, 6, 2);
      c.fillRect(W - 40, H - 48, 6, 2);
    }

    // 5. Stalking Giant Eyes in Hadal Abyss
    if (zone === 'abyssal_trench' || zone === 'leviathan_stalk') {
      const eyeBlink = Math.sin(this.time * 0.004);
      if (eyeBlink > -0.6) {
        c.fillStyle = '#ffd166';
        c.fillRect(cx - 36, H - 32, 5, 3);
        c.fillRect(cx + 31, H - 32, 5, 3);
        // Slit pupils
        c.fillStyle = '#000000';
        c.fillRect(cx - 34, H - 32, 2, 3);
        c.fillRect(cx + 33, H - 32, 2, 3);
      }
    }

    // 6. Submersible & Searchlights
    const subX = cx;
    const subY = Math.round(this.subY);
    const subSwallowed = this.finaleActive && submersibleEaten(this.finaleElapsed);

    if (!subSwallowed) {
      // Forward Searchlight Cones
      if (zone !== 'surface_shallows') {
        c.save();
        const beamGrad = c.createRadialGradient(subX, subY, 6, subX, subY + 75, 80);
        beamGrad.addColorStop(0, 'rgba(0, 245, 212, 0.45)');
        beamGrad.addColorStop(0.7, 'rgba(0, 245, 212, 0.12)');
        beamGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        c.fillStyle = beamGrad;
        c.beginPath();
        c.moveTo(subX - 8, subY + 8);
        c.lineTo(subX - 36, subY + 98);
        c.lineTo(subX + 36, subY + 98);
        c.lineTo(subX + 8, subY + 8);
        c.fill();
        c.restore();
      }

      // Submersible Body
      blit(c, this.assets, 'submersible', subX - 16, subY - 16, 1);

      // Warning beacon in cockpit during abyssal trench
      if (zone === 'abyssal_trench' || zone === 'leviathan_stalk') {
        if (Math.floor(this.time / 200) % 2 === 0) {
          c.fillStyle = C.crimson;
          c.fillRect(subX - 3, subY - 4, 6, 4);
        }
      }
    }

    // 7. Colossal Ancient Leviathan (Finale & Stalk)
    if (this.finaleActive || zone === 'leviathan_stalk') {
      let levTravel = 0;
      if (this.finaleActive) {
        levTravel = leviathanAscent(this.finaleElapsed, 78);
      } else {
        levTravel = 15;
      }

      const jawY = (H + 10) - levTravel;

      // Colossal Leviathan Jaws (64x48)
      blit(c, this.assets, 'leviathan_jaws', cx - 32, Math.round(jawY - 24), 1);

      // Leviathan Bioluminescent Maw Glow
      const mawGrad = c.createRadialGradient(cx, jawY, 8, cx, jawY, 65);
      mawGrad.addColorStop(0, 'rgba(0, 255, 187, 0.55)');
      mawGrad.addColorStop(0.6, 'rgba(0, 245, 212, 0.2)');
      mawGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      c.fillStyle = mawGrad;
      c.beginPath();
      c.arc(cx, jawY, 65, 0, Math.PI * 2);
      c.fill();
    }

    // 8. Bubbles
    for (const b of this.bubbles) {
      const bx = Math.round(b.xRatio * W);
      const by = Math.round(b.y);
      blit(c, this.assets, `bubble${b.type}`, bx - 8, by - 8, 1);
    }

    // 9. Sonar Ping Rings
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

    // 10. Crunch Blood / Debris Particles (Finale)
    for (const bp of this.bloodParticles) {
      c.fillStyle = bp.color;
      c.globalAlpha = bp.alpha;
      c.fillRect(Math.round(bp.x), Math.round(bp.y), bp.size, bp.size);
    }
    c.globalAlpha = 1.0;

    // 11. Depth Telemetry HUD
    this._renderDepthHUD(c, W, depth, zone);
  }

  _renderDepthHUD(c, W, depth, zone) {
    c.save();
    c.fillStyle = 'rgba(2, 10, 20, 0.8)';
    c.fillRect(W - 74, 8, 68, 28);
    c.strokeStyle = C.cyan;
    c.lineWidth = 1;
    c.strokeRect(W - 74, 8, 68, 28);

    c.fillStyle = C.cyan;
    c.font = '9px monospace';
    c.fillText(`-${depth}m`, W - 68, 20);

    c.font = '7px monospace';
    c.fillStyle = (zone === 'abyssal_trench' || zone === 'leviathan_stalk') ? C.crimson : '#88d8b0';
    const tag = (zone === 'surface_shallows') ? 'SURFACE' :
                (zone === 'twilight_kraken') ? 'KRAKEN' :
                (zone === 'atlantis_ruins') ? 'ATLANTIS' :
                (zone === 'abyssal_trench') ? 'WARNING!' : 'LEVIATHAN';
    c.fillText(tag, W - 68, 31);
    c.restore();
  }

  dispose() {
    this.sonarRipples = [];
    this.bloodParticles = [];
  }
}
