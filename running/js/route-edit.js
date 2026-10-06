// The pure half of the route editor (views/routes-edit.js holds the map half). A planned route is
// a list of handles, [lat, lng] points the route must pass through in order, plus a loop flag
// (back to the first point at the end). Every list operation returns a new list, or the same one
// when the edit is refused, so a caller can tell "no change" by identity. Tested in
// tests/route-edit.test.mjs.
import { haversineKm, samplePoints, cumulativeKm } from './geo.js';
import { decodePolyline } from './polyline.js';

export const MAX_POINTS = 30;      // the API's limit for POST /api/routes/plan
export const UNDO_LIMIT = 30;
export const NUDGE_M = 20;         // an arrow key; with Shift, NUDGE_FAR_M
export const NUDGE_FAR_M = 100;
const LOOP_TOLERANCE_KM = 0.15;    // a round trip comes back to within this of where it began
const M_PER_DEG = 111195;          // metres per degree of latitude (mean Earth radius)

const toRad = deg => deg * Math.PI / 180;
const round5 = x => Math.round(x * 1e5) / 1e5;
/** Five decimals is about a metre, and keeps the request small. */
export const roundPoint = p => [round5(p[0]), round5(p[1])];
/** The same place to five decimals; false when either is missing. */
export const samePoint = (a, b) => !!a && !!b && round5(a[0]) === round5(b[0]) && round5(a[1]) === round5(b[1]);

// ── handle lists ────────────────────────────────────────────────────────────

export function addPoint(handles, point) {
  return handles.length >= MAX_POINTS ? handles : [...handles, roundPoint(point)];
}

export function movePoint(handles, i, point) {
  if (!(i >= 0 && i < handles.length)) return handles;
  return handles.map((h, k) => (k === i ? roundPoint(point) : h));
}

/** Leg k runs from handle k to handle k + 1 (on a loop the last leg runs back to the start). */
export function insertPoint(handles, leg, point) {
  if (handles.length >= MAX_POINTS || !(leg >= 0 && leg < handles.length)) return handles;
  return [...handles.slice(0, leg + 1), roundPoint(point), ...handles.slice(leg + 1)];
}

/**
 * Two points in a row in the same place (on a loop the last point and the start are in a row too):
 * the API refuses them, as OpenRouteService fails on a zero-length leg, so they are never sent.
 */
export function hasRepeat(handles, loop) {
  for (let i = 1; i < handles.length; i++) if (samePoint(handles[i - 1], handles[i])) return true;
  return loop && handles.length > 1 && samePoint(handles[handles.length - 1], handles[0]);
}

/** The start is where the route begins, so it can only be moved; and a route needs two points. */
export const canRemovePoint = (handles, i) => i > 0 && i < handles.length && handles.length > 2;

export function removePoint(handles, i) {
  return canRemovePoint(handles, i) ? handles.filter((_, k) => k !== i) : handles;
}

/**
 * The handles a moving point is joined to while it moves: { point: i } a handle being dragged,
 * { leg: k } a new one pulled out of leg k. Each is [prev, next] without the ones that do not
 * exist; on a loop the start and the last point are joined by the way home.
 */
export function neighbours(handles, loop, { point, leg }) {
  const n = handles.length, out = [];
  const add = i => { if (i >= 0 && i < n && i !== point) out.push(handles[i]); };
  if (leg != null) {
    add(leg);
    add(leg + 1 < n ? leg + 1 : loop ? 0 : -1);
    return out;
  }
  add(point > 0 ? point - 1 : loop && n > 2 ? n - 1 : -1);
  add(point + 1 < n ? point + 1 : loop && n > 2 ? 0 : -1);
  return out;
}

// ── geometry ────────────────────────────────────────────────────────────────

/**
 * The leg a segment of the line belongs to. wayPoints[k] is the line index of handle k (the API
 * sends them, plus the start again on a loop); segment i runs from vertex i to i + 1. -1 when
 * there is no leg to find.
 */
export function legForGeometryIndex(wayPoints, i) {
  if (!Array.isArray(wayPoints) || wayPoints.length < 2) return -1;
  let leg = 0;
  while (leg < wayPoints.length - 2 && wayPoints[leg + 1] <= i) leg++;
  return leg;
}

/**
 * The point on the line nearest to `latlng`: { index (the segment it lies on), point, distanceM },
 * or null for no line. Flat metres around `latlng` are exact enough at the scale of a click.
 */
export function nearestOnPath(points, latlng) {
  if (!Array.isArray(points) || !points.length) return null;
  const [lat0, lng0] = latlng;
  const kx = M_PER_DEG * Math.cos(toRad(lat0));
  const xy = ([lat, lng]) => [(lng - lng0) * kx, (lat - lat0) * M_PER_DEG];
  if (points.length === 1) {
    const [x, y] = xy(points[0]);
    return { index: 0, point: points[0], distanceM: Math.hypot(x, y) };
  }
  let best = null;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = xy(points[i]), [bx, by] = xy(points[i + 1]);
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2)) : 0;
    const px = ax + t * dx, py = ay + t * dy, d = Math.hypot(px, py);
    if (!best || d < best.distanceM) best = { index: i, distanceM: d, point: [lat0 + py / M_PER_DEG, lng0 + px / kx] };
  }
  return best;
}

/** `point` moved east and north by the given metres. */
export function nudge([lat, lng], eastM, northM) {
  return roundPoint([lat + northM / M_PER_DEG, lng + eastM / (M_PER_DEG * Math.cos(toRad(lat)))]);
}

const ARROWS = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

/** [eastM, northM] for an arrow key, or null for any other key. */
export function nudgeForKey(key, far) {
  const dir = ARROWS[key];
  if (!dir) return null;
  const m = far ? NUDGE_FAR_M : NUDGE_M;
  return [dir[0] * m, dir[1] * m];
}

export const isClosedPath = points => points.length > 2 && haversineKm(points[0], points[points.length - 1]) <= LOOP_TOLERANCE_KM;

/**
 * Handles that re-plan a route faithfully: its start (or the one given), then n points spread
 * along it by distance, and a loop when the route comes back to where it began.
 */
export function handlesFromRoute(points, n, { start } = {}) {
  return {
    handles: [roundPoint(start || points[0]), ...samplePoints(points, n).map(roundPoint)],
    loop: isClosedPath(points),
  };
}

/** The handles between origin and destination; on a loop the destination is the start again. */
export const viaPoints = (handles, loop) => (loop ? handles.slice(1) : handles.slice(1, -1));

/**
 * Way points worked out from the line, for an answer whose own do not fit the handles: the first
 * handle is the first vertex, the last stop the last one, and each handle between is the nearest
 * vertex at or after the one before it.
 */
export function matchWayPoints(points, handles, loop) {
  const last = points.length - 1;
  const out = [0];
  const between = loop ? handles.slice(1) : handles.slice(1, -1);
  for (const h of between) {
    let best = out[out.length - 1], bestKm = Infinity;
    for (let i = best; i <= last; i++) {
      const km = haversineKm(points[i], h);
      if (km < bestKm) { bestKm = km; best = i; }
    }
    out.push(best);
  }
  if (handles.length > 1) out.push(last);
  return out;
}

function fits(wayPoints, count, last) {
  return Array.isArray(wayPoints) && wayPoints.length === count
    && wayPoints.every((w, i) => Number.isInteger(w) && w >= 0 && w <= last && (i === 0 || w >= wayPoints[i - 1]));
}

/**
 * The API's route (POST /api/routes/plan) as the view draws it: decoded points, distance along
 * them, and way points that fit the handles it was planned through. null when no line came back.
 */
export function planToRoute(route, handles, loop) {
  const points = decodePolyline(route && route.polyline);
  if (points.length < 2) return null;
  const count = handles.length + (loop ? 1 : 0);
  const wayPoints = fits(route.wayPoints, count, points.length - 1) ? route.wayPoints : matchWayPoints(points, handles, loop);
  return {
    distanceKm: route.distanceKm, ascentM: route.ascentM, descentM: route.descentM,
    elevations: Array.isArray(route.elevations) ? route.elevations : [],
    surface: route.surface || {}, points, cum: cumulativeKm(points), wayPoints,
  };
}

// ── undo / redo ─────────────────────────────────────────────────────────────
// A snapshot is { handles, loop, route }: route is the line those handles were planned into, when
// it is known, so stepping back to it needs no new request.

export const emptyHistory = () => ({ past: [], future: [] });

/** Remember `snapshot` (the state before an edit). A new edit drops whatever could be redone. */
export function record(history, snapshot, limit = UNDO_LIMIT) {
  return { past: [...history.past, snapshot].slice(-limit), future: [] };
}

export function undo(history, current) {
  if (!history.past.length) return null;
  return { history: { past: history.past.slice(0, -1), future: [current, ...history.future] }, snapshot: history.past[history.past.length - 1] };
}

export function redo(history, current) {
  if (!history.future.length) return null;
  return { history: { past: [...history.past, current], future: history.future.slice(1) }, snapshot: history.future[0] };
}

// ── request sequencing ──────────────────────────────────────────────────────

/** Tickets: an answer counts only if no newer ticket was taken while it was on its way. */
export function latest() {
  let n = 0;
  return { next: () => ++n, isLatest: t => t === n };
}

/**
 * At most one request in flight. An edit made while one flies is not sent at once: when the flight
 * lands its answer is dropped (it is for an older state) and one request goes for the newest state,
 * however many edits came in meanwhile. send() reads the state when it is called.
 *   request()  there is a new state to plan;  cancel()  drop the answer in flight, if any.
 */
export function createPlanner({ send, onResult, onError = () => {}, onBusy = () => {} }) {
  const guard = latest();
  let ticket = 0, flying = false, queued = false;

  async function fly() {
    flying = true;
    queued = false;
    const mine = ticket;
    let ok = true, value;
    try { value = await send(); } catch (e) { ok = false; value = e; }
    flying = false;
    if (queued) { fly(); return; }
    onBusy(false);
    if (!guard.isLatest(mine)) return;
    if (ok) onResult(value); else onError(value);
  }

  return {
    request() {
      ticket = guard.next();
      if (flying) { queued = true; return; }
      onBusy(true);
      fly();
    },
    cancel() { ticket = guard.next(); queued = false; },
    get busy() { return flying; },
  };
}
