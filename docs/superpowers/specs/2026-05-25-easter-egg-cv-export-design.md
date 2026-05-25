# Easter Egg CV Export — Design Spec

**Date:** 2026-05-25
**Status:** Approved
**Approach:** Single-file addition (`easter-egg.js` + CSS block in `style.css`)

---

## Overview

A hidden easter egg in the site footer allows visitors to generate a PDF resume from the online portfolio. The BL monogram favicon is placed in the footer as a subtle, discoverable trigger. Clicking it opens a centered modal where the user selects which sections to include, then generates a styled PDF.

## 1. Footer Trigger

- **Element:** The BL monogram SVG (`image/favicon.svg`) rendered as an inline `<img>` at 20×20px, placed to the left of "© 2026 Bobby Zhao Sheng Lo." in the `<footer>`.
- **Appearance:** Looks like a decorative brand mark. No tooltip. Cursor remains `default`.
- **Hover:** Subtle oxblood glow (`box-shadow: 0 0 8px rgba(196,48,43,0.3)`) fades in over 200ms. Scale up to 1.08×. On `prefers-reduced-motion: reduce`, glow only (no scale).
- **Accessibility:** `role="button"`, `tabindex="0"`, `aria-label="Easter egg"`. Responds to Enter/Space.

## 2. Modal — Structure & Animation

### Overlay
- Full-screen backdrop: `rgba(26, 22, 20, 0.85)`.
- Fade in: 300ms ease.
- Click on backdrop dismisses modal.

### Modal Card
- Centered, `max-width: 440px`, `--paper` background (#FBFAF7), `border-radius: 16px`, `padding: 40px`.
- Enter animation: `opacity 0→1` + `translateY(24px→0)` over 400ms, `cubic-bezier(0.16, 1, 0.3, 1)`.
- On `prefers-reduced-motion`: fade only, no translate.
- Exit animation: reverse (fade + translateY down), 250ms.

### Header Area
1. BL monogram: 32×32px oxblood rounded square, centered.
2. Heading: "You found the hidden export easter egg." — Fraunces 20px, 500 weight, centered.
3. Subtitle: `// CONFIGURE YOUR CV` — JetBrains Mono 11px, oxblood, uppercase, 2.5px letter-spacing.

### Toggle List
10 rows with iOS-style toggle switches (40×22px):

| # | Label | Description | Default |
|---|-------|-------------|---------|
| 1 | Profile photo | Hero portrait image | ON |
| 2 | Introduction | About section text | ON |
| 3 | Current positions | Three concurrent roles | ON |
| 4 | Experience | Career timeline | ON |
| 5 | Education & Awards | Degrees and recognition | ON |
| 6 | Expertise | Skills and competencies | ON |
| 7 | Research projects | Major project cards | ON |
| 8 | Publications | Papers from OpenAlex | ON |
| 9 | Speaking & Service | Talks, boards, review, media | ON |
| 10 | Contact | Email, LinkedIn, affiliations | ON |

- Toggle ON: oxblood (#C4302B), knob slides right.
- Toggle OFF: grey (#d4d1cd), knob slides left.
- Label: Inter 14px, 500 weight. Description: Inter 11px, `--ink-3`.
- Each toggle row has `border-bottom: 1px solid rgba(0,0,0,0.06)`.

**Publications sub-option:** When the Publications toggle is ON, an inline `<select>` dropdown appears below it with options:
- All publications
- Top 10 by citations
- Latest 10

Dropdown slides in with a 200ms height animation.

**Scrolling:** Toggle list area: `max-height: 50vh; overflow-y: auto`. Thin custom scrollbar matching the site palette.

### Footer Area
- Primary: "Generate PDF →" button — `.btn-primary` style (oxblood pill, Inter 13px, 600 weight).
- Secondary: "or download text-selectable version" — text link below the button (Inter 12px, `--ink-3`, underline on hover). Triggers the jsPDF alternative.

### Dismiss
- × button: top-right, 32×32px, `--ink-3`, hover → `--accent`.
- Click outside (backdrop).
- Escape key.
- Focus returns to monogram on close.

### Focus Trapping
Tab cycles within the modal. First focusable element (first toggle) receives focus on open.

## 3. PDF Generation

### Lazy Loading
Neither PDF library is loaded until the user clicks a generate action. Libraries loaded via dynamic `<script>` injection with Promise wrappers:
- **html2pdf.js** — CDN (cdnjs or jsdelivr)
- **jsPDF** — CDN (bundled with html2pdf.js for visual; standalone for text)

A CSS-only spinner (oxblood) replaces the button text during generation.

### Visual PDF (html2pdf.js) — Primary

A hidden `<div id="cv-render">` is assembled off-screen with content scraped from the DOM.

**Layout (A4, 210×297mm, 20mm margins):**

- **Header:** BL monogram (top-left, small) + "Bobby Zhao Sheng Lo, MD, PhD" in Fraunces 22px + subtitle line (current title) + contact line in JetBrains Mono 9px. If photo enabled: 60×60px circular crop floated right of header.
- **Sections rendered in order (if enabled):**
  - Section title: JetBrains Mono 8px, oxblood (#C4302B), uppercase, 2px letter-spacing, 0.5px rule below.
  - Introduction: Inter 9px body text.
  - Current positions: compact role cards (title + org + note).
  - Experience: two-column grid (Clinical | Research), date + role format.
  - Education & Awards: two-column grid (Degrees | Awards).
  - Expertise: inline chips with subtle oxblood background tint.
  - Research: project name (Fraunces bold) + tag + description.
  - Publications: year + title (Fraunces) + venue + citations, compact rows.
  - Speaking & Service: grouped by sub-type (talks, boards, review, supervision, media).
  - Contact: email, LinkedIn, GitHub Pages URL, affiliations.
- **Watermark:** BL monogram SVG at 5% opacity, bottom-right corner.
- **Page numbers:** JetBrains Mono 8px, centered bottom.

**html2pdf.js config:**
```js
{
  margin: [20, 20, 20, 20], // mm
  filename: 'Bobby_Lo_CV_YYYY-MM-DD.pdf',
  image: { type: 'jpeg', quality: 0.98 },
  html2canvas: { scale: 2, useCORS: true, letterRendering: true },
  jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
}
```

### Text-Selectable PDF (jsPDF) — Secondary

Same content, drawn programmatically via `jsPDF.text()`, `jsPDF.line()`, `jsPDF.setFont()`.

- Centered header (name, title, contact) — no monogram graphic.
- Section headings: bold, uppercase, with underline rule.
- Body: clean Inter-equivalent (Helvetica), 10pt.
- Dates: regular weight (no oxblood colour — everything is black/grey for maximum print compatibility).
- Simpler layout: single-column where the two-column grid doesn't fit neatly.
- Traditional academic CV feel.

### Filename
`Bobby_Lo_CV_YYYY-MM-DD.pdf` — date at generation time.

## 4. Content Sourcing

All content is scraped from the existing DOM to avoid data duplication:

| Section | DOM Source |
|---------|-----------|
| Photo | `.hero-portrait img[src]` |
| Introduction | `#about .prose p` |
| Current positions | `#currently .role-card` (iterate) |
| Experience | `#experience .timeline li` (both columns) |
| Education & Awards | `#education .timeline li` (both columns) |
| Expertise | `#expertise .comp-card` + `.course-list li` |
| Research | `#research .research-card` |
| Publications | `#latest-pubs-list .pub-row` (for "Latest" mode) or fetch from OpenAlex API (for "All" / "Top 10") |
| Speaking & Service | `#speaking .sso-block` |
| Contact | `#contact .contact-list li` + `.aff-marks span` |

**Publications "All" / "Top 10":** These require an OpenAlex API call since the homepage only shows 5 latest. Reuse the existing author ID and mailto from `script.js`. For "Top 10 by citations", sort by `cited_by_count:desc`.

## 5. File Structure

```
index.html          — add: favicon <img> in footer, <script defer> for easter-egg.js
style.css           — append: easter egg modal + toggle styles (~80 lines)
easter-egg.js       — new: all modal logic, DOM scraping, PDF generation (~400 lines)
```

No new HTML files. No build step. No framework dependencies.

## 6. Technical Constraints

- **Vanilla JS only** — no React, Vue, or jQuery.
- **CDN-loaded libraries** — html2pdf.js and jsPDF loaded on demand.
- **Mobile responsive** — modal scales down, toggle list scrolls, 16px min touch targets.
- **`prefers-reduced-motion`** — animations degrade to fades only.
- **Accessibility** — `role="dialog"`, `aria-modal="true"`, `aria-labelledby` on heading, focus trapping, Escape to close, all controls keyboard-operable.
- **Performance** — zero impact on normal page loads (no libs loaded, no extra DOM until trigger).
