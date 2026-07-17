/* App shell: shared state, screen switching, banner / slash / shake helpers. */
(function () {
  'use strict';
  const $ = (sel) => document.querySelector(sel);

  const Game = {
    config: { players: 2, stars: 5, minutes: 10, seconds: 0 },
    // per player index: { charId, name } once locked in
    picks: [],
    onRaceStart: null,   // set by race.js
    onSetupShow: null,   // set by select.js
  };

  /* restore last-used settings */
  try {
    const saved = JSON.parse(localStorage.getItem('gsr-config') || 'null');
    if (saved) Game.config = window.Logic.validateConfig(saved);
  } catch (e) { /* fresh start */ }

  function saveConfig() { localStorage.setItem('gsr-config', JSON.stringify(Game.config)); }

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  }

  /* big Smash-style announcement banner; returns after it disappears */
  function showBanner(text, { hold = 900, style = '' } = {}) {
    return new Promise((resolve) => {
      const b = $('#banner'), t = $('#bannerText');
      t.textContent = text;
      b.className = 'big-banner ' + style;
      b.classList.remove('hidden');
      setTimeout(() => {
        b.classList.add('out');
        setTimeout(() => { b.classList.add('hidden'); resolve(); }, 240);
      }, hold);
    });
  }

  /* slash transition: fires cb at the midpoint (screen fully covered) */
  function slashTo(cb) {
    const s = $('#slash');
    s.classList.remove('hidden');
    s.classList.add('play');
    window.GameAudio.sfx.slash();
    setTimeout(cb, 330);
    setTimeout(() => { s.classList.remove('play'); s.classList.add('hidden'); }, 760);
  }

  function shake(big = false) {
    const app = $('#app');
    const cls = big ? 'shake-big' : 'shake';
    app.classList.remove('shake', 'shake-big');
    void app.offsetWidth;   // restart animation
    app.classList.add(cls);
  }

  /* mute buttons (one on each screen) */
  function syncMuteBtns() {
    const m = window.GameAudio.isMuted();
    document.querySelectorAll('.mute-btn').forEach(b => {
      b.textContent = m ? '🔇' : '🔊';
      b.classList.toggle('muted', m);
    });
  }
  document.querySelectorAll('.mute-btn').forEach(b => b.addEventListener('click', () => {
    window.GameAudio.setMuted(!window.GameAudio.isMuted());
    window.GameAudio.unlock();
    syncMuteBtns();
  }));
  syncMuteBtns();

  /* announcer language toggle (DA/EN) */
  function syncLangBtns() {
    const l = window.GameAudio.getLang();
    document.querySelectorAll('.lang-btn').forEach(b => { b.textContent = l.toUpperCase(); });
  }
  document.querySelectorAll('.lang-btn').forEach(b => b.addEventListener('click', () => {
    window.GameAudio.unlock();
    window.GameAudio.setLang(window.GameAudio.getLang() === 'da' ? 'en' : 'da');
    syncLangBtns();
  }));
  syncLangBtns();

  /* unlock audio on first interaction anywhere */
  document.addEventListener('pointerdown', () => window.GameAudio.unlock(), { once: true });

  /* quit confirmation */
  $('#quitBtn').addEventListener('click', () => { window.GameAudio.sfx.click(); $('#confirmQuit').classList.remove('hidden'); });
  $('#quitNo').addEventListener('click', () => { window.GameAudio.sfx.click(); $('#confirmQuit').classList.add('hidden'); });
  $('#quitYes').addEventListener('click', () => {
    window.GameAudio.sfx.click();
    $('#confirmQuit').classList.add('hidden');
    if (Game.abortRace) Game.abortRace();
    slashTo(() => { showScreen('screen-select'); if (Game.onSetupShow) Game.onSetupShow(); });
  });

  window.Game = Game;
  window.UI = { $, showScreen, showBanner, slashTo, shake, saveConfig, syncMuteBtns };
})();
