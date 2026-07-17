/* Screen 2: the adventure — each star press slays the lane's slime, the world scrolls
   forward one segment (idle-game style: one enemy on screen + a progress rail).
   Timer expiry: the slime strikes back and knocks out the avatar. */
(function () {
  'use strict';
  const { $, showBanner, slashTo, shake } = window.UI;
  const L = window.Logic;
  const { renderCharacter } = window.Characters;
  const A = window.GameAudio;
  const Game = window.Game;

  const SEG = 260;               // world px scrolled per slain slime
  const track = $('#track'), clock = $('#clock');
  let players = [];
  let running = false, raceStart = 0, endAt = 0;
  let clockTimer = null, lastTickSec = -1;
  let raceGen = 0;               // invalidates in-flight animation chains on rebuild/quit

  const charById = (id) => window.Characters.CHARACTERS.find(c => c.id === id);
  const MOB_KEYS = Object.keys(window.MOBS);
  const randMob = () => window.MOBS[MOB_KEYS[Math.floor(Math.random() * MOB_KEYS.length)]];
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  /* ---------- build ---------- */
  function buildTrack() {
    raceGen++;
    const backdrop = window.BACKDROPS[Math.floor(Math.random() * window.BACKDROPS.length)];
    $('#arenaBackdrop').style.backgroundImage = `url(${backdrop.arena})`;
    track.innerHTML = '';
    players = Game.picks.map((pick) => {
      const char = charById(pick.charId);
      const lane = document.createElement('div');
      lane.className = 'lane';
      lane.style.setProperty('--pcolor', pick.color);
      const N = Game.config.stars;
      lane.innerHTML = `
        <button type="button" class="star-btn" style="--pcolor:${pick.color}">
          <span class="sb-star">⭐</span>
          <span class="sb-info"><span class="sb-name">${escapeHtml(pick.name)}</span><span class="sb-count">0 / ${N}</span></span>
        </button>
        <div class="lane-track">
          <div class="bg-scroll" style="background-image:url(${backdrop.strip})"></div>
          <div class="rail"${N <= 14 ? ` style="background-image:linear-gradient(90deg,transparent calc(100% - 2px),rgba(255,255,255,.35) 0);background-size:${100 / N}% 100%"` : ''}>
            <div class="rail-fill" style="width:0%"></div>
          </div>
          <span class="rail-flag">🏁</span>
          <div class="avatar pose-idle" style="aspect-ratio:${char.anims.idle.ar}">${renderCharacter(char)}</div>
          <div class="slime-slot"></div>
        </div>`;
      track.appendChild(lane);
      const p = {
        pick, char, stars: 0, kills: 0, finishMs: null,
        queue: 0, busy: false, mob: null,
        lane,
        laneTrack: lane.querySelector('.lane-track'),
        bgScroll: lane.querySelector('.bg-scroll'),
        railFill: lane.querySelector('.rail-fill'),
        avatar: lane.querySelector('.avatar'),
        slot: lane.querySelector('.slime-slot'),
        btn: lane.querySelector('.star-btn'),
        countEl: lane.querySelector('.sb-count'),
      };
      p.btn.addEventListener('click', () => addStar(p));
      return p;
    });
    players.forEach(p => { sizeActors(p); layoutScroll(p); spawnSlime(p, true); });
    $('#goalStars').textContent = Game.config.stars;
  }

  function escapeHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function sizeActors(p) {
    const lt = p.laneTrack;
    const ar = p.char.anims.idle.ar;
    const maxW = Math.min(lt.clientWidth * 0.26, 165);
    const h = Math.min(lt.clientHeight * 0.82, maxW / ar);
    p.avatar.style.height = h + 'px';
    p.slot.style.height = Math.max(38, Math.min(lt.clientHeight * 0.52, h * 0.78)) + 'px';
  }

  function layoutScroll(p) {
    const w = p.laneTrack.clientWidth + (Game.config.stars + 2) * SEG;
    p.bgScroll.style.width = w + 'px';
    setScroll(p, true);
  }

  function setScroll(p, instant = false) {
    if (instant) p.bgScroll.style.transition = 'none';
    p.bgScroll.style.transform = `translateX(${-p.kills * SEG}px)`;
    if (instant) { void p.bgScroll.offsetWidth; p.bgScroll.style.transition = ''; }
  }

  window.addEventListener('resize', () => players.forEach(p => { sizeActors(p); layoutScroll(p); }));

  /* ---------- slimes ---------- */
  function spawnSlime(p, initial = false) {
    p.mob = randMob();
    p.slot.innerHTML = renderCharacter(p.mob);
    p.slot.className = 'slime-slot pose-idle';
    if (!initial) {
      p.slot.classList.add('enter');
      p.slot.classList.replace('pose-idle', 'pose-run');
      void p.slot.offsetWidth;
      p.slot.classList.remove('enter');
      setTimeout(() => { if (p.slot.classList.contains('pose-run')) p.slot.classList.replace('pose-run', 'pose-idle'); }, 650);
    }
  }

  /* ---------- sparring: avatar and slime trade blows while waiting ---------- */
  function startSpar(p) {
    clearTimeout(p.sparTimer);
    const loop = () => {
      spar(p);
      p.sparTimer = setTimeout(loop, 2400 + Math.random() * 1400);
    };
    p.sparTimer = setTimeout(loop, 500 + Math.random() * 1600);
  }

  function spar(p) {
    const gen = raceGen;
    const ok = () => gen === raceGen && running && !p.busy && p.queue === 0 && p.finishMs == null;
    if (!ok()) return;
    // avatar jab
    p.avatar.classList.remove('pose-idle', 'pose-eat');
    void p.avatar.offsetWidth;
    p.avatar.classList.add('pose-eat');
    setTimeout(() => {
      if (!ok()) return;
      p.slot.classList.add('hitstop');
      setTimeout(() => p.slot.classList.remove('hitstop'), 150);
    }, 280);
    setTimeout(() => {
      if (!ok()) return;
      p.avatar.classList.remove('pose-eat');
      p.avatar.classList.add('pose-idle');
    }, 750);
    // slime strikes back (no damage — just the brawl)
    setTimeout(() => {
      if (!ok()) return;
      p.slot.className = 'slime-slot pose-eat';
    }, 1250);
    setTimeout(() => {
      if (!ok()) return;
      p.avatar.classList.add('recoil');
      setTimeout(() => p.avatar.classList.remove('recoil'), 380);
    }, 1650);
    setTimeout(() => {
      if (!ok()) return;
      p.slot.className = 'slime-slot pose-idle';
    }, 2150);
  }

  /* ---------- race start ---------- */
  Game.onRaceStart = async function () {
    buildTrack();
    setClock(L.totalSeconds(Game.config));
    clock.classList.remove('warn');
    await showBanner('READY?', { hold: 950, style: 'gold' });
    A.sfx.count();
    A.say('go');
    await showBanner('GO!', { hold: 700, style: '' });
    A.sfx.go();
    shake();
    running = true;
    raceStart = performance.now();
    endAt = raceStart + L.totalSeconds(Game.config) * 1000;
    lastTickSec = -1;
    clockTimer = setInterval(tickClock, 150);
    A.musicStart();
    players.forEach(startSpar);
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

  /* ---------- star feeding & slime slaying ---------- */
  function addStar(p) {
    if (!running || p.stars >= Game.config.stars) return;
    A.sfx.press();
    p.btn.classList.add('pressed');
    setTimeout(() => p.btn.classList.remove('pressed'), 120);
    p.stars++;
    p.countEl.textContent = p.stars + ' / ' + Game.config.stars;
    if (p.stars >= Game.config.stars) {           // finish counts from the press, not the animation
      p.finishMs = performance.now() - raceStart;
      p.btn.disabled = true;
      p.btn.classList.add('done');
      p.countEl.textContent = '🏁 ' + L.formatFinish(p.finishMs);
    }
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
    const dy = (to.top + to.height * 0.3) - (from.top + from.height / 2 - 14);
    star.animate([
      { transform: 'translate(0,0) scale(1) rotate(0deg)' },
      { transform: `translate(${dx * 0.55}px, ${dy - 60}px) scale(1.35) rotate(200deg)`, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(.7) rotate(380deg)` },
    ], { duration: 520, easing: 'cubic-bezier(.3,.2,.4,1)' }).onfinish = () => {
      star.remove();
      A.sfx.collect();
      p.queue++;
      processQueue(p);
    };
  }

  function processQueue(p) {
    if (p.busy || p.queue === 0) return;
    p.busy = true;
    p.queue--;
    killSequence(p).then(() => {
      p.busy = false;
      processQueue(p);
    });
  }

  async function killSequence(p) {
    const gen = raceGen;
    const alive = () => gen === raceGen && (running || p.finishMs != null);
    if (!alive()) return;
    // avatar attacks (restart the strip even if a sparring jab is mid-swing)
    p.avatar.classList.remove('pose-idle', 'pose-run', 'pose-eat', 'recoil');
    void p.avatar.offsetWidth;
    p.avatar.classList.add('pose-eat');
    p.slot.className = 'slime-slot pose-idle';
    await sleep(260);
    if (!alive()) return;
    // impact on slime
    A.sfx.smack();
    p.slot.classList.add('hitstop');
    p.slot.className = p.slot.className.replace(/pose-\w+/, 'pose-hurt');
    sparkleBurst(p, p.slot);
    await sleep(240);
    if (!alive()) return;
    // slime dies
    p.slot.classList.remove('hitstop');
    p.slot.className = p.slot.className.replace(/pose-\w+/, 'pose-charred');
    A.sfx.squish();
    p.kills++;
    await sleep(620);
    if (!alive()) return;
    // world scrolls forward
    p.slot.classList.add('gone');
    p.avatar.classList.remove('pose-eat');
    p.avatar.classList.add('pose-run');
    setScroll(p);
    p.railFill.style.width = (p.kills / Game.config.stars * 100) + '%';
    const dust = setInterval(() => spawnDust(p), 140);
    await sleep(880);
    clearInterval(dust);
    if (!alive()) return;
    p.avatar.classList.remove('pose-run');
    p.avatar.classList.add('pose-idle');
    if (p.kills >= Game.config.stars) { finishCelebrate(p); return; }
    spawnSlime(p);
    await sleep(400);
  }

  /* ---------- finish ---------- */
  function finishCelebrate(p) {
    const place = players.filter(x => x.finishMs != null && x.finishMs <= p.finishMs).length;
    A.sfx.finish();
    A.say('finished', p.pick.name);
    const spot = document.createElement('div');
    spot.className = 'spotlight';
    p.laneTrack.appendChild(spot);
    setTimeout(() => spot.remove(), 1000);
    p.lane.classList.add('finish-zoom');
    setTimeout(() => p.lane.classList.remove('finish-zoom'), 750);
    p.avatar.classList.remove('pose-idle', 'pose-run', 'pose-eat');
    p.avatar.classList.add('pose-cheer');
    const medal = document.createElement('div');
    medal.className = 'medal';
    medal.textContent = L.placeMedal(place - 1);
    p.avatar.appendChild(medal);
    confettiBurst(p);
    p.confettiTimer = setInterval(() => { if (running) confettiBurst(p); }, 1800);
    if (players.every(x => x.finishMs != null)) setTimeout(allClear, 1200);
  }

  /* ---------- FX ---------- */
  function sparkleBurst(p, el) {
    const r = el.getBoundingClientRect(), lt = p.laneTrack.getBoundingClientRect();
    for (let i = 0; i < 8; i++) {
      const s = document.createElement('div');
      s.className = 'sparkle';
      s.style.left = (r.left - lt.left + r.width / 2) + 'px';
      s.style.top = (r.top - lt.top + r.height * 0.4) + 'px';
      const a = Math.random() * Math.PI * 2, d = 24 + Math.random() * 30;
      s.style.setProperty('--dx', Math.cos(a) * d + 'px');
      s.style.setProperty('--dy', Math.sin(a) * d + 'px');
      p.laneTrack.appendChild(s);
      setTimeout(() => s.remove(), 600);
    }
  }

  function spawnDust(p) {
    const x = p.avatar.offsetLeft + p.avatar.offsetWidth * 0.15;
    const d = document.createElement('div');
    d.className = 'dust';
    d.style.left = x + 'px';
    p.laneTrack.appendChild(d);
    const line = document.createElement('div');
    line.className = 'speedline';
    line.style.left = (x + 30) + 'px';
    line.style.top = (30 + Math.random() * 40) + '%';
    p.laneTrack.appendChild(line);
    setTimeout(() => { d.remove(); line.remove(); }, 550);
  }

  function confettiBurst(p) {
    const colors = ['#ffd23f', '#ff5da2', '#4dc3ff', '#a4e04d', '#ff7a00', '#c792ff'];
    const x = p.avatar.offsetLeft + p.avatar.offsetWidth / 2;
    for (let i = 0; i < 14; i++) {
      const c = document.createElement('div');
      c.className = 'confetti-bit';
      c.style.background = colors[i % colors.length];
      c.style.left = x + 'px';
      c.style.top = '8%';
      c.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px');
      c.style.setProperty('--dy', (40 + Math.random() * 60) + 'px');
      c.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      p.laneTrack.appendChild(c);
      setTimeout(() => c.remove(), 1500);
    }
  }

  /* ---------- endgame ---------- */
  function stopTimers() {
    clearInterval(clockTimer); clockTimer = null;
    players.forEach(p => { clearInterval(p.confettiTimer); clearTimeout(p.sparTimer); p.btn.disabled = true; });
    A.musicStop();
  }

  async function allClear() {
    if (!running) return;
    running = false;
    stopTimers();
    A.say('allclear');
    await showBanner('ALL CLEAR!', { hold: 1300, style: 'gold' });
    showResults(true);
  }

  async function timeUp() {
    if (!running) return;
    running = false;
    stopTimers();
    setClock(0);
    A.sfx.blast();
    A.say('time');
    shake(true);
    await showBanner('TIME!', { hold: 1100, style: 'red' });
    const losers = players.filter(p => p.finishMs == null);
    losers.forEach((p, i) => setTimeout(() => slimeStrikes(p), i * 220));
    setTimeout(() => showResults(false), 1600 + losers.length * 220 + 1200);
  }

  /* the slime gets its revenge */
  function slimeStrikes(p) {
    p.queue = 0;
    const dist = p.slot.offsetLeft - (p.avatar.offsetLeft + p.avatar.offsetWidth * 0.55);
    p.slot.className = 'slime-slot pose-eat lunge';
    p.slot.style.setProperty('--lunge', -Math.max(0, dist) + 'px');
    setTimeout(() => {
      A.sfx.smack();
      shake();
      p.avatar.classList.remove('pose-idle', 'pose-run', 'pose-eat', 'pose-cheer');
      p.avatar.classList.add('pose-charred', 'hitstop');
      setTimeout(() => p.avatar.classList.remove('hitstop'), 200);
      A.sfx.charred();
      for (let i = 0; i < 5; i++) {
        const s = document.createElement('div');
        s.className = 'smoke';
        s.style.left = (p.avatar.offsetLeft + p.avatar.offsetWidth * (0.2 + Math.random() * 0.6)) + 'px';
        s.style.top = (20 + Math.random() * 50) + '%';
        s.style.setProperty('--dx', (Math.random() * 30 - 15) + 'px');
        s.style.animationDelay = (i * 140) + 'ms';
        p.laneTrack.appendChild(s);
        setTimeout(() => s.remove(), 1600 + i * 140);
      }
      setTimeout(() => { p.slot.classList.remove('pose-eat'); p.slot.classList.add('pose-idle'); }, 700);
    }, 430);
  }

  /* ---------- results ---------- */
  function showResults(allWon) {
    const { winners, losers } = L.rankResults(players.map(p => ({ p, name: p.pick.name, stars: p.stars, finishMs: p.finishMs })));
    $('#resultsTitle').textContent = allWon ? 'ALL WINNERS!' : (winners.length ? 'RESULTS' : 'EVERYONE GOT SLIMED!');
    const list = $('#resultsList');
    list.innerHTML = '';
    let d = 0;
    winners.forEach((w, i) => list.appendChild(resultRow(w.p, L.placeMedal(i), L.formatFinish(w.finishMs), false, d += 120)));
    losers.forEach((l) => list.appendChild(resultRow(l.p, '🟢', l.stars + ' / ' + Game.config.stars + ' ⭐ — SLIMED!', true, d += 120)));
    $('#resultsModal').classList.remove('hidden');
    A.sfx.jingle();
    if (winners.length) A.say('winner', winners[0].name);
  }

  function resultRow(p, place, timeText, toasted, delay) {
    const row = document.createElement('div');
    row.className = 'result-row' + (toasted ? ' toasted' : '');
    row.style.setProperty('--delay', delay + 'ms');
    row.innerHTML = `<span class="rr-place">${place}</span>
      <span class="rr-avatar ${toasted ? 'pose-charred' : 'pose-cheer'}">${renderCharacter(p.char)}</span>
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
    raceGen++;
    stopTimers();
    $('#resultsModal').classList.add('hidden');
  };
})();
