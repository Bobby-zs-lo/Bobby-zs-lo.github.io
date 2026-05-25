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
    textLink.textContent = 'or download plain black & white version';
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
    var mono = 'Courier New,Courier,monospace';
    var serif = 'Georgia,Times New Roman,serif';
    var sans = 'Helvetica,Arial,sans-serif';

    // Header
    h += '<table style="width:100%;border-bottom:2px solid #1A1614;padding-bottom:12px;margin-bottom:16px;border-collapse:collapse;"><tr>';
    h += '<td style="vertical-align:top;">';
    h += '<div style="display:inline-block;width:36px;height:36px;background:#7A1F2B;border-radius:5px;text-align:center;line-height:36px;margin-right:12px;vertical-align:top;">';
    h += '<span style="color:#FBFAF7;font-family:' + serif + ';font-weight:700;font-size:14px;">BL</span></div>';
    h += '<div style="display:inline-block;vertical-align:top;">';
    h += '<div style="font-family:' + serif + ';font-size:24px;font-weight:bold;color:#1A1614;line-height:1.2;">Bobby Zhao Sheng Lo, MD, PhD</div>';
    var roleEl = document.querySelector('.hero-role');
    var roleText = roleEl ? roleEl.textContent.trim() : '';
    h += '<div style="font-family:' + sans + ';font-size:11px;color:#4A4340;margin-top:4px;line-height:1.4;max-width:420px;">' + esc(roleText) + '</div>';
    h += '<div style="font-family:' + mono + ';font-size:10px;color:#888280;margin-top:4px;">bobby.lo@regionh.dk · linkedin.com/in/bobby-lo-md · bobby-zs-lo.github.io</div>';
    h += '</div></td>';

    if (toggleState.photo) {
      var img = document.querySelector('.hero-portrait img');
      if (img) {
        h += '<td style="vertical-align:top;text-align:right;width:70px;">';
        h += '<img src="' + img.src + '" width="60" height="60" style="border-radius:50%;object-fit:cover;" crossorigin="anonymous">';
        h += '</td>';
      }
    }
    h += '</tr></table>';

    function sec(t) {
      return '<div style="font-family:' + mono + ';font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#C4302B;font-weight:bold;margin-top:18px;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #C4302B;">// ' + t + '</div>';
    }
    function subSec(t) {
      return '<div style="font-family:' + sans + ';font-size:10px;font-weight:bold;color:#888280;letter-spacing:1px;text-transform:uppercase;margin-top:10px;margin-bottom:6px;">' + t + '</div>';
    }
    function tlRow(date, title, desc) {
      var r = '<table style="width:100%;border-collapse:collapse;margin-bottom:2px;"><tr>';
      r += '<td style="width:70px;vertical-align:top;padding:3px 8px 3px 0;font-family:' + mono + ';font-size:10px;color:#C4302B;font-weight:bold;">' + esc(date) + '</td>';
      r += '<td style="vertical-align:top;padding:3px 0;border-bottom:1px solid #f0efeb;">';
      if (title) r += '<strong style="font-family:' + sans + ';font-size:12px;color:#1A1614;">' + esc(title) + '</strong>';
      if (desc) r += '<div style="font-family:' + sans + ';font-size:11px;color:#4A4340;margin-top:1px;">' + esc(desc) + '</div>';
      r += '</td></tr></table>';
      return r;
    }

    // Introduction
    if (toggleState.intro) {
      h += sec('Introduction');
      document.querySelectorAll('#about .prose p').forEach(function (p) {
        h += '<p style="font-family:' + sans + ';font-size:12px;color:#4A4340;line-height:1.6;margin:0 0 8px 0;">' + esc(p.textContent.trim()) + '</p>';
      });
    }

    // Current positions
    if (toggleState.current) {
      h += sec('Current Positions');
      document.querySelectorAll('#currently .role-card').forEach(function (c) {
        var date = c.querySelector('.role-date');
        var h3 = c.querySelector('h3');
        var org = c.querySelector('.role-org');
        var note = c.querySelector('.role-note');
        h += tlRow(
          date ? date.textContent.trim() : '',
          (h3 ? h3.textContent.trim() : '') + (org ? ' — ' + org.textContent.trim() : ''),
          note ? note.textContent.trim() : ''
        );
      });
    }

    // Experience
    if (toggleState.experience) {
      h += sec('Experience');
      document.querySelectorAll('#experience .exp-col').forEach(function (col) {
        var ct = col.querySelector('.exp-col-title');
        if (ct) h += subSec(ct.textContent.trim());
        col.querySelectorAll('.timeline li').forEach(function (li) {
          var date = li.querySelector('.tl-date');
          var strong = li.querySelector('strong');
          var div = li.querySelector('div');
          var title = strong ? strong.textContent.trim() : '';
          var full = div ? extractEntry(div) : '';
          var desc = full.replace(title, '').replace(/^\s*[-·]\s*/, '').trim();
          h += tlRow(date ? date.textContent.trim() : '', title, desc);
        });
      });
    }

    // Education
    if (toggleState.education) {
      h += sec('Education & Awards');
      document.querySelectorAll('#education .ed-grid > div').forEach(function (col) {
        var ct = col.querySelector('.ed-col-title');
        if (ct) h += subSec(ct.textContent.trim());
        col.querySelectorAll('.timeline li').forEach(function (li) {
          var date = li.querySelector('.tl-date');
          var strong = li.querySelector('strong');
          var div = li.querySelector('div');
          var title = strong ? strong.textContent.trim() : '';
          var full = div ? extractEntry(div) : '';
          var desc = full.replace(title, '').replace(/^\s*[-·]\s*/, '').trim();
          h += tlRow(date ? date.textContent.trim() : '', title, desc);
        });
      });
    }

    // Expertise
    if (toggleState.expertise) {
      h += sec('Expertise');
      var compCards = document.querySelectorAll('#expertise .comp-card');
      var skills = [];
      compCards.forEach(function (c) {
        var t = c.querySelector('h3');
        var p = c.querySelector('p');
        if (t) skills.push(t.textContent.trim());
        if (p) p.textContent.split(/[·,]/).forEach(function (s) {
          var tr = s.trim(); if (tr && skills.indexOf(tr) === -1) skills.push(tr);
        });
      });
      var unique = [];
      skills.forEach(function (s) { if (unique.indexOf(s) === -1) unique.push(s); });
      h += '<div style="line-height:2.2;">';
      unique.forEach(function (s) {
        h += '<span style="display:inline-block;padding:2px 8px;margin:2px 3px;background:#fdf0ef;border-radius:4px;font-family:' + sans + ';font-size:11px;color:#4A4340;">' + esc(s) + '</span>';
      });
      h += '</div>';

      if (expertiseMode === 'skills_courses') {
        h += subSec('Continuing Education');
        document.querySelectorAll('#expertise .course-list li').forEach(function (li) {
          var date = li.querySelector('.tl-date');
          var text = li.textContent.trim();
          if (date) text = text.replace(date.textContent.trim(), '').trim();
          h += tlRow(date ? date.textContent.trim() : '', text, '');
        });
      }
    }

    // Research
    if (toggleState.research) {
      h += sec('Research Projects');
      document.querySelectorAll('#research .research-card').forEach(function (c) {
        var tag = c.querySelector('.research-tag');
        var title = c.querySelector('h3');
        var desc = c.querySelector('p');
        h += '<div style="margin-bottom:10px;">';
        h += '<strong style="font-family:' + serif + ';font-size:14px;color:#1A1614;">' + esc(title ? title.textContent : '') + '</strong>';
        if (tag) h += ' <span style="font-family:' + mono + ';font-size:9px;color:#C4302B;text-transform:uppercase;">[' + esc(tag.textContent.trim()) + ']</span>';
        if (desc) h += '<div style="font-family:' + sans + ';font-size:11px;color:#4A4340;line-height:1.5;margin-top:3px;">' + esc(desc.textContent.trim()) + '</div>';
        h += '</div>';
      });
    }

    // Publications
    if (toggleState.publications && pubs && pubs.length) {
      h += sec('Publications');
      pubs.forEach(function (p) {
        var year = p.publication_year || '';
        var title = p.title || 'Untitled';
        var venue = (p.primary_location && p.primary_location.source && p.primary_location.source.display_name) || '';
        var cites = p.cited_by_count || 0;
        h += '<div style="padding:4px 0;border-bottom:1px solid #f0efeb;">';
        h += '<div style="font-family:' + serif + ';font-size:12px;font-weight:bold;color:#1A1614;line-height:1.4;">' + esc(title) + '</div>';
        h += '<div style="font-family:' + sans + ';font-size:10px;color:#C4302B;font-style:italic;margin-top:2px;">' + esc(venue) + (cites > 0 ? ' · ' + cites + ' citation' + (cites === 1 ? '' : 's') : '') + ' · ' + year + '</div>';
        h += '</div>';
      });
    }

    // Speaking
    if (toggleState.speaking) {
      h += sec('Speaking, Service & Outreach');
      document.querySelectorAll('#speaking .sso-block').forEach(function (b) {
        var title = b.querySelector('.sso-title');
        if (title) h += subSec(title.textContent.trim());
        b.querySelectorAll('.sso-list li').forEach(function (li) {
          var date = li.querySelector('.tl-date');
          var text = li.textContent.trim().replace(/\s+/g, ' ');
          if (date) text = text.replace(date.textContent.trim(), '').trim();
          h += tlRow(date ? date.textContent.trim() : '', text, '');
        });
        var ssoText = b.querySelector('.sso-text');
        if (ssoText) h += '<p style="font-family:' + sans + ';font-size:11px;color:#4A4340;line-height:1.5;margin:4px 0;">' + esc(ssoText.textContent.trim()) + '</p>';
        var aux = b.querySelector('.sso-aux');
        if (aux) h += '<p style="font-family:' + sans + ';font-size:10px;color:#888280;font-style:italic;margin:4px 0;">' + esc(aux.textContent.trim()) + '</p>';
      });
    }

    // Contact
    if (toggleState.contact) {
      h += sec('Contact');
      document.querySelectorAll('#contact .contact-list li').forEach(function (li) {
        var key = li.querySelector('.contact-key');
        var val = li.querySelector('a') || li.querySelector('span:last-child');
        if (key && val) {
          h += '<div style="font-family:' + sans + ';font-size:12px;color:#4A4340;padding:2px 0;">';
          h += '<strong style="font-family:' + mono + ';font-size:10px;color:#888280;text-transform:uppercase;">' + esc(key.textContent.trim()) + '</strong> ';
          h += esc(val.textContent.trim()) + '</div>';
        }
      });
      var affs = document.querySelectorAll('#contact .aff-marks span');
      if (affs.length) {
        h += '<div style="font-family:' + sans + ';font-size:10px;color:#888280;margin-top:6px;">' + Array.from(affs).map(function (a) { return esc(a.textContent.trim()); }).join(' · ') + '</div>';
      }
    }

    return h;
  }

  // -- Sanitize text for jsPDF (replace unsupported Unicode) --
  function sanitize(s) {
    return s.replace(/→/g, '->').replace(/’/g, "'").replace(/‘/g, "'")
            .replace(/“/g, '"').replace(/”/g, '"').replace(/—/g, '--')
            .replace(/–/g, '-').replace(/·/g, '.').replace(/…/g, '...');
  }

  // -- Extract text from a timeline <div> with <strong> + <br> --
  function extractEntry(div) {
    if (!div) return '';
    var clone = div.cloneNode(true);
    var brs = clone.querySelectorAll('br');
    brs.forEach(function (br) { br.replaceWith(' - '); });
    return clone.textContent.trim().replace(/\s+/g, ' ');
  }

  function getImageData(imgEl) {
    try {
      var canvas = document.createElement('canvas');
      canvas.width = 120; canvas.height = 120;
      var ctx = canvas.getContext('2d');
      ctx.beginPath(); ctx.arc(60, 60, 60, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(imgEl, 0, 0, 120, 120);
      return canvas.toDataURL('image/jpeg', 0.85);
    } catch (e) { return null; }
  }

  // -- Core PDF builder (used by plain version) --
  function buildPDF(pubs, styled) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: 'mm', format: 'a4' });
    var W = 210, mL = 18, mR = 18, cW = W - mL - mR, y = 18;
    var ox = { r: 196, g: 48, b: 43 };
    var ink = { r: 26, g: 22, b: 20 };
    var ink2 = { r: 74, g: 67, b: 64 };
    var ink3 = { r: 136, g: 130, b: 128 };

    function rgb(c) { doc.setTextColor(c.r, c.g, c.b); }
    function drawRgb(c) { doc.setDrawColor(c.r, c.g, c.b); }
    function fillRgb(c) { doc.setFillColor(c.r, c.g, c.b); }

    function checkPage(needed) {
      if (y + needed > 280) { doc.addPage(); y = 18; }
    }

    // -- HEADER --
    if (styled) {
      fillRgb({ r: 122, g: 31, b: 43 });
      doc.roundedRect(mL, y - 2, 10, 10, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
      doc.setTextColor(251, 250, 247);
      doc.text('BL', mL + 2.8, y + 4.5);

      doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
      rgb(ink);
      doc.text('Bobby Zhao Sheng Lo, MD, PhD', mL + 14, y + 3);
      y += 9;

      var roleEl = document.querySelector('.hero-role');
      var roleText = roleEl ? sanitize(roleEl.textContent.trim()) : '';
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
      rgb(ink2);
      var roleLines = doc.splitTextToSize(roleText, cW - 14);
      doc.text(roleLines, mL + 14, y);
      y += roleLines.length * 3.2 + 1.5;

      doc.setFontSize(6.5); rgb(ink3);
      doc.text('bobby.lo@regionh.dk  |  linkedin.com/in/bobby-lo-md  |  bobby-zs-lo.github.io', mL + 14, y);
      y += 5;

      if (toggleState.photo) {
        var heroImg = document.querySelector('.hero-portrait img');
        if (heroImg) {
          var imgData = getImageData(heroImg);
          if (imgData) doc.addImage(imgData, 'JPEG', W - mR - 16, 16, 15, 15);
        }
      }

      drawRgb(ink); doc.setLineWidth(0.4);
      doc.line(mL, y, W - mR, y);
      y += 6;
    } else {
      if (toggleState.photo) {
        var heroImg2 = document.querySelector('.hero-portrait img');
        if (heroImg2) {
          var imgData2 = getImageData(heroImg2);
          if (imgData2) doc.addImage(imgData2, 'JPEG', W - mR - 16, y - 2, 15, 15);
        }
      }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(18); rgb(ink);
      doc.text('Bobby Zhao Sheng Lo, MD, PhD', W / 2, y, { align: 'center' });
      y += 7;
      var roleEl2 = document.querySelector('.hero-role');
      var roleText2 = roleEl2 ? sanitize(roleEl2.textContent.trim()) : '';
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); rgb(ink2);
      var rl2 = doc.splitTextToSize(roleText2, cW);
      doc.text(rl2, W / 2, y, { align: 'center' });
      y += rl2.length * 3.5 + 2;
      doc.setFontSize(7); rgb(ink3);
      doc.text('bobby.lo@regionh.dk  |  linkedin.com/in/bobby-lo-md  |  bobby-zs-lo.github.io', W / 2, y, { align: 'center' });
      y += 5;
      drawRgb(ink); doc.setLineWidth(0.3); doc.line(mL, y, W - mR, y); y += 6;
    }

    // -- Helpers --
    function heading(title) {
      checkPage(12);
      if (styled) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
        rgb(ox);
        doc.text('// ' + title.toUpperCase(), mL, y);
        y += 1.5;
        drawRgb(ox); doc.setLineWidth(0.2);
        doc.line(mL, y, W - mR, y);
      } else {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        rgb(ink);
        doc.text(title.toUpperCase(), mL, y);
        y += 1;
        drawRgb(ink); doc.setLineWidth(0.15);
        doc.line(mL, y, W - mR, y);
      }
      y += 5;
    }

    function body(text) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); rgb(ink2);
      var lines = doc.splitTextToSize(sanitize(text), cW);
      lines.forEach(function (l) { checkPage(3.5); doc.text(l, mL, y); y += 3.5; });
      y += 1.5;
    }

    function tlEntry(date, title, desc) {
      date = sanitize(date).replace(/->/g, '-');
      checkPage(8);
      if (styled) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); rgb(ox);
      } else {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); rgb(ink2);
      }
      doc.text(date, mL, y);

      var xR = mL + 26;
      var wR = cW - 26;
      if (title) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); rgb(ink);
        var tLines = doc.splitTextToSize(sanitize(title), wR);
        tLines.forEach(function (l) { doc.text(l, xR, y); y += 3.3; });
      }
      if (desc) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); rgb(ink2);
        var dLines = doc.splitTextToSize(sanitize(desc), wR);
        dLines.forEach(function (l) { checkPage(3.2); doc.text(l, xR, y); y += 3.2; });
      }
      y += 1.8;
    }

    function subHeading(text) {
      checkPage(6);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
      if (styled) { rgb(ink3); } else { rgb(ink); }
      doc.text(text.toUpperCase(), mL, y);
      y += 4;
    }

    // -- INTRODUCTION --
    if (toggleState.intro) {
      heading('Introduction');
      document.querySelectorAll('#about .prose p').forEach(function (p) {
        body(p.textContent.trim());
      });
    }

    // -- CURRENT POSITIONS --
    if (toggleState.current) {
      heading('Current Positions');
      document.querySelectorAll('#currently .role-card').forEach(function (c) {
        var date = c.querySelector('.role-date');
        var h3 = c.querySelector('h3');
        var org = c.querySelector('.role-org');
        var note = c.querySelector('.role-note');
        tlEntry(
          date ? date.textContent.trim() : '',
          (h3 ? h3.textContent.trim() : '') + (org ? ' — ' + org.textContent.trim() : ''),
          note ? note.textContent.trim() : ''
        );
      });
    }

    // -- EXPERIENCE --
    if (toggleState.experience) {
      heading('Experience');
      document.querySelectorAll('#experience .exp-col').forEach(function (col) {
        var ct = col.querySelector('.exp-col-title');
        if (ct) subHeading(ct.textContent.trim());
        col.querySelectorAll('.timeline li').forEach(function (li) {
          var date = li.querySelector('.tl-date');
          var strong = li.querySelector('strong');
          var div = li.querySelector('div');
          var title = strong ? strong.textContent.trim() : '';
          var full = div ? extractEntry(div) : '';
          var desc = full.replace(title, '').replace(/^\s*[-·]\s*/, '').trim();
          tlEntry(date ? date.textContent.trim() : '', title, desc);
        });
        y += 1;
      });
    }

    // -- EDUCATION & AWARDS --
    if (toggleState.education) {
      heading('Education & Awards');
      document.querySelectorAll('#education .ed-grid > div').forEach(function (col) {
        var ct = col.querySelector('.ed-col-title');
        if (ct) subHeading(ct.textContent.trim());
        col.querySelectorAll('.timeline li').forEach(function (li) {
          var date = li.querySelector('.tl-date');
          var strong = li.querySelector('strong');
          var div = li.querySelector('div');
          var title = strong ? strong.textContent.trim() : '';
          var full = div ? extractEntry(div) : '';
          var desc = full.replace(title, '').replace(/^\s*[-·]\s*/, '').trim();
          tlEntry(date ? date.textContent.trim() : '', title, desc);
        });
        y += 1;
      });
    }

    // -- EXPERTISE --
    if (toggleState.expertise) {
      heading('Expertise');
      var compCards = document.querySelectorAll('#expertise .comp-card');
      var skills = [];
      compCards.forEach(function (c) {
        var t = c.querySelector('h3');
        var p = c.querySelector('p');
        if (t) skills.push(t.textContent.trim());
        if (p) p.textContent.split(/[·,]/).forEach(function (s) {
          var tr = s.trim(); if (tr && skills.indexOf(tr) === -1) skills.push(tr);
        });
      });

      if (styled) {
        var chipX = mL, chipY = y;
        skills.forEach(function (s) {
          var txt = sanitize(s);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
          var tw = doc.getTextWidth(txt) + 4;
          if (chipX + tw > W - mR) { chipX = mL; chipY += 5.5; checkPage(5.5); }
          fillRgb({ r: 250, g: 240, b: 239 });
          doc.roundedRect(chipX, chipY - 2.8, tw, 4.2, 1, 1, 'F');
          rgb(ink2);
          doc.text(txt, chipX + 2, chipY);
          chipX += tw + 2;
        });
        y = chipY + 5;
      } else {
        body(skills.join('  ·  '));
      }

      if (expertiseMode === 'skills_courses') {
        y += 1;
        subHeading('Continuing Education');
        document.querySelectorAll('#expertise .course-list li').forEach(function (li) {
          var date = li.querySelector('.tl-date');
          var text = li.textContent.trim().replace(/\s+/g, ' ');
          if (date) text = text.replace(date.textContent.trim(), '').trim();
          tlEntry(date ? date.textContent.trim() : '', text, '');
        });
      }
    }

    // -- RESEARCH PROJECTS --
    if (toggleState.research) {
      heading('Research Projects');
      document.querySelectorAll('#research .research-card').forEach(function (c) {
        var tag = c.querySelector('.research-tag');
        var h3 = c.querySelector('h3');
        var desc = c.querySelector('p');
        checkPage(12);

        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); rgb(ink);
        doc.text(h3 ? sanitize(h3.textContent) : '', mL, y);
        if (tag) {
          var tagText = sanitize(tag.textContent.trim());
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
          var nameW = doc.getTextWidth(h3 ? sanitize(h3.textContent) : '');
          doc.setFont('helvetica', 'italic'); doc.setFontSize(7);
          if (styled) { rgb(ox); } else { rgb(ink3); }
          doc.text('  [' + tagText + ']', mL + nameW + 1, y);
        }
        y += 4;
        if (desc) body(desc.textContent.trim());
      });
    }

    // -- PUBLICATIONS --
    if (toggleState.publications && pubs && pubs.length) {
      heading('Publications');
      pubs.forEach(function (p) {
        var year = p.publication_year || '';
        var title = sanitize(p.title || 'Untitled');
        var venue = sanitize((p.primary_location && p.primary_location.source && p.primary_location.source.display_name) || '');
        var cites = p.cited_by_count || 0;
        checkPage(9);

        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); rgb(ink);
        var tLines = doc.splitTextToSize(title, cW);
        tLines.forEach(function (l) { checkPage(3.2); doc.text(l, mL, y); y += 3.2; });

        doc.setFont('helvetica', 'italic'); doc.setFontSize(6.5);
        if (styled) { rgb(ox); } else { rgb(ink3); }
        var meta = venue + (cites > 0 ? ' · ' + cites + ' citation' + (cites === 1 ? '' : 's') : '') + ' · ' + year;
        doc.text(sanitize(meta), mL, y);
        y += 4.5;
      });
    }

    // -- SPEAKING & SERVICE --
    if (toggleState.speaking) {
      heading('Speaking, Service & Outreach');
      document.querySelectorAll('#speaking .sso-block').forEach(function (b) {
        var title = b.querySelector('.sso-title');
        if (title) subHeading(title.textContent.trim());

        b.querySelectorAll('.sso-list li').forEach(function (li) {
          var date = li.querySelector('.tl-date');
          var text = li.textContent.trim().replace(/\s+/g, ' ');
          if (date) text = text.replace(date.textContent.trim(), '').trim();
          tlEntry(date ? date.textContent.trim() : '', text, '');
        });

        var ssoText = b.querySelector('.sso-text');
        if (ssoText) body(ssoText.textContent.trim());

        var aux = b.querySelector('.sso-aux');
        if (aux) {
          doc.setFont('helvetica', 'italic'); doc.setFontSize(6.5); rgb(ink3);
          var aLines = doc.splitTextToSize(sanitize(aux.textContent.trim()), cW);
          aLines.forEach(function (l) { checkPage(3.2); doc.text(l, mL, y); y += 3.2; });
          y += 2;
        }
      });
    }

    // -- CONTACT --
    if (toggleState.contact) {
      heading('Contact');
      document.querySelectorAll('#contact .contact-list li').forEach(function (li) {
        var key = li.querySelector('.contact-key');
        var val = li.querySelector('a') || li.querySelector('span:last-child');
        if (key && val) {
          checkPage(5);
          doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); rgb(ink3);
          doc.text(sanitize(key.textContent.trim()).toUpperCase(), mL, y);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8); rgb(ink2);
          doc.text(sanitize(val.textContent.trim()), mL + 22, y);
          y += 4.5;
        }
      });
    }

    // -- WATERMARK + PAGE NUMBERS --
    var pageCount = doc.internal.getNumberOfPages();
    for (var i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      if (styled) {
        doc.setGState(new doc.GState({ opacity: 0.06 }));
        fillRgb({ r: 122, g: 31, b: 43 });
        doc.roundedRect(W - mR - 10, 280, 8, 8, 1.2, 1.2, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(5);
        doc.setTextColor(251, 250, 247);
        doc.text('BL', W - mR - 7.5, 285);
        doc.setGState(new doc.GState({ opacity: 1 }));
      }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); rgb(ink3);
      doc.text(i + ' / ' + pageCount, W / 2, 290, { align: 'center' });
    }

    doc.save('Bobby_Lo_CV_' + todayStr() + '.pdf');
  }

  // -- Generate Visual PDF (primary, html2pdf.js) --
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
        container.style.cssText = 'width:700px;padding:30px;margin:0 auto;font-family:Helvetica,Arial,sans-serif;background:#FBFAF7;color:#1A1614;font-size:12px;line-height:1.5;';
        container.innerHTML = buildCvHtml(pubs);

        if (overlay) overlay.style.visibility = 'hidden';
        document.body.appendChild(container);

        return new Promise(function (resolve) { setTimeout(resolve, 200); })
          .then(function () {
            return window.html2pdf().set({
              margin: [12, 12, 12, 12],
              filename: 'Bobby_Lo_CV_' + todayStr() + '.pdf',
              image: { type: 'jpeg', quality: 0.95 },
              html2canvas: { scale: 2, useCORS: true, logging: false },
              jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
              pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
            }).from(container).save();
          })
          .then(function () {
            document.body.removeChild(container);
            if (overlay) { overlay.style.visibility = ''; }
          });
      })
      .then(function () { btn.disabled = false; btn.textContent = 'Generate PDF →'; })
      .catch(function (err) {
        console.error('Visual PDF failed, falling back to styled jsPDF:', err);
        var old = document.getElementById('ee-cv-render');
        if (old) old.parentNode.removeChild(old);
        if (overlay) overlay.style.visibility = '';
        var pubsPromise2 = toggleState.publications ? fetchPublications() : Promise.resolve([]);
        function ensureJsPDF() {
          if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
          return loadScript(JSPDF_CDN);
        }
        return Promise.all([ensureJsPDF(), pubsPromise2])
          .then(function (r) { buildPDF(r[1], true); })
          .then(function () { btn.disabled = false; btn.textContent = 'Generate PDF →'; })
          .catch(function (e2) {
            console.error('Fallback also failed:', e2);
            btn.disabled = false; btn.textContent = 'Generate PDF →';
            alert('PDF generation failed. Check console.');
          });
      });
  }

  // -- Generate Plain PDF (secondary) --
  function generateTextPDF() {
    var btn = document.querySelector('.ee-text-link');
    var origText = btn.textContent;
    btn.textContent = 'generating...'; btn.style.pointerEvents = 'none';
    var pubsPromise = toggleState.publications ? fetchPublications() : Promise.resolve([]);

    function ensureJsPDF() {
      if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
      return loadScript(JSPDF_CDN);
    }

    Promise.all([ensureJsPDF(), pubsPromise])
      .then(function (results) { buildPDF(results[1], false); })
      .then(function () { btn.textContent = origText; btn.style.pointerEvents = ''; })
      .catch(function (err) {
        console.error('PDF generation failed:', err);
        btn.textContent = origText; btn.style.pointerEvents = '';
        alert('PDF generation failed. Check console for details.');
      });
  }
})();
