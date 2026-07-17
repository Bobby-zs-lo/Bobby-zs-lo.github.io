/* Screen 1: fighter select — config, draggable P-coins, lock-in, ready flow. */
(function () {
  'use strict';
  const { $, showBanner, slashTo, shake, saveConfig } = window.UI;
  const { CHARACTERS, renderCharacter, cardBg } = window.Characters;
  const A = window.GameAudio;
  const Game = window.Game;

  const PCOLORS = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)', 'var(--p5)', 'var(--p6)', 'var(--p7)', 'var(--p8)', 'var(--p9)', 'var(--p10)'];
  let assignments = [];   // player idx -> charId | null
  let names = [];
  try { names = JSON.parse(localStorage.getItem('gsr-names') || '[]') || []; } catch (e) { names = []; }

  const roster = $('#roster'), dock = $('#coinDock');

  /* ---------- roster ---------- */
  function buildRoster() {
    roster.innerHTML = '';
    CHARACTERS.forEach(c => {
      const card = document.createElement('div');
      card.className = 'fighter-card';
      card.dataset.char = c.id;
      card.innerHTML = `<div class="card-bg" style="${cardBg(c)}"></div>
        <div class="portrait pose-idle">${renderCharacter(c)}</div>
        <div class="char-name">${c.name}</div>`;
      card.addEventListener('click', () => onCardTap(c.id));
      roster.appendChild(card);
    });
  }

  const cardOf = (charId) => roster.querySelector(`[data-char="${charId}"]`);
  const charOf = (charId) => CHARACTERS.find(c => c.id === charId);

  /* ---------- P-coins ---------- */
  function buildCoins() {
    dock.innerHTML = '';
    document.querySelectorAll('.fighter-card .stamp, .fighter-card .name-entry, .fighter-card .stamp-flash').forEach(el => el.remove());
    document.querySelectorAll('.fighter-card.locked').forEach(el => el.classList.remove('locked'));
    for (let i = 0; i < Game.config.players; i++) {
      const coin = document.createElement('div');
      coin.className = 'pcoin';
      coin.dataset.player = i;
      coin.style.setProperty('--pcolor', PCOLORS[i]);
      coin.textContent = 'P' + (i + 1);
      makeDraggable(coin);
      dock.appendChild(coin);
      if (assignments[i]) lockIn(i, assignments[i], { silent: true });
    }
    checkReady();
  }

  function makeDraggable(coin) {
    coin.addEventListener('pointerdown', (e) => {
      if (coin.classList.contains('placed')) return;
      e.preventDefault();
      coin.setPointerCapture(e.pointerId);
      const size = coin.offsetWidth;
      coin.classList.add('dragging');
      A.sfx.coinPick();
      const move = (ev) => {
        coin.style.left = (ev.clientX - size / 2) + 'px';
        coin.style.top = (ev.clientY - size / 2) + 'px';
        const card = cardAt(ev.clientX, ev.clientY, coin);
        document.querySelectorAll('.fighter-card.dropTarget').forEach(el => el.classList.remove('dropTarget'));
        if (card && !card.classList.contains('locked')) card.classList.add('dropTarget');
      };
      const up = (ev) => {
        coin.removeEventListener('pointermove', move);
        coin.removeEventListener('pointerup', up);
        coin.removeEventListener('pointercancel', up);
        document.querySelectorAll('.fighter-card.dropTarget').forEach(el => el.classList.remove('dropTarget'));
        const card = cardAt(ev.clientX, ev.clientY, coin);
        coin.classList.remove('dragging');
        coin.style.left = coin.style.top = '';
        if (card && !card.classList.contains('locked')) {
          lockIn(+coin.dataset.player, card.dataset.char);
        }
      };
      coin.addEventListener('pointermove', move);
      coin.addEventListener('pointerup', up);
      coin.addEventListener('pointercancel', up);
    });
  }

  function cardAt(x, y, coin) {
    coin.style.visibility = 'hidden';
    const el = document.elementFromPoint(x, y);
    coin.style.visibility = '';
    return el ? el.closest('.fighter-card') : null;
  }

  /* tap a free card → assign the first unplaced coin (touch-friendly shortcut) */
  function onCardTap(charId) {
    const card = cardOf(charId);
    if (card.classList.contains('locked')) return;
    const free = [...dock.querySelectorAll('.pcoin:not(.placed)')][0];
    if (free) lockIn(+free.dataset.player, charId);
  }

  /* ---------- lock in / unlock ---------- */
  function lockIn(playerIdx, charId, { silent = false } = {}) {
    const card = cardOf(charId);
    const c = charOf(charId);
    if (!card || card.classList.contains('locked')) return;
    assignments[playerIdx] = charId;
    card.classList.add('locked');
    card.style.setProperty('--pcolor', PCOLORS[playerIdx]);

    const coin = dock.querySelector(`.pcoin[data-player="${playerIdx}"]`);
    const stampSlot = document.createElement('div');
    stampSlot.className = 'stamp';
    stampSlot.appendChild(coin);
    coin.classList.add('placed');
    card.appendChild(stampSlot);
    stampSlot.addEventListener('click', (e) => { e.stopPropagation(); unlock(playerIdx, charId); });

    const nameWrap = document.createElement('div');
    nameWrap.className = 'name-entry';
    nameWrap.innerHTML = `<input type="text" maxlength="14" placeholder="P${playerIdx + 1} NAME" value="${(names[playerIdx] || '').replace(/"/g, '')}">`;
    const input = nameWrap.querySelector('input');
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('input', () => { names[playerIdx] = input.value; localStorage.setItem('gsr-names', JSON.stringify(names)); });
    card.appendChild(nameWrap);

    if (!silent) {
      const flash = document.createElement('div');
      flash.className = 'stamp-flash';
      card.appendChild(flash);
      setTimeout(() => flash.remove(), 420);
      const portrait = card.querySelector('.portrait');
      portrait.classList.remove('pose-idle'); portrait.classList.add('pose-cheer');
      setTimeout(() => { portrait.classList.remove('pose-cheer'); portrait.classList.add('pose-idle'); }, 1600);
      A.sfx.stamp();
      setTimeout(() => A.sfx.lockFanfare(), 130);
      A.announce(c.name + '!', { rate: 0.95, pitch: 0.5 });
      shake();
    }
    checkReady();
  }

  function unlock(playerIdx, charId) {
    const card = cardOf(charId);
    assignments[playerIdx] = null;
    card.classList.remove('locked');
    const coin = card.querySelector('.pcoin');
    coin.classList.remove('placed');
    // return coin to its dock position (player order)
    const after = [...dock.querySelectorAll('.pcoin')].find(el => +el.dataset.player > playerIdx);
    dock.insertBefore(coin, after || null);
    card.querySelector('.stamp')?.remove();
    card.querySelector('.name-entry')?.remove();
    A.sfx.unlock();
    checkReady();
  }

  function checkReady() {
    let ready = true;
    for (let i = 0; i < Game.config.players; i++) if (!assignments[i]) ready = false;
    const btn = $('#readyBtn');
    const wasHidden = btn.classList.contains('hidden');
    btn.classList.toggle('hidden', !ready);
    if (ready && wasHidden) { A.sfx.ready(); A.say('ready'); }
  }

  /* ---------- config bar ---------- */
  function syncConfigUI() {
    $('#playersOut').value = Game.config.players;
    $('#starsIn').value = Game.config.stars;
    $('#minIn').value = Game.config.minutes;
    $('#secIn').value = String(Game.config.seconds).padStart(2, '0');
  }
  function readConfig() {
    Game.config = window.Logic.validateConfig({
      players: +$('#playersOut').value,
      stars: +$('#starsIn').value,
      minutes: +$('#minIn').value,
      seconds: +$('#secIn').value,
    });
    saveConfig();
    syncConfigUI();
  }
  $('#playersMinus').addEventListener('click', () => { A.sfx.click(); $('#playersOut').value = Game.config.players - 1; readConfig(); buildCoins(); });
  $('#playersPlus').addEventListener('click', () => { A.sfx.click(); $('#playersOut').value = Game.config.players + 1; readConfig(); buildCoins(); });
  ['starsIn', 'minIn', 'secIn'].forEach(id => $('#' + id).addEventListener('change', readConfig));

  /* ---------- start the race ---------- */
  $('#readyBtn').addEventListener('click', () => {
    readConfig();
    Game.picks = [];
    for (let i = 0; i < Game.config.players; i++) {
      const nm = (names[i] || '').trim();
      Game.picks.push({ player: i, charId: assignments[i], name: nm || 'P' + (i + 1), color: PCOLORS[i] });
    }
    $('#readyBtn').classList.add('hidden');
    slashTo(() => {
      window.UI.showScreen('screen-race');
      Game.onRaceStart();
    });
  });

  Game.onSetupShow = () => { syncConfigUI(); checkReady(); };

  /* init */
  buildRoster();
  syncConfigUI();
  buildCoins();
})();
