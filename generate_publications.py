import requests
from typing import List, Tuple, Dict, Any

# === Settings ===
author_id = "a5078664290"
output_file = "publications.html"
mailto = "bobby.lo@regionh.dk"

# === Fetch Author Profile from OpenAlex ===
try:
    author_url = f"https://api.openalex.org/authors/{author_id}?mailto={mailto}"
    author_response = requests.get(author_url)
    author_data = author_response.json()

    h_index = author_data.get('summary_stats', {}).get('h_index', 0)
    i10_index = author_data.get('summary_stats', {}).get('i10_index', 0)
    citations = author_data.get('cited_by_count', 0)

    author_names_to_highlight = author_data.get('display_name_alternatives', [])
    author_names_to_highlight.append(author_data.get('display_name', ''))

    openalex_url = author_data.get('id', '#')

except requests.exceptions.RequestException as e:
    print(f"Warning: Error fetching author metrics: {e}")
    h_index, i10_index, citations, author_names_to_highlight, openalex_url = 0, 0, 0, ["Bobby Lo"], "#"

# === Fetch Publications from OpenAlex ===
try:
    works_url = f"https://api.openalex.org/works?filter=authorships.author.id:{author_id}&per_page=200&sort=publication_date:desc&mailto={mailto}"
    works_response = requests.get(works_url)
    publications_data = works_response.json().get('results', [])
except requests.exceptions.RequestException as e:
    print(f"Warning: Error fetching publications: {e}")
    publications_data = []


def highlight_name(authors_list: List[Dict[str, Any]]) -> str:
    formatted_authors: List[str] = []
    for author in authors_list:
        author_name = str(author.get('author', {}).get('display_name', 'Unknown author'))
        is_highlighted = any(keyword.lower() in author_name.lower() for keyword in author_names_to_highlight if keyword)
        formatted_authors.append(str(f"<b>{author_name}</b>" if is_highlighted else author_name))
    return ', '.join(formatted_authors)


def highlight_name_short(authors_list: List[Dict[str, Any]]) -> str:
    author_names = []
    for author in authors_list:
        name = str(author.get('author', {}).get('display_name', 'Unknown author'))
        is_highlighted = any(keyword.lower() in name.lower() for keyword in author_names_to_highlight if keyword)
        author_names.append((name, is_highlighted))

    if len(author_names) <= 3:
        return ', '.join([f"<b>{name}</b>" if is_hl else name for name, is_hl in author_names])

    top_3_formatted = [f"<b>{name}</b>" if is_hl else name for name, is_hl in author_names[:3]]
    bobby_in_top_3 = any(is_hl for name, is_hl in author_names[:3])

    if bobby_in_top_3:
        return ', '.join(top_3_formatted) + ' ...'
    else:
        bobby_formatted = None
        for name, is_hl in author_names[3:]:
            if is_hl:
                bobby_formatted = f"<b>{name}</b>"
                break
        if bobby_formatted:
            return ', '.join(top_3_formatted) + f' ... {bobby_formatted} ...'
        else:
            return ', '.join(top_3_formatted) + ' ...'


# Group publications by year and extract highlights
publications_by_year: Dict[str, List[Dict[str, Any]]] = {}
highlighted_publications: List[Tuple[Dict[str, Any], int, str, str]] = []
high_impact_keywords = ['nature', 'gastroenterology', 'gut', 'lancet', 'jama', 'new england journal']

for pub in publications_data:
    year = pub.get('publication_year', 'n.d.')
    if year not in publications_by_year:
        publications_by_year[year] = []
    publications_by_year[year].append(pub)

    citations_count = pub.get('cited_by_count', 0)
    primary_location = pub.get('primary_location')
    source = primary_location.get('source') if primary_location else None
    venue = source.get('display_name') if source else 'Unknown journal or conference'

    is_high_impact = any(keyword in venue.lower() for keyword in high_impact_keywords)
    if citations_count > 50 or is_high_impact:
        highlighted_publications.append((pub, citations_count, venue, year))

highlighted_publications.sort(key=lambda x: x[1], reverse=True)
top_highlights = [highlighted_publications[i] for i in range(min(5, len(highlighted_publications)))]


def _esc_json(s: str) -> str:
    """Minimal JSON string escaping for safe inclusion inside JSON-LD."""
    return (s or "").replace('\\', '\\\\').replace('"', '\\"').replace('\n', ' ').replace('\r', ' ')


def build_pub_jsonld(pub: Dict[str, Any]) -> str:
    """Emit a ScholarlyArticle JSON-LD object for one publication."""
    title = _esc_json(pub.get('title', 'Untitled'))
    year = pub.get('publication_year', '')
    date = pub.get('publication_date', '') or (str(year) if year else '')
    primary_location = pub.get('primary_location') or {}
    source = primary_location.get('source') or {}
    venue = _esc_json(source.get('display_name', ''))
    doi = pub.get('doi') or ''
    cites = pub.get('cited_by_count', 0)
    authors = pub.get('authorships', []) or []
    author_objs = []
    for a in authors[:10]:  # cap to keep payload reasonable
        nm = _esc_json(((a.get('author') or {}).get('display_name')) or 'Unknown')
        author_objs.append(f'{{"@type":"Person","name":"{nm}"}}')
    authors_str = ','.join(author_objs)
    doi_block = f',"sameAs":"{_esc_json(doi)}"' if doi else ''
    venue_block = f',"isPartOf":{{"@type":"Periodical","name":"{venue}"}}' if venue else ''
    return (
        '{'
        '"@context":"https://schema.org",'
        '"@type":"ScholarlyArticle",'
        f'"headline":"{title}",'
        f'"datePublished":"{date}",'
        f'"author":[{authors_str}],'
        f'"citationCount":{int(cites)}'
        f'{doi_block}'
        f'{venue_block}'
        '}'
    )


highlights_jsonld_items = ','.join(build_pub_jsonld(p) for p, _c, _v, _y in top_highlights)
highlights_jsonld = (
    '<script type="application/ld+json">{'
    '"@context":"https://schema.org",'
    '"@type":"ItemList",'
    '"name":"Highlighted publications",'
    f'"itemListElement":[{highlights_jsonld_items}]'
    '}</script>'
) if top_highlights else ''


# === Generate HTML ===
with open(output_file, 'w', encoding='utf-8') as f:
    f.write(f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <title>Publications — Bobby Zhao Sheng Lo, MD, PhD · {len(publications_data)} peer-reviewed works</title>

    <meta name="description"
        content="Peer-reviewed publications by Bobby Zhao Sheng Lo, MD, PhD — specialist trainee in Gastroenterology at Bispebjerg Hospital and Leader of the Gastrointestinal Artificial Intelligence Network (GAIN). {citations:,} citations · h-index {h_index} · i10-index {i10_index}. Topics: AI in IBD, deep learning for endoscopy, clinical epidemiology, Danish registry research.">

    <meta name="keywords"
        content="Bobby Zhao Sheng Lo publications, Bobby Lo MD PhD, Medical AI publications, AI Gastroenterology research, IBD research, Ulcerative Colitis, Crohn's Disease, Deep Learning endoscopy, GAIN Denmark, Copenhagen University Hospital, Clinical Epidemiology, Danish IBD registry, ENACT, Presager, EASI Trial">

    <meta name="author" content="Bobby Zhao Sheng Lo">
    <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
    <meta name="theme-color" content="#1A1614">

    <link rel="stylesheet" href="style.css">
    <link rel="canonical" href="https://bobby-zs-lo.github.io/publications.html" />
    <link rel="icon" type="image/jpeg" href="image/profile-2026.jpg">
    <link rel="apple-touch-icon" href="image/profile-2026.jpg">
    <link rel="sitemap" type="application/xml" href="sitemap.xml">

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>

    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Bobby Zhao Sheng Lo, MD, PhD">
    <meta property="og:title" content="Publications — Bobby Zhao Sheng Lo, MD, PhD">
    <meta property="og:description" content="Peer-reviewed publications. {citations:,} citations · h-index {h_index}. AI in IBD, deep learning for endoscopy, clinical epidemiology.">
    <meta property="og:image" content="https://bobby-zs-lo.github.io/image/og-card.jpg">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:type" content="image/jpeg">
    <meta property="og:image:alt" content="Portrait of Bobby Zhao Sheng Lo, MD, PhD">
    <meta property="og:url" content="https://bobby-zs-lo.github.io/publications.html">
    <meta property="og:locale" content="en_GB">

    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Publications — Bobby Zhao Sheng Lo, MD, PhD">
    <meta name="twitter:description" content="Peer-reviewed publications. {citations:,} citations · h-index {h_index}. AI in IBD, deep learning for endoscopy, clinical epidemiology.">
    <meta name="twitter:image" content="https://bobby-zs-lo.github.io/image/og-card.jpg">

    <!-- Person (kept on publications page so crawlers connect both URLs to the same entity) -->
    <script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": "https://bobby-zs-lo.github.io/#person",
  "name": "Bobby Zhao Sheng Lo",
  "givenName": "Bobby Zhao Sheng",
  "familyName": "Lo",
  "honorificSuffix": "MD, PhD",
  "url": "https://bobby-zs-lo.github.io/",
  "image": "https://bobby-zs-lo.github.io/image/og-card.jpg",
  "jobTitle": [
    "Specialist Trainee in Internal Medicine and Gastroenterology",
    "Postdoctoral Researcher",
    "Leader, Gastrointestinal Artificial Intelligence Network (GAIN)",
    "Principal Investigator, Copenhagen Center for Inflammatory Bowel Disease"
  ],
  "affiliation": [
    {{ "@type": "Hospital", "name": "Bispebjerg Hospital" }},
    {{ "@type": "Hospital", "name": "Copenhagen University Hospital Hvidovre" }},
    {{ "@type": "MedicalOrganization", "name": "Gastrointestinal Artificial Intelligence Network (GAIN)" }},
    {{ "@type": "MedicalOrganization", "name": "Copenhagen Center for Inflammatory Bowel Disease" }}
  ],
  "alumniOf": "University of Copenhagen",
  "email": "mailto:bobby.lo@regionh.dk",
  "sameAs": [
    "https://www.linkedin.com/in/bobby-lo-md/",
    "https://orcid.org/0000-0002-0252-9341",
    "https://scholar.google.com/citations?user=YrAJMdcAAAAJ&hl=en",
    "https://openalex.org/A5078664290"
  ],
  "knowsAbout": ["Gastroenterology", "Inflammatory Bowel Disease", "Artificial Intelligence", "Deep Learning", "Computer Vision", "Endoscopy", "Clinical Epidemiology"],
  "description": "Specialist trainee in Gastroenterology and Leader of the Gastrointestinal Artificial Intelligence Network (GAIN) in Denmark."
}}
    </script>

    <!-- CollectionPage describing the publications archive -->
    <script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "@id": "https://bobby-zs-lo.github.io/publications.html#page",
  "url": "https://bobby-zs-lo.github.io/publications.html",
  "name": "Publications — Bobby Zhao Sheng Lo, MD, PhD",
  "inLanguage": "en",
  "isPartOf": {{ "@id": "https://bobby-zs-lo.github.io/#website" }},
  "about": {{ "@id": "https://bobby-zs-lo.github.io/#person" }},
  "author": {{ "@id": "https://bobby-zs-lo.github.io/#person" }},
  "mainEntity": {{
    "@type": "ItemList",
    "numberOfItems": {len(publications_data)},
    "itemListOrder": "https://schema.org/ItemListOrderDescending"
  }}
}}
    </script>

    <!-- BreadcrumbList -->
    <script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {{ "@type": "ListItem", "position": 1, "name": "Home", "item": "https://bobby-zs-lo.github.io/" }},
    {{ "@type": "ListItem", "position": 2, "name": "Publications", "item": "https://bobby-zs-lo.github.io/publications.html" }}
  ]
}}
    </script>

    <!-- Highlighted publications as ScholarlyArticle list -->
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
            <a href="{openalex_url}" target="_blank" rel="noopener" class="btn btn-outline" style="margin-top:24px">View OpenAlex profile →</a>
          </div>
        </div>
      </section>
""")

    if top_highlights:
        f.write("""
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
            cite_word = 'citation' if cite_count == 1 else 'citations'
            f.write(f"""              <li class="pub-row">
                <span class="pub-year">{year}</span>
                <div>
                  <strong>{title}</strong>
                  <span class="pub-meta">{authors} · {venue} · {cite_count} {cite_word}</span>
                </div>
              </li>
""")
        f.write("""            </ul>
          </div>
        </div>
      </section>
""")

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
            f.write(f"""                    <li class="pub-row">
                      <span class="pub-year">{year}</span>
                      <div>
                        <strong>{title}</strong>
                        <span class="pub-meta">{authors} · {venue}</span>
                      </div>
                    </li>
""")
        f.write("""                  </ul>
                </div>
              </div>
""")

    f.write("""
            </div>
          </div>
        </div>
      </section>

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

print(f"Success: {output_file} generated successfully from OpenAlex data.")
