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

# Helper: Highlight author's name
def highlight_name(authors_list):
    keywords = ["Bobby Lo", "B Lo", "Bobby Zhao Sheng Lo", "BZS Lo"]
    return [f"<b>{a}</b>" if any(keyword in a for keyword in keywords) else a for a in authors_list]

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

# Group publications by year
publications_by_year = {}   
for pub in publications:
    year = pub['bib'].get('pub_year', 'n.d.')
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
        <input type="text" id="searchBox" onkeyup="filterPublications()" placeholder="Search for publications...">
        <button id="toggleAllBtn" onclick="toggleAll()">Expand All</button>
        <ul id="publicationsList">
""")

    # Ensure keys are sorted with 'n.d.' at the end
    for year, pubs in sorted(publications_by_year.items(), key=lambda x: int(str(x[0])) if str(x[0]).isdigit() else float('-inf'), reverse=True):
        f.write(f"""
            <div class="collapsible-section">
                <button class="collapsible">{year}</button>
                <div class="content">
                    <ul>
        """)
        for pub in pubs:
            bib = pub['bib']
            title = bib.get('title', 'Untitled')
            raw_authors = bib.get('author', 'Unknown authors')
            authors_list = [a.strip() for a in raw_authors.split(' and ')]
            authors = ', '.join(highlight_name(authors_list))
            venue = bib.get('journal') or bib.get('venue') or 'Unknown journal or conference'

            f.write(f"<li><strong>{title}</strong><br>{authors} <br><em>{venue} ({year})</em></li>\n")
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
        <p>Contact: <a href="mailto:bobby.lo@regionh.dk">bobby.lo@regionh.dk</a></p>
    </footer>

    <script>
        // Collapsible sections
        const collapsibles = document.querySelectorAll(".collapsible");
        collapsibles.forEach(button => {
            button.addEventListener("click", function() {
                this.classList.toggle("active");
                const content = this.nextElementSibling;
                content.style.display = content.style.display === "block" ? "none" : "block";
            });
        });

// Search functionality
function filterPublications() {
    const input = document.getElementById("searchBox");
    const filter = input.value.toLowerCase();
    const sections = document.getElementsByClassName("collapsible-section");
    
    for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        // Get all li elements within the current collapsible section.
        const liItems = section.getElementsByTagName("li");
        let sectionHasMatch = false;
        
        // Loop through each publication (li) in the section.
        for (let j = 0; j < liItems.length; j++) {
            const text = liItems[j].textContent || liItems[j].innerText;
            if (text.toLowerCase().includes(filter)) {
                liItems[j].style.display = "";
                sectionHasMatch = true;
            } else {
                liItems[j].style.display = "none";
            }
        }
        
        // Hide the entire collapsible section if no publications match.
        section.style.display = sectionHasMatch ? "" : "none";
    }
}


        // Show the "To the Top" button when scrolling down
        const toTopBtn = document.getElementById("toTopBtn");
        window.onscroll = function() {
            if (document.body.scrollTop > 20 || document.documentElement.scrollTop > 20) {
                toTopBtn.style.display = "block";
            } else {
                toTopBtn.style.display = "none";
            }
        };

        // Scroll to the top when the button is clicked
        toTopBtn.onclick = function() {
            window.scrollTo({ top: 0, behavior: "smooth" });
        };

// Toggle all collapsible sections
function toggleAll() {
    const collapsibles = document.getElementsByClassName("collapsible");
    let allExpanded = true;
    
    // Check if every collapsible section is currently expanded
    for (let i = 0; i < collapsibles.length; i++) {
        const content = collapsibles[i].nextElementSibling;
        if (content.style.display !== "block") {
            allExpanded = false;
            break;
        }
    }
    
    // If all sections are expanded, collapse them; otherwise, expand all
    for (let i = 0; i < collapsibles.length; i++) {
        const content = collapsibles[i].nextElementSibling;
        if (allExpanded) {
            content.style.display = "none";
            collapsibles[i].classList.remove("active");
        } else {
            content.style.display = "block";
            collapsibles[i].classList.add("active");
        }
    }
    
    // Update the button text to reflect the new state
    const toggleBtn = document.getElementById("toggleAllBtn");
    toggleBtn.textContent = allExpanded ? "Expand All" : "Collapse All";
}

    </script>

</body>
</html>
""")

print(f"✅ {output_file} generated successfully.")
