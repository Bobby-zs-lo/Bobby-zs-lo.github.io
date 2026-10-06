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
//
// Focus mode (Power BI's name for it): a tile whose section carries data-focusable has an Enlarge
// button in its head, which opens the tile large in a modal <dialog> above the dashboard. The
// dialog is this view's; what it shows is the tile's own (the map tiles draw theirs in
// tiles-map.js). Esc, the close button, the backdrop or a click through to an activity close it.
//
// Layout: the cards come in the order and widths of the owner's saved layout (settings.dashboard,
// resolved by overview-model.js); a hidden card's section stays in the page, hidden and unpainted.
// Customise mode, which edits and saves the layout, is overview-layout.js.
import { html, mount, raw, toString } from '../dom.js';
import { api } from '../api.js';
import { toast } from '../ui.js';
import { getState, getPlan, patchState, peekState } from '../store.js';
import { buildHash } from '../router.js';
import { copenhagenToday, formatDate } from '../format.js';
import {
  buildModel, createSession, requestWindows, readFilters, PERIODS, SPORTS, CATALOGUE, resolveLayout,
} from './overview-model.js';
import {
  head, summaryLine, scopeLine, shortDate, raceKpi, weekKpi, hitKpi, easyKpi, formKpi, phaseKpi, healthTile, nextTile,
  customiseBar, hiddenTray, customiseVoice,
} from './tiles.js';
import { volumeTile, zonesTile, efficiencyTile, loadTile, calendarTile, nearestBar } from './tiles-charts.js';
import { tableTile, firstDirection, isSortKey, TABLE_PAGE } from './tiles-table.js';
import { mapTiles, heatShell, lastShell, focusDialog, FOCUS_KINDS } from './tiles-map.js';
import { customiser } from './overview-layout.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const RESIZE_STEP_PX = 4; // smaller width changes are rounding noise, not worth a redraw

// Catalogue id (overview-model.js) → [DOM key, painter]. The DOM keys are older than the
// catalogue and stay, so the CSS, the map tiles and the smoke test keep their hooks (#ov-heat).
// DOM order is focus order, and follows the layout. The tiles that open in focus mode are the
// ones whose enlarged view has a drawer: today the two maps (tiles-map.js FOCUS_KINDS).
const TILES = {
  'kpi-race': ['kpi-race', raceKpi], 'kpi-week': ['kpi-week', weekKpi], 'kpi-plan': ['kpi-hit', hitKpi],
  'kpi-easy': ['kpi-easy', easyKpi], 'kpi-form': ['kpi-form', formKpi], 'kpi-phase': ['kpi-phase', phaseKpi],
  volume: ['volume', volumeTile], heatmap: ['heat', null], zones: ['zones', zonesTile],
  efficiency: ['eff', efficiencyTile], fitness: ['load', loadTile], calendar: ['cal', calendarTile],
  health: ['health', healthTile], last: ['last', null], next: ['next', nextTile], table: ['table', null],
};
const CHART_TILES = new Set(['volume', 'zones', 'efficiency', 'fitness', 'calendar', 'health']);

// --- markup ----------------------------------------------------------------------

const chips = (attr, options, current) => options.map(([key, label]) =>
  html`<button type="button" class="chip-btn" data-${attr}="${key}" aria-pressed="${String(key === current)}">${label}</button>`);

function tileShell(key, label, hidden) {
  const enlarge = FOCUS_KINDS.has(key);
  if (key === 'heat') return heatShell(`ov-${key}`, { enlarge });
  if (key === 'last') return lastShell(`ov-${key}`, { enlarge });
  return html`${head(`ov-${key}`, label)}${hidden ? '' : html`<p class="ov-loading">Loading…</p>`}`;
}

function tileSection(entry, { span, hidden }) {
  const [key] = TILES[entry.id];
  return html`<section class="tile tile--span-${span} ov-tile ov-tile--${entry.kind === 'kpi' ? 'kpi' : key}" id="ov-${key}" data-tile="${entry.id}" aria-labelledby="ov-${key}-h"${raw(FOCUS_KINDS.has(key) ? ' data-focusable' : '')}${raw(hidden ? ' hidden' : '')}>
    ${tileShell(key, entry.title, hidden)}
  </section>`;
}

function shell(f, layout) {
  const byId = new Map(CATALOGUE.map(c => [c.id, c]));
  const ordered = [...layout.filter(t => !t.hidden), ...layout.filter(t => t.hidden)];
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
      ${customiseBar()}
    </div>
    ${hiddenTray()}
    <div class="dash ov" aria-busy="true">
      ${ordered.map(t => tileSection(byId.get(t.id), t))}
    </div>
    <footer class="ov-foot">Powered by Strava · Maps © OpenStreetMap contributors</footer>
    ${focusDialog()}${customiseVoice()}`;
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

  // The saved layout, when the state is already in hand; else the default until it arrives.
  const initial = resolveLayout(peekState()?.settings?.dashboard);
  mount(el, shell(filters, initial));
  const dash = el.querySelector('.dash');
  const $ = sel => el.querySelector(sel);
  const sections = new Map([...dash.querySelectorAll('[data-tile]')].map(s => [s.dataset.tile, s]));
  const isHidden = id => sections.get(id).hidden;
  const dialog = $('#ov-focus');
  const focusParts = { title: $('#ov-focus-h'), scope: $('[data-focus-scope]'), meta: $('[data-focus-meta]'), body: $('[data-focus-body]') };
  let opener = null;          // the Enlarge button of the open dialog; focus goes back to it
  let restoreOnClose = true;  // false when the dialog closes on the way to another page
  let downOnBackdrop = false; // a press that began on the backdrop: only then does its click close
  const maps = mapTiles(el, {
    loadRoutes: from => session.load('routes', from, base.today),
    openActivity: id => {
      closeFocus({ restore: false });
      location.hash = `#/activity/${encodeURIComponent(id)}`;
    },
  });
  const custom = customiser(el, {
    sections, layout: initial, save: saveLayout,
    // A card that came back or changed width is painted now, at its width; the maps re-measure.
    onChange: (layout, { spans, shown }) => {
      if (model) repaint(new Set([...spans, ...shown]));
      maps.relayout();
    },
  });

  async function saveLayout(dashboard) {
    const saved = await api.put('/api/settings', { dashboard });
    const got = saved && typeof saved === 'object' ? saved : {};
    const settings = { ...base.settings, ...got, dashboard: Object.hasOwn(got, 'dashboard') ? got.dashboard : dashboard };
    base = { ...base, settings };
    patchState({ settings });
  }

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
    if (!base) {
      base = await loadBase();
      custom.apply(resolveLayout(base.settings.dashboard));
    }
    const need = requestWindows(filters.p, base.today, base.plan);
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
    $('[data-customise]').disabled = false;
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

  // One read pass (every shown chart's inner width), then the writes, so a repaint lays out once.
  function measure() {
    const widths = {};
    let pad = null; // the chart cards share their padding and border
    for (const id of CHART_TILES) {
      const sec = sections.get(id);
      if (sec.hidden) continue;
      if (pad == null) {
        const cs = getComputedStyle(sec);
        pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
      }
      widths[id] = Math.max(120, Math.floor(sec.offsetWidth - pad));
    }
    lastWidth = dash.offsetWidth;
    return widths;
  }

  // The tile's content is replaced; customise mode's toolbar, if it has one, stays on top.
  function paintTile(key, painter, width) {
    const sec = $(`#ov-${key}`);
    const bar = sec.querySelector(':scope > .ov-tbar');
    let markup;
    try { markup = painter(model, `ov-${key}`, width); }
    catch (e) { markup = html`${head(`ov-${key}`, sec.querySelector('.tile-label')?.textContent || '')}<p class="tile-empty">Couldn’t draw this tile: ${e.message}</p>`; }
    sec.innerHTML = toString(markup);
    if (bar) sec.append(bar);
    custom.dress(sec);
  }

  function paintTable() { paintTile('table', (m, id) => tableTile(m, id, table)); }

  // A hidden card is not painted (it is when it comes back: repaint), and stops saying "Loading…".
  function paint({ chartsOnly = false } = {}) {
    const widths = measure();
    for (const [id, [key, painter]] of Object.entries(TILES)) {
      if (isHidden(id)) sections.get(id).querySelector(':scope > .ov-loading')?.remove();
      else if (painter && (!chartsOnly || CHART_TILES.has(id))) paintTile(key, painter, widths[id]);
    }
    if (chartsOnly) return;
    if (!isHidden('table')) paintTable();
    $('[data-dateline]').textContent = `Desk · ${formatDate(base.today, { long: true, year: true })}`;
    $('[data-summary]').innerHTML = toString(summaryLine(model));
    $('[data-scope]').innerHTML = toString(scopeLine(model));
    if (dialog.open) focusParts.scope.innerHTML = toString(scopeLine(model));
    maps.update(model);
  }

  function repaint(ids) {
    if (!ids.size) return;
    const widths = measure();
    for (const id of ids) {
      const [key, painter] = TILES[id];
      if (id === 'table') paintTable();
      else if (painter) paintTile(key, painter, widths[id]);
    }
  }

  // --- focus mode ---

  function openFocus(button) {
    const sec = button.closest('[data-focusable]');
    const id = sec ? sec.id.replace(/^ov-/, '') : '';
    if (dialog.open || custom.active || !FOCUS_KINDS.has(id)) return;
    focusParts.title.textContent = sec.querySelector('.tile-label')?.textContent || '';
    focusParts.scope.innerHTML = model ? toString(scopeLine(model)) : '';
    opener = button;
    restoreOnClose = true;
    downOnBackdrop = false;
    dialog.showModal(); // first: the enlarged map is made in a box that already has its size
    button.setAttribute('aria-expanded', 'true');
    maps.focus(id, { body: focusParts.body, meta: focusParts.meta });
  }

  function closeFocus({ restore = true } = {}) {
    if (!dialog.open) return;
    restoreOnClose = restore;
    dialog.close();
  }

  // Every way of closing (Esc, the close button, the backdrop, a line clicked) ends here.
  function onFocusClose() {
    if (disposed) return;
    maps.unfocus();
    focusParts.body.replaceChildren();
    focusParts.meta.textContent = '';
    if (opener) {
      opener.setAttribute('aria-expanded', 'false');
      if (restoreOnClose && opener.isConnected) opener.focus({ preventScroll: true });
    }
    opener = null;
  }

  const onFocusPointerDown = e => { downOnBackdrop = e.target === dialog; };

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

  const barSelector = key => `#ov-volume .bars[data-key="${CSS.escape(key)}"]`;
  const toggleWeek = key => setFilters({ ...filters, w: filters.w === key ? null : key }, barSelector(key));

  function onClick(e) {
    const t = e.target;
    // The dialog's box is filled by its frame, so a click on the dialog itself is on the backdrop.
    if (t === dialog) { if (downOnBackdrop) closeFocus(); return; }
    if (t.closest('[data-focus-close]')) return closeFocus();
    const enlarge = t.closest('[data-enlarge]');
    if (enlarge) return openFocus(enlarge);
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

  // Crossing the desk breakpoint closes the focus dialog (an open modal would leave the page
  // under it inert) and, on the way to the phone, leaves customise mode (the phone has neither).
  function onLayout() {
    closeFocus({ restore: false });
    if (!custom.active || document.documentElement.dataset.layout === 'desk') return;
    custom.cancel();
    toast('Customising needs a wider window. Nothing was saved.');
  }

  el.addEventListener('click', onClick);
  el.addEventListener('keydown', onKey);
  window.addEventListener('layout:change', onLayout);
  dialog.addEventListener('close', onFocusClose);
  dialog.addEventListener('pointerdown', onFocusPointerDown);
  if (ro) ro.observe(dash);
  syncFilters();
  update();

  return function cleanup() {
    disposed = true;
    cancelAnimationFrame(frame);
    el.removeEventListener('click', onClick);
    el.removeEventListener('keydown', onKey);
    window.removeEventListener('layout:change', onLayout);
    custom.destroy(); // unsaved changes go with the view
    dialog.removeEventListener('close', onFocusClose);
    dialog.removeEventListener('pointerdown', onFocusPointerDown);
    // A link in the dialog leaves the view with the dialog still open: close it, so the page
    // under it is not left inert, and let the maps take its map with theirs.
    if (dialog.open) dialog.close();
    if (ro) ro.disconnect();
    maps.destroy();
  };
}
