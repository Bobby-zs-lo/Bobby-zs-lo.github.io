/**
 * MechScene – Gundam Mobile Suit Lab Assembly & Sortie Launch.
 *
 * An authentic mecha hangar bay sequence: an RX-78 Gundam is progressively
 * constructed inside a high-tech subterranean research lab on a stationary floor cradle.
 * When the countdown hits 0:00, massive blast doors slide open behind the Gundam,
 * foot clamps release, and the mobile suit ignites its thrusters to fly out into
 * the starry night sky to fight!
 *
 * Progress Stages (Stationary in Lab):
 *   - 0.00 .. 0.25: Frame Assembly (inner skeletal frame & legs locked in floor cradle, repair drone welding)
 *   - 0.25 .. 0.50: Torso Armor (heavy blue chest armor descends from ceiling hoist, cockpit seals)
 *   - 0.50 .. 0.75: Weapons & Arms (beam rifle, red/white shield mount to shoulders, vernier testing)
 *   - 0.75 .. 0.95: Head Lock & System Online (Gundam head lowers, dual green visor eyes flash bright!)
 *   - 0.95 .. 1.00: Sortie Prep (sirens pulse, steam vents hiss, all systems green)
 *
 * Finale (at 0:00):
 *   - 0 .. 800ms: Heavy hangar blast doors slide open behind the Gundam, revealing the starry night sky!
 *   - 800 .. 2400ms: Foot clamps release. Twin rocket thrusters erupt, and the Gundam soars out the doors
 *     into the sky/space to battle! (Floor and launch cradle stay firmly grounded in the lab).
 *   - 2400 .. 4500ms: Exhaust smoke rolls through the empty lab cradle under the open night sky.
 */
import { Scene, blit } from '../scene.js';
import { audio }       from '../audio.js';

export const MECH_LAUNCH_MS = 800;
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

export function blastDoorSlide(elapsedMs, maxSlide) {
  if (elapsedMs < 0) return 0;
  const t = clampN(elapsedMs / 900, 0, 1);
  return maxSlide * Math.sin(t * Math.PI * 0.5);
}

export function finalePhase(elapsedMs) {
  if (elapsedMs < 0) return 'idle';
  if (elapsedMs < MECH_LAUNCH_MS) return 'ignition_flash';
  if (elapsedMs < 2400) return 'catapult_launch';
  if (elapsedMs < MECH_FINALE_TOTAL_MS) return 'launch_cleared';
  return 'done';
}

const C = {
  labWall: '#111524',
  labFloor: '#1a1f30',
  gridLine: '#242b42',
  cyan: '#00f5d4',
  gold: '#ffd166',
  crimson: '#ff2a5f',
  white: '#ffffff',
  nightSky: '#050714',
  doorEdge: '#3a4460',
};

export class MechScene extends Scene {
  constructor(ctx, assets, opts) {
    super(ctx, assets, opts);
    this.time = 0;
    this.progress = 0;
    this.remainingMs = 0;

    this.cx = 120;
    this.cy = 135;
    this.sparks = [];
    this.smokeClouds = [];

    this.finaleActive = false;
    this.finaleElapsed = 0;
    this.sfxPlayedLaunch = false;
  }

  layout(W, H) {
    super.layout(W, H);
    this.cx = Math.round(W * 0.5);
    this.cy = Math.round(H * 0.60);
  }

  init(durationMs) {
    this.time = 0;
    this.progress = 0;
    this.remainingMs = durationMs;
    this.sparks = [];
    this.smokeClouds = [];
    this.finaleActive = false;
    this.finaleElapsed = 0;
    this.sfxPlayedLaunch = false;
  }

  update(progress, dtMs, remainingMs) {
    this.time += dtMs;
    this.progress = clampN(progress, 0, 1);
    this.remainingMs = remainingMs;

    const phase = mechPhase(this.progress);

    // Welding sparks in early stages
    if (!this.finaleActive && (phase === 'frame' || phase === 'torso' || phase === 'arms')) {
      if (Math.random() < 0.32) {
        const droneSide = Math.sin(this.time * 0.003) > 0 ? 1 : -1;
        const targetY = (phase === 'frame') ? this.cy + 12 : (phase === 'torso') ? this.cy - 10 : this.cy - 20;
        this.sparks.push({
          x: this.cx + droneSide * 18 + (Math.random() - 0.5) * 8,
          y: targetY + (Math.random() - 0.5) * 6,
          vx: droneSide * (1.2 + Math.random() * 2.8),
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
        audio.sfx('hit'); // launch sonic roar!
      }

      // Billowing exhaust smoke in lab cradle during launch
      if (this.finaleElapsed >= 500 && this.finaleElapsed < 2600 && Math.random() < 0.7) {
        this.smokeClouds.push({
          x: this.cx + (Math.random() - 0.5) * 36,
          y: this.cy + 25,
          vx: (Math.random() - 0.5) * 2.2,
          vy: -0.5 - Math.random() * 1.5,
          size: 6 + Math.random() * 10,
          alpha: 0.8,
          color: Math.random() < 0.6 ? '#6a7898' : '#ffd166',
        });
      }

      for (let i = this.smokeClouds.length - 1; i >= 0; i--) {
        const sm = this.smokeClouds[i];
        sm.x += sm.vx;
        sm.y += sm.vy;
        sm.size += 0.25;
        sm.alpha -= 0.015 * (dtMs / 16.6);
        if (sm.alpha <= 0) this.smokeClouds.splice(i, 1);
      }
    }
  }

  onMilestone(i, total) {
    audio.sfx('build');
    // Assembly milestone spark burst
    for (let j = 0; j < 16; j++) {
      this.sparks.push({
        x: this.cx + (Math.random() - 0.5) * 40,
        y: this.cy - 12 + (Math.random() - 0.5) * 32,
        vx: (Math.random() - 0.5) * 4.5,
        vy: (Math.random() - 0.5) * 4.5,
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

    // 1. Stationary Lab Wall Background
    c.fillStyle = C.labWall;
    c.fillRect(0, 0, W, H);

    // 2. Blast Hangar Doors Behind Mech (Slide open in finale!)
    let doorSlideX = 0;
    if (this.finaleActive) {
      doorSlideX = blastDoorSlide(this.finaleElapsed, W * 0.45);
    }

    // Behind the doors: The Outside Night Sky / Battlefield!
    const doorGap = Math.round(doorSlideX);
    if (doorGap > 0) {
      c.save();
      c.fillStyle = C.nightSky;
      c.fillRect(cx - doorGap, 0, doorGap * 2, Math.round(H * 0.72));

      // Distant stars & combat beacons outside
      c.fillStyle = C.white;
      c.fillRect(cx - 16, 25, 2, 2);
      c.fillRect(cx + 22, 18, 1, 1);
      c.fillRect(cx + 8, 48, 2, 2);
      c.fillRect(cx - 28, 55, 1, 1);
      // Crescent Moon in sky
      c.fillStyle = '#fffae0';
      c.beginPath();
      c.arc(cx + 28, 32, 8, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = C.nightSky;
      c.beginPath();
      c.arc(cx + 31, 30, 7, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }

    // Heavy Sliding Blast Door Plates
    const leftDoorRight = Math.max(0, cx - doorGap);
    const rightDoorLeft = cx + doorGap;
    if (leftDoorRight > 0) {
      c.fillStyle = '#1c2236';
      c.fillRect(0, 0, leftDoorRight, Math.round(H * 0.72));
      c.strokeStyle = C.doorEdge;
      c.strokeRect(0, 0, leftDoorRight, Math.round(H * 0.72));
      // Outer seam seal
      c.fillStyle = '#0c0f18';
      c.fillRect(leftDoorRight - 2, 0, 2, Math.round(H * 0.72));
    }
    if (rightDoorLeft < W) {
      c.fillStyle = '#1c2236';
      c.fillRect(rightDoorLeft, 0, W - rightDoorLeft, Math.round(H * 0.72));
      c.strokeStyle = C.doorEdge;
      c.strokeRect(rightDoorLeft, 0, W - rightDoorLeft, Math.round(H * 0.72));
      c.fillStyle = '#0c0f18';
      c.fillRect(rightDoorLeft, 0, 2, Math.round(H * 0.72));
    }

    // Door horizontal structural braces & hydraulic lock bolts
    c.strokeStyle = '#262f46';
    c.lineWidth = 1;
    for (let py = 32; py < H * 0.70; py += 28) {
      if (leftDoorRight > 0) {
        c.beginPath(); c.moveTo(0, py); c.lineTo(leftDoorRight - 2, py); c.stroke();
        c.fillStyle = C.gold;
        c.fillRect(leftDoorRight - 5, py - 2, 3, 5);
      }
      if (rightDoorLeft < W) {
        c.beginPath(); c.moveTo(rightDoorLeft + 2, py); c.lineTo(W, py); c.stroke();
        c.fillStyle = C.gold;
        c.fillRect(rightDoorLeft + 2, py - 2, 3, 5);
      }
    }

    // 3. Stationary Lab Wall Diagnostics & Server Racks
    for (let r = 0; r < 4; r++) {
      const ry = 40 + r * 16;
      // Left terminal
      c.fillStyle = (Math.floor(this.time / 300 + r) % 2 === 0) ? C.cyan : '#153835';
      c.fillRect(6, ry, 10, 3);
      // Right terminal
      c.fillStyle = (Math.floor(this.time / 250 + r) % 2 === 0) ? C.gold : '#383015';
      c.fillRect(W - 16, ry, 10, 3);
    }

    // 4. Solid Industrial Lab Floor (STATIONARY!)
    const floorY = Math.round(H * 0.70);
    c.fillStyle = C.labFloor;
    c.fillRect(0, floorY, W, H - floorY);

    // Hazard Caution Perimeter Line on Floor
    for (let hx = 0; hx < W; hx += 16) {
      c.fillStyle = C.gold;
      c.fillRect(hx, floorY, 8, 3);
      c.fillStyle = '#0a0d14';
      c.fillRect(hx + 8, floorY, 8, 3);
    }

    // Floor Steel Gridlines
    c.strokeStyle = C.gridLine;
    c.lineWidth = 1;
    for (let gx = 20; gx < W; gx += 28) {
      c.beginPath();
      c.moveTo(gx, floorY); c.lineTo(gx, H);
      c.stroke();
    }

    // 5. Stationary Launch Cradle Pad on the Floor (STAYS ON THE GROUND!)
    blit(c, this.assets, 'launch_cradle', cx - 32, cy + 18, 1);

    // 6. Gundam Mobile Suit (Leaps/Flies Upward ONLY During Finale Sortie!)
    let flightY = 0;
    if (this.finaleActive) {
      flightY = launchEjectionY(this.finaleElapsed, H * 1.4);
    }
    const mechY = cy - flightY;

    c.save();

    // Twin Thruster Flames (Ignite at launch or late testing)
    const isRocketActive = (this.finaleActive && this.finaleElapsed >= MECH_LAUNCH_MS) || (thrust > 0.6);
    if (isRocketActive && flightY < H * 1.3) {
      const fIdx = Math.floor(this.time / 50) % 3;
      blit(c, this.assets, `jet_flame${fIdx}`, cx - 18, mechY + 24, 1);
      blit(c, this.assets, `jet_flame${fIdx}`, cx - 6, mechY + 24, 1);

      // Floor lighting reflection from rocket exhaust
      c.fillStyle = 'rgba(0, 245, 212, 0.4)';
      c.beginPath();
      c.arc(cx, cy + 22, 38, 0, Math.PI * 2);
      c.fill();
    }

    // (a) Frame & Legs (32x48)
    if (parts.frame) {
      blit(c, this.assets, 'frame_legs', cx - 16, mechY - 18, 1);
    }

    // (b) Torso Armor (32x32)
    if (parts.torso) {
      blit(c, this.assets, 'armor_torso', cx - 16, mechY - 26, 1);
    }

    // (c) Arms: Beam Rifle & Shield (24x36)
    if (parts.arms) {
      blit(c, this.assets, 'arm_rifle', cx - 24, mechY - 28, 1);
      blit(c, this.assets, 'arm_rifle', cx, mechY - 28, 1, true);
    }

    // (d) Head & Golden V-Fin (24x24)
    if (parts.head) {
      blit(c, this.assets, 'gundam_head', cx - 12, mechY - 44, 1);

      // Glowing Eyes
      if (parts.eyesLit) {
        c.fillStyle = '#00ff88';
        c.fillRect(cx - 5, mechY - 33, 3, 2);
        c.fillRect(cx + 2, mechY - 33, 3, 2);

        const glowA = Math.sin(this.time * 0.015) * 0.25 + 0.75;
        c.fillStyle = `rgba(0, 255, 136, ${glowA})`;
        c.beginPath();
        c.arc(cx - 4, mechY - 32, 4, 0, Math.PI * 2);
        c.arc(cx + 3, mechY - 32, 4, 0, Math.PI * 2);
        c.fill();
      }
    }

    // (e) Hovering Welder Drone (Active in lab during assembly)
    if (!this.finaleActive && (phase === 'frame' || phase === 'torso' || phase === 'arms')) {
      const droneBob = Math.sin(this.time * 0.005) * 8;
      const droneSide = Math.cos(this.time * 0.003) > 0 ? 1 : -1;
      const droneX = cx + droneSide * 32;
      const droneY = mechY - 18 + droneBob;
      blit(c, this.assets, 'weld_arm', droneX - 12, droneY - 12, 1, droneSide < 0);
    }

    c.restore();

    // 7. Welding Sparks
    for (const sp of this.sparks) {
      c.fillStyle = sp.color;
      c.fillRect(Math.round(sp.x), Math.round(sp.y), 2, 2);
    }

    // 8. Billowing Smoke Clouds on Cradle Floor (Finale)
    for (const sm of this.smokeClouds) {
      c.fillStyle = sm.color;
      c.globalAlpha = sm.alpha;
      c.beginPath();
      c.arc(Math.round(sm.x), Math.round(sm.y), sm.size, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1.0;

    // 9. Telemetry & Lab Diagnostics HUD
    this._renderHUD(c, W, H, cx, p, phase, parts);
  }

  _renderHUD(c, W, H, cx, p, phase, parts) {
    c.save();
    c.strokeStyle = '#2b344e';
    c.strokeRect(W - 76, 8, 70, 28);
    c.fillStyle = 'rgba(12, 16, 26, 0.85)';
    c.fillRect(W - 75, 9, 68, 26);

    c.fillStyle = (phase === 'catapult_lock') ? C.crimson : C.cyan;
    c.fillRect(W - 73, 12, Math.round(64 * p), 3);

    c.fillStyle = C.cyan;
    c.font = '8px monospace';
    const tag = (phase === 'frame') ? 'LAB: FRAME' :
                (phase === 'torso') ? 'LAB: REACTOR' :
                (phase === 'arms') ? 'LAB: WEAPONS' :
                (phase === 'head_activate') ? 'SYSTEM GREEN' : 'DOORS OPEN!';
    c.fillText(tag, W - 70, 26);

    if (phase === 'catapult_lock') {
      if (Math.floor(this.time / 200) % 2 === 0) {
        c.fillStyle = C.crimson;
        c.font = '9px monospace';
        c.fillText('! SORTIE READY !', cx - 44, 32);
      }
    }
    c.restore();
  }

  dispose() {
    this.sparks = [];
    this.smokeClouds = [];
  }
}
