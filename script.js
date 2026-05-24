// Collapsible sections
const collapsibles = document.querySelectorAll(".collapsible");
collapsibles.forEach(button => {
    button.addEventListener("click", function() {
        this.classList.toggle("active");
        const content = this.nextElementSibling;
        content.style.display = content.style.display === "block" ? "none" : "block";
    });
});

// Active topic filter (null = "All")
let activeTopic = null;

function rowMatches(row, query) {
    const haystack = row.dataset.search || (row.textContent || "").toLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (activeTopic) {
        const topicsOnRow = (row.dataset.topics || "").split(/\s+/).filter(Boolean);
        if (!topicsOnRow.includes(activeTopic)) return false;
    }
    return true;
}

function filterPublications() {
    const input = document.getElementById("searchBox");
    const query = input ? input.value.toLowerCase().trim() : "";
    const sections = document.getElementsByClassName("collapsible-section");
    for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        const rows = section.querySelectorAll("li.pub-row");
        let sectionHasMatch = false;
        rows.forEach(row => {
            const show = rowMatches(row, query);
            row.style.display = show ? "" : "none";
            if (show) sectionHasMatch = true;
        });
        section.style.display = sectionHasMatch ? "" : "none";
    }
}

// Topic chips: clicking sets activeTopic and re-runs filter.
document.addEventListener("click", function(e) {
    const chip = e.target.closest(".topic-chip");
    if (!chip) return;
    const topic = chip.dataset.topic;
    activeTopic = topic === "all" ? null : topic;
    document.querySelectorAll(".topic-chip").forEach(c => {
        c.setAttribute("aria-pressed", c === chip ? "true" : "false");
    });
    filterPublications();
});


// Show the "To the Top" button when scrolling down
const toTopBtn = document.getElementById("toTopBtn");
window.onscroll = function() {
    if (document.body.scrollTop > 20 || document.documentElement.scrollTop > 20) {
        toTopBtn.style.display = "flex";
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

// =============================================================
// v2026 additions: OpenAlex live data + GSAP motion choreography
// =============================================================

// ===== OpenAlex live metrics (home page only) =====
(function initOpenAlexMetrics() {
  const root = document.querySelectorAll('[data-metric]');
  if (!root.length) return;

  const AUTHOR_ID = 'a5078664290';
  const MAILTO = 'bobby.lo@regionh.dk';
  const URL = `https://api.openalex.org/authors/${AUTHOR_ID}?mailto=${MAILTO}`;

  function animateCount(el, target) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !window.gsap) { el.textContent = target.toLocaleString(); return; }
    const obj = { v: 0 };
    window.gsap.to(obj, {
      v: target, duration: 1.2, ease: 'power2.out',
      onUpdate: () => { el.textContent = Math.round(obj.v).toLocaleString(); }
    });
  }

  fetch(URL)
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(data => {
      const stats = data.summary_stats || {};
      const values = {
        works:      data.works_count || 0,
        citations:  data.cited_by_count || 0,
        h_index:    stats.h_index || 0,
        i10_index:  stats.i10_index || 0,
      };
      root.forEach(card => {
        const key = card.getAttribute('data-metric');
        const valueEl = card.querySelector('.metric-value');
        if (valueEl && key in values) {
          if ('IntersectionObserver' in window) {
            const io = new IntersectionObserver((entries) => {
              entries.forEach(e => {
                if (e.isIntersecting) { animateCount(valueEl, values[key]); io.disconnect(); }
              });
            }, { threshold: 0.4 });
            io.observe(card);
          } else {
            animateCount(valueEl, values[key]);
          }
        }
      });
    })
    .catch(err => { console.warn('OpenAlex metrics fetch failed:', err); });
})();

// ===== OpenAlex live latest publications (home page only) =====
(function initLatestPublications() {
  const list = document.getElementById('latest-pubs-list');
  if (!list) return;
  const count = Math.max(1, parseInt(list.getAttribute('data-pubs-count') || '5', 10));
  const sort  = list.getAttribute('data-pubs-sort') || 'publication_date:desc';

  const AUTHOR_ID = 'a5078664290';
  const MAILTO = 'bobby.lo@regionh.dk';
  const URL = `https://api.openalex.org/works?filter=authorships.author.id:${AUTHOR_ID}&per_page=${count}&sort=${encodeURIComponent(sort)}&mailto=${MAILTO}`;

  function escapeHTML(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  fetch(URL)
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(data => {
      const items = (data.results || []).slice(0, count);
      if (!items.length) return;
      list.innerHTML = items.map(p => {
        const year = p.publication_year || '—';
        const title = escapeHTML(p.title || 'Untitled');
        const venue = escapeHTML((p.primary_location && p.primary_location.source && p.primary_location.source.display_name) || 'Unknown venue');
        const cites = p.cited_by_count || 0;
        const citesStr = cites > 0 ? ` · ${cites} citation${cites === 1 ? '' : 's'}` : '';
        return `<li class="pub-row">
          <span class="pub-year">${year}</span>
          <div>
            <strong>${title}</strong>
            <span class="pub-meta">${venue}${citesStr}</span>
          </div>
        </li>`;
      }).join('');
    })
    .catch(err => {
      console.warn('OpenAlex publications fetch failed:', err);
      const placeholder = list.querySelector('.pub-row--placeholder strong');
      if (placeholder) placeholder.textContent = 'Could not load publications right now.';
    });
})();

// ===== Motion effects (defined once, called from initMotion) =====
window.__motion = function () {
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;

  // -- Hero: word-by-word reveal --
  const heroName = document.querySelector('.hero-name');
  if (heroName) {
    const wrapWords = (el) => {
      // Walk text nodes, wrapping each word in a span
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);
      textNodes.forEach(node => {
        const parent = node.parentNode;
        const frag = document.createDocumentFragment();
        node.nodeValue.split(/(\s+)/).forEach(part => {
          if (/\S/.test(part)) {
            const span = document.createElement('span');
            span.className = 'word';
            span.textContent = part;
            frag.appendChild(span);
          } else {
            frag.appendChild(document.createTextNode(part));
          }
        });
        parent.replaceChild(frag, node);
      });
    };
    wrapWords(heroName);
    gsap.from(heroName.querySelectorAll('.word'), {
      y: 24, opacity: 0, duration: 0.7, stagger: 0.07, ease: 'power3.out', delay: 0.1
    });
    gsap.from('.hero .eyebrow, .hero-role, .hero-actions, .hero-portrait', {
      y: 16, opacity: 0, duration: 0.6, stagger: 0.12, ease: 'power3.out', delay: 0.5
    });
  }

  // -- Hero: portrait parallax --
  const portrait = document.querySelector('.hero-portrait');
  if (portrait) {
    gsap.to(portrait, {
      yPercent: -8, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
    });
  }

  // -- Hero: background numeral scrub --
  const bgNum = document.querySelector('.hero-bg-numeral');
  if (bgNum) {
    gsap.to(bgNum, {
      xPercent: -6, yPercent: -4, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
    });
  }

  // -- Fade-up for cards, rows, prose (safe: only animates y, opacity stays 1) --
  // immediateRender:false + play-once means content is always visible even if
  // JS is slow; it just gets a subtle lift-in when scrolled into view.
  const animateTargets = [
    '.role-card', '.comp-card', '.timeline li', '.sso-block',
    '.pub-row', '.aff-marks span', '.contact-list li', '.section-body > h2', '.prose p'
  ].join(',');
  gsap.utils.toArray(animateTargets).forEach((el) => {
    gsap.from(el, {
      y: 18, duration: 0.7, ease: 'power3.out', immediateRender: false,
      scrollTrigger: { trigger: el, start: 'top 92%', toggleActions: 'play none none none' }
    });
  });

  // -- Research projects: pinned stack reveal (desktop only) --
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  const researchSection = document.getElementById('research');
  const cards = researchSection ? researchSection.querySelectorAll('.research-card') : [];
  if (researchSection && cards.length && !isMobile) {
    gsap.set(cards, { opacity: 0, y: 40 });
    ScrollTrigger.create({
      trigger: researchSection,
      start: 'top 10%',
      end: '+=' + (cards.length * 240),
      pin: true,
      pinSpacing: true,
      scrub: 0.5,
      onUpdate: (self) => {
        const progress = self.progress;
        cards.forEach((card, i) => {
          const t = (progress * cards.length) - i;
          const opacity = Math.max(0, Math.min(1, t * 1.5));
          const y = Math.max(0, 40 * (1 - Math.min(1, t * 1.5)));
          card.style.opacity = opacity;
          card.style.transform = `translateY(${y}px)`;
        });
      }
    });
  }
  // On mobile, research cards just fade in normally via the generic handler above
  if (researchSection && cards.length && isMobile) {
    cards.forEach((card) => {
      gsap.from(card, {
        y: 24, opacity: 0, duration: 0.6, ease: 'power3.out', immediateRender: false,
        scrollTrigger: { trigger: card, start: 'top 92%', toggleActions: 'play none none none' }
      });
    });
  }
};

// ===== GSAP init (home page only, guarded) =====
(function initMotion() {
  if (!document.getElementById('hero')) return;
  function start() {
    if (!window.gsap || !window.ScrollTrigger) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { console.info('Reduced motion — skipping GSAP timelines'); return; }
    window.gsap.registerPlugin(window.ScrollTrigger);
    if (typeof window.__motion === 'function') window.__motion();
  }
  // GSAP scripts are loaded with defer; wait until window load to be safe
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start);
})();
