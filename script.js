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
