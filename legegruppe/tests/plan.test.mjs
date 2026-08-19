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
    { week: 34, weekday: 1, weekdayName: 'mandag', hostFamilyId: 'f0', place: 'hjemme',
      fetchers: ['f1'], transport: 'dækket', transportNote: 'Bent henter børnene fra skole.' },
    { week: 37, weekday: 4, weekdayName: 'torsdag', hostFamilyId: 'f2', place: 'ude',
      fetchers: [], transport: 'aftales', transportNote: 'Ingen kan hente — aftal indbyrdes.' }
  ] }] }
};
const ctx = { round, children, contacts };

// A fixed "today" so the date maths is testable rather than drifting.
const REF = new Date(2026, 7, 1);   // 1 August 2026, week 31

// ── dates ────────────────────────────────────────────────────────────
// ISO week 1 is the week containing 4 January.
assert.equal(P.mondayOfIsoWeek(1, 2026).toISOString().slice(0, 10), '2025-12-29');
assert.equal(P.mondayOfIsoWeek(34, 2026).toISOString().slice(0, 10), '2026-08-17');
assert.equal(P.mondayOfIsoWeek(1, 2024).toISOString().slice(0, 10), '2024-01-01');

assert.equal(P.isoWeekOf(new Date(2026, 7, 17)), 34);
assert.equal(P.isoWeekOf(new Date(2026, 0, 1)), 1);

// week 34, Monday, seen from August 2026
assert.equal(P.meetingDate(34, 1, REF).toISOString().slice(0, 10), '2026-08-17');
// week 37, Thursday
assert.equal(P.meetingDate(37, 4, REF).toISOString().slice(0, 10), '2026-09-10');
// a week number BELOW today's belongs to next year — a round crossing New Year
assert.equal(P.meetingDate(3, 1, REF).toISOString().slice(0, 10), '2027-01-18');

assert.equal(P.formatDate(new Date(Date.UTC(2026, 7, 17))), '17. aug');
assert.equal(P.formatDate(new Date(Date.UTC(2026, 0, 5))), '5. jan');

assert.equal(P.isPast(new Date(Date.UTC(2026, 6, 1)), REF), true);
assert.equal(P.isPast(new Date(Date.UTC(2026, 8, 1)), REF), false);
// today itself is not past — the meeting may still be this afternoon
assert.equal(P.isPast(new Date(Date.UTC(2026, 7, 1)), REF), false);

// ── lookups ──────────────────────────────────────────────────────────
assert.equal(P.groupForFamily(ctx, 'f1').id, 'A');
assert.equal(P.groupForFamily(ctx, 'f9'), null);
assert.deepEqual(P.childNames(ctx, ['k0', 'k2']), ['Alma', 'Carla']);
assert.deepEqual(P.childNames(ctx, ['ukendt']), ['ukendt']);

// ── one meeting ──────────────────────────────────────────────────────
const first = P.describeMeeting(ctx, round.rota.groups[0].meetings[0], 'f0', REF);
assert.ok(/uge 34/i.test(first.when), first.when);
assert.equal(first.dateText, '17. aug');
assert.equal(first.whenFull, 'mandag 17. aug');
assert.ok(/Anne/.test(first.host));
assert.ok(/hjemme/i.test(first.host));
assert.ok(/Bent/.test(first.transport));
assert.equal(first.needsAgreement, false);
assert.equal(first.isMine, true, 'Anne is hosting this one');
assert.equal(first.isPast, false);

const second = P.describeMeeting(ctx, round.rota.groups[0].meetings[1], 'f0', REF);
assert.ok(/ude|legeplads|park/i.test(second.host), second.host);
assert.equal(second.outdoors, true);
assert.equal(second.needsAgreement, true);
assert.equal(second.isMine, false);

// a parent whose contact was withheld is still named, never blank
const partial = { round, children, contacts: { f0: { parentName: 'Anne' } } };
assert.ok(/Anne/.test(P.describeMeeting(partial, round.rota.groups[0].meetings[0], null, REF).host));

// an unknown family degrades to a neutral phrase, not "undefined"
const anon = P.describeMeeting({ round, children, contacts: {} },
  round.rota.groups[0].meetings[0], null, REF);
assert.ok(!/undefined|null/.test(anon.host), anon.host);

// ── the next meeting is the point of the page ────────────────────────
const next = P.nextMeeting(ctx, 'f0', REF);
assert.equal(next.week, 34, 'nothing has happened yet on 1 August');

// seen from September, the first meeting is behind us
const LATER = new Date(2026, 8, 1);   // 1 September 2026
assert.equal(P.nextMeeting(ctx, 'f0', LATER).week, 37);
assert.equal(P.myMeetings(ctx, 'f0', LATER)[0].isPast, true);

// once the whole round is over there is no next meeting, and that is not a crash
const AFTER = new Date(2027, 0, 1);
assert.equal(P.nextMeeting(ctx, 'f0', AFTER), null);

// a family not in the plan has no meetings
assert.deepEqual(P.myMeetings(ctx, 'f9', REF), []);
assert.equal(P.nextMeeting(ctx, 'f9', REF), null);

// ── hosting duty, stated as a sentence ───────────────────────────────
assert.deepEqual(P.myHostWeeks(ctx, 'f0'), [34]);
assert.deepEqual(P.myHostWeeks(ctx, 'f2'), [37]);
assert.deepEqual(P.myHostWeeks(ctx, 'f1'), []);

const summaryHost = P.hostingSummary(ctx, 'f0', REF);
assert.ok(/uge 34/.test(summaryHost), summaryHost);
assert.ok(/17\. aug/.test(summaryHost), summaryHost);

const summaryNone = P.hostingSummary(ctx, 'f1', REF);
assert.ok(/ikke sat på som vært/i.test(summaryNone), summaryNone);

// after their turn has passed, say so rather than implying it is still coming
const summaryDone = P.hostingSummary(ctx, 'f0', AFTER);
assert.ok(/ikke flere gange/i.test(summaryDone), summaryDone);

// ── plain text export for Aula ───────────────────────────────────────
const text = P.toPlainText(ctx, REF);
assert.ok(text.includes('Gruppe A'));
assert.ok(text.includes('Alma'));
assert.ok(text.includes('Uge 34'));
assert.ok(text.includes('17. aug'), 'the pasted text must carry real dates too');
assert.ok(text.includes('Anne'));
assert.ok(text.split('\n').length > 5);
assert.ok(!/[<>]/.test(text), 'plain text must not contain markup');

// ── empty and partial states degrade gracefully ──────────────────────
assert.equal(P.toPlainText({ round: null, children, contacts }, REF), P.NO_PLAN);
assert.equal(P.groupForFamily({ round: null, children, contacts }, 'f0'), null);
assert.deepEqual(P.myHostWeeks({ round: null, children, contacts }, 'f0'), []);
assert.equal(P.toPlainText({ round: { groups: [] }, children, contacts }, REF), P.NO_PLAN);

// a round with groups but no rota still renders the groups
assert.ok(P.toPlainText({ round: { groups: round.groups }, children, contacts }, REF)
  .includes('Gruppe A'));

console.log('ok - plan');
