// Routes: round trips of a set length from a start point. The server asks OpenRouteService for
// three variants; this view compares them on a map and hands the chosen one on as a GPX file, a
// Google Maps link, a Strava or Garmin import, or (a ride) a Cake, Coffee & Cadence plan.
// Desk first (a 380 px panel beside a full-height map), stacked on a narrow screen.
import { mount } from '../dom.js';
import { api } from '../api.js';
import { getState, getPlan, patchState, peekState } from '../store.js';
import { toast, busy, loading, errorState } from '../ui.js';
import { buildHash } from '../router.js';
import { copenhagenToday, formatDate, formatDistance } from '../format.js';
import { buildGpx, googleMapsUrl, cccUrl, gpxFilename, haversineKm } from '../geo.js';
import { decodePolyline } from '../polyline.js';
import { currentPosition } from '../geolocate.js';
import { PROFILES, LETTERS, pageTpl, startTpl, statusTpl, resultsTpl, detailTpl } from './routes-ui.js';
import { createMap, addLine, addStart, cssVar, fit, destroy } from '../map.js';

const DEFAULT_KM = { run: 10, trail: 10, ride: 60 };
const DENMARK = [55.68, 12.57];
const DENMARK_ZOOM = 11;
const START_ZOOM = 13;
const VARIANTS = 3;
const MAX_SEED = 1e6;            // the API's limit; variant i uses seed + i
const BLOB_TTL_MS = 30000;       // revoking a download URL at once can cancel the download
const STRAVA_NEW_ROUTE = 'https://www.strava.com/routes/new';
const GARMIN_COURSES = 'https://connect.garmin.com/modern/courses';
const NO_KEY = 'Route generation isn’t set up yet: the OpenRouteService key is missing.';

const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
const roundPoint = p => [round(p[0], 5), round(p[1], 5)];
const samePoint = (a, b) => !!a && !!b && round(a[0], 5) === round(b[0], 5) && round(a[1], 5) === round(b[1], 5);
const randomSeed = () => Math.floor(Math.random() * (MAX_SEED - VARIANTS + 1)); // 0 … 1e6 − 3
const nextSeed = s => (s + VARIANTS <= MAX_SEED - VARIANTS ? s + VARIANTS : 0);
const planWorkouts = plan => ((plan && plan.weeks) || []).flatMap(w => w.workouts || []);

function cumulativeKm(points) {
  const out = [0];
  for (let i = 1; i < points.length; i++) out.push(out[i - 1] + haversineKm(points[i - 1], points[i]));
  return out;
}

function kmError(km, profile) {
  const { min, max, noun } = PROFILES[profile];
  if (!Number.isFinite(km)) return 'Enter a distance in kilometres.';
  return km < min || km > max ? `Choose ${min}–${max} km for ${noun}.` : '';
}

// Runs only: the plan prescribes running, and a race is a fixed course, not a route to invent.
function upcomingRuns(plan, today) {
  return planWorkouts(plan)
    .filter(w => w.sport === 'run' && w.distanceKm > 0 && w.date >= today && (w.status || 'planned') === 'planned')
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
}

// Google Maps and CCC buttons only render when their URL could be built, so url is never null here.
const openTab = url => window.open(url, '_blank', 'noopener');

function saveFile(text, filename, type) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type })), download: filename, hidden: true });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), BLOB_TTL_MS);
}

export async function render(el, ctx) {
  loading(el, 'Loading routes');
  let state, plan;
  try {
    [state, plan] = await Promise.all([getState(), getPlan().catch(() => null)]); // no plan: no chips
  } catch (e) {
    if (ctx.isCurrent()) errorState(el, e, () => render(el, ctx));
    return;
  }
  if (!ctx.isCurrent()) return;

  const p = ctx.params || {};
  const home = state.settings && state.settings.home;
  const today = state.today || copenhagenToday(); // /api/state always carries it; if not, Copenhagen's date, not UTC's
  const st = {
    home: home ? [home.lat, home.lng] : null, start: null, startKind: null,
    from: (p.from && planWorkouts(plan).find(w => w.id === p.from)) || null,
    seed: null, result: null, selected: 0, pending: false,
  };
  if (st.home) { st.start = st.home; st.startKind = 'home'; }
  const profile = PROFILES[p.profile] ? p.profile : 'run';
  const kmParam = Number(p.km);
  const km = p.km && kmParam > 0 ? round(kmParam, 1) : (st.from ? st.from.distanceKm : DEFAULT_KM[profile]);
  const runs = upcomingRuns(plan, today);

  mount(el, pageTpl({ profile, km, runs, fromId: st.from && st.from.id }));
  const $ = sel => el.querySelector(sel);
  const form = $('#rt-form'), kmInput = $('#rt-km'), goBtn = $('#rt-go'), againBtn = $('#rt-again');
  const results = $('#rt-results'), statusBox = $('#rt-status'), body = $('#rt-body'), saveBtn = $('#rt-save-home');

  let disposed = false, mapCtx = null, startMarker = null, lines = [];
  const alive = () => !disposed && ctx.isCurrent();
  const currentProfile = () => form.profile.value;
  const readKm = () => (kmInput.value.trim() === '' ? NaN : Number(kmInput.value));
  const gpxDate = r => (r.from && r.from.date) || today;
  const setMsg = (sel, text, isError = false) => {
    const node = $(sel);
    node.textContent = text;
    node.classList.toggle('rt-msg--error', isError);
  };

  // ── start ──────────────────────────────────────────────────────────────────────────────
  function syncStart() {
    mount($('#rt-start'), startTpl(st.start, st.startKind));
    saveBtn.hidden = !st.start;
    saveBtn.disabled = st.startKind === 'home';
    saveBtn.classList.toggle('is-saved', st.startKind === 'home');
    saveBtn.textContent = st.startKind === 'home' ? 'Saved as home' : 'Save as home';
  }

  function placeStart() {
    if (!mapCtx || !st.start) return;
    if (startMarker) startMarker.setLatLng(st.start);
    else startMarker = addStart(mapCtx, st.start);
    startMarker.bringToFront();
  }

  function setStart(point, kind) {
    st.start = roundPoint(point);
    st.startKind = samePoint(st.start, st.home) ? 'home' : kind;
    setMsg('#rt-start-msg', '');
    setMsg('#rt-form-msg', '');
    syncStart();
    placeStart();
    syncStale();
  }

  // ── distance, and the planned run it is for ────────────────────────────────────────────
  function validateKm() {
    const err = kmError(readKm(), currentProfile());
    setMsg('#rt-km-msg', err, true);
    kmInput.setAttribute('aria-invalid', String(!!err));
    return !err;
  }

  function syncFrom() {
    $('#rt-for').hidden = !st.from;
    if (st.from) $('#rt-for-text').textContent = `For: ${st.from.title}, ${formatDate(st.from.date)}`;
    el.querySelectorAll('[data-run]').forEach(b => b.setAttribute('aria-pressed', String(!!st.from && b.dataset.run === st.from.id)));
  }

  // ── results ────────────────────────────────────────────────────────────────────────────
  // Says when the routes on screen no longer match the form, so a moved start or a new
  // distance is never mistaken for what the exports contain.
  function syncStale() {
    const r = st.result, note = $('#rt-stale');
    if (note) note.hidden = !r || (samePoint(r.start, st.start) && r.profile === currentProfile() && r.targetKm === readKm());
  }

  function showStatus(kind, text) {
    mount(statusBox, statusTpl(kind, text));
    results.hidden = !kind && !st.result;
    results.setAttribute('aria-busy', String(kind === 'loading'));
  }

  function renderResults() {
    const r = st.result;
    if (!r.variants.length) {
      mount(body, '');
      showStatus('error', 'No routes came back for this start and distance. Try another start or distance.');
      return;
    }
    mount(body, resultsTpl(r, st.selected));
    renderDetail();
    syncStale();
  }

  function renderDetail() {
    const r = st.result, v = r.variants[st.selected];
    mount($('#rt-detail'), detailTpl(r, st.selected, gpxFilename(r.profile, v.distanceKm, gpxDate(r))));
  }

  // Only the detail below the cards is re-rendered, so a radio keeps keyboard focus.
  function select(i) {
    if (!st.result || !st.result.variants[i]) return;
    st.selected = i;
    const radio = el.querySelector(`input[name="variant"][value="${i}"]`);
    if (radio) radio.checked = true;
    renderDetail();
    styleLines();
    fitSelected();
  }

  // ── map ────────────────────────────────────────────────────────────────────────────────
  // Colours are passed explicitly (map.js would otherwise re-theme the lines back to their
  // first style on a scheme change) and re-resolved here when the scheme flips. The other
  // routes are dotted: a thin solid grey line reads as one more road on the tiles.
  function styleLines() {
    if (!mapCtx || !lines.length) return;
    const quiet = { color: cssVar('--ink'), weight: 3.5, opacity: 0.55, dashArray: '1 7' };
    lines.forEach((line, i) => { if (i !== st.selected) line.setStyle(quiet); });
    const on = lines[st.selected];
    if (on) { on.setStyle({ color: cssVar('--accent'), weight: 5, opacity: 1, dashArray: null }); on.bringToFront(); }
    if (startMarker) startMarker.bringToFront();
  }

  function fitSelected() {
    const v = st.result && st.result.variants[st.selected];
    if (mapCtx && v) fit(mapCtx, v.points, { padding: 32 });
  }

  function drawRoutes() {
    if (!mapCtx) return;
    lines.forEach(line => line.remove());
    lines = !st.result ? [] : st.result.variants.map((v, i) => addLine(mapCtx, v.points, {
      color: cssVar('--ink-2'),
      tooltip: `${LETTERS[i]} · ${formatDistance(v.distanceKm)}`,
      onClick: () => select(i), // interactive lines don't bubble, so the start stays put
    }));
    styleLines();
    fitSelected();
  }

  async function initMap() {
    let made;
    try {
      made = await createMap($('#rt-map'), { zoomControl: true, scrollWheelZoom: true });
    } catch {
      if (alive()) $('#rt-map-wait').textContent = 'The map couldn’t load. Routes and exports still work.';
      return;
    }
    if (!alive()) { destroy(made); return; }
    mapCtx = made;
    $('#rt-map-wait').hidden = true;
    mapCtx.map.setView(st.start || DENMARK, st.start ? START_ZOOM : DENMARK_ZOOM);
    mapCtx.map.on('click', e => setStart([e.latlng.lat, e.latlng.lng], 'map'));
    placeStart();
    drawRoutes();
  }

  // ── generate ───────────────────────────────────────────────────────────────────────────
  async function generate(seed, btn) {
    if (st.pending) return;
    if (!validateKm()) { kmInput.focus(); return; }
    if (!st.start) { setMsg('#rt-form-msg', 'Choose a start first: click the map or use your location.', true); return; }
    setMsg('#rt-form-msg', '');
    const request = { start: st.start, km: readKm(), profile: currentProfile(), variants: VARIANTS, seed };
    const other = btn === goBtn ? againBtn : goBtn;
    st.pending = true;
    other.disabled = true;
    showStatus('loading', `Finding ${VARIANTS} routes…`);
    await busy(btn, async () => {
      try {
        const res = await api.post('/api/routes/generate', request);
        if (!alive()) return;
        const variants = (Array.isArray(res && res.variants) ? res.variants : [])
          .map(v => { const points = decodePolyline(v.polyline); return { ...v, points, cum: cumulativeKm(points) }; })
          .filter(v => v.points.length >= 2);
        Object.assign(st, { seed, selected: 0, result: { profile: request.profile, targetKm: request.km, start: request.start, from: st.from, variants } });
        showStatus(null);
        renderResults();
        drawRoutes();
        // The URL keeps what was asked for, so a reload or a shared link comes back to it.
        history.replaceState(null, '', buildHash('routes', { km: request.km, profile: request.profile === 'run' ? null : request.profile, from: st.from && st.from.id }));
      } catch (e) {
        if (!alive()) return;
        if (e.status === 400) { showStatus(null); setMsg('#rt-form-msg', e.message, true); }
        else showStatus('error', e.status === 503 ? NO_KEY : e.message);
      }
    });
    if (!alive()) return;
    st.pending = false;
    other.disabled = false;
    againBtn.hidden = !st.result || !st.result.variants.length;
  }

  // ── exports: new tabs open synchronously in the click, or a popup blocker eats them ──────
  function exportRoute(kind) {
    const r = st.result, v = r && r.variants[st.selected];
    if (!v) return;
    if (kind === 'google') { openTab(googleMapsUrl(v.points, PROFILES[r.profile].travel)); return; }
    if (kind === 'ccc') { openTab(cccUrl(r.start, r.targetKm)); return; }
    if (kind === 'strava') openTab(STRAVA_NEW_ROUTE);
    if (kind === 'garmin') openTab(GARMIN_COURSES);
    const gpx = buildGpx({ name: `${PROFILES[r.profile].label} ${formatDistance(v.distanceKm)}`, points: v.points, elevations: v.elevations });
    saveFile(gpx, gpxFilename(r.profile, v.distanceKm, gpxDate(r)), 'application/gpx+xml');
  }

  // ── wiring ─────────────────────────────────────────────────────────────────────────────
  form.addEventListener('submit', e => { e.preventDefault(); generate(randomSeed(), goBtn); });
  againBtn.addEventListener('click', () => generate(nextSeed(st.seed ?? randomSeed()), againBtn));
  form.addEventListener('change', e => {
    if (e.target.name === 'profile') Object.assign(kmInput, { min: PROFILES[currentProfile()].min, max: PROFILES[currentProfile()].max });
    if (e.target.name === 'profile' || e.target === kmInput) validateKm();
    syncStale();
  });
  // While typing, re-check only once a message shows, so it clears as soon as the value is fixed.
  kmInput.addEventListener('input', () => { if (kmInput.getAttribute('aria-invalid') === 'true') validateKm(); syncStale(); });
  el.querySelectorAll('[data-run]').forEach(b => b.addEventListener('click', () => {
    st.from = runs.find(w => w.id === b.dataset.run) || null;
    if (!st.from) return;
    kmInput.value = String(st.from.distanceKm);
    if (currentProfile() === 'ride') form.querySelector('input[name="profile"][value="run"]').click();
    validateKm();
    syncFrom();
    syncStale();
  }));
  $('#rt-for-clear').addEventListener('click', () => { st.from = null; syncFrom(); });
  $('#rt-locate').addEventListener('click', e => busy(e.currentTarget, async () => {
    setMsg('#rt-start-msg', 'Finding your location…');
    try {
      const point = await currentPosition();
      if (!alive()) return;
      setStart(point, 'location');
      if (mapCtx) mapCtx.map.setView(st.start, Math.max(mapCtx.map.getZoom() || 0, START_ZOOM));
    } catch (ex) {
      if (alive()) setMsg('#rt-start-msg', ex.message, true);
    }
  }));
  saveBtn.addEventListener('click', async () => {
    if (!st.start) return;
    const next = { lat: st.start[0], lng: st.start[1] };
    await busy(saveBtn, async () => {
      try {
        const saved = await api.put('/api/settings', { home: next });
        const savedHome = (saved && saved.home) || next;
        const cur = peekState();
        if (cur) patchState({ settings: { ...(cur.settings || {}), home: savedHome } });
        if (!alive()) return;
        st.home = [savedHome.lat, savedHome.lng];
        st.startKind = 'home';
        toast('Home saved', { kind: 'ok' });
      } catch (ex) {
        if (alive()) setMsg('#rt-start-msg', ex.message, true);
      }
    });
    if (alive()) syncStart(); // after busy(), which re-enables the button on its way out
  });
  results.addEventListener('change', e => { if (e.target.name === 'variant') select(Number(e.target.value)); });
  results.addEventListener('click', e => {
    const b = e.target.closest('[data-export]');
    if (b) exportRoute(b.dataset.export);
  });

  const scheme = matchMedia('(prefers-color-scheme: dark)');
  scheme.addEventListener('change', styleLines);

  syncStart();
  syncFrom();
  if (p.km) validateKm();
  initMap();

  return () => {
    disposed = true;
    scheme.removeEventListener('change', styleLines);
    destroy(mapCtx); // null-safe: the map may never have loaded
    mapCtx = null;
  };
}
