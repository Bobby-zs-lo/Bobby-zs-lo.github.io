# Portfolio Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the personal portfolio site at `Bobby-zs-lo.github.io` with a modernized-Lancet editorial aesthetic, mixed-intensity GSAP motion choreography, and a 12-section architecture grounded in the actual `Curriculum Vitae 2026` content — without breaking the GitHub Actions auto-update flow that regenerates `publications.html` weekly.

**Architecture:** Static GitHub Pages site, no build step. Three editable files (`style.css`, `index.html`, `script.js`) plus one generator script (`generate_publications.py`). GSAP loaded via CDN, motion gated behind `prefers-reduced-motion`. Scholar metrics and selected publications fetched live from OpenAlex in `script.js` (so they stay fresh between weekly CI runs). Publications page restyled by editing the HTML strings inside `generate_publications.py` since CI overwrites the file.

**Tech Stack:** HTML5, CSS3 (custom properties, clamp, grid, sticky), vanilla JavaScript, GSAP 3 + ScrollTrigger + SplitText (via cdnjs), Google Fonts (Fraunces, Inter, JetBrains Mono), OpenAlex public API. Python 3.x for `generate_publications.py` (already in CI).

**Spec reference:** `docs/superpowers/specs/2026-05-23-portfolio-redesign-design.md`

---

## File Structure

| File | Change type | Responsibility |
|---|---|---|
| `style.css` | Full rewrite | Design tokens (palette/type/spacing), reset, layout primitives, all component styles, motion-safe fallbacks, media queries. Backwards-compat aliases (`--golden-amber`, `--cactus-green`, `--dusty-blue`) kept until the generator is updated. |
| `index.html` | Body rewrite + head additions | 11-section semantic structure. Head: keep all SEO/meta/JSON-LD, add font + GSAP CDN links. Body: replace all sections, preserve `.sr-only` SEO article. **Old `<!-- BANNER_START/END -->` markers are removed** (marquee dropped per spec § 4.5). |
| `script.js` | Append + keep existing | Keep `filterPublications`, `toggleAll`, `#toTopBtn`, collapsible toggle (publications page still uses them). Append: OpenAlex fetch module (metrics + latest publications), GSAP init module (both gated by feature detection / reduced-motion). |
| `generate_publications.py` | Update HTML strings + drop banner block | Remove inline `style="..."` attributes, swap to new semantic class names, **drop the ticker block entirely**, update metrics/highlights/year-collapsibles markup. **Remove the entire `# === Update index.html Banner ===` block at the bottom of the script** — generator no longer touches `index.html`. |
| `.github/workflows/update-publications.yml` | **No change** | Spec requires CI workflow untouched. |
| `docs/superpowers/plans/2026-05-23-portfolio-redesign.md` | Created (this file) | Plan document. |

No new source files. Decision: keep GSAP init in `script.js` (single-file simplicity matches the rest of the project; spec doesn't call for splitting).

---

## Pre-flight: Repo reconciliation

Before any implementation: the working tree has uncommitted local changes to `style.css` and `README.md`, and `main` is 7 commits behind `origin/main`. The implementing agent must reconcile this *before* touching files, otherwise the rewrite will conflict.

### Task 0: Reconcile local repo state

**Files:**
- Inspect only — no edits.

- [ ] **Step 1: Inspect what's actually different**

```bash
git status
git diff style.css | head -100
git diff README.md
git log --oneline origin/main..HEAD 2>/dev/null || true
git log --oneline HEAD..origin/main
```

Expected: see the 7 incoming commits and the local diffs. Do NOT proceed if you can't read every change.

- [ ] **Step 2: Decide handling with the user**

Stop and ask the user one question: "I see local uncommitted changes to `style.css` and `README.md`, and main is 7 commits behind origin. Which do you want — (a) stash local changes, fast-forward, then pop and resolve, (b) commit local changes first, then merge, or (c) discard local style.css since we're rewriting it anyway and keep README.md?"

Do NOT proceed past this task until the user has chosen.

- [ ] **Step 3: Execute the chosen reconciliation**

Based on user's answer, run the appropriate sequence. For example, if (c):
```bash
git stash push README.md -m "wip readme before redesign"
git checkout -- style.css
git pull --ff-only
git stash pop
```

- [ ] **Step 4: Verify clean baseline**

```bash
git status
git log --oneline -5
```

Expected: working tree clean except for the README.md edit (or whatever the user opted to keep), HEAD matches origin/main.

---

## Phase 1: Foundation — design tokens and base styles

### Task 1: Rewrite `style.css` with design tokens and base type

**Files:**
- Modify (full rewrite): `style.css`

- [ ] **Step 1: Replace `style.css` with the token foundation**

Overwrite the file with:

```css
/* ============================================
   Bobby Lo — Portfolio v2026
   Design tokens + base + components
   ============================================ */

@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

:root {
  /* palette */
  --paper:      #FBFAF7;
  --paper-2:    #F3F1EB;
  --paper-dark: #1A1614;
  --ink:        #1A1614;
  --ink-2:      #4A4340;
  --ink-3:      #888280;
  --rule:       rgba(0, 0, 0, 0.08);
  --accent:     #C4302B;
  --accent-2:   #7A1F2B;
  --ochre:      #C9A96E;

  /* backwards-compat aliases for generate_publications.py inline styles
     remove once Task 23 lands */
  --golden-amber:    var(--accent);
  --cactus-green:    var(--accent-2);
  --dusty-blue:      var(--ink-3);
  --midnight-blue:   var(--ink);
  --sky-teal:        var(--ochre);
  --parchment-beige: var(--paper);
  --soft-cyan:       var(--ink-3);
  --deep-charcoal:   var(--ink);
  --warm-brick:      var(--accent);
  --blush-pink:      var(--accent);
  --glass-bg:        var(--paper);

  /* shadow tokens (still used by generator inline) */
  --shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.04);
  --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.10);

  /* spacing */
  --gutter: 24px;
  --section-y: 80px;
  --container: 1080px;

  --transition: all 0.25s ease;
}

@media (min-width: 768px) {
  :root { --gutter: 36px; }
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  background: var(--paper);
  color: var(--ink);
  line-height: 1.65;
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

/* type scale */
h1, h2, h3 { font-family: 'Fraunces', Georgia, serif; color: var(--ink); line-height: 1.1; }
h1 { font-size: clamp(36px, 6vw, 64px); font-weight: 500; letter-spacing: -1.5px; line-height: 1.02; }
h2 { font-size: clamp(24px, 3.5vw, 36px); font-weight: 500; letter-spacing: -0.8px; }
h3 { font-size: 18px; font-weight: 600; }
p  { font-size: 15px; color: var(--ink-2); }

a { color: var(--ink); text-decoration: none; font-weight: 500; transition: color .2s ease; }
a:hover { color: var(--accent); }

ul { list-style: none; }

.eyebrow {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: var(--accent);
  font-weight: 500;
}

.container {
  max-width: var(--container);
  margin: 0 auto;
  padding: 0 var(--gutter);
}

.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}

/* focus */
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 2px;
}

/* reduced motion baseline */
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}
```

- [ ] **Step 2: Start a local static server**

```bash
python -m http.server 8000
```

Run in a separate terminal so it stays up for subsequent tasks. Leave running until end of plan.

- [ ] **Step 3: Visual verification**

Open `http://localhost:8000/` in a browser. Page will look broken (no component CSS yet) but:
- DevTools → Network → confirm Fraunces, Inter, JetBrains Mono fonts loaded (200 status)
- DevTools → Console → no errors
- Body background should be `#FBFAF7` (warm white)

- [ ] **Step 4: Commit**

```bash
git add style.css
git commit -m "Replace style.css with v2026 design tokens and base styles

Adds Fraunces/Inter/JetBrains Mono imports, palette and spacing
tokens, fluid type scale, reduced-motion baseline. Keeps backwards-
compat CSS variable aliases so the inline styles emitted by
generate_publications.py continue resolving until the generator is
updated in a later task.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 2: HTML scaffold + component styling

Each section task pairs HTML markup with its component CSS. The dev server is running from Task 1; refresh after each task to verify.

### Task 2: Update `<head>` (fonts already loaded via CSS; add GSAP CDN)

**Files:**
- Modify: `index.html` (head only — body stays untouched in this task)

- [ ] **Step 1: Read existing head and locate the `</head>` tag**

Open `index.html`. Confirm head currently contains: title, description, keywords, author, stylesheet link, canonical, og:* tags, JSON-LD. **Preserve all of those.**

- [ ] **Step 2: Insert GSAP CDN scripts just before `</head>`**

Insert these lines immediately before `</head>`:

```html
<!-- Motion (deferred, gated by prefers-reduced-motion in script.js) -->
<script defer src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script defer src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
<script defer src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/SplitText.min.js"></script>
```

> SplitText is a free utility on cdnjs (the gsap-licensed SplitText is a paid plugin; cdnjs hosts the open mirror version). If the cdnjs SplitText URL 404s at runtime, fall back to writing a manual word-wrap in `script.js` — see Task 17.

- [ ] **Step 3: Reload and verify in browser**

Reload `http://localhost:8000/`. Open DevTools → Network → filter "script". Confirm gsap.min.js and ScrollTrigger.min.js are 200. Check Console: `window.gsap` should be defined after page load.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Add GSAP 3 + ScrollTrigger + SplitText CDN links to index head"
```

### Task 3: Rewrite navigation (rolling banner dropped per spec § 4.5)

**Files:**
- Modify: `index.html` (replace existing `<nav>` AND remove the rolling-banner block including `<!-- BANNER_START -->`/`<!-- BANNER_END -->` markers)
- Modify: `style.css` (append nav component)

- [ ] **Step 1: Replace `<nav>` block in `index.html`**

Find the existing `<nav>...</nav>` and replace with:

```html
<nav class="nav">
  <div class="container nav-inner">
    <a href="index.html" class="nav-brand">Bobby<span class="nav-brand-dot">.</span>Lo</a>
    <ul class="nav-links">
      <li><a href="index.html" class="active">Home</a></li>
      <li><a href="publications.html">Publications</a></li>
    </ul>
  </div>
</nav>
```

- [ ] **Step 2: Delete the entire BANNER block**

Delete everything from `<!-- BANNER_START -->` through `<!-- BANNER_END -->` inclusive — markers and all. The recency signal moves to the "Latest publications" section (Task 12).

Verify with:
```bash
grep -c "BANNER_START\|BANNER_END\|rolling-banner" index.html
```
Expected: 0.

- [ ] **Step 3: Append nav CSS to `style.css`**

```css
/* ===== Nav ===== */
.nav {
  background: rgba(251, 250, 247, 0.92);
  border-bottom: 1px solid var(--rule);
  position: sticky; top: 0; z-index: 100;
  backdrop-filter: blur(8px);
}
.nav-inner { display: flex; justify-content: space-between; align-items: center; padding: 18px 0; }
.nav-brand { font-family: 'Fraunces', serif; font-weight: 700; font-size: 18px; letter-spacing: -.3px; color: var(--ink); }
.nav-brand-dot { color: var(--accent); }
.nav-links { display: flex; gap: 28px; }
.nav-links a { font-size: 13px; font-weight: 500; color: var(--ink-2); padding-bottom: 4px; border-bottom: 2px solid transparent; transition: border-color .2s, color .2s; }
.nav-links a:hover, .nav-links a.active { color: var(--ink); border-color: var(--accent); }
```

- [ ] **Step 4: Visual verification**

Reload. Nav should be a sticky off-white bar with serif "Bobby.Lo" brand (red dot) and two underlinable links. No black ticker bar below.

- [ ] **Step 5: Commit**

```bash
git add index.html style.css
git commit -m "Rewrite nav and drop rolling publications banner

Removes BANNER_START/END markers and the marquee div per spec § 4.5.
Recency signal moves to the Latest publications section."
```

### Task 4: Hero section

**Files:**
- Modify: `index.html` (replace existing `<div class="hero">...</div>`)
- Modify: `style.css` (append hero styles)

- [ ] **Step 1: Wrap remaining body in `<main class="container">` if not already, and replace hero markup**

Replace the existing `<div class="hero">...</div>` with:

```html
<section class="hero" id="hero">
  <div class="container hero-inner">
    <div class="hero-text">
      <div class="eyebrow">MD · PHD · Specialist trainee</div>
      <h1 class="hero-name" data-split>Bobby Zhao<br>Sheng Lo, <span class="hero-name-it">MD, PhD</span></h1>
      <p class="hero-role">Specialist trainee in Gastroenterology at Bispebjerg Hospital · Postdoc and Leader of the Gastrointestinal Artificial Intelligence Network (GAIN) · Section Leader at the Copenhagen Center for Inflammatory Bowel Disease.</p>
      <div class="hero-actions">
        <a href="#about" class="btn btn-primary">Read about my work →</a>
        <a href="publications.html" class="btn btn-outline">Publications</a>
      </div>
    </div>
    <div class="hero-portrait">
      <img src="image/profile.JPG" alt="Portrait of Bobby Zhao Sheng Lo" />
      <span class="hero-portrait-meta">COPENHAGEN · 2026</span>
    </div>
    <div class="hero-bg-numeral" aria-hidden="true">2026</div>
  </div>
</section>
```

- [ ] **Step 2: Append hero CSS**

```css
/* ===== Hero ===== */
.hero { padding: 64px 0 56px; position: relative; overflow: hidden; }
.hero-inner { display: grid; grid-template-columns: 1.3fr 1fr; gap: 56px; align-items: center; position: relative; }
.hero-text { position: relative; z-index: 2; }
.hero-name { margin: 18px 0 22px; }
.hero-name-it { font-style: italic; font-weight: 400; color: var(--accent-2); }
.hero-role { font-size: 15px; color: var(--ink-2); max-width: 460px; margin-bottom: 28px; line-height: 1.6; }
.hero-actions { display: flex; gap: 10px; flex-wrap: wrap; }

.btn { display: inline-block; font-size: 13px; padding: 11px 20px; border-radius: 999px; font-weight: 600; cursor: pointer; transition: all .25s ease; border: 1.5px solid var(--ink); font-family: inherit; }
.btn-primary { background: var(--ink); color: var(--paper); }
.btn-primary:hover { background: var(--accent); border-color: var(--accent); color: var(--paper); }
.btn-outline { background: transparent; color: var(--ink); }
.btn-outline:hover { background: var(--ink); color: var(--paper); }

.hero-portrait { position: relative; aspect-ratio: 4/5; border-radius: 4px; overflow: hidden; box-shadow: 0 24px 60px rgba(122,31,43,.18); }
.hero-portrait img { width: 100%; height: 100%; object-fit: cover; display: block; }
.hero-portrait-meta { position: absolute; bottom: 14px; left: 14px; font-family: 'JetBrains Mono', monospace; font-size: 9px; color: rgba(255,255,255,.9); letter-spacing: 1.5px; text-shadow: 0 1px 4px rgba(0,0,0,.5); }

.hero-bg-numeral {
  position: absolute; top: -40px; right: -60px;
  font-family: 'Fraunces', serif; font-weight: 700;
  font-size: clamp(180px, 28vw, 360px); line-height: 1;
  color: rgba(196, 48, 43, 0.05);
  letter-spacing: -12px; pointer-events: none; z-index: 1;
  user-select: none;
}

@media (max-width: 768px) {
  .hero-inner { grid-template-columns: 1fr; gap: 32px; }
  .hero-portrait { max-width: 280px; margin: 0 auto; }
}
```

- [ ] **Step 3: Visual verification**

Reload. Hero should: be a 2-column layout (text left, portrait right), large serif name with italic "MD, PhD", giant translucent "2026" numeral peeking behind, two pill buttons. On mobile (DevTools responsive), should stack with portrait centered.

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "Hero: editorial 2-col layout with portrait, pill buttons, bg numeral

Bio reflects current Bispebjerg specialist training + GAIN + IBD
Center per CV 2026. Existing circular profile.JPG used as rectangular
portrait via object-fit."
```

### Task 5: Scholar metrics strip (with static fallback)

**Files:**
- Modify: `index.html`
- Modify: `style.css`

- [ ] **Step 1: Add metrics section after hero**

Insert after `</section>` of hero:

```html
<section class="metrics" id="metrics" aria-label="Scholar metrics">
  <div class="container metrics-inner">
    <div class="metric" data-metric="works">
      <div class="metric-value" data-count-to="0">—</div>
      <div class="metric-label">Publications</div>
    </div>
    <div class="metric" data-metric="citations">
      <div class="metric-value" data-count-to="0">—</div>
      <div class="metric-label">Citations</div>
    </div>
    <div class="metric" data-metric="h_index">
      <div class="metric-value" data-count-to="0">—</div>
      <div class="metric-label">h-index</div>
    </div>
    <div class="metric" data-metric="i10_index">
      <div class="metric-value" data-count-to="0">—</div>
      <div class="metric-label">i10-index</div>
    </div>
  </div>
</section>
```

The `data-metric` attribute tells `script.js` which OpenAlex field to populate (Task 15). The em-dash is the no-JS / API-down fallback.

- [ ] **Step 2: Append metrics CSS**

```css
/* ===== Metrics strip ===== */
.metrics { background: var(--paper-2); border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); padding: 28px 0; }
.metrics-inner { display: grid; grid-template-columns: repeat(4, 1fr); gap: 36px; }
.metric-value { font-family: 'Fraunces', serif; font-size: clamp(28px, 4vw, 40px); font-weight: 500; color: var(--ink); line-height: 1; letter-spacing: -1px; }
.metric-label { font-size: 10px; color: var(--ink-2); letter-spacing: 1.8px; text-transform: uppercase; margin-top: 8px; font-weight: 600; }
@media (max-width: 768px) {
  .metrics-inner { grid-template-columns: repeat(2, 1fr); gap: 24px; }
}
```

- [ ] **Step 3: Visual verification**

Reload. Four em-dashes ("—") should appear in a row on the paper-2 strip. (Numbers populate after Task 15.)

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "Metrics strip: 4-up grid with em-dash fallback, JS hooks ready"
```

### Task 6: About section

**Files:**
- Modify: `index.html`
- Modify: `style.css`

- [ ] **Step 1: Replace existing About card with editorial section**

Replace the existing `<div class="card"><section id="about">...` block with:

```html
<section class="section" id="about">
  <div class="container section-inner">
    <div class="section-gutter"><span class="eyebrow">// 01  Introduction</span></div>
    <div class="section-body prose">
      <h2>About</h2>
      <p>I am a specialist trainee in Internal Medicine and Gastroenterology at Bispebjerg Hospital in Copenhagen, and concurrently a postdoctoral researcher and Leader of the Gastrointestinal Artificial Intelligence Network (GAIN) at Copenhagen University Hospital Hvidovre.</p>
      <p>My work sits at the intersection of clinical gastroenterology and computer science, focused on integrating artificial intelligence into the diagnostics and management of Inflammatory Bowel Disease. Current major projects include the ENACT Endoscopic Add-on System and the Presager Project for AI-driven disease classification.</p>
      <p>Beyond AI, I hold a strong foundation in clinical epidemiology — using Danish nationwide registry data to study disease courses, epidemiology, and treatment outcomes.</p>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Append section + prose CSS**

```css
/* ===== Section primitive ===== */
.section { padding: var(--section-y) 0; border-bottom: 1px solid var(--rule); }
.section-inner { display: grid; grid-template-columns: 180px 1fr; gap: 48px; align-items: start; }
.section-gutter { position: sticky; top: 100px; }
.section-body { max-width: 720px; }
.section-body h2 { margin-bottom: 18px; }
@media (max-width: 768px) {
  .section-inner { grid-template-columns: 1fr; gap: 16px; }
  .section-gutter { position: static; }
}

/* ===== Prose ===== */
.prose p { font-size: 16px; line-height: 1.75; color: var(--ink-2); margin-bottom: 1em; }
.prose p:last-child { margin-bottom: 0; }
```

- [ ] **Step 3: Visual verification**

Reload. About should be a single-column prose block with a sticky "// 01  Introduction" eyebrow label in the left gutter that stays pinned as you scroll through the section.

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "About section: editorial prose with sticky gutter eyebrow

Copy updated to reflect Bispebjerg specialist training (was 'KBU
physician' on the old site, now outdated per CV 2026)."
```

### Task 7: Currently — three concurrent roles

**Files:**
- Modify: `index.html`
- Modify: `style.css`

- [ ] **Step 1: Append Currently section after About**

```html
<section class="section" id="currently">
  <div class="container section-inner">
    <div class="section-gutter"><span class="eyebrow">// 02  Currently</span></div>
    <div class="section-body">
      <h2>Three concurrent roles</h2>
      <div class="role-grid">
        <article class="role-card">
          <span class="role-date">2026 — Present</span>
          <h3>Specialist Trainee</h3>
          <p class="role-org">Department of Gastroenterology, Bispebjerg Hospital</p>
          <p class="role-note">Internal Medicine / Gastroenterology &amp; Hepatology specialist training.</p>
        </article>
        <article class="role-card">
          <span class="role-date">2024 — Present</span>
          <h3>Postdoc &amp; Leader</h3>
          <p class="role-org">Gastrointestinal Artificial Intelligence Network (GAIN)</p>
          <p class="role-note">Leading a team of 15 students applying deep learning to endoscopy and IBD diagnostics.</p>
        </article>
        <article class="role-card">
          <span class="role-date">2021 — Present</span>
          <h3>Section Leader</h3>
          <p class="role-org">Copenhagen Center for Inflammatory Bowel Disease</p>
          <p class="role-note">In Children, Adolescents, and Adults · Copenhagen University Hospital Amager &amp; Hvidovre.</p>
        </article>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Append role card CSS**

```css
/* ===== Role grid (Currently) ===== */
.role-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 24px; }
.role-card { background: #fff; border: 1px solid var(--rule); border-radius: 8px; padding: 20px; transition: transform .25s ease, border-color .25s ease, box-shadow .25s ease; }
.role-card:hover { transform: translateY(-3px); border-color: var(--accent); box-shadow: 0 12px 28px rgba(0,0,0,.06); }
.role-date { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--accent); letter-spacing: 1.5px; font-weight: 500; text-transform: uppercase; }
.role-card h3 { margin: 8px 0 4px; font-size: 17px; }
.role-org { font-size: 12px; color: var(--ink); font-weight: 500; margin-bottom: 6px; }
.role-note { font-size: 12px; color: var(--ink-2); line-height: 1.55; }
@media (max-width: 768px) { .role-grid { grid-template-columns: 1fr; } }
```

- [ ] **Step 3: Visual verification**

Reload, scroll to Currently. Three white cards in a row with red date eyebrows, serif role titles, two-line descriptions. Hover should lift each card and color the border red.

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "Currently: three concurrent role cards (Bispebjerg + GAIN + IBD)"
```

### Task 8: Experience timeline (clinical | research)

**Files:**
- Modify: `index.html`
- Modify: `style.css`

- [ ] **Step 1: Append Experience section**

Source data from `Curriculum Vitae 2026.docx` (HEALTHCARE-RELATED WORK EXPERIENCE + RESEARCH AND ACADEMIC POSITIONS sections, already extracted in the spec at § 4.3).

```html
<section class="section" id="experience">
  <div class="container section-inner">
    <div class="section-gutter"><span class="eyebrow">// 03  Experience</span></div>
    <div class="section-body">
      <h2>Experience</h2>
      <div class="exp-grid">
        <div class="exp-col">
          <h3 class="exp-col-title">Clinical</h3>
          <ul class="timeline">
            <li><span class="tl-date">2026 →</span><div><strong>Bispebjerg Hospital</strong><br/>Specialist Trainee · Internal Medicine / Gastroenterology &amp; Hepatology</div></li>
            <li><span class="tl-date">2025–26</span><div><strong>Zealand University Hospital Køge</strong><br/>Introductory Training Doctor · Internal Medicine / Gastroenterology</div></li>
            <li><span class="tl-date">2024–25</span><div><strong>Familielægerne i Rødovre</strong><br/>Locum physician</div></li>
            <li><span class="tl-date">2024</span><div><strong>Familielægerne i Rødovre</strong><br/>Klinisk Basisuddannelse</div></li>
            <li><span class="tl-date">2023–24</span><div><strong>Herlev Hospital</strong><br/>Klinisk Basisuddannelse · Gastrokirurgisk enhed</div></li>
            <li><span class="tl-date">2015–16</span><div><strong>Earlier roles</strong><br/>Medical Secretary &amp; Healthcare Professional · ENT clinic + neuro-rehab</div></li>
          </ul>
        </div>
        <div class="exp-col">
          <h3 class="exp-col-title">Research</h3>
          <ul class="timeline">
            <li><span class="tl-date">2024 →</span><div><strong>Postdoc &amp; Leader, GAIN</strong><br/>Copenhagen University Hospital Hvidovre</div></li>
            <li><span class="tl-date">2021 →</span><div><strong>Researcher, CCIBD</strong><br/>Copenhagen Center for Inflammatory Bowel Disease</div></li>
            <li><span class="tl-date">2020–24</span><div><strong>PhD Student</strong><br/>GastroUnit, Copenhagen University Hospital Hvidovre</div></li>
            <li><span class="tl-date">2017–19</span><div><strong>Research Assistant</strong><br/>Dept. of Clinical Microbiology, Hvidovre</div></li>
            <li><span class="tl-date">2016–22</span><div><strong>Research Assistant &amp; Data Manager</strong><br/>GastroUnit, Hvidovre</div></li>
            <li><span class="tl-date">2014</span><div><strong>Research Assistant</strong><br/>Pediatrics, Nordsjællands Hospital, Hillerød</div></li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Append timeline CSS**

```css
/* ===== Experience timeline ===== */
.exp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 24px; }
.exp-col-title { font-size: 13px; font-weight: 600; color: var(--ink-3); letter-spacing: 1px; text-transform: uppercase; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid var(--rule); font-family: 'Inter', sans-serif; }
.timeline { display: flex; flex-direction: column; }
.timeline li { display: grid; grid-template-columns: 80px 1fr; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--rule); font-size: 13px; line-height: 1.5; color: var(--ink-2); }
.timeline li:last-child { border-bottom: 0; }
.tl-date { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--accent); letter-spacing: .5px; font-weight: 500; padding-top: 1px; }
.timeline strong { color: var(--ink); font-weight: 600; font-size: 14px; }
@media (max-width: 768px) { .exp-grid { grid-template-columns: 1fr; gap: 32px; } }
```

- [ ] **Step 3: Visual verification**

Reload, scroll to Experience. Two-column timeline. Each row has a red mono date on the left and bold role + secondary line on the right. Hairline rules between rows.

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "Experience: two-column clinical/research timeline from CV 2026"
```

### Task 9: Education & Awards

**Files:**
- Modify: `index.html`
- Modify: `style.css`

- [ ] **Step 1: Append section**

```html
<section class="section" id="education">
  <div class="container section-inner">
    <div class="section-gutter"><span class="eyebrow">// 04  Education &amp; Awards</span></div>
    <div class="section-body">
      <h2>Education &amp; Awards</h2>
      <div class="ed-grid">
        <div>
          <h3 class="ed-col-title">Degrees</h3>
          <ul class="timeline">
            <li><span class="tl-date">2024</span><div><strong>PhD</strong><br/>Copenhagen University Hospital Hvidovre</div></li>
            <li><span class="tl-date">2019</span><div><strong>MD</strong><br/>University of Copenhagen, Denmark</div></li>
          </ul>
        </div>
        <div>
          <h3 class="ed-col-title">Awards &amp; Recognition</h3>
          <ul class="timeline">
            <li><span class="tl-date">2024</span><div><strong>FALK Foundation</strong><br/>AI in Gastroenterology Poster Award</div></li>
            <li><span class="tl-date">2021</span><div><strong>Y-ECCO</strong><br/>Congress Abstract Award</div></li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Append shared `.ed-grid` rule (reuses `.timeline` from Task 8)**

```css
/* ===== Education & Awards ===== */
.ed-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 24px; }
.ed-col-title { font-size: 13px; font-weight: 600; color: var(--ink-3); letter-spacing: 1px; text-transform: uppercase; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid var(--rule); font-family: 'Inter', sans-serif; }
@media (max-width: 768px) { .ed-grid { grid-template-columns: 1fr; gap: 32px; } }
```

- [ ] **Step 3: Visual verification**

Reload. Two columns (Degrees | Awards) sharing the same timeline style as Experience. Hairline rules.

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "Education & Awards: two-column degrees + awards timeline"
```

### Task 10: Expertise + continuing education (collapsible 17 courses)

**Files:**
- Modify: `index.html`
- Modify: `style.css`

- [ ] **Step 1: Append section. Course list comes from `Kurser.docx` (extracted in spec § 4)**

```html
<section class="section" id="expertise">
  <div class="container section-inner">
    <div class="section-gutter"><span class="eyebrow">// 05  Expertise</span></div>
    <div class="section-body">
      <h2>Expertise</h2>
      <div class="comp-grid">
        <article class="comp-card">
          <span class="comp-num">01</span>
          <h3>AI &amp; Machine Learning</h3>
          <p>Deep learning pipelines · Convolutional Neural Networks (CNN) · Computer vision in endoscopy.</p>
        </article>
        <article class="comp-card">
          <span class="comp-num">02</span>
          <h3>Data Analysis</h3>
          <p>R and Python workflows · Registry data management · Advanced biostatistics.</p>
        </article>
        <article class="comp-card">
          <span class="comp-num">03</span>
          <h3>Clinical Focus</h3>
          <p>IBD diagnostics · Histology · Clinical trials (EASI Trial, PROCTO Trial).</p>
        </article>
      </div>

      <details class="courses">
        <summary><span class="eyebrow" style="color:var(--ink-2)">Continuing education</span> <span class="courses-toggle-text">17 courses, 2017 — 2026</span></summary>
        <ul class="course-list">
          <li><span class="tl-date">2026</span> Clinical Supervision and Mentoring (Pedagogy II)</li>
          <li><span class="tl-date">2025</span> Basic Ultrasound Course · Danish Society of Diagnostic Ultrasound (DUDS)</li>
          <li><span class="tl-date">2024</span> Clinical Communication Skills</li>
          <li><span class="tl-date">2023</span> Acute Medical Care and Patient Transport</li>
          <li><span class="tl-date">2023</span> Medical Pedagogy and Learning</li>
          <li><span class="tl-date">2022</span> Data-driven Personalized Medicine — From Epidemiology to Patient</li>
          <li><span class="tl-date">2022</span> Advanced Statistical Topics in Health Research B</li>
          <li><span class="tl-date">2022</span> Hackathon — Application of Machine Learning in Biomedical Research (Part B)</li>
          <li><span class="tl-date">2022</span> Introduction to Machine Learning in Biomedical Research (Part A)</li>
          <li><span class="tl-date">2021</span> School of Health Innovation — Entrepreneurship in Healthcare</li>
          <li><span class="tl-date">2021</span> Implementation of Interventions and Implementation Research</li>
          <li><span class="tl-date">2021</span> Advanced Statistical Topics in Health Research A</li>
          <li><span class="tl-date">2021</span> 7th Y-ECCO Basic Science Workshop</li>
          <li><span class="tl-date">2020</span> English for Researchers — Writing Level 2</li>
          <li><span class="tl-date">2020</span> Responsible Conduct of Research 1</li>
          <li><span class="tl-date">2017</span> Evidence-Based Medicine Course · UEG, Barcelona</li>
          <li><span class="tl-date">2017</span> Immunology Across Borders · Janssen-Cilag, Milano</li>
        </ul>
      </details>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Append expertise + courses CSS**

```css
/* ===== Expertise ===== */
.comp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 24px; }
.comp-card { background: #fff; border: 1px solid var(--rule); border-radius: 8px; padding: 22px; position: relative; }
.comp-num { position: absolute; top: 16px; right: 18px; font-family: 'Fraunces', serif; font-size: 28px; color: var(--accent); opacity: .5; line-height: 1; }
.comp-card h3 { margin: 0 0 8px; font-size: 17px; }
.comp-card p { font-size: 13px; line-height: 1.55; color: var(--ink-2); }

.courses { margin-top: 32px; border-top: 1px solid var(--rule); padding-top: 18px; }
.courses summary { cursor: pointer; padding: 8px 0; display: flex; align-items: baseline; gap: 12px; list-style: none; font-size: 13px; color: var(--ink-2); }
.courses summary::-webkit-details-marker { display: none; }
.courses summary::after { content: ' +'; margin-left: auto; color: var(--accent); font-family: 'JetBrains Mono', monospace; font-weight: 700; }
.courses[open] summary::after { content: ' −'; }
.courses-toggle-text { font-weight: 500; }
.course-list { margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
.course-list li { display: grid; grid-template-columns: 56px 1fr; gap: 12px; font-size: 12px; color: var(--ink-2); padding: 6px 0; border-bottom: 1px solid var(--rule); }
@media (max-width: 768px) { .comp-grid, .course-list { grid-template-columns: 1fr; } }
```

- [ ] **Step 3: Visual verification**

Reload. Three numbered competency cards in a row. Below: a "Continuing education / 17 courses" expand toggle. Click it — should open into a 2-col list of dated courses.

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "Expertise: 3 numbered cards + collapsible 17-course list"
```

### Task 11: Major research projects (pinned scroll)

**Files:**
- Modify: `index.html`
- Modify: `style.css`

This section uses ScrollTrigger pinning configured in Task 21 — for now we just lay out the markup and styling.

- [ ] **Step 1: Append section**

```html
<section class="section section-research" id="research">
  <div class="container section-inner">
    <div class="section-gutter"><span class="eyebrow">// 06  Research</span></div>
    <div class="section-body">
      <h2>Major Research Projects</h2>
      <div class="research-stack">
        <article class="research-card" data-research-idx="0">
          <span class="research-tag">Endoscopy AI</span>
          <h3>ENACT</h3>
          <p>Endoscopic Add-on System for Ulcerative Colitis patients. Real-time CNN inference on live endoscopy video to augment clinician scoring.</p>
        </article>
        <article class="research-card" data-research-idx="1">
          <span class="research-tag">Computer Vision</span>
          <h3>Presager Project</h3>
          <p>Application of computer science for disease classification and prediction in IBD using deep learning.</p>
        </article>
        <article class="research-card" data-research-idx="2">
          <span class="research-tag">Biobank</span>
          <h3>Danish IBD Biobank (DIB)</h3>
          <p>National biobanking initiative investigating biological treatment outcomes in Inflammatory Bowel Disease.</p>
        </article>
        <article class="research-card" data-research-idx="3">
          <span class="research-tag">Multinational Registry</span>
          <h3>DICE Project</h3>
          <p>Multinational registry study mapping IBD epidemiology across nine epidemiologic stage 3 nations.</p>
        </article>
        <article class="research-card" data-research-idx="4">
          <span class="research-tag">Clinical Trial</span>
          <h3>EASI Trial</h3>
          <p>Randomized clinical trial evaluating a single 1600 mg tablet regimen of 5-Aminosalicylate for Ulcerative Colitis.</p>
        </article>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Append research CSS**

```css
/* ===== Research projects ===== */
.section-research { background: linear-gradient(180deg, var(--paper), #fff 50%, var(--paper)); }
.research-stack { display: flex; flex-direction: column; gap: 12px; margin-top: 24px; }
.research-card { background: #fff; border: 1px solid var(--rule); border-left: 3px solid var(--accent); border-radius: 6px; padding: 22px 26px; transition: transform .25s ease, box-shadow .25s ease; }
.research-card:hover { transform: translateX(4px); box-shadow: 0 8px 24px rgba(0,0,0,.06); }
.research-tag { display: inline-block; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--accent); letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 8px; }
.research-card h3 { margin: 0 0 8px; font-size: 20px; }
.research-card p { font-size: 14px; line-height: 1.6; color: var(--ink-2); margin: 0; }
```

- [ ] **Step 3: Visual verification**

Reload. Stack of 5 white cards with red left-borders, mono tags, serif titles. Hover slides right slightly.

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "Research projects: stacked accent-bordered cards (pinning in Task 21)"
```

### Task 12: Latest publications

**Files:**
- Modify: `index.html`
- Modify: `style.css`

- [ ] **Step 1: Append section with empty container + static fallback**

```html
<section class="section" id="latest-publications">
  <div class="container section-inner">
    <div class="section-gutter"><span class="eyebrow">// 07  Latest</span></div>
    <div class="section-body">
      <h2>Latest publications</h2>
      <p class="section-sub">Most recent work — automatically refreshed from OpenAlex on every page load.</p>
      <ul class="pubs-preview" id="latest-pubs-list" data-pubs-count="5" data-pubs-sort="publication_date:desc">
        <li class="pub-row pub-row--placeholder">
          <span class="pub-year">—</span>
          <div>
            <strong>Loading publications from OpenAlex…</strong>
            <span class="pub-meta">If this stays here, the API may be slow — full list is still available on the Publications page.</span>
          </div>
        </li>
      </ul>
      <a href="publications.html" class="btn btn-outline" style="margin-top:20px">See all publications →</a>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Append publications preview CSS**

```css
/* ===== Selected publications preview ===== */
.section-sub { font-size: 13px; color: var(--ink-2); margin-bottom: 20px; }
.pubs-preview { display: flex; flex-direction: column; gap: 0; border-top: 1px solid var(--rule); }
.pub-row { display: grid; grid-template-columns: 60px 1fr; gap: 18px; padding: 16px 0; border-bottom: 1px solid var(--rule); align-items: baseline; }
.pub-row--placeholder { color: var(--ink-3); font-style: italic; }
.pub-year { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--accent); letter-spacing: .5px; font-weight: 500; }
.pub-row strong { display: block; font-weight: 500; color: var(--ink); font-size: 14px; line-height: 1.45; font-family: 'Fraunces', serif; }
.pub-meta { display: block; font-size: 12px; color: var(--ink-2); margin-top: 4px; font-style: italic; }
```

- [ ] **Step 3: Visual verification**

Reload. Placeholder "Loading publications from OpenAlex…" row shows. Real data fills in after Task 17.

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "Latest publications section: container with loading fallback"
```

### Task 13: Speaking, Service & Outreach

**Files:**
- Modify: `index.html`
- Modify: `style.css`

- [ ] **Step 1: Append section with 5 sub-blocks**

Content from `Poster, abstracts, foredrag mm.docx` and `Curriculum Vitae 2026.docx` (spec § 4.4).

```html
<section class="section" id="speaking">
  <div class="container section-inner">
    <div class="section-gutter"><span class="eyebrow">// 08  Speaking · Service · Outreach</span></div>
    <div class="section-body">
      <h2>Speaking, service &amp; outreach</h2>

      <div class="sso-block">
        <h3 class="sso-title">Invited talks</h3>
        <ul class="sso-list">
          <li><span class="tl-date">2025</span> "AI i klinisk gastroenterologi — lær at gennemskue forskningen og teknologien bag"</li>
          <li><span class="tl-date">2025</span> "AI in Medicine: Hype, Harm, and How to Get It Right" — webinar</li>
          <li><span class="tl-date">2025</span> JnJ Winter Conference</li>
          <li><span class="tl-date">2024</span> Dansk Selskab for Ambulant Kirurgi &amp; Gastroenterologi · Årsmøde</li>
          <li><span class="tl-date">2023</span> European Conference of Young Gastroenterologists</li>
          <li><span class="tl-date">2023</span> Basic Treatment of the Patient with Ulcerative Colitis</li>
          <li><span class="tl-date">2022</span> IBDeas AI Symposium</li>
          <li><span class="tl-date">2021</span> AI in Inflammatory Bowel Disease</li>
        </ul>
        <p class="sso-aux">Also: Oral presenter / chair at Digestive Disease Week, UEGW, and the ECCO Conference.</p>
      </div>

      <div class="sso-block">
        <h3 class="sso-title">Advisory boards</h3>
        <ul class="sso-list">
          <li><span class="tl-date">2025 →</span> Takeda Pharma — ongoing</li>
          <li><span class="tl-date">2022</span> Tillotts Pharma AB</li>
        </ul>
      </div>

      <div class="sso-block">
        <h3 class="sso-title">Peer review</h3>
        <p class="sso-text">Frequent reviewer for <strong>American Journal of Gastroenterology</strong>, <strong>Journal of Crohn and Colitis</strong>, <strong>Gastroenterology</strong>, and <strong>GUT</strong>.</p>
      </div>

      <div class="sso-block">
        <h3 class="sso-title">Supervision &amp; mentorship</h3>
        <p class="sso-text">Supervisor / co-supervisor for several bachelor and master students in Medicine and Data Science. Co-supervisor of 2 PhD students in Medicine and Data Science.</p>
      </div>

      <div class="sso-block">
        <h3 class="sso-title">Media</h3>
        <p class="sso-text">Contributions to BestPractice, Journal of Crohn and Colitis, Medicinsk Tidsskrift, Nyheder fra Hvidovre Hospital, CCF Magasinet.</p>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Append SSO CSS**

```css
/* ===== Speaking · Service · Outreach ===== */
.sso-block { padding: 24px 0; border-bottom: 1px solid var(--rule); }
.sso-block:first-of-type { padding-top: 12px; }
.sso-block:last-child { border-bottom: 0; }
.sso-title { font-size: 13px; font-weight: 600; color: var(--ink); letter-spacing: 1px; text-transform: uppercase; margin-bottom: 14px; font-family: 'Inter', sans-serif; }
.sso-list { display: flex; flex-direction: column; }
.sso-list li { display: grid; grid-template-columns: 80px 1fr; gap: 14px; font-size: 13px; color: var(--ink-2); padding: 6px 0; line-height: 1.5; }
.sso-aux { font-size: 12px; color: var(--ink-3); margin-top: 12px; font-style: italic; }
.sso-text { font-size: 14px; color: var(--ink-2); line-height: 1.65; }
.sso-text strong { color: var(--ink); font-weight: 600; }
```

- [ ] **Step 3: Visual verification**

Reload. Five SSO sub-blocks stacked with thin rules between, each with an uppercase title and a list/paragraph.

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "Speaking, Service & Outreach: 5 sub-blocks (talks, advisory, peer review, supervision, media)"
```

### Task 14: Contact + affiliations + footer

**Files:**
- Modify: `index.html` (replace existing `<footer>` and `#toTopBtn`)
- Modify: `style.css`

- [ ] **Step 1: Replace existing footer with contact section + minimal footer**

```html
<section class="section contact" id="contact">
  <div class="container section-inner">
    <div class="section-gutter"><span class="eyebrow">// 09  Contact</span></div>
    <div class="section-body">
      <h2>Get in touch</h2>
      <p class="contact-lead">For research collaborations, supervision, advisory, or speaking — write me directly.</p>
      <ul class="contact-list">
        <li><span class="contact-key">Email</span><a href="mailto:bobby.lo@regionh.dk">bobby.lo@regionh.dk</a></li>
        <li><span class="contact-key">LinkedIn</span><a href="https://www.linkedin.com/in/bobby-lo-md/" target="_blank" rel="noopener">linkedin.com/in/bobby-lo-md</a></li>
      </ul>

      <div class="affiliations">
        <span class="eyebrow" style="color:var(--ink-3)">Affiliations</span>
        <div class="aff-marks">
          <span>Copenhagen University Hospital · Hvidovre</span>
          <span>Bispebjerg Hospital</span>
          <span>GAIN</span>
          <span>Copenhagen Center for Inflammatory Bowel Disease</span>
          <span>University of Copenhagen</span>
        </div>
      </div>
    </div>
  </div>
</section>

<footer class="site-footer">
  <div class="container site-footer-inner">
    <span>&copy; 2026 Bobby Zhao Sheng Lo.</span>
    <span class="site-footer-meta">All rights reserved.</span>
  </div>
</footer>
<button id="toTopBtn" title="Go to top" aria-label="Scroll to top">↑</button>
```

- [ ] **Step 2: Append contact + footer + to-top CSS**

```css
/* ===== Contact ===== */
.contact { border-bottom: 0; padding-bottom: 48px; }
.contact-lead { font-size: 16px; color: var(--ink-2); line-height: 1.6; max-width: 520px; margin-bottom: 24px; }
.contact-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 36px; }
.contact-list li { display: grid; grid-template-columns: 90px 1fr; align-items: baseline; gap: 14px; font-size: 15px; padding: 8px 0; border-bottom: 1px solid var(--rule); }
.contact-key { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-3); letter-spacing: 1.5px; text-transform: uppercase; }
.contact-list a { color: var(--ink); border-bottom: 1px solid transparent; transition: border-color .2s; }
.contact-list a:hover { color: var(--accent); border-color: var(--accent); }

.affiliations { padding-top: 24px; border-top: 1px solid var(--rule); }
.aff-marks { display: flex; flex-wrap: wrap; gap: 8px 22px; margin-top: 12px; }
.aff-marks span { font-size: 12px; color: var(--ink-2); padding: 4px 0; }

/* ===== Footer ===== */
.site-footer { background: var(--paper-dark); color: var(--paper); padding: 24px 0; font-size: 12px; }
.site-footer-inner { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.site-footer-meta { color: var(--ink-3); }

/* ===== To-top button ===== */
#toTopBtn {
  display: none; position: fixed; bottom: 24px; right: 24px;
  width: 44px; height: 44px; border-radius: 50%;
  background: var(--ink); color: var(--paper);
  border: 0; cursor: pointer; font-size: 18px;
  box-shadow: 0 8px 24px rgba(0,0,0,.15);
  transition: background .2s, transform .2s;
  align-items: center; justify-content: center; z-index: 90;
}
#toTopBtn:hover { background: var(--accent); transform: translateY(-3px); }
```

- [ ] **Step 3: Visual verification**

Reload. Big serif "Get in touch" + lead paragraph + email/LinkedIn rows. Affiliations strip below with wordmarks. Slim black footer at the bottom. To-top button still in bottom-right.

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "Contact + affiliations + footer + to-top button restyled"
```

### Task 15: Close `</main>` and final structural check

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Ensure all sections are inside `<main>` and document is well-formed**

Confirm structure (top-down inside `<body>`):

```
<nav>...</nav>
<!-- BANNER_START -->...<!-- BANNER_END -->
<main>
  <section class="hero">...
  <section class="metrics">...
  <section class="section" id="about">...
  <section class="section" id="currently">...
  <section class="section" id="experience">...
  <section class="section" id="education">...
  <section class="section" id="expertise">...
  <section class="section section-research" id="research">...
  <section class="section" id="selected-publications">...
  <section class="section" id="speaking">...
  <section class="section contact" id="contact">...
</main>
<footer class="site-footer">...</footer>
<button id="toTopBtn">...</button>
<article class="sr-only">... <!-- SEO crawler article, KEEP -->
<script src="script.js"></script>
```

If `<main>` is missing or mis-closed, fix it.

- [ ] **Step 2: Run HTML validation in browser DevTools**

Reload. Console should be clean. Use DevTools → Elements to verify the SEO `<article class="sr-only">` block is still present (must not have been dropped during the rewrite).

- [ ] **Step 3: Commit (only if a fix was made)**

```bash
git add index.html
git commit -m "Wrap sections in <main> and verify SEO sr-only article preserved" || echo "no fix needed"
```

---

## Phase 3: JavaScript — OpenAlex fetch + GSAP motion

### Task 16: OpenAlex client — populate metrics

**Files:**
- Modify: `script.js` (append a new IIFE at the bottom)

- [ ] **Step 1: Append the OpenAlex metrics fetch**

Open `script.js`. **Keep all existing code intact** (collapsibles, `filterPublications`, `toTopBtn`, `toggleAll` — the publications page depends on them). Append at the end:

```javascript
// ===== OpenAlex live metrics (home page only) =====
(function initOpenAlexMetrics() {
  const root = document.querySelectorAll('[data-metric]');
  if (!root.length) return; // not on home page

  const AUTHOR_ID = 'a5078664290';
  const MAILTO = 'bobby.lo@regionh.dk';
  const URL = `https://api.openalex.org/authors/${AUTHOR_ID}?mailto=${MAILTO}`;

  function animateCount(el, target) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !window.gsap) { el.textContent = target.toLocaleString(); return; }
    const obj = { v: 0 };
    window.gsap.to(obj, {
      v: target, duration: 1.2, ease: 'power2.out',
      onUpdate: () => { el.textContent = Math.round(obj.v).toLocaleString(); }
    });
  }

  fetch(URL)
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(data => {
      const stats = data.summary_stats || {};
      const values = {
        works:      data.works_count || 0,
        citations:  data.cited_by_count || 0,
        h_index:    stats.h_index || 0,
        i10_index:  stats.i10_index || 0,
      };
      root.forEach(card => {
        const key = card.getAttribute('data-metric');
        const valueEl = card.querySelector('.metric-value');
        if (valueEl && key in values) {
          // wait until card enters viewport, then animate
          if ('IntersectionObserver' in window) {
            const io = new IntersectionObserver((entries) => {
              entries.forEach(e => {
                if (e.isIntersecting) { animateCount(valueEl, values[key]); io.disconnect(); }
              });
            }, { threshold: 0.4 });
            io.observe(card);
          } else {
            animateCount(valueEl, values[key]);
          }
        }
      });
    })
    .catch(err => {
      console.warn('OpenAlex metrics fetch failed:', err);
      // em-dash placeholders stay
    });
})();
```

- [ ] **Step 2: Reload and verify**

Open `http://localhost:8000/`. DevTools → Network → look for the `api.openalex.org` request (200). Scroll to metrics section. Numbers should count up from 0 to the real values over ~1.2s.

If `prefers-reduced-motion` is on (DevTools → Rendering → Emulate prefers-reduced-motion → reduce), numbers should appear instantly without animation.

- [ ] **Step 3: Commit**

```bash
git add script.js
git commit -m "Live OpenAlex metrics with count-up animation and reduced-motion fallback"
```

### Task 17: OpenAlex client — populate latest publications

**Files:**
- Modify: `script.js` (append another IIFE)

- [ ] **Step 1: Append the latest publications fetch**

Reads count + sort from the `<ul>` data attributes set in Task 12. Sort is configurable via `data-pubs-sort` so a future "Most cited" toggle is one line of HTML away.

```javascript
// ===== OpenAlex live latest publications (home page only) =====
(function initLatestPublications() {
  const list = document.getElementById('latest-pubs-list');
  if (!list) return;
  const count = Math.max(1, parseInt(list.getAttribute('data-pubs-count') || '5', 10));
  const sort  = list.getAttribute('data-pubs-sort') || 'publication_date:desc';

  const AUTHOR_ID = 'a5078664290';
  const MAILTO = 'bobby.lo@regionh.dk';
  const URL = `https://api.openalex.org/works?filter=authorships.author.id:${AUTHOR_ID}&per_page=${count}&sort=${encodeURIComponent(sort)}&mailto=${MAILTO}`;

  function escapeHTML(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  fetch(URL)
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(data => {
      const items = (data.results || []).slice(0, count);
      if (!items.length) return;
      list.innerHTML = items.map(p => {
        const year = p.publication_year || '—';
        const title = escapeHTML(p.title || 'Untitled');
        const venue = escapeHTML(p?.primary_location?.source?.display_name || 'Unknown venue');
        const cites = p.cited_by_count || 0;
        const citesStr = cites > 0 ? ` · ${cites} citation${cites === 1 ? '' : 's'}` : '';
        return `<li class="pub-row">
          <span class="pub-year">${year}</span>
          <div>
            <strong>${title}</strong>
            <span class="pub-meta">${venue}${citesStr}</span>
          </div>
        </li>`;
      }).join('');
    })
    .catch(err => {
      console.warn('OpenAlex publications fetch failed:', err);
      const placeholder = list.querySelector('.pub-row--placeholder strong');
      if (placeholder) placeholder.textContent = 'Could not load publications right now.';
    });
})();
```

- [ ] **Step 2: Reload and verify**

Reload. Scroll to "Latest publications". The placeholder loading row should be replaced by 5 most-recent works in `<year> | <title> | <venue> [· N citations if any]` form, newest at top.

- [ ] **Step 3: Commit**

```bash
git add script.js
git commit -m "Live OpenAlex latest publications (top 5 by publication date)"
```

### Task 18: GSAP init + reduced-motion guard

**Files:**
- Modify: `script.js`

- [ ] **Step 1: Append a shared init IIFE that handles registration + guard**

```javascript
// ===== GSAP motion (home page only, guarded) =====
(function initMotion() {
  if (!document.getElementById('hero')) return;          // not home page
  if (!window.gsap || !window.ScrollTrigger) {
    console.info('GSAP not loaded — skipping motion');
    return;
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) { console.info('Reduced motion — skipping GSAP timelines'); return; }

  window.gsap.registerPlugin(window.ScrollTrigger);

  // Hand off to per-effect helpers added in later tasks
  if (typeof window.__motion === 'function') window.__motion();
})();
```

- [ ] **Step 2: Reload and verify**

Reload. Console: should see no errors. With reduced-motion off, you'll see no log; with it on (DevTools Rendering), you'll see "Reduced motion — skipping GSAP timelines".

- [ ] **Step 3: Commit**

```bash
git add script.js
git commit -m "GSAP init with reduced-motion guard; effects added in subsequent tasks"
```

### Task 19: Hero entrance — word-by-word reveal + portrait parallax + bg numeral scrub

**Files:**
- Modify: `script.js`

- [ ] **Step 1: Define `window.__motion` (or rewrite Task 18's hook to call directly)**

Append to `script.js`:

```javascript
// ===== Motion effects =====
window.__motion = function () {
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;

  // -- Hero: word-by-word reveal --
  const heroName = document.querySelector('.hero-name');
  if (heroName) {
    // Wrap each word in a span (manual implementation — works without paid SplitText)
    const wrapWords = (el) => {
      el.innerHTML = el.innerHTML.replace(/(\S+)/g, '<span class="word">$1</span>');
    };
    wrapWords(heroName);
    gsap.from(heroName.querySelectorAll('.word'), {
      y: 24, opacity: 0, duration: 0.7, stagger: 0.07, ease: 'power3.out', delay: 0.1
    });
    // also reveal eyebrow + role + buttons
    gsap.from('.hero .eyebrow, .hero-role, .hero-actions, .hero-portrait', {
      y: 16, opacity: 0, duration: 0.6, stagger: 0.12, ease: 'power3.out', delay: 0.5
    });
  }

  // -- Hero: portrait parallax --
  const portrait = document.querySelector('.hero-portrait');
  if (portrait) {
    gsap.to(portrait, {
      yPercent: -8,
      ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
    });
  }

  // -- Hero: background numeral scrub --
  const bgNum = document.querySelector('.hero-bg-numeral');
  if (bgNum) {
    gsap.to(bgNum, {
      xPercent: -6, yPercent: -4, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
    });
  }
};
```

> Note: `.word` spans needed for the CSS animation. Add this rule once to `style.css`:
> ```css
> .word { display: inline-block; }
> ```

- [ ] **Step 2: Add the `.word` rule to `style.css`**

Append:

```css
.word { display: inline-block; }
```

- [ ] **Step 3: Reload and verify**

Reload. Hero name should animate word-by-word from bottom + fade in. Eyebrow, role, buttons, and portrait should fade up sequentially after. Scroll — portrait drifts up slightly, background "2026" drifts left/up.

- [ ] **Step 4: Commit**

```bash
git add script.js style.css
git commit -m "Motion: hero word-reveal + portrait parallax + bg numeral scrub"
```

### Task 20: Scrubbed fade-up for section cards/rows

**Files:**
- Modify: `script.js` (extend `window.__motion`)

- [ ] **Step 1: Add a generic scrub-fade-up helper**

Inside the existing `window.__motion` function (above the closing `};`), append:

```javascript
  // -- Scrubbed fade-up for cards, rows, and prose --
  const animateTargets = [
    '.role-card', '.comp-card', '.timeline li', '.sso-block',
    '.pub-row', '.aff-marks span', '.contact-list li', '.section-body > h2', '.prose p'
  ].join(',');
  gsap.utils.toArray(animateTargets).forEach((el) => {
    gsap.from(el, {
      y: 18, opacity: 0, duration: 0.7, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none reverse' }
    });
  });
```

> `toggleActions: 'play none none reverse'` plays on enter and reverses on leave-back. Snappy but not scrubbed (scrubbed feels lazy on text rows). Pinned section gets its own treatment in Task 21.

- [ ] **Step 2: Reload and verify**

Reload. Scroll slowly through the page. Each card / row / paragraph should fade up as it enters the viewport.

- [ ] **Step 3: Commit**

```bash
git add script.js
git commit -m "Motion: viewport-triggered fade-up for cards, rows, prose"
```

### Task 21: Research projects — pinned reveal

**Files:**
- Modify: `script.js` (extend `window.__motion`)
- Modify: `style.css` (tweak `.section-research` for pin spacing)

- [ ] **Step 1: Add pinned ScrollTrigger for the research stack**

Append inside `window.__motion`:

```javascript
  // -- Research projects: pinned stack reveal --
  const researchSection = document.getElementById('research');
  const cards = researchSection ? researchSection.querySelectorAll('.research-card') : [];
  if (researchSection && cards.length) {
    // Pre-hide cards
    gsap.set(cards, { opacity: 0, y: 40 });
    // Pin the section, reveal cards one by one over scroll
    ScrollTrigger.create({
      trigger: researchSection,
      start: 'top 10%',
      end: '+=' + (cards.length * 240),
      pin: true,
      pinSpacing: true,
      scrub: 0.5,
      onUpdate: (self) => {
        const progress = self.progress; // 0..1
        cards.forEach((card, i) => {
          const t = (progress * cards.length) - i; // 0..1 reveal window per card
          const opacity = Math.max(0, Math.min(1, t * 1.5));
          const y = Math.max(0, 40 * (1 - Math.min(1, t * 1.5)));
          card.style.opacity = opacity;
          card.style.transform = `translateY(${y}px)`;
        });
      }
    });
  }
```

- [ ] **Step 2: Reload and verify**

Reload, scroll to Research section. It should pin in place, and as you continue scrolling, the 5 cards reveal one by one. After the last card is fully in, scrolling continues normally.

> If pin feels jittery on a trackpad, drop scrub to a numeric value (e.g. 1) for more easing.

- [ ] **Step 3: Commit**

```bash
git add script.js
git commit -m "Motion: research projects pinned reveal — cards appear sequentially"
```

### Task 22: Sticky gutter eyebrows already implemented via CSS — verify

**Files:**
- Verify only, no edits expected.

- [ ] **Step 1: Verify `.section-gutter` is sticky**

In Task 6 we set `.section-gutter { position: sticky; top: 100px; }`. Reload, scroll through About / Currently / Experience etc. — each `// NN  Label` eyebrow should pin at the top of its section while the body scrolls past, then release when the section ends.

If they don't pin on Chrome/Firefox, check that the parent `.section-inner` is not `overflow: hidden` (sticky needs a scrollable ancestor with no overflow clip). If it is, remove that rule.

- [ ] **Step 2: If a fix was needed, commit it**

```bash
git add style.css
git commit -m "Verify sticky gutter eyebrows render correctly" || echo "no fix needed"
```

---

## Phase 4: Publications page generator

### Task 23: Rewrite HTML emitted by `generate_publications.py`

**Files:**
- Modify: `generate_publications.py`
- Generated artifact: `publications.html` (will be regenerated; do not hand-edit)
- Modify: `style.css` (add publications-page-specific component CSS)

- [ ] **Step 1: Remove the ticker generation block entirely**

In `generate_publications.py`, locate and **delete**:

1. The block that builds `banner_items` / `banner_content` / `banner_html` (~lines 104–122).
2. Any reference to `{banner_html}` or `<!-- BANNER_START -->` inside the publications.html `f.write(...)` block — replace with nothing.
3. The entire `# === Update index.html Banner ===` block at the bottom of the script (~lines 299–314, starting with `try:` and including the `re.sub` of `BANNER_START/END`).

After deletion, the script should:
- Fetch author + publications from OpenAlex (unchanged)
- Compute `top_highlights` (unchanged)
- Write `publications.html` only (with new markup per following steps)
- Print one success line: `Success: publications.html generated successfully from OpenAlex data.`

Verify the script no longer mentions banner:
```bash
grep -n -E "(banner|BANNER)" generate_publications.py
```
Expected: no output.

- [ ] **Step 2: Update the `<head>` block to include the new fonts + GSAP (optional on publications page)**

In the `f.write(f"""<!DOCTYPE html>...""")` for the publications page head, immediately before `</head>`, add inside the f-string:

```python
    <script defer src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
    <script defer src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
```

(SplitText not needed on publications page.) Fonts are loaded via `style.css` `@import`, so no font links are required here.

- [ ] **Step 3: Update the nav block**

Replace the existing `<nav>...` in the publications HTML emission with the same nav markup used in `index.html` (from Task 3), but with `class="active"` on the Publications link instead of Home.

- [ ] **Step 4: Rewrite the metrics card markup**

Find the `f.write(f"""<!DOCTYPE html>...""")` section that emits the metrics card (~line 200). Replace:

```python
    <div class="card metrics" style="margin-top: 0;">
        <section>
            <h2>Scholar Metrics</h2>
            <ul>
                <li><strong>Total citations:</strong> {citations}</li>
                <li><strong>h-index:</strong> {h_index}</li>
                <li><strong>i10-index:</strong> {i10_index}</li>
                <li style="margin-top: 1rem;"><a href="{openalex_url}" target="_blank" class="button">View OpenAlex Profile</a></li>
            </ul>
        </section>
    </div>
```

With:

```python
    <section class="section metrics-page">
      <div class="container section-inner">
        <div class="section-gutter"><span class="eyebrow">// 01  Scholar metrics</span></div>
        <div class="section-body">
          <h2>Scholar metrics</h2>
          <div class="metrics-inner" style="margin-top:24px">
            <div class="metric"><div class="metric-value">{citations:,}</div><div class="metric-label">Citations</div></div>
            <div class="metric"><div class="metric-value">{h_index}</div><div class="metric-label">h-index</div></div>
            <div class="metric"><div class="metric-value">{i10_index}</div><div class="metric-label">i10-index</div></div>
          </div>
          <a href="{openalex_url}" target="_blank" rel="noopener" class="btn btn-outline" style="margin-top:24px">View OpenAlex profile →</a>
        </div>
      </div>
    </section>
```

- [ ] **Step 5: Rewrite the highlighted-publications block**

Find the `<div class="card highlights">` block. Replace with:

```python
    <section class="section">
      <div class="container section-inner">
        <div class="section-gutter"><span class="eyebrow">// 02  Highlighted</span></div>
        <div class="section-body">
          <h2>Highlighted publications</h2>
          <ul class="pubs-preview">
""")
        for pub, cite_count, venue, year in top_highlights:
            title = pub.get('title', 'Untitled')
            authors = highlight_name_short(pub.get('authorships', []))
            f.write(f"""            <li class="pub-row">
              <span class="pub-year">{year}</span>
              <div>
                <strong>{title}</strong>
                <span class="pub-meta">{authors} · {venue} · {cite_count} citation{'' if cite_count == 1 else 's'}</span>
              </div>
            </li>
""")
        f.write("""          </ul>
        </div>
      </div>
    </section>
```

> All inline `style="..."` attributes that referenced `--golden-amber`/`--cactus-green` are removed. The `.pub-row` class is defined in style.css (Task 12).

- [ ] **Step 6: Rewrite the year-collapsible block**

Find the `<div class="card pubs">` block. Replace with:

```python
    f.write("""
    <section class="section">
      <div class="container section-inner">
        <div class="section-gutter"><span class="eyebrow">// 03  All publications</span></div>
        <div class="section-body">
          <h2>Peer-reviewed publications</h2>
          <input type="text" id="searchBox" onkeyup="filterPublications()" placeholder="Search publications…" class="pubs-search" />
          <button id="toggleAllBtn" onclick="toggleAll()" class="btn btn-outline" style="margin-bottom:18px">Expand All</button>
          <div id="publicationsList">
""")

    for year in sorted(publications_by_year.keys(), key=lambda y: int(y) if str(y).isdigit() else 0, reverse=True):
        pubs = publications_by_year[year]
        f.write(f"""
            <div class="collapsible-section">
              <button class="collapsible">{year}</button>
              <div class="content">
                <ul class="pubs-preview">
        """)
        for pub in pubs:
            title = pub.get('title', 'Untitled')
            authors = highlight_name(pub.get('authorships', []))
            primary_location = pub.get('primary_location')
            source = primary_location.get('source') if primary_location else None
            venue = source.get('display_name') if source else 'Unknown journal or conference'
            f.write(f"""                  <li class="pub-row">
                    <span class="pub-year">{year}</span>
                    <div>
                      <strong>{title}</strong>
                      <span class="pub-meta">{authors} · {venue}</span>
                    </div>
                  </li>
""")
        f.write("""                </ul>
              </div>
            </div>
        """)

    f.write("""
          </div>
        </div>
      </div>
    </section>
""")
```

> JS hooks `filterPublications()`, `toggleAll()`, `.collapsible` toggle keep working — the new wrapper still has `.collapsible-section`, `.collapsible`, `.content` classes and a `<button>` element. The search input is now styled via the shared `.pubs-search` class.

- [ ] **Step 7: Update publications.html footer to match home page footer**

Replace the existing footer/sr-only/script-src block at the bottom of the f.write template with:

```python
    f.write("""
    </main>

    <footer class="site-footer">
      <div class="container site-footer-inner">
        <span>&copy; 2026 Bobby Zhao Sheng Lo.</span>
        <span class="site-footer-meta">All rights reserved.</span>
      </div>
    </footer>
    <button id="toTopBtn" title="Go to top" aria-label="Scroll to top">↑</button>

    <article class="sr-only">
      <h1>Comprehensive Research Profile of Bobby Zhao Sheng Lo in Denmark</h1>
      <p>Bobby Zhao Sheng Lo is a leading MD, PhD, and Post-Doc researcher based in Denmark, specializing in Inflammatory Bowel Disease (IBD). He is the head and leader of the Gastrointestinal Artificial Intelligence Network (GAIN) at Copenhagen University Hospital Hvidovre.</p>
      <p>Notable IBD research projects in Denmark include the ENACT Endoscopic Add-on System for Ulcerative Colitis, the Presager Project for AI-driven disease classification, the Danish IBD Biobank (DIB), the multinational DICE Project, and the EASI Trial.</p>
    </article>

    <script src="script.js"></script>
</body>
</html>
""")
```

> Wrap all the section emissions in a `<main class="container">` opening just above the metrics section (around step 4), then close it here.

- [ ] **Step 8: Add publications-page-specific CSS to `style.css`**

```css
/* ===== Publications page extras ===== */
.pubs-search {
  width: 100%; padding: 12px 14px; font-size: 14px;
  border: 1px solid var(--rule); border-radius: 8px;
  background: #fff; color: var(--ink); font-family: inherit;
  margin-bottom: 12px; outline: none; transition: border-color .2s, box-shadow .2s;
}
.pubs-search:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(196,48,43,.12); }

.collapsible-section { background: transparent; margin: 0; }
.collapsible {
  width: 100%; text-align: left; background: var(--paper-2); color: var(--ink);
  border: 1px solid var(--rule); border-radius: 6px; padding: 14px 18px;
  font-family: 'Fraunces', serif; font-size: 18px; font-weight: 500; cursor: pointer;
  display: flex; justify-content: space-between; align-items: center; margin-top: 14px;
  transition: background .2s, border-color .2s;
}
.collapsible:hover, .collapsible.active { background: #fff; border-color: var(--accent); }
.collapsible::after {
  content: '+'; color: var(--accent); font-family: 'JetBrains Mono', monospace;
  font-weight: 700; font-size: 16px;
}
.collapsible.active::after { content: '−'; }
.content { display: none; padding: 14px 0 6px; }
.content .pubs-preview { border-top: 0; }
```

- [ ] **Step 9: Run the generator locally**

```bash
python generate_publications.py
```

Expected output (single line):
```
Success: publications.html generated successfully from OpenAlex data.
```

Verify `index.html` was NOT modified:
```bash
git diff --stat index.html
```
Expected: empty.

- [ ] **Step 10: View `http://localhost:8000/publications.html` and verify**

- Search input works (`filterPublications`)
- Expand all button works (`toggleAll`)
- Year collapsibles toggle
- Highlighted publications render in the new pub-row style
- No console errors

- [ ] **Step 11: Commit**

```bash
git add generate_publications.py publications.html style.css
git commit -m "Restyle publications page via generator + drop banner code

Replaces all inline style attributes with semantic classes. Removes
the rolling ticker block and the index.html banner injection block
per spec § 4.5. Year-collapsible UI preserves filterPublications()/
toggleAll() JS hooks."
```

### Task 24: Remove backwards-compat CSS aliases now that generator no longer emits inline styles

**Files:**
- Modify: `style.css`

- [ ] **Step 1: Confirm generator output no longer uses old variable names**

```bash
grep -E "(golden-amber|cactus-green|dusty-blue|midnight-blue|sky-teal|parchment-beige|soft-cyan|deep-charcoal|warm-brick|blush-pink|glass-bg)" publications.html | head -20
```

Expected: no output. If there are matches, find and remove the corresponding inline `style="..."` in `generate_publications.py`, regenerate (`python generate_publications.py`), and re-run this grep.

- [ ] **Step 2: Delete the alias block from `style.css`**

Find and delete this section in `style.css`:

```css
  /* backwards-compat aliases for generate_publications.py inline styles
     remove once Task 23 lands */
  --golden-amber:    var(--accent);
  --cactus-green:    var(--accent-2);
  --dusty-blue:      var(--ink-3);
  --midnight-blue:   var(--ink);
  --sky-teal:        var(--ochre);
  --parchment-beige: var(--paper);
  --soft-cyan:       var(--ink-3);
  --deep-charcoal:   var(--ink);
  --warm-brick:      var(--accent);
  --blush-pink:      var(--accent);
  --glass-bg:        var(--paper);
```

- [ ] **Step 3: Reload home + publications page**

Both pages should look identical to before (no styles affected because the aliases are no longer referenced).

- [ ] **Step 4: Commit**

```bash
git add style.css
git commit -m "Remove backwards-compat CSS variable aliases (generator updated in Task 23)"
```

---

## Phase 5: Verification

### Task 25: Cross-browser + mobile + reduced-motion check

**Files:**
- No code edits; observations only.

- [ ] **Step 1: Test in Chrome, Firefox, and Safari (or Edge if Safari unavailable)**

Open `http://localhost:8000/` in each browser. Walk top-to-bottom:
- Hero word-reveal plays
- Metrics count up when scrolled into view
- Cards / rows fade up as they enter viewport
- Research section pins and reveals cards one by one
- Sticky gutter eyebrows pin per section
- To-top button appears after scroll, scrolls smoothly back

- [ ] **Step 2: Test responsive at 375×812 (mobile)**

DevTools → Responsive → iPhone SE / 13. Check:
- Nav fits without overflow
- Hero stacks vertically with portrait centered
- Metrics strip drops to 2-column
- Timeline + Experience + Education + Expertise + SSO + Course list all stack to single column
- Ticker doesn't break layout

- [ ] **Step 3: Test reduced-motion**

DevTools → Rendering → Emulate prefers-reduced-motion → reduce. Reload. All GSAP timelines should no-op (hero text appears instantly, no parallax, no pinned reveal — research cards just visible as a static stack). Hover transitions still work.

- [ ] **Step 4: Lighthouse check**

DevTools → Lighthouse → Desktop, all categories. Target: ≥90 on Performance, Accessibility, Best Practices, SEO. If any score is below 90, note which audit failed and what to fix — fix critical ones, defer cosmetic ones.

- [ ] **Step 5: Capture screenshots for the user**

In each browser at desktop width (1440), take a full-page screenshot of `/` and `/publications.html`. Save into `docs/superpowers/plans/screenshots/` so the user can review before merging.

```bash
mkdir -p docs/superpowers/plans/screenshots
```

(Use the browser's "Capture full size screenshot" via DevTools, or use the webapp-testing skill / Playwright to script it.)

- [ ] **Step 6: Commit any screenshots**

```bash
git add docs/superpowers/plans/screenshots
git commit -m "Add verification screenshots" || echo "no screenshots to commit"
```

### Task 26: Final dry-run of the CI flow + summary

**Files:**
- No edits; verification only.

- [ ] **Step 1: Run the generator one final time**

```bash
python generate_publications.py
git status
```

Expected: changes only to `publications.html` (and possibly the banner section of `index.html` between the markers). No changes to anything else.

- [ ] **Step 2: Inspect the generated `publications.html`**

```bash
grep -c 'class="pub-row"' publications.html
grep -c 'class="collapsible-section"' publications.html
```

Both should be > 0. Open the file in a browser — should render correctly.

- [ ] **Step 3: Confirm `BANNER_START`/`BANNER_END` markers are GONE from `index.html`**

Per spec § 4.5 the ticker is dropped, so the markers must not exist:
```bash
grep -c "BANNER_START\|BANNER_END\|rolling-banner" index.html
```

Expected: 0.

- [ ] **Step 4: Confirm `.github/workflows/update-publications.yml` was not modified**

```bash
git diff origin/main -- .github/workflows/update-publications.yml
```

Expected: no output (unchanged).

- [ ] **Step 5: Commit the regenerated artifacts and push**

Ask the user before pushing.

```bash
git status
git add publications.html
git commit -m "Regenerate publications.html with new styling" || echo "no changes"
```

Then stop. The user decides when to push to origin/main.

---

## Self-Review

**Spec coverage check (§ by §):**

| Spec section | Task(s) | Covered |
|---|---|---|
| § 1 Goal | All tasks | ✓ |
| § 2.1 publications.html regeneration | Task 23 | ✓ |
| § 2.2 BANNER markers removed (per § 4.5) | Task 3 step 2 + Task 23 step 1 + Task 26 step 3 | ✓ |
| § 2.3 CI workflow unchanged | Task 26 step 4 | ✓ |
| § 2.4 JS hooks (filterPublications, toggleAll, toTop, collapsibles) | Task 16-21 keep existing `script.js` content intact; Task 23 preserves class hooks | ✓ |
| § 2.5 OpenAlex as source | Tasks 16, 17 | ✓ |
| § 2.6 SEO preserved | Task 2 (head untouched) + Task 15 (`.sr-only` article kept) | ✓ |
| § 2.7 Static site only | All tasks use vanilla HTML/CSS/JS + CDN GSAP | ✓ |
| § 2.8 CSS variable aliases removed | Task 24 | ✓ |
| § 3.1 Palette | Task 1 | ✓ |
| § 3.2 Typography | Task 1 | ✓ |
| § 3.3 Spacing | Task 1 | ✓ |
| § 3.4 Components (pill button, editorial card, eyebrow, timeline row, metric tile, project card) — ticker removed per § 4.5 | Tasks 3 (nav), 4 (pill button, eyebrow), 5 (metric tile), 7 (role card), 8/9 (timeline), 10 (comp card, courses), 11 (project card), 12 (pub row), 14 (contact, footer) | ✓ |
| § 4 11-section architecture (v4) | Tasks 4 (1 Hero), 5 (2 Metrics), 6 (3 About), 7 (4 Currently), 8 (5 Experience), 9 (6 Education), 10 (7 Expertise), 11 (8 Research), 12 (9 Latest), 13 (10 Speaking), 14 (11 Contact) | ✓ |
| § 4.5 Rolling banner dropped | Task 3 step 2 + Task 23 step 1 | ✓ |
| § 4.1 Copy updates | Task 4 (hero) + Task 6 (about) | ✓ |
| § 4.2 Currently — 3 role cards | Task 7 | ✓ |
| § 4.3 Experience — clinical + research timeline | Task 8 | ✓ |
| § 4.4 Speaking, Service & Outreach — 5 sub-blocks | Task 13 | ✓ |
| § 5 Motion choreography (hero reveal, parallax, bg numeral, metrics count-up, scrub fade-up, sticky gutter, pinned research, hover, to-top) — ticker marquee dropped | Tasks 16, 19, 20, 21, 22 | ✓ |
| § 6 File changes | All tasks | ✓ |
| § 7 Accessibility (focus, reduced-motion, alt text, semantic) | Task 1 (focus, reduced-motion), Tasks 4-14 (semantic + alt), Tasks 16-21 (reduced-motion guards) | ✓ |
| § 8 Performance budget | Task 25 step 4 (Lighthouse check) | ✓ |
| § 9 Out of scope | Plan does not add anything from this list | ✓ |
| § 10 Success criteria | Task 25 step 1-4 + Task 26 | ✓ |

**Placeholder scan:** none — all steps contain runnable code or commands.

**Type / name consistency:**
- `.pub-row` defined in Task 12, reused in Task 23 step 5-6. ✓
- `.timeline` defined in Task 8, reused in Task 9. ✓
- `.metric-value`, `.metric-label`, `data-metric` attribute → matched in Task 5 (HTML) and Task 16 (JS). ✓
- `.section-gutter`, `.section-body`, `.section-inner` defined Task 6, reused throughout. ✓
- `.btn`, `.btn-primary`, `.btn-outline` defined Task 4, reused Tasks 12, 14, 23. ✓
- `window.__motion` registered Task 18, defined Task 19, extended Tasks 20-21. ✓
- `filterPublications`, `toggleAll`, `#toTopBtn` are in legacy `script.js` content — Task 16-18 explicitly keep existing code. ✓

**Unbreakable contracts:**
- `data-pubs-count` + `data-pubs-sort` attributes hook in Task 12 / consumed in Task 17.
- `data-metric` keys (`works`, `citations`, `h_index`, `i10_index`) in Task 5 / consumed in Task 16.
- Element IDs `latest-pubs-list` and `selected-pubs-list` — only `latest-pubs-list` is used post v4 (rename complete in Tasks 12 + 17).

Plan is complete.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-23-portfolio-redesign.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
