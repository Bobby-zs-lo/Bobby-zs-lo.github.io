/* Screen 2: the race — timer, star feeding, movement, finishes, fire wave, results. */
(function () {
  'use strict';
  const { $, showBanner, slashTo, shake } = window.UI;
  const L = window.Logic;
  const { renderCharacter } = window.Characters;
  const A = window.GameAudio;
  const Game = window.Game;

  const track = $('#track'), clock = $('#clock'), fireWave = $('#fireWave');
  let players = [];         // { pick, char, stars, finishMs, lane, avatar, btn, countEl, laneTrack }
  let running = false;
  let raceStart = 0, endAt = 0;
  let clockTimer = null, burnRAF = null;
  let lastTickSec = -1;

  const charById = (id) => window.Characters.CHARACTERS.find(c => c.id === id);

  /* ---------- build ---------- */
  function buildTrack() {
    track.innerHTML = '';
    fireWave.className = 'fire-wave hidden';
    fireWave.style.transform = '';
    fireWave.innerHTML = '<div class="flames"></div><div class="flames f2"></div>';
    players = Game.picks.map((pick, i) => {
      const char = charById(pick.charId);
      const lane = document.createElement('div');
      lane.className = 'lane';
      lane.style.setProperty('--pcolor', pick.color);
      lane.innerHTML = `
        <button type="button" class="star-btn" style="--pcolor:${pick.color}">
          <span class="sb-star">⭐</span>
          <span class="sb-info"><span class="sb-name">${escapeHtml(pick.name)}</span><span class="sb-count">0 / ${Game.config.stars}</span></span>
        </button>
        <div class="lane-track" style="--startX:3%; --finishX:86%;">
          <div class="line start"></div>
          <div class="line finish"></div>
          <div class="avatar pose-idle">${renderCharacter(char, { uid: i })}</div>
        </div>`;
      track.appendChild(lane);
      const p = {
        pick, char, stars: 0, finishMs: null,
        lane,
        laneTrack: lane.querySelector('.lane-track'),
        avatar: lane.querySelector('.avatar'),
        btn: lane.querySelector('.star-btn'),
        countEl: lane.querySelector('.sb-count'),
      };
      p.btn.addEventListener('click', () => addStar(p));
      return p;
    });
    $('#goalStars').textContent = Game.config.stars;
  }

  function escapeHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* distance in px from start line to finish line for a lane */
  function runDist(p) {
    const w = p.laneTrack.clientWidth;
    return Math.max(0, w * 0.86 - w * 0.03 - p.avatar.offsetWidth * 0.5);
  }
  function positionAvatar(p, instant = false) {
    const frac = p.finishMs != null ? 1.06 : L.progressFrac(p.stars, Game.config.stars);
    if (instant) p.avatar.style.transition = 'none';
    p.avatar.style.setProperty('--tx', (frac * runDist(p)) + 'px');
    if (instant) { void p.avatar.offsetWidth; p.avatar.style.transition = ''; }
  }
  window.addEventListener('resize', () => players.forEach(p => positionAvatar(p, true)));

  /* ---------- race start ---------- */
  Game.onRaceStart = async function () {
    buildTrack();
    setClock(L.totalSeconds(Game.config));
    clock.classList.remove('warn');
    await showBanner('READY?', { hold: 950, style: 'gold' });
    A.sfx.count();
    A.announce('Ready? Go!', { rate: 1.05, pitch: 0.55 });
    await showBanner('GO!', { hold: 700, style: '' });
    A.sfx.go();
    shake();
    running = true;
    raceStart = performance.now();
    endAt = raceStart + L.totalSeconds(Game.config) * 1000;
    lastTickSec = -1;
    clockTimer = setInterval(tickClock, 150);
    A.musicStart();
  };

  function setClock(sec) { clock.textContent = L.formatClock(sec); }

  function tickClock() {
    const left = (endAt - performance.now()) / 1000;
    setClock(left);
    if (left <= 10.5 && left > 0) {
      clock.classList.add('warn');
      const s = Math.ceil(left);
      if (s !== lastTickSec) { lastTickSec = s; A.sfx.tick(); if (s <= 5) A.announce(String(s), { rate: 1.2, pitch: 0.6 }); }
    }
    if (left <= 0) timeUp();
  }

  /* ---------- star feeding ---------- */
  function addStar(p) {
    if (!running || p.finishMs != null || p.stars >= Game.config.stars) return;
    A.sfx.press();
    p.btn.classList.add('pressed');
    setTimeout(() => p.btn.classList.remove('pressed'), 120);
    p.stars++;
    p.countEl.textContent = p.stars + ' / ' + Game.config.stars;
    flyStar(p);
  }

  function flyStar(p) {
    const from = p.btn.getBoundingClientRect();
    const to = p.avatar.getBoundingClientRect();
    const star = document.createElement('div');
    star.className = 'fly-star';
    star.textContent = '⭐';
    star.style.left = (from.left + from.width * 0.22) + 'px';
    star.style.top = (from.top + from.height / 2 - 14) + 'px';
    document.body.appendChild(star);
    const dx = (to.left + to.width * 0.5) - (from.left + from.width * 0.22);
    const dy = (to.top + to.height * 0.36) - (from.top + from.height / 2 - 14);
    star.animate([
      { transform: 'translate(0,0) scale(1) rotate(0deg)' },
      { transform: `translate(${dx * 0.55}px, ${dy - 60}px) scale(1.35) rotate(200deg)`, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(.7) rotate(380deg)` },
    ], { duration: 520, easing: 'cubic-bezier(.3,.2,.4,1)' }).onfinish = () => {
      star.remove();
      consumeStar(p);
    };
  }

  function consumeStar(p) {
    A.sfx.collect();
    // hit-stop + eat
    p.avatar.classList.add('hitstop');
    p.avatar.classList.remove('pose-idle', 'pose-run');
    p.avatar.classList.add('pose-eat');
    sparkleBurst(p);
    setTimeout(() => {
      p.avatar.classList.remove('hitstop', 'pose-eat');
      if (p.stars >= Game.config.stars) { finishPlayer(p); return; }
      // run forward
      p.avatar.classList.add('pose-run');
      positionAvatar(p);
      const dustInt = setInterval(() => spawnDust(p), 130);
      setTimeout(() => {
        clearInterval(dustInt);
        p.avatar.classList.remove('pose-run');
        p.avatar.classList.add('pose-idle');
      }, 780);
    }, 190);
  }

  function sparkleBurst(p) {
    const r = p.avatar.getBoundingClientRect(), lt = p.laneTrack.getBoundingClientRect();
    for (let i = 0; i < 8; i++) {
      const s = document.createElement('div');
      s.className = 'sparkle';
      s.style.left = (r.left - lt.left + r.width / 2) + 'px';
      s.style.top = (r.top - lt.top + r.height * 0.35) + 'px';
      const a = Math.random() * Math.PI * 2, d = 26 + Math.random() * 34;
      s.style.setProperty('--dx', Math.cos(a) * d + 'px');
      s.style.setProperty('--dy', Math.sin(a) * d + 'px');
      p.laneTrack.appendChild(s);
      setTimeout(() => s.remove(), 600);
    }
  }

  function spawnDust(p) {
    const d = document.createElement('div');
    d.className = 'dust';
    const tx = parseFloat(getComputedStyle(p.avatar).getPropertyValue('--tx')) || 0;
    d.style.left = (p.laneTrack.clientWidth * 0.03 + tx) + 'px';
    p.laneTrack.appendChild(d);
    const line = document.createElement('div');
    line.className = 'speedline';
    line.style.left = d.style.left;
    line.style.top = (30 + Math.random() * 40) + '%';
    p.laneTrack.appendChild(line);
    setTimeout(() => { d.remove(); line.remove(); }, 550);
  }

  /* ---------- finish ---------- */
  function finishPlayer(p) {
    p.finishMs = performance.now() - raceStart;
    p.btn.disabled = true;
    p.btn.classList.add('done');
    p.countEl.textContent = '🏁 ' + L.formatFinish(p.finishMs);
    p.avatar.classList.remove('pose-idle', 'pose-run', 'pose-eat');
    p.avatar.classList.add('pose-run');
    positionAvatar(p);   // crosses the line into the safe zone
    const place = players.filter(x => x.finishMs != null).length;
    A.sfx.finish();
    A.announce(p.pick.name + ' finished!', { rate: 1.05, pitch: 0.6 });
    // spotlight + zoom
    const spot = document.createElement('div');
    spot.className = 'spotlight';
    p.laneTrack.appendChild(spot);
    setTimeout(() => spot.remove(), 1000);
    p.lane.classList.add('finish-zoom');
    setTimeout(() => p.lane.classList.remove('finish-zoom'), 750);
    setTimeout(() => {
      p.avatar.classList.remove('pose-run');
      p.avatar.classList.add('pose-cheer');
      const medal = document.createElement('div');
      medal.className = 'medal';
      medal.textContent = L.placeMedal(place - 1);
      p.avatar.appendChild(medal);
      confettiBurst(p);
      p.confettiTimer = setInterval(() => { if (running) confettiBurst(p); }, 1800);
    }, 800);
    if (players.every(x => x.finishMs != null)) setTimeout(allClear, 1400);
  }

  function confettiBurst(p) {
    const lt = p.laneTrack;
    const tx = parseFloat(getComputedStyle(p.avatar).getPropertyValue('--tx')) || 0;
    const colors = ['#ffd23f', '#ff5da2', '#4dc3ff', '#a4e04d', '#ff7a00', '#c792ff'];
    for (let i = 0; i < 14; i++) {
      const c = document.createElement('div');
      c.className = 'confetti-bit';
      c.style.background = colors[i % colors.length];
      c.style.left = (lt.clientWidth * 0.03 + tx + p.avatar.offsetWidth / 2) + 'px';
      c.style.top = '10%';
      c.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px');
      c.style.setProperty('--dy', (40 + Math.random() * 60) + 'px');
      c.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      lt.appendChild(c);
      setTimeout(() => c.remove(), 1500);
    }
  }

  /* ---------- endgame ---------- */
  function stopTimers() {
    clearInterval(clockTimer); clockTimer = null;
    cancelAnimationFrame(burnRAF);
    players.forEach(p => { clearInterval(p.confettiTimer); p.btn.disabled = true; });
    A.musicStop();
  }

  async function allClear() {
    if (!running) return;
    running = false;
    stopTimers();
    A.announce('Everyone made it! Amazing!', { rate: 1.0, pitch: 0.6 });
    await showBanner('ALL CLEAR!', { hold: 1300, style: 'gold' });
    showResults(true);
  }

  async function timeUp() {
    if (!running) return;
    running = false;
    stopTimers();
    setClock(0);
    A.sfx.blast();
    A.announce('Time!', { rate: 0.9, pitch: 0.45 });
    shake(true);
    await showBanner('TIME!', { hold: 1100, style: 'red' });
    fireSweep();
  }

  function fireSweep() {
    fireWave.classList.remove('hidden');
    const arena = $('#arena');
    const sweepMs = 2400;
    fireWave.style.setProperty('--sweep-ms', sweepMs + 'ms');
    void fireWave.offsetWidth;
    fireWave.classList.add('sweep');
    // the fire stops AT the finish line — finishers beyond it stay safe
    const arenaRect = arena.getBoundingClientRect();
    const lt = players[0].laneTrack.getBoundingClientRect();
    const frontTarget = (lt.left - arenaRect.left) + lt.width * 0.86 + 10;
    fireWave.style.transform = `translateX(${frontTarget - fireWave.offsetWidth}px)`;
    const burned = new Set();
    const check = () => {
      const front = fireWave.getBoundingClientRect().right - 20;
      players.forEach(p => {
        if (p.finishMs == null && !burned.has(p)) {
          const r = p.avatar.getBoundingClientRect();
          if (r.left + r.width * 0.5 < front) { burned.add(p); charPlayer(p); }
        }
      });
      if (burned.size < players.filter(p => p.finishMs == null).length) burnRAF = requestAnimationFrame(check);
    };
    burnRAF = requestAnimationFrame(check);
    setTimeout(() => {
      fireWave.classList.add('hidden');
      showResults(false);
    }, sweepMs + 900);
  }

  function charPlayer(p) {
    p.avatar.classList.remove('pose-idle', 'pose-run', 'pose-eat', 'pose-cheer');
    p.avatar.classList.add('pose-charred', 'hitstop');
    setTimeout(() => p.avatar.classList.remove('hitstop'), 200);
    A.sfx.charred();
    const lt = p.laneTrack;
    const tx = parseFloat(getComputedStyle(p.avatar).getPropertyValue('--tx')) || 0;
    for (let i = 0; i < 5; i++) {
      const s = document.createElement('div');
      s.className = 'smoke';
      s.style.left = (lt.clientWidth * 0.03 + tx + p.avatar.offsetWidth * (0.2 + Math.random() * 0.6)) + 'px';
      s.style.top = (20 + Math.random() * 50) + '%';
      s.style.setProperty('--dx', (Math.random() * 30 - 15) + 'px');
      s.style.animationDelay = (i * 140) + 'ms';
      lt.appendChild(s);
      setTimeout(() => s.remove(), 1600 + i * 140);
    }
  }

  /* ---------- results ---------- */
  function showResults(allWon) {
    const { winners, losers } = L.rankResults(players.map(p => ({ p, name: p.pick.name, stars: p.stars, finishMs: p.finishMs })));
    $('#resultsTitle').textContent = allWon ? 'ALL WINNERS!' : (winners.length ? 'RESULTS' : 'EVERYONE GOT TOASTED!');
    const list = $('#resultsList');
    list.innerHTML = '';
    let d = 0;
    winners.forEach((w, i) => list.appendChild(resultRow(w.p, L.placeMedal(i), L.formatFinish(w.finishMs), false, d += 120)));
    losers.forEach((l) => list.appendChild(resultRow(l.p, '🔥', l.stars + ' / ' + Game.config.stars + ' ⭐ — TOASTED!', true, d += 120)));
    $('#resultsModal').classList.remove('hidden');
    A.sfx.jingle();
    if (winners.length) A.announce('The winner is ' + winners[0].name + '!', { rate: 1.0, pitch: 0.55 });
  }

  function resultRow(p, place, timeText, toasted, delay) {
    const row = document.createElement('div');
    row.className = 'result-row' + (toasted ? ' toasted' : '');
    row.style.setProperty('--delay', delay + 'ms');
    row.innerHTML = `<span class="rr-place">${place}</span>
      <span class="rr-avatar ${toasted ? 'pose-charred' : 'pose-cheer'}">${renderCharacter(p.char, { uid: 'r' + p.pick.player })}</span>
      <span class="rr-name">${escapeHtml(p.pick.name)}</span>
      <span class="rr-time">${timeText}</span>`;
    return row;
  }

  $('#rematchBtn').addEventListener('click', () => {
    A.sfx.click();
    $('#resultsModal').classList.add('hidden');
    slashTo(() => Game.onRaceStart());
  });
  $('#newGameBtn').addEventListener('click', () => {
    A.sfx.click();
    $('#resultsModal').classList.add('hidden');
    slashTo(() => { window.UI.showScreen('screen-select'); Game.onSetupShow(); });
  });

  Game.abortRace = function () {
    running = false;
    stopTimers();
    $('#resultsModal').classList.add('hidden');
  };
})();
