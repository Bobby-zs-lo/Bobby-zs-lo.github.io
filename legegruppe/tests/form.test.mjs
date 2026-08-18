/* Run: node legegruppe/tests/form.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const F = require('../js/ui/form.js');

// --- validation: the four core questions are mandatory ---
const complete = {
  parentName: 'Anne', contact: 'anne@example.dk', hostCapacity: '1',
  maxChildrenAtHome: '4', availableWeekdays: ['2', '3'], fetchCapacity: '2',
  meetingPlace: 'home', blackoutWeeks: '', note: '', consent: true
};
assert.deepEqual(F.validate(complete), []);

assert.ok(F.validate({ ...complete, hostCapacity: '' })
  .some(e => e.field === 'hostCapacity'));
assert.ok(F.validate({ ...complete, availableWeekdays: [] })
  .some(e => e.field === 'availableWeekdays'));
assert.ok(F.validate({ ...complete, fetchCapacity: '' })
  .some(e => e.field === 'fetchCapacity'));
assert.ok(F.validate({ ...complete, consent: false })
  .some(e => e.field === 'consent'));
assert.ok(F.validate({ ...complete, contact: 'ikke-en-mail' })
  .some(e => e.field === 'contact'));
assert.equal(F.validate({ ...complete, contact: '12 34 56 78' }).length, 0,
  'a Danish phone number is a valid contact');

// --- every error message is Danish and says what to do about it ---
F.validate({ parentName: '', contact: '', hostCapacity: '', maxChildrenAtHome: '',
  availableWeekdays: [], fetchCapacity: '', consent: false })
  .forEach(e => {
    assert.ok(typeof e.message === 'string' && e.message.length > 10, JSON.stringify(e));
    assert.ok(typeof e.field === 'string');
  });

// --- a family that cannot host at all is still a complete, valid answer ---
// This is the whole point of the app: "we can't do this" must be sayable.
assert.deepEqual(F.validate({ ...complete, hostCapacity: '0', maxChildrenAtHome: '0' }), []);

// --- and so is a family that cannot fetch ---
assert.deepEqual(F.validate({ ...complete, fetchCapacity: '0' }), []);

// --- blackout weeks accept whatever a human types ---
assert.deepEqual(F.parseBlackout('42, 43 ; 7'), [7, 42, 43]);
assert.deepEqual(F.parseBlackout(''), []);
assert.deepEqual(F.parseBlackout('uge 42 og 43'), [42, 43]);
assert.deepEqual(F.parseBlackout('99'), [], 'week 99 does not exist');
assert.deepEqual(F.parseBlackout('42 42 42'), [42], 'duplicates collapse');

// --- toPayload produces exactly what saveFamily expects ---
const payload = F.toPayload(complete);
assert.equal(payload.hostCapacity, 1);
assert.deepEqual(payload.availableWeekdays, [2, 3]);
assert.equal(payload.fetchCapacity, 2);
assert.equal(payload.meetingPlace, 'home');
assert.deepEqual(payload.blackoutWeeks, []);
assert.equal(typeof payload.parentName, 'string');

// --- whitespace is trimmed, not stored ---
assert.equal(F.toPayload({ ...complete, parentName: '  Anne  ' }).parentName, 'Anne');

// --- fromFamily restores a saved answer back into form values ---
const restored = F.fromFamily({
  parentName: 'Anne', contact: 'anne@example.dk', hostCapacity: 2,
  maxChildrenAtHome: 3, availableWeekdays: ['1', '5'], fetchCapacity: 0,
  meetingPlace: 'both', blackoutWeeks: '42,43', note: 'hund',
  consentAt: '2026-08-01T10:00:00Z'
});
assert.equal(restored.hostCapacity, '2');
assert.deepEqual(restored.availableWeekdays, ['1', '5']);
assert.equal(restored.consent, true, 'an existing answer implies prior consent');
assert.equal(restored.blackoutWeeks, '42,43');

// --- a stored zero from a family that ANSWERED survives the round trip ---
const zeroed = F.fromFamily({ hostCapacity: 0, maxChildrenAtHome: 0, fetchCapacity: 0,
  consentAt: '2026-08-01' });
assert.equal(zeroed.hostCapacity, '0', 'zero is an answer, not a missing value');
assert.equal(zeroed.fetchCapacity, '0');
assert.equal(zeroed.consent, true);

// --- but a family that has NEVER answered must get a blank form ---
// The backend returns zeroes for an untouched row. Rendering those pre-selected
// "we can host nobody and fetch nobody" before the parent had read the question,
// and a single press of save would have submitted it as their answer.
const untouched = F.fromFamily({ parentName: 'Anne', contact: 'anne@example.dk',
  hostCapacity: 0, maxChildrenAtHome: 0, fetchCapacity: 0,
  availableWeekdays: [], consentAt: '', updatedAt: '' });
assert.equal(untouched.hostCapacity, '', 'an unanswered form must not pre-answer');
assert.equal(untouched.maxChildrenAtHome, '');
assert.equal(untouched.fetchCapacity, '');
assert.deepEqual(untouched.availableWeekdays, []);
assert.equal(untouched.consent, false, 'consent must never be implied for a blank form');
// the name and contact the admin typed in are still useful, so they stay
assert.equal(untouched.parentName, 'Anne');
assert.equal(untouched.contact, 'anne@example.dk');
// and such a form must not validate until the parent actually answers
assert.ok(F.validate({ ...untouched, consent: true }).length > 0,
  'a blank form must not pass validation');

// --- round trip is lossless, once the answer exists ---
// toPayload deliberately carries no consentAt (the backend owns that), so a stored
// answer has to be marked as answered before it can be read back into the form.
const stored = { ...F.toPayload(complete), consentAt: '2026-08-01T10:00:00Z' };
assert.deepEqual(F.toPayload(F.fromFamily(stored)).availableWeekdays, [2, 3]);
assert.equal(F.toPayload(F.fromFamily(stored)).hostCapacity, 1);

console.log('ok - form');
