// One recorded activity in full: every stored field, its route on a map, per-kilometre splits
// measured against the target pace of the session it was matched to, and (on request) the
// pace, heart-rate and elevation streams.
import { html, raw, mount } from '../dom.js';
import { api } from '../api.js';
import { loading, errorState, busy } from '../ui.js';
import { formatDate, formatDistance, formatDuration, formatPace, formatNumber, parsePace, paceRange, PACE_NAMES, sportFamily } from '../format.js';
import { decodePolyline } from '../polyline.js';
import { createMap, addLine, addStart, fit, destroy } from '../map.js';
import { lineSvg } from '../charts.js';
import { isDesk } from '../layout.js';
import { SPORT_NAMES } from './common.js';

const BACK = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M15 18l-6-6 6-6"/></svg>';

const STRAVA_URL = /^https:\/\/(www\.)?strava\.com\//; // the link goes to Strava or nowhere
const MAP_UNAVAILABLE = 'Map unavailable offline';
const ROUTE_WEIGHT_PX = 4;
const TOUCH_QUERY = '(pointer: coarse)';

const ASK_LABEL = 'Show pace, heart rate and elevation';
const NO_STREAMS = 'No streams were recorded for this activity.';
const STREAMS_NOTE = 'Fetched from Strava when you ask for them.';
const STATUS_NO_STREAMS = 404;
const STATUS_STRAVA_AUTH = 409;
// A raw pace stream spikes when the runner stops (1000 / ~0 m/s). Outside these bounds the sample
// is a stop or a glitch, not a pace, and would flatten the whole chart if it set the axis.
const PACE_MIN_SEC = 60;
const PACE_MAX_SEC = 1800;
const MAX_CHART_POINTS = 600;
const MAX_X_LABELS = 8;
const X_LABEL_STEPS_KM = [1, 2, 5, 10, 20, 50];
const CARD_CHROME_PX = 34;          // .card padding (16 + 16) and border (1 + 1) around the charts
const MIN_CHART_WIDTH_PX = 240;
const WIDE_CHART_PX = 600;
const CHART_HEIGHT_PX = { narrow: 120, wide: 150 };
const RESIZE_REDRAW_PX = 24;        // a ResizeObserver tick smaller than this is not worth a redraw

const clockTime = iso => {
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
};

/** Where a split sits against the session's target window. */
function verdict(sec, lo, hi) {
  if (sec == null || lo == null) return null;
  if (sec < lo) return 'fast';
  if (sec > hi) return 'slow';
  return 'on';
}

const VERDICT_TEXT = { fast: 'faster than target', on: 'on target', slow: 'slower than target' };

function statRows(a) {
  const isRun = sportFamily(a.sportType) === 'run';
  const rows = [
    ['Distance', formatDistance(a.distanceKm)],
    ['Moving time', formatDuration(a.movingMin)],
  ];
  if (a.elapsedMin != null && Math.abs(a.elapsedMin - a.movingMin) >= 0.5) rows.push(['Elapsed', formatDuration(a.elapsedMin)]);
  if (isRun && a.avgPaceSecPerKm) rows.push(['Average pace', `${formatPace(a.avgPaceSecPerKm)}/km`]);
  if (!isRun && a.distanceKm > 0 && a.movingMin > 0) rows.push(['Average speed', `${formatNumber(a.distanceKm / (a.movingMin / 60), 1)} km/h`]);
  if (a.avgHr) rows.push(['Average heart rate', `${Math.round(a.avgHr)} bpm`]);
  if (a.maxHr) rows.push(['Max heart rate', `${Math.round(a.maxHr)} bpm`]);
  if (a.elevM != null) rows.push(['Elevation gain', `${formatNumber(a.elevM, 0)} m`]);
  rows.push(['Started', `${formatDate(a.date)} ${clockTime(a.startUtc)}`]);
  rows.push(['Type', `${SPORT_NAMES[sportFamily(a.sportType)] || a.sportType}${a.commute ? ' · commute' : ''}`]);
  return rows;
}

function splitsTable(splits, lo, hi) {
  return html`<div class="card table-wrap">
    <table class="dtable">
      <thead><tr><th scope="col">Km</th><th scope="col">Pace</th><th scope="col">Time</th><th scope="col">HR</th><th scope="col">Elev</th></tr></thead>
      <tbody>
        ${splits.map(s => {
          const v = verdict(s.paceSecPerKm, lo, hi);
          return html`<tr>
            <th scope="row">${s.distanceKm >= 0.98 ? s.index : `${s.index} (${formatDistance(s.distanceKm)})`}</th>
            <td class="num${v ? ` split--${v}` : ''}" ${v ? raw(`title="${VERDICT_TEXT[v]}"`) : ''}>${s.paceSecPerKm ? `${formatPace(s.paceSecPerKm)}` : '–'}${v ? html`<span class="sr-only"> — ${VERDICT_TEXT[v]}</span>` : ''}</td>
            <td class="num">${s.movingS ? formatDuration(s.movingS / 60) : '–'}</td>
            <td class="num">${s.avgHr ? Math.round(s.avgHr) : '–'}</td>
            <td class="num">${s.elevM != null ? `${s.elevM > 0 ? '+' : ''}${formatNumber(s.elevM, 0)}` : '–'}</td>
          </tr>`;
        })}
      </tbody>
    </table>
  </div>`;
}

// --- route map -------------------------------------------------------------

function mapCard() {
  return html`<div class="card card--map act-map">
    <div class="map map--activity" data-map role="region" aria-label="Map of the route"></div>
    <p class="map-hint" data-map-hint hidden>Use two fingers to move the map.</p>
  </div>`;
}

/**
 * The page keeps scrolling over the map: the wheel zooms it only once it has been clicked, and on a
 * phone one finger scrolls the page while two move the map. Without this a 300 px map is a trap.
 */
function keepPageScrollable(el, mapCtx) {
  const { map } = mapCtx;
  map.on('focus', () => map.scrollWheelZoom.enable());
  map.on('blur', () => map.scrollWheelZoom.disable());
  const hint = el.querySelector('[data-map-hint]');
  // Leaflet's own L.Browser.touch is true on any browser with pointer events, a desktop included.
  if (matchMedia(TOUCH_QUERY).matches && !isDesk() && hint) {
    map.dragging.disable();
    hint.hidden = false;
  }
}

/** Draw the route once Leaflet is ready; leave nothing behind if the page has gone by then. */
async function showRoute(el, points, state, ctx) {
  const box = el.querySelector('[data-map]');
  if (!box) return;
  let mapCtx;
  try { mapCtx = await createMap(box, { scrollWheelZoom: false }); } catch {
    if (!state.disposed && ctx.isCurrent()) {
      box.innerHTML = `<p class="map-error">${MAP_UNAVAILABLE}</p>`;
      const hint = el.querySelector('[data-map-hint]');
      if (hint) hint.remove();
    }
    return;
  }
  if (state.disposed || !ctx.isCurrent()) { destroy(mapCtx); return; }
  state.map = mapCtx;
  addLine(mapCtx, points, { weight: ROUTE_WEIGHT_PX });
  addStart(mapCtx, points[0]);
  fit(mapCtx, points);
  keepPageScrollable(el, mapCtx);
}

// --- streams ---------------------------------------------------------------

/** The x labels: whole kilometres from the first one after the start, thinned to at most MAX_X_LABELS. */
function kmLabels(fromKm, toKm) {
  const whole = Math.floor(toKm);
  if (!(whole >= 1)) return [];
  const step = X_LABEL_STEPS_KM.find(s => Math.floor(whole / s) <= MAX_X_LABELS) || X_LABEL_STEPS_KM.at(-1);
  const ks = [];
  for (let k = step; k <= whole; k += step) if (k >= fromKm) ks.push(k);
  return ks.map((k, i) => ({ x: k, text: i === ks.length - 1 ? `${k} km` : String(k) }));
}

const SERIES = [
  { key: 'paceSecPerKm', kind: 'pace', title: 'Pace', unit: 'min/km', invert: true, format: formatPace, keep: v => v >= PACE_MIN_SEC && v <= PACE_MAX_SEC },
  { key: 'hr', kind: 'hr', title: 'Heart rate', unit: 'bpm', format: v => String(Math.round(v)), keep: v => v > 0 },
  { key: 'altM', kind: 'elev', title: 'Elevation', unit: 'm', format: v => String(Math.round(v)), keep: () => true },
];

/** { x, y } samples, thinned to MAX_CHART_POINTS (the last sample always kept); y is null where unusable. */
function samples(dist, values, keep) {
  const n = Math.min(dist.length, values.length);
  const stride = Math.max(1, Math.ceil(n / MAX_CHART_POINTS));
  const at = i => ({ x: dist[i], y: Number.isFinite(values[i]) && keep(values[i]) ? values[i] : null });
  const out = [];
  for (let i = 0; i < n; i += stride) out.push(at(i));
  if (n && (n - 1) % stride) out.push(at(n - 1));
  return out;
}

function oneStream(spec, data, width) {
  const values = data[spec.key];
  if (!Array.isArray(values) || !Array.isArray(data.distanceKm)) return '';
  const points = samples(data.distanceKm, values, spec.keep);
  const real = points.filter(p => p.y != null && Number.isFinite(p.x));
  if (real.length < 2) return '';
  const ys = real.map(p => p.y), xs = real.map(p => p.x);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  // Pace: the lowest number is the fastest, so it leads, matching the inverted axis (fast at the top).
  const range = `${spec.format(lo)}–${spec.format(hi)} ${spec.unit}`;
  const reach = Math.max(...xs);
  const svg = lineSvg(points, {
    width, height: width >= WIDE_CHART_PX ? CHART_HEIGHT_PX.wide : CHART_HEIGHT_PX.narrow,
    invert: !!spec.invert, yFormat: spec.format, xLabels: kmLabels(Math.min(...xs), reach),
    label: `${spec.title} over ${formatDistance(reach)}, ${range}`,
  });
  return html`<div class="stream stream--${spec.kind}">
    <div class="stream-head"><h3 class="stream-h">${spec.title}</h3><span class="stream-range">${range}</span></div>
    ${raw(svg)}
  </div>`;
}

function streamsMarkup(data, width) {
  const charts = SERIES.map(spec => oneStream(spec, data, width)).filter(Boolean);
  return charts.length ? html`<div class="card streams-card" data-streams-result tabindex="-1">${charts}</div>` : '';
}

function askMarkup({ text = STREAMS_NOTE, error = false, settings = false, canAsk = true } = {}) {
  return html`<div class="streams-ask">
    <p class="${error ? 'form-error' : 'help'}"${error ? raw(' role="alert"') : ''}>${text}</p>
    ${settings ? html`<a class="link" href="#/settings">Open settings →</a>` : ''}
    ${canAsk ? html`<button type="button" class="btn" data-streams>${ASK_LABEL}</button>` : ''}
  </div>`;
}

function streamsFailure(e) {
  if (e && e.status === STATUS_NO_STREAMS) return { text: NO_STREAMS, canAsk: false };
  if (e && e.status === STATUS_STRAVA_AUTH) return { text: e.message, error: true, settings: true };
  return { text: (e && e.message) || 'The streams could not be loaded.', error: true };
}

const chartWidth = host => Math.max(MIN_CHART_WIDTH_PX, host.clientWidth - CARD_CHROME_PX);

/** Paint the charts at the host's current width; false when no series had anything to draw. */
function paintStreams(host, state) {
  const width = chartWidth(host);
  const markup = streamsMarkup(state.streams, width);
  if (!markup) return false;
  const hadFocus = host.contains(document.activeElement);
  mount(host, markup);
  state.chartWidth = width;
  if (hadFocus) host.querySelector('[data-streams-result]').focus({ preventScroll: true });
  return true;
}

function bindStreams(host, id, state, ctx) {
  const btn = host.querySelector('[data-streams]');
  if (!btn) return;
  btn.addEventListener('click', () => busy(btn, async () => {
    let data;
    try { data = await api.get(`/api/activities/${encodeURIComponent(id)}/streams`); } catch (e) {
      if (state.disposed || !ctx.isCurrent()) return;
      mount(host, askMarkup(streamsFailure(e)));
      bindStreams(host, id, state, ctx);
      return;
    }
    if (state.disposed || !ctx.isCurrent()) return;
    state.streams = data;
    if (!paintStreams(host, state)) { mount(host, askMarkup({ text: NO_STREAMS, canAsk: false })); return; }
    host.querySelector('[data-streams-result]').focus({ preventScroll: true });
    watchWidth(host, state);
  }));
}

/** Charts are drawn at 1 : 1 with the screen so their text is a real 10 px; redraw when the column changes width. */
function watchWidth(host, state) {
  if (typeof ResizeObserver !== 'function') return;
  state.observer = new ResizeObserver(() => {
    if (state.streams && Math.abs(chartWidth(host) - state.chartWidth) >= RESIZE_REDRAW_PX) paintStreams(host, state);
  });
  state.observer.observe(host);
}

export async function render(el, ctx) {
  const id = (ctx.rest && ctx.rest[0]) || '';
  if (!id) { mount(el, html`<p class="state">No activity chosen.</p>`); return; }
  loading(el, 'Loading activity');

  let data;
  try { data = await api.get(`/api/activities/${encodeURIComponent(id)}`); }
  catch (e) { if (ctx.isCurrent()) errorState(el, e, () => render(el, ctx)); return; }
  if (!ctx.isCurrent()) return;

  const { activity: a, workout: w, paces } = data;
  const range = w ? paceRange(paces, w.paceKey) : null;
  const lo = range && paces[w.paceKey] ? parsePace(paces[w.paceKey].min) : null;
  const hi = range && paces[w.paceKey] ? parsePace(paces[w.paceKey].max) : null;
  const splits = a.splits || [];
  const onTarget = lo != null ? splits.filter(s => verdict(s.paceSecPerKm, lo, hi) === 'on').length : null;
  const route = decodePolyline(a.polyline);
  const hasRoute = route.length >= 2;

  mount(el, html`
    <header class="page-head page-head--nav">
      <a class="icon-btn" href="#/week?date=${a.date}" aria-label="Back to the week">${raw(BACK)}</a>
      <div class="page-head-mid">
        <p class="eyebrow">${formatDate(a.date, { long: true })}</p>
        <h1 class="h1--compact">${a.name || a.sportType}</h1>
      </div>
      <span></span>
    </header>

    <div class="act-grid">
      <article class="card act-stats">
        <p class="eyebrow">Recorded by Strava</p>
        <dl class="kv kv--wide">
          ${statRows(a).map(([k, v]) => html`<dt>${k}</dt><dd><span class="num">${v}</span></dd>`)}
        </dl>
        ${STRAVA_URL.test(a.stravaUrl || '') ? html`<p class="act-foot"><a class="strava-link" href="${a.stravaUrl}" target="_blank" rel="noopener">View on Strava ↗</a></p>` : ''}
      </article>

      ${hasRoute ? mapCard() : ''}

      ${w ? html`<section class="card act-match">
        <h2 class="section-title">Matched to a session</h2>
        <p><a class="link" href="#/workout/${encodeURIComponent(w.id)}">${w.title} →</a></p>
        ${range ? html`<p class="help">Target pace ${range} · ${PACE_NAMES[w.paceKey] || ''}${
          onTarget != null && splits.length ? ` · ${onTarget} of ${splits.length} kilometres inside the window` : ''}</p>` : ''}
      </section>` : html`<section class="card banner banner--quiet act-match">
        <p>Not matched to a planned session. It still counts as load the weekly review can take into account.</p>
      </section>`}

      ${splits.length ? html`<section class="act-splits" aria-labelledby="sp-h">
        <h2 class="section-title" id="sp-h">Kilometre splits</h2>
        ${lo != null ? html`<p class="help">Paces outside the ${range} target window are marked.</p>` : ''}
        ${splitsTable(splits, lo, hi)}
      </section>` : html`<p class="help act-splits">No kilometre splits were recorded for this activity.</p>`}

      <section class="act-streams${splits.length ? '' : ' act-streams--wide'}" aria-labelledby="st-h">
        <h2 class="section-title" id="st-h">Streams</h2>
        <div data-streams-host>${askMarkup()}</div>
      </section>
    </div>
  `);

  const state = { disposed: false, map: null, streams: null, chartWidth: 0, observer: null };
  bindStreams(el.querySelector('[data-streams-host]'), id, state, ctx);
  if (hasRoute) showRoute(el, route, state, ctx);

  // The router calls this on navigation. Leaflet may still be loading by then: showRoute checks
  // state.disposed after it resolves and destroys the map it just built.
  return () => {
    state.disposed = true;
    if (state.observer) state.observer.disconnect();
    destroy(state.map);
  };
}
