// Tests for js/route-edit.js: the pure half of the route editor (handle lists, leg lookup, the
// nearest point on a line, keyboard nudges, undo/redo, and the one-request-at-a-time planner).
// The map half (markers, dragging) is checked by the smoke test and by screenshot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_POINTS, UNDO_LIMIT, samePoint, addPoint, movePoint, insertPoint, canRemovePoint, removePoint,
  neighbours, legForGeometryIndex, nearestOnPath, nearestGeometryIndex, nudge, nudgeForKey, isClosedPath,
  handlesFromRoute, viaPoints, matchWayPoints, planToRoute, emptyHistory, record, undo, redo,
  latest, createPlanner,
} from '../js/route-edit.js';
import { haversineKm } from '../js/geo.js';
import { encodePolyline } from '../js/polyline.js';

const A = [55.7, 12.55], B = [55.71, 12.56], C = [55.72, 12.55], D = [55.71, 12.54];
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const tick = () => new Promise(r => setImmediate(r));

// ── handle lists ────────────────────────────────────────────────────────────

test('samePoint compares to five decimals, and is false for a missing point', () => {
  assert.equal(samePoint([55.700001, 12.55], [55.7, 12.550004]), true);
  assert.equal(samePoint(A, B), false);
  assert.equal(samePoint(A, null), false);
  assert.equal(samePoint(undefined, A), false);
});

test('addPoint appends a rounded copy and never touches the original', () => {
  const handles = [A];
  const next = addPoint(handles, [55.123456789, 12.987654321]);
  assert.deepEqual(next, [A, [55.12346, 12.98765]]);
  assert.deepEqual(handles, [A], 'the input list is unchanged');
});

test(`addPoint stops at ${MAX_POINTS} points (the API's limit)`, () => {
  const full = Array.from({ length: MAX_POINTS }, (_, i) => [55 + i / 1000, 12]);
  assert.equal(addPoint(full, B), full, 'a full list comes back as it was');
  assert.equal(insertPoint(full, 3, B), full);
});

test('movePoint replaces one point', () => {
  const handles = [A, B, C];
  assert.deepEqual(movePoint(handles, 1, D), [A, D, C]);
  assert.deepEqual(handles, [A, B, C]);
  assert.equal(movePoint(handles, 7, D), handles, 'an index out of range is ignored');
});

test('insertPoint puts the new point between the two ends of the leg', () => {
  const handles = [A, B, C];
  assert.deepEqual(insertPoint(handles, 0, D), [A, D, B, C]);
  assert.deepEqual(insertPoint(handles, 1, D), [A, B, D, C]);
  // On a loop the last leg runs from the last point back to the start: the new point goes last.
  assert.deepEqual(insertPoint(handles, 2, D), [A, B, C, D]);
  assert.equal(insertPoint(handles, -1, D), handles);
  assert.equal(insertPoint(handles, 3, D), handles, 'there is no fourth leg');
});

test('removePoint keeps the start and at least two points', () => {
  assert.deepEqual(removePoint([A, B, C], 1), [A, C]);
  assert.deepEqual(removePoint([A, B, C], 2), [A, B]);
  const three = [A, B, C];
  assert.equal(removePoint(three, 0), three, 'the start stays');
  const two = [A, B];
  assert.equal(removePoint(two, 1), two, 'two points stay');
  assert.equal(canRemovePoint(three, 1), true);
  assert.equal(canRemovePoint(three, 0), false);
  assert.equal(canRemovePoint(two, 1), false);
  assert.equal(canRemovePoint(three, 5), false);
});

test('neighbours: the points a dragged handle (or a pulled leg) is joined to, for the preview', () => {
  const handles = [A, B, C, D];
  assert.deepEqual(neighbours(handles, true, { point: 2 }), [B, D]);
  assert.deepEqual(neighbours(handles, true, { point: 0 }), [D, B], 'on a loop the start is joined to the last point');
  assert.deepEqual(neighbours(handles, false, { point: 0 }), [B]);
  assert.deepEqual(neighbours(handles, false, { point: 3 }), [C], 'the finish of a one-way route has one neighbour');
  assert.deepEqual(neighbours(handles, true, { point: 3 }), [C, A]);
  assert.deepEqual(neighbours(handles, true, { leg: 1 }), [B, C]);
  assert.deepEqual(neighbours(handles, true, { leg: 3 }), [D, A], 'the leg home');
  assert.deepEqual(neighbours([A], true, { point: 0 }), []);
});

// ── geometry ────────────────────────────────────────────────────────────────

test('legForGeometryIndex maps a segment of the line to the leg it belongs to', () => {
  const wayPoints = [0, 10, 25, 40]; // three handles and the loop back to the start
  assert.equal(legForGeometryIndex(wayPoints, 0), 0);
  assert.equal(legForGeometryIndex(wayPoints, 9), 0);
  assert.equal(legForGeometryIndex(wayPoints, 10), 1);
  assert.equal(legForGeometryIndex(wayPoints, 24), 1);
  assert.equal(legForGeometryIndex(wayPoints, 25), 2);
  assert.equal(legForGeometryIndex(wayPoints, 39), 2);
  assert.equal(legForGeometryIndex(wayPoints, 40), 2, 'the last vertex still belongs to the last leg');
  assert.equal(legForGeometryIndex([0, 12], 5), 0);
  assert.equal(legForGeometryIndex([0], 0), -1, 'one way point has no leg');
  assert.equal(legForGeometryIndex(null, 3), -1);
});

test('nearestOnPath projects onto the closest segment, between its vertices', () => {
  const line = [[55.7, 12.5], [55.7, 12.52], [55.72, 12.52]];
  const hit = nearestOnPath(line, [55.7005, 12.51]);
  assert.equal(hit.index, 0);
  assert.ok(Math.abs(hit.point[0] - 55.7) < 1e-6 && Math.abs(hit.point[1] - 12.51) < 1e-6, `on the line: ${hit.point}`);
  assert.ok(Math.abs(hit.distanceM - 55.6) < 1, `about 56 m off (${hit.distanceM})`);
  assert.equal(nearestGeometryIndex(line, [55.71, 12.5205]), 1);
  assert.equal(nearestGeometryIndex(line, [55.8, 12.6]), 1, 'past the end clamps to the last segment');
  assert.deepEqual(nearestOnPath([[55, 12]], [55.1, 12]).point, [55, 12], 'one vertex is its own nearest point');
  assert.equal(nearestOnPath([], A), null);
  assert.equal(nearestGeometryIndex([], A), -1);
});

test('nudge moves a point by metres east and north', () => {
  const north = nudge(A, 0, 100);
  assert.ok(Math.abs(haversineKm(A, north) - 0.1) < 0.002);
  assert.ok(north[0] > A[0] && north[1] === A[1]);
  const east = nudge(A, 20, 0);
  assert.ok(Math.abs(haversineKm(A, east) - 0.02) < 0.002);
  assert.ok(east[1] > A[1] && east[0] === A[0]);
  assert.deepEqual(nudge(A, 0, 0), A);
});

test('nudgeForKey: arrows are 20 m, with Shift 100 m; other keys are not nudges', () => {
  assert.deepEqual(nudgeForKey('ArrowUp', false), [0, 20]);
  assert.deepEqual(nudgeForKey('ArrowDown', false), [0, -20]);
  assert.deepEqual(nudgeForKey('ArrowLeft', true), [-100, 0]);
  assert.deepEqual(nudgeForKey('ArrowRight', true), [100, 0]);
  assert.equal(nudgeForKey('Enter', false), null);
});

const LOOP = Array.from({ length: 41 }, (_, i) => {
  const a = (i / 40) * 2 * Math.PI;
  return [55.7 + 0.01 * Math.sin(a), 12.55 + 0.018 * (1 - Math.cos(a))];
});

test('isClosedPath: a loop ends where it starts, an out-and-away does not', () => {
  assert.equal(isClosedPath(LOOP), true);
  assert.equal(isClosedPath(LOOP.slice(0, 20)), false);
  assert.equal(isClosedPath([A]), false);
});

test('handlesFromRoute: the start, then points spread along the route, as a loop', () => {
  const { handles, loop } = handlesFromRoute(LOOP, 6);
  assert.equal(loop, true);
  assert.equal(handles.length, 7);
  assert.deepEqual(handles[0], LOOP[0]);
  assert.ok(handles.slice(1).every(h => LOOP.some(p => haversineKm(p, h) < 0.002)), 'the rest lie on the route');
  const own = handlesFromRoute(LOOP, 6, { start: [55.69999, 12.55001] });
  assert.deepEqual(own.handles[0], [55.69999, 12.55001], 'a given start is kept as the first point');
  assert.equal(handlesFromRoute(LOOP.slice(0, 20), 3).loop, false);
});

test('viaPoints: what lies between origin and destination', () => {
  assert.deepEqual(viaPoints([A, B, C], true), [B, C], 'a loop ends at the start, so every other point is on the way');
  assert.deepEqual(viaPoints([A, B, C], false), [B]);
  assert.deepEqual(viaPoints([A], true), []);
});

test('matchWayPoints finds each handle along the line, in order', () => {
  const handles = [LOOP[0], LOOP[10], LOOP[25]];
  assert.deepEqual(matchWayPoints(LOOP, handles, true), [0, 10, 25, 40]);
  assert.deepEqual(matchWayPoints(LOOP.slice(0, 31), handles, false), [0, 10, 30]);
});

// ── the plan answer ─────────────────────────────────────────────────────────

const planned = (extra = {}) => ({
  distanceKm: 5.1, ascentM: 31, descentM: 30, polyline: encodePolyline(LOOP),
  elevations: LOOP.map(() => 12), surface: { paved: 0.8, unpaved: 0.2, unknown: 0 },
  wayPoints: [0, 10, 25, 40], ...extra,
});

test('planToRoute decodes the line and keeps valid way points', () => {
  const route = planToRoute(planned(), [LOOP[0], LOOP[10], LOOP[25]], true);
  assert.equal(route.points.length, 41);
  assert.deepEqual(route.wayPoints, [0, 10, 25, 40]);
  assert.equal(route.cum.length, 41);
  assert.equal(route.cum[0], 0);
  assert.ok(route.cum[40] > 6.5 && route.cum[40] < 7.5, `a loop of radius ~1.1 km (${route.cum[40]})`);
  assert.equal(route.distanceKm, 5.1);
});

test('planToRoute rebuilds way points that do not fit the handles', () => {
  const handles = [LOOP[0], LOOP[10], LOOP[25]];
  for (const wayPoints of [undefined, [0, 10, 40], [0, 30, 10, 40], [0, 10, 25, 99], ['a', 1, 2, 3]]) {
    assert.deepEqual(planToRoute(planned({ wayPoints }), handles, true).wayPoints, [0, 10, 25, 40], JSON.stringify(wayPoints));
  }
});

test('planToRoute: no usable line is no route', () => {
  assert.equal(planToRoute(planned({ polyline: '' }), [A, B], false), null);
  assert.equal(planToRoute(null, [A, B], false), null);
});

// ── undo / redo ─────────────────────────────────────────────────────────────

const snap = handles => ({ handles, loop: true, route: null });

test('undo and redo step through snapshots; a new edit clears redo', () => {
  let h = emptyHistory();
  assert.equal(undo(h, snap([A])), null, 'nothing to undo');
  h = record(h, snap([A]));
  h = record(h, snap([A, B]));
  const current = snap([A, B, C]);
  const back = undo(h, current);
  assert.deepEqual(back.snapshot.handles, [A, B]);
  const again = undo(back.history, back.snapshot);
  assert.deepEqual(again.snapshot.handles, [A]);
  assert.equal(undo(again.history, again.snapshot), null);
  const fwd = redo(again.history, again.snapshot);
  assert.deepEqual(fwd.snapshot.handles, [A, B]);
  const fwd2 = redo(fwd.history, fwd.snapshot);
  assert.equal(fwd2.snapshot, current);
  assert.equal(redo(fwd2.history, fwd2.snapshot), null);
  const branched = record(fwd.history, fwd.snapshot);
  assert.equal(redo(branched, snap([A, D])), null, 'a new edit drops what could be redone');
});

test(`undo keeps the last ${UNDO_LIMIT} steps`, () => {
  let h = emptyHistory();
  for (let i = 0; i < UNDO_LIMIT + 10; i++) h = record(h, snap([[55 + i / 100, 12]]));
  assert.equal(h.past.length, UNDO_LIMIT);
  assert.deepEqual(h.past[0].handles, [[55.1, 12]], 'the oldest ones go first');
});

// ── request sequencing ──────────────────────────────────────────────────────

test('latest(): only the newest ticket counts', () => {
  const guard = latest();
  const a = guard.next();
  const b = guard.next();
  assert.equal(guard.isLatest(a), false);
  assert.equal(guard.isLatest(b), true);
});

function plannerRig() {
  const sent = [], results = [], errors = [], busy = [];
  let version = 0;
  const flights = [];
  const planner = createPlanner({
    send: () => { const d = deferred(); sent.push(version); flights.push(d); return d.promise; },
    onResult: r => results.push(r),
    onError: e => errors.push(e.message),
    onBusy: b => busy.push(b),
  });
  return { planner, sent, results, errors, busy, flights, edit: () => { version++; planner.request(); } };
}

test('planner: one request at a time; edits made meanwhile are sent once, with the newest state', async () => {
  const rig = plannerRig();
  rig.edit();
  rig.edit();
  rig.edit();
  assert.deepEqual(rig.sent, [1], 'only the first edit is in flight');
  assert.equal(rig.planner.busy, true);
  rig.flights[0].resolve('stale');
  await tick();
  assert.deepEqual(rig.results, [], 'the answer to an older edit is dropped');
  assert.deepEqual(rig.sent, [1, 3], 'the newest state goes next, the middle one never');
  rig.flights[1].resolve('fresh');
  await tick();
  assert.deepEqual(rig.results, ['fresh']);
  assert.deepEqual(rig.busy, [true, false], 'busy once for the whole chain');
  assert.equal(rig.planner.busy, false);
});

test('planner: an error for a stale request is dropped too; a current one is reported', async () => {
  const rig = plannerRig();
  rig.edit();
  rig.edit();
  rig.flights[0].reject(new Error('old'));
  await tick();
  rig.flights[1].reject(new Error('new'));
  await tick();
  assert.deepEqual(rig.errors, ['new']);
  assert.deepEqual(rig.results, []);
});

test('planner: cancel drops the answer in flight', async () => {
  const rig = plannerRig();
  rig.edit();
  rig.planner.cancel();
  rig.flights[0].resolve('late');
  await tick();
  assert.deepEqual(rig.results, []);
  assert.deepEqual(rig.busy, [true, false]);
  rig.edit();
  rig.flights[1].resolve('next');
  await tick();
  assert.deepEqual(rig.results, ['next'], 'and the planner carries on afterwards');
});
