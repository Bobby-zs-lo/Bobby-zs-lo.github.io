# Math Invaders (Web Deployment) 🚀👾

Production deployment of **Math Invaders** for [bobbylo.dk/math](https://bobbylo.dk/math/).

An educational, retro arcade-style math game heavily inspired by *Space Invaders*. Built for children and students to advance their mathematical skills throughout 10 school years (1. til 10. klasse / Grades 1 through 10) through engaging stage-based progression, customizable math problems, tactical ship upgrades, and space combat.

---

## 🎮 Game Features & Curriculum

- **🌐 Dual-Language Support (Dansk & English):** Always defaults to Danish (`da`) on startup, with instantaneous runtime toggling to English (`en`) via top bar and settings modal.
- **🎓 Dansk Folkeskole Fælles Mål (1. – 10. klasse):**
  - **1. klasse:** Talforståelse, 10'er-venner, plus/minus op til 20.
  - **2. klasse:** Tierovergange, plus/minus op til 100, 2-, 5- og 10-tabellerne.
  - **3. klasse:** Den lille tabel (1–10 tabellerne), division uden rest (`:`).
  - **4. klasse:** Regnearternes hierarki ($5 + 3 \times 4 = 17$), stambrøker ($1/2 \text{ af } 60 = 30$).
  - **5. klasse:** Procentregning ($25\% \text{ af } 80 = 20$), parenteser, decimaler ($3.5 + 6.5 = 10$).
  - **6. klasse:** Negative tal og regning under nul ($5 - 14 = -9$, $-8 + 3 = -5$, $4 \times (-6) = -24$).
  - **7. klasse:** Lineære ligninger ($ax + b = c$), potenser og kvadrattal.
  - **8. klasse:** Ligninger med $x$ på begge sider, kvadratrødder ($\sqrt{64} = 8$).
  - **9. klasse:** Parentesligninger, to ligninger med to ubekendte ($x+y=10, x-y=4$).
  - **10. klasse:** Andengradsligninger med heltalsrødder, Pythagoras ($a^2 + b^2 = c^2$).
- **⚙️ Overhauled Settings Modal:** Clean, structured modal layout featuring Language selector, 10-button Grade Grid with live curriculum detail cards, Answer Mode toggles, Adult Descent Speed slider, and collapsible advanced options.
- **Strict Lane-Lock Math Requirement:** The player ship only changes lane when the targeted math problem is answered correctly.
- **Multiple Answer Modes:** Kid-friendly virtual numpad entry or 5 multiple-choice options with 1 correct answer.
- **Real-Time Ship Upgrades:** Upgrade the starship live during combat across 4 tiers (Starter Scout, Dual-Wing Hunter, Plasma Cruiser, and Neon Flagship).
- **5 Cosmic Planetary Sectors & Dreadnought Boss Battle:** Moon Base Alpha, Asteroid Belt, Mars Orbit, Jupiter Rings, and Deep Space Nebula Boss.
- **Adult Descent Speed Control:** Real-time speed slider ($0.2\times$ to $2.0\times$) and quick presets (`0.4x Slow`, `0.7x Gentle`, `1.0x Normal`, `1.5x Fast`) accessible via in-game HUD and pause modal.
- **Non-One-Hit Monster Balance:** Rebalanced alien health (Scouts: 6 HP, Crabs: 6 HP, Minion Drones: 4 HP) so starter weapons do not kill enemies in 1 shot.
- **Parent Learning Analytics:** Cumulative accuracy, response times, trouble spots tracking, and printable offline worksheets.

---

## 🛠️ Build & Source

- **Source Code Repository:** `Math-invaders`
- **Build Output:** Compiled with Vite & TypeScript (`tsc && vite build`).
- **Asset Structure:** Standalone zero-dependency bundle (`index.html` + `assets/`).
