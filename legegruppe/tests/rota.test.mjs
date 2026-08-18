/* Run: node legegruppe/tests/rota.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../js/model.js');
const R = require('../js/solvers/rota.js');

function makeProblem(specs, extra) {
  const children = specs.map((s, i) => ({ childId: 'k' + i, familyId: 'f' + i, name: 'Barn' + i }));
  const families = specs.map((s, i) => Object.assign({
    familyId: 'f' + i, classId: 'c1', parentName: 'P' + i, consentAt: '2026-08-01',
    hostCapacity: 2, maxChildrenAtHome: 5, availableWeekdays: [1, 2, 3, 4, 5], fetchCapacity: 4
  }, s));
  return M.buildProblem(Object.assign({
    classId: 'c1', children, families, groupSizeMin: 4, groupSizeMax: 5,
    weeks: [34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45], meetingsPerGroup: 6
  }, extra || {}));
}

const four = ['k0', 'k1', 'k2', 'k3'];
const solution = { groups: [{ id: 'A', childIds: four }] };

// --- happy path ---
const p = makeProblem(new Array(4).fill({}));
const rota = R.buildRota(solution, p, { seed: 1 });
assert.equal(rota.groups.length, 1);
const meetings = rota.groups[0].meetings;
assert.equal(meetings.length, 6);
meetings.forEach(m => {
  assert.ok(p.weeks.includes(m.week));
  assert.ok(m.weekday >= 1 && m.weekday <= 5);
  assert.ok(['f0', 'f1', 'f2', 'f3'].includes(m.hostFamilyId));
  assert.ok(['hjemme', 'ude'].includes(m.place));
  assert.ok(Array.isArray(m.fetchers));
  assert.ok(['dækket', 'aftales'].includes(m.transport));
});

// --- weeks are strictly increasing and never repeat ---
const weeks = meetings.map(m => m.week);
assert.deepEqual(weeks, weeks.slice().sort((a, b) => a - b));
assert.equal(new Set(weeks).size, weeks.length);

// --- the host is always available on the chosen weekday ---
meetings.forEach(m => {
  const host = p.familyById(m.hostFamilyId);
  assert.ok(host.availableWeekdays.includes(m.weekday), 'host must be free that weekday');
});

// --- HARD RULE: nobody hosts more often than they said they could ---
const counts = {};
meetings.forEach(m => { counts[m.hostFamilyId] = (counts[m.hostFamilyId] || 0) + 1; });
Object.keys(counts).forEach(fid => {
  assert.ok(counts[fid] <= p.familyById(fid).hostCapacity,
    fid + ' hosted ' + counts[fid] + ' times but declared ' + p.familyById(fid).hostCapacity);
});

// --- the rotation is even: with identical families nobody hosts twice as often as another ---
const values = Object.keys(counts).map(k => counts[k]);
assert.ok(Math.max.apply(null, values) - Math.min.apply(null, values) <= 1,
  'hosting should be spread evenly among equal families');

// --- blackout weeks are respected for the family they belong to ---
const withHoliday = makeProblem([
  { blackoutWeeks: [34, 35, 36, 37, 38, 39, 40, 41] }, {}, {}, {}
]);
R.buildRota(solution, withHoliday, { seed: 2 }).groups[0].meetings.forEach(m => {
  if (m.hostFamilyId === 'f0') assert.ok(m.week > 41, 'f0 must not host during its holiday');
});

// --- a family that cannot host is never scheduled as host ---
const oneHost = makeProblem([
  { hostCapacity: 6 }, { hostCapacity: 0 }, { hostCapacity: 0 }, { hostCapacity: 0 }
]);
R.buildRota(solution, oneHost, { seed: 3 }).groups[0].meetings.forEach(m => {
  assert.equal(m.hostFamilyId, 'f0');
});

// --- outdoor-only hosts are marked as meeting outdoors ---
const outdoorHost = makeProblem([
  { hostCapacity: 6, maxChildrenAtHome: 1, meetingPlace: 'outdoor' },
  { hostCapacity: 0 }, { hostCapacity: 0 }, { hostCapacity: 0 }
]);
R.buildRota(solution, outdoorHost, { seed: 4 }).groups[0].meetings.forEach(m => {
  assert.equal(m.place, 'ude');
});

// --- too little capacity: fewer meetings, and a warning saying so ---
const thin = makeProblem([
  { hostCapacity: 1 }, { hostCapacity: 0 }, { hostCapacity: 0 }, { hostCapacity: 0 }
]);
const thinRota = R.buildRota(solution, thin, { seed: 5 });
assert.equal(thinRota.groups[0].meetings.length, 1);
assert.ok(thinRota.warnings.some(w => /1 af 6|kun 1/.test(w)),
  'must warn that the round is short of meetings: ' + JSON.stringify(thinRota.warnings));

// --- a group nobody can fetch for is still scheduled, marked "aftales" ---
// This is the point of the design: hosting is the requirement, transport is
// something the parents settle between themselves. The meetings must still appear.
const noFetch = makeProblem([
  { hostCapacity: 6, fetchCapacity: 0 }, { fetchCapacity: 0 },
  { fetchCapacity: 0 }, { fetchCapacity: 0 }
]);
const noFetchRota = R.buildRota(solution, noFetch, { seed: 6 });
assert.ok(noFetchRota.groups[0].meetings.length > 0,
  'a group that cannot fetch must still get meetings');
noFetchRota.groups[0].meetings.forEach(m => {
  assert.equal(m.transport, 'aftales');
  assert.deepEqual(m.fetchers, []);
  assert.ok(/aftal|legeplads/i.test(m.transportNote), m.transportNote);
});

// --- when the group CAN cover it, the transport is stated, not left open ---
const settled = R.buildRota(solution, makeProblem(new Array(4).fill({})), { seed: 8 });
settled.groups[0].meetings.forEach(m => {
  assert.equal(m.transport, 'dækket');
  assert.ok(m.fetchers.length > 0);
  assert.ok(m.transportNote.length > 5);
});

// --- EVERY child needs collecting, the host's own included ---
// This was wrong: the rota asked for size - 1 fetch places on the reasoning that
// the host's child was already home. But the child is at the school gate like the
// others, and the host collects their own alongside the guests. A group of four
// therefore needs four places, not three.
const justShort = makeProblem([
  { hostCapacity: 6, fetchCapacity: 3 },   // three places for four children
  { fetchCapacity: 0 }, { fetchCapacity: 0 }, { fetchCapacity: 0 }
]);
R.buildRota(solution, justShort, { seed: 9 }).groups[0].meetings.forEach(m => {
  assert.equal(m.transport, 'aftales',
    'three fetch places cannot cover four children');
});

const exactlyEnough = makeProblem([
  { hostCapacity: 6, fetchCapacity: 4 },   // four places for four children
  { fetchCapacity: 0 }, { fetchCapacity: 0 }, { fetchCapacity: 0 }
]);
R.buildRota(solution, exactlyEnough, { seed: 9 }).groups[0].meetings.forEach(m => {
  assert.equal(m.transport, 'dækket', 'four places cover four children');
  assert.deepEqual(m.fetchers, ['f0']);
});

// --- fetch duty rotates too, when several families can fetch ---
const spread = R.buildRota(solution, makeProblem(new Array(4).fill({})), { seed: 7 });
const fetchCounts = {};
spread.groups[0].meetings.forEach(m => m.fetchers.forEach(f => {
  fetchCounts[f] = (fetchCounts[f] || 0) + 1;
}));
assert.ok(Object.keys(fetchCounts).length > 1, 'fetch duty should not land on one family');

// --- determinism ---
const d1 = R.buildRota(solution, p, { seed: 42 });
const d2 = R.buildRota(solution, p, { seed: 42 });
assert.deepEqual(d1.groups[0].meetings, d2.groups[0].meetings);

console.log('ok - rota');
