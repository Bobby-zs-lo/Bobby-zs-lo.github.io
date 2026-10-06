# Pixel Timer

An installable, offline-capable **8/16-bit synthwave countdown timer PWA** (Hotline Miami vibe). Pick an animated theme, set a duration on the interactive dial, watch a scene play out as the clock counts down, and celebrate with a dramatic finale.

Deployed live at **[bobbylo.dk/timer/](https://bobbylo.dk/timer/)**.

---

## Themes

1. **Castle Construction** (`castle`)
   - An intricate medieval fortress is erected stone-by-stone, battlement-by-battlement, under a synthwave sunset.
   - Indicator: Ascending golden banner flag.

2. **Monster HP Bar** (`monsterhp`)
   - An 8-bit arena duel where our valiant knight chips away at a towering behemoth's health bar.
   - Indicator: Depleting retro health bar and progressive monster battle damage.

3. **Dragon Sleep** (`dragon`)
   - A mighty red dragon slumbers peacefully atop a glittering pile of gold coins while stealthy thieves loot the hoard.
   - Finale: The hoard empties at 0:00, the dragon rears up, and roasts the fleeing thieves with dragon fire.

4. **Canyon Bridge** (`bridge`)
   - An industrial tower crane systematically builds a 10-segment bridge across a canyon gorge.
   - Indicator: Pulsing cyan ghost segment outlines showing remaining time.
   - Finale: The brave hero crosses the completed bridge to plant the victory flag.

5. **Poke Feast v2** (`feeding`)
   - Pikachu feasts through a 14-item banquet (berries, cookies, and ketchup chug).
   - Indicator: Shrinking food platters and growing belly stages.
   - Finale: Staged electric thunderstorm with lightning bolts and victory sparks.

6. **Supernova (The Stellar Singularity)** (`supernova`)
   - A cosmic space odyssey featuring the evolutionary lifecycle of a massive celestial star:
     - **0% – 25% (Azure Hypergiant)**: Electric cyan and diamond-white core with sapphire corona filaments and solar flares.
     - **25% – 50% (Golden Solar Phase)**: Radiant solar wind, turbulent prominences, and golden sunspots.
     - **50% – 75% (Crimson Supergiant)**: Swelling red giant with convective boiling plasma and magnetic tension.
     - **75% – 95% (Gravitational Singularity)**: Matter collapses past the event horizon into a pitch-black black hole with a Doppler-beamed relativistic accretion disk.
     - **95% – 100% (Critical Implosion)**: High-speed gravitational vortex contraction.
   - **Milestones (20%, 40%, 60%, 80%)**: Coronal Mass Ejections (CMEs) rippling through deep space with harmonic synth chimes.
   - **Finale (0:00)**: Gravitational core collapse, gamma flash, vertical relativistic bipolar plasma jets, expanding chromatic spherical shockwaves, and the birth of a radiant spinning Pulsar with sweeping lighthouse beams!

7. **Mouse Timer** (`mouse`)
   - Inspired by the classic visual timer. An HD cartoon mouse nibbles through a grid of apples (1 apple per ~10s, uncapped for any duration) toward the final cheese wedge.
   - Finale: Mouse finishes the cheese and celebrates with a full belly.

---

## Technical Stack & Commands

- **Pure Vanilla Web Standards**: Hand-authored ES modules, HTML5 `<canvas>`, CSS CRT/scanline overlay, and Web Audio API live synth (no audio assets, no external dependencies, zero bundlers).
- **Service Worker & PWA**: Offline-ready application shell caching with cache versioning (`sw.js`).
- **Responsive Stage**: Aspect-ratio-aware logical canvas (240 logical px short side, clamped ratio long side) supporting portrait and landscape across phones, tablets, and desktops.

### Running Unit Tests
```bash
# Run all unit tests (48 tests covering engines, math, and theme lifecycles)
node --test tests/*.mjs
```

### Local Development Server
```bash
python -m http.server 8099
# Open http://localhost:8099/
```

### Generating Pixel & HD Art Assets
```bash
cd art-src
python gen_supernova.py
python gen_castle.py
python gen_monsterhp.py
python gen_dragon.py
python gen_bridge.py
python gen_feast.py
python gen_mouse.py
python gen_thumbs.py
```
