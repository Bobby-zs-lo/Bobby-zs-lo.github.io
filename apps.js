/* ============================================
   Apps page — reveal on scroll + light parallax.
   No dependencies. Bails out entirely under
   prefers-reduced-motion.
   ============================================ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- reveal on enter ---------- */
  var revealables = document.querySelectorAll('.reveal');

  if (reduced || !('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(revealables, function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });

    Array.prototype.forEach.call(revealables, function (el) { io.observe(el); });
  }

  /* ---------- the morphs ----------
     Two blocks change ground colour on scroll instead of butting up against a
     section in the opposite palette: the hero goes dark on the way in, and the
     capability outro comes back to paper on the way out. Each sits sticky
     inside a taller .lights track; progress through that track is written to
     the block as a plain 0→1 --dim, and every colour on it is a color-mix of
     that number. There is no gradient band anywhere on the page.
     With JS off or reduced motion on, .no-morph pins both to their end state. */
  var tracks = Array.prototype.map.call(
    document.querySelectorAll('.lights'),
    function (track) {
      return { track: track, block: track.firstElementChild };
    }
  ).filter(function (t) { return t.block; });

  if (!tracks.length || reduced) {
    document.body.classList.add('no-morph');
  }

  /* Per-track timing. The hero can afford to sit on paper for a beat before it
     dims — you have only just arrived. The outro cannot: holding black there
     just reads as a long empty screen, so it starts coming up almost at once
     and the cards land well before the block lets go. */
  var TIMING = {
    'in':  { hold: 0.18, flip: [0.44, 0.58], grid: [0.52, 0.85] },
    'out': { hold: 0.04, flip: [0.26, 0.40], grid: [0.20, 0.52] }
  };

  /* The outro's capability grid stacks on narrow screens and grows past one
     viewport, which a sticky block cannot hold. Below the breakpoint that block
     stops morphing and simply renders on paper, so nothing gets clipped. */
  var narrow = window.matchMedia('(max-width: 900px)');

  function morph() {
    for (var i = 0; i < tracks.length; i++) {
      var isOutro = i === tracks.length - 1 && tracks.length > 1;

      if (isOutro && narrow.matches) {
        tracks[i].block.style.setProperty('--dim', '1');
        tracks[i].block.style.setProperty('--dimfg', '1');
        tracks[i].block.style.setProperty('--grid', '1');
        continue;
      }

      var travel = tracks[i].track.offsetHeight - window.innerHeight;
      if (travel <= 0) continue;

      var t = TIMING[isOutro ? 'out' : 'in'];

      var p = (window.scrollY - tracks[i].track.offsetTop) / travel;
      p = p < 0 ? 0 : (p > 1 ? 1 : p);

      var eased = p <= t.hold ? 0 : (p - t.hold) / (1 - t.hold);

      // The ground crosses over the whole way, but the type flips inside a
      // narrow window. Crossfading both together would put grey type on a grey
      // ground halfway down and wash the headline out.
      var flip = smoothstep(t.flip[0], t.flip[1], eased);

      var style = tracks[i].block.style;
      style.setProperty('--dim', eased.toFixed(3));
      style.setProperty('--dimfg', flip.toFixed(3));
      style.setProperty('--grid', smoothstep(t.grid[0], t.grid[1], eased).toFixed(3));
    }
  }

  function smoothstep(a, b, x) {
    var t = (x - a) / (b - a);
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return t * t * (3 - 2 * t);
  }

  /* ---------- nav inversion ----------
     The nav is sticky and the page is black from partway down the hero until
     the outro brings the lights back up. Flip it across exactly that stretch. */
  var nav = document.querySelector('.nav');

  function paintNav() {
    if (!nav || tracks.length < 2) return;

    var edge = window.scrollY + nav.offsetHeight;
    var inTrack = tracks[0].track;
    var outTrack = tracks[tracks.length - 1].track;

    var darkFrom = reduced
      ? inTrack.offsetTop
      : inTrack.offsetTop + (inTrack.offsetHeight - window.innerHeight) * 0.55;
    var darkTo = reduced
      ? outTrack.offsetTop
      : outTrack.offsetTop + (outTrack.offsetHeight - window.innerHeight) * 0.5;

    nav.classList.toggle('nav--dark', edge > darkFrom && edge < darkTo);
  }

  if (reduced) {
    // Inverting the nav is a colour change, not motion, so it stays either way.
    window.addEventListener('scroll', paintNav, { passive: true });
    window.addEventListener('resize', paintNav, { passive: true });
    paintNav();
    return;
  }

  /* ---------- parallax ----------
     Each [data-par] element shifts by (distance from viewport centre) * factor.
     Transform only, batched in one rAF pass, and only for elements currently
     on screen — so this stays off the layout path. */
  var layers = Array.prototype.slice.call(document.querySelectorAll('[data-par]'));

  var ticking = false;

  function frame() {
    ticking = false;
    morph();
    paintNav();

    var mid = window.innerHeight / 2;

    for (var i = 0; i < layers.length; i++) {
      var el = layers[i];
      var rect = el.getBoundingClientRect();

      // skip anything comfortably off screen
      if (rect.bottom < -200 || rect.top > window.innerHeight + 200) continue;

      var factor = parseFloat(el.getAttribute('data-par')) || 0;
      var offset = (rect.top + rect.height / 2 - mid) * factor;
      el.style.transform = 'translate3d(0,' + offset.toFixed(1) + 'px,0)';
    }
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(frame);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  frame();

  /* ---------- race backdrop tile width ----------
     The strip is 1472x240 and is drawn at the arena's full height, so one tile
     is 1472/240 of that height wide. The scroll keyframe shifts by exactly that,
     which is what keeps the loop seamless at any size. */
  var STRIP_RATIO = 1472 / 240;

  function sizeArena() {
    var arena = document.querySelector('.arena');
    if (!arena) return;
    var tile = arena.getBoundingClientRect().height * STRIP_RATIO;
    arena.style.setProperty('--tile', tile.toFixed(1) + 'px');
  }

  sizeArena();
  window.addEventListener('resize', sizeArena, { passive: true });

  /* ---------- pause the timer iframe until it is visible ----------
     The embedded Pixel Timer runs a canvas loop; no reason to burn
     frames on it while it is far below the fold. */
  var phone = document.querySelector('.phone iframe');
  if (phone && 'IntersectionObserver' in window) {
    var src = phone.getAttribute('src');
    var loaded = false;
    phone.removeAttribute('src');

    new IntersectionObserver(function (entries, obs) {
      if (!entries[0].isIntersecting || loaded) return;
      loaded = true;
      phone.setAttribute('src', src);
      obs.disconnect();
    }, { rootMargin: '200px' }).observe(phone);
  }
})();
