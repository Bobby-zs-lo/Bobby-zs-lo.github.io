/**
 * MechScene – Gundam Mobile Suit Assembly & Catapult Launch Countdown.
 *
 * An authentic anime mecha factory sequence where an RX-78 style mobile suit
 * is progressively constructed on an underground launch pad before undergoing
 * a high-speed electromagnetic catapult launch into space.
 *
 * Progress Stages:
 *   - 0.00 .. 0.25: Frame Assembly (inner skeletal frame & legs locked on pad, robotic arms welding with sparks)
 *   - 0.25 .. 0.50: Torso Armor (heavy blue/white chest armor lowers from gantry crane, cockpit seals)
 *   - 0.50 .. 0.75: Weapons & Arms (beam rifle, shoulder pauldrons lock into place, vernier testing)
 *   - 0.75 .. 0.95: Head Lock & System Activation (Gundam head lowers, dual green visor eyes flash bright!)
 *   - 0.95 .. 1.00: Catapult Standby (clamps lock feet, overhead blast doors iris-open, steam vents hiss)
 *
 * Finale (at 0:00):
 *   - Catapult electromagnetic rails ignite with cyan lightning.
 *   - Dual rocket thrusters roar with massive flame exhaust.
 *   - The Gundam launches forward/upward at hypersonic speed, streaking out of the silo into space!
 */
import { Scene, blit } from '../scene.js';
import { audio }       from '../audio.js';

export const MECH_LAUNCH_MS = 600;
export const MECH_FINALE_TOTAL_MS = 4500;

export function clampN(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export function mechPhase(progress) {
  const p = clampN(progress, 0, 1);
  if (p < 0.25) return 'frame';
  if (p < 0.50) return 'torso';
  if (p < 0.75) return 'arms';
  if (p < 0.95) return 'head_activate';
  return 'catapult_lock';
}

export function assemblyPartsVisible(progress) {
  const p = clampN(progress, 0, 1);
  return {
    frame: true,
    torso: p >= 0.25,
    arms: p >= 0.50,
    head: p >= 0.75,
    eyesLit: p >= 0.85,
  };
}

export function gantryRetract(progress) {
  const p = clampN(progress, 0, 1);
  if (p < 0.85) return 0;
  return clampN((p - 0.85) / 0.15, 0, 1);
}

export function thrusterPower(progress) {
  const p = clampN(progress, 0, 1);
  if (p < 0.60) return 0;
  if (p < 0.90) return (p - 0.60) / 0.30 * 0.4;
  if (p >= 1.0) return 1.0;
  return 0.4 + (p - 0.90) / 0.10 * 0.6;
}

export function launchEjectionY(elapsedMs, maxTravel) {
  if (elapsedMs < MECH_LAUNCH_MS) return 0;
  const t = clampN((elapsedMs - MECH_LAUNCH_MS) / 1400, 0, 1);
  return maxTravel * Math.pow(t, 2.8);
}

export function finalePhase(elapsedMs) {
  if (elapsedMs < 0) return 'idle';
  if (elapsedMs < MECH_LAUNCH_MS) return 'ignition_flash';
  if (elapsedMs < 2400) return 'catapult_launch';
  if (elapsedMs < MECH_FINALE_TOTAL_MS) return 'launch_cleared';
  return 'done';
}

const C = {
  hangarDark: '#070510',
  hangarWall: '#140e24',
  rail: '#2c1e4a',
  cyan: '#00f5d4',
  gold: '#ffd166',
  crimson: '#ff2a5f',
  white: '#ffffff',
  hudLine: 'rgba(0, 245, 212, 0.35)',
  steam: 'rgba(200, 220, 255, 0.25)',
};

export class MechScene extends Scene {
  constructor(ctx, assets, opts) {
    super(ctx, assets, opts);
    this.time = 0;
    this.progress = 0;
    this.remainingMs = 0;

    this.cx = 120;
    this.cy = 130;
    this.sparks = [];
    this.speedLines = [];
    this.exhaustClouds = [];

    this.finaleActive = false;
    this.finaleElapsed = 0;
    this.sfxPlayedLaunch = false;

    this._initParticles();
  }

  _initParticles() {
    this.speedLines = [];
    for (let i = 0; i < 24; i++) {
      this.speedLines.push({
        xRatio: 0.12 + Math.random() * 0.76,
        y: Math.random() * 240,
        len: 12 + Math.random() * 32,
        speed: 0.5 + Math.random() * 0.9,
      });
    }
  }

  layout(W, H) {
    super.layout(W, H);
    this.cx = Math.round(W * 0.5);
    this.cy = Math.round(H * 0.56);
  }

  init(durationMs) {
    this.time = 0;
    this.progress = 0;
    this.remainingMs = durationMs;
    this.sparks = [];
    this.exhaustClouds = [];
    this.finaleActive = false;
    this.finaleElapsed = 0;
    this.sfxPlayedLaunch = false;
  }

  update(progress, dtMs, remainingMs) {
    this.time += dtMs;
    this.progress = clampN(progress, 0, 1);
    this.remainingMs = remainingMs;

    const phase = mechPhase(this.progress);
    const parts = assemblyPartsVisible(this.progress);

    // Speed lines active during catapult launch
    const isLaunching = this.finaleActive && this.finaleElapsed >= MECH_LAUNCH_MS;
    const lineSpeed = isLaunching ? 2.5 : (phase === 'catapult_lock') ? 0.6 : 0.08;
    for (const l of this.speedLines) {
      l.y += l.speed * dtMs * lineSpeed;
      if (l.y > this.H) l.y = -l.len;
    }

    // Welding sparks in early assembly phases
    if (!this.finaleActive && (phase === 'frame' || phase === 'torso' || phase === 'arms')) {
      if (Math.random() < 0.28) {
        const armSide = Math.random() < 0.5 ? -1 : 1;
        const targetY = (phase === 'frame') ? this.cy + 10 : (phase === 'torso') ? this.cy - 12 : this.cy - 22;
        this.sparks.push({
          x: this.cx + armSide * 22 + (Math.random() - 0.5) * 8,
          y: targetY + (Math.random() - 0.5) * 6,
          vx: armSide * (1 + Math.random() * 2.5),
          vy: -1.5 + Math.random() * 3.5,
          life: 1.0,
          color: Math.random() < 0.5 ? C.gold : C.cyan,
        });
      }
    }

    // Update sparks
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const sp = this.sparks[i];
      sp.x += sp.vx;
      sp.y += sp.vy;
      sp.life -= 0.025 * (dtMs / 16.6);
      if (sp.life <= 0) this.sparks.splice(i, 1);
    }

    // Finale logic
    if (this.finaleActive) {
      this.finaleElapsed += dtMs;
      if (this.finaleElapsed >= MECH_LAUNCH_MS && !this.sfxPlayedLaunch) {
        this.sfxPlayedLaunch = true;
        audio.sfx('hit');
      }

      // Exhaust billowing clouds during catapult launch
      if (this.finaleElapsed < 2400 && Math.random() < 0.65) {
        this.exhaustClouds.push({
          x: this.cx + (Math.random() - 0.5) * 36,
          y: this.cy + 25,
          vx: (Math.random() - 0.5) * 2.0,
          vy: 0.8 + Math.random() * 2.5,
          size: 5 + Math.random() * 8,
          alpha: 0.85,
          color: Math.random() < 0.5 ? C.cyan : C.gold,
        });
      }

      for (let i = this.exhaustClouds.length - 1; i >= 0; i--) {
        const p = this.exhaustClouds[i];
        p.x += p.vx;
        p.y += p.vy;
        p.size += 0.2;
        p.alpha -= 0.018 * (dtMs / 16.6);
        if (p.alpha <= 0) this.exhaustClouds.splice(i, 1);
      }
    }
  }

  onMilestone(i, total) {
    audio.sfx('build');
    // Burst of assembly sparks
    for (let j = 0; j < 18; j++) {
      this.sparks.push({
        x: this.cx + (Math.random() - 0.5) * 44,
        y: this.cy - 10 + (Math.random() - 0.5) * 35,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        life: 1.0,
        color: C.gold,
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
    const parts = assemblyPartsVisible(p);
    const thrust = thrusterPower(p);
    const retract = gantryRetract(p);

    // 1. Silo Background & Concrete Walls
    c.fillStyle = C.hangarDark;
    c.fillRect(0, 0, W, H);

    const wallW = Math.round(W * 0.16);
    c.fillStyle = C.hangarWall;
    c.fillRect(0, 0, wallW, H);
    c.fillRect(W - wallW, 0, wallW, H);

    // Vertical Catapult Rails
    c.strokeStyle = C.rail;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(wallW, 0); c.lineTo(wallW, H);
    c.moveTo(W - wallW, 0); c.lineTo(W - wallW, H);
    c.stroke();

    // Catapult Rail Neon Guideway
    const railGlow = (phase === 'catapult_lock' || this.finaleActive) ? C.cyan : 'rgba(0, 245, 212, 0.2)';
    c.strokeStyle = railGlow;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(wallW + 2, 0); c.lineTo(wallW + 2, H);
    c.moveTo(W - wallW - 2, 0); c.lineTo(W - wallW - 2, H);
    c.stroke();

    // Hazard Stripes on Walls
    for (let y = 0; y < H; y += 28) {
      c.strokeStyle = C.gold;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(2, y); c.lineTo(wallW - 3, y + 10);
      c.moveTo(W - wallW + 3, y); c.lineTo(W - 2, y + 10);
      c.stroke();
    }

    // 2. Overhead Catapult Blast Doors (Iris open at p >= 0.85)
    const doorOpenT = (p >= 0.85) ? (p - 0.85) / 0.15 : 0;
    const doorGap = Math.round(doorOpenT * (W * 0.42));
    c.fillStyle = '#020008'; // starfield
    c.fillRect(cx - doorGap, 0, doorGap * 2, 26);
    if (doorGap > 8) {
      c.fillStyle = C.white;
      c.fillRect(cx - 14, 6, 2, 2);
      c.fillRect(cx + 18, 12, 1, 1);
      c.fillRect(cx - 2, 16, 1, 1);
    }
    // Blast door plates
    c.fillStyle = '#1c172e';
    c.fillRect(0, 0, Math.max(0, cx - doorGap), 26);
    c.fillRect(cx + doorGap, 0, Math.max(0, W - (cx + doorGap)), 26);
    c.strokeStyle = C.crimson;
    c.strokeRect(cx - doorGap, 24, doorGap * 2, 2);

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

    // 4. Catapult Platform & Mech Assembly
    let ejectionY = 0;
    if (this.finaleActive) {
      ejectionY = launchEjectionY(this.finaleElapsed, H * 1.35);
    }
    const mechY = cy - ejectionY;

    c.save();

    // Launch Bed Base
    const bedW = 68;
    c.fillStyle = '#221936';
    c.fillRect(cx - bedW/2, mechY + 28, bedW, 8);
    c.fillStyle = (phase === 'catapult_lock') ? C.cyan : '#433466';
    c.fillRect(cx - bedW/2, mechY + 34, bedW, 2);

    // Twin Thruster Flames
    const isIgnited = (thrust > 0 || (this.finaleActive && this.finaleElapsed < 2400));
    if (isIgnited && ejectionY < H) {
      const flameIdx = Math.floor(this.time / 50) % 3;
      blit(c, this.assets, `jet_flame${flameIdx}`, cx - 20, mechY + 26, 1);
      blit(c, this.assets, `jet_flame${flameIdx}`, cx - 4, mechY + 26, 1);

      // Floor illumination glow
      const thrGrad = c.createRadialGradient(cx, mechY + 30, 4, cx, mechY + 30, 48);
      thrGrad.addColorStop(0, 'rgba(0, 245, 212, 0.7)');
      thrGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      c.fillStyle = thrGrad;
      c.beginPath();
      c.arc(cx, mechY + 30, 48, 0, Math.PI * 2);
      c.fill();
    }

    // GUNDAM PROGRESSIVE ASSEMBLY:
    // (a) Inner Frame & Legs (32x48)
    if (parts.frame) {
      blit(c, this.assets, 'frame_legs', cx - 16, mechY - 18, 1);
    }

    // (b) Chest / Torso Armor (32x32)
    if (parts.torso) {
      blit(c, this.assets, 'armor_torso', cx - 16, mechY - 26, 1);
    }

    // (c) Arms & Beam Rifle (24x36)
    if (parts.arms) {
      blit(c, this.assets, 'arm_rifle', cx - 24, mechY - 28, 1);
      blit(c, this.assets, 'arm_rifle', cx, mechY - 28, 1, true); // right arm mirrored
    }

    // (d) Gundam Head & V-Fin (24x24)
    if (parts.head) {
      blit(c, this.assets, 'gundam_head', cx - 12, mechY - 44, 1);

      // Dual Visor Eyes Lighting Up!
      if (parts.eyesLit) {
        c.fillStyle = '#00ff66';
        c.fillRect(cx - 5, mechY - 33, 3, 2);
        c.fillRect(cx + 2, mechY - 33, 3, 2);

        // Radiant eye gleam
        const eyePulse = Math.sin(this.time * 0.01) * 0.3 + 0.7;
        c.fillStyle = `rgba(0, 255, 102, ${eyePulse})`;
        c.beginPath();
        c.arc(cx - 4, mechY - 32, 4, 0, Math.PI * 2);
        c.arc(cx + 3, mechY - 32, 4, 0, Math.PI * 2);
        c.fill();
      }
    }

    // (e) Robotic Welding Arms (Active during frame/torso/arms stages)
    if (!this.finaleActive && (phase === 'frame' || phase === 'torso' || phase === 'arms')) {
      const armBob = Math.sin(this.time * 0.005) * 6;
      blit(c, this.assets, 'weld_arm', cx - 44, mechY - 14 + armBob, 1);
      blit(c, this.assets, 'weld_arm', cx + 12, mechY - 6 - armBob, 1, true);
    }

    c.restore();

    // 5. Welding Sparks
    for (const sp of this.sparks) {
      c.fillStyle = sp.color;
      c.fillRect(Math.round(sp.x), Math.round(sp.y), 2, 2);
    }

    // 6. Exhaust Clouds (Finale)
    for (const ec of this.exhaustClouds) {
      c.fillStyle = ec.color;
      c.globalAlpha = ec.alpha;
      c.beginPath();
      c.arc(Math.round(ec.x), Math.round(ec.y), ec.size, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1.0;

    // 7. HUD Telemetry & Narrative Status
    this._renderHUD(c, W, H, cx, p, phase, parts);
  }

  _renderHUD(c, W, H, cx, p, phase, parts) {
    c.save();
    // Top-right Telemetry Box
    c.strokeStyle = C.hudLine;
    c.strokeRect(W - 74, 8, 68, 26);
    c.fillStyle = 'rgba(7, 5, 16, 0.8)';
    c.fillRect(W - 73, 9, 66, 24);

    // Progress gauge
    c.fillStyle = (phase === 'catapult_lock') ? C.crimson : C.cyan;
    c.fillRect(W - 71, 12, Math.round(62 * p), 3);

    // Phase Status Label
    c.fillStyle = C.cyan;
    c.font = '8px monospace';
    const label = (phase === 'frame') ? 'FRAME SYNC' :
                  (phase === 'torso') ? 'TORSO LOCK' :
                  (phase === 'arms') ? 'ARMS READY' :
                  (phase === 'head_activate') ? 'SYSTEM ON' : 'CATAPULT GO';
    c.fillText(label, W - 68, 26);

    // Alert banner when launch ready
    if (phase === 'catapult_lock') {
      if (Math.floor(this.time / 180) % 2 === 0) {
        c.fillStyle = C.crimson;
        c.font = '9px monospace';
        c.fillText('! READY TO LAUNCH !', cx - 48, 38);
      }
    }
    c.restore();
  }

  dispose() {
    this.sparks = [];
    this.exhaustClouds = [];
  }
}
