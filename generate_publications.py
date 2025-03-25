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

# Sort publications by year (as integer)
def safe_year(pub):
    year = pub['bib'].get('pub_year', '0')
    try:
        return int(year)
    except ValueError:
        return 0

publications = sorted(author['publications'], key=safe_year, reverse=True)

# === Generate HTML ===
with open(output_file, 'w', encoding='utf-8') as f:
    f.write(f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Publications - Bobby Zhao Sheng Lo</title>
  <link rel="stylesheet" href="style.css">
  <style>
    body {{ font-family: 'Segoe UI', sans-serif; max-width: 1000px; margin: auto; }}
    .metrics {{ float: right; width: 250px; background: #f5f5f5; padding: 15px; margin: 20px; border: 1px solid #ccc; }}
    .pubs {{ margin-right: 280px; padding: 20px; }}
    h1, h2 {{ color: #333; }}
    ul {{ list-style-type: none; padding-left: 0; }}
    li {{ margin-bottom: 15px; }}
    .nav-bar {{ list-style: none; display: flex; justify-content: center; padding: 10px; background-color: #e5dfd5; margin: 0; }}
    .nav-bar li {{ margin: 0 20px; }}
    .nav-bar a {{ text-decoration: none; color: #5a5148; font-weight: bold; }}
    .nav-bar a:hover {{ text-decoration: underline; }}
  </style>
</head>
<body>

  <!-- ✅ Navigation Bar -->
  <nav>
    <ul class="nav-bar">
      <li><a href="index.html">Home</a></li>
      <li><a href="publications.html">Publications</a></li>
    </ul>
  </nav>

  <h1>My Publications</h1>

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

    # === Write each publication entry ===
    for pub in publications:
        bib = pub['bib']
        title = bib.get('title', 'Untitled')
        authors = bib.get('author', 'Unknown authors')
        year = bib.get('pub_year', 'n.d.')
        venue = bib.get('venue', '')
        f.write(f"<li><strong>{title}</strong><br>{authors} ({year})<br><em>{venue}</em></li>\n")

    f.write("""
    </ul>
  </div>

</body>
</html>
""")

print(f"✅ {output_file} generated successfully.")
