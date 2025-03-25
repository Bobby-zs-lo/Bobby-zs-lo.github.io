from scholarly import scholarly
from datetime import datetime
import os

# === Settings ===
scholar_id = "YrAJMdcAAAAJ"  # Replace with your own Google Scholar ID
output_file = "publications.html"

# === Fetch Author Profile and Publications ===
author = scholarly.search_author_id(scholar_id)
author = scholarly.fill(author, sections=["basics", "indices", "publications"])

# Metrics
h_index = author.get('hindex', 0)
i10_index = author.get('i10index', 0)
citations = author.get('citedby', 0)

# Helper: Get year safely
def safe_year(pub):
    year = pub.get('bib', {}).get('pub_year', '0')
    try:
        return int(year)
    except ValueError:
        return 0

# Fill each publication to get full metadata
filled_pubs = []
for pub in author['publications']:
    try:
        pub = scholarly.fill(pub)
        filled_pubs.append(pub)
    except Exception as e:
        print(f"⚠️ Skipping a publication due to error: {e}")

# Sort the filled publications by year
publications = sorted(filled_pubs, key=safe_year, reverse=True)


# === Generate HTML ===
with open(output_file, 'w', encoding='utf-8') as f:
    f.write(f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Publications – Bobby Zhao Sheng Lo</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>

<header>
    <h1>Bobby Zhao Sheng Lo, MD, PhD</h1>
    <p>Medical Researcher | AI in Gastroenterology | Educator</p>
</header>

<!-- Navigation Bar -->
<nav>
    <ul class="nav-bar">
        <li><a href="index.html">Home</a></li>
        <li><a href="publications.html">Publications</a></li>
    </ul>
</nav>

<div class="container">
    <div class="metrics">
        <h2>Scholar Metrics</h2>
        <ul>
            <li>Total citations: {citations}</li>
            <li>h-index: {h_index}</li>
            <li>i10-index: {i10_index}</li>
            <li><a href="https://scholar.google.com/citations?user={scholar_id}" target="_blank">Google Scholar</a></li>
        </ul>
    </div>

    <div class="pubs">
        <h2>Peer-reviewed Publications</h2>
        <ul>
""")

    for pub in publications:
        bib = pub['bib']
        title = bib.get('title', 'Untitled')
        raw_authors = bib.get('author', 'Unknown authors')
        authors_list = [a.strip() for a in raw_authors.split(' and ')]
        authors = ', '.join(authors_list)
        year = bib.get('pub_year', 'n.d.')
        venue = bib.get('journal') or bib.get('venue') or 'Unknown journal or conference'

        f.write(f"<li><strong>{title}</strong><br>{authors} <br><em>{venue} ({year})</em></li>\n")

    f.write("""
        </ul>
    </div>
</div>

<footer>
    <p>Contact: <a href="mailto:bobby.lo@regionh.dk">bobby.lo@regionh.dk</a></p>
</footer>

</body>
</html>
""")

print(f"✅ {output_file} generated successfully.")
