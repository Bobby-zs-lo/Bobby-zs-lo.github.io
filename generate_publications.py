"""Generate publications.html, publications.xml, and abstract_cache.json.

Run weekly via GitHub Action, or locally with --max-new to stage backfill.
"""
from __future__ import annotations

import argparse
import html
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import requests

import enrich
import topics

# === Settings ===
AUTHOR_ID = "a5078664290"
MAILTO = "bobby.lo@regionh.dk"
OUTPUT_HTML = Path("publications.html")
OUTPUT_RSS = Path("publications.xml")
CACHE_PATH = Path("data/abstract_cache.json")
SITE_BASE = "https://bobby-zs-lo.github.io"

HIGH_IMPACT_KEYWORDS = [
    "nature", "gastroenterology", "gut", "lancet", "jama", "new england journal",
]


def fetch_author() -> Dict[str, Any]:
    url = f"https://api.openalex.org/authors/{AUTHOR_ID}?mailto={MAILTO}"
    try:
        return requests.get(url, timeout=20).json()
    except requests.RequestException as e:
        print(f"Warning: author fetch failed: {e}")
        return {}


def fetch_works() -> List[Dict[str, Any]]:
    url = (
        f"https://api.openalex.org/works?filter=authorships.author.id:{AUTHOR_ID}"
        f"&per_page=200&sort=publication_date:desc&mailto={MAILTO}"
    )
    try:
        return requests.get(url, timeout=30).json().get("results", []) or []
    except requests.RequestException as e:
        print(f"Warning: works fetch failed: {e}")
        return []


def author_name_keywords(author: Dict[str, Any]) -> List[str]:
    names = list(author.get("display_name_alternatives", []) or [])
    if author.get("display_name"):
        names.append(author["display_name"])
    return names or ["Bobby Lo"]


def highlight_name(authors_list: List[Dict[str, Any]], keywords: List[str]) -> str:
    out = []
    for a in authors_list:
        name = str((a.get("author") or {}).get("display_name", "Unknown"))
        is_hl = any(k.lower() in name.lower() for k in keywords if k)
        out.append(f"<b>{html.escape(name)}</b>" if is_hl else html.escape(name))
    return ", ".join(out)


def highlight_name_short(authors_list: List[Dict[str, Any]], keywords: List[str]) -> str:
    pairs = []
    for a in authors_list:
        name = str((a.get("author") or {}).get("display_name", "Unknown"))
        pairs.append((name, any(k.lower() in name.lower() for k in keywords if k)))
    if len(pairs) <= 3:
        return ", ".join(f"<b>{html.escape(n)}</b>" if hl else html.escape(n) for n, hl in pairs)
    top3 = [f"<b>{html.escape(n)}</b>" if hl else html.escape(n) for n, hl in pairs[:3]]
    bobby_in_top3 = any(hl for _, hl in pairs[:3])
    if bobby_in_top3:
        return ", ".join(top3) + " ..."
    for n, hl in pairs[3:]:
        if hl:
            return ", ".join(top3) + f" ... <b>{html.escape(n)}</b> ..."
    return ", ".join(top3) + " ..."


def render_pub_row(pub: Dict[str, Any], cache: Dict[str, Dict[str, Any]],
                   authors_renderer=None, keywords: List[str] | None = None) -> str:
    """Render one <li class='pub-row'> with summary blurb + data-search + data-topics."""
    keywords = keywords or ["Bobby Lo"]
    authors_renderer = authors_renderer or (lambda a: highlight_name(a, keywords))
    title = pub.get("title") or "Untitled"
    year = pub.get("publication_year") or "n.d."
    authors_html = authors_renderer(pub.get("authorships", []) or [])
    primary = pub.get("primary_location") or {}
    source = primary.get("source") or {}
    venue = source.get("display_name") or "Unknown journal or conference"

    entry = cache.get(pub.get("id") or "") or {}
    summary = entry.get("summary") or ""
    mesh = entry.get("mesh_terms") or []
    concepts = entry.get("openalex_concepts") or []
    topic_list = topics.topics_for(mesh, concepts)
    topics_attr = html.escape(" ".join(topic_list))

    plain_authors = ", ".join(
        (a.get("author") or {}).get("display_name", "") for a in pub.get("authorships", []) or []
    )
    search_blob = " ".join([str(title), plain_authors, str(venue), summary]).lower()
    search_attr = html.escape(search_blob, quote=True)

    summary_block = (
        f'<p class="pub-summary">{html.escape(summary)}</p>'
        if summary else ""
    )

    return (
        f'<li class="pub-row" data-topics="{topics_attr}" data-search="{search_attr}">'
        f'<span class="pub-year">{html.escape(str(year))}</span>'
        f'<div>'
        f'<strong>{html.escape(str(title))}</strong>'
        f'<span class="pub-meta">{authors_html} &middot; {html.escape(str(venue))}</span>'
        f'{summary_block}'
        f'</div>'
        f'</li>'
    )


def render_chip_bar(cache: Dict[str, Dict[str, Any]]) -> str:
    """Render the topic chip bar. Only shows chips with at least one matching paper."""
    present: set[str] = set()
    for entry in cache.values():
        for t in topics.topics_for(entry.get("mesh_terms") or [], entry.get("openalex_concepts") or []):
            present.add(t)
    chips = ['<button class="topic-chip" data-topic="all" aria-pressed="true">All</button>']
    for t in topics.TOPIC_ORDER:
        if t in present:
            chips.append(
                f'<button class="topic-chip" data-topic="{html.escape(t)}" '
                f'aria-pressed="false">{html.escape(t)}</button>'
            )
    return f'<div class="topic-chips" role="group" aria-label="Filter by topic">{"".join(chips)}</div>'


def render_rss(works: List[Dict[str, Any]], cache: Dict[str, Dict[str, Any]]) -> str:
    """Render a minimal RSS 2.0 feed of the 25 most recent publications."""
    items = []
    for pub in works[:25]:
        title = html.escape(pub.get("title") or "Untitled")
        link = pub.get("doi") or pub.get("id") or SITE_BASE
        entry = cache.get(pub.get("id") or "") or {}
        desc = html.escape(entry.get("summary") or pub.get("title") or "")
        pub_date = pub.get("publication_date") or ""
        items.append(
            f"<item><title>{title}</title><link>{html.escape(link)}</link>"
            f"<guid isPermaLink=\"false\">{html.escape(pub.get('id') or link)}</guid>"
            f"<description>{desc}</description>"
            f"<pubDate>{html.escape(pub_date)}</pubDate></item>"
        )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<rss version="2.0"><channel>'
        '<title>Publications — Bobby Zhao Sheng Lo, MD, PhD</title>'
        f'<link>{SITE_BASE}/publications.html</link>'
        '<description>Latest peer-reviewed publications.</description>'
        f'<lastBuildDate>{datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")}</lastBuildDate>'
        + "".join(items) + "</channel></rss>"
    )


# === Rendering helpers (highlights, JSON-LD) — kept from original ===

def _esc_json(s: str) -> str:
    return (s or "").replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ").replace("\r", " ")


def build_pub_jsonld(pub: Dict[str, Any]) -> str:
    title = _esc_json(pub.get("title", "Untitled"))
    year = pub.get("publication_year", "")
    date = pub.get("publication_date", "") or (str(year) if year else "")
    primary = pub.get("primary_location") or {}
    source = primary.get("source") or {}
    venue = _esc_json(source.get("display_name", ""))
    doi = pub.get("doi") or ""
    cites = pub.get("cited_by_count", 0)
    author_objs = []
    for a in (pub.get("authorships") or [])[:10]:
        nm = _esc_json(((a.get("author") or {}).get("display_name")) or "Unknown")
        author_objs.append(f'{{"@type":"Person","name":"{nm}"}}')
    authors_str = ",".join(author_objs)
    doi_block = f',"sameAs":"{_esc_json(doi)}"' if doi else ""
    venue_block = f',"isPartOf":{{"@type":"Periodical","name":"{venue}"}}' if venue else ""
    return (
        "{"
        '"@context":"https://schema.org","@type":"ScholarlyArticle",'
        f'"headline":"{title}","datePublished":"{date}",'
        f'"author":[{authors_str}],"citationCount":{int(cites)}'
        f"{doi_block}{venue_block}"
        "}"
    )


def render_html(author: Dict[str, Any], works: List[Dict[str, Any]],
                cache: Dict[str, Dict[str, Any]]) -> str:
    """Produce the full publications.html string."""
    h_index = author.get("summary_stats", {}).get("h_index", 0)
    i10_index = author.get("summary_stats", {}).get("i10_index", 0)
    citations = author.get("cited_by_count", 0)
    openalex_url = author.get("id", "#")
    keywords = author_name_keywords(author)

    by_year: Dict[Any, List[Dict[str, Any]]] = {}
    highlighted: List[tuple] = []
    for pub in works:
        year = pub.get("publication_year", "n.d.")
        by_year.setdefault(year, []).append(pub)
        venue = ((pub.get("primary_location") or {}).get("source") or {}).get(
            "display_name", "") or ""
        cites = pub.get("cited_by_count", 0)
        if cites > 50 or any(k in venue.lower() for k in HIGH_IMPACT_KEYWORDS):
            highlighted.append((pub, cites, venue, pub.get("publication_year", "n.d.")))
    highlighted.sort(key=lambda x: x[1], reverse=True)
    top_highlights = highlighted[:5]

    highlights_jsonld = ""
    if top_highlights:
        items = ",".join(build_pub_jsonld(p) for p, _c, _v, _y in top_highlights)
        highlights_jsonld = (
            '<script type="application/ld+json">{'
            '"@context":"https://schema.org","@type":"ItemList",'
            '"name":"Highlighted publications",'
            f'"itemListElement":[{items}]}}</script>'
        )

    chip_bar = render_chip_bar(cache)

    highlights_html = ""
    if top_highlights:
        rows = []
        for pub, _cites, _venue, _year in top_highlights:
            rows.append(
                render_pub_row(
                    pub, cache,
                    authors_renderer=lambda a, kw=keywords: highlight_name_short(a, kw),
                    keywords=keywords,
                )
            )
        highlights_html = f"""
      <section class="section">
        <div class="container section-inner">
          <div class="section-gutter"><span class="eyebrow">// 02  Highlighted</span></div>
          <div class="section-body">
            <h2>Highlighted publications</h2>
            <ul class="pubs-preview">{''.join(rows)}</ul>
          </div>
        </div>
      </section>
"""

    year_blocks = []
    for year in sorted(by_year.keys(), key=lambda y: int(y) if str(y).isdigit() else 0, reverse=True):
        rows = "".join(render_pub_row(p, cache, keywords=keywords) for p in by_year[year])
        year_blocks.append(f"""
              <div class="collapsible-section">
                <button class="collapsible">{year}</button>
                <div class="content">
                  <ul class="pubs-preview">{rows}</ul>
                </div>
              </div>""")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Publications &mdash; Bobby Zhao Sheng Lo, MD, PhD &middot; {len(works)} peer-reviewed works</title>
    <meta name="description" content="Peer-reviewed publications by Bobby Zhao Sheng Lo, MD, PhD. {citations:,} citations &middot; h-index {h_index} &middot; i10-index {i10_index}.">
    <meta name="author" content="Bobby Zhao Sheng Lo">
    <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
    <meta name="theme-color" content="#1A1614">
    <link rel="stylesheet" href="style.css">
    <link rel="canonical" href="{SITE_BASE}/publications.html" />
    <link rel="alternate" type="application/rss+xml" title="Publications RSS" href="{SITE_BASE}/publications.xml" />
    <link rel="icon" type="image/jpeg" href="image/profile-2026.jpg">
    {highlights_jsonld}
</head>
<body>
    <nav class="nav">
      <div class="container nav-inner">
        <a href="index.html" class="nav-brand">Bobby<span class="nav-brand-dot">.</span>Lo</a>
        <ul class="nav-links">
          <li><a href="index.html">Home</a></li>
          <li><a href="publications.html" class="active">Publications</a></li>
        </ul>
      </div>
    </nav>
    <main>
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
            <a href="{openalex_url}" target="_blank" rel="noopener" class="btn btn-outline" style="margin-top:24px">View OpenAlex profile &rarr;</a>
          </div>
        </div>
      </section>
      {highlights_html}
      <section class="section">
        <div class="container section-inner">
          <div class="section-gutter"><span class="eyebrow">// 03  All publications</span></div>
          <div class="section-body">
            <h2>Peer-reviewed publications</h2>
            {chip_bar}
            <input type="text" id="searchBox" onkeyup="filterPublications()" placeholder="Search publications&hellip;" class="pubs-search" />
            <button id="toggleAllBtn" onclick="toggleAll()" class="btn btn-outline" style="margin-bottom:18px">Expand All</button>
            <div id="publicationsList">{''.join(year_blocks)}</div>
          </div>
        </div>
      </section>
    </main>
    <footer class="site-footer">
      <div class="container site-footer-inner">
        <span>&copy; {datetime.now(timezone.utc).year} Bobby Zhao Sheng Lo.</span>
        <span class="site-footer-meta">All rights reserved.</span>
      </div>
    </footer>
    <button id="toTopBtn" title="Go to top" aria-label="Scroll to top">&uarr;</button>
    <script src="script.js"></script>
</body>
</html>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate publications.html and friends.")
    parser.add_argument("--max-new", type=int, default=None,
                        help="Cap how many uncached papers to enrich this run (default: unlimited).")
    parser.add_argument("--skip-enrich", action="store_true",
                        help="Render from existing cache only; do not call PubMed/Gemini.")
    args = parser.parse_args()

    author = fetch_author()
    works = fetch_works()
    if not works:
        print("Error: no works fetched; aborting render to avoid wiping pages.")
        return 1

    cache = enrich.load_cache(CACHE_PATH)
    if not args.skip_enrich:
        before = sum(1 for v in cache.values() if v.get("summary"))
        enrich.enrich(works, cache, max_new=args.max_new)
        after = sum(1 for v in cache.values() if v.get("summary"))
        print(f"Enrichment: {after - before} new summaries; {after} total cached.")
        enrich.save_cache(CACHE_PATH, cache)

    OUTPUT_HTML.write_text(render_html(author, works, cache), encoding="utf-8")
    print(f"Wrote {OUTPUT_HTML}.")

    OUTPUT_RSS.write_text(render_rss(works, cache), encoding="utf-8")
    print(f"Wrote {OUTPUT_RSS}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
