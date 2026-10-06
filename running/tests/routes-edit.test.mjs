// Tests for the route editor's state machine (js/views/routes-edit.js createEditor), run in Node with
// no map: request() is a fake whose answers come from the mock's own planner (tests/mock-plan.mjs),
// released one at a time, so a test decides what is in flight when. Drawing is checked by the smoke test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEditor } from '../js/views/routes-edit.js';
import { planRoute } from './mock-plan.mjs';
import { nudge } from '../js/route-edit.js';

const A = [55.7, 12.55], B = [55.705, 12.565], C = [55.712, 12.55], D = [55.706, 12.535];
const tick = () => new Promise(r => setImmediate(r));
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };

function rig() {
  const calls = [], lost = [];
  const ed = createEditor({
    request: body => new Promise((resolve, reject) => calls.push({ body, resolve, reject })),
    profile: () => 'run',
    describe: e => e.message,
    onChange() {},
    onStartMoved() {},
    onLost: text => lost.push(text),
  });
  // Release request i (the latest by default) with what the mock backend would answer.
  const answer = async (i = calls.length - 1) => {
    const c = calls[i];
    try { c.resolve(planRoute(c.body, fail)); } catch (e) { c.reject(e); }
    await tick();
  };
  return { ed, calls, lost, answer };
}

async function planned(handles) {
  const r = rig();
  r.ed.load({ handles: [handles[0]], loop: true });
  for (const p of handles.slice(1)) { r.ed.addAt(p); await r.answer(); }
  assert.ok(r.ed.state.fresh);
  return r;
}

// ── a plan in flight, and the edits that overtake it ────────────────────────

test('undo then redo while a plan is in flight: the redone state is still planned', async () => {
  const { ed, calls, answer } = await planned([A, B]);
  ed.addAt(C);                       // A–B–C on its way
  assert.equal(calls.length, 2);
  ed.undo();
  assert.equal(ed.state.fresh, true, 'A–B was planned already, so it is back at once');
  ed.redo();
  assert.equal(ed.state.fresh, false);
  await answer(1);                   // the A–B–C answer lands, after its ticket was cancelled
  assert.equal(calls.length, 3, 'so the redone A–B–C is asked for again');
  assert.deepEqual(calls[2].body.points, [A, B, C]);
  await answer(2);
  assert.equal(ed.state.fresh, true);
  assert.equal(ed.state.pending, false);
});

test('clear to the start while a plan is in flight, then undo: planned again', async () => {
  const { ed, calls, answer } = await planned([A, B]);
  ed.addAt(C);
  ed.clear();
  assert.deepEqual(ed.state.handles, [A]);
  assert.equal(ed.state.fresh, true, 'one point needs no plan');
  ed.undo();
  await answer(1);
  assert.equal(calls.length, 3);
  await answer(2);
  assert.deepEqual(ed.state.handles, [A, B, C]);
  assert.equal(ed.state.fresh, true);
});

test('load while a plan is in flight: the new route is the one planned', async () => {
  const { ed, calls, answer } = await planned([A, B]);
  ed.addAt(C);
  ed.load({ handles: [A, D], loop: false });
  await answer(1);
  assert.deepEqual(calls.at(-1).body, { points: [A, D], profile: 'run', loop: false });
  await answer();
  assert.equal(ed.state.fresh, true);
  assert.deepEqual(ed.state.route.wayPoints.length, 2);
});

test('a plan that fails puts the points back and says why', async () => {
  const { ed, answer } = await planned([A, B]);
  ed.addAt([55.7, 12.66]);           // the sea, in the mock
  await answer();
  assert.deepEqual(ed.state.handles, [A, B]);
  assert.equal(ed.state.fresh, true);
  assert.match(ed.state.message.text, /too far from any path/);
  assert.equal(ed.state.canRedo, false);
});

// ── same place twice ────────────────────────────────────────────────────────

test('a point in the same place as its neighbour is never sent (the API refuses it)', async () => {
  const { ed, calls } = await planned([A, B]);
  const before = calls.length;
  ed.addAt([...B]);
  assert.equal(calls.length, before, 'no request');
  assert.deepEqual(ed.state.handles, [A, B]);
  assert.match(ed.state.message.text, /same place/);
  ed.addAt([...A]);
  assert.equal(calls.length, before, 'on a loop, a last point on the start repeats it too');
});

// ── arrow keys ──────────────────────────────────────────────────────────────

test('arrow nudges of one point close together are one undo step and one plan, after a pause', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1e6 });
  const { ed, calls, answer } = await planned([A, B, C]);
  const before = calls.length;
  for (let k = 0; k < 5; k++) { ed.nudgePoint(1, 20, 0); t.mock.timers.tick(200); }
  assert.equal(calls.length, before, 'no plan while the arrow keeps being pressed');
  t.mock.timers.tick(600);
  assert.equal(calls.length, before + 1, 'one plan once it stops');
  let expected = B;
  for (let k = 0; k < 5; k++) expected = nudge(expected, 20, 0);
  assert.deepEqual(calls.at(-1).body.points[1], expected);
  await answer();
  ed.undo();
  assert.deepEqual(ed.state.handles, [A, B, C], 'one undo takes all five back');
  assert.equal(ed.state.fresh, true, 'to the route already planned');
});

test('a nudge of another point, or after the pause, is a step of its own', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1e6 });
  const { ed, answer } = await planned([A, B, C]);
  ed.nudgePoint(1, 0, 20);
  ed.nudgePoint(2, 0, 20);
  t.mock.timers.tick(700);
  await answer();
  ed.nudgePoint(2, 0, 20);
  t.mock.timers.tick(700);
  await answer();
  ed.undo();
  ed.undo();
  assert.deepEqual(ed.state.handles[2], C, 'two steps back: the third point is home…');
  assert.notDeepEqual(ed.state.handles[1], B, '…and the second is still moved');
  ed.undo();
  assert.deepEqual(ed.state.handles, [A, B, C], 'three steps for three runs of nudges');
});

// ── a double click on the map ───────────────────────────────────────────────

test('the second click of a double click, on the point the first one added, does not remove it', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1e6 });
  const { ed, answer } = await planned([A, B]);
  ed.addAt(C);
  ed.clickPoint(2);
  assert.deepEqual(ed.state.handles, [A, B, C]);
  await answer();
  t.mock.timers.tick(500);
  ed.clickPoint(2);
  assert.deepEqual(ed.state.handles, [A, B], 'a click later on removes it');
});
