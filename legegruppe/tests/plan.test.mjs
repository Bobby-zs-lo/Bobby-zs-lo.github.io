/* Run: node legegruppe/tests/plan.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const P = require('../js/ui/plan.js');

const children = [
  { childId: 'k0', familyId: 'f0', name: 'Alma' },
  { childId: 'k1', familyId: 'f1', name: 'Bo' },
  { childId: 'k2', familyId: 'f2', name: 'Carla' },
  { childId: 'k3', familyId: 'f3', name: 'Dagmar' }
];
const contacts = {
  f0: { parentName: 'Anne', contact: 'anne@example.dk' },
  f1: { parentName: 'Bent', contact: '12345678' },
  f2: { parentName: 'Cecilie', contact: 'c@example.dk' },
  f3: { parentName: 'David', contact: 'd@example.dk' }
};
const round = {
  groups: [{ id: 'A', childIds: ['k0', 'k1', 'k2', 'k3'],
    why: ['Stærk her: børnene har ikke leget sammen før.'] }],
  rota: { groups: [{ id: 'A', childIds: ['k0', 'k1', 'k2', 'k3'], meetings: [
    { week: 34, weekday: 2, weekdayName: 'tirsdag', hostFamilyId: 'f0', place: 'hjemme',
      fetchers: ['f1'], transport: 'dækket', transportNote: 'Bent henter børnene fra skole.' },
    { week: 37, weekday: 4, weekdayName: 'torsdag', hostFamilyId: 'f2', place: 'ude',
      fetchers: [], transport: 'aftales', transportNote: 'Ingen kan hente — aftal indbyrdes.' }
  ] }] }
};
const ctx = { round, children, contacts };

// --- finding my own group ---
assert.equal(P.groupForFamily(ctx, 'f1').id, 'A');
assert.equal(P.groupForFamily(ctx, 'f9'), null);

// --- child names ---
assert.deepEqual(P.childNames(ctx, ['k0', 'k2']), ['Alma', 'Carla']);
assert.deepEqual(P.childNames(ctx, ['ukendt']), ['ukendt']);

// --- one meeting as Danish sentences ---
const first = P.describeMeeting(ctx, round.rota.groups[0].meetings[0]);
assert.ok(/uge 34/i.test(first.when), first.when);
assert.ok(/tirsdag/i.test(first.when));
assert.ok(/Anne/.test(first.host));
assert.ok(/hjemme/i.test(first.host));
assert.ok(/Bent/.test(first.transport));
assert.equal(first.needsAgreement, false);

const second = P.describeMeeting(ctx, round.rota.groups[0].meetings[1]);
assert.ok(/ude|legeplads|park/i.test(second.host), second.host);
assert.equal(second.needsAgreement, true);
assert.ok(/aftales indbyrdes|legeplads/i.test(second.transport));

// --- a parent whose contact was withheld is still named, never blank ---
const partial = { round, children, contacts: { f0: { parentName: 'Anne' } } };
assert.ok(/Anne/.test(P.describeMeeting(partial, round.rota.groups[0].meetings[0]).host));

// --- an unknown family degrades to a neutral phrase, not "undefined" ---
const anonymous = { round, children, contacts: {} };
const anon = P.describeMeeting(anonymous, round.rota.groups[0].meetings[0]);
assert.ok(!/undefined|null/.test(anon.host), anon.host);

// --- which meetings am I hosting? ---
assert.deepEqual(P.myHostWeeks(ctx, 'f0'), [34]);
assert.deepEqual(P.myHostWeeks(ctx, 'f2'), [37]);
assert.deepEqual(P.myHostWeeks(ctx, 'f1'), []);

// --- plain text export for Aula ---
const text = P.toPlainText(ctx);
assert.ok(text.includes('Gruppe A'));
assert.ok(text.includes('Alma'));
assert.ok(text.includes('Uge 34'));
assert.ok(text.includes('Anne'));
assert.ok(text.split('\n').length > 5);
// no markup may leak into a message meant for a plain textarea
assert.ok(!/[<>]/.test(text), 'plain text must not contain markup');

// --- an empty round degrades gracefully instead of throwing ---
assert.equal(P.toPlainText({ round: null, children, contacts }), P.NO_PLAN);
assert.equal(P.groupForFamily({ round: null, children, contacts }, 'f0'), null);
assert.deepEqual(P.myHostWeeks({ round: null, children, contacts }, 'f0'), []);
assert.equal(P.toPlainText({ round: { groups: [] }, children, contacts }), P.NO_PLAN);

// --- a round with groups but no rota still renders the groups ---
const noRota = { round: { groups: round.groups }, children, contacts };
assert.ok(P.toPlainText(noRota).includes('Gruppe A'));

console.log('ok - plan');
