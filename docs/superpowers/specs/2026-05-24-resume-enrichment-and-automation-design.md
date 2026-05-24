# Resume enrichment & automation — design

**Date:** 2026-05-24
**Author:** Bobby Zhao Sheng Lo (with Claude)
**Status:** Draft, awaiting review

## Context

The portfolio (`index.html` + `publications.html`) is well-designed but largely hand-curated.
Two islands of automation already exist: live OpenAlex metrics in the hero (via `script.js`)
and weekly regeneration of `publications.html` from OpenAlex (via `generate_publications.py`
+ GitHub Actions).

Three problems limit the site's value to visitors and to the owner:

1. **No abstracts or summaries anywhere.** Visitors see only titles. The 4 "Major Research
   Projects" cards on the home page are static paragraphs that drift out of date.
2. **No topic structure.** The publications page is a flat year-grouped list with no way to
   filter by IBD / AI / endoscopy / epidemiology.
3. **Activity content is hand-edited.** Talks, media, grants, supervision are typed into
   `index.html` directly, which is friction.

This spec covers a full-sweep enrichment + automation pass: every paper gets a
machine-generated lay summary (Gemini), the site search includes those summaries, the
publications page gets topic filter chips driven from MeSH/OpenAlex concepts, the home-page
"Major Research Projects" and outreach sections become data-driven from YAML files, and
the weekly GitHub Action only spends LLM tokens on papers that don't already have a cached
summary.

Dark mode, co-author graphs, ORCID two-way sync, preprint pickup, and newsletter
generation are **out of scope** for this design.

## Goals

- Every publication in `publications.html` shows a ≤30-word plain-English summary under
  its title.
- The 4 "Major Research Projects" cards on `index.html` pull their description from the
  cached summary of the paper they cite, with a YAML-defined fallback.
- The publications search box matches against the summary text (not just title/authors/venue).
- Filter chips above the publications list let visitors narrow by curated topics
  (IBD, Crohn's, UC, Microbiome, AI / Deep Learning, Endoscopy, Epidemiology, Registry).
- Outreach content (talks, media, grants, supervision) becomes editable from
  `data/activity.yaml` instead of HTML.
- The weekly GitHub Action calls Gemini **only for papers that don't already have a
  cached summary**. Re-running on an unchanged repo costs zero tokens.
- An RSS feed (`publications.xml`) is published alongside `publications.html`.

## Non-goals

- Dark mode (separate one-off PR).
- Re-summarising existing entries when the model changes (cache is append-only by design;
  invalidation is manual — delete the cache entry).
- Co-author graph visualisation.
- bioRxiv / medRxiv preprint ingestion (same pipeline could absorb it later).
- Translating summaries to Danish (could be added; same cache shape).

## Architecture

### Data sources

| Source | Used for | Notes |
|---|---|---|
| OpenAlex `works` API | Master publication list, `abstract_inverted_index`, `concepts` | Already in use. Free, no key. |
| NCBI ID Converter | DOI → PMID lookup | Free, no key. ~3 req/s polite limit. |
| PubMed E-utilities (`efetch`) | MeSH terms; fallback abstract | Free, no key. ~3 req/s. |
| Gemini API (`gemini-3.5-flash`) | ~30-word lay summary | `GEMINI_API_KEY` GH secret. Same key the Apps Script receipt flow uses. |

### Pipeline

```
[GH Action weekly cron]
        │
        ▼
fetch OpenAlex works  ──►  load data/abstract_cache.json
        │                          │
        ▼                          │
for each work:                     │
  entry = cache.get(work_id)       │
  if entry and entry.summary:      │
      skip ────────────────────────┘
  else:
    abstract  = entry.abstract if entry else reconstruct(work.abstract_inverted_index)
    pmid      = entry.pmid     if entry else doi_to_pmid(work.doi)    # may be null
    mesh      = entry.mesh     if entry else pubmed_mesh(pmid)         # may be []
    if not abstract and pmid:
      abstract = pubmed_abstract(pmid)         # fallback
    if abstract:
      summary = gemini_summarise(abstract)     # ≤30 words, lay
    cache[work_id] = { abstract, pmid, mesh,
                       openalex_concepts, summary,
                       summary_model, summary_generated_at }

write data/abstract_cache.json   (sorted keys for deterministic diffs)
generate_publications.py:
  render publications.html  (titles + summaries + data-search + data-topics + chips)
  render publications.xml   (RSS)
generate_index.py:
  inject research project cards + activity sections into index.html
  between sentinel comments, preserving manual content outside them
commit changed files
```

### Cache schema (`data/abstract_cache.json`)

Keyed by **OpenAlex work ID** (stable, present for every paper, survives DOI changes).

```json
{
  "https://openalex.org/W4392104410": {
    "doi": "10.1053/j.gastro.2024.01.001",
    "pmid": "38449034",
    "abstract": "Background and aims: ...",
    "abstract_source": "openalex",
    "mesh_terms": ["Inflammatory Bowel Diseases", "Artificial Intelligence", "Colonoscopy"],
    "openalex_concepts": ["Gastroenterology", "Machine learning"],
    "summary": "Tested whether an AI tool could detect early UC flares from colonoscopy video; matched expert raters in 92% of cases.",
    "summary_model": "gemini-3.5-flash",
    "summary_generated_at": "2026-05-24T00:00:00Z"
  }
}
```

`data/abstract_cache.json` lives in git: free, versioned, reviewable, deterministic.
Expected size: ~80 entries × ~600 bytes = ~50 KB.

### Configuration files

**`data/research_projects.yaml`** — drives the 4 "Major Research Projects" cards:

```yaml
- id: enact
  tag: "Endoscopic AI · 2025"
  title: "ENACT — AI-augmented endoscopy for UC"
  openalex_id: "https://openalex.org/W4392104410"   # preferred key
  doi: "10.1053/j.gastro.2024.01.001"               # fallback key
  fallback_description: "AI overlay for live colonoscopy in ulcerative colitis."
```

The script resolves `openalex_id` (or `doi`) to a cache entry and uses its `summary`
as the card description. If neither resolves (e.g., manuscript not yet published),
`fallback_description` is used.

**`data/activity.yaml`** — drives outreach + currently sections:

```yaml
- date: 2026-04-15
  type: talk           # talk | media | grant | award | supervision | role
  title: "Keynote at ECCO Congress 2026"
  venue: "Berlin"
  url: "https://..."
```

Rendered into the existing "Speaking, Service & Outreach" section grouped by `type`,
most recent first.

### Topic chips

Vocabulary is **curated, not free-form** — otherwise 200 MeSH chips would clutter the
page. The script defines a fixed list:

```python
TOPIC_VOCAB = {
  "IBD":         ["Inflammatory Bowel Diseases", "Inflammatory bowel disease"],
  "Crohn's":     ["Crohn Disease", "Crohn's disease"],
  "UC":          ["Colitis, Ulcerative", "Ulcerative colitis"],
  "Microbiome":  ["Gastrointestinal Microbiome", "Microbiome"],
  "AI":          ["Artificial Intelligence", "Deep Learning", "Machine learning"],
  "Endoscopy":   ["Endoscopy", "Colonoscopy"],
  "Epidemiology":["Epidemiology", "Cohort Studies"],
  "Registry":    ["Registries"],
}
```

A paper matches a chip if any of its `mesh_terms` or `openalex_concepts` contains one
of the vocab values (case-insensitive substring match). Each `.pub-row` gets
`data-topics="IBD AI Endoscopy"`. The chip toggle handler shows only rows whose
`data-topics` intersects the active set; "All" clears the filter.

### Search

Each `.pub-row` carries `data-search` = `"title authors venue summary"` lowercased and
whitespace-joined. The existing `filterPublications()` in `script.js` is changed from
`element.textContent.toLowerCase().includes(q)` to
`element.dataset.search.includes(q)`. Faster, and inherently includes the summary.

## Components

| Component | File | Responsibility |
|---|---|---|
| Fetcher | `generate_publications.py` (existing, kept) | OpenAlex works + author profile. Already exists; minor refactor. |
| Enrichment | **new** `enrich.py` | Abstract reconstruction, PubMed lookup, Gemini call, cache I/O. Single public function `enrich(works, cache, max_new=None) -> updated_cache`. |
| Renderer (publications) | `generate_publications.py` (extended) | Render `publications.html` + `publications.xml` from works + cache. Adds `data-search`, `data-topics`, summary blurb, chip bar. |
| Renderer (home) | **new** `generate_index.py` | Inject research project cards + activity sections into `index.html` between sentinel comments. |
| Topic + search JS | `script.js` (extended) | Topic chip toggle handler; updated `filterPublications()`. |
| Styles | `style.css` (extended) | `.pub-summary`, `.topic-chips`, `.topic-chip[aria-pressed]`. |
| Workflow | `.github/workflows/update-publications.yml` (modified) | Add `GEMINI_API_KEY` env, install `google-generativeai` + `pyyaml`, run both generators, commit `data/*` + `*.html` + `*.xml`. |
| Index | `index.html` (annotated) | Add `<!-- RESEARCH-START -->…<!-- RESEARCH-END -->` and `<!-- OUTREACH-START -->…<!-- OUTREACH-END -->` sentinel comments around the auto-managed regions. Manual edits outside the sentinels are preserved. |

Splitting `enrich.py` out of `generate_publications.py` keeps the pipeline testable
(enrichment is pure given fixtures) and prevents the generator from growing past ~600
lines as features stack up. The current `generate_publications.py` is already at 389
lines mixing fetch + render + JSON-LD; the refactor is overdue.

## Error handling

| Failure | Behaviour |
|---|---|
| OpenAlex fetch fails | Existing behaviour: log warning, render empty list. Don't touch cache. |
| `abstract_inverted_index` missing | Try PubMed `efetch` for abstract. If still missing, store cache entry with `summary: null` so we don't retry endlessly. |
| DOI → PMID lookup fails | Continue without PMID; no MeSH terms; OpenAlex concepts only. |
| PubMed efetch returns no MeSH | `mesh_terms: []`. Paper won't match MeSH-based chips, but OpenAlex concepts still apply. |
| Gemini call fails (rate limit, network, blocked content) | Log warning, cache the abstract + MeSH but leave `summary: null`. Next run retries (because the cache check is `summary is None`, not `key in cache`). |
| `data/activity.yaml` malformed | Render fails loud — fail the whole GH Action run rather than silently dropping content. |

## Rate limiting

- Sleep 0.4s between PubMed calls (well under 3 req/s polite limit, no API key needed).
- Sleep 1s between Gemini calls. With at most a handful of new papers per week,
  total enrichment time stays under a minute.
- New flag `--max-new N` on `generate_publications.py` (default unlimited) so the
  first run can be staged (e.g., `--max-new 10`) to validate before processing the
  whole back-catalogue.

## Initial backfill

On first run the cache is empty, so ~80 papers need summarising. At 1s/call this is
~80 seconds plus Gemini latency. Within free-tier limits (1500/day for Flash 2.0).
Run locally first with `--max-new 10` to sanity-check summary quality, then let the
weekly cron pick up the rest, or run unbounded locally and commit the cache.

## Verification plan

1. **Local dry-run of enrichment**
   ```
   export GEMINI_API_KEY=...
   python generate_publications.py --max-new 5
   ```
   Confirm `data/abstract_cache.json` is created with 5 entries, each containing
   `abstract`, `summary`, and (where available) `pmid` + `mesh_terms`.
   Eyeball summaries for accuracy — they should be lay-readable, ≤30 words, and
   not hallucinate findings beyond the abstract.

2. **Render check**
   Open `publications.html` in a browser. Verify:
   - Summaries render under titles for the 5 enriched papers.
   - Search box matches summary text (search for a word that's in a summary but not
     a title).
   - Topic chips appear above the list and toggle correctly.
   - `publications.xml` validates as RSS 2.0 (`xmlcheck` or browser).

3. **Idempotency**
   Re-run `python generate_publications.py`. Confirm:
   - Zero Gemini calls (log line "0 new papers to enrich").
   - `data/abstract_cache.json` byte-identical to previous run (except possibly
     ordering — sort keys before write).

4. **Home-page injection**
   Edit `data/research_projects.yaml` to point one card at a different paper.
   Run `python generate_index.py`. Confirm `index.html` updates between sentinels
   and the manually-edited hero copy outside the sentinels is untouched.

5. **GitHub Action**
   Add `GEMINI_API_KEY` repo secret. Manually trigger the workflow from the
   Actions tab. Confirm the auto-commit includes `data/abstract_cache.json`,
   `publications.html`, `publications.xml`, and (if changed) `index.html`.

## Migration notes

- `generate_publications.py` currently writes the whole `publications.html` from a
  single big f-string. After the refactor it continues to do so — the file is
  fully regenerated each run, so no sentinel comments are needed there.
- `index.html` is **partially** regenerated. Sentinel comments are required for
  the auto-managed regions. Add them in a separate prep commit before turning
  on `generate_index.py` so the diff is reviewable.
- `EDITING.md` needs a new recipe section: "Adding a talk" → edit
  `data/activity.yaml`. The old "edit the HTML directly" recipes for outreach
  become obsolete; flag them as deprecated rather than deleting (history).

## Open questions

- **Summary model:** `gemini-3.5-flash` is the default. If a higher-quality
  tier is preferred later, change the constant in `enrich.py`. Cache records
  the model used, so swapping later doesn't corrupt existing entries.
- **Summary prompt:** the spec assumes the prompt is tuned during implementation.
  Suggested starting point: *"Summarise this medical research abstract in one
  plain-English sentence of at most 30 words, aimed at an educated non-specialist.
  State what was tested and the main finding. Do not invent details. Abstract: …"*
