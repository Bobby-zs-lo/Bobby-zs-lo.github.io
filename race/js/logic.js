/* Pure game logic — no DOM. Exposed as window.Logic (browser) / module.exports (node tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Logic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  /** Fraction of the track covered with `stars` of `target` collected (0..1). */
  const progressFrac = (stars, target) => target <= 0 ? 1 : clamp(stars / target, 0, 1);

  /** Seconds → "MM:SS" for the countdown clock (never negative). */
  function formatClock(totalSeconds) {
    const s = Math.max(0, Math.ceil(totalSeconds));
    const m = Math.floor(s / 60);
    return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  /** Elapsed ms → "M:SS.t" finish time. */
  function formatFinish(ms) {
    const t = Math.max(0, ms);
    const m = Math.floor(t / 60000);
    const s = Math.floor((t % 60000) / 1000);
    const tenth = Math.floor((t % 1000) / 100);
    return m + ':' + String(s).padStart(2, '0') + '.' + tenth;
  }

  /** Sanitize config values. */
  function validateConfig(cfg) {
    return {
      players: clamp(Math.round(cfg.players) || 1, 1, 10),
      stars: clamp(Math.round(cfg.stars) || 1, 1, 50),
      minutes: clamp(Math.round(cfg.minutes) || 0, 0, 120),
      seconds: clamp(Math.round(cfg.seconds) || 0, 0, 59),
    };
  }

  /** Total race time in seconds; enforces a 5s minimum. */
  const totalSeconds = (cfg) => Math.max(5, cfg.minutes * 60 + cfg.seconds);

  /**
   * Rank players for the results screen.
   * players: [{ name, stars, finishMs|null }]
   * Returns { winners: sorted by finishMs asc, losers: sorted by stars desc }.
   */
  function rankResults(players) {
    const winners = players.filter(p => p.finishMs != null)
      .sort((a, b) => a.finishMs - b.finishMs);
    const losers = players.filter(p => p.finishMs == null)
      .sort((a, b) => b.stars - a.stars);
    return { winners, losers };
  }

  const PLACE_MEDALS = ['🥇', '🥈', '🥉'];
  const placeMedal = (i) => PLACE_MEDALS[i] || (i + 1) + '.';

  return { clamp, progressFrac, formatClock, formatFinish, validateConfig, totalSeconds, rankResults, placeMedal };
});
