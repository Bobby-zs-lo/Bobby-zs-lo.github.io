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

7. **Gundam Mech Assembly & Launch** (`mech`)
   - Progressive assembly of an RX-78 style mobile suit in an underground hangar:
     - **0% – 25% (Frame Assembly)**: Inner skeleton & legs locked on launch bed; robotic arms weld joints with sparks.
     - **25% – 50% (Torso Armor)**: Heavy blue/red/yellow chest armor lowers from overhead gantry crane and seals cockpit.
     - **50% – 75% (Weapons & Arms)**: Beam rifle and shoulder armor lock into place; vernier thrusters test-fire.
     - **75% – 95% (Head & System Online)**: Head with golden V-fin locks in; dual green visor eyes flash bright with activation glow!
     - **95% – 100% (Catapult Lock)**: Feet lock into catapult clamps; overhead blast doors iris open to starry sky; rails energize.
   - **Finale (0:00)**: Twin thrusters roar with massive flames, catapult slingshots the Gundam upward at hypersonic speed into space, trailing billowing exhaust smoke!

8. **Leviathan Abyss** (`abyss`)
   - An atmospheric bathysphere dive from the sunlit surface to the 11,000m Hadal Mariana Trench, meeting mythical sea life:
     - **0% – 25% (Surface Shallows, 0 – 2,750m)**: Sunlit turquoise water, god rays, and gentle sea turtles gliding past.
     - **25% – 50% (Twilight Zone, 2,750 – 5,500m)**: Water darkens into deep indigo; mythical Giant Kraken Squid glides past with glowing eyes; twin searchlights turn on.
     - **50% – 75% (Sunken Atlantis, 5,500 – 8,250m)**: Midnight pitch black; searchlights illuminate ancient sunken Atlantean temple columns with glowing runes.
     - **75% – 95% (Hadal Trench, 8,250 – 10,450m)**: Seafloor vents, red cockpit alarm, and giant ancient glowing yellow slit eyes stalking from the abyss floor.
     - **95% – 100% (Leviathan Stalk)**: Massive shadow ascends directly beneath the diving bell.
   - **Finale (0:00)**: The colossal Ancient Leviathan jaws surge upward with razor fangs, gaping wide, and CHOMP the diving bell whole with crunching impact, swallowing it into its glowing belly!

9. **Chrono-Warp (Earth in Reverse & The Big Bang)** (`alchemy`)
   - An epic cosmic hourglass that flows in **REVERSE**, rewinding entropy and journeying backward through Earth's epochs:
     - **0% – 20% (Modern Digital Age, 2026 AD)**: Neon cyberpunk skyscraper skyline and digital grids.
     - **20% – 40% (Victorian Steam Age, 1880 AD)**: Cobblestone streets, Big Ben clocktower, and a steam locomotive puffing smoke.
     - **40% – 60% (Ancient Egypt, 2500 BC)**: Great Pyramids rising against a golden desert sun disk.
     - **60% – 80% (Jurassic Dinosaurs, 150M BC)**: Prehistoric jungle, smoking volcano, and roaring T-Rex.
     - **80% – 95% (Primordial Molten Earth, 4.5B BC)**: Boiling magma ocean and flaming meteors crashing down.
     - **95% – 100% (Cosmic Singularity, T = 0)**: Earth dissolves and all space-time contracts into an infinitely dense white point inside the hourglass.
   - **Finale (0:00)**: The hourglass shatters and space detonates into **THE BIG BANG**! Blinding cosmic inflation explosion, prismatic expanding rings of light, and the cosmic dawn of newborn galaxies and stars.

10. **Mouse Timer** (`mouse`)
   - Inspired by the classic visual timer. An HD cartoon mouse nibbles through a grid of apples (1 apple per ~10s, uncapped for any duration) toward the final cheese wedge.
   - Finale: Mouse finishes the cheese and celebrates with a full belly.

---

## Technical Stack & Commands

- **Pure Vanilla Web Standards**: Hand-authored ES modules, HTML5 `<canvas>`, CSS CRT/scanline overlay, and Web Audio API live synth (no audio assets, no external dependencies, zero bundlers).
- **Service Worker & PWA**: Offline-ready application shell caching with cache versioning (`sw.js`).
- **Responsive Stage**: Aspect-ratio-aware logical canvas (240 logical px short side, clamped ratio long side) supporting portrait and landscape across phones, tablets, and desktops.

### Running Unit Tests
```bash
# Run all unit tests (63 tests covering engines, math, and theme lifecycles)
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
