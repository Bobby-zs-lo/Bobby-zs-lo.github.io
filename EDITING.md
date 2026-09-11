# How to update the site as your CV evolves

This is a plain-English guide for editing your portfolio when life changes — a new job, a new talk, a new course, a new award. Follow the recipes below; you almost never need to touch JavaScript or CSS.

## The files at a glance

| File | What it is | When to touch it |
|---|---|---|
| `index.html` | The home page — hero, about, currently, experience, expertise, research, speaking, contact | Whenever your career changes |
| `publications.html` | The publications archive | **Never by hand** — auto-regenerated weekly by GitHub Actions |
| `generate_publications.py` | Python script that builds `publications.html` from OpenAlex | Only if you want to change how the publications page is styled |
| `style.css` | All visual styling | Only if you want to change colors, fonts, spacing |
| `script.js` | Live OpenAlex fetches + scroll animations | Only if you want to change behavior |
| `image/profile.JPG` | Your hero portrait | When you have a new photo |

## How the auto-updates work

- **Citations / h-index / i10 / publication count** on the home page are fetched live from OpenAlex on every page load. You don't update them — they update themselves.
- **"Latest publications" section** on the home page is also fetched live from OpenAlex on every page load (top 5 by date).
- **Full publications page** is regenerated every Sunday at midnight by GitHub Actions running `generate_publications.py`. You can also trigger it manually via the "Actions" tab on GitHub → "Update Publications" → "Run workflow".
- **You will never edit `publications.html` directly.**

---

## Recipe 1 — Your title or affiliation changed

Three places need updating. They're all in `index.html`.

### A) Hero eyebrow (top tagline)

Look for:
```html
<div class="eyebrow">MD · PHD · Specialist trainee</div>
```
Change the text between the tags. Keep it short — three to four chunks separated by ` · `.

### B) Hero role paragraph (the long sentence)

Look for:
```html
<p class="hero-role">Specialist trainee in Gastroenterology at Bispebjerg Hospital · Postdoc and Leader of the Gastrointestinal Artificial Intelligence Network (GAIN) · Section Leader at the Copenhagen Center for Inflammatory Bowel Disease.</p>
```
Replace with the current truth. Aim for one sentence that names your roles.

### C) About section (the three paragraphs further down)

Look for the section that starts:
```html
<section class="section" id="about">
```
Inside it there are three `<p>` paragraphs. Edit them as your story evolves.

### D) Also update the SEO description in the page `<head>`

Near the top of `index.html` find:
```html
<meta name="description" content="Portfolio of Bobby Zhao Sheng Lo, MD, PhD, ...">
```
Keep this aligned with your current role — Google reads this.

---

## Recipe 2 — You started a new job (or changed roles)

Two sections need an entry: **Currently** (top 3 roles) and **Experience** (full timeline).

### A) Currently section — for one of your three featured roles

Find `<section class="section" id="currently">`. Inside it there are three `<article class="role-card">` blocks. Each one is:

```html
<article class="role-card">
  <span class="role-date">2026 — Present</span>
  <h3>Specialist Trainee</h3>
  <p class="role-org">Department of Gastroenterology, Bispebjerg Hospital</p>
  <p class="role-note">Internal Medicine / Gastroenterology &amp; Hepatology specialist training.</p>
</article>
```

To swap a role: replace the `role-date`, `<h3>`, `role-org`, and `role-note` text in one of the three cards. Use the markup for special characters: `&amp;` for `&`, `&aelig;` `&oslash;` `&aring;` for `æ ø å`.

If you want **a fourth role** (not recommended — three reads best), copy a whole `<article>...</article>` block and paste it; the grid handles 1-3 cards cleanly but 4+ gets cramped.

### B) Experience section — add a new row to the timeline

Find `<section class="section" id="experience">`. Inside it there are two columns (`exp-col`) — **Clinical** on the left, **Research** on the right. Each row in a column is:

```html
<li><span class="tl-date">2026 →</span><div><strong>Bispebjerg Hospital</strong><br/>Specialist Trainee · Internal Medicine / Gastroenterology &amp; Hepatology</div></li>
```

To add a new entry at the top:
1. Copy any existing `<li>...</li>` row
2. Paste it as the **first** `<li>` inside the right `<ul class="timeline">`
3. Update the date, the bold institution, and the description after `<br/>`

Use `2026 →` for "ongoing" entries; use `2026` or `2025–26` for completed.

---

## Recipe 3 — You got an award or finished a degree

Find `<section class="section" id="education">`. Two columns: **Degrees** and **Awards & Recognition**.

To add an award, look for:
```html
<ul class="timeline">
  <li><span class="tl-date">2024</span><div><strong>FALK Foundation</strong><br/>AI in Gastroenterology Poster Award</div></li>
  <li><span class="tl-date">2021</span><div><strong>Y-ECCO</strong><br/>Congress Abstract Award</div></li>
</ul>
```
Copy the structure for one `<li>`, paste it as the new first row, and fill in the year, bold issuer name, and award name.

Same pattern for degrees (in the other column).

---

## Recipe 4 — You completed a course

Find `<section class="section" id="expertise">`. Inside it there's a `<details class="courses">` block with a `<ul class="course-list">`.

Each course is:
```html
<li><span class="tl-date">2026</span> Clinical Supervision and Mentoring (Pedagogy II)</li>
```

Add a new `<li>` at the top of the list with the year and course title. Also update the summary line:
```html
<span class="courses-toggle-text">18 courses, 2017 — 2026</span>
```
…to say `19 courses` (or whatever the new count is). **The count is not computed** — if you
add a course and forget this line, the summary silently lies.

Courses you *attended* go here. Courses you *taught* go in `data/activity.yaml` under the
Teaching block instead — see § 12.

---

## Recipe 5 — You gave a talk, joined an advisory board, or did media

Find `<section class="section" id="speaking">`. Inside it there are six `.sso-block` sub-sections:
- Invited talks
- Teaching
- Advisory boards
- Peer review
- Supervision & mentorship
- Media

### Adding a talk

Look for the **Invited talks** block:
```html
<ul class="sso-list">
  <li><span class="tl-date">2025</span> "AI i klinisk gastroenterologi — lær at gennemskue forskningen og teknologien bag"</li>
  ...
</ul>
```
Copy one `<li>`, paste it as the first row, change the year and title. Use straight quotes (`"..."`) for English titles, curly for Danish if you prefer.

### Adding a new advisory board

Same pattern inside the **Advisory boards** sub-block. Use `2025 →` for ongoing engagements.

### Updating peer review journals

Look for:
```html
<p class="sso-text">Frequent reviewer for <strong>American Journal of Gastroenterology</strong>, <strong>Journal of Crohn and Colitis</strong>, <strong>Gastroenterology</strong>, and <strong>GUT</strong>.</p>
```
Add a `<strong>New Journal</strong>` in the comma-separated list. Keep the Oxford comma + "and" before the last one.

### Updating supervision counts

Look for:
```html
<p class="sso-text">Supervisor / co-supervisor for several bachelor and master students in Medicine and Data Science. Co-supervisor of 2 PhD students in Medicine and Data Science.</p>
```
Edit the numbers and the descriptions directly.

### Adding a media outlet

Look for the Media `<p class="sso-text">`. Add to the comma-separated list.

---

## Recipe 6 — You started a new research project

Find `<section class="section section-research" id="research">`. Inside it is a `<div class="research-stack">` with 5 research cards. Each is:

```html
<article class="research-card" data-research-idx="0">
  <span class="research-tag">Endoscopy AI</span>
  <h3>ENACT</h3>
  <p>Endoscopic Add-on System for Ulcerative Colitis patients. Real-time CNN inference on live endoscopy video to augment clinician scoring.</p>
</article>
```

To add a new project:
1. Copy one `<article>...</article>` block.
2. Paste it at the top of the stack (most recent first).
3. Update `data-research-idx="0"` and renumber all the others sequentially (0, 1, 2, 3, 4, 5...). **This matters** — the pinned-scroll animation uses this index to reveal cards in order.
4. Update the tag (one short label), the `<h3>` title, and the description paragraph.

To remove a project: delete its `<article>...</article>` block and renumber the rest.

**Note:** the pinned scroll effect on desktop reveals cards one by one as you scroll. The plan is calibrated to 240px of scroll per card. If you add a 6th card, it'll work automatically — the section pins for 6 × 240 = 1440px.

---

## Recipe 7 — Your contact info changed

Find `<section class="section contact" id="contact">`. Inside it:
- The `mailto:` link
- The LinkedIn URL

Also update **the JSON-LD schema** at the very top of `index.html` (`<script type="application/ld+json">...</script>`) where it says `"sameAs": [...]` — Google reads this for the knowledge panel.

---

## Recipe 8 — Your affiliations changed

Same `contact` section. Find:
```html
<div class="aff-marks">
  <span>Copenhagen University Hospital · Hvidovre</span>
  <span>Bispebjerg Hospital</span>
  <span>GAIN</span>
  <span>Copenhagen Center for Inflammatory Bowel Disease</span>
  <span>University of Copenhagen</span>
</div>
```
Add, remove, or reword `<span>` entries.

**Naming:** the Copenhagen Center for Inflammatory Bowel Disease is abbreviated **CPH-IBD**, not CCIBD. Write the full name in the affiliation strip and the role cards. Use CPH-IBD where space is short, as in the Experience timeline.

---

## Recipe 9 — New profile photo

Replace `image/profile.JPG` with a new file at the same path. Keep the same filename (or update the `<img src=>` paths in both `index.html` AND the `og:image` meta tag).

**Aspect ratio matters.** The hero portrait is rendered as a `4 : 5` (portrait) rectangle. If you supply a square photo, faces get cropped. Best practice: provide a photo where your face sits in the upper-center of a 4:5 frame.

---

## Recipe 10 — Trigger a publication re-fetch right now (instead of waiting for Sunday)

The GitHub Action runs every Sunday at midnight. To force it earlier:

1. Go to your repo on GitHub → **Actions** tab
2. Pick **Update Publications** in the left sidebar
3. Click **Run workflow** → confirm

It runs `generate_publications.py` and commits the new `publications.html` if anything changed.

You can also run it locally if you want to preview:
```bash
python generate_publications.py
```
This writes `publications.html` in place. Open it in a browser to check before committing.

---

## How to preview changes locally before pushing

```bash
python -m http.server 8000
```
Then open `http://localhost:8000/` in your browser. Refresh after each edit. When everything looks right:

```bash
git add index.html
git commit -m "Update [whatever you changed]"
git push
```

GitHub Pages will deploy your changes within a minute.

---

## Things that are easy to break (and how to avoid)

1. **Don't delete the `<article class="sr-only">...</article>` block** at the bottom of `index.html`. It's a hidden SEO summary that crawlers read.
2. **Don't delete or rename the JSON-LD schema** in `<head>` either — same reason.
3. **Don't change the section IDs** (`#about`, `#research`, etc.) without updating the navigation `href`s.
4. **Don't add inline `style=""` attributes** if you can avoid it — the design system uses CSS variables. If you must, use the existing vars: `var(--accent)`, `var(--ink)`, `var(--paper)`, etc.
5. **Don't edit `publications.html` by hand** — it's regenerated.
6. **Don't break the `data-research-idx` numbering** when editing research projects (Recipe 6).

---

## Where to change visual styling (colors, fonts, spacing)

All design tokens live at the top of `style.css`:

```css
:root {
  --paper:      #FBFAF7;   /* page background */
  --paper-2:    #F3F1EB;   /* secondary surfaces (metrics strip, course list) */
  --paper-dark: #1A1614;   /* footer, ticker if you bring it back */
  --ink:        #1A1614;   /* primary text + primary button */
  --ink-2:      #4A4340;   /* secondary text */
  --ink-3:      #888280;   /* tertiary text, meta */
  --rule:       rgba(0, 0, 0, 0.08);  /* hairline borders */
  --accent:     #C4302B;   /* Lancet red — eyebrows, accents, hover */
  --accent-2:   #7A1F2B;   /* oxblood — italic display words */
  --ochre:      #C9A96E;   /* ochre — secondary accent */
  ...
}
```
Change the hex values. Every component picks them up automatically.

Fonts are loaded near the top via `@import`. To swap the serif (currently Fraunces), change the Google Fonts URL and the `font-family` references in the `h1`/`h2`/`h3` rules.

---

## Reference: which section is what

| Section ID | What's in it | Recipe |
|---|---|---|
| `#hero` | Name + tagline + role + buttons + portrait | 1 |
| `#metrics` | Live OpenAlex numbers | (auto) |
| `#about` | 3 paragraphs | 1 |
| `#currently` | 3 role cards | 2 |
| `#experience` | Clinical + Research two-column timeline | 2 |
| `#education` | Degrees + Awards two-column | 3 |
| `#expertise` | 3 competency cards + 18-course collapsible | 4 |
| `#research` | 5 pinned research project cards | 6 |
| `#latest-publications` | Live OpenAlex top 5 by date | (auto) |
| `#speaking` | Talks + Teaching + Advisory + Peer review + Supervision + Media | 5, 12 |
| `#contact` | Email + LinkedIn + Affiliations + Footer | 7, 8 |

---

## 11. Editing research projects (YAML-driven)

The four "Major Research Projects" cards on the home page are auto-generated from `data/research_projects.yaml`.

To change a card:

1. Open `data/research_projects.yaml`.
2. Edit the entry. To link a card to a published paper so its description auto-updates from the Gemini summary, set `openalex_id` to the full OpenAlex work URL (e.g. `https://openalex.org/W4392104410`) or `doi` to the DOI string.
3. Run: `python generate_index.py`
4. Open `index.html` in a browser to verify.
5. `git add data/research_projects.yaml index.html` and commit.

When `openalex_id` (or `doi`) resolves to a cached summary, that summary is used and `fallback_description` is ignored.

## 12. Editing talks, teaching, advisory boards, peer review, supervision, media

These live in `data/activity.yaml`. Blocks are typed:

- `type: talks` and `type: boards` → list with `date` and `title`, optional `aux` paragraph.
  Used by **Invited talks** and **Teaching** (the type name is about the markup, not the content).
- `type: text` → free `body` field, supports `<strong>` and `<em>`.

Block order in the file is the order on the page. The three list blocks are kept above the
three text blocks — if you add a new list block, put it with the others.

**The date column is 80px wide.** At 11px JetBrains Mono that is about seven characters, so
`2023–24` fits and `2023 & 2024` does not. Use the site's conventions: `2025` for a single
year, `2023–24` for a completed span, `2025 →` for ongoing.

`title` and `aux` are HTML-escaped by the generator, so straight quotes are safe there; only
`body` on a `type: text` block accepts markup.

After editing:

```
python generate_index.py
git add data/activity.yaml index.html
git commit -m "content: update activity"
```

## 13. Stale or wrong summary on a paper?

Delete the affected entry from `data/abstract_cache.json` and re-run:

```
python generate_publications.py --max-new 1
```

The next weekly Action will also pick it up. Edit the cache directly if you want to hand-write a summary for one paper — `enrich.py` only retries when `summary` is empty/null, so a manual edit sticks.

## 14. Staged backfill of summaries

First time, or after a model change, summaries can be processed a batch at a time:

```
python generate_publications.py --max-new 10
```

Re-run until you see `Enrichment: 0 new summaries`. Commit the cache file when you're happy with quality.

## 15. `publications.html` is not a CV publication list

`generate_publications.py` renders **everything** OpenAlex returns for author `A5078664290`.
That is deliberate for the website, but it is not what belongs on a CV. Screened in
September 2026, the 65 OpenAlex records broke down as:

| | count |
|---|---|
| Peer-reviewed journal articles | **37** (13 first-author) |
| Congress abstracts (ECCO, DDW, UEG Week, EMJ) | 22 |
| Duplicates (2 preprints, 1 dataset deposit, 1 repository copy, 1 issue-level artefact) | 5 |
| Not his paper — a 2008 MIT thesis by a different Bobby Lo | 1 |

Two things follow from this.

**Do not trust `type` alone.** OpenAlex types six of those congress abstracts as `article`
or `review`. The reliable tells are the DOI shape (`jjab232.532`, `s0016-5085(21)01694-2`),
a poster/session prefix in the title (`P405`, `DOP43`, `Sa081`, `Tu1715`, `49:`), and, for
EMJ, a DOI that resolves to an `/abstract/` URL.

**Cross-check against ORCID.** `0000-0002-0252-9341` is hand-curated and contains no
abstracts. Taking the year from Crossref `published-print` (falling back to `issued`)
reproduces the ORCID years exactly — a useful signal that a record is right.

The 2008 MIT thesis is also inflating `works_count` in the live homepage metrics. Fixing it
means correcting the author disambiguation on OpenAlex itself.

## 16. The hidden CV export

The small **BL** monogram in the home-page footer, just before "© 2026 Bobby Zhao Sheng Lo.", opens a
hidden CV exporter. Choose sections with the toggles and press **Generate PDF →**. The PDF is built from
the text on the home page, so change `index.html` first and the export follows. Your hero sentence
becomes the CV subtitle, for example.

The CV made on 11 September 2026 had Introduction, Research projects and Publications **off**, and
Expertise on with **Courses only**. Everything else was on. One copy was made with the photo and one without.

Things to know:

- **Danish letters get flattened.** æ, ø and å come out as ae, o and aa ("Køge" becomes "Koge"). The
  PDF font can print them. The `sanitize()` function in `easter-egg.js` swaps them.
- **Advisory boards are always included** with Speaking & Service. There is no toggle for that block alone.
- **The Research Dissemination section on that CV is not part of the site.** Its figures bar (publications,
  first-author vs co-author split, h-index) and the missing advisory boards came from a one-off export:
  a patched copy of `easter-egg.js` run in a headless browser. For another one like it, ask Claude. It
  keeps the recipe and the approved design.

> **Deprecated:** Recipes that asked you to hand-edit the "Major Research Projects" or "Speaking, Service & Outreach" sections directly in `index.html` no longer apply. Edit the YAML files instead.
