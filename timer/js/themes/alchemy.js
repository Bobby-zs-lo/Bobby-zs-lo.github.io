/**
 * AlchemyScene – The Hourglass of Liquid Light Countdown.
 *
 * An arcane clockwork laboratory where viscous liquid light drains through
 * a brass astrolabe hourglass, undergoing mystical transmutation before
 * blooming into a radiant Philosopher's Lotus.
 *
 * Progress & Fluid States:
 *   - 0.00 .. 0.25: The Golden Reservoir (top bulb full of liquid gold, dripping droplets)
 *   - 0.25 .. 0.50: Transmutation (liquid shifts into luminescent emerald & violet)
 *   - 0.50 .. 0.75: The Crucible (bottom bulb fills, boiling bubbles, rotating clockwork gears)
 *   - 0.75 .. 0.95: Sacred Mandalas (sacred geometry circles rotate around the frame)
 *   - 0.95 .. 1.00: The Critical Drop (last drop falls in slow motion)
 *
 * Finale (at 0:00):
 *   - The liquid crystallizes and erupts into a glowing fractal Philosopher's Lotus
 *     with expanding geometric mandalas and cascading golden stardust.
 */
import { Scene, blit } from '../scene.js';
import { audio }       from '../audio.js';

export const ALCHEMY_BLOOM_MS = 600;
export const ALCHEMY_FINALE_TOTAL_MS = 4600;

export function clampN(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export function topBulbFill(progress) {
  return 1 - clampN(progress, 0, 1);
}

export function bottomBulbFill(progress) {
  return clampN(progress, 0, 1);
}

export function alchemyPhase(progress) {
  const p = clampN(progress, 0, 1);
  if (p < 0.25) return 'reservoir';
  if (p < 0.50) return 'transmutation';
  if (p < 0.75) return 'crucible';
  if (p < 0.95) return 'mandalas';
  return 'critical_drop';
}

export function lotusBloomScale(elapsedMs, maxScale) {
  if (elapsedMs < ALCHEMY_BLOOM_MS) return 0;
  const t = clampN((elapsedMs - ALCHEMY_BLOOM_MS) / 1600, 0, 1);
  return maxScale * Math.sin(t * Math.PI * 0.5);
}

export function finalePhase(elapsedMs) {
  if (elapsedMs < 0) return 'idle';
  if (elapsedMs < ALCHEMY_BLOOM_MS) return 'impact_flash';
  if (elapsedMs < 2500) return 'lotus_bloom';
  if (elapsedMs < ALCHEMY_FINALE_TOTAL_MS) return 'mandala_settle';
  return 'done';
}

const C = {
  labDark: '#0d0512',
  brassDark: '#78590c',
  brassMid: '#b89025',
  brassHi: '#ffd166',
  goldLiquid: '#ffd166',
  cyanLiquid: '#00f5d4',
  purpleLiquid: '#b5179e',
  glassRim: 'rgba(255, 255, 255, 0.45)',
  white: '#ffffff',
};

export class AlchemyScene extends Scene {
  constructor(ctx, assets, opts) {
    super(ctx, assets, opts);
    this.time = 0;
    this.progress = 0;
    this.remainingMs = 0;

    this.cx = 120;
    this.cy = 110;
    this.drops = [];
    this.bubbles = [];
    this.stardust = [];

    this.finaleActive = false;
    this.finaleElapsed = 0;
    this.sfxPlayedBloom = false;
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
    this.drops = [];
    this.bubbles = [];
    this.stardust = [];
    this.finaleActive = false;
    this.finaleElapsed = 0;
    this.sfxPlayedBloom = false;
  }

  update(progress, dtMs, remainingMs) {
    this.time += dtMs;
    this.progress = clampN(progress, 0, 1);
    this.remainingMs = remainingMs;

    const phase = alchemyPhase(this.progress);

    // Falling liquid light droplets
    if (this.progress < 0.99 && Math.random() < 0.12) {
      this.drops.push({
        x: this.cx,
        y: this.cy - 10,
        vy: 0.12 + Math.random() * 0.08,
      });
    }

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.y += d.vy * dtMs;
      if (d.y >= this.cy + 38) {
        // Splashed into bottom bulb: spawn a rising bubble
        this.drops.splice(i, 1);
        if (this.bubbles.length < 15) {
          this.bubbles.push({
            x: this.cx + (Math.random() - 0.5) * 16,
            y: this.cy + 42,
            vy: -0.02 - Math.random() * 0.03,
            size: 2 + Math.floor(Math.random() * 3),
            life: 1.0,
          });
        }
      }
    }

    // Rising bubbles in bottom bulb
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.y += b.vy * dtMs;
      b.life -= 0.0015 * dtMs;
      if (b.life <= 0 || b.y < this.cy + 10) this.bubbles.splice(i, 1);
    }

    // Finale logic
    if (this.finaleActive) {
      this.finaleElapsed += dtMs;
      if (this.finaleElapsed >= ALCHEMY_BLOOM_MS && !this.sfxPlayedBloom) {
        this.sfxPlayedBloom = true;
        audio.sfx('magic');
      }

      // Stardust particles
      if (this.finaleElapsed < 3000 && Math.random() < 0.6) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 0.5 + Math.random() * 3.5;
        this.stardust.push({
          x: this.cx,
          y: this.cy,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          alpha: 1.0,
          color: (Math.random() < 0.5) ? C.brassHi : C.cyanLiquid,
          size: 1 + Math.floor(Math.random() * 3),
        });
      }

      for (let i = this.stardust.length - 1; i >= 0; i--) {
        const s = this.stardust[i];
        s.x += s.vx * (dtMs / 16.6);
        s.y += s.vy * (dtMs / 16.6);
        s.alpha -= 0.012 * (dtMs / 16.6);
        if (s.alpha <= 0) this.stardust.splice(i, 1);
      }
    }
  }

  onMilestone(i, total) {
    audio.sfx('coin'); // clockwork gear chime
    for (let j = 0; j < 8; j++) {
      this.bubbles.push({
        x: this.cx + (Math.random() - 0.5) * 20,
        y: this.cy + 36,
        vy: -0.04 - Math.random() * 0.04,
        size: 3,
        life: 1.0,
      });
    }
  }

  onComplete() {
    this.finaleActive = true;
    this.finaleElapsed = 0;
  }

  isFinaleDone() {
    return this.finaleActive && this.finaleElapsed >= ALCHEMY_FINALE_TOTAL_MS;
  }

  render() {
    const c = this.ctx;
    const W = this.W, H = this.H;
    const cx = this.cx, cy = this.cy;
    const p = this.progress;
    const phase = alchemyPhase(p);
    const topF = topBulbFill(p);
    const botF = bottomBulbFill(p);

    // 1. Dark Velvet Laboratory Background
    c.fillStyle = C.labDark;
    c.fillRect(0, 0, W, H);

    // Mystic ambient glow behind hourglass
    const ambGrad = c.createRadialGradient(cx, cy, 10, cx, cy, 110);
    ambGrad.addColorStop(0, 'rgba(181, 23, 158, 0.22)');
    ambGrad.addColorStop(0.6, 'rgba(0, 245, 212, 0.12)');
    ambGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    c.fillStyle = ambGrad;
    c.fillRect(0, 0, W, H);

    // 2. Rotating Sacred Geometry Mandalas (Background)
    this._renderMandalas(c, cx, cy, p);

    // 3. Side Clockwork Gears
    const gearRot = this.time * 0.001;
    blit(c, this.assets, 'gear0', cx - 58, cy - 12, 1);
    blit(c, this.assets, 'gear1', cx + 34, cy - 12, 1);

    // 4. Ornate Brass Hourglass Frame
    const hw = 34, hh = 54;

    // Glass Chambers Background
    c.fillStyle = 'rgba(255, 255, 255, 0.06)';
    // Top glass bulb
    c.beginPath();
    c.moveTo(cx - 24, cy - hh + 6);
    c.lineTo(cx + 24, cy - hh + 6);
    c.lineTo(cx + 4, cy - 4);
    c.lineTo(cx - 4, cy - 4);
    c.closePath();
    c.fill();
    // Bottom glass bulb
    c.beginPath();
    c.moveTo(cx - 4, cy + 4);
    c.lineTo(cx + 4, cy + 4);
    c.lineTo(cx + 24, cy + hh - 6);
    c.lineTo(cx - 24, cy + hh - 6);
    c.closePath();
    c.fill();

    // 5. Liquid Light In Chambers
    // Top bulb liquid (drains from top)
    if (topF > 0.02) {
      const topH = Math.round(topF * (hh - 12));
      c.save();
      c.beginPath();
      c.moveTo(cx - 24, cy - hh + 6);
      c.lineTo(cx + 24, cy - hh + 6);
      c.lineTo(cx + 4, cy - 4);
      c.lineTo(cx - 4, cy - 4);
      c.closePath();
      c.clip();

      const liqCol = (phase === 'reservoir') ? C.goldLiquid : (phase === 'transmutation') ? C.cyanLiquid : C.purpleLiquid;
      c.fillStyle = liqCol;
      c.fillRect(cx - 26, (cy - 4) - topH, 52, topH + 8);
      c.restore();
    }

    // Bottom bulb liquid (fills up from bottom)
    if (botF > 0.02) {
      const botH = Math.round(botF * (hh - 12));
      c.save();
      c.beginPath();
      c.moveTo(cx - 4, cy + 4);
      c.lineTo(cx + 4, cy + 4);
      c.lineTo(cx + 24, cy + hh - 6);
      c.lineTo(cx - 24, cy + hh - 6);
      c.closePath();
      c.clip();

      const botCol = (phase === 'reservoir') ? C.cyanLiquid : (phase === 'transmutation') ? C.purpleLiquid : C.goldLiquid;
      c.fillStyle = botCol;
      c.fillRect(cx - 26, (cy + hh - 6) - botH, 52, botH + 4);

      // Bubbles inside bottom liquid
      c.fillStyle = C.white;
      for (const b of this.bubbles) {
        c.fillRect(Math.round(b.x), Math.round(b.y), b.size, b.size);
      }
      c.restore();
    }

    // Falling droplets in capillary neck
    for (const d of this.drops) {
      blit(c, this.assets, 'drop0', Math.round(d.x - 8), Math.round(d.y - 8), 1);
    }

    // Hourglass Brass Frame Outlines
    c.strokeStyle = C.brassHi;
    c.lineWidth = 2;
    // Top & Bottom caps
    c.strokeRect(cx - hw, cy - hh, hw * 2, 6);
    c.strokeRect(cx - hw, cy + hh - 6, hw * 2, 6);
    // Brass Pillars
    c.beginPath();
    c.moveTo(cx - hw + 2, cy - hh); c.lineTo(cx - hw + 2, cy + hh);
    c.moveTo(cx + hw - 2, cy - hh); c.lineTo(cx + hw - 2, cy + hh);
    c.stroke();

    // 6. Alchemical Runes Orbiting
    const runeAngle = this.time * 0.0015;
    const rOrbit = 68;
    for (let ri = 0; ri < 4; ri++) {
      const ra = runeAngle + ri * (Math.PI / 2);
      const rx = Math.round(cx + Math.cos(ra) * rOrbit - 8);
      const ry = Math.round(cy + Math.sin(ra) * (rOrbit * 0.45) - 8);
      const rName = (ri === 0) ? 'rune_fire' : (ri === 1) ? 'rune_water' : (ri === 2) ? 'rune_air' : 'rune_aether';
      blit(c, this.assets, rName, rx, ry, 1);
    }

    // 7. The Philosopher's Lotus Finale
    if (this.finaleActive) {
      this._renderLotusFinale(c, cx, cy);
    }
  }

  _renderMandalas(c, cx, cy, p) {
    c.save();
    const rot = this.time * 0.0008;
    const mRad = 75;
    c.strokeStyle = 'rgba(255, 209, 102, 0.25)';
    c.lineWidth = 1;

    // Outer circle
    c.beginPath();
    c.arc(cx, cy, mRad, 0, Math.PI * 2);
    c.stroke();

    // Rotating Interlocking Triangles
    for (let t = 0; t < 2; t++) {
      const trAngle = rot + t * Math.PI;
      c.beginPath();
      for (let pt = 0; pt < 3; pt++) {
        const pa = trAngle + pt * (Math.PI * 2 / 3);
        const px = cx + Math.cos(pa) * mRad;
        const py = cy + Math.sin(pa) * mRad;
        if (pt === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath();
      c.stroke();
    }
    c.restore();
  }

  _renderLotusFinale(c, cx, cy) {
    const elapsed = this.finaleElapsed;
    const phase = finalePhase(elapsed);
    const scale = lotusBloomScale(elapsed, 1.4);

    if (scale > 0) {
      c.save();
      // Blinding transmutation radial glow
      const bGrad = c.createRadialGradient(cx, cy, 10, cx, cy, 80 * scale);
      bGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      bGrad.addColorStop(0.4, 'rgba(0, 245, 212, 0.7)');
      bGrad.addColorStop(0.8, 'rgba(255, 209, 102, 0.3)');
      bGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      c.fillStyle = bGrad;
      c.beginPath();
      c.arc(cx, cy, 80 * scale, 0, Math.PI * 2);
      c.fill();

      // Expanding Lotus Petals (8 symmetrically placed petals)
      for (let i = 0; i < 8; i++) {
        const pAng = (this.time * 0.001) + i * (Math.PI / 4);
        const dist = 32 * scale;
        const px = Math.round(cx + Math.cos(pAng) * dist - 12);
        const py = Math.round(cy + Math.sin(pAng) * dist - 12);
        blit(c, this.assets, 'lotus_petal', px, py, scale);
      }

      // Stardust Sparkles
      for (const s of this.stardust) {
        c.fillStyle = s.color;
        c.globalAlpha = s.alpha;
        c.fillRect(Math.round(s.x), Math.round(s.y), s.size, s.size);
      }
      c.restore();
    }
  }

  dispose() {
    this.drops = [];
    this.bubbles = [];
    this.stardust = [];
  }
}
