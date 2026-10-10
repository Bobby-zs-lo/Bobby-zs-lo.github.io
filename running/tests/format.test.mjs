import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, mondayOf, weekdayIndex, weekDates, diffDays, formatDate, formatWeekRange,
  formatPace, parsePace, paceRange, formatDistance, formatDuration, formatMmSs, parseMmSs,
  workoutAmount, runKm, sportFamily, formatTimestamp, copenhagenToday, formatClock, exerciseName, exerciseFamily,
} from '../js/format.js';

test('Danish week: Monday is day 0, Sunday day 6', () => {
  assert.equal(weekdayIndex('2026-10-12'), 0); // Monday
  assert.equal(weekdayIndex('2026-10-18'), 6); // Sunday
  assert.equal(mondayOf('2026-10-18'), '2026-10-12');
  assert.equal(mondayOf('2026-10-12'), '2026-10-12');
  assert.equal(mondayOf('2026-10-10'), '2026-10-05'); // plan start Saturday → week 0
  assert.deepEqual(weekDates('2026-10-14'), ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
});

test('date arithmetic crosses months, years and DST without drift', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-10-24', 2), '2026-10-26'); // EU DST ends 25 Oct
  assert.equal(addDays('2027-01-01', -1), '2026-12-31');
  assert.equal(diffDays('2026-10-13', '2027-09-26'), 348);
  assert.equal(mondayOf('2027-09-26'), '2027-09-20');
});

test('copenhagenToday: the Copenhagen date, which runs ahead of UTC around midnight', () => {
  assert.equal(copenhagenToday(new Date('2026-10-05T22:30:00Z')), '2026-10-06'); // 00:30 CEST
  assert.equal(copenhagenToday(new Date('2026-12-31T22:59:00Z')), '2026-12-31'); // 23:59 CET
  assert.equal(copenhagenToday(new Date('2026-12-31T23:00:00Z')), '2027-01-01'); // midnight CET
  assert.match(copenhagenToday(), /^\d{4}-\d{2}-\d{2}$/);
});

test('en-GB date text', () => {
  assert.equal(formatDate('2026-10-13'), 'Tue 13 Oct');
  assert.equal(formatDate('2027-09-26', { year: true }), 'Sun 26 Sep 2027');
  assert.equal(formatDate('2026-10-13', { long: true }), 'Tuesday 13 October');
  assert.equal(formatWeekRange('2026-10-12'), '12–18 Oct');
  assert.equal(formatWeekRange('2026-10-26'), '26 Oct – 1 Nov');
  assert.equal(formatDate('nonsense'), '');
});

test('pace formatting and parsing', () => {
  assert.equal(formatPace(364), '6:04');
  assert.equal(formatPace(359.6), '6:00');
  assert.equal(formatPace(null), '–');
  assert.equal(formatPace(0), '–');
  assert.equal(parsePace('5:55'), 355);
  assert.equal(parsePace('5:5'), null);
  const paces = { E: { min: '5:55', max: '6:30' }, M: { min: '5:10', max: '5:10' } };
  assert.equal(paceRange(paces, 'E'), '5:55–6:30/km');
  assert.equal(paceRange(paces, 'M'), '5:10/km');
  assert.equal(paceRange(paces, null), '');
  assert.equal(paceRange(paces, 'T'), '');
});

test('distance and duration', () => {
  assert.equal(formatDistance(5), '5 km');
  assert.equal(formatDistance(5.24), '5.2 km');
  assert.equal(formatDistance(42.195), '42.2 km');
  assert.equal(formatDistance(9.96), '10 km');
  assert.equal(formatDistance(12, { unit: false }), '12');
  assert.equal(formatDistance(null), '–');
  assert.equal(formatDuration(45), '45 min');
  assert.equal(formatDuration(60), '1 h');
  assert.equal(formatDuration(95), '1 h 35 min');
  assert.equal(formatDuration(65), '1 h 05 min');
  assert.equal(workoutAmount({ distanceKm: 5, durationMin: null }), '5 km');
  assert.equal(workoutAmount({ distanceKm: null, durationMin: 60 }), '1 h');
  assert.equal(workoutAmount({ distanceKm: null, durationMin: null }), '');
});

test('5K time mm:ss round trip', () => {
  assert.equal(formatMmSs(1410), '23:30');
  assert.equal(formatMmSs(3725), '1:02:05');
  assert.equal(parseMmSs('23:30'), 1410);
  assert.equal(parseMmSs(' 19:05 '), 1145);
  assert.equal(parseMmSs('1:02:05'), 3725);
  assert.equal(parseMmSs('23:60'), null);
  assert.equal(parseMmSs('2330'), null);
  assert.equal(parseMmSs(''), null);
});

test('run km counts only run-family activities', () => {
  assert.equal(sportFamily('TrailRun'), 'run');
  assert.equal(sportFamily('EBikeRide'), 'ride');
  assert.equal(sportFamily('WeightTraining'), 'strength');
  assert.equal(sportFamily('Swim'), 'other');
  const acts = [{ sportType: 'Run', distanceKm: 5.2 }, { sportType: 'Ride', distanceKm: 20 }, { sportType: 'VirtualRun', distanceKm: 3 }];
  assert.equal(Math.round(runKm(acts) * 10) / 10, 8.2);
  assert.equal(runKm(null), 0);
});

test('timestamps render in Copenhagen time', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  assert.equal(formatTimestamp('2026-10-13T06:12:00Z', now), '13 Oct, 08:12 (6 h ago)');
  assert.equal(formatTimestamp('2026-10-13T11:58:00Z', now), '13 Oct, 13:58 (2 min ago)');
  assert.equal(formatTimestamp('2026-10-01T06:12:00Z', now), '1 Oct, 08:12');
  assert.equal(formatTimestamp(null, now), 'never');
});

test('clock times are Copenhagen time, 24 hours, whatever the device', () => {
  assert.equal(formatClock('2026-10-13T05:58:00Z'), '07:58'); // CEST, UTC+2
  assert.equal(formatClock('2026-12-01T05:58:00Z'), '06:58'); // CET, UTC+1
  assert.equal(formatClock('2026-10-13T22:05:00Z'), '00:05'); // past midnight, not '24:05'
  assert.equal(formatClock(null), '');
  assert.equal(formatClock('soon'), '');
});

test('Health Connect exercise types have a name and a sport family', () => {
  assert.equal(exerciseName('running'), 'Run');
  assert.equal(exerciseName('RUNNING'), 'Run', 'the backend sends the type in capitals');
  assert.equal(exerciseName('BIKING'), 'Ride');
  assert.equal(exerciseName('STRENGTH_TRAINING'), 'Strength');
  assert.equal(exerciseName('RUNNING_TREADMILL'), 'Treadmill run');
  assert.equal(exerciseName('OTHER_WORKOUT'), 'Other workout', 'a type without a short name is spelled out, not shouted');
  assert.equal(exerciseName('79'), '79', 'a code the backend could not name stays as it is');
  assert.equal(exerciseName(null), 'Exercise');
  assert.equal(exerciseFamily('RUNNING_TREADMILL'), 'run');
  assert.equal(exerciseFamily('biking'), 'ride');
  assert.equal(exerciseFamily('cycling'), 'ride');
  assert.equal(exerciseFamily('hiking'), 'walk');
  assert.equal(exerciseFamily('strength_training'), 'strength');
  assert.equal(exerciseFamily('weightlifting'), 'strength');
  assert.equal(exerciseFamily('yoga'), 'other');
  assert.equal(exerciseFamily(undefined), 'other');
});
