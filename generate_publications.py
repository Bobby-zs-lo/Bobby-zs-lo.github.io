from scholarly import scholarly
from datetime import datetime
import os

# Replace with your Scholar user ID
scholar_id = "YrAJMdcAAAAJ"  # Example

# Fetch author profile
author = scholarly.search_author_id(scholar_id)
author = scholarly.fill(author, sections=["basics", "indices", "publications"])

# Extract metrics
h_index = author['hindex']
i10_index = author['i10index']
citations = author['citedby']

# Sort and extract publications
def safe_year(pub):
    year = pub['bib'].get('pub_year', '0')
    try:
        return int(year)
    except ValueError:
        return 0

publications = sorted(author['publications'], key=safe_year, reverse=True)


# Create HTML file
html_path = os.path.join(os.getcwd(), 'publications.html')
with open(html_path, 'w', encoding='utf-8') as f:
    f.write(f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Publications - Bobby Zhao Sheng Lo</title>
  <link rel="stylesheet" href="style.css">
  <style>
    body {{ font-family: sans-serif; max-width: 1000px; margin: auto; }}
    .metrics {{ float: right; width: 250px; background: #f5f5f5; padding: 15px; margin: 20px; border: 1px solid #ccc; }}
    .pubs {{ margin-right: 280px; padding: 20px; }}
    h1, h2 {{ color: #333; }}
  </style>
</head>
<body>
  <h1>My Publications</h1>
  <div class="metrics">
    <h2>Scholar Metrics</h2>
    <ul>
      <li>Total citations: {citations}</li>
      <li>h-index: {h_index}</li>
      <li>i10-index: {i10_index}</li>
      <li><a href="https://scholar.google.com/citations?user={scholar_id}" target="_blank">View on Google Scholar</a></li>
    </ul>
  </div>

  <div class="pubs">
    <h2>List of Publications</h2>
    <ul>
""")

    for pub in publications:
        title = pub['bib'].get('title', 'Untitled')
        year = pub['bib'].get('pub_year', 'N/A')
        venue = pub['bib'].get('venue', '')
        f.write(f"<li><strong>{title}</strong> ({year}) - {venue}</li>\n")

    f.write("""
    </ul>
  </div>
</body>
</html>
""")

print("Publications page generated successfully.")
