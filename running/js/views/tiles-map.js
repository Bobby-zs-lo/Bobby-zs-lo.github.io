// Overview tiles, part four: the two map tiles, the heatmap of every route in the filter and
// the newest activity's mini map, and their enlarged views in focus mode. Leaflet and the route
// lines (a second, much larger activities request) load only once one of these tiles scrolls
// into view or is enlarged. The tile maps are created once and kept across filter changes; only
// their lines are swapped, so a filter click never rebuilds a map. An enlarged view draws a map
// of its own in the focus dialog, made when the dialog opens and destroyed when it closes.
import { html, raw, toString } from '../dom.js';
import { decodePolyline } from '../polyline.js';
import { createMap, addLine, addLines, addStart, fit, destroy } from '../map.js';
import { formatDate, formatDuration, formatNumber, formatPace, sportFamily } from '../format.js';
import { densestFrame } from './overview-model.js';
import { head, empty, failed, shortDate, km } from './tiles.js';

const HEAT_OPACITY = 0.18;     // low enough that a route run fifty times glows and a one-off whispers
const HEAT_WEIGHT = 2;
const PICK_OPACITY = 0.95;
const PICK_WEIGHT = 3;
const MIN_POINTS = 2;
const TILE_PADDING = 16;
const MINI_PADDING = 20;
const FOCUS_PADDING = 40;
const FOCUS_ROUTE_WEIGHT = 4;
// A map with nothing to frame opens on home, else Copenhagen, at a city's zoom: never on the world.
const FALLBACK_CENTRE = [55.68, 12.57];
const FALLBACK_ZOOM = 11;
const NO_ROUTES = 'No routes in this period.';
const NO_LINES = 'No route lines yet — Settings › Import past activities fetches them.';
const NO_ACTIVITIES = 'Couldn’t load activities.';
/** The tiles whose enlarged view this module draws. */
export const FOCUS_KINDS = new Set(['heat', 'last']);

/**
 * The heatmap's footnote. Until the route lines are in, the period's activity count; then, if
 * some have no route (a treadmill, a ride without GPS), how many of them the map actually shows.
 */
export function heatCount(total, drawn = null) {
  const noun = total === 1 ? 'activity' : 'activities';
  return drawn == null || drawn === total ? `${total} ${noun}` : `${drawn} of ${total} ${noun} on the map`;
}

/**
 * The lines a heatmap frames: the picked week's when it has any, else the routes that start in
 * the densest cluster (densestFrame), so a run abroad never zooms the map out to a continent.
 * `lines` ([{ id, points }]) are oldest first, as the period lists them.
 */
export function framedLines(lines, picked = []) {
  if (picked.length) return picked;
  const newest = [...lines].reverse();
  const frame = densestFrame(newest.map(l => l.points[0]));
  return frame ? frame.members.map(i => newest[i]) : [];
}

/** Where a map with nothing to frame opens: home ([lat, lng]) if set, else Copenhagen. */
export const emptyView = home => ({ centre: home || FALLBACK_CENTRE, zoom: FALLBACK_ZOOM });

/** What an empty heatmap says: nothing in the period, or nothing in it that carries a route line. */
export const heatEmptyText = periodCount => (periodCount ? NO_LINES : NO_ROUTES);

const heatMeta = m => (m.sel ? `Week of ${shortDate(m.sel)} on top` : '');
const lastMeta = m => (m.sel ? `Week of ${shortDate(m.sel)}` : 'Newest in the period');

const note = (attr, text) => html`<p class="ov-mapnote" ${raw(attr)}>${text}</p>`;
const strava = html`<span class="ov-strava">Powered by Strava</span>`;

export function heatShell(id, { enlarge = false } = {}) {
  return html`${head(id, 'Heatmap', html`<span data-heat-meta></span>`, { enlarge })}
    <div class="ov-mapbox"><div class="map map--tile" data-heat-map></div>${note('data-heat-note', 'Map loading…')}</div>
    <p class="ov-mapfoot"><span data-heat-count></span>${strava}</p>`;
}

export function lastShell(id, { enlarge = false } = {}) {
  return html`${head(id, 'Last activity', html`<span data-last-meta></span>`, { enlarge })}
    <div class="ov-last">
      <div class="ov-mapbox ov-last-map"><div class="map map--tile" data-mini-map></div>${note('data-mini-note', 'Map loading…')}</div>
      <div class="ov-last-body" data-last-body></div>
    </div>`;
}

/** The focus dialog's body for an enlarged map tile: the map fills it, with the facts beside or below. */
function focusShell(kind) {
  const map = html`<div class="ov-mapbox ov-focus-map"><div class="map" data-focus-map></div>${note('data-focus-note', 'Map loading…')}</div>`;
  if (kind === 'heat') return html`${map}<p class="ov-mapfoot ov-focus-foot"><span data-focus-count></span>${strava}</p>`;
  return html`<div class="ov-focus-last" data-focus-wrap>${map}
    <div class="ov-focus-side"><div class="ov-last-body" data-focus-side><p class="ov-hint">Loading…</p></div>
      <p class="ov-focus-credit">${strava}</p></div>
  </div>`;
}

function lastBody(m) {
  if (m.errors.acts) return failed('activities', m.errors.acts);
  const a = m.last;
  if (!a) return empty(m.sel ? 'Nothing recorded that week.' : 'No activities in this period.');
  const href = `#/activity/${encodeURIComponent(a.id)}`;
  const run = sportFamily(a.sportType) === 'run';
  const stats = [['Distance', `${km(a.distanceKm)} km`], ['Moving time', formatDuration(a.movingMin)]];
  if (run && a.avgPaceSecPerKm) stats.push(['Pace', `${formatPace(a.avgPaceSecPerKm)} /km`]);
  else if (a.distanceKm > 0 && a.movingMin > 0) stats.push(['Speed', `${formatNumber(a.distanceKm / (a.movingMin / 60), 1)} km/h`]);
  if (a.avgHr) stats.push(['Heart rate', `${Math.round(a.avgHr)} bpm`]);
  if (a.elevM != null) stats.push(['Elevation', `${formatNumber(a.elevM, 0)} m`]);
  const session = m.sessions.get(a.workoutId);
  return html`<p class="ov-when">${formatDate(a.date, { long: true })}${a.commute ? ' · Commute' : ''}</p>
    <h3 class="ov-title"><a href="${href}">${a.name || a.sportType}</a></h3>
    <dl class="ov-stats">${stats.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
    ${session ? html`<p class="ov-matched">Matched to <a href="#/workout/${encodeURIComponent(session.id)}">${session.title}</a></p>` : ''}
    <a class="ov-link" href="${href}">Open activity →</a>`;
}

/**
 * The map tiles' controller. `loadRoutes(from)` resolves the activities with polylines from
 * that date to today; `openActivity(id)` follows a click on a line. `focus(kind, { body, meta })`
 * draws a tile's enlarged view into the focus dialog's body (already open, so it has a size) and
 * its meta line; `unfocus()` destroys it again.
 */
export function mapTiles(root, { loadRoutes, openActivity }) {
  const $ = sel => root.querySelector(sel);
  const heatBox = $('[data-heat-map]'), heatNote = $('[data-heat-note]');
  const miniBox = $('[data-mini-map]'), miniNote = $('[data-mini-note]');
  let model = null, visible = false, disposed = false, seq = 0;
  let queue = Promise.resolve();
  let heat = null, heatPromise = null, heatKey = '', heatFrame = '', heatLayer = null, pickLayer = null;
  let mini = null, miniId = null;
  let focus = null; // the enlarged view: { kind, wrap, box, note, meta, side, count, ctx, key }

  // Activity id → decoded points. Decoding is the costly step and a route never changes, so a
  // filter change reuses them; they go with the visit, like the responses they came from.
  const decoded = new Map();
  function pointsOf(row) {
    if (!row || typeof row.polyline !== 'string') return [];
    if (!decoded.has(row.id)) decoded.set(row.id, decodePolyline(row.polyline));
    return decoded.get(row.id);
  }

  const say = (el, text) => { el.textContent = text || ''; el.hidden = !text; };

  // Leaflet needs its box to have a size, and nothing should load for a tile nobody looks at.
  const io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      reveal();
      schedule();
    }, { rootMargin: '200px 0px' })
    : null;
  [$('#ov-heat'), $('#ov-last')].forEach(el => el && io && io.observe(el));
  if (!io) visible = true;

  function reveal() {
    visible = true;
    if (io) io.disconnect();
  }

  function heatMap() {
    if (!heatPromise) {
      heatPromise = createMap(heatBox, { zoomControl: true, scrollWheelZoom: false }).then(ctx => {
        if (disposed) { destroy(ctx); throw new Error('gone'); }
        heat = ctx;
        return ctx;
      }, e => { heatPromise = null; throw e; });
    }
    return heatPromise;
  }

  /** The period's activities that carry a route, as lines, oldest first. */
  function heatLines(m, byId) {
    const lines = [];
    for (const a of m.periodActs) {
      const points = pointsOf(byId.get(a.id));
      if (points.length >= MIN_POINTS) lines.push({ id: a.id, points });
    }
    return lines;
  }

  /** The picked week's lines, drawn again on top at full strength: the map's half of the cross-filter. */
  function pickedLines(m, lines) {
    if (!m.sel) return [];
    const ids = new Set(m.weekActs.map(a => a.id));
    return lines.filter(l => ids.has(l.id));
  }

  const drawAll = (ctx, lines) => addLines(ctx, lines, { weight: HEAT_WEIGHT, opacity: HEAT_OPACITY, onClick: openActivity });
  const drawPick = (ctx, pick) => addLines(ctx, pick, { weight: PICK_WEIGHT, opacity: PICK_OPACITY, onClick: openActivity });

  /** The heatmap's view: the picked week, else where most of the running is, else home. */
  function frameHeat(ctx, m, lines, pick, padding) {
    if (!lines.length) {
      const { centre, zoom } = emptyView(m.home);
      ctx.map.setView(centre, zoom, { animate: false });
      return;
    }
    fit(ctx, framedLines(lines, pick).map(l => l.points), { padding });
  }

  async function drawHeat(m, byId, my) {
    const lines = heatLines(m, byId);
    const pick = pickedLines(m, lines);
    $('[data-heat-count]').textContent = heatCount(m.periodActs.length, lines.length);
    const ctx = await heatMap();
    if (my !== seq) return;
    say(heatNote, lines.length ? '' : heatEmptyText(m.periodActs.length));
    const key = `${m.range.from}|${m.filters.s}|${lines.length}`;
    if (key !== heatKey) {
      if (heatLayer) heatLayer.remove();
      heatLayer = lines.length ? drawAll(ctx, lines) : null;
      heatKey = key;
    }
    // Framed again only when what it frames changes, so a pan or a zoom outlives anything else.
    const frameKey = `${key}|${m.sel || ''}`;
    if (frameKey !== heatFrame) {
      frameHeat(ctx, m, lines, pick, TILE_PADDING);
      heatFrame = frameKey;
    }
    if (pickLayer) { pickLayer.remove(); pickLayer = null; }
    if (pick.length) pickLayer = drawPick(ctx, pick);
  }

  async function drawMini(m, byId, my) {
    const a = m.last;
    const points = a ? pointsOf(byId.get(a.id)) : [];
    if (a && miniId === a.id && mini) return;
    if (mini) { destroy(mini); mini = null; miniId = null; }
    // No route, no map: an empty box says so, where a map would have nothing to frame but the world.
    if (points.length < MIN_POINTS) { say(miniNote, a ? 'No route recorded.' : ''); return; }
    const ctx = await createMap(miniBox, { zoomControl: false, scrollWheelZoom: false });
    if (disposed || my !== seq) { destroy(ctx); return; }
    say(miniNote, '');
    mini = ctx;
    miniId = a.id;
    addLine(ctx, points, { weight: 3 });
    addStart(ctx, points[0]);
    fit(ctx, points, { padding: MINI_PADDING });
  }

  /** The enlarged view's map: the tile's lines and framing, at size, with zoom by wheel and buttons. */
  async function drawFocus(m, byId, my) {
    const f = focus;
    if (!f) return;
    const isHeat = f.kind === 'heat';
    const lines = isHeat ? heatLines(m, byId) : [];
    const points = !isHeat && m.last ? pointsOf(byId.get(m.last.id)) : [];
    if (isHeat) f.count.textContent = heatCount(m.periodActs.length, lines.length);
    const key = isHeat ? `${m.range.from}|${m.filters.s}|${m.sel || ''}|${lines.length}` : String(m.last ? m.last.id : '');
    if (f.key === key) return;
    destroy(f.ctx);
    f.ctx = null;
    if (!isHeat && points.length < MIN_POINTS) {
      say(f.note, m.last ? 'No route recorded.' : '');
      f.key = key;
      return;
    }
    const ctx = await createMap(f.box, { zoomControl: true, scrollWheelZoom: true });
    if (disposed || focus !== f || my !== seq) { destroy(ctx); return; }
    f.ctx = ctx;
    f.key = key;
    if (isHeat) {
      const pick = pickedLines(m, lines);
      say(f.note, lines.length ? '' : heatEmptyText(m.periodActs.length));
      if (lines.length) drawAll(ctx, lines);
      if (pick.length) drawPick(ctx, pick);
      frameHeat(ctx, m, lines, pick, FOCUS_PADDING);
      return;
    }
    say(f.note, '');
    addLine(ctx, points, { weight: FOCUS_ROUTE_WEIGHT });
    addStart(ctx, points[0]);
    fit(ctx, points, { padding: FOCUS_PADDING });
  }

  /** The enlarged view's words, which follow the model like the tile's do. */
  function fillFocus(m) {
    if (!focus) return;
    focus.meta.textContent = focus.kind === 'heat' ? heatMeta(m) : lastMeta(m);
    if (focus.side) {
      focus.side.innerHTML = toString(lastBody(m));
      focus.wrap.classList.toggle('is-empty', !m.last);
    }
    if (m.errors.acts) say(focus.note, focus.kind === 'heat' ? NO_ACTIVITIES : '');
  }

  async function draw(my) {
    if (disposed || my !== seq || !model || model.errors.acts) return;
    const m = model;
    let rows;
    try {
      // From the start of the period, not of the bars: 'All' caps the bars at MAX_BAR_WEEKS,
      // but the heatmap draws every route in the period. A few thousand lines on one canvas is
      // fine (each is simplified to the zoom and clipped to the view); the cost is the one larger
      // response, which still waits until a map tile scrolls into view.
      rows = await loadRoutes(m.range.from);
    } catch (e) {
      const text = `Couldn’t load the routes. ${e.message || ''}`.trim();
      [heatNote, miniNote, focus && focus.note].forEach(el => el && say(el, text));
      return;
    }
    if (disposed || my !== seq) return;
    const byId = new Map(rows.map(r => [r.id, r]));
    // Each map fails on its own: a Leaflet that will not load says so in every box. The
    // enlarged view goes first: it is the one in front.
    const report = e => e.message !== 'gone' && 'The map could not be loaded.';
    if (focus) { const f = focus; await drawFocus(m, byId, my).catch(e => say(f.note, report(e))); }
    await drawHeat(m, byId, my).catch(e => say(heatNote, report(e)));
    await drawMini(m, byId, my).catch(e => say(miniNote, report(e)));
  }

  // Draws run one after another: two createMap calls on one box at once would collide.
  function schedule() {
    const my = ++seq;
    if (visible) queue = queue.then(() => draw(my));
  }

  function unfocus() {
    if (!focus) return;
    destroy(focus.ctx);
    focus = null;
  }

  return {
    update(m) {
      model = m;
      $('[data-heat-meta]').textContent = heatMeta(m);
      $('[data-heat-count]').textContent = heatCount(m.periodActs.length); // drawHeat says how many have a route
      $('[data-last-meta]').textContent = lastMeta(m);
      $('[data-last-body]').innerHTML = toString(lastBody(m));
      root.querySelector('#ov-last').classList.toggle('is-empty', !m.last);
      fillFocus(m);
      if (m.errors.acts) {
        say(heatNote, NO_ACTIVITIES);
        say(miniNote, '');
        return;
      }
      schedule();
    },
    focus(kind, { body, meta }) {
      if (disposed || !FOCUS_KINDS.has(kind)) return false;
      unfocus();
      body.innerHTML = toString(focusShell(kind));
      const q = sel => body.querySelector(sel);
      focus = {
        kind, meta, ctx: null, key: null,
        wrap: q('[data-focus-wrap]'), box: q('[data-focus-map]'), note: q('[data-focus-note]'),
        side: q('[data-focus-side]'), count: q('[data-focus-count]'),
      };
      if (model) fillFocus(model);
      reveal(); // the button that opened it was on screen, so its tile is too
      schedule();
      return true;
    },
    unfocus,
    resize() {
      if (heat) heat.map.invalidateSize();
      if (mini) mini.map.invalidateSize();
    },
    destroy() {
      disposed = true;
      if (io) io.disconnect();
      unfocus();
      destroy(heat);
      destroy(mini);
      heat = mini = null;
    },
  };
}
