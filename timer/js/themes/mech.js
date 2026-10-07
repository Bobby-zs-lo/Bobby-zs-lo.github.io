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
  labWallTop: '#495d7a',      // Dexter's Lab cool slate-blue upper wall
  labWallBot: '#37475d',      // Mid slate-blue lower wall
  wallPanelBevel: '#5c708e',  // Modular panel highlight bevel
  wallPanelGrout: '#243142',  // Modular panel dark seam
  wallRivet: '#748aa8',       // Steel panel rivet dots
  girder: '#2a3748',          // Ceiling girder trusses
  ceilingLight: '#e8f4fc',    // Overhead fluorescent tube
  labFloor: '#546377',        // Industrial concrete/slate steel floor
  floorTileLight: '#65768c',  // Floor tile bevel highlight
  gridLine: '#364353',        // Floor tile grout line
  cautionYellow: '#ffd166',   // High-vis hazard yellow
  cautionBlack: '#1c2430',    // Hazard black
  consoleBody: '#263446',     // Dexter mainframe console chassis
  consoleBevel: '#3c4e66',    // Console highlight bevel
  screenOscillo: '#121d2a',   // CRT screen frame
  screenGreen: '#39ff14',     // Dexter radioactive green oscilloscope waveform
  doorPlate: '#40516b',       // Titanium slate blast door plate
  doorPlateLight: '#536785',  // Blast door beveled armor panel
  doorBevel: '#233040',       // Blast door seam seal
  doorBrace: '#2e3d50',       // Horizontal structural reinforcement rib
  cyan: '#00f5d4',
  gold: '#ffd166',
  crimson: '#ff2a5f',
  white: '#ffffff',
  nightSky: '#040612',        // Outer night sky revealed through doors
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

    const floorY = Math.round(H * 0.70);

    // 1. Dexter's Lab Cool Slate-Blue Modular Wall Background
    const wallGrad = c.createLinearGradient(0, 0, 0, floorY);
    wallGrad.addColorStop(0, C.labWallTop);
    wallGrad.addColorStop(1, C.labWallBot);
    c.fillStyle = wallGrad;
    c.fillRect(0, 0, W, floorY);

    // Modular Wall Panel Seams & Rivets (Dexter Lab Clean Architecture)
    for (let px = cx - 80; px <= cx + 80; px += 40) {
      if (px > 24 && px < W - 24) {
        c.strokeStyle = C.wallPanelGrout;
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(px, 12); c.lineTo(px, floorY); c.stroke();
        c.strokeStyle = C.wallPanelBevel;
        c.beginPath(); c.moveTo(px + 1, 12); c.lineTo(px + 1, floorY); c.stroke();

        c.fillStyle = C.wallRivet;
        for (let ry = 20; ry < floorY; ry += 24) {
          c.fillRect(px - 2, ry, 2, 2);
          c.fillRect(px + 2, ry, 2, 2);
        }
      }
    }

    // Overhead Ceiling Girder & Fluorescent Light Fixture
    c.fillStyle = C.girder;
    c.fillRect(0, 0, W, 12);
    c.fillStyle = '#1c2532';
    c.fillRect(0, 10, W, 2);
    // Fluorescent Tube Fixture
    c.fillStyle = C.ceilingLight;
    c.fillRect(cx - 38, 3, 76, 5);
    // Downward Soft Fluorescent Light Cone Illuminating Bay
    c.save();
    c.fillStyle = 'rgba(230, 246, 255, 0.08)';
    c.beginPath();
    c.moveTo(cx - 34, 8); c.lineTo(cx + 34, 8);
    c.lineTo(cx + 64, floorY); c.lineTo(cx - 64, floorY);
    c.fill();
    c.restore();

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
      c.fillRect(cx - doorGap, 0, doorGap * 2, floorY + 4);

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

    // Heavy Sliding Blast Door Plates (Titanium Slate-Blue with Beveled Armor)
    const leftDoorRight = Math.max(0, cx - doorGap);
    const rightDoorLeft = cx + doorGap;
    if (leftDoorRight > 0) {
      c.fillStyle = C.doorPlate;
      c.fillRect(0, 0, leftDoorRight, floorY);
      // Inner beveled armor plate
      if (leftDoorRight > 8) {
        c.fillStyle = C.doorPlateLight;
        c.fillRect(6, 14, leftDoorRight - 12, floorY - 20);
        c.fillStyle = C.doorPlate;
        c.fillRect(8, 16, leftDoorRight - 16, floorY - 24);
      }
      c.strokeStyle = C.doorBevel;
      c.strokeRect(0, 0, leftDoorRight, floorY);
      // Vertical seam seal
      c.fillStyle = '#1e2836';
      c.fillRect(leftDoorRight - 3, 0, 3, floorY);
    }
    if (rightDoorLeft < W) {
      c.fillStyle = C.doorPlate;
      c.fillRect(rightDoorLeft, 0, W - rightDoorLeft, floorY);
      // Inner beveled armor plate
      if (W - rightDoorLeft > 8) {
        c.fillStyle = C.doorPlateLight;
        c.fillRect(rightDoorLeft + 6, 14, W - rightDoorLeft - 12, floorY - 20);
        c.fillStyle = C.doorPlate;
        c.fillRect(rightDoorLeft + 8, 16, W - rightDoorLeft - 16, floorY - 24);
      }
      c.strokeStyle = C.doorBevel;
      c.strokeRect(rightDoorLeft, 0, W - rightDoorLeft, floorY);
      // Vertical seam seal
      c.fillStyle = '#1e2836';
      c.fillRect(rightDoorLeft, 0, 3, floorY);
    }

    // Door horizontal structural braces & hydraulic lock bolts
    c.strokeStyle = C.doorBrace;
    c.lineWidth = 1;
    for (let py = 32; py < floorY - 10; py += 28) {
      if (leftDoorRight > 0) {
        c.beginPath(); c.moveTo(0, py); c.lineTo(leftDoorRight - 3, py); c.stroke();
        c.fillStyle = C.gold;
        c.fillRect(leftDoorRight - 6, py - 2, 3, 5);
      }
      if (rightDoorLeft < W) {
        c.beginPath(); c.moveTo(rightDoorLeft + 3, py); c.lineTo(W, py); c.stroke();
        c.fillStyle = C.gold;
        c.fillRect(rightDoorLeft + 3, py - 2, 3, 5);
      }
    }

    // 3. Dexter-Style Secret Lab Consoles, Oscilloscope & Mainframes
    // (a) Left Wall: Computer Mainframe & Dancing Green Oscilloscope (x = 0..24)
    c.fillStyle = C.consoleBody;
    c.fillRect(0, 14, 24, floorY - 14);
    c.strokeStyle = C.consoleBevel;
    c.strokeRect(0, 14, 24, floorY - 14);

    // Green CRT Oscilloscope Screen
    c.fillStyle = C.screenOscillo;
    c.fillRect(3, 18, 18, 16);
    c.strokeStyle = '#0a121c';
    c.strokeRect(3, 18, 18, 16);
    // Dancing green sine waveform
    c.strokeStyle = C.screenGreen;
    c.lineWidth = 1;
    c.beginPath();
    for (let ox = 4; ox <= 20; ox++) {
      const oy = 26 + Math.round(Math.sin((ox + this.time * 0.01) * 0.6) * 4);
      if (ox === 4) c.moveTo(ox, oy);
      else c.lineTo(ox, oy);
    }
    c.stroke();

    // Blinking LED status indicator bank
    for (let r = 0; r < 4; r++) {
      const ly = 38 + r * 14;
      const onCyan = (Math.floor(this.time / 280 + r) % 2 === 0);
      c.fillStyle = onCyan ? C.cyan : '#0d3230';
      c.fillRect(4, ly, 6, 4);
      const onGold = (Math.floor(this.time / 340 + r) % 2 === 0);
      c.fillStyle = onGold ? C.gold : '#382a10';
      c.fillRect(14, ly, 6, 4);
    }

    // (b) Right Wall: Diagnostics Rack & Bubbling Coolant Conduit (x = W - 24..W)
    c.fillStyle = C.consoleBody;
    c.fillRect(W - 24, 14, 24, floorY - 14);
    c.strokeStyle = C.consoleBevel;
    c.strokeRect(W - 24, 14, 24, floorY - 14);

    // Vertical Glass Coolant Conduit Tube
    c.fillStyle = 'rgba(0, 245, 212, 0.25)';
    c.fillRect(W - 20, 18, 8, floorY - 36);
    c.strokeStyle = C.cyan;
    c.strokeRect(W - 20, 18, 8, floorY - 36);
    // Rising bubbles in tube
    for (let b = 0; b < 4; b++) {
      const by = Math.round(floorY - 22 - ((this.time * 0.04 + b * 22) % (floorY - 42)));
      c.fillStyle = C.white;
      c.fillRect(W - 17, by, 2, 2);
    }

    // Power Level Bar Graph (Scales with timer progress!)
    const numBars = 6;
    const filledBars = Math.round(p * numBars);
    for (let b = 0; b < numBars; b++) {
      const by = floorY - 24 - b * 10;
      const isFilled = (numBars - 1 - b) < filledBars;
      c.fillStyle = isFilled ? C.cyan : '#12242e';
      c.fillRect(W - 9, by, 6, 6);
    }

    // 4. Solid Industrial Slate Floor (STATIONARY!)
    c.fillStyle = C.labFloor;
    c.fillRect(0, floorY, W, H - floorY);

    // Hazard Caution Perimeter Line on Floor (Yellow & Black Stripes)
    for (let hx = 0; hx < W; hx += 16) {
      c.fillStyle = C.cautionYellow;
      c.fillRect(hx, floorY, 8, 3);
      c.fillStyle = C.cautionBlack;
      c.fillRect(hx + 8, floorY, 8, 3);
    }

    // Steel Floor Tile Gridlines with Highlight Bevels
    for (let gy = floorY + 12; gy < H; gy += 14) {
      c.strokeStyle = C.gridLine;
      c.beginPath(); c.moveTo(0, gy); c.lineTo(W, gy); c.stroke();
      c.strokeStyle = C.floorTileLight;
      c.beginPath(); c.moveTo(0, gy + 1); c.lineTo(W, gy + 1); c.stroke();
    }
    for (let gx = 20; gx < W; gx += 26) {
      c.strokeStyle = C.gridLine;
      c.beginPath(); c.moveTo(gx, floorY); c.lineTo(gx, H);
      c.stroke();
      c.strokeStyle = C.floorTileLight;
      c.beginPath(); c.moveTo(gx + 1, floorY); c.lineTo(gx + 1, H);
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
    c.strokeStyle = C.consoleBevel;
    c.strokeRect(W - 76, 8, 70, 28);
    c.fillStyle = 'rgba(38, 52, 70, 0.90)';
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
