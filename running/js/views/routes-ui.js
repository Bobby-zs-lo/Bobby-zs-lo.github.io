// Markup for the Routes view (views/routes.js): pure functions from data to html`` templates, so
// the view module keeps only state, the map and the wiring. Everything goes through dom.js html``,
// which escapes every value; raw() wraps only markup built here or by charts.js.
import { html, raw } from '../dom.js';
import { formatDate, formatDistance } from '../format.js';
import { googleMapsUrl, cccUrl } from '../geo.js';
import { profileSvg } from '../charts.js';
import { formatLatLng } from '../geolocate.js';

// Distance limits match the API's (functions/src/routing.js); travel is Google Maps' travelmode.
export const PROFILES = {
  run: { label: 'Run', noun: 'a run', min: 2, max: 60, travel: 'walking' },
  trail: { label: 'Trail', noun: 'a trail run', min: 2, max: 60, travel: 'walking' },
  ride: { label: 'Ride', noun: 'a ride', min: 10, max: 200, travel: 'bicycling' },
};
export const LETTERS = ['A', 'B', 'C'];
const START_NAMES = { home: 'Home', location: 'Your location', map: 'Point on the map' };
// Shown under the map in place of Leaflet's corner credit (hidden in routes.css), so the routing
// credit and the map credit sit together once.
const ATTRIBUTION = html`Routing © <a href="https://openrouteservice.org/" target="_blank" rel="noopener">openrouteservice.org</a> by HeiGIT · Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors`;

const pct = share => (Number.isFinite(share) ? `${Math.round(share * 100)} %` : '–');

function deltaText(km, target) {
  const d = Math.round((km - target) * 10) / 10;
  return d === 0 ? 'on target' : `${d > 0 ? '+' : '−'}${formatDistance(Math.abs(d))}`;
}

const runChip = (w, on) => html`<button type="button" class="chip-btn" data-run="${w.id}" aria-pressed="${on}">${formatDate(w.date)} · ${w.title} · ${formatDistance(w.distanceKm)}</button>`;

/** The whole page: header, form, map frame and an empty results panel. */
export function pageTpl({ profile, km, runs, fromId }) {
  const { min, max } = PROFILES[profile];
  return html`<div class="rt">
    <header class="page-head rt-head">
      <p class="eyebrow">Route generator</p>
      <h1>Routes</h1>
      <p class="sub">Three round trips of the length you want, from home or any point you click on the map.</p>
    </header>
    <form class="rt-panel rt-form" id="rt-form" novalidate aria-label="New routes">
      <fieldset class="rt-field">
        <legend class="tile-label">Mode</legend>
        <div class="rt-chips">${Object.entries(PROFILES).map(([k, p]) => html`<label class="rt-choice"><input type="radio" name="profile" value="${k}"${k === profile ? raw(' checked') : ''}><span class="chip-btn">${p.label}</span></label>`)}</div>
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
        <label class="tile-label" for="rt-km">Distance</label>
        <div class="input-unit rt-km"><input id="rt-km" name="km" type="number" inputmode="decimal" step="0.5" min="${min}" max="${max}" value="${km}" aria-describedby="rt-km-msg"><span>km</span></div>
        <p class="rt-msg rt-msg--error" id="rt-km-msg" aria-live="polite"></p>
        <p class="rt-for" id="rt-for" hidden><span id="rt-for-text"></span> <button type="button" class="rt-link" id="rt-for-clear">Clear</button></p>
        ${runs.length ? html`<div class="rt-runs" role="group" aria-label="Next planned runs">${runs.map(w => runChip(w, w.id === fromId))}</div>` : ''}
      </div>
      <p class="rt-msg rt-msg--error" id="rt-form-msg" role="alert"></p>
      <div class="rt-actions">
        <button type="submit" class="btn btn--primary" id="rt-go">Generate 3 routes</button>
        <button type="button" class="btn" id="rt-again" hidden>Try other routes</button>
      </div>
    </form>
    <div class="rt-mapcol">
      <div class="rt-mapbox">
        <div class="map map--routes rt-map" id="rt-map"></div>
        <p class="rt-map-wait" id="rt-map-wait" role="status">Map loading…</p>
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

/** kind: 'loading' | 'error' | null (nothing to say). */
export function statusTpl(kind, text) {
  if (!kind) return '';
  return kind === 'loading'
    ? html`<p class="rt-status" role="status"><span class="spinner" aria-hidden="true"></span>${text}</p>`
    : html`<p class="rt-status rt-status--error" role="alert">${text}</p>`;
}

const variantCard = (v, i, on, target) => html`<label class="rt-variant">
    <input type="radio" name="variant" value="${i}"${on ? raw(' checked') : ''}>
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

/** Elevation profile, surface shares and export buttons for variant i. */
export function detailTpl(r, i, gpxName) {
  const v = r.variants[i], letter = LETTERS[i], s = v.surface || {};
  const items = [exportItem('gpx', 'Download GPX', html`<span class="rt-file">${gpxName}</span>`, true)];
  // A link that can't be built is left out rather than shown as a button that does nothing.
  if (googleMapsUrl(v.points, PROFILES[r.profile].travel)) items.push(exportItem('google', 'Google Maps', 'Approximate: Google re-routes between 9 points.'));
  items.push(exportItem('strava', 'Strava', 'Import the file with the upload icon. Needs a Strava subscription.'));
  items.push(exportItem('garmin', 'Garmin Connect', 'Import → choose the file.'));
  if (r.profile === 'ride' && cccUrl(r.start, r.targetKm)) items.push(exportItem('ccc', 'Plan with cafés in CCC', 'Opens Cake, Coffee & Cadence with this start and distance.'));
  return html`<figure class="rt-profile">
      <figcaption class="rt-cap"><span class="tile-label">Elevation · ${letter}</span><span class="rt-meta num">↑ ${Math.round(v.ascentM || 0)} m · ↓ ${Math.round(v.descentM || 0)} m</span></figcaption>
      ${raw(profileSvg(v.cum, v.elevations || [], { width: 348, height: 92, label: `Elevation along route ${letter}` }))}
      <p class="rt-meta num">Paved ${pct(s.paved)} · Unpaved ${pct(s.unpaved)} · Unknown ${pct(s.unknown)}</p>
    </figure>
    <div class="rt-exports">
      <h3 class="tile-label">Take route ${letter} with you</h3>
      <div class="rt-export-grid">${items}</div>
    </div>`;
}
