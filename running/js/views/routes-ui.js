// Markup for the Routes view (views/routes.js): pure functions from data to html`` templates, so
// the view module keeps only state, the map and the wiring. Everything goes through dom.js html``,
// which escapes every value; raw() wraps only markup built here or by charts.js.
import { html, raw } from '../dom.js';
import { formatDate, formatDistance } from '../format.js';
import { googleMapsUrl, cccUrl, usableVia } from '../geo.js';
import { profileSvg } from '../charts.js';
import { formatLatLng } from '../geolocate.js';

// Distance limits match the API's (functions/src/routing.js); travel is Google Maps' travelmode.
export const PROFILES = {
  run: { label: 'Run', noun: 'a run', min: 2, max: 60, travel: 'walking' },
  trail: { label: 'Trail', noun: 'a trail run', min: 2, max: 60, travel: 'walking' },
  ride: { label: 'Ride', noun: 'a ride', min: 10, max: 200, travel: 'bicycling' },
};
export const LETTERS = ['A', 'B', 'C'];
export const MODES = {
  auto: { label: 'Auto', help: 'Three round trips of the length you want, from your start.', km: 'Distance' },
  draw: { label: 'Draw', help: 'Click or tap the map to add points. The route follows paths and roads between them.', km: 'Target distance' },
};
export const DEFAULT_KM = { run: 10, trail: 10, ride: 60 };
const START_NAMES = { home: 'Home', location: 'Your location', map: 'Point on the map' };
// Shown under the map in place of Leaflet's corner credit (hidden in routes.css), so the routing
// credit and the map credit sit together once.
const ATTRIBUTION = html`Routing © <a href="https://openrouteservice.org/" target="_blank" rel="noopener">openrouteservice.org</a> by HeiGIT · Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors`;
const GOOGLE_SAMPLED = 'Approximate: Google re-routes between 9 points.';

const pct = share => (Number.isFinite(share) ? `${Math.round(share * 100)} %` : '–');

function deltaText(km, target) {
  const d = Math.round((km - target) * 10) / 10;
  return d === 0 ? 'on target' : `${d > 0 ? '+' : '−'}${formatDistance(Math.abs(d))}`;
}

export const planWorkouts = plan => ((plan && plan.weeks) || []).flatMap(w => w.workouts || []);

/** The form's distance rule for Auto: '' when km suits the profile, else what to say. */
export function kmError(km, profile) {
  const { min, max, noun } = PROFILES[profile];
  if (!Number.isFinite(km)) return 'Enter a distance in kilometres.';
  return km < min || km > max ? `Choose ${min}–${max} km for ${noun}.` : '';
}

/** The next three planned runs, offered as chips. Runs only: the plan prescribes running, and a race is a fixed course. */
export function upcomingRuns(plan, today) {
  return planWorkouts(plan)
    .filter(w => w.sport === 'run' && w.distanceKm > 0 && w.date >= today && (w.status || 'planned') === 'planned')
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
}

// What works with a mouse and what works with a finger differ (a finger cannot pull the line), so
// a hint has both, and css/routes.css shows the one that fits the pointer: (pointer: coarse).
const byPointer = (fine, coarse) => html`<span class="rt-on-fine">${fine}</span><span class="rt-on-coarse">${coarse}</span>`;

const runChip = (w, on) => html`<button type="button" class="chip-btn" data-run="${w.id}" aria-pressed="${String(!!on)}">${formatDate(w.date)} · ${w.title} · ${formatDistance(w.distanceKm)}</button>`;
const checked = on => (on ? raw(' checked') : '');

// The undo / redo / loop / clear bar on the map, shown while a route has handles. On a narrow
// screen the labels of the icon buttons are visually hidden (routes.css), so the bar stays one row.
const toolsTpl = () => html`<div class="rt-tools" id="rt-tools" role="toolbar" aria-label="Edit the route" hidden>
    <button type="button" class="rt-tool" id="rt-undo" aria-keyshortcuts="Control+Z" title="Undo (Ctrl+Z)" aria-disabled="true"><span class="rt-tool-icon" aria-hidden="true">↶</span><span class="rt-tool-label">Undo</span></button>
    <button type="button" class="rt-tool" id="rt-redo" aria-keyshortcuts="Control+Shift+Z" title="Redo (Ctrl+Shift+Z)" aria-disabled="true"><span class="rt-tool-icon" aria-hidden="true">↷</span><span class="rt-tool-label">Redo</span></button>
    <button type="button" class="rt-tool rt-tool--toggle" id="rt-loop" aria-pressed="true">Back to start</button>
    <button type="button" class="rt-tool" id="rt-clear" title="Clear"><span class="rt-tool-icon rt-tool-icon--narrow" aria-hidden="true">✕</span><span class="rt-tool-label">Clear</span></button>
  </div>
  <p class="sr-only" id="rt-handle-help">Drag to move it. Arrow keys move it 20 metres, with Shift 100. Delete removes it.</p>`;

/** The whole page: header, form, map frame and an empty results panel. */
export function pageTpl({ mode, profile, km, runs, fromId }) {
  const { min, max } = PROFILES[profile];
  return html`<div class="rt" data-mode="${mode}">
    <header class="page-head rt-head">
      <p class="eyebrow">Route planner</p>
      <h1>Routes</h1>
      <p class="sub">Three round trips of the length you want, or one you draw yourself. Drag any route to reshape it.</p>
    </header>
    <form class="rt-panel rt-form" id="rt-form" novalidate aria-label="Plan a route">
      <fieldset class="rt-field rt-modes">
        <legend class="tile-label">Plan</legend>
        <div class="rt-seg">${Object.entries(MODES).map(([k, m]) => html`<label class="rt-seg-opt"><input type="radio" name="mode" value="${k}"${checked(k === mode)}><span>${m.label}</span></label>`)}</div>
        <p class="rt-mode-help" id="rt-mode-help">${MODES[mode].help}</p>
      </fieldset>
      <fieldset class="rt-field">
        <legend class="tile-label">Activity</legend>
        <div class="rt-chips">${Object.entries(PROFILES).map(([k, p]) => html`<label class="rt-choice"><input type="radio" name="profile" value="${k}"${checked(k === profile)}><span class="chip-btn">${p.label}</span></label>`)}</div>
      </fieldset>
      <div class="rt-field" role="group" aria-labelledby="rt-start-h">
        <span class="tile-label" id="rt-start-h">Start</span>
        <p class="rt-start" id="rt-start"></p>
        <div class="rt-chips">
          <button type="button" class="chip-btn" id="rt-locate">Use my location</button>
          <button type="button" class="chip-btn" id="rt-save-home">Save as home</button>
        </div>
        <p class="rt-msg" id="rt-start-msg" aria-live="polite"></p>
      </div>
      <div class="rt-field">
        <label class="tile-label" for="rt-km" id="rt-km-label">${MODES[mode].km}</label>
        <div class="input-unit rt-km"><input id="rt-km" name="km" type="number" inputmode="decimal" step="0.5" min="${min}" max="${max}" value="${km}" aria-describedby="rt-km-msg rt-km-help"><span>km</span></div>
        <p class="rt-msg" id="rt-km-help"${mode === 'draw' ? '' : raw(' hidden')}>Optional. The drawn route is measured against it.</p>
        <p class="rt-msg rt-msg--error" id="rt-km-msg" aria-live="polite"></p>
        <p class="rt-for" id="rt-for" hidden><span id="rt-for-text"></span> <button type="button" class="rt-link" id="rt-for-clear">Clear</button></p>
        ${runs.length ? html`<div class="rt-runs" role="group" aria-label="Next planned runs">${runs.map(w => runChip(w, w.id === fromId))}</div>` : ''}
      </div>
      <p class="rt-msg rt-msg--error" id="rt-form-msg" role="alert"></p>
      <div class="rt-actions" id="rt-actions"${mode === 'draw' ? raw(' hidden') : ''}>
        <button type="submit" class="btn btn--primary" id="rt-go">Generate 3 routes</button>
        <button type="button" class="btn" id="rt-again" hidden>Try other routes</button>
      </div>
    </form>
    <div class="rt-mapcol">
      <div class="rt-mapbox">
        <div class="map map--routes rt-map" id="rt-map"></div>
        <p class="rt-map-wait" id="rt-map-wait" role="status">Map loading…</p>
        ${toolsTpl()}
        <div class="rt-live" id="rt-live" role="status" hidden></div>
      </div>
      <p class="rt-attrib">${ATTRIBUTION}</p>
    </div>
    <section class="rt-panel rt-results" id="rt-results" aria-label="Routes found" hidden>
      <div id="rt-status"></div>
      <div id="rt-body"></div>
    </section>
  </div>`;
}

/** The start line: what the start is and where, or how to choose one. */
export function startTpl(start, kind) {
  return start
    ? html`<span class="rt-start-name">${START_NAMES[kind]}</span><span class="rt-coords num">${formatLatLng(start)}</span>`
    : html`<span class="rt-start-none">Click the map to choose a start</span>`;
}

/** kind: 'loading' | 'error' | 'info' | null (nothing to say). */
export function statusTpl(kind, text) {
  if (!kind) return '';
  if (kind === 'loading') return html`<p class="rt-status" role="status"><span class="spinner" aria-hidden="true"></span>${text}</p>`;
  return kind === 'error'
    ? html`<p class="rt-status rt-status--error" role="alert">${text}</p>`
    : html`<p class="rt-status rt-status--info" role="status">${text}</p>`;
}

const variantCard = (v, i, on, target) => html`<label class="rt-variant">
    <input type="radio" name="variant" value="${i}"${checked(on)}>
    <span class="rt-letter" aria-hidden="true">${LETTERS[i]}</span>
    <span class="rt-variant-km"><span class="sr-only">Route ${LETTERS[i]}: </span><strong class="num">${formatDistance(v.distanceKm)}</strong><span class="rt-delta num">${deltaText(v.distanceKm, target)}</span></span>
    <span class="rt-stat num"><span aria-hidden="true">↑</span><span class="sr-only">climb</span> ${Math.round(v.ascentM || 0)} m</span>
    <span class="rt-stat num">${pct(v.surface && v.surface.paved)} paved</span>
  </label>`;

/** The variant cards, with an empty slot (#rt-detail) for detailTpl below them. */
export function resultsTpl(r, selected) {
  return html`<h2 class="tile-label rt-results-h">${r.variants.length} routes · ${PROFILES[r.profile].label} ${formatDistance(r.targetKm)}</h2>
    <p class="rt-note" id="rt-stale" hidden>The form has changed since these routes were made. Generate again to match it.</p>
    <fieldset class="rt-variants"><legend class="sr-only">Choose a route</legend>
      ${r.variants.map((v, i) => variantCard(v, i, i === selected, r.targetKm))}
    </fieldset>
    <div id="rt-detail"></div>`;
}

const exportItem = (kind, label, help, primary = false) => html`<div class="rt-export">
    <button type="button" class="btn btn--block${primary ? ' btn--primary' : ''}" data-export="${kind}">${label}</button>
    <p class="help">${help}</p>
  </div>`;

/**
 * Elevation profile, surface shares and export buttons for one route. c: { route, profile, start,
 * targetKm, via (the points it was planned through, or null), gpxName, tag (the caption's suffix),
 * name (what "Take … with you" calls it) }.
 */
function routeBody(c) {
  const { route, profile } = c, s = route.surface || {};
  const items = [exportItem('gpx', 'Download GPX', html`<span class="rt-file">${c.gpxName}</span>`, true)];
  // A link that can't be built is left out rather than shown as a button that does nothing.
  if (googleMapsUrl(route.points, PROFILES[profile].travel, { via: c.via })) {
    const n = usableVia(c.via) ? c.via.length : 0;
    items.push(exportItem('google', 'Google Maps', n ? `Through your ${n} point${n === 1 ? '' : 's'}; Google finds its own way between them.` : GOOGLE_SAMPLED));
  }
  items.push(exportItem('strava', 'Strava', 'Import the file with the upload icon. Needs a Strava subscription.'));
  items.push(exportItem('garmin', 'Garmin Connect', 'Import → choose the file.'));
  if (profile === 'ride' && cccUrl(c.start, c.targetKm ?? route.distanceKm)) items.push(exportItem('ccc', 'Plan with cafés in CCC', 'Opens Cake, Coffee & Cadence with this start and distance.'));
  return html`<figure class="rt-profile">
      <figcaption class="rt-cap"><span class="tile-label">Elevation${c.tag ? ` · ${c.tag}` : ''}</span><span class="rt-meta num">↑ ${Math.round(route.ascentM || 0)} m · ↓ ${Math.round(route.descentM || 0)} m</span></figcaption>
      ${raw(profileSvg(route.cum, route.elevations || [], { width: 348, height: 92, label: `Elevation along ${c.name}` }))}
      <p class="rt-meta num">Paved ${pct(s.paved)} · Unpaved ${pct(s.unpaved)} · Unknown ${pct(s.unknown)}</p>
    </figure>
    <div class="rt-exports">
      <h3 class="tile-label">Take ${c.name} with you</h3>
      <div class="rt-export-grid">${items}</div>
    </div>`;
}

/** Profile, surface and exports for variant i, with the way into the editor above them. */
export function detailTpl(r, i, gpxName) {
  const letter = LETTERS[i];
  return html`<div class="rt-edit-cta">
      <button type="button" class="btn btn--block" data-edit>Edit this route</button>
      <p class="help">Reshape route ${letter} by moving its points; it re-routes as you go.</p>
    </div>
    ${routeBody({ route: r.variants[i], profile: r.profile, start: r.start, targetKm: r.targetKm, via: null, gpxName, tag: letter, name: `route ${letter}` })}`;
}

/** The live readout on the map while a route has handles: distance, against the target, and climb. */
export function liveTpl(route, targetKm, pending) {
  if (!route) return '';
  const km = Number.isFinite(targetKm) && targetKm > 0 ? targetKm : null;
  return html`<strong class="num">${formatDistance(route.distanceKm)}</strong>${km ? html`<span class="rt-live-delta num">${deltaText(route.distanceKm, km)} <span class="rt-vs">vs ${formatDistance(km)}</span></span>` : ''}<span class="rt-live-climb num"><span aria-hidden="true">↑</span><span class="sr-only">climb</span> ${Math.round(route.ascentM || 0)} m</span>${pending ? html`<span class="spinner" aria-hidden="true"></span><span class="sr-only">Re-routing</span>` : ''}`;
}

/**
 * The panel for a route with handles: an edited variant (letter set) or a drawn route. e: { letter,
 * profile, targetKm, start, route, handles, via, fresh, gpxName }.
 */
export function editTpl(e) {
  const title = e.letter ? `Route ${e.letter}, edited` : 'Drawn route';
  const back = e.letter ? html`<button type="button" class="rt-link" data-back>Back to 3 routes</button>` : '';
  const head = html`<div class="rt-edit-head"><h2 class="tile-label">${title} · ${PROFILES[e.profile].label}</h2>${back}</div>`;
  if (!e.route) {
    const first = e.handles.length === 0;
    return html`${head}<div class="rt-empty">
        <p class="rt-empty-h">${first ? 'Click the map to set a start' : e.handles.length === 1 ? 'Click the map to add the next point' : 'Finding a way between your points…'}</p>
        <p class="help">${first ? byPointer('Then keep clicking: each click adds a point, and the route follows paths and roads between them.', 'Then keep tapping: each tap adds a point, and the route follows paths and roads between them.') : byPointer('Each click adds a point.', 'Each tap adds a point.')}${first ? '' : ' With Back to start on, the route comes home at the end.'}</p>
      </div>`;
  }
  const r = e.route, km = Number.isFinite(e.targetKm) && e.targetKm > 0 ? e.targetKm : null;
  return html`${head}
    <div class="rt-readout${e.fresh ? '' : ' is-stale'}">
      <p class="rt-total"><strong class="num">${formatDistance(r.distanceKm)}</strong>${km ? html`<span class="rt-delta num">${deltaText(r.distanceKm, km)} <span class="rt-vs">vs ${formatDistance(km)}</span></span>` : ''}</p>
      <p class="rt-facts num"><span><span aria-hidden="true">↑</span><span class="sr-only">climb</span> ${Math.round(r.ascentM || 0)} m</span><span>${pct(r.surface && r.surface.paved)} paved</span><span>${e.handles.length} points</span></p>
    </div>
    <p class="rt-hint">${byPointer('Drag a point or the line to reshape. Click a point to remove it.', 'Drag a point to move it. Tap the line to add a point there; tap a point to remove it.')} <span class="rt-hint-keys">Tab to a point: arrow keys move it, Delete removes it.</span></p>
    <div class="rt-detail${e.fresh ? '' : ' is-stale'}"${e.fresh ? '' : raw(' aria-busy="true"')}>
      ${routeBody({ route: r, profile: e.profile, start: e.start, targetKm: km, via: e.via, gpxName: e.gpxName, tag: '', name: e.letter ? 'this route' : 'the drawn route' })}
    </div>`;
}
