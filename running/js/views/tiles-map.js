// Overview tiles, part four: the two map tiles, the heatmap of every route in the filter and
// the newest activity's mini map. Leaflet and the route lines (a second, much larger
// activities request) load only once one of these tiles scrolls into view. The map boxes
// are created once and kept across filter changes; only their lines are swapped, so a
// filter click never rebuilds a map.
import { html, raw, toString } from '../dom.js';
import { decodePolyline } from '../polyline.js';
import { createMap, addLine, addLines, addStart, fit, destroy } from '../map.js';
import { formatDate, formatDuration, formatNumber, formatPace, sportFamily } from '../format.js';
import { head, empty, failed, shortDate, km } from './tiles.js';

const HEAT_OPACITY = 0.18;     // low enough that a route run fifty times glows and a one-off whispers
const HEAT_WEIGHT = 2;
const PICK_OPACITY = 0.95;
const PICK_WEIGHT = 3;
const CORE_SHARE = 0.9;        // frame the central 90 % of start points; a holiday run would zoom out to a country
const MIN_POINTS = 2;

/**
 * The heatmap's footnote. Until the route lines are in, the period's activity count; then, if
 * some have no route (a treadmill, a ride without GPS), how many of them the map actually shows.
 */
export function heatCount(total, drawn = null) {
  const noun = total === 1 ? 'activity' : 'activities';
  return drawn == null || drawn === total ? `${total} ${noun}` : `${drawn} of ${total} ${noun} on the map`;
}

/** The lines whose start lies inside the central share of all starts, by latitude and longitude. */
export function coreLines(lines, share = CORE_SHARE) {
  if (lines.length < 5) return lines;
  // How many starts to drop at each end. The epsilon matters: (1 - 0.9) / 2 is 0.04999…,
  // which would floor one short and keep the very outlier this is meant to drop.
  const drop = Math.floor(((1 - share) / 2) * lines.length + 1e-9);
  const range = values => {
    const s = [...values].sort((a, b) => a - b);
    return [s[drop], s[s.length - 1 - drop]];
  };
  const [latLo, latHi] = range(lines.map(l => l.points[0][0]));
  const [lngLo, lngHi] = range(lines.map(l => l.points[0][1]));
  const core = lines.filter(({ points: [[lat, lng]] }) => lat >= latLo && lat <= latHi && lng >= lngLo && lng <= lngHi);
  return core.length ? core : lines;
}

const note = (attr, text) => html`<p class="ov-mapnote" ${raw(attr)}>${text}</p>`;

export function heatShell(id) {
  return html`${head(id, 'Heatmap', html`<span data-heat-meta></span>`)}
    <div class="ov-mapbox"><div class="map map--tile" data-heat-map></div>${note('data-heat-note', 'Map loading…')}</div>
    <p class="ov-mapfoot"><span data-heat-count></span><span class="ov-strava">Powered by Strava</span></p>`;
}

export function lastShell(id) {
  return html`${head(id, 'Last activity', html`<span data-last-meta></span>`)}
    <div class="ov-last">
      <div class="ov-mapbox ov-last-map"><div class="map map--tile" data-mini-map></div>${note('data-mini-note', 'Map loading…')}</div>
      <div class="ov-last-body" data-last-body></div>
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
 * that date to today; `openActivity(id)` follows a click on a line.
 */
export function mapTiles(root, { loadRoutes, openActivity }) {
  const $ = sel => root.querySelector(sel);
  const heatBox = $('[data-heat-map]'), heatNote = $('[data-heat-note]');
  const miniBox = $('[data-mini-map]'), miniNote = $('[data-mini-note]');
  let model = null, visible = false, disposed = false, seq = 0;
  let queue = Promise.resolve();
  let heat = null, heatPromise = null, heatKey = '', heatLayer = null, pickLayer = null;
  let mini = null, miniId = null;

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
      visible = true;
      io.disconnect();
      schedule();
    }, { rootMargin: '200px 0px' })
    : null;
  [$('#ov-heat'), $('#ov-last')].forEach(el => el && io && io.observe(el));
  if (!io) visible = true;

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

  async function drawHeat(m, byId, my) {
    const lines = [];
    for (const a of m.periodActs) {
      const points = pointsOf(byId.get(a.id));
      if (points.length >= MIN_POINTS) lines.push({ id: a.id, points });
    }
    $('[data-heat-count]').textContent = heatCount(m.periodActs.length, lines.length);
    if (!lines.length) { say(heatNote, 'No routes in this period.'); }
    const ctx = await heatMap();
    if (my !== seq) return;
    if (lines.length) say(heatNote, '');
    const key = `${m.range.from}|${m.filters.s}|${lines.length}`;
    if (key !== heatKey) {
      if (heatLayer) heatLayer.remove();
      heatLayer = lines.length ? addLines(ctx, lines, { weight: HEAT_WEIGHT, opacity: HEAT_OPACITY, onClick: openActivity }) : null;
      if (lines.length) fit(ctx, coreLines(lines).map(l => l.points), { padding: 16 });
      heatKey = key;
    }
    // The picked week is drawn again on top at full strength: the map's half of the cross-filter.
    if (pickLayer) { pickLayer.remove(); pickLayer = null; }
    if (m.sel) {
      const picked = new Set(m.weekActs.map(a => a.id));
      const pick = lines.filter(l => picked.has(l.id));
      if (pick.length) pickLayer = addLines(ctx, pick, { weight: PICK_WEIGHT, opacity: PICK_OPACITY, onClick: openActivity });
    }
  }

  async function drawMini(m, byId, my) {
    const a = m.last;
    const points = a ? pointsOf(byId.get(a.id)) : [];
    if (a && miniId === a.id && mini) return;
    if (mini) { destroy(mini); mini = null; miniId = null; }
    if (points.length < MIN_POINTS) { say(miniNote, a ? 'No route recorded.' : ''); return; }
    const ctx = await createMap(miniBox, { zoomControl: false, scrollWheelZoom: false });
    if (disposed || my !== seq) { destroy(ctx); return; }
    say(miniNote, '');
    mini = ctx;
    miniId = a.id;
    addLine(ctx, points, { weight: 3 });
    addStart(ctx, points[0]);
    fit(ctx, points, { padding: 20 });
  }

  async function draw(my) {
    if (disposed || my !== seq || !model) return;
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
      say(heatNote, text);
      say(miniNote, text);
      return;
    }
    if (disposed || my !== seq) return;
    const byId = new Map(rows.map(r => [r.id, r]));
    // Each map fails on its own: a Leaflet that will not load says so in both boxes.
    const report = e => e.message !== 'gone' && 'The map could not be loaded.';
    await drawHeat(m, byId, my).catch(e => say(heatNote, report(e)));
    await drawMini(m, byId, my).catch(e => say(miniNote, report(e)));
  }

  // Draws run one after another: two createMap calls on one box at once would collide.
  function schedule() {
    const my = ++seq;
    if (visible) queue = queue.then(() => draw(my));
  }

  return {
    update(m) {
      model = m;
      $('[data-heat-meta]').textContent = m.sel ? `Week of ${shortDate(m.sel)} on top` : '';
      $('[data-heat-count]').textContent = heatCount(m.periodActs.length); // drawHeat says how many have a route
      $('[data-last-meta]').textContent = m.sel ? `Week of ${shortDate(m.sel)}` : 'Newest in the period';
      $('[data-last-body]').innerHTML = toString(lastBody(m));
      root.querySelector('#ov-last').classList.toggle('is-empty', !m.last);
      if (m.errors.acts) {
        say(heatNote, 'Couldn’t load activities.');
        say(miniNote, '');
        return;
      }
      schedule();
    },
    resize() {
      if (heat) heat.map.invalidateSize();
      if (mini) mini.map.invalidateSize();
    },
    destroy() {
      disposed = true;
      if (io) io.disconnect();
      destroy(heat);
      destroy(mini);
      heat = mini = null;
    },
  };
}
