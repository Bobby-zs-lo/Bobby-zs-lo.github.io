// Routes: a route planned three ways. Auto asks the server (OpenRouteService behind it) for three
// round trips of a set length; Draw follows paths and roads between points clicked on the map; and
// any route can be edited, its points and line dragged and re-routed (views/routes-edit.js). The
// route on screen goes out as a GPX file, a Google Maps link, a Strava or Garmin import, or (a ride)
// a Cake, Coffee & Cadence plan (routes-export.js). Desk first (a 380 px panel beside a full-height
// map), stacked on a narrow screen. Markup: routes-ui.js; Start: routes-start.js; Auto's layers: routes-map.js.
import { mount } from '../dom.js';
import { api } from '../api.js';
import { getState, getPlan } from '../store.js';
import { busy, loading, errorState } from '../ui.js';
import { buildHash } from '../router.js';
import { copenhagenToday, formatDate } from '../format.js';
import { cumulativeKm } from '../geo.js';
import { decodePolyline } from '../polyline.js';
import { roundPoint, samePoint, handlesFromRoute, viaPoints } from '../route-edit.js';
import {
  PROFILES, LETTERS, MODES, DEFAULT_KM, planWorkouts, kmError, upcomingRuns,
  pageTpl, statusTpl, resultsTpl, detailTpl, editTpl, liveTpl,
} from './routes-ui.js';
import { bindStart } from './routes-start.js';
import { createEditor } from './routes-edit.js';
import { bindEditTools } from './routes-tools.js';
import { createAutoLayers } from './routes-map.js';
import { exportRoute, routeFilename } from './routes-export.js';
import { createMap, destroy } from '../map.js';

const DENMARK = [55.68, 12.57];
const DENMARK_ZOOM = 11;
const START_ZOOM = 13;
const VARIANTS = 3;
const EDIT_HANDLES = 6;          // points spread along a generated route, to reshape it by
const MAX_SEED = 1e6;            // the API's limit; variant i uses seed + i
const NO_KEY = 'Route generation isn’t set up yet: the OpenRouteService key is missing.';
const NO_PLAN_KEY = 'Route planning isn’t set up yet: the OpenRouteService key is missing.';
const NO_ROUTES = 'No routes came back for this start and distance. Try another start or distance.';

const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
const randomSeed = () => Math.floor(Math.random() * (MAX_SEED - VARIANTS + 1)); // 0 … 1e6 − 3
const nextSeed = s => (s + VARIANTS <= MAX_SEED - VARIANTS ? s + VARIANTS : 0);
const sameList = (a, b) => !!a && a.length === b.length && a.every((x, i) => x === b[i]);

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
    mode: p.mode === 'draw' ? 'draw' : 'auto', editing: false, autoStatus: null,
    home: home ? [home.lat, home.lng] : null, start: null, startKind: null,
    from: (p.from && planWorkouts(plan).find(w => w.id === p.from)) || null,
    seed: null, result: null, selected: 0, pending: false,
  };
  if (st.home) { st.start = st.home; st.startKind = 'home'; }
  const profile = PROFILES[p.profile] ? p.profile : 'run';
  const kmParam = Number(p.km);
  const km = p.km && kmParam > 0 ? round(kmParam, 1) : (st.from ? st.from.distanceKm : DEFAULT_KM[profile]);
  const runs = upcomingRuns(plan, today);

  mount(el, pageTpl({ mode: st.mode, profile, km, runs, fromId: st.from && st.from.id }));
  const $ = sel => el.querySelector(sel);
  const form = $('#rt-form'), kmInput = $('#rt-km'), goBtn = $('#rt-go'), againBtn = $('#rt-again');
  const results = $('#rt-results'), statusBox = $('#rt-status'), body = $('#rt-body');
  const mapEl = $('#rt-map');

  let disposed = false, mapCtx = null, autoEd = null, drawEd = null, lastEdit = null;
  const alive = () => !disposed && ctx.isCurrent();
  const activeEditor = () => (st.mode === 'draw' ? drawEd : st.editing ? autoEd : null);
  const layers = createAutoLayers(() => mapCtx);
  const tools = bindEditTools(el, activeEditor);
  const currentProfile = () => form.profile.value;
  const readKm = () => (kmInput.value.trim() === '' ? NaN : Number(kmInput.value));
  const drawTarget = () => { const k = readKm(); return Number.isFinite(k) && k > 0 ? k : null; };
  const gpxDate = () => ((st.mode === 'auto' && st.result ? st.result.from : st.from) || {}).date || today;
  const selectedVariant = () => st.result && st.result.variants[st.selected];
  const setMsg = (sel, text, isError = false) => {
    const node = $(sel);
    node.textContent = text;
    node.classList.toggle('rt-msg--error', isError);
  };

  // ── start ──────────────────────────────────────────────────────────────────────────────
  const startField = bindStart(el, {
    st, setStart: (point, kind) => setStart(point, kind), alive,
    centreOn: point => { if (mapCtx) mapCtx.map.setView(point, Math.max(mapCtx.map.getZoom() || 0, START_ZOOM)); },
  });

  // The ring marks Auto's start; a route with handles shows its start as a handle instead.
  const placeStart = () => layers.start(activeEditor() ? null : st.start);

  // The form's start is the start of the route on screen. A route's own first handle moving it says
  // so with fromEditor, and a start keeps its name ("Your location") when only that echo comes back.
  function setStart(point, kind, { fromEditor = false } = {}) {
    const next = roundPoint(point);
    st.startKind = samePoint(next, st.home) ? 'home' : samePoint(next, st.start) ? st.startKind : kind;
    st.start = next;
    startField.say('');
    setMsg('#rt-form-msg', '');
    startField.sync();
    placeStart();
    syncStale();
    const ed = activeEditor();
    if (ed && !fromEditor) ed.moveStart(st.start);
  }

  // ── distance, the planned run it is for, the URL ───────────────────────────────────────
  // In Draw the distance is only a target to measure against, so it is never an error.
  function validateKm() {
    const err = st.mode === 'draw' ? '' : kmError(readKm(), currentProfile());
    setMsg('#rt-km-msg', err, true);
    kmInput.setAttribute('aria-invalid', String(!!err));
    return !err;
  }

  function syncFrom() {
    $('#rt-for').hidden = !st.from;
    if (st.from) $('#rt-for-text').textContent = `For: ${st.from.title}, ${formatDate(st.from.date)}`;
    el.querySelectorAll('[data-run]').forEach(b => b.setAttribute('aria-pressed', String(!!st.from && b.dataset.run === st.from.id)));
  }

  // The URL keeps what is asked for, so a reload or a shared link comes back to it.
  function syncHash() {
    const k = readKm(), prof = currentProfile();
    history.replaceState(null, '', buildHash('routes', { km: Number.isFinite(k) ? k : null, profile: prof === 'run' ? null : prof, from: st.from && st.from.id, mode: st.mode === 'draw' ? 'draw' : null }));
  }

  // ── the panel under the form ───────────────────────────────────────────────────────────
  // Says when the routes on screen no longer match the form, so a moved start or a new
  // distance is never mistaken for what the exports contain.
  function syncStale() {
    const r = st.result, note = $('#rt-stale');
    if (note) note.hidden = !r || (samePoint(r.start, st.start) && r.profile === currentProfile() && r.targetKm === readKm());
  }

  // Auto's own status. An editor's panel has its own; this one shows again on the way back.
  function showStatus(kind, text) {
    st.autoStatus = kind ? [kind, text] : null;
    if (!activeEditor()) renderPanel();
  }

  function renderPanel() {
    tools.sync(st.mode === 'draw');
    const ed = activeEditor();
    if (ed) { renderEditor(ed); return; }
    lastEdit = null;
    $('#rt-live').hidden = true;
    const [kind, text] = st.autoStatus || [null];
    mount(statusBox, statusTpl(kind, text));
    results.setAttribute('aria-busy', String(kind === 'loading'));
    const any = !!selectedVariant();
    mount(body, any ? resultsTpl(st.result, st.selected) : '');
    if (any) { renderDetail(); syncStale(); }
    results.hidden = !kind && !any;
  }

  function renderDetail() {
    const r = st.result;
    mount($('#rt-detail'), detailTpl(r, st.selected, routeFilename({ profile: r.profile, route: selectedVariant() }, gpxDate())));
  }

  // Only the detail below the cards is re-rendered, so a radio keeps keyboard focus.
  function select(i) {
    if (!st.result || !st.result.variants[i]) return;
    st.selected = i;
    const radio = el.querySelector(`input[name="variant"][value="${i}"]`);
    if (radio) radio.checked = true;
    renderDetail();
    layers.select(i);
    layers.fit(selectedVariant().points);
  }

  // Re-rendered only when what it shows changed, not on every busy flag.
  function renderEditor(ed) {
    const v = ed.state, draw = st.mode === 'draw';
    const [kind, text] = v.pending ? ['loading', v.route ? 'Re-routing along paths…' : 'Finding a way between your points…'] : v.message ? [v.message.kind, v.message.text] : [null];
    mount(statusBox, statusTpl(kind, text));
    results.hidden = false;
    results.setAttribute('aria-busy', String(v.pending));
    const targetKm = draw ? drawTarget() : st.result.targetKm, prof = currentProfile();
    const live = $('#rt-live');
    live.hidden = !v.route;
    live.classList.toggle('is-stale', !v.fresh);
    mount(live, liveTpl(v.route, targetKm, v.pending));
    const key = [ed, v.route, v.fresh, v.handles.length, v.loop, targetKm, prof];
    if (sameList(lastEdit, key)) return;
    lastEdit = key;
    mount(body, editTpl({
      letter: draw ? null : LETTERS[st.selected], profile: prof, targetKm, start: v.handles[0], route: v.route,
      handles: v.handles, via: viaPoints(v.handles, v.loop), fresh: v.fresh,
      gpxName: v.route ? routeFilename({ profile: prof, route: v.route }, gpxDate()) : '',
    }));
  }

  // ── map, modes and editing ─────────────────────────────────────────────────────────────
  // The three variants show while Auto lists them; an edited or drawn route is its editor's to draw.
  function drawVariants() {
    layers.draw(st.result && !activeEditor() ? st.result.variants : [], st.selected, select);
  }

  // A click on the map moves Auto's start; with handles on screen it adds a point (the first, in
  // an empty Draw, is the start).
  function onMapClick(point) {
    const ed = activeEditor();
    if (!ed || !ed.state.handles.length) setStart(point, 'map');
    else ed.addAt(point);
  }

  async function initMap() {
    let made;
    try {
      made = await createMap(mapEl, { zoomControl: true, scrollWheelZoom: true });
    } catch {
      if (alive()) $('#rt-map-wait').textContent = 'The map couldn’t load. Routes and exports still work.';
      return;
    }
    if (!alive()) { destroy(made); return; }
    mapCtx = made;
    $('#rt-map-wait').hidden = true;
    mapCtx.map.setView(st.start || DENMARK, st.start ? START_ZOOM : DENMARK_ZOOM);
    mapCtx.map.on('click', e => onMapClick([e.latlng.lat, e.latlng.lng]));
    [autoEd, drawEd].forEach(ed => ed && ed.setMap(mapCtx));
    syncMode();
    if (!activeEditor() && selectedVariant()) layers.fit(selectedVariant().points);
  }

  function newEditor() {
    const ed = createEditor({
      request: b => api.post('/api/routes/plan', b),
      profile: currentProfile,
      describe: e => (e.status === 503 ? NO_PLAN_KEY : e.message),
      onChange: () => { if (alive() && ed === activeEditor()) { renderEditor(ed); tools.sync(st.mode === 'draw'); } },
      onStartMoved: point => { if (alive() && ed === activeEditor()) setStart(point, 'map', { fromEditor: true }); },
      onLost: text => { if (alive() && ed === autoEd) { stopEditing(); showStatus('error', text); } },
    });
    if (mapCtx) ed.setMap(mapCtx);
    return ed;
  }

  // Auto or Draw, and within Auto the variants or the one being edited: form, map and panel follow.
  function syncMode() {
    const draw = st.mode === 'draw';
    el.querySelector('.rt').dataset.mode = st.mode;
    $('#rt-mode-help').textContent = MODES[st.mode].help;
    $('#rt-km-label').textContent = MODES[st.mode].km;
    $('#rt-km-help').hidden = !draw;
    $('#rt-actions').hidden = draw;
    validateKm();
    if (draw && !drawEd) {
      drawEd = newEditor();
      drawEd.load({ handles: [], loop: currentProfile() !== 'ride' }); // back to start: on for runs
    }
    const ed = activeEditor();
    [autoEd, drawEd].forEach(e => { if (e && e !== ed) e.hide(); });
    if (ed) {
      ed.show();
      const first = ed.state.handles[0];
      if (!first) { if (st.start) ed.moveStart(st.start); }
      else if (!samePoint(first, st.start)) setStart(first, 'map', { fromEditor: true });
    }
    mapEl.classList.toggle('is-editing', !!ed);
    drawVariants();
    placeStart();
    renderPanel();
  }

  function startEditing() {
    const r = st.result, v = selectedVariant();
    if (!v) return;
    const { handles, loop } = handlesFromRoute(v.points, EDIT_HANDLES, { start: r.start }); // a round trip: a loop
    if (autoEd) autoEd.destroy();
    autoEd = newEditor();
    st.editing = true;
    // The variant shows, faded, until it comes back re-routed through the handles.
    autoEd.load({ handles, loop, route: v, message: `Re-routed through ${handles.length - 1} handles — drag to reshape.` });
    syncMode();
    results.focus();
  }

  function stopEditing() {
    if (autoEd) autoEd.destroy();
    autoEd = null;
    st.editing = false;
    syncMode();
  }

  // ── generate ───────────────────────────────────────────────────────────────────────────
  async function generate(seed, btn) {
    if (st.pending) return;
    if (!validateKm()) { kmInput.focus(); return; }
    if (!st.start) { setMsg('#rt-form-msg', 'Choose a start first: click the map or use your location.', true); return; }
    setMsg('#rt-form-msg', '');
    if (st.editing) stopEditing();
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
        if (autoEd) stopEditing(); // started on the old routes while these were on their way
        Object.assign(st, { seed, selected: 0, result: { profile: request.profile, targetKm: request.km, start: request.start, from: st.from, variants } });
        showStatus(variants.length ? null : 'error', NO_ROUTES);
        drawVariants();
        if (!activeEditor() && variants.length) layers.fit(variants[0].points);
        syncHash();
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

  // The route the exports take: the chosen variant, or an editor's once its line fits its handles.
  function current() {
    const ed = activeEditor(), r = st.result;
    if (!ed) return selectedVariant() ? { profile: r.profile, route: selectedVariant(), start: r.start, targetKm: r.targetKm, via: null } : null;
    const v = ed.state;
    if (!v.route || !v.fresh) return null;
    return { profile: currentProfile(), route: v.route, start: v.handles[0], targetKm: st.mode === 'draw' ? drawTarget() : r.targetKm, via: viaPoints(v.handles, v.loop) };
  }

  // ── wiring ─────────────────────────────────────────────────────────────────────────────
  form.addEventListener('submit', e => { e.preventDefault(); if (st.mode === 'auto') generate(randomSeed(), goBtn); });
  againBtn.addEventListener('click', () => generate(nextSeed(st.seed ?? randomSeed()), againBtn));
  form.addEventListener('change', e => {
    if (e.target.name === 'mode') { st.mode = MODES[e.target.value] ? e.target.value : 'auto'; syncMode(); syncHash(); return; }
    if (e.target.name === 'profile') {
      Object.assign(kmInput, { min: PROFILES[currentProfile()].min, max: PROFILES[currentProfile()].max });
      const ed = activeEditor();
      if (ed) ed.replan(); // a run and a ride take different paths between the same points
    }
    if (e.target.name === 'profile' || e.target === kmInput) validateKm();
    syncStale();
  });
  // While typing, re-check only once a message shows, so it clears as soon as the value is fixed.
  kmInput.addEventListener('input', () => {
    if (kmInput.getAttribute('aria-invalid') === 'true') validateKm();
    syncStale();
    if (activeEditor()) renderPanel(); // the target the readout measures against
  });
  el.querySelectorAll('[data-run]').forEach(b => b.addEventListener('click', () => {
    st.from = runs.find(w => w.id === b.dataset.run) || null;
    if (!st.from) return;
    kmInput.value = String(st.from.distanceKm);
    if (currentProfile() === 'ride') form.querySelector('input[name="profile"][value="run"]').click();
    validateKm();
    syncFrom();
    syncStale();
    if (activeEditor()) renderPanel();
  }));
  $('#rt-for-clear').addEventListener('click', () => { st.from = null; syncFrom(); });
  results.addEventListener('change', e => { if (e.target.name === 'variant') select(Number(e.target.value)); });
  results.addEventListener('click', e => {
    const b = e.target.closest('[data-export]'), c = b && current();
    if (c) exportRoute(b.dataset.export, c, gpxDate());
    if (e.target.closest('[data-edit]')) startEditing();
    if (e.target.closest('[data-back]')) {
      stopEditing();
      const radio = el.querySelector('input[name="variant"]:checked');
      if (radio) radio.focus();
    }
  });

  const scheme = matchMedia('(prefers-color-scheme: dark)');
  const restyle = () => { layers.restyle(); [autoEd, drawEd].forEach(ed => ed && ed.restyle()); };
  scheme.addEventListener('change', restyle);

  results.tabIndex = -1; // focus lands on the panel when the button pressed was replaced
  startField.sync();
  syncFrom();
  syncMode();
  initMap();

  return () => {
    disposed = true;
    scheme.removeEventListener('change', restyle);
    tools.dispose();
    [autoEd, drawEd].forEach(ed => ed && ed.destroy());
    destroy(mapCtx); // null-safe: the map may never have loaded
    mapCtx = null;
  };
}
