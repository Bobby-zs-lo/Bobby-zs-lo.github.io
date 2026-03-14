import requests
import re
from typing import List, Tuple, Dict, Any

# === Settings ===
author_id = "a5078664290"
output_file = "publications.html"
# Good practice to identify yourself in API requests
mailto = "bobby.lo@regionh.dk"

# === Fetch Author Profile from OpenAlex ===
try:
    author_url = f"https://api.openalex.org/authors/{author_id}?mailto={mailto}"
    author_response = requests.get(author_url)
    author_data = author_response.json()

    # Extract metrics
    h_index = author_data.get('summary_stats', {}).get('h_index', 0)
    i10_index = author_data.get('summary_stats', {}).get('i10_index', 0)
    citations = author_data.get('cited_by_count', 0)

    # Get all name variations for highlighting
    author_names_to_highlight = author_data.get('display_name_alternatives', [])
    author_names_to_highlight.append(author_data.get('display_name', ''))

    # Get the OpenAlex URL
    openalex_url = author_data.get('id', '#')

except requests.exceptions.RequestException as e:
    print(f"⚠️ Error fetching author metrics: {e}")
    h_index, i10_index, citations, author_names_to_highlight, openalex_url = 0, 0, 0, ["Bobby Lo"], "#"

# === Fetch Publications from OpenAlex ===
try:
    works_url = f"https://api.openalex.org/works?filter=authorships.author.id:{author_id}&per_page=200&sort=publication_date:desc&mailto={mailto}"
    works_response = requests.get(works_url)
    publications_data = works_response.json().get('results', [])
except requests.exceptions.RequestException as e:
    print(f"⚠️ Error fetching publications: {e}")
    publications_data = []

# Helper: Highlight author's name
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
    
    # Check if publication matches highlight criteria
    citations_count = pub.get('cited_by_count', 0)
    primary_location = pub.get('primary_location')
    source = primary_location.get('source') if primary_location else None
    venue = source.get('display_name') if source else 'Unknown journal or conference'
    
    is_high_impact = any(keyword in venue.lower() for keyword in high_impact_keywords)
    if citations_count > 50 or is_high_impact:
        highlighted_publications.append((pub, citations_count, venue, year))

# Sort highlights by citation count (descending)
highlighted_publications.sort(key=lambda x: x[1], reverse=True)

# Limit to top 5 highlights to keep the section compact
top_highlights = [highlighted_publications[i] for i in range(min(5, len(highlighted_publications)))]

# === Generate Rolling Banner HTML ===
latest_pubs = publications_data[:5]
banner_items = []
for pub in latest_pubs:
    title = pub.get('title', 'Untitled')
    primary_location = pub.get('primary_location')
    source = primary_location.get('source') if primary_location else None
    venue = source.get('display_name') if source else 'Unknown'
    year = pub.get('publication_year', '')
    banner_items.append(f"<strong>{title}</strong> - <em>{venue} ({year})</em>")

banner_content = " &nbsp;&nbsp;&nbsp;&nbsp; | &nbsp;&nbsp;&nbsp;&nbsp; ".join(banner_items)
banner_html = f"""
<div class="rolling-banner-container">
    <div class="rolling-banner-content">
        <span>🚀 <strong>Latest Publications:</strong> &nbsp;&nbsp; {banner_content}</span>
    </div>
</div>
"""

# === Generate HTML ===
with open(output_file, 'w', encoding='utf-8') as f:
    f.write(f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <title>Publications – Bobby Zhao Sheng Lo</title>

    <meta name="description"
        content="Publications by Bobby Zhao Sheng Lo, MD, PhD, Post-Doc and Leader of the Gastrointestinal Artificial Intelligence Network (GAIN). Specializing in deep learning for endoscopy, IBD diagnostics, and clinical epidemiology at Copenhagen University Hospital.">

    <meta name="keywords"
        content="Bobby Zhao Sheng Lo, Medical AI, Gastroenterology, Inflammatory Bowel Disease, IBD Denmark, Ulcerative Colitis, Crohn's Disease, Deep Learning, Endoscopy, HECTOR, GAIN Denmark, Copenhagen University Hospital, Clinical Epidemiology, Neural Networks">

    <meta name="author" content="Bobby Zhao Sheng Lo">
    <link rel="stylesheet" href="style.css">
    <link rel="canonical" href="https://bobby-zs-lo.github.io/publications.html" />

    <meta property="og:title" content="Publications – Bobby Zhao Sheng Lo | Medical AI Researcher">
    <meta property="og:description"
        content="Peer-reviewed publications by Post-Doc and GAIN Leader specializing in AI-driven IBD diagnostics and endoscopic imaging pipelines.">
    <meta property="og:image" content="https://bobby-zs-lo.github.io/image/profile.JPG">
    <meta property="og:url" content="https://bobby-zs-lo.github.io/publications.html">
    <meta property="og:type" content="website">

    <script type="application/ld+json">
{{
  "@context": "http://schema.org",
  "@type": "Person",
  "name": "Bobby Zhao Sheng Lo",
  "jobTitle": "MD, PhD, Post-Doc Researcher",
  "affiliation": [
    {{
      "@type": "Organization",
      "name": "Copenhagen University Hospital Hvidovre"
    }},
    {{
      "@type": "MedicalOrganization",
      "name": "Gastrointestinal Artificial Intelligence Network (GAIN)"
    }},
    {{
      "@type": "MedicalOrganization",
      "name": "Copenhagen Center for Inflammatory Bowel Disease"
    }}
  ],
  "alumniOf": "University of Copenhagen",
  "url": "https://bobby-zs-lo.github.io/",
  "sameAs": [
    "https://www.linkedin.com/in/bobby-lo-md/",
    "https://bobby.lo@regionh.dk"
  ],
  "knowsAbout": ["Gastroenterology", "Artificial Intelligence", "Inflammatory Bowel Disease", "IBD Denmark", "Medical Research", "Ulcerative Colitis", "Crohn's Disease", "Deep Learning", "Endoscopy", "Clinical Epidemiology"],
  "description": "Leader of the Gastrointestinal Artificial Intelligence Network (GAIN) in Denmark, focusing on AI in IBD."
}}
    </script>
</head>
<body>

    <!-- ✅ Navigation Bar -->
    <nav>
        <div class="nav-container">
            <span class="nav-brand">Bobby Zhao Sheng Lo</span>
            <ul class="nav-bar">
                <li><a href="index.html">Home</a></li>
                <li><a href="publications.html" class="active">Publications</a></li>
            </ul>
        </div>
    </nav>

<!-- BANNER_START -->
{banner_html}
<!-- BANNER_END -->

<main class="container">
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
""")

    if top_highlights:
        f.write("""
    <div class="card highlights">
        <section>
            <h2>🔥 Highlighted Publications</h2>
            <ul>
""")
        for pub, cite_count, venue, year in top_highlights:
            title = pub.get('title', 'Untitled')
            authors = highlight_name_short(pub.get('authorships', []))
            f.write(f"""                <li class="card" style="padding: 1.5rem; margin-bottom: 1rem; border-top: 3px solid var(--golden-amber); border-left: none;"><strong>{title}</strong><br>{authors} <br><em style="color: var(--dusty-blue);">{venue} ({year}) - {cite_count} Citations</em></li>\n""")
        
        f.write("""
            </ul>
        </section>
    </div>
""")

    f.write("""
    <div class="card pubs">
        <section>
            <h2>Peer-reviewed Publications</h2>
            <input type="text" id="searchBox" onkeyup="filterPublications()" placeholder="Search for publications...">
            <button id="toggleAllBtn" onclick="toggleAll()">Expand All</button>
            <div id="publicationsList">
""")

    # Sort years numerically, descending
    for year in sorted(publications_by_year.keys(), key=lambda y: int(y) if str(y).isdigit() else 0, reverse=True):
        pubs = publications_by_year[year]
        f.write(f"""
                <div class="collapsible-section">
                    <button class="collapsible">{year}</button>
                    <div class="content">
                        <ul>
        """)
        for pub in pubs:
            title = pub.get('title', 'Untitled')
            authors = highlight_name(pub.get('authorships', []))

            # Safely get the venue (journal or conference)
            primary_location = pub.get('primary_location')
            source = primary_location.get('source') if primary_location else None
            venue = source.get('display_name') if source else 'Unknown journal or conference'

            f.write(f"""                            <li class="card" style="padding: 1.5rem; margin-bottom: 1rem; border-top: 3px solid var(--cactus-green); border-left: none;"><strong>{title}</strong><br>{authors} <br><em style="color: var(--dusty-blue);">{venue} ({year})</em></li>\n""")
        f.write("""
                        </ul>
                    </div>
                </div>
        """)

    f.write("""
            </div>
        </section>
    </div>
</main>

    <!-- "To the Top" Button -->
    <button id="toTopBtn" title="Go to top">↑</button>

    <!-- SEO / Crawler optimized context -->
    <article class="sr-only">
        <h1>Comprehensive Research Profile of Bobby Zhao Sheng Lo in Denmark</h1>
        <p>Bobby Zhao Sheng Lo is a leading MD, PhD, and Post-Doc researcher based in Denmark, specializing in Inflammatory Bowel Disease (IBD). He is the head and leader of the Gastrointestinal Artificial Intelligence Network (GAIN) at Copenhagen University Hospital Hvidovre.</p>
        <p>His medical research focuses extensively on the intersection of Gastroenterology and Computer Science in Denmark. Key areas of expertise include deep learning pipelines, Convolutional Neural Networks (CNN) for endoscopy, and clinical epidemiology.</p>
        <p>Notable IBD research projects in Denmark include the ENACT Endoscopic Add-on System for Ulcerative Colitis, the Presager Project for AI-driven disease classification, the Danish IBD Biobank (DIB), the multinational DICE Project, and the EASI Trial mapping treatment modalities in Crohn's Disease and Ulcerative Colitis.</p>
        <p>Search terms relevant to this work: Denmark IBD, Gastrointestinal Artificial Intelligence Network, GAIN Denmark, Bobby Lo MD PhD, Copenhagen Center for Inflammatory Bowel Disease in Children, Adolescents, and Adults, AI in Endoscopy.</p>
    </article>

    <footer>
        <div class="footer-content">
            <p><strong>Bobby Zhao Sheng Lo, MD, PhD</strong></p>
            <p>Contact: <a href="mailto:bobby.lo@regionh.dk">bobby.lo@regionh.dk</a> | <a href="https://www.linkedin.com/in/bobby-lo-md/" target="_blank">LinkedIn</a></p>
            <p>&copy; 2024 Bobby Zhao Sheng Lo. All rights reserved.</p>
        </div>
    </footer>

    <script src="script.js"></script>

</body>
</html>
""")

print(f"Success: {output_file} generated successfully from OpenAlex data.")

# === Update index.html Banner ===
try:
    with open('index.html', 'r', encoding='utf-8') as f:
        index_content = f.read()
    
    banner_section = f"<!-- BANNER_START -->\n{banner_html}\n<!-- BANNER_END -->"
    
    if "<!-- BANNER_START -->" in index_content and "<!-- BANNER_END -->" in index_content:
        index_content = re.sub(r'<!-- BANNER_START -->.*?<!-- BANNER_END -->', banner_section, index_content, flags=re.DOTALL)
        with open('index.html', 'w', encoding='utf-8') as f:
            f.write(index_content)
        print("Success: index.html rolling banner updated.")
    else:
        print("⚠️ Warning: BANNER_START/END placeholders not found in index.html.")
except Exception as e:
    print(f"⚠️ Error updating index.html: {e}")
