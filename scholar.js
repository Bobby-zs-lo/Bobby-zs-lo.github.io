document.addEventListener("DOMContentLoaded", function() {
    const scholarUserId = "YrAJMdcAAAAJ";  // Your Google Scholar ID
    const publicationsList = document.getElementById("publications-list");

    fetch(`https://scholar-api.example.com/scholar/${scholarUserId}`)  // Replace with an actual API
        .then(response => response.json())
        .then(data => {
            data.publications.forEach(pub => {
                let li = document.createElement("li");
                li.innerHTML = `<a href="${pub.link}" target="_blank">${pub.title}</a>`;
                publicationsList.appendChild(li);
            });
        })
        .catch(error => console.error("Error fetching publications:", error));
});
