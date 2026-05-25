# Easter Egg CV Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hidden easter egg in the site footer that opens a modal configurator and generates a styled PDF resume from the live DOM content.

**Architecture:** Single new JS file (`easter-egg.js`) loaded with `defer` handles all modal logic, DOM content scraping, and PDF generation. CSS for the modal and toggles is appended to the existing `style.css`. The footer in `index.html` gets the BL monogram trigger image and the script tag. PDF libraries (html2pdf.js, jsPDF) are lazy-loaded from CDN only when the user clicks generate.

**Tech Stack:** Vanilla JS, CSS, html2pdf.js (CDN), jsPDF (CDN), OpenAlex API (existing)

**Spec:** `docs/superpowers/specs/2026-05-25-easter-egg-cv-export-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `style.css` | Modify (append ~90 lines) | Modal overlay, card, toggles, spinner, scrollbar, reduced-motion |
| `index.html` | Modify (2 edits: footer + script tag) | BL monogram trigger in footer, `<script defer>` before `</body>` |
| `easter-egg.js` | Create (~450 lines) | Modal build/show/hide, toggle state, focus trap, DOM scraping, lazy lib loading, visual PDF, text PDF |

---

### Task 1: Easter Egg CSS — Modal, Toggles, Spinner

**Files:**
- Modify: `style.css` (append after the final rule at line ~331)

- [ ] **Step 1: Append all easter egg CSS to style.css**

Add this block at the end of `style.css`:

```css
/* ===== Easter Egg Modal ===== */
.ee-overlay {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(26, 22, 20, 0.85);
  display: flex; align-items: center; justify-content: center;
  opacity: 0; visibility: hidden;
  transition: opacity 300ms ease, visibility 300ms ease;
}
.ee-overlay.is-open { opacity: 1; visibility: visible; }

.ee-card {
  background: var(--paper); border-radius: 16px;
  width: 90vw; max-width: 440px; max-height: 90vh;
  padding: 40px; position: relative;
  display: flex; flex-direction: column;
  opacity: 0; transform: translateY(24px);
  transition: opacity 400ms cubic-bezier(0.16, 1, 0.3, 1), transform 400ms cubic-bezier(0.16, 1, 0.3, 1);
}
.ee-overlay.is-open .ee-card { opacity: 1; transform: translateY(0); }

.ee-close {
  position: absolute; top: 14px; right: 14px;
  width: 32px; height: 32px; border: 0; background: none;
  font-size: 20px; color: var(--ink-3); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  border-radius: 4px; transition: color .2s;
}
.ee-close:hover { color: var(--accent); }

.ee-header { text-align: center; margin-bottom: 20px; }
.ee-monogram { width: 32px; height: 32px; margin: 0 auto 14px; }
.ee-title { font-family: 'Fraunces', Georgia, serif; font-size: 20px; font-weight: 500; letter-spacing: -0.5px; line-height: 1.25; color: var(--ink); }
.ee-subtitle { font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 2.5px; text-transform: uppercase; color: var(--accent); margin-top: 8px; }

/* Toggle list */
.ee-toggles { flex: 1; overflow-y: auto; max-height: 50vh; border-top: 1px solid var(--rule); }
.ee-toggles::-webkit-scrollbar { width: 4px; }
.ee-toggles::-webkit-scrollbar-thumb { background: var(--ink-3); border-radius: 2px; }

.ee-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid rgba(0,0,0,0.06); gap: 12px; }
.ee-row-label { font-size: 14px; font-weight: 500; color: var(--ink); }
.ee-row-desc { font-size: 11px; color: var(--ink-3); margin-top: 1px; }

/* iOS-style toggle */
.ee-toggle { position: relative; width: 40px; height: 22px; flex-shrink: 0; cursor: pointer; }
.ee-toggle input { position: absolute; opacity: 0; width: 0; height: 0; }
.ee-toggle-track {
  position: absolute; inset: 0; background: #d4d1cd; border-radius: 11px;
  transition: background .2s;
}
.ee-toggle input:checked + .ee-toggle-track { background: var(--accent); }
.ee-toggle-knob {
  position: absolute; top: 2px; left: 2px;
  width: 18px; height: 18px; background: #fff; border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  transition: transform .2s;
}
.ee-toggle input:checked ~ .ee-toggle-knob { transform: translateX(18px); }

/* Publications sub-option */
.ee-pub-sub { overflow: hidden; max-height: 0; transition: max-height .2s ease; padding-left: 4px; }
.ee-pub-sub.is-open { max-height: 50px; }
.ee-pub-select {
  margin-top: 6px; font-family: inherit; font-size: 12px;
  padding: 4px 8px; border: 1px solid var(--rule); border-radius: 6px;
  background: #fff; color: var(--ink); outline: none;
}
.ee-pub-select:focus { border-color: var(--accent); }

/* Footer area */
.ee-footer { text-align: center; margin-top: 20px; }
.ee-gen-btn {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 180px; height: 42px;
  background: var(--ink); color: var(--paper); border: 1.5px solid var(--ink);
  border-radius: 999px; font-size: 13px; font-weight: 600;
  font-family: inherit; cursor: pointer; transition: background .25s, border-color .25s;
}
.ee-gen-btn:hover { background: var(--accent); border-color: var(--accent); }
.ee-gen-btn:disabled { opacity: 0.5; cursor: wait; }

.ee-text-link { display: block; margin-top: 10px; font-size: 12px; color: var(--ink-3); cursor: pointer; background: none; border: none; font-family: inherit; text-decoration: none; }
.ee-text-link:hover { text-decoration: underline; color: var(--accent); }

/* Spinner */
.ee-spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(251,250,247,0.3); border-top-color: var(--paper); border-radius: 50%; animation: ee-spin .6s linear infinite; }
@keyframes ee-spin { to { transform: rotate(360deg); } }

/* Footer trigger */
.ee-trigger { display: inline-block; width: 20px; height: 20px; vertical-align: middle; margin-right: 6px; border-radius: 3px; transition: box-shadow .2s, transform .2s; cursor: default; }
.ee-trigger:hover { box-shadow: 0 0 8px rgba(196,48,43,0.3); transform: scale(1.08); }
.ee-trigger:focus-visible { box-shadow: 0 0 8px rgba(196,48,43,0.3); }

@media (prefers-reduced-motion: reduce) {
  .ee-card { transition: opacity 300ms ease; transform: none; }
  .ee-overlay.is-open .ee-card { transform: none; }
  .ee-trigger:hover { transform: none; }
  .ee-spinner { animation-duration: 1.5s; }
}

@media (max-width: 480px) {
  .ee-card { padding: 28px 20px; }
  .ee-title { font-size: 18px; }
}
```

- [ ] **Step 2: Verify the CSS is valid by opening the site**

Run: Open `index.html` in a browser and verify no visual regressions on the existing site. The new classes are not yet used by any HTML, so nothing should change.

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "style: add easter egg modal and toggle CSS"
```

---

### Task 2: Footer Trigger in HTML

**Files:**
- Modify: `index.html` (lines 587–592 for footer, line 612 for script)

- [ ] **Step 1: Add BL monogram trigger to footer**

In `index.html`, replace the footer block (lines 587–592):

```html
  <footer class="site-footer">
    <div class="container site-footer-inner">
      <span>&copy; 2026 Bobby Zhao Sheng Lo.</span>
      <span class="site-footer-meta">All rights reserved.</span>
    </div>
  </footer>
```

with:

```html
  <footer class="site-footer">
    <div class="container site-footer-inner">
      <span><img src="image/favicon.svg" alt="" width="20" height="20" class="ee-trigger" role="button" tabindex="0" aria-label="Easter egg" id="eeTrigger">&copy; 2026 Bobby Zhao Sheng Lo.</span>
      <span class="site-footer-meta">All rights reserved.</span>
    </div>
  </footer>
```

- [ ] **Step 2: Add the easter-egg.js script tag**

In `index.html`, after the existing `<script src="script.js"></script>` on line 612, add:

```html
  <script src="easter-egg.js" defer></script>
```

So lines 612–613 become:

```html
  <script src="script.js"></script>
  <script src="easter-egg.js" defer></script>
```

- [ ] **Step 3: Verify trigger appears in footer**

Open `index.html` in a browser. Scroll to the footer. The BL monogram should appear as a small 20×20px icon to the left of the copyright text. It should glow faintly on hover. Nothing happens on click yet (JS not created).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add easter egg trigger monogram in footer"
```

---

### Task 3: Modal — Build, Open, Close, Focus Trap

**Files:**
- Create: `easter-egg.js`

This task creates the JS file with the modal shell — building the DOM, show/hide with animation, backdrop dismiss, Escape key, and focus trapping. No toggles or PDF logic yet.

- [ ] **Step 1: Create easter-egg.js with modal core**

Create `easter-egg.js` with this content:

```js
(function () {
  'use strict';

  var trigger = document.getElementById('eeTrigger');
  if (!trigger) return;

  // -- State --
  var overlay = null;
  var previousFocus = null;

  // -- Sections config --
  var SECTIONS = [
    { key: 'photo',       label: 'Profile photo',      desc: 'Hero portrait image' },
    { key: 'intro',       label: 'Introduction',        desc: 'About section text' },
    { key: 'current',     label: 'Current positions',   desc: 'Three concurrent roles' },
    { key: 'experience',  label: 'Experience',          desc: 'Career timeline' },
    { key: 'education',   label: 'Education & Awards',  desc: 'Degrees and recognition' },
    { key: 'expertise',   label: 'Expertise',           desc: 'Skills and competencies' },
    { key: 'research',    label: 'Research projects',   desc: 'Major project cards' },
    { key: 'publications',label: 'Publications',        desc: 'Papers from OpenAlex' },
    { key: 'speaking',    label: 'Speaking & Service',   desc: 'Talks, boards, review, media' },
    { key: 'contact',     label: 'Contact',             desc: 'Email, LinkedIn, affiliations' }
  ];

  var toggleState = {};
  var pubMode = 'all';

  function initState() {
    SECTIONS.forEach(function (s) { toggleState[s.key] = true; });
    pubMode = 'all';
  }

  // -- Build modal DOM --
  function buildModal() {
    overlay = document.createElement('div');
    overlay.className = 'ee-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'ee-heading');

    var card = document.createElement('div');
    card.className = 'ee-card';

    // Close button
    var closeBtn = document.createElement('button');
    closeBtn.className = 'ee-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', closeModal);

    // Header
    var header = document.createElement('div');
    header.className = 'ee-header';
    header.innerHTML =
      '<img src="image/favicon.svg" alt="" width="32" height="32" class="ee-monogram">' +
      '<h2 class="ee-title" id="ee-heading">You found the hidden<br>export easter egg.</h2>' +
      '<div class="ee-subtitle">// configure your cv</div>';

    // Toggles
    var togglesWrap = document.createElement('div');
    togglesWrap.className = 'ee-toggles';

    SECTIONS.forEach(function (s) {
      var row = document.createElement('div');
      row.className = 'ee-row';

      var left = document.createElement('div');
      left.innerHTML =
        '<div class="ee-row-label">' + s.label + '</div>' +
        '<div class="ee-row-desc">' + s.desc + '</div>';

      var toggle = document.createElement('label');
      toggle.className = 'ee-toggle';
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = true;
      input.setAttribute('aria-label', s.label);
      input.dataset.section = s.key;
      input.addEventListener('change', function () {
        toggleState[s.key] = this.checked;
        if (s.key === 'publications') {
          var sub = document.getElementById('eePubSub');
          if (sub) sub.classList.toggle('is-open', this.checked);
        }
      });
      var track = document.createElement('span');
      track.className = 'ee-toggle-track';
      var knob = document.createElement('span');
      knob.className = 'ee-toggle-knob';
      toggle.appendChild(input);
      toggle.appendChild(track);
      toggle.appendChild(knob);

      row.appendChild(left);
      row.appendChild(toggle);
      togglesWrap.appendChild(row);

      // Publications sub-option
      if (s.key === 'publications') {
        var sub = document.createElement('div');
        sub.className = 'ee-pub-sub is-open';
        sub.id = 'eePubSub';
        var select = document.createElement('select');
        select.className = 'ee-pub-select';
        select.setAttribute('aria-label', 'Publication filter');
        ['all', 'top10', 'latest10'].forEach(function (val) {
          var opt = document.createElement('option');
          opt.value = val;
          opt.textContent = val === 'all' ? 'All publications' : val === 'top10' ? 'Top 10 by citations' : 'Latest 10';
          select.appendChild(opt);
        });
        select.addEventListener('change', function () { pubMode = this.value; });
        sub.appendChild(select);
        togglesWrap.appendChild(sub);
      }
    });

    // Footer
    var footer = document.createElement('div');
    footer.className = 'ee-footer';

    var genBtn = document.createElement('button');
    genBtn.className = 'ee-gen-btn';
    genBtn.id = 'eeGenBtn';
    genBtn.textContent = 'Generate PDF →';
    genBtn.addEventListener('click', function () { generateVisualPDF(); });

    var textLink = document.createElement('button');
    textLink.className = 'ee-text-link';
    textLink.textContent = 'or download text-selectable version';
    textLink.addEventListener('click', function () { generateTextPDF(); });

    footer.appendChild(genBtn);
    footer.appendChild(textLink);

    card.appendChild(closeBtn);
    card.appendChild(header);
    card.appendChild(togglesWrap);
    card.appendChild(footer);
    overlay.appendChild(card);

    // Backdrop click
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });

    document.body.appendChild(overlay);
  }

  // -- Open / close --
  function openModal() {
    if (!overlay) {
      initState();
      buildModal();
    } else {
      initState();
      overlay.querySelectorAll('input[type="checkbox"]').forEach(function (cb) { cb.checked = true; });
      var sel = overlay.querySelector('.ee-pub-select');
      if (sel) sel.value = 'all';
      var sub = document.getElementById('eePubSub');
      if (sub) sub.classList.add('is-open');
    }
    previousFocus = document.activeElement;
    requestAnimationFrame(function () {
      overlay.classList.add('is-open');
      var first = overlay.querySelector('input[type="checkbox"]');
      if (first) first.focus();
    });
    document.addEventListener('keydown', onKeyDown);
  }

  function closeModal() {
    if (!overlay) return;
    overlay.classList.remove('is-open');
    document.removeEventListener('keydown', onKeyDown);
    if (previousFocus) previousFocus.focus();
  }

  // -- Focus trap + Escape --
  function onKeyDown(e) {
    if (e.key === 'Escape') { closeModal(); return; }
    if (e.key !== 'Tab') return;
    var focusable = overlay.querySelectorAll('button, input, select, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  // -- Trigger --
  trigger.addEventListener('click', openModal);
  trigger.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(); }
  });

  // -- Placeholder PDF functions (implemented in Tasks 4 & 5) --
  function generateVisualPDF() {
    console.log('Visual PDF — not yet implemented');
  }

  function generateTextPDF() {
    console.log('Text PDF — not yet implemented');
  }
})();
```

- [ ] **Step 2: Test the modal open/close flow**

Open `index.html` in a browser. Scroll to the footer. Click the BL monogram. Verify:
1. Dark overlay fades in, centered card slides up
2. 10 toggle rows visible, all ON (oxblood)
3. Publications dropdown visible below Publications toggle
4. Clicking × closes modal
5. Clicking backdrop closes modal
6. Pressing Escape closes modal
7. Tab cycles only within the modal (focus trap)
8. Toggling a switch changes its colour
9. Toggling Publications OFF hides the dropdown

- [ ] **Step 3: Commit**

```bash
git add easter-egg.js
git commit -m "feat: easter egg modal with toggles and focus trap"
```

---

### Task 4: DOM Scraping + Visual PDF (html2pdf.js)

**Files:**
- Modify: `easter-egg.js` (replace `generateVisualPDF` placeholder)

- [ ] **Step 1: Add the lazy-load helper and DOM scraping functions**

In `easter-egg.js`, find the line:

```js
  function generateVisualPDF() {
    console.log('Visual PDF — not yet implemented');
  }
```

Replace the entire `generateVisualPDF` function and add the helper functions above it. Insert these just before the placeholder:

```js
  // -- Lazy-load a script --
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) { resolve(); return; }
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  var HTML2PDF_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.2/html2pdf.bundle.min.js';
  var JSPDF_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js';
  var AUTHOR_ID = 'a5078664290';
  var MAILTO = 'bobby.lo@regionh.dk';

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  // -- Fetch publications from OpenAlex --
  function fetchPublications() {
    if (pubMode === 'latest10') {
      var url = 'https://api.openalex.org/works?filter=authorships.author.id:' + AUTHOR_ID +
        '&per_page=10&sort=publication_date%3Adesc&mailto=' + MAILTO;
    } else if (pubMode === 'top10') {
      var url = 'https://api.openalex.org/works?filter=authorships.author.id:' + AUTHOR_ID +
        '&per_page=10&sort=cited_by_count%3Adesc&mailto=' + MAILTO;
    } else {
      var url = 'https://api.openalex.org/works?filter=authorships.author.id:' + AUTHOR_ID +
        '&per_page=200&sort=publication_date%3Adesc&mailto=' + MAILTO;
    }
    return fetch(url).then(function (r) { return r.json(); }).then(function (d) { return d.results || []; });
  }

  // -- Build the hidden PDF render div --
  function buildCvHtml(pubs) {
    var h = '';

    // Header
    h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;padding-bottom:10px;border-bottom:1.5px solid #1A1614;">';
    h += '<div style="display:flex;align-items:flex-start;gap:10px;">';
    h += '<div style="width:28px;height:28px;background:#7A1F2B;border-radius:4px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">';
    h += '<span style="color:#FBFAF7;font-family:Georgia,serif;font-weight:700;font-size:10px;letter-spacing:0.5px;">BL</span></div>';
    h += '<div>';
    h += '<div style="font-family:Fraunces,Georgia,serif;font-size:18px;font-weight:500;letter-spacing:-0.5px;line-height:1.15;color:#1A1614;">Bobby Zhao Sheng Lo, MD, PhD</div>';

    var roleEl = document.querySelector('.hero-role');
    var roleText = roleEl ? roleEl.textContent.trim() : '';
    h += '<div style="font-size:9px;color:#4A4340;margin-top:3px;line-height:1.4;">' + esc(roleText) + '</div>';
    h += '<div style="font-family:JetBrains Mono,monospace;font-size:7px;color:#888280;letter-spacing:0.5px;margin-top:4px;">bobby.lo@regionh.dk &middot; linkedin.com/in/bobby-lo-md &middot; bobby-zs-lo.github.io</div>';
    h += '</div></div>';

    // Photo
    if (toggleState.photo) {
      var img = document.querySelector('.hero-portrait img');
      if (img) {
        h += '<img src="' + img.src + '" style="width:52px;height:52px;border-radius:50%;object-fit:cover;flex-shrink:0;margin-left:12px;" crossorigin="anonymous">';
      }
    }
    h += '</div>';

    // Section helper
    function sectionTitle(t) {
      return '<div style="font-family:JetBrains Mono,monospace;font-size:8px;letter-spacing:2px;text-transform:uppercase;color:#C4302B;font-weight:500;margin-top:14px;margin-bottom:6px;padding-bottom:4px;border-bottom:0.5px solid rgba(0,0,0,0.08);">// ' + t + '</div>';
    }

    // Introduction
    if (toggleState.intro) {
      h += sectionTitle('Introduction');
      var paras = document.querySelectorAll('#about .prose p');
      paras.forEach(function (p) {
        h += '<div style="font-size:8.5px;color:#4A4340;line-height:1.5;margin-bottom:4px;">' + esc(p.textContent.trim()) + '</div>';
      });
    }

    // Current positions
    if (toggleState.current) {
      h += sectionTitle('Current Positions');
      var cards = document.querySelectorAll('#currently .role-card');
      cards.forEach(function (c) {
        var date = c.querySelector('.role-date');
        var title = c.querySelector('h3');
        var org = c.querySelector('.role-org');
        var note = c.querySelector('.role-note');
        h += '<div style="margin-bottom:6px;">';
        if (date) h += '<span style="font-family:JetBrains Mono,monospace;font-size:7px;color:#C4302B;letter-spacing:0.3px;">' + esc(date.textContent) + '</span> ';
        if (title) h += '<strong style="font-size:9px;color:#1A1614;">' + esc(title.textContent) + '</strong>';
        if (org) h += '<div style="font-size:8px;color:#4A4340;">' + esc(org.textContent) + '</div>';
        if (note) h += '<div style="font-size:7.5px;color:#888280;">' + esc(note.textContent) + '</div>';
        h += '</div>';
      });
    }

    // Experience
    if (toggleState.experience) {
      h += sectionTitle('Experience');
      h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;">';
      var expCols = document.querySelectorAll('#experience .exp-col');
      expCols.forEach(function (col) {
        h += '<div>';
        var colTitle = col.querySelector('.exp-col-title');
        if (colTitle) h += '<div style="font-size:7px;font-weight:600;color:#888280;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">' + esc(colTitle.textContent) + '</div>';
        var items = col.querySelectorAll('.timeline li');
        items.forEach(function (li) {
          var date = li.querySelector('.tl-date');
          var rest = li.querySelector('div');
          h += '<div style="display:grid;grid-template-columns:48px 1fr;gap:8px;padding:3px 0;border-bottom:0.5px solid rgba(0,0,0,0.04);font-size:8px;color:#4A4340;line-height:1.4;">';
          h += '<span style="font-family:JetBrains Mono,monospace;font-size:7px;color:#C4302B;letter-spacing:0.3px;font-weight:500;">' + (date ? esc(date.textContent) : '') + '</span>';
          h += '<div>' + (rest ? rest.innerHTML : '') + '</div>';
          h += '</div>';
        });
        h += '</div>';
      });
      h += '</div>';
    }

    // Education & Awards
    if (toggleState.education) {
      h += sectionTitle('Education & Awards');
      h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;">';
      var edCols = document.querySelectorAll('#education .ed-grid > div');
      edCols.forEach(function (col) {
        h += '<div>';
        var colTitle = col.querySelector('.ed-col-title');
        if (colTitle) h += '<div style="font-size:7px;font-weight:600;color:#888280;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">' + esc(colTitle.textContent) + '</div>';
        var items = col.querySelectorAll('.timeline li');
        items.forEach(function (li) {
          var date = li.querySelector('.tl-date');
          var rest = li.querySelector('div');
          h += '<div style="display:grid;grid-template-columns:48px 1fr;gap:8px;padding:3px 0;border-bottom:0.5px solid rgba(0,0,0,0.04);font-size:8px;color:#4A4340;line-height:1.4;">';
          h += '<span style="font-family:JetBrains Mono,monospace;font-size:7px;color:#C4302B;letter-spacing:0.3px;font-weight:500;">' + (date ? esc(date.textContent) : '') + '</span>';
          h += '<div>' + (rest ? rest.innerHTML : '') + '</div>';
          h += '</div>';
        });
        h += '</div>';
      });
      h += '</div>';
    }

    // Expertise
    if (toggleState.expertise) {
      h += sectionTitle('Expertise');
      h += '<div style="font-size:8px;color:#4A4340;line-height:1.7;">';
      var compCards = document.querySelectorAll('#expertise .comp-card');
      var skills = [];
      compCards.forEach(function (c) {
        var t = c.querySelector('h3');
        var p = c.querySelector('p');
        if (t) skills.push(t.textContent.trim());
        if (p) {
          p.textContent.split(/[·,]/).forEach(function (s) {
            var trimmed = s.trim();
            if (trimmed) skills.push(trimmed);
          });
        }
      });
      var unique = [];
      skills.forEach(function (s) { if (unique.indexOf(s) === -1) unique.push(s); });
      h += unique.map(function (s) {
        return '<span style="display:inline-block;padding:1px 6px;background:rgba(196,48,43,0.06);border-radius:3px;margin:1px 2px;font-size:7.5px;">' + esc(s) + '</span>';
      }).join(' ');
      h += '</div>';
    }

    // Research
    if (toggleState.research) {
      h += sectionTitle('Research Projects');
      var rCards = document.querySelectorAll('#research .research-card');
      rCards.forEach(function (c) {
        var tag = c.querySelector('.research-tag');
        var title = c.querySelector('h3');
        var desc = c.querySelector('p');
        h += '<div style="margin-bottom:6px;">';
        if (tag) h += '<span style="font-family:JetBrains Mono,monospace;font-size:6.5px;color:#C4302B;letter-spacing:1.5px;text-transform:uppercase;">' + esc(tag.textContent) + '</span> ';
        if (title) h += '<strong style="font-family:Fraunces,Georgia,serif;font-size:10px;color:#1A1614;">' + esc(title.textContent) + '</strong>';
        if (desc) h += '<div style="font-size:8px;color:#4A4340;line-height:1.5;margin-top:2px;">' + esc(desc.textContent) + '</div>';
        h += '</div>';
      });
    }

    // Publications
    if (toggleState.publications && pubs && pubs.length) {
      h += sectionTitle('Publications');
      pubs.forEach(function (p) {
        var year = p.publication_year || '';
        var title = p.title || 'Untitled';
        var venue = (p.primary_location && p.primary_location.source && p.primary_location.source.display_name) || '';
        var cites = p.cited_by_count || 0;
        h += '<div style="padding:2.5px 0;border-bottom:0.5px solid rgba(0,0,0,0.04);font-size:8px;">';
        h += '<span style="font-family:Fraunces,Georgia,serif;font-size:8.5px;font-weight:500;color:#1A1614;">' + esc(title) + '</span>';
        h += '<div style="font-size:7px;color:#888280;font-style:italic;margin-top:1px;">' + esc(venue) + (cites > 0 ? ' &middot; ' + cites + ' citation' + (cites === 1 ? '' : 's') : '') + ' &middot; ' + year + '</div>';
        h += '</div>';
      });
    }

    // Speaking & Service
    if (toggleState.speaking) {
      h += sectionTitle('Speaking, Service & Outreach');
      var blocks = document.querySelectorAll('#speaking .sso-block');
      blocks.forEach(function (b) {
        var title = b.querySelector('.sso-title');
        if (title) h += '<div style="font-size:8px;font-weight:600;color:#1A1614;margin-top:6px;margin-bottom:3px;">' + esc(title.textContent) + '</div>';
        var items = b.querySelectorAll('.sso-list li');
        items.forEach(function (li) {
          h += '<div style="font-size:7.5px;color:#4A4340;line-height:1.4;padding:1px 0;">' + esc(li.textContent.trim()) + '</div>';
        });
        var text = b.querySelector('.sso-text');
        if (text) h += '<div style="font-size:7.5px;color:#4A4340;line-height:1.5;">' + esc(text.textContent.trim()) + '</div>';
        var aux = b.querySelector('.sso-aux');
        if (aux) h += '<div style="font-size:7px;color:#888280;font-style:italic;margin-top:2px;">' + esc(aux.textContent.trim()) + '</div>';
      });
    }

    // Contact
    if (toggleState.contact) {
      h += sectionTitle('Contact');
      var contacts = document.querySelectorAll('#contact .contact-list li');
      contacts.forEach(function (li) {
        var key = li.querySelector('.contact-key');
        var val = li.querySelector('a') || li.querySelector('span:last-child');
        if (key && val) {
          h += '<div style="font-size:8px;color:#4A4340;padding:1px 0;"><strong style="font-family:JetBrains Mono,monospace;font-size:7px;color:#888280;letter-spacing:1px;text-transform:uppercase;">' + esc(key.textContent) + '</strong> ' + esc(val.textContent.trim()) + '</div>';
        }
      });
      var affs = document.querySelectorAll('#contact .aff-marks span');
      if (affs.length) {
        h += '<div style="font-size:7px;color:#888280;margin-top:4px;">' + Array.from(affs).map(function (a) { return esc(a.textContent.trim()); }).join(' &middot; ') + '</div>';
      }
    }

    // Watermark
    h += '<div style="position:fixed;bottom:20mm;right:20mm;opacity:0.045;">';
    h += '<svg viewBox="0 0 64 64" width="48" height="48"><rect width="64" height="64" rx="10" fill="#7A1F2B"/><text x="18" y="43" font-family="Georgia,serif" font-weight="700" font-size="26" fill="#FBFAF7">B</text><text x="37" y="43" font-family="Georgia,serif" font-weight="700" font-size="26" fill="#FBFAF7">L</text></svg>';
    h += '</div>';

    return h;
  }

  // -- Generate Visual PDF --
  function generateVisualPDF() {
    var btn = document.getElementById('eeGenBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="ee-spinner"></span>';

    var pubsPromise = toggleState.publications ? fetchPublications() : Promise.resolve([]);

    Promise.all([loadScript(HTML2PDF_CDN), pubsPromise])
      .then(function (results) {
        var pubs = results[1];
        var container = document.createElement('div');
        container.style.cssText = 'position:absolute;left:-9999px;top:0;width:170mm;font-family:Inter,system-ui,sans-serif;background:#FBFAF7;color:#1A1614;padding:0;';
        container.innerHTML = buildCvHtml(pubs);
        document.body.appendChild(container);

        return window.html2pdf().set({
          margin: [20, 20, 20, 20],
          filename: 'Bobby_Lo_CV_' + todayStr() + '.pdf',
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, letterRendering: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        }).from(container).save().then(function () {
          document.body.removeChild(container);
        });
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = 'Generate PDF →';
      })
      .catch(function (err) {
        console.error('PDF generation failed:', err);
        btn.disabled = false;
        btn.textContent = 'Generate PDF →';
        alert('PDF generation failed. Please try again.');
      });
  }
```

- [ ] **Step 2: Test visual PDF generation**

Open `index.html` in a browser (must be served via a local server for CORS — use `python -m http.server 8000` or VS Code Live Server). Click the BL monogram, leave all toggles ON, click "Generate PDF →". Verify:
1. Spinner appears while generating
2. A PDF downloads named `Bobby_Lo_CV_YYYY-MM-DD.pdf`
3. PDF contains all sections with the site's visual style
4. BL watermark visible in bottom-right at low opacity
5. Try toggling some sections OFF and regenerating — those sections should be absent

- [ ] **Step 3: Commit**

```bash
git add easter-egg.js
git commit -m "feat: visual PDF generation via html2pdf.js"
```

---

### Task 5: Text-Selectable PDF (jsPDF)

**Files:**
- Modify: `easter-egg.js` (replace `generateTextPDF` placeholder)

- [ ] **Step 1: Replace the generateTextPDF placeholder**

In `easter-egg.js`, find:

```js
  function generateTextPDF() {
    console.log('Text PDF — not yet implemented');
  }
```

Replace with:

```js
  function generateTextPDF() {
    var btn = document.querySelector('.ee-text-link');
    var origText = btn.textContent;
    btn.textContent = 'generating...';
    btn.style.pointerEvents = 'none';

    var pubsPromise = toggleState.publications ? fetchPublications() : Promise.resolve([]);

    Promise.all([loadScript(JSPDF_CDN), pubsPromise])
      .then(function (results) {
        var pubs = results[1];
        var jsPDF = window.jspdf.jsPDF;
        var doc = new jsPDF({ unit: 'mm', format: 'a4' });
        var pageW = 210;
        var marginL = 20;
        var marginR = 20;
        var contentW = pageW - marginL - marginR;
        var y = 20;

        function checkPage(needed) {
          if (y + needed > 277) { doc.addPage(); y = 20; }
        }

        // Header
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('Bobby Zhao Sheng Lo, MD, PhD', pageW / 2, y, { align: 'center' });
        y += 7;

        var roleEl = document.querySelector('.hero-role');
        var roleText = roleEl ? roleEl.textContent.trim() : '';
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(74, 67, 64);
        var roleLines = doc.splitTextToSize(roleText, contentW);
        doc.text(roleLines, pageW / 2, y, { align: 'center' });
        y += roleLines.length * 3.5 + 2;

        doc.setFontSize(7);
        doc.setTextColor(136, 130, 128);
        doc.text('bobby.lo@regionh.dk  |  linkedin.com/in/bobby-lo-md  |  bobby-zs-lo.github.io', pageW / 2, y, { align: 'center' });
        y += 5;

        doc.setDrawColor(26, 22, 20);
        doc.setLineWidth(0.3);
        doc.line(marginL, y, pageW - marginR, y);
        y += 6;

        function sectionHeading(title) {
          checkPage(12);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(26, 22, 20);
          doc.text(title.toUpperCase(), marginL, y);
          y += 1;
          doc.setDrawColor(26, 22, 20);
          doc.setLineWidth(0.15);
          doc.line(marginL, y, pageW - marginR, y);
          y += 5;
        }

        function bodyText(text) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(74, 67, 64);
          var lines = doc.splitTextToSize(text, contentW);
          lines.forEach(function (line) {
            checkPage(4);
            doc.text(line, marginL, y);
            y += 3.8;
          });
          y += 2;
        }

        function timelineEntry(date, text) {
          checkPage(6);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(74, 67, 64);
          doc.text(date, marginL, y);
          var entryLines = doc.splitTextToSize(text, contentW - 30);
          entryLines.forEach(function (line, i) {
            doc.text(line, marginL + 28, y + (i * 3.5));
          });
          y += Math.max(entryLines.length * 3.5, 4) + 1.5;
        }

        // Introduction
        if (toggleState.intro) {
          sectionHeading('Introduction');
          var paras = document.querySelectorAll('#about .prose p');
          paras.forEach(function (p) { bodyText(p.textContent.trim()); });
        }

        // Current positions
        if (toggleState.current) {
          sectionHeading('Current Positions');
          var roleCards = document.querySelectorAll('#currently .role-card');
          roleCards.forEach(function (c) {
            var date = c.querySelector('.role-date');
            var title = c.querySelector('h3');
            var org = c.querySelector('.role-org');
            var note = c.querySelector('.role-note');
            var text = (title ? title.textContent : '') + (org ? ' — ' + org.textContent : '') + (note ? '. ' + note.textContent : '');
            timelineEntry(date ? date.textContent : '', text);
          });
        }

        // Experience
        if (toggleState.experience) {
          sectionHeading('Experience');
          var expCols = document.querySelectorAll('#experience .exp-col');
          expCols.forEach(function (col) {
            var colTitle = col.querySelector('.exp-col-title');
            if (colTitle) {
              checkPage(6);
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(7.5);
              doc.setTextColor(26, 22, 20);
              doc.text(colTitle.textContent.trim().toUpperCase(), marginL, y);
              y += 4;
            }
            var items = col.querySelectorAll('.timeline li');
            items.forEach(function (li) {
              var date = li.querySelector('.tl-date');
              var div = li.querySelector('div');
              timelineEntry(date ? date.textContent : '', div ? div.textContent.trim().replace(/\s+/g, ' ') : '');
            });
            y += 2;
          });
        }

        // Education & Awards
        if (toggleState.education) {
          sectionHeading('Education & Awards');
          var edCols = document.querySelectorAll('#education .ed-grid > div');
          edCols.forEach(function (col) {
            var colTitle = col.querySelector('.ed-col-title');
            if (colTitle) {
              checkPage(6);
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(7.5);
              doc.setTextColor(26, 22, 20);
              doc.text(colTitle.textContent.trim().toUpperCase(), marginL, y);
              y += 4;
            }
            var items = col.querySelectorAll('.timeline li');
            items.forEach(function (li) {
              var date = li.querySelector('.tl-date');
              var div = li.querySelector('div');
              timelineEntry(date ? date.textContent : '', div ? div.textContent.trim().replace(/\s+/g, ' ') : '');
            });
            y += 2;
          });
        }

        // Expertise
        if (toggleState.expertise) {
          sectionHeading('Expertise');
          var compCards = document.querySelectorAll('#expertise .comp-card');
          var skills = [];
          compCards.forEach(function (c) {
            var t = c.querySelector('h3');
            var p = c.querySelector('p');
            if (t) skills.push(t.textContent.trim());
            if (p) {
              p.textContent.split(/[·,]/).forEach(function (s) {
                var trimmed = s.trim();
                if (trimmed && skills.indexOf(trimmed) === -1) skills.push(trimmed);
              });
            }
          });
          bodyText(skills.join('  ·  '));
        }

        // Research
        if (toggleState.research) {
          sectionHeading('Research Projects');
          var rCards = document.querySelectorAll('#research .research-card');
          rCards.forEach(function (c) {
            var tag = c.querySelector('.research-tag');
            var title = c.querySelector('h3');
            var desc = c.querySelector('p');
            checkPage(10);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(26, 22, 20);
            doc.text((title ? title.textContent : ''), marginL, y);
            if (tag) {
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(7);
              doc.setTextColor(136, 130, 128);
              doc.text('  [' + tag.textContent.trim() + ']', marginL + doc.getTextWidth(title ? title.textContent : '') + 2, y);
            }
            y += 4;
            if (desc) bodyText(desc.textContent.trim());
          });
        }

        // Publications
        if (toggleState.publications && pubs && pubs.length) {
          sectionHeading('Publications');
          pubs.forEach(function (p) {
            var year = p.publication_year || '';
            var title = p.title || 'Untitled';
            var venue = (p.primary_location && p.primary_location.source && p.primary_location.source.display_name) || '';
            var cites = p.cited_by_count || 0;
            checkPage(8);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(26, 22, 20);
            var titleLines = doc.splitTextToSize(title, contentW);
            titleLines.forEach(function (line) {
              doc.text(line, marginL, y);
              y += 3.5;
            });
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(7);
            doc.setTextColor(136, 130, 128);
            doc.text(venue + (cites > 0 ? ' · ' + cites + ' citation' + (cites === 1 ? '' : 's') : '') + ' · ' + year, marginL, y);
            y += 5;
          });
        }

        // Speaking & Service
        if (toggleState.speaking) {
          sectionHeading('Speaking, Service & Outreach');
          var blocks = document.querySelectorAll('#speaking .sso-block');
          blocks.forEach(function (b) {
            var title = b.querySelector('.sso-title');
            if (title) {
              checkPage(6);
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(7.5);
              doc.setTextColor(26, 22, 20);
              doc.text(title.textContent.trim(), marginL, y);
              y += 4;
            }
            var items = b.querySelectorAll('.sso-list li');
            items.forEach(function (li) {
              var date = li.querySelector('.tl-date');
              var text = li.textContent.trim().replace(/\s+/g, ' ');
              if (date) text = text.replace(date.textContent.trim(), '').trim();
              timelineEntry(date ? date.textContent.trim() : '', text);
            });
            var ssoText = b.querySelector('.sso-text');
            if (ssoText) bodyText(ssoText.textContent.trim());
            var aux = b.querySelector('.sso-aux');
            if (aux) {
              doc.setFont('helvetica', 'italic');
              doc.setFontSize(7);
              doc.setTextColor(136, 130, 128);
              var auxLines = doc.splitTextToSize(aux.textContent.trim(), contentW);
              auxLines.forEach(function (line) { checkPage(4); doc.text(line, marginL, y); y += 3.5; });
              y += 2;
            }
          });
        }

        // Contact
        if (toggleState.contact) {
          sectionHeading('Contact');
          var contacts = document.querySelectorAll('#contact .contact-list li');
          contacts.forEach(function (li) {
            var key = li.querySelector('.contact-key');
            var val = li.querySelector('a') || li.querySelector('span:last-child');
            if (key && val) {
              checkPage(5);
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(7);
              doc.setTextColor(136, 130, 128);
              doc.text(key.textContent.trim().toUpperCase(), marginL, y);
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(8);
              doc.setTextColor(74, 67, 64);
              doc.text(val.textContent.trim(), marginL + 22, y);
              y += 4.5;
            }
          });
        }

        // Page numbers
        var pageCount = doc.internal.getNumberOfPages();
        for (var i = 1; i <= pageCount; i++) {
          doc.setPage(i);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(136, 130, 128);
          doc.text(i + ' / ' + pageCount, pageW / 2, 290, { align: 'center' });
        }

        doc.save('Bobby_Lo_CV_' + todayStr() + '.pdf');
      })
      .then(function () {
        btn.textContent = origText;
        btn.style.pointerEvents = '';
      })
      .catch(function (err) {
        console.error('Text PDF generation failed:', err);
        btn.textContent = origText;
        btn.style.pointerEvents = '';
        alert('PDF generation failed. Please try again.');
      });
  }
```

- [ ] **Step 2: Test text-selectable PDF generation**

Open the site via a local server. Click the BL monogram, click "or download text-selectable version". Verify:
1. Link text changes to "generating..." while working
2. A PDF downloads with the same filename pattern
3. Text in the PDF is selectable (try Ctrl+A in the PDF viewer)
4. All enabled sections appear with proper headings and content
5. Page numbers appear centered at the bottom of each page
6. Toggle some sections off and regenerate — verify they're excluded

- [ ] **Step 3: Test both PDF engines with different toggle combinations**

Try these configurations:
1. All ON — both PDFs should have all sections
2. Only "Introduction" and "Publications" ON — minimal CV
3. Publications with "Top 10 by citations" selected — verify API call sorts correctly
4. Photo OFF — verify no photo in visual PDF header

- [ ] **Step 4: Commit**

```bash
git add easter-egg.js
git commit -m "feat: text-selectable PDF generation via jsPDF"
```

---

### Task 6: Mobile Responsiveness & Accessibility Polish

**Files:**
- Modify: `easter-egg.js` (minor tweaks)
- Modify: `style.css` (already handled in Task 1 via `@media (max-width: 480px)`)

- [ ] **Step 1: Test on mobile viewport**

Open Chrome DevTools, toggle device toolbar (Ctrl+Shift+M), select iPhone 14 or similar. Verify:
1. Footer monogram is tappable (20×20px target — wrap area is larger via padding)
2. Modal fits within viewport (90vw, max-height 90vh)
3. Toggle list scrolls within `max-height: 50vh`
4. "Generate PDF →" button is fully visible without scrolling past toggles
5. Toggle switches have minimum 44px tap target height (12px padding top+bottom on the row = 22+24 = 46px)

- [ ] **Step 2: Test keyboard navigation**

Without using a mouse:
1. Tab to footer, find the BL monogram, press Enter — modal opens
2. Tab through all 10 toggles + publications dropdown + Generate button + text link + close button
3. Shift+Tab wraps from first element back to close button (focus trap)
4. Press Space on a toggle — it flips
5. Press Escape — modal closes, focus returns to monogram

- [ ] **Step 3: Test with screen reader (optional but recommended)**

If NVDA or VoiceOver is available:
1. Modal is announced as a dialog
2. Heading "You found the hidden export easter egg" is announced
3. Each toggle is announced with its label and checked state
4. Close button is announced as "Close"

- [ ] **Step 4: Commit (if any changes were made)**

```bash
git add easter-egg.js style.css
git commit -m "fix: mobile and accessibility polish for easter egg"
```

---

### Task 7: Final Integration Test & Cleanup

**Files:**
- All three files for final review

- [ ] **Step 1: Full end-to-end test on a local server**

Start a local server (`python -m http.server 8000` or equivalent). Run through the complete flow:
1. Load `http://localhost:8000` — page loads normally, no console errors
2. Scroll to footer — BL monogram visible, subtle glow on hover
3. Click monogram — modal opens with elegant animation
4. All 10 toggles ON by default
5. Toggle Publications OFF — dropdown hides
6. Toggle Publications ON — dropdown reappears
7. Change dropdown to "Top 10 by citations"
8. Click "Generate PDF →" — spinner shows, PDF downloads
9. Open PDF — verify it has the visual styling, all selected sections, correct publications sort
10. Reopen modal, click "or download text-selectable version" — second PDF downloads
11. Open second PDF — verify text is selectable, sections match toggle state
12. Close modal via ×, backdrop click, and Escape — all three work
13. No console errors throughout

- [ ] **Step 2: Test with prefers-reduced-motion**

In Chrome DevTools → Rendering → Emulate CSS media feature `prefers-reduced-motion: reduce`. Verify:
1. Modal fades in without sliding
2. Footer monogram does not scale on hover (only glow)
3. Spinner animation is slowed but still works

- [ ] **Step 3: Verify no regressions on existing site features**

1. GSAP animations on hero and sections still work
2. OpenAlex metrics and latest publications load
3. Scroll-to-top button works
4. Navigation links work
5. Publications page (if navigated to) still works

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "feat: complete easter egg CV export feature"
```
