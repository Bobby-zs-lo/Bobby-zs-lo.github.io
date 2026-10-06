/**
 * AlchemyScene – Chrono-Warp: Living Eras & The Celestial Reverse Hourglass.
 *
 * An epic cosmic astrolabe hourglass that flows in REVERSE, rewinding entropy and
 * journeying backward through Earth's history before culminating in the ultimate
 * genesis of space-time: THE BIG BANG!
 *
 * Grand Visual Components:
 *   - The Celestial Astrolabe Hourglass:
 *     - Ornate 16-bit brass & crystal frame with sun & moon filigree finials.
 *     - 3D rotating Astrolabe / Armillary rings projected around the waist,
 *       spinning counter-clockwise with zodiac tick markers.
 *     - Interlocking brass clockwork gears ticking in reverse.
 *     - Translucent crystal bulbs with specular highlights & glowing caustics.
 *     - Quantum stardust vortex: Sand swirls in the bottom bulb, surges upward
 *       through the neck as a pulsating celestial plasma geyser, and gathers in
 *       the top bulb forming a glowing proto-galaxy.
 *
 *   - Living Animated Historical Eras (Rich Cinematic Dioramas):
 *     - 0.00 .. 0.20: Cyberpunk Neo-Tokyo 2026 AD
 *       Layered neon skyline, flashing holographic billboards, sleek spinners
 *       zooming backwards with cyan/magenta ion trails, reverse matrix code rain.
 *     - 0.20 .. 0.40: Victorian London 1888 AD
 *       Gaslit street fog, Big Ben with counter-clockwise spinning clock hands,
 *       iron 4-4-0 steam express chugging in reverse across arched brick viaduct,
 *       billowing coal smoke puffs and pumping drive pistons.
 *     - 0.40 .. 0.60: Ancient Egypt 2500 BC
 *       Radiant Sun of Ra with solar rays, shining Great Pyramids with glowing
 *       electrum gold capstones, Great Sphinx with flickering fire braziers,
 *       Nile river with sailing felucca boat and swaying date palms, royal camel
 *       caravan trekking across undulating dunes.
 *     - 0.60 .. 0.80: Jurassic Primeval 150M BC
 *       Active smoking volcano with glowing molten caldera and flowing lava veins,
 *       flapping pterodactyls soaring across fiery skies, long-necked brachiosaur,
 *       and a roaring stomping T-Rex with snapping fangs and amber eye!
 *     - 0.80 .. 0.95: Primordial Hadean Earth 4.5B BC
 *       Boiling molten magma ocean with surging lava waves, bursting bubbles,
 *       and continuous fiery bolide meteors crashing with impact sparks!
 *     - 0.95 .. 1.00: Cosmic Singularity Collapse (T -> 0)
 *       Reality gravitational lensing, violent structural vibration, crackling
 *       white-blue glass fissures, and hyper-dense quantum core.
 *
 *   - The Grand Finale (0:00): Cosmic Glass Shatter & THE BIG BANG!
 *     The celestial hourglass shatters into spinning prismatic crystal shards,
 *     triggering a screen-filling multi-spectral Big Bang inflation flash,
 *     concentric relativistic shockwaves, expanding spiral nebula, and the
 *     cosmic dawn of newborn galaxies and stars.
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
  cyberDark: '#070514',
  victorianSepia: '#1c1410',
  egyptGold: '#281706',
  jurassicGreen: '#0d180d',
  primordialRed: '#260408',
  spaceBlack: '#020008',
  brassGold: '#ffd166',
  brassDark: '#aa820a',
  brassLight: '#ffe082',
  cyan: '#00f5d4',
  magenta: '#ff007f',
  white: '#ffffff',
  sand: '#ffe082',
  lavaOrange: '#ff5500',
  lavaYellow: '#ffee33',
};

export class AlchemyScene extends Scene {
  constructor(ctx, assets, opts) {
    super(ctx, assets, opts);
    this.time = 0;
    this.progress = 0;
    this.remainingMs = 0;

    this.cx = 120;
    this.cy = 92;

    // Visual effect particle pools
    this.reverseGrains = [];
    this.cosmicSparks = [];
    this.risingRain = [];
    this.steamPuffs = [];
    this.fireSparks = [];
    this.crystalShards = [];
    this.meteorTrail = [];

    // Living epoch positions & anim states
    this.hoverCar1X = 260;
    this.hoverCar2X = -50;
    this.trainX = 280;
    this.trainPistonAngle = 0;
    this.camelX = -40;
    this.pteroX = -50;
    this.meteorX = 240;
    this.meteorY = -40;
    this.volcanoEruptTimer = 0;

    // Finale state
    this.finaleActive = false;
    this.finaleElapsed = 0;
    this.sfxPlayedBang = false;
    this.shardsSpawned = false;

    this._initParticles();
  }

  _initParticles() {
    this.reverseGrains = [];
    for (let i = 0; i < 36; i++) {
      this.reverseGrains.push({
        x: this.cx + (Math.random() - 0.5) * 12,
        y: this.cy + 10 + Math.random() * 26,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -0.12 - Math.random() * 0.16,
        life: 0.5 + Math.random() * 0.5,
        color: Math.random() < 0.6 ? C.brassGold : (Math.random() < 0.85 ? C.cyan : C.white),
      });
    }

    this.risingRain = [];
    for (let i = 0; i < 24; i++) {
      this.risingRain.push({
        x: Math.random() * 240,
        y: Math.random() * 240,
        speed: 0.25 + Math.random() * 0.45,
        charH: 3 + Math.floor(Math.random() * 5),
        color: Math.random() < 0.7 ? 'rgba(0, 245, 212, 0.45)' : 'rgba(255, 0, 127, 0.45)',
      });
    }

    this.steamPuffs = [];
    this.fireSparks = [];
    this.crystalShards = [];
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
    this.steamPuffs = [];
    this.fireSparks = [];
    this.crystalShards = [];
    this.hoverCar1X = this.W + 40;
    this.hoverCar2X = -60;
    this.trainX = this.W + 60;
    this.trainPistonAngle = 0;
    this.camelX = -40;
    this.pteroX = -50;
    this.meteorX = this.W + 20;
    this.meteorY = -40;
    this.finaleActive = false;
    this.finaleElapsed = 0;
    this.sfxPlayedBang = false;
    this.shardsSpawned = false;
  }

  update(progress, dtMs, remainingMs) {
    this.time += dtMs;
    this.progress = clampN(progress, 0, 1);
    this.remainingMs = remainingMs;

    const era = chronoEra(this.progress);

    // 1. Upward Quantum Sand Geyser
    if (this.progress < 0.96) {
      if (Math.random() < 0.5) {
        this.reverseGrains.push({
          x: this.cx + (Math.random() - 0.5) * 10,
          y: this.cy + 24 + Math.random() * 6,
          vx: (Math.random() - 0.5) * 0.3,
          vy: -0.14 - Math.random() * 0.18,
          life: 1.0,
          color: Math.random() < 0.65 ? C.brassGold : (Math.random() < 0.85 ? C.cyan : C.white),
        });
      }
    }

    for (let i = this.reverseGrains.length - 1; i >= 0; i--) {
      const g = this.reverseGrains[i];
      g.x += g.vx * (dtMs / 16.6);
      g.y += g.vy * dtMs;
      g.life -= 0.002 * dtMs;
      // Neck funneling effect: squeeze toward center x when near cy
      if (Math.abs(g.y - this.cy) < 14) {
        g.x += (this.cx - g.x) * 0.15;
      }
      if (g.life <= 0 || g.y < this.cy - 30) {
        this.reverseGrains.splice(i, 1);
      }
    }

    // 2. Epoch 1 (Cyberpunk): Spinners in reverse & rising digital code rain
    if (era === 'modern_cyber') {
      this.hoverCar1X -= 0.08 * dtMs;
      if (this.hoverCar1X < -50) this.hoverCar1X = this.W + 50;

      this.hoverCar2X += 0.095 * dtMs;
      if (this.hoverCar2X > this.W + 50) this.hoverCar2X = -50;

      for (const r of this.risingRain) {
        r.y -= r.speed * dtMs;
        if (r.y < 0) {
          r.y = this.H;
          r.x = Math.random() * this.W;
        }
      }
    }

    // 3. Epoch 2 (Victorian): Steam train chugging in reverse & billowing coal smoke
    if (era === 'victorian_steam') {
      this.trainX -= 0.05 * dtMs;
      if (this.trainX < -90) this.trainX = this.W + 70;
      this.trainPistonAngle -= 0.015 * dtMs;

      // Emit volumetric coal smoke puffs from locomotive chimney
      if (Math.random() < 0.25) {
        this.steamPuffs.push({
          x: this.trainX + 18,
          y: this.H - 52,
          vx: 0.02 + Math.random() * 0.03, // drifts forward as train moves back
          vy: -0.04 - Math.random() * 0.04,
          r: 3 + Math.random() * 2,
          alpha: 0.65,
        });
      }
    }

    for (let i = this.steamPuffs.length - 1; i >= 0; i--) {
      const sp = this.steamPuffs[i];
      sp.x += sp.vx * dtMs;
      sp.y += sp.vy * dtMs;
      sp.r += 0.008 * dtMs;
      sp.alpha -= 0.0012 * dtMs;
      if (sp.alpha <= 0) this.steamPuffs.splice(i, 1);
    }

    // 4. Epoch 3 (Egypt): Desert Camel caravan stride & Brazier fire sparks
    if (era === 'ancient_egypt') {
      this.camelX += 0.032 * dtMs;
      if (this.camelX > this.W + 40) this.camelX = -45;

      // Flickering fire sparks from Sphinx braziers
      if (Math.random() < 0.35) {
        this.fireSparks.push({
          x: 48 + (Math.random() - 0.5) * 4,
          y: this.H - 42,
          vx: (Math.random() - 0.5) * 0.3,
          vy: -0.06 - Math.random() * 0.06,
          life: 1.0,
          color: Math.random() < 0.5 ? C.lavaOrange : C.lavaYellow,
        });
      }
    }

    for (let i = this.fireSparks.length - 1; i >= 0; i--) {
      const f = this.fireSparks[i];
      f.x += f.vx * (dtMs / 16.6);
      f.y += f.vy * dtMs;
      f.life -= 0.003 * dtMs;
      if (f.life <= 0) this.fireSparks.splice(i, 1);
    }

    // 5. Epoch 4 (Jurassic): Pterodactyl soaring flight & T-Rex stride
    if (era === 'jurassic_dinosaurs') {
      this.pteroX += 0.055 * dtMs;
      if (this.pteroX > this.W + 50) this.pteroX = -50;
      this.volcanoEruptTimer += dtMs;
    }

    // 6. Epoch 5 (Primordial): Fiery meteor shower crashing into magma
    if (era === 'primordial_earth') {
      this.meteorX -= 0.16 * dtMs;
      this.meteorY += 0.13 * dtMs;
      if (this.meteorY > this.H - 24) {
        // Crash into magma sea: explosive splash sparks
        for (let j = 0; j < 8; j++) {
          this.fireSparks.push({
            x: this.meteorX + 16,
            y: this.H - 22,
            vx: (Math.random() - 0.5) * 1.5,
            vy: -0.8 - Math.random() * 1.2,
            life: 1.0,
            color: Math.random() < 0.5 ? C.lavaYellow : C.lavaOrange,
          });
        }
        // Respawn next meteor
        this.meteorX = this.W + 20 + Math.random() * 60;
        this.meteorY = -40 - Math.random() * 40;
      }
    }

    // 7. Finale (The Big Bang Explosion)
    if (this.finaleActive) {
      this.finaleElapsed += dtMs;

      // Phase 1 -> Phase 2 Detonation
      if (this.finaleElapsed >= CHRONO_BANG_MS && !this.sfxPlayedBang) {
        this.sfxPlayedBang = true;
        audio.sfx('win');
        audio.sfx('magic');

        // Spawn flying shattered crystal shards & frame debris
        this._spawnGlassShards();

        // Explosive burst of cosmic inflation particles
        for (let i = 0; i < 70; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 1.0 + Math.random() * 5.2;
          this.cosmicSparks.push({
            x: this.cx,
            y: this.cy,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            alpha: 1.0,
            size: 1 + Math.floor(Math.random() * 3),
            color: (Math.random() < 0.35) ? C.brassGold : (Math.random() < 0.70 ? C.cyan : (Math.random() < 0.85 ? C.magenta : C.white)),
          });
        }
      }

      // Update flying shards
      for (let i = this.crystalShards.length - 1; i >= 0; i--) {
        const sh = this.crystalShards[i];
        sh.x += sh.vx * (dtMs / 16.6);
        sh.y += sh.vy * (dtMs / 16.6);
        sh.angle += sh.vRot * (dtMs / 16.6);
        sh.alpha -= 0.0035 * (dtMs / 16.6);
        if (sh.alpha <= 0) this.crystalShards.splice(i, 1);
      }

      // Update cosmic sparks
      for (let i = this.cosmicSparks.length - 1; i >= 0; i--) {
        const s = this.cosmicSparks[i];
        s.x += s.vx * (dtMs / 16.6);
        s.y += s.vy * (dtMs / 16.6);
        s.alpha -= 0.007 * (dtMs / 16.6);
        if (s.alpha <= 0) this.cosmicSparks.splice(i, 1);
      }
    }
  }

  _spawnGlassShards() {
    if (this.shardsSpawned) return;
    this.shardsSpawned = true;
    const shardNames = ['crystal_shard0', 'crystal_shard1', 'crystal_shard2', 'crystal_shard3'];
    for (let i = 0; i < 20; i++) {
      const ang = (i / 20) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const spd = 1.8 + Math.random() * 3.6;
      this.crystalShards.push({
        x: this.cx + (Math.random() - 0.5) * 16,
        y: this.cy + (Math.random() - 0.5) * 24,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        angle: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.25,
        alpha: 1.0,
        sprite: shardNames[i % shardNames.length],
      });
    }
  }

  onMilestone(i, total) {
    audio.sfx('magic');
    for (let j = 0; j < 18; j++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 0.5 + Math.random() * 2.5;
      this.cosmicSparks.push({
        x: this.cx,
        y: this.cy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
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

    // 1. Living Historical Era Background & Animated Diorama
    this._renderHistoricalEra(c, W, H, era);

    // 2. The Celestial Astrolabe Hourglass (Grand Ornate Relic)
    const isShattered = this.finaleActive && this.finaleElapsed >= CHRONO_BANG_MS;
    if (!isShattered) {
      // Screen shake during Singularity collapse right before bang
      let shakeX = 0, shakeY = 0;
      if (this.finaleActive && this.finaleElapsed < CHRONO_BANG_MS) {
        const shakeInt = (this.finaleElapsed / CHRONO_BANG_MS) * 4;
        shakeX = (Math.random() - 0.5) * shakeInt;
        shakeY = (Math.random() - 0.5) * shakeInt;
      }
      this._renderHourglass(c, cx + shakeX, cy + shakeY, topF, botF, p);
    }

    // 3. Shattered Flying Crystal Shards
    if (this.crystalShards.length > 0) {
      this._renderShards(c);
    }

    // 4. The Big Bang Finale Multi-spectral Flash & Expanding Universe
    if (this.finaleActive) {
      this._renderBigBangFinale(c, cx, cy);
    }

    // 5. Era HUD Plaque (Year & Age indicator)
    this._renderEraHUD(c, W, era, p);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 1. LIVING HISTORICAL ERAS DIORAMA
  // ════════════════════════════════════════════════════════════════════════════
  _renderHistoricalEra(c, W, H, era) {
    if (era === 'modern_cyber') {
      // 2026 AD: Cyberpunk Neo-Tokyo with Layered Neon Skyline & Flying Spinners
      const grad = c.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#060312');
      grad.addColorStop(0.65, '#16092b');
      grad.addColorStop(1, '#080514');
      c.fillStyle = grad;
      c.fillRect(0, 0, W, H);

      // Layer 1: Distant dark towers
      c.fillStyle = '#0c0b20';
      c.fillRect(10, H - 110, 36, 110);
      c.fillRect(60, H - 130, 42, 130);
      c.fillRect(W - 90, H - 120, 38, 120);
      c.fillRect(W - 42, H - 95, 34, 95);

      // Layer 2: Midground illuminated mega-skyscrapers
      c.fillStyle = '#141434';
      c.fillRect(24, H - 85, 32, 85);
      c.fillRect(W - 75, H - 80, 36, 80);
      c.fillRect(Math.floor(W / 2) - 18, H - 65, 36, 65);

      // Window lights
      c.fillStyle = C.cyan;
      c.fillRect(16, H - 95, 2, 2);
      c.fillRect(28, H - 75, 2, 2);
      c.fillRect(72, H - 115, 2, 2);
      c.fillRect(W - 82, H - 105, 2, 2);
      c.fillRect(W - 65, H - 60, 2, 2);
      c.fillStyle = C.magenta;
      c.fillRect(32, H - 60, 2, 2);
      c.fillRect(78, H - 90, 2, 2);
      c.fillRect(W - 32, H - 75, 2, 2);
      c.fillStyle = C.brassGold;
      c.fillRect(18, H - 45, 2, 2);
      c.fillRect(W - 70, H - 45, 2, 2);

      // Neon Holographic Billboards on rooftop
      blit(c, this.assets, 'hologram_ad1', 14, H - 115, 1);
      blit(c, this.assets, 'hologram_ad2', W - 46, H - 112, 1);

      // High-Speed Hover Cruisers zooming in reverse
      // Cruiser 1: Flying leftward (upper lane)
      const car1Y = 56 + Math.sin(this.time * 0.003) * 5;
      blit(c, this.assets, 'hover_car', Math.round(this.hoverCar1X), Math.round(car1Y), 1);
      // Ion jet trail
      c.fillStyle = 'rgba(255, 0, 127, 0.55)';
      c.fillRect(Math.round(this.hoverCar1X) + 36, Math.round(car1Y) + 6, 18, 2);

      // Cruiser 2: Flying rightward (lower lane)
      const car2Y = H - 54 + Math.sin(this.time * 0.004 + 2) * 4;
      blit(c, this.assets, 'hover_car2', Math.round(this.hoverCar2X), Math.round(car2Y), 1);
      c.fillStyle = 'rgba(0, 245, 212, 0.55)';
      c.fillRect(Math.round(this.hoverCar2X) - 14, Math.round(car2Y) + 5, 14, 2);

      // Reverse Matrix Code Rain streaming UPWARD
      for (const r of this.risingRain) {
        c.fillStyle = r.color;
        c.fillRect(Math.round(r.x), Math.round(r.y), 1, r.charH);
      }

      // Wet Reflective Asphalt Street floor
      c.fillStyle = '#080510';
      c.fillRect(0, H - 18, W, 18);
      c.fillStyle = 'rgba(0, 245, 212, 0.2)';
      c.fillRect(14, H - 14, 34, 4);
      c.fillStyle = 'rgba(255, 0, 127, 0.2)';
      c.fillRect(W - 74, H - 10, 40, 4);

    } else if (era === 'victorian_steam') {
      // 1888 AD: Victorian London Fog, Big Ben & Reverse Steam Express
      const grad = c.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#1a1310');
      grad.addColorStop(0.65, '#2e1e16');
      grad.addColorStop(1, '#18120d');
      c.fillStyle = grad;
      c.fillRect(0, 0, W, H);

      // Big Ben Gothic Tower (Left side)
      c.fillStyle = '#261b14';
      c.fillRect(16, H - 110, 28, 110);
      c.beginPath();
      c.moveTo(12, H - 110); c.lineTo(30, H - 134); c.lineTo(48, H - 110);
      c.fill();
      // Illuminated Clockface
      c.fillStyle = '#fffae0';
      c.beginPath();
      c.arc(30, H - 98, 9, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#5a3d24';
      c.lineWidth = 1;
      c.stroke();
      // Clock hands spinning BACKWARDS rapidly
      const clockAng = -this.time * 0.012;
      c.strokeStyle = '#000000';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(30, H - 98);
      c.lineTo(30 + Math.cos(clockAng) * 6, (H - 98) + Math.sin(clockAng) * 6);
      c.stroke();
      c.beginPath();
      c.moveTo(30, H - 98);
      c.lineTo(30 + Math.cos(clockAng * 0.1) * 4, (H - 98) + Math.sin(clockAng * 0.1) * 4);
      c.stroke();

      // Arched Brick Viaduct Bridge spanning across screen
      const bridgeY = H - 38;
      c.fillStyle = '#3a251a';
      c.fillRect(0, bridgeY, W, 8);
      // Brick arch pillars
      for (let ax = 20; ax < W; ax += 48) {
        c.fillRect(ax - 5, bridgeY + 8, 10, 30);
      }
      c.fillStyle = '#261710';
      c.fillRect(0, bridgeY + 7, W, 2); // Steel rail

      // Steam Train & Passenger Coach chugging in REVERSE
      const trainX = Math.round(this.trainX);
      blit(c, this.assets, 'steam_train', trainX, bridgeY - 26, 1, true);
      blit(c, this.assets, 'carriage', trainX + 54, bridgeY - 20, 1, true);

      // Volumetric Coal Smoke Puffs swirling backwards
      for (const sp of this.steamPuffs) {
        c.fillStyle = `rgba(215, 205, 195, ${sp.alpha})`;
        c.beginPath();
        c.arc(Math.round(sp.x), Math.round(sp.y), sp.r, 0, Math.PI * 2);
        c.fill();
      }

      // Gaslit London street lamps at bottom
      for (const lx of [8, W - 14]) {
        c.fillStyle = '#1c1510';
        c.fillRect(lx, H - 24, 3, 24);
        c.fillStyle = '#ffd166';
        c.fillRect(lx - 2, H - 28, 7, 5);
        // Warm gas glow
        c.fillStyle = 'rgba(255, 209, 102, 0.2)';
        c.beginPath();
        c.arc(lx + 1, H - 26, 8, 0, Math.PI * 2);
        c.fill();
      }

    } else if (era === 'ancient_egypt') {
      // 2500 BC: Ancient Egypt, Great Pyramids, Sphinx & Camel Caravan
      const grad = c.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#241204');
      grad.addColorStop(0.55, '#5c2d0b');
      grad.addColorStop(1, '#8c5918');
      c.fillStyle = grad;
      c.fillRect(0, 0, W, H);

      // Golden Sun of Ra with solar rays
      const sunX = W - 36, sunY = 62;
      c.fillStyle = '#ffb300';
      c.beginPath();
      c.arc(sunX, sunY, 18, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#ffe066';
      c.beginPath();
      c.arc(sunX, sunY, 12, 0, Math.PI * 2);
      c.fill();
      // Sun rays
      c.strokeStyle = 'rgba(255, 224, 102, 0.25)';
      c.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const rayA = (i / 8) * Math.PI * 2 + this.time * 0.001;
        c.beginPath();
        c.moveTo(sunX + Math.cos(rayA) * 20, sunY + Math.sin(rayA) * 20);
        c.lineTo(sunX + Math.cos(rayA) * 34, sunY + Math.sin(rayA) * 34);
        c.stroke();
      }

      // Great Pyramid with radiant gold electrum capstone
      blit(c, this.assets, 'pyramid', 12, H - 54, 1);
      blit(c, this.assets, 'pyramid_small', W - 62, H - 44, 1);

      // The Great Sphinx
      blit(c, this.assets, 'sphinx', 66, H - 38, 1);

      // Glowing Fire Braziers flanking the Sphinx
      c.fillStyle = '#aa820a';
      c.fillRect(60, H - 24, 4, 10);
      c.fillRect(108, H - 24, 4, 10);
      c.fillStyle = C.lavaOrange;
      c.fillRect(59, H - 26, 6, 3);
      c.fillRect(107, H - 26, 6, 3);
      // Brazier flame sparks
      for (const f of this.fireSparks) {
        c.fillStyle = f.color;
        c.fillRect(Math.round(f.x), Math.round(f.y), 2, 2);
      }

      // Shimmering Nile River
      c.fillStyle = '#1a3b5c';
      c.fillRect(0, H - 18, W, 18);
      c.fillStyle = '#2b659c';
      c.fillRect(0, H - 19, W, 2);
      // Felucca Sailboat sailing along Nile
      const feluccaX = (this.time * 0.015) % (W + 60) - 30;
      blit(c, this.assets, 'felucca', Math.round(feluccaX), H - 32, 1);

      // Date Palm Trees along the riverbank
      blit(c, this.assets, 'palm_tree', W - 32, H - 46, 1);

      // Undulating Sand Dunes Foreground & Walking Royal Camel
      c.fillStyle = '#b8860b';
      c.beginPath();
      c.moveTo(0, H - 14);
      c.bezierCurveTo(45, H - 22, 120, H - 8, W, H - 16);
      c.lineTo(W, H); c.lineTo(0, H);
      c.fill();

      // Royal Camel Caravan trekking across the desert
      blit(c, this.assets, 'camel', Math.round(this.camelX), H - 28, 1);

    } else if (era === 'jurassic_dinosaurs') {
      // 150M BC: Jurassic Jungle, Erupting Volcano, Roaring T-Rex & Pterodactyl
      const grad = c.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#1c160a');
      grad.addColorStop(0.55, '#38220f');
      grad.addColorStop(1, '#112211');
      c.fillStyle = grad;
      c.fillRect(0, 0, W, H);

      // Erupting Volcano in background (Mt. Doom)
      blit(c, this.assets, 'volcano', W - 72, H - 64, 1);
      // Volcanic smoke plume rising from caldera
      c.fillStyle = 'rgba(75, 45, 35, 0.55)';
      const smkY = (this.time * 0.03) % 40;
      c.beginPath();
      c.arc(W - 42, H - 68 - smkY, 12 + smkY * 0.3, 0, Math.PI * 2);
      c.fill();

      // Sauropod Brachiosaurus in midground fern mist
      blit(c, this.assets, 'brachiosaur', Math.floor(W / 2) - 20, H - 52, 1);

      // Primeval Cycad & Fern jungle silhouettes
      c.fillStyle = '#182b18';
      c.fillRect(0, H - 20, W, 20);
      c.beginPath();
      c.moveTo(0, H - 20); c.lineTo(24, H - 38); c.lineTo(48, H - 20);
      c.fill();

      // Soaring Pterodactyl flapping wings across sky
      const pteroY = 46 + Math.sin(this.time * 0.005) * 8;
      const pteroSprite = (Math.sin(this.time * 0.012) > 0) ? 'pterodactyl' : 'pterodactyl_down';
      blit(c, this.assets, pteroSprite, Math.round(this.pteroX), Math.round(pteroY), 1);

      // Terrifying Roaring T-Rex walking along foreground ridge
      const trexSprite = (Math.sin(this.time * 0.008) > 0) ? 'trex_walk1' : 'trex_walk2';
      blit(c, this.assets, trexSprite, 10, H - 54, 1);

    } else if (era === 'primordial_earth') {
      // 4.5B BC: Molten Magma Sea & Fiery Meteor Bombardment
      const grad = c.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#1e0205');
      grad.addColorStop(0.55, '#4a0808');
      grad.addColorStop(1, '#801804');
      c.fillStyle = grad;
      c.fillRect(0, 0, W, H);

      // Jagged black basalt / obsidian rock crags rising from the magma sea
      c.fillStyle = '#16080a';
      c.beginPath();
      c.moveTo(0, H - 24);
      c.lineTo(20, H - 44); c.lineTo(42, H - 24);
      c.lineTo(W - 78, H - 24); c.lineTo(W - 52, H - 50); c.lineTo(W - 24, H - 24);
      c.lineTo(W, H - 24); c.lineTo(W, H); c.lineTo(0, H);
      c.fill();

      // Boiling Magma Ocean
      c.fillStyle = '#d62404';
      c.fillRect(0, H - 24, W, 24);
      c.fillStyle = '#ff8800';
      c.fillRect(0, H - 26, W, 3);
      // Surging lava waves
      for (let wx = 0; wx < W; wx += 24) {
        const waveH = Math.sin(this.time * 0.006 + wx) * 3;
        c.fillStyle = '#ffee33';
        c.fillRect(wx, H - 27 + waveH, 16, 2);
      }

      // Fiery Meteor streaking across sky
      blit(c, this.assets, 'meteor', Math.round(this.meteorX), Math.round(this.meteorY), 1);

      // Fire impact sparks in magma sea
      for (const f of this.fireSparks) {
        c.fillStyle = f.color;
        c.fillRect(Math.round(f.x), Math.round(f.y), 2, 2);
      }

    } else {
      // T = 0: Singularity Pre-Bang (Space collapsed into darkness)
      c.fillStyle = C.spaceBlack;
      c.fillRect(0, 0, W, H);

      // Gravitational lensing rings
      c.strokeStyle = 'rgba(0, 245, 212, 0.35)';
      c.lineWidth = 1;
      const lensR = (this.time * 0.05) % 80;
      c.beginPath();
      c.arc(this.cx, this.cy, lensR, 0, Math.PI * 2);
      c.stroke();
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 2. THE GRAND CELESTIAL ASTROLABE HOURGLASS
  // ════════════════════════════════════════════════════════════════════════════
  _renderHourglass(c, cx, cy, topF, botF, p) {
    c.save();

    // 1. Back Astrolabe Rotating Rings (3D Elliptical Projection Behind Glass)
    this._renderAstrolabeRings(c, cx, cy, true);

    // 2. Interlocking Clockwork Brass Gears near Top & Bottom Plinths
    const gearRot1 = -this.time * 0.002;
    const gearRot2 = this.time * 0.002;
    blit(c, this.assets, 'gear_small', cx - 26, cy - 42, 1);
    blit(c, this.assets, 'gear_med', cx + 10, cy + 22, 1);

    // 3. Ornate Brass & Crystal Hourglass Frame (64x92)
    blit(c, this.assets, 'hourglass_frame', cx - 32, cy - 46, 1);

    // 4. Glass Bulbs & Reverse Quantum Sand
    // Bottom bulb (drains from 1 to 0 as time winds backward!)
    if (botF > 0.03) {
      const fillH = Math.round(botF * 24);
      // Outer amber glow
      c.fillStyle = '#b8860b';
      c.beginPath();
      c.moveTo(cx - 5, cy + 6);
      c.lineTo(cx + 5, cy + 6);
      c.lineTo(cx + 17, (cy + 6) + fillH);
      c.lineTo(cx - 17, (cy + 6) + fillH);
      c.closePath();
      c.fill();

      // Inner golden core
      c.fillStyle = C.brassGold;
      c.beginPath();
      c.moveTo(cx - 3, cy + 8);
      c.lineTo(cx + 3, cy + 8);
      c.lineTo(cx + 14, (cy + 6) + fillH);
      c.lineTo(cx - 14, (cy + 6) + fillH);
      c.closePath();
      c.fill();
    }

    // Top bulb (fills up from 0 to 1 as time winds backward!)
    if (topF > 0.03) {
      const fillH = Math.round(topF * 24);
      c.fillStyle = '#d4af37';
      c.beginPath();
      c.moveTo(cx - 17, (cy - 6) - fillH);
      c.lineTo(cx + 17, (cy - 6) - fillH);
      c.lineTo(cx + 5, cy - 6);
      c.lineTo(cx - 5, cy - 6);
      c.closePath();
      c.fill();

      // Top glowing stellar corona
      c.fillStyle = C.brassLight;
      c.beginPath();
      c.moveTo(cx - 14, (cy - 6) - fillH);
      c.lineTo(cx + 14, (cy - 6) - fillH);
      c.lineTo(cx + 4, cy - 6);
      c.lineTo(cx - 4, cy - 6);
      c.closePath();
      c.fill();
    }

    // Upward Flowing Quantum Stardust Stream through Waist
    c.fillStyle = C.cyan;
    c.fillRect(cx - 1, cy - 14, 2, 28);
    c.fillStyle = C.white;
    c.fillRect(cx, cy - 10, 1, 20);

    // Stardust Grains streaming upward
    for (const g of this.reverseGrains) {
      c.fillStyle = g.color;
      c.fillRect(Math.round(g.x), Math.round(g.y), 2, 2);
    }

    // Singularity Core at T = 0
    if (p >= 0.95) {
      blit(c, this.assets, 'singularity', cx - 14, cy - 14, 1);
    }

    // 5. Front Astrolabe Rotating Rings (3D Elliptical Projection in Front of Glass)
    this._renderAstrolabeRings(c, cx, cy, false);

    // Glass specular reflection highlights
    c.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(cx - 16, cy - 36); c.lineTo(cx - 8, cy - 12);
    c.stroke();
    c.beginPath();
    c.moveTo(cx - 16, cy + 36); c.lineTo(cx - 8, cy + 12);
    c.stroke();

    c.restore();
  }

  _renderAstrolabeRings(c, cx, cy, isBack) {
    // Rotating Armillary / Astrolabe rings projected in 3D around waist
    const ang = -this.time * 0.0018;
    const rX = 30;
    const rY = 9;

    c.save();
    c.lineWidth = 1.5;

    // Ring 1: Primary Equatorial Ring
    c.strokeStyle = isBack ? 'rgba(212, 175, 55, 0.4)' : C.brassGold;
    c.beginPath();
    const startA = isBack ? Math.PI : 0;
    const endA = isBack ? Math.PI * 2 : Math.PI;
    c.ellipse(cx, cy, rX, rY, 0.2, startA, endA);
    c.stroke();

    // Ring 2: Tilted Polar Meridian Ring
    c.strokeStyle = isBack ? 'rgba(0, 245, 212, 0.3)' : C.cyan;
    c.beginPath();
    c.ellipse(cx, cy, rX * 0.85, rY * 1.6, -0.4, startA, endA);
    c.stroke();

    // Rotating astrolabe tick markers on front pass
    if (!isBack) {
      for (let i = 0; i < 4; i++) {
        const tAng = ang + (i / 4) * Math.PI * 2;
        if (Math.sin(tAng) > 0) { // front half
          const tx = cx + Math.cos(tAng) * rX;
          const ty = cy + Math.sin(tAng) * rY;
          c.fillStyle = C.white;
          c.fillRect(Math.round(tx), Math.round(ty), 2, 2);
        }
      }
    }
    c.restore();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 3. SHATTERED CRYSTAL SHARDS & DEBRIS
  // ════════════════════════════════════════════════════════════════════════════
  _renderShards(c) {
    c.save();
    for (const sh of this.crystalShards) {
      c.save();
      c.globalAlpha = sh.alpha;
      c.translate(sh.x, sh.y);
      c.rotate(sh.angle);
      blit(c, this.assets, sh.sprite, -8, -8, 1);
      c.restore();
    }
    c.restore();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 4. THE BIG BANG FINALE MULTI-SPECTRAL FLASH & EXPANDING UNIVERSE
  // ════════════════════════════════════════════════════════════════════════════
  _renderBigBangFinale(c, cx, cy) {
    const elapsed = this.finaleElapsed;
    const scale = bigBangScale(elapsed, 2.2);

    if (scale > 0) {
      c.save();

      // Blinding Multi-Spectral Inflation Flash
      const maxR = Math.max(this.W, this.H) * scale;
      const bbGrad = c.createRadialGradient(cx, cy, 4, cx, cy, Math.max(10, maxR));
      bbGrad.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
      bbGrad.addColorStop(0.25, 'rgba(255, 209, 102, 0.90)');
      bbGrad.addColorStop(0.55, 'rgba(0, 245, 212, 0.65)');
      bbGrad.addColorStop(0.80, 'rgba(255, 0, 127, 0.40)');
      bbGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      c.fillStyle = bbGrad;
      c.beginPath();
      c.arc(cx, cy, Math.max(10, maxR), 0, Math.PI * 2);
      c.fill();

      // Relativistic Concentric Shockwaves
      c.strokeStyle = C.white;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(cx, cy, maxR * 0.75, 0, Math.PI * 2);
      c.stroke();

      c.strokeStyle = C.cyan;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(cx, cy, maxR * 0.50, 0, Math.PI * 2);
      c.stroke();

      c.strokeStyle = C.magenta;
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(cx, cy, maxR * 0.90, 0, Math.PI * 2);
      c.stroke();

      // Expanding Cosmic Nebula Stardust
      for (const s of this.cosmicSparks) {
        c.fillStyle = s.color;
        c.globalAlpha = s.alpha;
        c.fillRect(Math.round(s.x), Math.round(s.y), s.size, s.size);
      }

      // Newborn Spiral Galaxies (Cosmic Dawn Phase)
      if (elapsed > 2000) {
        const dawnAlpha = Math.min(1.0, (elapsed - 2000) / 1200);
        c.globalAlpha = dawnAlpha;
        // Central proto-galaxy core
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.arc(cx, cy, 6, 0, Math.PI * 2);
        c.fill();

        // Twinkling newborn stars across the void
        for (let i = 0; i < 24; i++) {
          const starAng = i * 1.8;
          const starDist = 18 + i * 4.5;
          const sx = cx + Math.cos(starAng) * starDist;
          const sy = cy + Math.sin(starAng) * starDist;
          if (sx >= 0 && sx < this.W && sy >= 0 && sy < this.H) {
            c.fillStyle = (i % 2 === 0) ? C.brassGold : C.cyan;
            c.fillRect(Math.round(sx), Math.round(sy), 2, 2);
          }
        }
      }

      c.restore();
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 5. ERA HUD READOUT PLAQUE
  // ════════════════════════════════════════════════════════════════════════════
  _renderEraHUD(c, W, era, p) {
    c.save();
    c.fillStyle = 'rgba(7, 5, 20, 0.88)';
    c.fillRect(W - 92, 8, 86, 30);
    c.strokeStyle = C.brassGold;
    c.lineWidth = 1;
    c.strokeRect(W - 92, 8, 86, 30);

    // Brief quantum temporal recalibration pulse upon era change
    const pFrac = (p * 5) % 1;
    if (pFrac < 0.04 && p > 0.01 && p < 0.98) {
      c.fillStyle = 'rgba(0, 245, 212, 0.35)';
      c.fillRect(W - 91, 9, 84, 28);
    }

    c.fillStyle = C.brassGold;
    c.font = '8px monospace';
    const eraText = (era === 'modern_cyber') ? '2026 AD' :
                    (era === 'victorian_steam') ? '1888 AD' :
                    (era === 'ancient_egypt') ? '2500 BC' :
                    (era === 'jurassic_dinosaurs') ? '150M BC' :
                    (era === 'primordial_earth') ? '4.5B BC' : 'T = 0';
    c.fillText(eraText, W - 86, 20);

    c.font = '7px monospace';
    c.fillStyle = C.cyan;
    const eraSub = (era === 'modern_cyber') ? 'NEO-TOKYO' :
                   (era === 'victorian_steam') ? 'VICTORIAN' :
                   (era === 'ancient_egypt') ? 'EGYPT RA' :
                   (era === 'jurassic_dinosaurs') ? 'JURASSIC' :
                   (era === 'primordial_earth') ? 'HADEAN' : 'BIG BANG';
    c.fillText(eraSub, W - 86, 31);
    c.restore();
  }

  dispose() {
    this.reverseGrains = [];
    this.cosmicSparks = [];
    this.risingRain = [];
    this.steamPuffs = [];
    this.fireSparks = [];
    this.crystalShards = [];
  }
}
