// Overview (desk only): the whole training picture on one wide screen, cross-filtered like a
// BI report. The filters live in the hash (p = period, s = sport, w = a picked week's Monday),
// so a view can be bookmarked; changing one rewrites the hash with replaceState and repaints
// the tiles in place, so the page neither reloads nor loses its scroll position.
//
// Data: /api/state and /api/plan from the store, then activities (with a warm-up before the
// period for the load curves and a full year for the calendar), health, and lazily the route
// lines for the maps. Each response is kept for the visit (the next visit, or another user
// after a sign-out, starts afresh), a narrower period reuses a wider one, and a failing request
// empties only the tiles that need it.
import { html, mount, toString } from '../dom.js';
import { api } from '../api.js';
import { getState, getPlan } from '../store.js';
import { buildHash } from '../router.js';
import { addDays, copenhagenToday, formatDate, mondayOf } from '../format.js';
import { periodRange, YEAR_DAYS } from '../analytics.js';
import { buildModel } from './overview-model.js';
import {
  head, summaryLine, scopeLine, shortDate, raceKpi, weekKpi, hitKpi, easyKpi, formKpi, phaseKpi, healthTile, nextTile,
} from './tiles.js';
import { volumeTile, zonesTile, efficiencyTile, loadTile, calendarTile } from './tiles-charts.js';
import { tableTile, firstDirection, isSortKey, TABLE_PAGE } from './tiles-table.js';
import { mapTiles, heatShell, lastShell } from './tiles-map.js';

const PERIODS = [['4w', '4 weeks'], ['12w', '12 weeks'], ['season', 'Season'], ['1y', '1 year'], ['all', 'All']];
const SPORTS = [['run', 'Running'], ['ride', 'Riding'], ['all', 'Everything']];
const DEFAULTS = { p: '12w', s: 'run' };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const WARMUP_DAYS = 90;   // fitness is a 42-day average: three months lets it settle before the period starts
const ALL_FROM = '2000-01-01';
const RESIZE_STEP_PX = 4; // smaller width changes are rounding noise, not worth a redraw

// [id, span, label, painter]. DOM order is focus order: KPIs, then charts, then the table.
const TILES = [
  ['kpi-race', 2, 'Days to race', raceKpi], ['kpi-week', 2, 'This week', weekKpi], ['kpi-hit', 2, 'Plan hit', hitKpi],
  ['kpi-easy', 2, 'Easy runs too fast', easyKpi], ['kpi-form', 2, 'Fitness · form', formKpi], ['kpi-phase', 2, 'Phase', phaseKpi],
  ['volume', 8, 'Weekly volume', volumeTile], ['heat', 4, 'Heatmap', null],
  ['zones', 4, 'Pace zones', zonesTile], ['eff', 4, 'Efficiency', efficiencyTile], ['load', 4, 'Fitness and form', loadTile],
  ['cal', 8, 'Consistency', calendarTile], ['health', 4, 'Health', healthTile],
  ['last', 6, 'Last activity', null], ['next', 6, 'Next run', nextTile],
  ['table', 12, 'Activities', null],
];
const CHART_TILES = new Set(['volume', 'zones', 'eff', 'load', 'cal', 'health']);

// --- request session ---------------------------------------------------------------

const PATHS = { acts: '/api/activities', health: '/api/health', routes: '/api/activities' };

/**
 * The requests of one visit, made through `get(url)`. `load(kind, from, to)` resolves that
 * kind's rows between the dates, reusing a response that already covers them. render() makes
 * one per visit: a module-level cache outlived the visit, so it served the last visit's data
 * (after a sign-out, the last user's) and grew for as long as the tab stayed open.
 */
export function createSession(get) {
  const cache = new Map(); // URL → promise of the rows; a failure is dropped, so the next load retries
  const spans = { acts: [], health: [], routes: [] }; // what each kind's responses cover

  function fetchOnce(url) {
    if (!cache.has(url)) cache.set(url, get(url).catch(e => { cache.delete(url); throw e; }));
    return cache.get(url);
  }

  function load(kind, from, to) {
    const hit = spans[kind].find(s => s.from <= from && s.to >= to);
    const url = hit ? hit.url : `${PATHS[kind]}?from=${from}&to=${to}${kind === 'routes' ? '&with=polyline' : ''}`;
    return fetchOnce(url).then(rows => {
      if (!spans[kind].some(s => s.url === url)) spans[kind].push({ from, to, url });
      return Array.isArray(rows) ? rows : [];
    });
  }

  return { load };
}

const minDate = (a, b) => (a < b ? a : b);
const maxDate = (a, b) => (a > b ? a : b);

/** The dates each request must cover for these filters. */
function windows(p, today, plan) {
  const from = p === 'all' ? ALL_FROM : periodRange(p, today, plan).from;
  return {
    // A year and a quarter whatever the period: the calendar always shows a year, and the
    // four short periods then share one cached response.
    acts: minDate(addDays(from, -WARMUP_DAYS), addDays(today, -(YEAR_DAYS + WARMUP_DAYS))),
    health: maxDate(from, addDays(today, -YEAR_DAYS)),
  };
}

function readFilters(params = {}) {
  const p = PERIODS.some(([k]) => k === params.p) ? params.p : DEFAULTS.p;
  const s = SPORTS.some(([k]) => k === params.s) ? params.s : DEFAULTS.s;
  const w = ISO.test(params.w || '') && mondayOf(params.w) === params.w ? params.w : null;
  return { p, s, w };
}

// --- markup ----------------------------------------------------------------------

const chips = (attr, options, current) => options.map(([key, label]) =>
  html`<button type="button" class="chip-btn" data-${attr}="${key}" aria-pressed="${key === current}">${label}</button>`);

function shell(f) {
  return html`
    <header class="ov-head">
      <div class="ov-head-main">
        <p class="eyebrow" data-dateline>Desk</p>
        <h1>Overview</h1>
        <p class="ov-summary" data-summary>Loading your training…</p>
      </div>
      <p class="ov-scope" data-scope aria-live="polite"></p>
    </header>
    <div class="filters ov-filters">
      <div role="group" aria-labelledby="ov-f-p"><span class="filters-label" id="ov-f-p">Range</span>${chips('period', PERIODS, f.p)}</div>
      <div role="group" aria-labelledby="ov-f-s"><span class="filters-label" id="ov-f-s">Sport</span>${chips('sport', SPORTS, f.s)}</div>
      <div role="group" aria-labelledby="ov-f-w" data-week-group hidden><span class="filters-label" id="ov-f-w">Focus</span>
        <button type="button" class="chip-btn ov-chip-week" data-clear-week="chip" aria-pressed="true"></button></div>
    </div>
    <div class="dash ov" aria-busy="true">
      ${TILES.map(([id, span, label]) => html`<section class="tile tile--span-${span} ov-tile ov-tile--${id.startsWith('kpi') ? 'kpi' : id}" id="ov-${id}" aria-labelledby="ov-${id}-h">
        ${id === 'heat' ? heatShell(`ov-${id}`) : id === 'last' ? lastShell(`ov-${id}`) : html`${head(`ov-${id}`, label)}<p class="ov-loading">Loading…</p>`}
      </section>`)}
    </div>
    <footer class="ov-foot">Powered by Strava · Maps © OpenStreetMap contributors</footer>`;
}

// --- view --------------------------------------------------------------------------

export function render(el, ctx) {
  let filters = readFilters(ctx.params);
  let base = null;            // { today, settings, plan, errors }
  let model = null;
  let seq = 0, disposed = false, lastWidth = 0, frame = 0;
  const table = { sort: { key: 'date', dir: 'desc' }, all: false };
  // Filter changes within this visit reuse its responses; the next visit asks again.
  const session = createSession(url => api.get(url));

  mount(el, shell(filters));
  const dash = el.querySelector('.dash');
  const $ = sel => el.querySelector(sel);
  const maps = mapTiles(el, {
    loadRoutes: from => session.load('routes', from, base.today),
    openActivity: id => { location.hash = `#/activity/${encodeURIComponent(id)}`; },
  });

  async function loadBase() {
    const [st, pl] = await Promise.allSettled([getState(), getPlan()]);
    const errors = {};
    if (st.status === 'rejected') errors.state = st.reason;
    if (pl.status === 'rejected') errors.plan = pl.reason;
    const state = st.value || {};
    return { today: ISO.test(state.today || '') ? state.today : copenhagenToday(), settings: state.settings || {}, plan: pl.value || null, errors };
  }

  async function refresh(focus) {
    const my = ++seq;
    dash.setAttribute('aria-busy', 'true');
    if (!base) base = await loadBase();
    const need = windows(filters.p, base.today, base.plan);
    const [acts, health] = await Promise.allSettled([session.load('acts', need.acts, base.today), session.load('health', need.health, base.today)]);
    if (disposed || my !== seq || !ctx.isCurrent()) return;
    const errors = { ...base.errors };
    if (acts.status === 'rejected') errors.acts = acts.reason;
    if (health.status === 'rejected') errors.health = health.reason;
    model = buildModel({
      today: base.today, settings: base.settings, plan: base.plan, filters, errors,
      acts: acts.value || [], health: health.value || [],
    });
    if (filters.w && !model.sel) { filters = { ...filters, w: null }; writeHash(); syncFilters(); }
    paint();
    dash.setAttribute('aria-busy', 'false');
    restoreFocus(focus);
  }

  // Data and model failures are already per tile; this catches only a bug in the view itself.
  function update(focus) {
    refresh(focus).catch(e => {
      if (disposed) return;
      dash.setAttribute('aria-busy', 'false');
      $('[data-summary]').textContent = `Couldn’t build the overview. ${e.message || ''}`.trim();
    });
  }

  // One read pass (every tile's inner width), then the writes, so a repaint lays out once.
  function measure() {
    const first = $('#ov-volume');
    const cs = getComputedStyle(first);
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    const widths = {};
    for (const id of CHART_TILES) widths[id] = Math.max(120, Math.floor($(`#ov-${id}`).offsetWidth - pad));
    lastWidth = dash.offsetWidth;
    return widths;
  }

  function paintTile(id, painter, width) {
    const sec = $(`#ov-${id}`);
    let markup;
    try { markup = painter(model, `ov-${id}`, width); }
    catch (e) { markup = html`${head(`ov-${id}`, sec.querySelector('.tile-label')?.textContent || '')}<p class="tile-empty">Couldn’t draw this tile: ${e.message}</p>`; }
    sec.innerHTML = toString(markup);
  }

  function paintTable() { paintTile('table', (m, id) => tableTile(m, id, table)); }

  function paint({ chartsOnly = false } = {}) {
    const widths = measure();
    for (const [id, , , painter] of TILES) {
      if (painter && (!chartsOnly || CHART_TILES.has(id))) paintTile(id, painter, widths[id]);
    }
    if (chartsOnly) return;
    paintTable();
    $('[data-dateline]').textContent = `Desk · ${formatDate(base.today, { long: true, year: true })}`;
    $('[data-summary]').innerHTML = toString(summaryLine(model));
    $('[data-scope]').innerHTML = toString(scopeLine(model));
    maps.update(model);
  }

  function writeHash() {
    history.replaceState(null, '', buildHash('overview', { p: filters.p, s: filters.s, w: filters.w }));
  }

  function syncFilters() {
    el.querySelectorAll('[data-period]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.period === filters.p)));
    el.querySelectorAll('[data-sport]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sport === filters.s)));
    const group = $('[data-week-group]');
    group.hidden = !filters.w;
    if (filters.w) {
      const chip = group.querySelector('button');
      chip.innerHTML = toString(html`Week of ${shortDate(filters.w)}<span class="ov-x" aria-hidden="true">✕</span>`);
      chip.setAttribute('aria-label', `Week of ${shortDate(filters.w)}: clear`);
    }
  }

  function setFilters(next, focus) {
    if (next.p === filters.p && next.s === filters.s && next.w === filters.w) return;
    if (next.p !== filters.p || next.s !== filters.s) table.all = false;
    filters = next;
    writeHash();
    syncFilters();
    update(focus);
  }

  // A repaint replaces the focused bar or sort button; put focus back on its successor.
  function restoreFocus(focus) {
    if (!focus) return;
    const target = $(focus);
    if (target) target.focus({ preventScroll: true });
  }

  // A week's bars are a few pixels wide on a year-long chart, with a gap between plan and
  // actual: a click anywhere in the week's column counts, resolved to the nearest bar group.
  function nearestBar(svg, x) {
    const groups = [...svg.querySelectorAll('.bars[data-key]')];
    const centres = groups.map(g => { const r = g.getBoundingClientRect(); return r.left + r.width / 2; });
    const slot = centres.length > 1 ? Math.abs(centres[1] - centres[0]) : Infinity;
    let best = -1;
    centres.forEach((c, i) => { if (best < 0 || Math.abs(c - x) < Math.abs(centres[best] - x)) best = i; });
    return best >= 0 && Math.abs(centres[best] - x) <= slot / 2 + 1 ? groups[best] : null;
  }

  const barSelector = key => `#ov-volume .bars[data-key="${CSS.escape(key)}"]`;
  const toggleWeek = key => setFilters({ ...filters, w: filters.w === key ? null : key }, barSelector(key));

  function onClick(e) {
    const t = e.target;
    const chip = t.closest('[data-period], [data-sport]');
    if (chip) {
      const next = chip.dataset.period ? { ...filters, p: chip.dataset.period } : { ...filters, s: chip.dataset.sport };
      return setFilters(next, `[data-${chip.dataset.period ? 'period' : 'sport'}="${CSS.escape(chip.dataset.period || chip.dataset.sport)}"]`);
    }
    const clear = t.closest('[data-clear-week]');
    if (clear) {
      // From the filter bar, focus stays in the bar; from the chart's readout, on the week's bar.
      const focus = clear.dataset.clearWeek === 'chip' ? `[data-period="${filters.p}"]` : barSelector(filters.w);
      return setFilters({ ...filters, w: null }, focus);
    }
    const chart = t.closest('#ov-volume .chart--bars');
    const bar = chart && (t.closest('.bars[data-key]') || nearestBar(chart, e.clientX));
    if (bar) return toggleWeek(bar.dataset.key);
    const cell = t.closest('#ov-cal rect[data-date]');
    if (cell) { location.hash = buildHash('week', { date: cell.dataset.date }); return; }
    const sort = t.closest('[data-sort]');
    if (sort && isSortKey(sort.dataset.sort)) {
      const key = sort.dataset.sort;
      const dir = table.sort.key === key ? (table.sort.dir === 'asc' ? 'desc' : 'asc') : firstDirection(key);
      table.sort = { key, dir };
      paintTable();
      return restoreFocus(`[data-sort="${key}"]`);
    }
    if (t.closest('[data-show-all]')) {
      table.all = true;
      paintTable();
      return restoreFocus(`#ov-table tbody tr:nth-child(${TABLE_PAGE + 1}) a`); // the first row just revealed
    }
    const row = t.closest('#ov-table tr[data-href]');
    if (row && !t.closest('a, button')) location.hash = row.dataset.href;
  }

  // The bars are role="button" groups, so Enter and Space must press them as a button would.
  function onKey(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const bar = e.target.closest && e.target.closest('#ov-volume .bars[data-key]');
    if (!bar) return;
    e.preventDefault();
    toggleWeek(bar.dataset.key);
  }

  // Charts are drawn at their measured width, so a wider or narrower window redraws them.
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    if (!model || Math.abs(dash.offsetWidth - lastWidth) < RESIZE_STEP_PX) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (disposed) return;
      paint({ chartsOnly: true });
      maps.resize();
    });
  }) : null;

  el.addEventListener('click', onClick);
  el.addEventListener('keydown', onKey);
  if (ro) ro.observe(dash);
  syncFilters();
  update();

  return function cleanup() {
    disposed = true;
    cancelAnimationFrame(frame);
    el.removeEventListener('click', onClick);
    el.removeEventListener('keydown', onKey);
    if (ro) ro.disconnect();
    maps.destroy();
  };
}
