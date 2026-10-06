// The route editor's map half, for views/routes.js: a drawn route, or a generated one being
// reshaped, as handles the route passes through. Handles are dragged, clicked away or moved with
// the arrow keys; the line itself is grabbed to add a handle where it is pulled, the way Cake,
// Coffee & Cadence's shaping points work (with a finger, a tap on the line adds one there). Every edit re-plans the route along real paths
// (POST /api/routes/plan); the old line stays, faded, until the new one arrives. The pure half
// (handle lists, undo, one request at a time) is js/route-edit.js.
import { addHandle, updateHandle, addLine, cssVar } from '../map.js';
import {
  MAX_POINTS, addPoint, movePoint, insertPoint, canRemovePoint, removePoint, hasRepeat, neighbours, legForGeometryIndex,
  nearestOnPath, nudge, nudgeForKey, planToRoute, samePoint, emptyHistory, record, undo, redo, createPlanner,
} from '../route-edit.js';

const LINE_WEIGHT = 5;
const STALE_OPACITY = 0.4;
const STALE_DASH = '2 9';
const GHOST_RADIUS_PX = 6;
const BAND_STYLE = { weight: 2.5, opacity: 0.9, dashArray: '6 7' };
const DRAG_START_PX = 4;          // a press on the line that moves less than this adds nothing
const CLICK_GUARD_MS = 350;       // the click that ends a drag is not also a click on the map
const DOUBLE_CLICK_MS = 400;      // a double click on the map adds one point: its second click lands on it
const NUDGE_PAUSE_MS = 600;       // arrow presses closer than this are one move: one undo step, one plan
const COARSE = '(pointer: coarse)'; // a finger cannot pull a line, so a tap on it adds a point there
const HELP_ID = 'rt-handle-help'; // the handles' shared description (routes-ui.js)
const UNROUTABLE = /routable point/i;
const MESSAGES = {
  far: 'That point is too far from any path — try closer to a road or trail.',
  start: 'The start can’t be removed. Drag it to move the start.',
  two: 'A route needs at least two points.',
  same: 'Two points in a row can’t be in the same place.',
  full: `A route can have up to ${MAX_POINTS} points.`,
  empty: 'No route came back for these points. Try moving one.',
};

/**
 * request(body) → the API's answer; profile() → 'run' | 'trail' | 'ride', read at each plan;
 * describe(error) → text to show; onChange() after any change (read .state); onStartMoved([lat, lng])
 * when the first handle moves; onLost(text) when a plan fails with no earlier route to fall back to.
 */
export function createEditor({ request, profile, describe, onChange, onStartMoved, onLost }) {
  // planned: the inputs the route was made from. While they differ from the current ones the route
  // on screen is the old one, faded, and a plan is on its way.
  let s = { handles: [], loop: true, route: null, planned: null };
  let history = emptyHistory();
  let good = null;                 // the last state whose route fitted its handles, to fall back to
  let message = null, nextMessage = null, lastAsked = null;
  let ctx = null, shown = false, markers = [], line = null, lineRoute = null, ghost = null, band = null;
  let dragging = false, grab = null, quietUntil = 0, addedUntil = 0, lastStart = null;
  let nudging = null, nudgeTimer = null; // a run of arrow presses on one point, and its pending plan

  const inputs = () => ({ handles: s.handles, loop: s.loop, profile: profile() });
  const sameInputs = (a, b) => !!a && !!b && a.handles === b.handles && a.loop === b.loop && a.profile === b.profile;
  const fresh = () => sameInputs(s.planned, inputs());
  const snapshot = () => (fresh() ? { ...s } : { ...s, route: null, planned: null });

  const planner = createPlanner({
    send: async () => {
      const sent = inputs();
      const res = await request({ points: sent.handles, profile: sent.profile, loop: sent.loop });
      const route = planToRoute(res && res.route, sent.handles, sent.loop);
      if (!route) throw new Error(MESSAGES.empty);
      return { sent, route };
    },
    onResult: ({ sent, route }) => {
      if (!sameInputs(sent, inputs())) { settle(); return; } // a profile change slipped past the planner
      s = { ...s, route, planned: sent };
      good = { s, history };
      message = nextMessage;
      nextMessage = null;
      changed();
    },
    onError: e => {
      const text = UNROUTABLE.test(e.message || '') ? MESSAGES.far : describe(e);
      if (!good) { onLost(text); return; }
      // Put the handles back where they were: what is on screen always matches its line.
      s = good.s;
      history = good.history;
      message = { kind: 'error', text };
      changed();
    },
    onBusy: () => changed(),
  });

  // Every cancel forgets what was last asked for: the same inputs asked again (a redo while their
  // first plan is still in flight) must be sent again, as that flight's answer is now dropped.
  function cancelPlan() {
    planner.cancel();
    lastAsked = null;
  }

  function endNudge() {
    clearTimeout(nudgeTimer);
    nudgeTimer = null;
    nudging = null;
  }

  // Plan when the inputs have moved on from the route; otherwise this state is one to fall back to.
  function settle() {
    if (s.handles.length < 2) {
      cancelPlan();
      s = { ...s, route: null, planned: inputs() };
    }
    if (fresh()) {
      cancelPlan();
      good = { s, history };
    } else {
      const want = inputs();
      if (!(planner.busy && sameInputs(lastAsked, want))) { lastAsked = want; planner.request(); }
    }
    changed();
  }

  function commit(handles, loop = s.loop) {
    if (handles === s.handles && loop === s.loop) return false;
    if (hasRepeat(handles, loop)) { say('info', MESSAGES.same); return false; }
    endNudge();
    history = record(history, snapshot());
    s = { ...s, handles, loop }; // route and planned stay: the old line shows, faded, meanwhile
    message = null;
    settle();
    return true;
  }

  function restore(snap) {
    endNudge();
    s = snap.route ? { ...snap } : { ...s, handles: snap.handles, loop: snap.loop };
    message = null;
    settle();
  }

  const say = (kind, text) => { message = { kind, text }; changed(); };

  function changed() {
    draw();
    const start = s.handles[0];
    if (shown && start && !samePoint(start, lastStart)) {
      lastStart = start;
      onStartMoved(start);
    }
    onChange();
  }

  // ── handles ────────────────────────────────────────────────────────────────────────────
  const kindOf = (i, n) => (i === 0 ? 'start' : !s.loop && i === n - 1 ? 'end' : 'via');
  function labelOf(i, n) {
    if (i === 0) return 'Start of the route';
    return kindOf(i, n) === 'end' ? `Point ${i + 1} of ${n}, the finish` : `Point ${i + 1} of ${n}`;
  }

  function syncMarkers() {
    if (dragging) return; // never pull a handle back from under the pointer
    const n = s.handles.length;
    while (markers.length > n) markers.pop().remove();
    s.handles.forEach((p, i) => {
      const look = { label: labelOf(i, n), kind: kindOf(i, n) };
      if (markers[i]) { markers[i].setLatLng(p); updateHandle(markers[i], look); return; }
      const m = addHandle(ctx, p, {
        ...look,
        onDragStart: () => { dragging = true; hideGhost(); if (line) line.setStyle({ opacity: STALE_OPACITY }); },
        onDrag: q => at(m, i2 => showBand(neighbours(s.handles, s.loop, { point: i2 }), q)),
        onDragEnd: q => {
          dragging = false;
          hideBand();
          quietUntil = Date.now() + CLICK_GUARD_MS;
          at(m, i2 => commit(movePoint(s.handles, i2, q)));
        },
        onClick: () => at(m, clickPoint),
        onKey: e => at(m, i2 => key(i2, e)),
      });
      m.getElement().setAttribute('aria-describedby', HELP_ID);
      markers.push(m);
    });
  }

  function at(marker, fn) {
    const i = markers.indexOf(marker);
    return i < 0 ? false : fn(i);
  }

  function remove(i) {
    if (!canRemovePoint(s.handles, i)) { say('info', i === 0 ? MESSAGES.start : MESSAGES.two); return; }
    commit(removePoint(s.handles, i));
  }

  // The second click of a double click on the map lands on the point its first click added.
  function clickPoint(i) {
    if (Date.now() < addedUntil) return;
    remove(i);
  }

  function key(i, e) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      remove(i);
      // The element at i now stands for the next point; after the last one, focus its predecessor.
      const next = markers[Math.min(i, markers.length - 1)];
      if (next) next.getElement().focus();
      return true;
    }
    const step = nudgeForKey(e.key, e.shiftKey);
    if (!step) return false;
    nudgePoint(i, step[0], step[1]);
    return true;
  }

  // A held arrow key repeats: presses on one point close together are one undo step, and the plan
  // waits for the pause after them rather than going out (and being thrown away) at every press.
  function nudgePoint(i, eastM, northM) {
    if (!(i >= 0 && i < s.handles.length)) return;
    const handles = movePoint(s.handles, i, nudge(s.handles[i], eastM, northM));
    if (hasRepeat(handles, s.loop)) { say('info', MESSAGES.same); return; }
    const now = Date.now();
    if (!(nudging && nudging.index === i && now < nudging.until)) history = record(history, snapshot());
    nudging = { index: i, until: now + NUDGE_PAUSE_MS };
    s = { ...s, handles };
    message = null;
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(() => { endNudge(); settle(); }, NUDGE_PAUSE_MS);
    changed();
  }

  /** A new point on leg k of the line; false when the route is full. */
  function insertAt(leg, point) {
    const handles = insertPoint(s.handles, leg, point);
    if (handles === s.handles) { say('info', MESSAGES.full); return false; }
    return commit(handles);
  }

  // ── the line, and grabbing it ──────────────────────────────────────────────────────────
  function lineStyle() {
    const ok = fresh();
    return { color: cssVar('--accent'), weight: LINE_WEIGHT, opacity: ok ? 1 : STALE_OPACITY, dashArray: ok ? null : STALE_DASH };
  }

  function drawLine() {
    if (s.route !== lineRoute) {
      if (line) line.remove();
      hideGhost();
      lineRoute = s.route;
      line = s.route ? addLine(ctx, s.route.points, { ...lineStyle(), interactive: true }) : null;
      if (line) line.on('mousedown', grabLine).on('mousemove', hover).on('mouseout', hideGhost).on('click', tapLine);
    }
    if (line) line.setStyle(lineStyle());
  }

  function hover(e) {
    if (grab || dragging || !fresh()) { hideGhost(); return; }
    const hit = nearestOnPath(s.route.points, [e.latlng.lat, e.latlng.lng]);
    const style = { color: cssVar('--accent'), fillColor: '#fff' };
    if (ghost) { ghost.setLatLng(hit.point); return; }
    ghost = ctx.L.circleMarker(hit.point, { renderer: ctx.renderer, radius: GHOST_RADIUS_PX, weight: 2, fillOpacity: 1, interactive: false, ...style }).addTo(ctx.map);
  }

  function hideGhost() {
    if (ghost) ghost.remove();
    ghost = null;
  }

  // While a point moves, dashed straight lines join it to its neighbours: where the route will go
  // through, before the re-plan says how.
  function showBand(ends, p) {
    const pts = ends.length === 2 ? [ends[0], p, ends[1]] : [...ends, p];
    if (pts.length < 2) return;
    if (band) { band.setLatLngs(pts); return; }
    band = addLine(ctx, pts, { color: cssVar('--accent'), weight: BAND_STYLE.weight, opacity: BAND_STYLE.opacity });
    band.setStyle({ dashArray: BAND_STYLE.dashArray });
  }

  function hideBand() {
    if (band) band.remove();
    band = null;
  }

  // A press on the line adds a handle where the line was grabbed, on the leg it belongs to, and
  // drags it at once: the route is pulled onto the roads wanted. A press that does not move adds nothing.
  function grabLine(e) {
    const down = e.originalEvent;
    if (!down || down.button !== 0 || !fresh()) return;
    ctx.L.DomEvent.stop(down); // not also the start of a map pan
    hideGhost();
    if (s.handles.length >= MAX_POINTS) { say('info', MESSAGES.full); return; }
    const hit = nearestOnPath(s.route.points, [e.latlng.lat, e.latlng.lng]);
    const leg = legForGeometryIndex(s.route.wayPoints, hit.index);
    if (leg < 0) return;
    let marker = null;
    const move = ev => {
      if (!marker && Math.hypot(ev.clientX - down.clientX, ev.clientY - down.clientY) < DRAG_START_PX) return;
      if (!marker) {
        marker = addHandle(ctx, hit.point, { label: 'New point' });
        marker.getElement().classList.add('is-grabbed');
        line.setStyle({ opacity: STALE_OPACITY });
      }
      const ll = ctx.map.mouseEventToLatLng(ev);
      marker.setLatLng([ll.lat, ll.lng]);
      showBand(neighbours(s.handles, s.loop, { leg }), [ll.lat, ll.lng]);
    };
    const end = commitIt => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.removeEventListener('keydown', esc, true);
      grab = null;
      hideBand();
      if (!marker) return;
      const { lat, lng } = marker.getLatLng();
      marker.remove();
      if (line) line.setStyle(lineStyle()); // as it was, should the pull be called off
      quietUntil = Date.now() + CLICK_GUARD_MS;
      if (commitIt) insertAt(leg, [lat, lng]);
    };
    const up = () => end(true);
    const esc = ev => { if (ev.key === 'Escape') { ev.stopPropagation(); end(false); } };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.addEventListener('keydown', esc, true);
    grab = { end };
  }

  // A finger cannot pull the line (the canvas has no touch drag), so a tap on it adds a point there,
  // to be dragged like any other. A mouse click without a pull adds nothing.
  function tapLine(e) {
    if (typeof matchMedia !== 'function' || !matchMedia(COARSE).matches || !fresh() || Date.now() < quietUntil) return;
    const hit = nearestOnPath(s.route.points, [e.latlng.lat, e.latlng.lng]);
    const leg = legForGeometryIndex(s.route.wayPoints, hit.index);
    if (leg >= 0) insertAt(leg, hit.point);
  }

  // A double click on the map would also zoom it, under the point it just added.
  function zoomOnDoubleClick(on) {
    const dbl = ctx && ctx.map.doubleClickZoom;
    if (dbl) { if (on) dbl.enable(); else dbl.disable(); }
  }

  // ── drawing ────────────────────────────────────────────────────────────────────────────
  function draw() {
    if (!ctx || !shown) return;
    syncMarkers();
    drawLine();
  }

  function clearLayers() {
    if (grab) grab.end(false);
    zoomOnDoubleClick(true);
    markers.forEach(m => m.remove());
    markers = [];
    if (line) line.remove();
    line = null;
    lineRoute = null;
    hideGhost();
    hideBand();
    dragging = false;
  }

  return {
    // fresh: the line on screen was planned through these handles (else it is the old one, faded);
    // pending: a plan is on its way.
    get state() {
      return {
        handles: s.handles, loop: s.loop, route: s.route, fresh: fresh(), pending: planner.busy,
        canUndo: history.past.length > 0, canRedo: history.future.length > 0, message,
      };
    },
    /** A new route to edit. A route given with handles but no plan is shown faded until one arrives. */
    load({ handles, loop, route = null, message: done = null }) {
      cancelPlan();
      endNudge();
      s = { handles, loop, route, planned: null };
      history = emptyHistory();
      good = null;
      message = null;
      nextMessage = done ? { kind: 'info', text: done } : null;
      settle();
    },
    /** A click on the map: a new last point (before the way back, on a loop). */
    addAt(point) {
      if (Date.now() < quietUntil) return;
      const handles = addPoint(s.handles, point);
      if (handles === s.handles) { say('info', MESSAGES.full); return; }
      if (commit(handles)) addedUntil = Date.now() + DOUBLE_CLICK_MS;
    },
    /** A click (or tap) on point i removes it, unless it is the second click of a double click. */
    clickPoint,
    /** Point i moved by metres east and north, as an arrow key does. */
    nudgePoint,
    moveStart(point) {
      if (s.handles.length && samePoint(s.handles[0], point)) return;
      lastStart = point; // the caller already knows
      if (!s.handles.length) { s = { ...s, handles: addPoint([], point) }; settle(); return; }
      commit(movePoint(s.handles, 0, point));
    },
    setLoop(on) { commit(s.handles, !!on); },
    clear() { if (s.handles.length > 1) commit(s.handles.slice(0, 1)); },
    undo() { const step = undo(history, snapshot()); if (step) { history = step.history; restore(step.snapshot); } },
    redo() { const step = redo(history, snapshot()); if (step) { history = step.history; restore(step.snapshot); } },
    /** The profile changed, or the editor is shown again: plan if the route no longer fits. */
    replan: settle,
    setMap(map) { ctx = map; if (shown) zoomOnDoubleClick(false); draw(); },
    show() { shown = true; lastStart = s.handles[0] || null; zoomOnDoubleClick(false); settle(); },
    hide() { shown = false; clearLayers(); },
    restyle() { if (line) line.setStyle(lineStyle()); if (ghost) ghost.setStyle({ color: cssVar('--accent') }); },
    destroy() { cancelPlan(); endNudge(); shown = false; clearLayers(); },
  };
}
