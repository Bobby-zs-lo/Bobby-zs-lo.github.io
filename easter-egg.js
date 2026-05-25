(function () {
  'use strict';

  var trigger = document.getElementById('eeTrigger');
  if (!trigger) return;

  var overlay = null;
  var previousFocus = null;

  var SECTIONS = [
    { key: 'photo',       label: 'Profile photo',      desc: 'Hero portrait image' },
    { key: 'intro',       label: 'Introduction',        desc: 'About section text' },
    { key: 'current',     label: 'Current positions',   desc: 'Three concurrent roles' },
    { key: 'experience',  label: 'Experience',          desc: 'Career timeline' },
    { key: 'education',   label: 'Education & Awards',  desc: 'Degrees and recognition' },
    { key: 'expertise',   label: 'Expertise',           desc: 'Skills and competencies' },
    { key: 'research',    label: 'Research projects',   desc: 'Major project cards' },
    { key: 'publications',label: 'Publications',        desc: 'Papers from OpenAlex' },
    { key: 'speaking',    label: 'Speaking & Service',   desc: 'Talks, boards, review, media' },
    { key: 'contact',     label: 'Contact',             desc: 'Email, LinkedIn, affiliations' }
  ];

  var toggleState = {};
  var pubMode = 'all';
  var expertiseMode = 'skills';

  function initState() {
    SECTIONS.forEach(function (s) { toggleState[s.key] = true; });
    pubMode = 'all';
    expertiseMode = 'skills';
  }

  function buildModal() {
    overlay = document.createElement('div');
    overlay.className = 'ee-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'ee-heading');

    var card = document.createElement('div');
    card.className = 'ee-card';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'ee-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', closeModal);

    var header = document.createElement('div');
    header.className = 'ee-header';
    header.innerHTML =
      '<img src="image/favicon.svg" alt="" width="32" height="32" class="ee-monogram">' +
      '<h2 class="ee-title" id="ee-heading">You found the hidden<br>export easter egg.</h2>' +
      '<div class="ee-subtitle">// configure your cv</div>';

    var togglesWrap = document.createElement('div');
    togglesWrap.className = 'ee-toggles';

    SECTIONS.forEach(function (s) {
      var row = document.createElement('div');
      row.className = 'ee-row';

      var left = document.createElement('div');
      left.innerHTML =
        '<div class="ee-row-label">' + s.label + '</div>' +
        '<div class="ee-row-desc">' + s.desc + '</div>';

      var toggle = document.createElement('label');
      toggle.className = 'ee-toggle';
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = true;
      input.setAttribute('aria-label', s.label);
      input.dataset.section = s.key;
      input.addEventListener('change', function () {
        toggleState[s.key] = this.checked;
        if (s.key === 'publications') {
          var sub = document.getElementById('eePubSub');
          if (sub) sub.classList.toggle('is-open', this.checked);
        }
        if (s.key === 'expertise') {
          var expSub = document.getElementById('eeExpSub');
          if (expSub) expSub.classList.toggle('is-open', this.checked);
        }
      });
      var track = document.createElement('span');
      track.className = 'ee-toggle-track';
      var knob = document.createElement('span');
      knob.className = 'ee-toggle-knob';
      toggle.appendChild(input);
      toggle.appendChild(track);
      toggle.appendChild(knob);

      row.appendChild(left);
      row.appendChild(toggle);
      togglesWrap.appendChild(row);

      if (s.key === 'expertise') {
        var expSub = document.createElement('div');
        expSub.className = 'ee-pub-sub is-open';
        expSub.id = 'eeExpSub';
        var expSelect = document.createElement('select');
        expSelect.className = 'ee-pub-select';
        expSelect.setAttribute('aria-label', 'Expertise detail level');
        [['skills', 'Skills only'], ['skills_courses', 'Skills + Courses']].forEach(function (pair) {
          var opt = document.createElement('option');
          opt.value = pair[0];
          opt.textContent = pair[1];
          expSelect.appendChild(opt);
        });
        expSelect.addEventListener('change', function () { expertiseMode = this.value; });
        expSub.appendChild(expSelect);
        togglesWrap.appendChild(expSub);
      }

      if (s.key === 'publications') {
        var sub = document.createElement('div');
        sub.className = 'ee-pub-sub is-open';
        sub.id = 'eePubSub';
        var select = document.createElement('select');
        select.className = 'ee-pub-select';
        select.setAttribute('aria-label', 'Publication filter');
        ['all', 'top10', 'latest10'].forEach(function (val) {
          var opt = document.createElement('option');
          opt.value = val;
          opt.textContent = val === 'all' ? 'All publications' : val === 'top10' ? 'Top 10 by citations' : 'Latest 10';
          select.appendChild(opt);
        });
        select.addEventListener('change', function () { pubMode = this.value; });
        sub.appendChild(select);
        togglesWrap.appendChild(sub);
      }
    });

    var footer = document.createElement('div');
    footer.className = 'ee-footer';

    var genBtn = document.createElement('button');
    genBtn.className = 'ee-gen-btn';
    genBtn.id = 'eeGenBtn';
    genBtn.textContent = 'Generate PDF →';
    genBtn.addEventListener('click', function () { generateVisualPDF(); });

    var textLink = document.createElement('button');
    textLink.className = 'ee-text-link';
    textLink.textContent = 'or download text-selectable version';
    textLink.addEventListener('click', function () { generateTextPDF(); });

    footer.appendChild(genBtn);
    footer.appendChild(textLink);

    card.appendChild(closeBtn);
    card.appendChild(header);
    card.appendChild(togglesWrap);
    card.appendChild(footer);
    overlay.appendChild(card);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });

    document.body.appendChild(overlay);
  }

  function openModal() {
    if (!overlay) {
      initState();
      buildModal();
    } else {
      initState();
      overlay.querySelectorAll('input[type="checkbox"]').forEach(function (cb) { cb.checked = true; });
      overlay.querySelectorAll('.ee-pub-select').forEach(function (sel) { sel.selectedIndex = 0; });
      var sub = document.getElementById('eePubSub');
      if (sub) sub.classList.add('is-open');
      var expSub = document.getElementById('eeExpSub');
      if (expSub) expSub.classList.add('is-open');
    }
    previousFocus = document.activeElement;
    requestAnimationFrame(function () {
      overlay.classList.add('is-open');
      var first = overlay.querySelector('input[type="checkbox"]');
      if (first) first.focus();
    });
    document.addEventListener('keydown', onKeyDown);
  }

  function closeModal() {
    if (!overlay) return;
    overlay.classList.remove('is-open');
    document.removeEventListener('keydown', onKeyDown);
    if (previousFocus) previousFocus.focus();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { closeModal(); return; }
    if (e.key !== 'Tab') return;
    var focusable = overlay.querySelectorAll('button, input, select, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  trigger.addEventListener('click', openModal);
  trigger.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(); }
  });

  // -- Utilities --

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) { resolve(); return; }
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  var HTML2PDF_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.2/html2pdf.bundle.min.js';
  var JSPDF_CDN = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
  var AUTHOR_ID = 'a5078664290';
  var MAILTO = 'bobby.lo@regionh.dk';

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function fetchPublications() {
    var url;
    if (pubMode === 'latest10') {
      url = 'https://api.openalex.org/works?filter=authorships.author.id:' + AUTHOR_ID +
        '&per_page=10&sort=publication_date%3Adesc&mailto=' + MAILTO;
    } else if (pubMode === 'top10') {
      url = 'https://api.openalex.org/works?filter=authorships.author.id:' + AUTHOR_ID +
        '&per_page=10&sort=cited_by_count%3Adesc&mailto=' + MAILTO;
    } else {
      url = 'https://api.openalex.org/works?filter=authorships.author.id:' + AUTHOR_ID +
        '&per_page=200&sort=publication_date%3Adesc&mailto=' + MAILTO;
    }
    return fetch(url).then(function (r) { return r.json(); }).then(function (d) { return d.results || []; });
  }

  // -- Build CV HTML for visual PDF --

  function buildCvHtml(pubs) {
    var h = '';

    h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;padding-bottom:10px;border-bottom:1.5px solid #1A1614;">';
    h += '<div style="display:flex;align-items:flex-start;gap:10px;">';
    h += '<div style="width:28px;height:28px;background:#7A1F2B;border-radius:4px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">';
    h += '<span style="color:#FBFAF7;font-family:Georgia,serif;font-weight:700;font-size:10px;letter-spacing:0.5px;">BL</span></div>';
    h += '<div>';
    h += '<div style="font-family:Fraunces,Georgia,serif;font-size:18px;font-weight:500;letter-spacing:-0.5px;line-height:1.15;color:#1A1614;">Bobby Zhao Sheng Lo, MD, PhD</div>';

    var roleEl = document.querySelector('.hero-role');
    var roleText = roleEl ? roleEl.textContent.trim() : '';
    h += '<div style="font-size:9px;color:#4A4340;margin-top:3px;line-height:1.4;">' + esc(roleText) + '</div>';
    h += '<div style="font-family:JetBrains Mono,monospace;font-size:7px;color:#888280;letter-spacing:0.5px;margin-top:4px;">bobby.lo@regionh.dk &middot; linkedin.com/in/bobby-lo-md &middot; bobby-zs-lo.github.io</div>';
    h += '</div></div>';

    if (toggleState.photo) {
      var img = document.querySelector('.hero-portrait img');
      if (img) {
        h += '<img src="' + img.src + '" style="width:52px;height:52px;border-radius:50%;object-fit:cover;flex-shrink:0;margin-left:12px;" crossorigin="anonymous">';
      }
    }
    h += '</div>';

    function sectionTitle(t) {
      return '<div style="font-family:JetBrains Mono,monospace;font-size:8px;letter-spacing:2px;text-transform:uppercase;color:#C4302B;font-weight:500;margin-top:14px;margin-bottom:6px;padding-bottom:4px;border-bottom:0.5px solid rgba(0,0,0,0.08);">// ' + t + '</div>';
    }

    if (toggleState.intro) {
      h += sectionTitle('Introduction');
      var paras = document.querySelectorAll('#about .prose p');
      paras.forEach(function (p) {
        h += '<div style="font-size:8.5px;color:#4A4340;line-height:1.5;margin-bottom:4px;">' + esc(p.textContent.trim()) + '</div>';
      });
    }

    if (toggleState.current) {
      h += sectionTitle('Current Positions');
      var cards = document.querySelectorAll('#currently .role-card');
      cards.forEach(function (c) {
        var date = c.querySelector('.role-date');
        var title = c.querySelector('h3');
        var org = c.querySelector('.role-org');
        var note = c.querySelector('.role-note');
        h += '<div style="margin-bottom:6px;">';
        if (date) h += '<span style="font-family:JetBrains Mono,monospace;font-size:7px;color:#C4302B;letter-spacing:0.3px;">' + esc(date.textContent) + '</span> ';
        if (title) h += '<strong style="font-size:9px;color:#1A1614;">' + esc(title.textContent) + '</strong>';
        if (org) h += '<div style="font-size:8px;color:#4A4340;">' + esc(org.textContent) + '</div>';
        if (note) h += '<div style="font-size:7.5px;color:#888280;">' + esc(note.textContent) + '</div>';
        h += '</div>';
      });
    }

    if (toggleState.experience) {
      h += sectionTitle('Experience');
      h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;">';
      var expCols = document.querySelectorAll('#experience .exp-col');
      expCols.forEach(function (col) {
        h += '<div>';
        var colTitle = col.querySelector('.exp-col-title');
        if (colTitle) h += '<div style="font-size:7px;font-weight:600;color:#888280;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">' + esc(colTitle.textContent) + '</div>';
        var items = col.querySelectorAll('.timeline li');
        items.forEach(function (li) {
          var date = li.querySelector('.tl-date');
          var rest = li.querySelector('div');
          h += '<div style="display:grid;grid-template-columns:48px 1fr;gap:8px;padding:3px 0;border-bottom:0.5px solid rgba(0,0,0,0.04);font-size:8px;color:#4A4340;line-height:1.4;">';
          h += '<span style="font-family:JetBrains Mono,monospace;font-size:7px;color:#C4302B;letter-spacing:0.3px;font-weight:500;">' + (date ? esc(date.textContent) : '') + '</span>';
          h += '<div>' + (rest ? rest.innerHTML : '') + '</div>';
          h += '</div>';
        });
        h += '</div>';
      });
      h += '</div>';
    }

    if (toggleState.education) {
      h += sectionTitle('Education & Awards');
      h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;">';
      var edCols = document.querySelectorAll('#education .ed-grid > div');
      edCols.forEach(function (col) {
        h += '<div>';
        var colTitle = col.querySelector('.ed-col-title');
        if (colTitle) h += '<div style="font-size:7px;font-weight:600;color:#888280;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">' + esc(colTitle.textContent) + '</div>';
        var items = col.querySelectorAll('.timeline li');
        items.forEach(function (li) {
          var date = li.querySelector('.tl-date');
          var rest = li.querySelector('div');
          h += '<div style="display:grid;grid-template-columns:48px 1fr;gap:8px;padding:3px 0;border-bottom:0.5px solid rgba(0,0,0,0.04);font-size:8px;color:#4A4340;line-height:1.4;">';
          h += '<span style="font-family:JetBrains Mono,monospace;font-size:7px;color:#C4302B;letter-spacing:0.3px;font-weight:500;">' + (date ? esc(date.textContent) : '') + '</span>';
          h += '<div>' + (rest ? rest.innerHTML : '') + '</div>';
          h += '</div>';
        });
        h += '</div>';
      });
      h += '</div>';
    }

    if (toggleState.expertise) {
      h += sectionTitle('Expertise');
      h += '<div style="font-size:8px;color:#4A4340;line-height:1.7;">';
      var compCards = document.querySelectorAll('#expertise .comp-card');
      var skills = [];
      compCards.forEach(function (c) {
        var t = c.querySelector('h3');
        var p = c.querySelector('p');
        if (t) skills.push(t.textContent.trim());
        if (p) {
          p.textContent.split(/[·,]/).forEach(function (s) {
            var trimmed = s.trim();
            if (trimmed) skills.push(trimmed);
          });
        }
      });
      var unique = [];
      skills.forEach(function (s) { if (unique.indexOf(s) === -1) unique.push(s); });
      h += unique.map(function (s) {
        return '<span style="display:inline-block;padding:1px 6px;background:rgba(196,48,43,0.06);border-radius:3px;margin:1px 2px;font-size:7.5px;">' + esc(s) + '</span>';
      }).join(' ');
      h += '</div>';

      if (expertiseMode === 'skills_courses') {
        h += '<div style="margin-top:8px;font-size:7px;font-weight:600;color:#888280;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">Continuing Education</div>';
        var courses = document.querySelectorAll('#expertise .course-list li');
        courses.forEach(function (li) {
          var date = li.querySelector('.tl-date');
          var text = li.textContent.trim();
          if (date) text = text.replace(date.textContent.trim(), '').trim();
          h += '<div style="display:grid;grid-template-columns:36px 1fr;gap:6px;padding:2px 0;border-bottom:0.5px solid rgba(0,0,0,0.04);font-size:7px;color:#4A4340;line-height:1.4;">';
          h += '<span style="font-family:JetBrains Mono,monospace;font-size:6.5px;color:#C4302B;letter-spacing:0.3px;font-weight:500;">' + (date ? esc(date.textContent) : '') + '</span>';
          h += '<span>' + esc(text) + '</span>';
          h += '</div>';
        });
      }
    }

    if (toggleState.research) {
      h += sectionTitle('Research Projects');
      var rCards = document.querySelectorAll('#research .research-card');
      rCards.forEach(function (c) {
        var tag = c.querySelector('.research-tag');
        var title = c.querySelector('h3');
        var desc = c.querySelector('p');
        h += '<div style="margin-bottom:6px;">';
        if (tag) h += '<span style="font-family:JetBrains Mono,monospace;font-size:6.5px;color:#C4302B;letter-spacing:1.5px;text-transform:uppercase;">' + esc(tag.textContent) + '</span> ';
        if (title) h += '<strong style="font-family:Fraunces,Georgia,serif;font-size:10px;color:#1A1614;">' + esc(title.textContent) + '</strong>';
        if (desc) h += '<div style="font-size:8px;color:#4A4340;line-height:1.5;margin-top:2px;">' + esc(desc.textContent) + '</div>';
        h += '</div>';
      });
    }

    if (toggleState.publications && pubs && pubs.length) {
      h += sectionTitle('Publications');
      pubs.forEach(function (p) {
        var year = p.publication_year || '';
        var title = p.title || 'Untitled';
        var venue = (p.primary_location && p.primary_location.source && p.primary_location.source.display_name) || '';
        var cites = p.cited_by_count || 0;
        h += '<div style="padding:2.5px 0;border-bottom:0.5px solid rgba(0,0,0,0.04);font-size:8px;">';
        h += '<span style="font-family:Fraunces,Georgia,serif;font-size:8.5px;font-weight:500;color:#1A1614;">' + esc(title) + '</span>';
        h += '<div style="font-size:7px;color:#888280;font-style:italic;margin-top:1px;">' + esc(venue) + (cites > 0 ? ' &middot; ' + cites + ' citation' + (cites === 1 ? '' : 's') : '') + ' &middot; ' + year + '</div>';
        h += '</div>';
      });
    }

    if (toggleState.speaking) {
      h += sectionTitle('Speaking, Service & Outreach');
      var blocks = document.querySelectorAll('#speaking .sso-block');
      blocks.forEach(function (b) {
        var title = b.querySelector('.sso-title');
        if (title) h += '<div style="font-size:8px;font-weight:600;color:#1A1614;margin-top:6px;margin-bottom:3px;">' + esc(title.textContent) + '</div>';
        var items = b.querySelectorAll('.sso-list li');
        items.forEach(function (li) {
          h += '<div style="font-size:7.5px;color:#4A4340;line-height:1.4;padding:1px 0;">' + esc(li.textContent.trim()) + '</div>';
        });
        var text = b.querySelector('.sso-text');
        if (text) h += '<div style="font-size:7.5px;color:#4A4340;line-height:1.5;">' + esc(text.textContent.trim()) + '</div>';
        var aux = b.querySelector('.sso-aux');
        if (aux) h += '<div style="font-size:7px;color:#888280;font-style:italic;margin-top:2px;">' + esc(aux.textContent.trim()) + '</div>';
      });
    }

    if (toggleState.contact) {
      h += sectionTitle('Contact');
      var contacts = document.querySelectorAll('#contact .contact-list li');
      contacts.forEach(function (li) {
        var key = li.querySelector('.contact-key');
        var val = li.querySelector('a') || li.querySelector('span:last-child');
        if (key && val) {
          h += '<div style="font-size:8px;color:#4A4340;padding:1px 0;"><strong style="font-family:JetBrains Mono,monospace;font-size:7px;color:#888280;letter-spacing:1px;text-transform:uppercase;">' + esc(key.textContent) + '</strong> ' + esc(val.textContent.trim()) + '</div>';
        }
      });
      var affs = document.querySelectorAll('#contact .aff-marks span');
      if (affs.length) {
        h += '<div style="font-size:7px;color:#888280;margin-top:4px;">' + Array.from(affs).map(function (a) { return esc(a.textContent.trim()); }).join(' &middot; ') + '</div>';
      }
    }

    h += '<div style="position:fixed;bottom:20mm;right:20mm;opacity:0.045;">';
    h += '<svg viewBox="0 0 64 64" width="48" height="48"><rect width="64" height="64" rx="10" fill="#7A1F2B"/><text x="18" y="43" font-family="Georgia,serif" font-weight="700" font-size="26" fill="#FBFAF7">B</text><text x="37" y="43" font-family="Georgia,serif" font-weight="700" font-size="26" fill="#FBFAF7">L</text></svg>';
    h += '</div>';

    return h;
  }

  // -- Generate Visual PDF --

  function generateVisualPDF() {
    var btn = document.getElementById('eeGenBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="ee-spinner"></span>';

    var pubsPromise = toggleState.publications ? fetchPublications() : Promise.resolve([]);

    Promise.all([loadScript(HTML2PDF_CDN), pubsPromise])
      .then(function (results) {
        var pubs = results[1];

        var container = document.createElement('div');
        container.id = 'ee-cv-render';
        container.style.cssText = 'position:absolute;top:0;left:0;width:680px;padding:40px;background:#FBFAF7;color:#1A1614;font-family:Inter,Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;z-index:1;';
        container.innerHTML = buildCvHtml(pubs);

        if (overlay) overlay.style.display = 'none';
        document.body.appendChild(container);
        window.scrollTo(0, 0);

        return new Promise(function (resolve) {
          setTimeout(resolve, 300);
        }).then(function () {
          return window.html2pdf().set({
            margin: [10, 10, 10, 10],
            filename: 'Bobby_Lo_CV_' + todayStr() + '.pdf',
            image: { type: 'jpeg', quality: 0.95 },
            html2canvas: { scale: 2, useCORS: true, logging: true, scrollY: 0, windowWidth: 760 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
          }).from(container).save();
        }).then(function () {
          document.body.removeChild(container);
          if (overlay) { overlay.style.display = ''; overlay.classList.add('is-open'); }
        });
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = 'Generate PDF →';
      })
      .catch(function (err) {
        console.error('PDF generation failed:', err);
        var old = document.getElementById('ee-cv-render');
        if (old) document.body.removeChild(old);
        if (overlay) { overlay.style.display = ''; overlay.classList.add('is-open'); }
        btn.disabled = false;
        btn.textContent = 'Generate PDF →';
        alert('PDF generation failed. Check browser console (F12) for details.');
      });
  }

  // -- Generate Text-Selectable PDF --

  function generateTextPDF() {
    var btn = document.querySelector('.ee-text-link');
    var origText = btn.textContent;
    btn.textContent = 'generating...';
    btn.style.pointerEvents = 'none';

    var pubsPromise = toggleState.publications ? fetchPublications() : Promise.resolve([]);

    function getJsPDF() {
      if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
      return loadScript(JSPDF_CDN);
    }

    Promise.all([getJsPDF(), pubsPromise])
      .then(function (results) {
        var pubs = results[1];
        if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('jsPDF failed to load');
        var jsPDF = window.jspdf.jsPDF;
        var doc = new jsPDF({ unit: 'mm', format: 'a4' });
        var pageW = 210;
        var marginL = 20;
        var marginR = 20;
        var contentW = pageW - marginL - marginR;
        var y = 20;

        function checkPage(needed) {
          if (y + needed > 277) { doc.addPage(); y = 20; }
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('Bobby Zhao Sheng Lo, MD, PhD', pageW / 2, y, { align: 'center' });
        y += 7;

        var roleEl = document.querySelector('.hero-role');
        var roleText = roleEl ? roleEl.textContent.trim() : '';
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(74, 67, 64);
        var roleLines = doc.splitTextToSize(roleText, contentW);
        doc.text(roleLines, pageW / 2, y, { align: 'center' });
        y += roleLines.length * 3.5 + 2;

        doc.setFontSize(7);
        doc.setTextColor(136, 130, 128);
        doc.text('bobby.lo@regionh.dk  |  linkedin.com/in/bobby-lo-md  |  bobby-zs-lo.github.io', pageW / 2, y, { align: 'center' });
        y += 5;

        doc.setDrawColor(26, 22, 20);
        doc.setLineWidth(0.3);
        doc.line(marginL, y, pageW - marginR, y);
        y += 6;

        function sectionHeading(title) {
          checkPage(12);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(26, 22, 20);
          doc.text(title.toUpperCase(), marginL, y);
          y += 1;
          doc.setDrawColor(26, 22, 20);
          doc.setLineWidth(0.15);
          doc.line(marginL, y, pageW - marginR, y);
          y += 5;
        }

        function bodyText(text) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(74, 67, 64);
          var lines = doc.splitTextToSize(text, contentW);
          lines.forEach(function (line) {
            checkPage(4);
            doc.text(line, marginL, y);
            y += 3.8;
          });
          y += 2;
        }

        function timelineEntry(date, text) {
          checkPage(6);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(74, 67, 64);
          doc.text(date, marginL, y);
          var entryLines = doc.splitTextToSize(text, contentW - 30);
          entryLines.forEach(function (line, i) {
            doc.text(line, marginL + 28, y + (i * 3.5));
          });
          y += Math.max(entryLines.length * 3.5, 4) + 1.5;
        }

        if (toggleState.intro) {
          sectionHeading('Introduction');
          var paras = document.querySelectorAll('#about .prose p');
          paras.forEach(function (p) { bodyText(p.textContent.trim()); });
        }

        if (toggleState.current) {
          sectionHeading('Current Positions');
          var roleCards = document.querySelectorAll('#currently .role-card');
          roleCards.forEach(function (c) {
            var date = c.querySelector('.role-date');
            var title = c.querySelector('h3');
            var org = c.querySelector('.role-org');
            var note = c.querySelector('.role-note');
            var text = (title ? title.textContent : '') + (org ? ' — ' + org.textContent : '') + (note ? '. ' + note.textContent : '');
            timelineEntry(date ? date.textContent : '', text);
          });
        }

        if (toggleState.experience) {
          sectionHeading('Experience');
          var expCols = document.querySelectorAll('#experience .exp-col');
          expCols.forEach(function (col) {
            var colTitle = col.querySelector('.exp-col-title');
            if (colTitle) {
              checkPage(6);
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(7.5);
              doc.setTextColor(26, 22, 20);
              doc.text(colTitle.textContent.trim().toUpperCase(), marginL, y);
              y += 4;
            }
            var items = col.querySelectorAll('.timeline li');
            items.forEach(function (li) {
              var date = li.querySelector('.tl-date');
              var div = li.querySelector('div');
              timelineEntry(date ? date.textContent : '', div ? div.textContent.trim().replace(/\s+/g, ' ') : '');
            });
            y += 2;
          });
        }

        if (toggleState.education) {
          sectionHeading('Education & Awards');
          var edCols = document.querySelectorAll('#education .ed-grid > div');
          edCols.forEach(function (col) {
            var colTitle = col.querySelector('.ed-col-title');
            if (colTitle) {
              checkPage(6);
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(7.5);
              doc.setTextColor(26, 22, 20);
              doc.text(colTitle.textContent.trim().toUpperCase(), marginL, y);
              y += 4;
            }
            var items = col.querySelectorAll('.timeline li');
            items.forEach(function (li) {
              var date = li.querySelector('.tl-date');
              var div = li.querySelector('div');
              timelineEntry(date ? date.textContent : '', div ? div.textContent.trim().replace(/\s+/g, ' ') : '');
            });
            y += 2;
          });
        }

        if (toggleState.expertise) {
          sectionHeading('Expertise');
          var compCards = document.querySelectorAll('#expertise .comp-card');
          var skills = [];
          compCards.forEach(function (c) {
            var t = c.querySelector('h3');
            var p = c.querySelector('p');
            if (t) skills.push(t.textContent.trim());
            if (p) {
              p.textContent.split(/[·,]/).forEach(function (s) {
                var trimmed = s.trim();
                if (trimmed && skills.indexOf(trimmed) === -1) skills.push(trimmed);
              });
            }
          });
          bodyText(skills.join('  ·  '));

          if (expertiseMode === 'skills_courses') {
            checkPage(6);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(26, 22, 20);
            doc.text('CONTINUING EDUCATION', marginL, y);
            y += 4;
            var courses = document.querySelectorAll('#expertise .course-list li');
            courses.forEach(function (li) {
              var date = li.querySelector('.tl-date');
              var text = li.textContent.trim().replace(/\s+/g, ' ');
              if (date) text = text.replace(date.textContent.trim(), '').trim();
              timelineEntry(date ? date.textContent.trim() : '', text);
            });
          }
        }

        if (toggleState.research) {
          sectionHeading('Research Projects');
          var rCards = document.querySelectorAll('#research .research-card');
          rCards.forEach(function (c) {
            var tag = c.querySelector('.research-tag');
            var title = c.querySelector('h3');
            var desc = c.querySelector('p');
            checkPage(10);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(26, 22, 20);
            doc.text((title ? title.textContent : ''), marginL, y);
            if (tag) {
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(7);
              doc.setTextColor(136, 130, 128);
              doc.text('  [' + tag.textContent.trim() + ']', marginL + doc.getTextWidth(title ? title.textContent : '') + 2, y);
            }
            y += 4;
            if (desc) bodyText(desc.textContent.trim());
          });
        }

        if (toggleState.publications && pubs && pubs.length) {
          sectionHeading('Publications');
          pubs.forEach(function (p) {
            var year = p.publication_year || '';
            var title = p.title || 'Untitled';
            var venue = (p.primary_location && p.primary_location.source && p.primary_location.source.display_name) || '';
            var cites = p.cited_by_count || 0;
            checkPage(8);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(26, 22, 20);
            var titleLines = doc.splitTextToSize(title, contentW);
            titleLines.forEach(function (line) {
              doc.text(line, marginL, y);
              y += 3.5;
            });
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(7);
            doc.setTextColor(136, 130, 128);
            doc.text(venue + (cites > 0 ? ' · ' + cites + ' citation' + (cites === 1 ? '' : 's') : '') + ' · ' + year, marginL, y);
            y += 5;
          });
        }

        if (toggleState.speaking) {
          sectionHeading('Speaking, Service & Outreach');
          var blocks = document.querySelectorAll('#speaking .sso-block');
          blocks.forEach(function (b) {
            var title = b.querySelector('.sso-title');
            if (title) {
              checkPage(6);
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(7.5);
              doc.setTextColor(26, 22, 20);
              doc.text(title.textContent.trim(), marginL, y);
              y += 4;
            }
            var items = b.querySelectorAll('.sso-list li');
            items.forEach(function (li) {
              var date = li.querySelector('.tl-date');
              var text = li.textContent.trim().replace(/\s+/g, ' ');
              if (date) text = text.replace(date.textContent.trim(), '').trim();
              timelineEntry(date ? date.textContent.trim() : '', text);
            });
            var ssoText = b.querySelector('.sso-text');
            if (ssoText) bodyText(ssoText.textContent.trim());
            var aux = b.querySelector('.sso-aux');
            if (aux) {
              doc.setFont('helvetica', 'italic');
              doc.setFontSize(7);
              doc.setTextColor(136, 130, 128);
              var auxLines = doc.splitTextToSize(aux.textContent.trim(), contentW);
              auxLines.forEach(function (line) { checkPage(4); doc.text(line, marginL, y); y += 3.5; });
              y += 2;
            }
          });
        }

        if (toggleState.contact) {
          sectionHeading('Contact');
          var contacts = document.querySelectorAll('#contact .contact-list li');
          contacts.forEach(function (li) {
            var key = li.querySelector('.contact-key');
            var val = li.querySelector('a') || li.querySelector('span:last-child');
            if (key && val) {
              checkPage(5);
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(7);
              doc.setTextColor(136, 130, 128);
              doc.text(key.textContent.trim().toUpperCase(), marginL, y);
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(8);
              doc.setTextColor(74, 67, 64);
              doc.text(val.textContent.trim(), marginL + 22, y);
              y += 4.5;
            }
          });
        }

        var pageCount = doc.internal.getNumberOfPages();
        for (var i = 1; i <= pageCount; i++) {
          doc.setPage(i);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(136, 130, 128);
          doc.text(i + ' / ' + pageCount, pageW / 2, 290, { align: 'center' });
        }

        doc.save('Bobby_Lo_CV_' + todayStr() + '.pdf');
      })
      .then(function () {
        btn.textContent = origText;
        btn.style.pointerEvents = '';
      })
      .catch(function (err) {
        console.error('Text PDF generation failed:', err);
        btn.textContent = origText;
        btn.style.pointerEvents = '';
        alert('PDF generation failed. Please try again.');
      });
  }
})();
