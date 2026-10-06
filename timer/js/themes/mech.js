/**
 * MechScene – Cyberpunk Orbital Mech Launch Countdown.
 *
 * An anime mecha vertical launch sequence inside a high-tech subterranean silo.
 *
 * Progress Stages:
 *   - 0.00 .. 0.25: System Diagnostics (gantries locked, reactor humming, cooling steam)
 *   - 0.25 .. 0.50: Gantry Disconnect & Maglev Ascent (clamps retract, platform lifts)
 *   - 0.50 .. 0.75: Thruster Ignition (ion rocket exhaust, downward speed lines)
 *   - 0.75 .. 0.95: Blast Door Breach (overhead silo doors iris-open, hazard sirens)
 *   - 0.95 .. 1.00: Full Afterburner Lock (maximum thrust, screen vibration)
 *
 * Finale (at 0:00):
 *   - Sonic boom shockwave blasts downward as the mech ejects vertically into
 *     orbit at hypersonic velocity, trailing radiant particle contrails.
 */
import { Scene, blit } from '../scene.js';
import { audio }       from '../audio.js';

export const MECH_LAUNCH_MS = 600;
export const MECH_FINALE_TOTAL_MS = 4500;

export function clampN(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export function mechPhase(progress) {
  const p = clampN(progress, 0, 1);
  if (p < 0.25) return 'diagnostic';
  if (p < 0.50) return 'ascent';
  if (p < 0.75) return 'thruster';
  if (p < 0.95) return 'breach';
  return 'overload';
}

export function gantryRetract(progress) {
  const p = clampN(progress, 0, 1);
  if (p < 0.25) return 0;
  return clampN((p - 0.25) / 0.25, 0, 1);
}

export function thrusterPower(progress) {
  const p = clampN(progress, 0, 1);
  if (p < 0.50) return 0;
  if (p < 0.75) return (p - 0.50) / 0.25 * 0.7;
  return 0.7 + (p - 0.75) / 0.25 * 0.3;
}

export function launchEjectionY(elapsedMs, maxTravel) {
  if (elapsedMs < MECH_LAUNCH_MS) return 0;
  const t = clampN((elapsedMs - MECH_LAUNCH_MS) / 1200, 0, 1);
  return maxTravel * Math.pow(t, 2.5); // rapid upward acceleration
}

export function finalePhase(elapsedMs) {
  if (elapsedMs < 0) return 'idle';
  if (elapsedMs < MECH_LAUNCH_MS) return 'ignition_flash';
  if (elapsedMs < 2400) return 'ejection';
  if (elapsedMs < MECH_FINALE_TOTAL_MS) return 'exhaust_settle';
  return 'done';
}

const C = {
  siloDark: '#090514',
  siloWall: '#150f24',
  rail: '#261b40',
  cyan: '#00f5d4',
  gold: '#ffd166',
  crimson: '#ff2a5f',
  white: '#ffffff',
  hudLine: 'rgba(0, 245, 212, 0.35)',
};

export class MechScene extends Scene {
  constructor(ctx, assets, opts) {
    super(ctx, assets, opts);
    this.time = 0;
    this.progress = 0;
    this.remainingMs = 0;

    this.cx = 120;
    this.cy = 120;
    this.sparks = [];
    this.speedLines = [];
    this.exhaustParticles = [];

    this.finaleActive = false;
    this.finaleElapsed = 0;
    this.sfxPlayedLaunch = false;

    this._initParticles();
  }

  _initParticles() {
    this.speedLines = [];
    for (let i = 0; i < 20; i++) {
      this.speedLines.push({
        xRatio: 0.15 + Math.random() * 0.7,
        y: Math.random() * 240,
        len: 15 + Math.random() * 35,
        speed: 0.4 + Math.random() * 0.8,
      });
    }
  }

  layout(W, H) {
    super.layout(W, H);
    this.cx = Math.round(W * 0.5);
    this.cy = Math.round(H * 0.54);
  }

  init(durationMs) {
    this.time = 0;
    this.progress = 0;
    this.remainingMs = durationMs;
    this.sparks = [];
    this.exhaustParticles = [];
    this.finaleActive = false;
    this.finaleElapsed = 0;
    this.sfxPlayedLaunch = false;
  }

  update(progress, dtMs, remainingMs) {
    this.time += dtMs;
    this.progress = clampN(progress, 0, 1);
    this.remainingMs = remainingMs;

    const phase = mechPhase(this.progress);
    const thrust = thrusterPower(this.progress);

    // Update speed lines during ascent and thruster phase
    const lineSpeed = (phase === 'diagnostic') ? 0.05 : (phase === 'ascent') ? 0.4 : 1.2;
    for (const l of this.speedLines) {
      l.y += l.speed * dtMs * lineSpeed;
      if (l.y > this.H) l.y = -l.len;
    }

    // Spawn sparks periodically
    if (Math.random() < (thrust > 0 ? 0.35 : 0.08)) {
      this.sparks.push({
        x: this.cx + (Math.random() - 0.5) * 40,
        y: this.cy + 20 + Math.random() * 15,
        vx: (Math.random() - 0.5) * 2,
        vy: 1 + Math.random() * 3,
        life: 1.0,
      });
    }

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const sp = this.sparks[i];
      sp.x += sp.vx;
      sp.y += sp.vy;
      sp.life -= 0.02 * (dtMs / 16.6);
      if (sp.life <= 0) this.sparks.splice(i, 1);
    }

    // Finale logic
    if (this.finaleActive) {
      this.finaleElapsed += dtMs;
      if (this.finaleElapsed >= MECH_LAUNCH_MS && !this.sfxPlayedLaunch) {
        this.sfxPlayedLaunch = true;
        audio.sfx('hit');
      }

      // Exhaust billowing particles
      if (this.finaleElapsed < 2400 && Math.random() < 0.6) {
        this.exhaustParticles.push({
          x: this.cx + (Math.random() - 0.5) * 24,
          y: this.cy + 10,
          vx: (Math.random() - 0.5) * 1.5,
          vy: 0.5 + Math.random() * 2,
          size: 4 + Math.random() * 6,
          alpha: 0.8,
          color: (Math.random() < 0.5) ? C.cyan : C.gold,
        });
      }

      for (let i = this.exhaustParticles.length - 1; i >= 0; i--) {
        const p = this.exhaustParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.size += 0.15;
        p.alpha -= 0.015 * (dtMs / 16.6);
        if (p.alpha <= 0) this.exhaustParticles.splice(i, 1);
      }
    }
  }

  onMilestone(i, total) {
    audio.sfx('build');
    for (let j = 0; j < 15; j++) {
      this.sparks.push({
        x: this.cx + (Math.random() - 0.5) * 50,
        y: this.cy - 10 + Math.random() * 40,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        life: 1.0,
      });
    }
  }

  onComplete() {
    this.finaleActive = true;
    this.finaleElapsed = 0;
  }

  isFinaleDone() {
    return this.finaleActive && this.finaleElapsed >= MECH_FINALE_TOTAL_MS;
  }

  render() {
    const c = this.ctx;
    const W = this.W, H = this.H;
    const cx = this.cx, cy = this.cy;
    const p = this.progress;
    const phase = mechPhase(p);
    const thrust = thrusterPower(p);
    const retract = gantryRetract(p);

    // 1. Subterranean Silo Walls (Perspective)
    c.fillStyle = C.siloDark;
    c.fillRect(0, 0, W, H);

    // Wall gradient shading
    const wallW = Math.round(W * 0.18);
    c.fillStyle = C.siloWall;
    c.fillRect(0, 0, wallW, H);
    c.fillRect(W - wallW, 0, wallW, H);

    // Vertical Guide Rails
    c.strokeStyle = C.rail;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(wallW, 0); c.lineTo(wallW, H);
    c.moveTo(W - wallW, 0); c.lineTo(W - wallW, H);
    c.stroke();

    // Hazard Stripes on Silo Walls
    for (let y = 0; y < H; y += 32) {
      c.strokeStyle = C.gold;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(2, y); c.lineTo(wallW - 4, y + 12);
      c.moveTo(W - wallW + 4, y); c.lineTo(W - 2, y + 12);
      c.stroke();
    }

    // 2. Overhead Blast Doors (Iris open during 'breach')
    const doorOpenT = (p >= 0.75) ? (p - 0.75) / 0.25 : 0;
    const doorGap = Math.round(doorOpenT * (W * 0.4));
    c.fillStyle = '#020008'; // night sky
    c.fillRect(cx - doorGap, 0, doorGap * 2, 28);
    // Distant stars above
    if (doorGap > 10) {
      c.fillStyle = C.white;
      c.fillRect(cx - 8, 8, 2, 2);
      c.fillRect(cx + 12, 14, 1, 1);
      c.fillRect(cx - 15, 18, 1, 1);
    }
    // Blast door plates
    c.fillStyle = '#1c172e';
    c.fillRect(0, 0, Math.max(0, cx - doorGap), 28);
    c.fillRect(cx + doorGap, 0, Math.max(0, W - (cx + doorGap)), 28);
    c.strokeStyle = C.crimson;
    c.strokeRect(cx - doorGap, 26, doorGap * 2, 2);

    // 3. Motion Speed Lines
    c.strokeStyle = C.hudLine;
    c.lineWidth = 1;
    for (const l of this.speedLines) {
      const lx = Math.round(l.xRatio * W);
      c.beginPath();
      c.moveTo(lx, l.y);
      c.lineTo(lx, l.y + l.len);
      c.stroke();
    }

    // 4. Maglev Platform & Mech (with upward ejection during finale)
    let ejectionY = 0;
    if (this.finaleActive) {
      ejectionY = launchEjectionY(this.finaleElapsed, H * 1.2);
    }
    const mechY = cy - ejectionY;

    c.save();
    // Platform Base
    const platW = 70;
    c.fillStyle = '#2b2342';
    c.fillRect(cx - platW/2, mechY + 24, platW, 8);
    c.fillStyle = C.cyan;
    c.fillRect(cx - platW/2, mechY + 30, platW, 2); // neon glow trim

    // Thruster Flames
    if (thrust > 0 && ejectionY < H) {
      const flameH = Math.round(thrust * 32);
      const flameFrame = (Math.floor(this.time / 60) % 3);
      blit(c, this.assets, `flame${flameFrame}`, cx - 18, mechY + 22, 1);
      blit(c, this.assets, `flame${flameFrame}`, cx + 2, mechY + 22, 1);

      // Radial thruster lighting on the floor
      const thrGrad = c.createRadialGradient(cx, mechY + 28, 5, cx, mechY + 28, 45);
      thrGrad.addColorStop(0, 'rgba(0, 245, 212, 0.7)');
      thrGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      c.fillStyle = thrGrad;
      c.beginPath();
      c.arc(cx, mechY + 28, 45, 0, Math.PI * 2);
      c.fill();
    }

    // Mech Body Sprite
    blit(c, this.assets, 'mech_body', cx - 24, mechY - 24, 1);

    // Side Hydraulic Gantries (Retract horizontally)
    const gantryOffset = Math.round(retract * 34);
    blit(c, this.assets, 'gantry_left', cx - 44 - gantryOffset, cy - 24, 1);
    blit(c, this.assets, 'gantry_right', cx + 20 + gantryOffset, cy - 24, 1);

    c.restore();

    // 5. Sparks
    c.fillStyle = C.gold;
    for (const sp of this.sparks) {
      c.fillRect(Math.round(sp.x), Math.round(sp.y), 2, 2);
    }

    // 6. Exhaust Particles (Finale)
    for (const ep of this.exhaustParticles) {
      c.fillStyle = ep.color;
      c.globalAlpha = ep.alpha;
      c.beginPath();
      c.arc(Math.round(ep.x), Math.round(ep.y), ep.size, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1.0;

    // 7. HUD Telemetry Overlay
    this._renderHUD(c, W, H, cx, p, phase);
  }

  _renderHUD(c, W, H, cx, p, phase) {
    c.save();
    // Top-right Telemetry Readout
    c.strokeStyle = C.hudLine;
    c.strokeRect(W - 65, 8, 58, 24);
    c.fillStyle = (phase === 'overload' || phase === 'breach') ? C.crimson : C.cyan;
    c.fillRect(W - 63, 10, Math.round(54 * p), 4); // Progress bar

    // Warning Badge when approaching launch
    if (phase === 'breach' || phase === 'overload') {
      if (Math.floor(this.time / 200) % 2 === 0) {
        blit(c, this.assets, 'warning_hud', cx - 16, 36, 1);
      }
    }
    c.restore();
  }

  dispose() {
    this.sparks = [];
    this.exhaustParticles = [];
  }
}
