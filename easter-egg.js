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
  var customPubs = [];
  var allPubsCache = [];

  function initState() {
    SECTIONS.forEach(function (s) { toggleState[s.key] = true; });
    pubMode = 'all';
    expertiseMode = 'skills';
    customPubs = [];
    allPubsCache = [];
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
        [['all', 'All publications'], ['top10', 'Top 10 by citations'], ['latest10', 'Latest 10'], ['custom', 'Custom selection']].forEach(function (pair) {
          var opt = document.createElement('option');
          opt.value = pair[0];
          opt.textContent = pair[1];
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
    genBtn.addEventListener('click', function () { generatePDF(); });

    footer.appendChild(genBtn);

    // Step 1 wrapper (so we can show/hide it as a group)
    var step1 = document.createElement('div');
    step1.id = 'eeStep1';
    step1.appendChild(header);
    step1.appendChild(togglesWrap);
    step1.appendChild(footer);

    // Step 2 panel (publication picker, hidden by default)
    var step2 = document.createElement('div');
    step2.className = 'ee-step2';
    step2.id = 'eeStep2';

    var s2dots = document.createElement('div');
    s2dots.className = 'ee-step-dots';
    s2dots.innerHTML = '<span class="ee-step-dot ee-step-dot-done">1</span><span class="ee-step-dot ee-step-dot-active">2</span>';

    var s2header = document.createElement('div');
    s2header.className = 'ee-header';
    s2header.innerHTML = '<h2 class="ee-title">Select publications</h2><div class="ee-subtitle">// step 2 of 2</div>';

    var s2search = document.createElement('input');
    s2search.className = 'ee-pub-search';
    s2search.type = 'text';
    s2search.placeholder = 'Search publications...';
    s2search.setAttribute('aria-label', 'Search publications');

    var s2list = document.createElement('div');
    s2list.className = 'ee-pub-list';
    s2list.id = 'eePubList';

    var s2count = document.createElement('div');
    s2count.className = 'ee-pub-count';
    s2count.id = 'eePubCount';
    s2count.innerHTML = '<span>0 of 0 selected</span><span><a id="eePubSelAll">Select all</a> &middot; <a id="eePubClear">Clear</a></span>';

    var s2footer = document.createElement('div');
    s2footer.className = 'ee-step2-footer';
    var s2back = document.createElement('button');
    s2back.className = 'ee-step2-back';
    s2back.textContent = '← Back';
    var s2gen = document.createElement('button');
    s2gen.className = 'ee-step2-gen';
    s2gen.id = 'eeStep2Gen';
    s2gen.textContent = 'Generate PDF →';
    s2gen.disabled = true;
    s2footer.appendChild(s2back);
    s2footer.appendChild(s2gen);

    step2.appendChild(s2dots);
    step2.appendChild(s2header);
    step2.appendChild(s2search);
    step2.appendChild(s2list);
    step2.appendChild(s2count);
    step2.appendChild(s2footer);

    // Step 2 event listeners
    s2search.addEventListener('input', function () {
      var q = this.value.toLowerCase();
      s2list.querySelectorAll('.ee-pub-row').forEach(function (row) {
        var text = row.textContent.toLowerCase();
        row.classList.toggle('is-hidden', q && !text.includes(q));
      });
    });

    s2back.addEventListener('click', function () {
      step2.classList.remove('is-visible');
      step1.style.display = '';
      closeBtn.style.display = '';
    });

    s2gen.addEventListener('click', function () {
      var selected = [];
      s2list.querySelectorAll('.ee-pub-row').forEach(function (row) {
        if (row.querySelector('.is-checked')) {
          selected.push(JSON.parse(row.dataset.pub));
        }
      });
      customPubs = selected;
      step2.classList.remove('is-visible');
      step1.style.display = '';
      closeBtn.style.display = '';
      doGeneratePDF(customPubs);
    });

    s2count.querySelector('#eePubSelAll').addEventListener('click', function (e) {
      e.preventDefault();
      s2list.querySelectorAll('.ee-pub-row:not(.is-hidden) .ee-pub-cb').forEach(function (cb) { cb.classList.add('is-checked'); });
      updatePubCount();
    });
    s2count.querySelector('#eePubClear').addEventListener('click', function (e) {
      e.preventDefault();
      s2list.querySelectorAll('.ee-pub-cb').forEach(function (cb) { cb.classList.remove('is-checked'); });
      updatePubCount();
    });

    card.appendChild(closeBtn);
    card.appendChild(step1);
    card.appendChild(step2);
    overlay.appendChild(card);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });

    document.body.appendChild(overlay);
  }

  function updatePubCount() {
    var total = document.querySelectorAll('#eePubList .ee-pub-row').length;
    var checked = document.querySelectorAll('#eePubList .ee-pub-cb.is-checked').length;
    var countEl = document.querySelector('#eePubCount span:first-child');
    if (countEl) countEl.textContent = checked + ' of ' + total + ' selected';
    var genBtn = document.getElementById('eeStep2Gen');
    if (genBtn) genBtn.disabled = checked === 0;
  }

  function populateStep2(pubs) {
    var list = document.getElementById('eePubList');
    if (!list) return;
    list.innerHTML = '';
    if (!pubs.length) {
      list.innerHTML = '<div class="ee-pub-empty">No publications found.</div>';
      return;
    }
    pubs.forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'ee-pub-row';
      row.dataset.pub = JSON.stringify({ title: p.title, publication_year: p.publication_year, primary_location: p.primary_location, cited_by_count: p.cited_by_count });
      var cb = document.createElement('div');
      cb.className = 'ee-pub-cb';
      var info = document.createElement('div');
      var venue = (p.primary_location && p.primary_location.source && p.primary_location.source.display_name) || '';
      info.innerHTML = '<div class="ee-pub-row-title">' + (p.title || 'Untitled').replace(/</g, '&lt;') + '</div>' +
        '<div class="ee-pub-row-meta">' + venue.replace(/</g, '&lt;') + (p.publication_year ? ' &middot; ' + p.publication_year : '') + '</div>';
      row.appendChild(cb);
      row.appendChild(info);
      row.addEventListener('click', function () {
        cb.classList.toggle('is-checked');
        updatePubCount();
      });
      list.appendChild(row);
    });
    updatePubCount();
  }

  function showStep2() {
    var step1 = document.getElementById('eeStep1');
    var step2 = document.getElementById('eeStep2');
    var closeBtn = overlay.querySelector('.ee-close');
    if (step1) step1.style.display = 'none';
    if (closeBtn) closeBtn.style.display = 'none';
    if (step2) step2.classList.add('is-visible');
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
      var s2 = document.getElementById('eeStep2');
      if (s2) s2.classList.remove('is-visible');
      var s1 = document.getElementById('eeStep1');
      if (s1) s1.style.display = '';
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

  (function preloadFavicon() {
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      var c = document.createElement('canvas');
      c.width = 512; c.height = 512;
      c.getContext('2d').drawImage(img, 0, 0, 512, 512);
      window._eeFaviconData = c.toDataURL('image/png');
    };
    img.src = 'image/favicon-512.png';
  })();

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

  var JSPDF_CDN = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
  var AUTHOR_ID = 'a5078664290';
  var MAILTO = 'bobby.lo@regionh.dk';

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

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

  // -- Sanitize text for jsPDF --
  var _charMap = {};
  _charMap[0x2018] = "'"; _charMap[0x2019] = "'"; _charMap[0x201A] = "'";
  _charMap[0x201C] = '"'; _charMap[0x201D] = '"'; _charMap[0x201E] = '"';
  _charMap[0x2026] = '...'; _charMap[0x2013] = '-'; _charMap[0x2014] = '-';
  _charMap[0x2192] = '>'; _charMap[0x00B7] = '\xB7'; _charMap[0x2022] = '\xB7';
  _charMap[0x22C5] = '\xB7'; _charMap[0x00A0] = ' ';
  _charMap[0x00E6] = 'ae'; _charMap[0x00C6] = 'Ae';
  _charMap[0x00F8] = 'o';  _charMap[0x00D8] = 'O';
  _charMap[0x00E5] = 'aa'; _charMap[0x00C5] = 'Aa';
  _charMap[0x00FC] = 'u';  _charMap[0x00DC] = 'U';
  _charMap[0x00E9] = 'e';  _charMap[0x00C9] = 'E';
  _charMap[0x00F6] = 'o';  _charMap[0x00E4] = 'a';
  _charMap[0x00F1] = 'n';  _charMap[0x00E8] = 'e';
  _charMap[0x00EA] = 'e';  _charMap[0x00EB] = 'e';
  _charMap[0x00E0] = 'a';  _charMap[0x00E1] = 'a';
  _charMap[0x00ED] = 'i';  _charMap[0x00F3] = 'o';
  _charMap[0x00FA] = 'u';  _charMap[0x00E7] = 'c';
  var _tagRe = new RegExp('\x3c[^\x3e]*\x3e', 'g');
  function sanitize(s) {
    return s.replace(_tagRe, '').replace(/[^\x00-\x7F]/g, function (ch) {
      return _charMap[ch.charCodeAt(0)] || '';
    });
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
      var size = 500;
      var canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, size, size);
      ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); ctx.clip();
      var sw = imgEl.naturalWidth, sh = imgEl.naturalHeight;
      var scale = Math.max(size / sw, size / sh);
      var dw = sw * scale, dh = sh * scale;
      var offsetY = sh > sw ? -(dh - size) * 0.3 : (size - dh) / 2;
      ctx.drawImage(imgEl, (size - dw) / 2, offsetY, dw, dh);
      return canvas.toDataURL('image/jpeg', 0.95);
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
      if (window._eeFaviconData) {
        doc.addImage(window._eeFaviconData, 'PNG', mL, y - 2, 10, 10);
      } else {
        fillRgb({ r: 122, g: 31, b: 43 });
        doc.roundedRect(mL, y - 2, 10, 10, 1.5, 1.5, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
        doc.setTextColor(251, 250, 247);
        doc.text('BL', mL + 2.8, y + 4.5);
      }

      doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
      rgb(ink);
      doc.text('Bobby Zhao Sheng Lo, MD, PhD', mL + 14, y + 3);
      y += 9;

      var roleEl = document.querySelector('.hero-role');
      var roleText = roleEl ? sanitize(roleEl.textContent.trim()).replace(/\s+/g, ' ').trim() : '';
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
      rgb(ink2);
      var roleW = toggleState.photo ? cW - 14 - 30 : cW - 14;
      var roleLines = doc.splitTextToSize(roleText, roleW);
      doc.text(roleLines, mL + 14, y);
      y += roleLines.length * 3.2 + 1.5;

      doc.setFontSize(6.5); rgb(ink3);
      doc.text('bobby.lo@regionh.dk  \xB7  linkedin.com/in/bobby-lo-md  \xB7  bobbylo.dk', mL + 14, y);
      y += 5;

      if (toggleState.photo) {
        var heroImg = document.querySelector('.hero-portrait img');
        if (heroImg) {
          var imgData = getImageData(heroImg);
          if (imgData) doc.addImage(imgData, 'JPEG', W - mR - 27, 12, 25, 25);
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
          if (imgData2) doc.addImage(imgData2, 'JPEG', W - mR - 22, y - 2, 20, 20);
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
      doc.text('bobby.lo@regionh.dk  \xB7  linkedin.com/in/bobby-lo-md  \xB7  bobbylo.dk', W / 2, y, { align: 'center' });
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
      var clean = sanitize(text).replace(/\s+/g, ' ').trim();
      var lines = doc.splitTextToSize(clean, cW);
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
        var tLines = doc.splitTextToSize(sanitize(title).replace(/\s+/g, ' ').trim(), wR);
        tLines.forEach(function (l) { doc.text(l, xR, y); y += 3.3; });
      }
      if (desc) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); rgb(ink2);
        var dLines = doc.splitTextToSize(sanitize(desc).replace(/\s+/g, ' ').trim(), wR);
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

      body(skills.map(function (s) { return sanitize(s); }).join('  \xB7  '));

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
      if (pubMode !== 'custom') {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(6); rgb(ink3);
        doc.text('Publication list generated automatically from OpenAlex. Errors may occur.', mL, y);
        y += 4;
      }
      pubs.forEach(function (p) {
        var year = p.publication_year || '';
        var title = sanitize(p.title || 'Untitled');
        var venue = sanitize((p.primary_location && p.primary_location.source && p.primary_location.source.display_name) || '');
        checkPage(9);

        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); rgb(ink);
        var tLines = doc.splitTextToSize(title.replace(/\s+/g, ' ').trim(), cW);
        tLines.forEach(function (l) { checkPage(3.2); doc.text(l, mL, y); y += 3.2; });

        doc.setFont('helvetica', 'italic'); doc.setFontSize(6.5);
        if (styled) { rgb(ox); } else { rgb(ink3); }
        var meta = venue + (year ? ' \xB7 ' + year : '');
        doc.text(meta, mL, y);
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
      checkPage(5);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); rgb(ink3);
      doc.text('PHONE', mL, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); rgb(ink2);
      doc.text('+45 2858 0410', mL + 22, y);
      y += 4.5;
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

    // -- PAGE NUMBERS --
    var pageCount = doc.internal.getNumberOfPages();
    for (var i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); rgb(ink3);
      doc.text(i + ' / ' + pageCount, W / 2, 290, { align: 'center' });
    }

    doc.save('Bobby_Lo_CV_' + todayStr() + '.pdf');
  }

  function ensureJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
    return loadScript(JSPDF_CDN);
  }

  // -- Actual PDF generation (called after pubs are resolved) --
  function doGeneratePDF(pubs) {
    var btn = document.getElementById('eeGenBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="ee-spinner"></span>';

    ensureJsPDF()
      .then(function () { buildPDF(pubs, true); })
      .then(function () { btn.disabled = false; btn.textContent = 'Generate PDF →'; })
      .catch(function (err) {
        console.error('PDF generation failed:', err);
        btn.disabled = false; btn.textContent = 'Generate PDF →';
        alert('PDF generation failed. Check console for details.');
      });
  }

  // -- Main generate handler (conditional: step 2 or direct) --
  function generatePDF() {
    if (pubMode === 'custom' && toggleState.publications) {
      var btn = document.getElementById('eeGenBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="ee-spinner"></span>';

      var fetchAll = allPubsCache.length ? Promise.resolve(allPubsCache) :
        fetch('https://api.openalex.org/works?filter=authorships.author.id:' + AUTHOR_ID + '&per_page=200&sort=publication_date%3Adesc&mailto=' + MAILTO)
          .then(function (r) { return r.json(); })
          .then(function (d) { allPubsCache = d.results || []; return allPubsCache; });

      fetchAll
        .then(function (pubs) {
          populateStep2(pubs);
          showStep2();
          btn.disabled = false;
          btn.textContent = 'Generate PDF →';
        })
        .catch(function (err) {
          console.error('Failed to fetch publications:', err);
          btn.disabled = false; btn.textContent = 'Generate PDF →';
          alert('Failed to load publications from OpenAlex.');
        });
    } else {
      var pubsPromise = toggleState.publications ? fetchPublications() : Promise.resolve([]);
      var btn2 = document.getElementById('eeGenBtn');
      btn2.disabled = true;
      btn2.innerHTML = '<span class="ee-spinner"></span>';

      Promise.all([ensureJsPDF(), pubsPromise])
        .then(function (results) { buildPDF(results[1], true); })
        .then(function () { btn2.disabled = false; btn2.textContent = 'Generate PDF →'; })
        .catch(function (err) {
          console.error('PDF generation failed:', err);
          btn2.disabled = false; btn2.textContent = 'Generate PDF →';
          alert('PDF generation failed. Check console for details.');
        });
    }
  }
})();
