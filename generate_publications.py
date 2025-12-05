import requests

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
def highlight_name(authors_list):
    formatted_authors = []
    for author in authors_list:
        author_name = author.get('author', {}).get('display_name', 'Unknown author')
        is_highlighted = any(keyword.lower() in author_name.lower() for keyword in author_names_to_highlight if keyword)
        formatted_authors.append(f"<b>{author_name}</b>" if is_highlighted else author_name)
    return ', '.join(formatted_authors)

# Group publications by year
publications_by_year = {}
for pub in publications_data:
    year = pub.get('publication_year', 'n.d.')
    if year not in publications_by_year:
        publications_by_year[year] = []
    publications_by_year[year].append(pub)

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
    <div class="card metrics">
        <h2>Scholar Metrics</h2>
        <ul>
            <li>Total citations: {citations}</li>
            <li>h-index: {h_index}</li>
            <li>i10-index: {i10_index}</li>
            <li><a href="{openalex_url}" target="_blank">OpenAlex</a></li>
        </ul>
    </div>

    <div class="card pubs">
        <h2>Peer-reviewed Publications</h2>
        <input type="text" id="searchBox" onkeyup="filterPublications()" placeholder="Search for publications...">
        <button id="toggleAllBtn" onclick="toggleAll()">Expand All</button>
        <ul id="publicationsList">
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

            f.write(f"""<li class="card"><strong>{title}</strong><br>{authors} <br><em>{venue} ({year})</em></li>""")
        f.write("""
                    </ul>
                </div>
            </div>
        """)

    f.write("""
            </ul>
        </div>
    </div>

    <!-- "To the Top" Button -->
    <button id="toTopBtn" title="Go to top">↑</button>

    <footer>
        <p>Contact: <a href="mailto:bobby.lo@regionh.dk">bobby.lo@regionh.dk</a> | <a href="https://www.linkedin.com/in/bobby-lo-md/" target="_blank">LinkedIn</a></p>
    </footer>

    <script src="script.js"></script>

</body>
</html>
""")

print(f"✅ {output_file} generated successfully from OpenAlex data.")
