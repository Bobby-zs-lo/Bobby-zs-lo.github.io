// Builds the JSON fixtures used by smoke.playwright.mjs (shapes from spec 4.2/4.6).
//   node running/tests/fixtures/build-fixtures.mjs
// Plan: start Sat 2026-10-10, Berlin Marathon Sun 2027-09-26. "Today" is Tue 2026-10-13.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, diffDays, mondayOf } from '../../js/format.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const TODAY = '2026-10-13';
const START = '2026-10-10', RACE = '2027-09-26';
const paces = {
  E: { min: '5:55', max: '6:30' }, M: { min: '5:08', max: '5:14' }, T: { min: '4:50', max: '4:55' },
  I: { min: '4:26', max: '4:30' }, R: { min: '4:08', max: '4:12' }, HM: { min: '4:58', max: '5:03' },
};

const W1 = '2026-10-12';
const N = diffDays(W1, mondayOf(RACE)) / 7 + 1;
const P = N - 22;
function phaseOf(i) {
  if (i <= 4) return 'reentry';
  if (i > N - 3) return 'taper';
  if (i > N - 18) return 'marathon';
  const k = i - 4;
  if (P < 20) return 'base';
  if (k <= 12) return 'base';
  if (k <= 20) return 'halfbuild';
  if (k === 21) return 'recovery';
  return 'base2';
}
const LONG_CAP = { reentry: 8, base: 18, halfbuild: 21, recovery: 12, base2: 22, marathon: 32, taper: 21 };
const CAP = { reentry: 18, base: 40, halfbuild: 48, recovery: 30, base2: 50, marathon: 68, taper: 50 };
const QUALITY = {
  base: ['Hill strides', 'Tempo 2×8′', 'Tempo 3×8′', 'Tempo 20′', 'Fartlek'],
  halfbuild: ['Cruise intervals 4×2 km', 'Intervals 6×1 km'],
  base2: ['Tempo 25′', 'Hill repeats 8×60 s'],
  marathon: ['Intervals 5×1 km', 'Tempo 2×15′', 'M-pace 3×5 km', 'M-pace 2×8 km'],
  taper: ['M-pace 3×3 km', 'M-pace 2×3 km', 'Strides 6×20 s'],
};
const QKEY = { Hill: 'R', Tempo: 'T', Cruise: 'T', Intervals: 'I', Fartlek: 'T', 'M-pace': 'M', Strides: 'R' };

let id = 0;
function wo(date, sport, kind, title, o = {}) {
  return {
    id: `w-${date}-${sport}${o.dup ? '-2' : ''}`, date, sport, kind, title,
    details: o.details ?? '', distanceKm: o.km ?? null, durationMin: o.min ?? null,
    paceKey: o.pace ?? null, key: !!o.key, status: o.status ?? 'planned',
  };
}

const weeks = [];
// Week 0 (partial): Sat easy 5 km, Sun endurance ride 60 min — both done.
weeks.push({ index: 0, startDate: '2026-10-05', phase: 'reentry', label: 'Start', isCutback: false,
  targetRunKm: 5, baselineRunKm: 5, focus: 'First steps',
  workouts: [
    wo('2026-10-10', 'run', 'easy', 'Easy run', { km: 5, pace: 'E', details: 'Conversational pace. Walk breaks are fine.', status: 'done' }),
    wo('2026-10-11', 'ride', 'endurance', 'Endurance ride', { min: 60, details: 'Steady, nose-breathing effort.', status: 'done' }),
  ] });

let prevKm = 18, phaseCount = {};
for (let i = 1; i <= N; i++) {
  const start = addDays(W1, (i - 1) * 7);
  const phase = phaseOf(i);
  phaseCount[phase] = (phaseCount[phase] || 0) + 1;
  const cut = phase !== 'taper' && phaseCount[phase] % 4 === 0;
  let km;
  if (phase === 'reentry') km = [12, 15, 18, 14][i - 1];
  else if (phase === 'recovery') km = 30;
  else if (phase === 'taper') km = [Math.round(prevKm * 0.75), Math.round(prevKm * 0.55), 16][i - (N - 2)];
  else { km = Math.min(CAP[phase], Math.round(prevKm * 1.08)); if (cut) km = Math.round(km * 0.8); }
  if (!cut && phase !== 'taper') prevKm = km;
  const d = k => addDays(start, k);
  const runs = i === 1 ? 2 : phase === 'taper' ? [4, 4, 3][i - (N - 2)] : km < 32 ? 3 : 4;
  const long = Math.min(LONG_CAP[phase], Math.round(km * 0.33));
  const workouts = [];
  const qList = QUALITY[phase];
  const qTitle = qList ? qList[(phaseCount[phase] - 1) % qList.length] : null;
  const qKey = qTitle ? QKEY[Object.keys(QKEY).find(k => qTitle.startsWith(k))] : null;
  const isRaceWeek = i === N;
  if (i === 1) {
    workouts.push(wo(d(0), 'ride', 'recovery', 'Easy spin', { min: 45, details: 'Very easy, high cadence.' }));
    workouts.push(wo(d(1), 'run', 'easy', 'Easy run', { km: 5, pace: 'E', details: 'Conversational pace. Finish wanting more.' }));
    workouts.push(wo(d(1), 'strength', 'strength', 'Core & mobility', { min: 20, details: '- Dead bugs 3×10\n- Side plank 3×30 s\n- Calf raises 3×15' }));
    workouts.push(wo(d(2), 'ride', 'endurance', 'Endurance ride', { min: 60, details: 'Zone 2.' }));
    workouts.push(wo(d(3), 'rest', 'rest', 'Rest', {}));
    workouts.push(wo(d(4), 'ride', 'recovery', 'Easy spin', { min: 45 }));
    workouts.push(wo(d(5), 'run', 'long', 'Long run', { km: 7, pace: 'E', key: true, details: 'Easy all the way. Walk the hills if you need to.' }));
    workouts.push(wo(d(6), 'ride', 'endurance', 'Endurance ride', { min: 75 }));
    workouts.push(wo(d(6), 'strength', 'strength', 'Strength', { min: 25, details: 'Squats, lunges, glute bridges.' }));
  } else {
    const qKm = qTitle ? Math.max(6, Math.round(km * 0.22)) : 0;
    const easyCount = runs - 1 - (qTitle ? 1 : 0);
    const easyKm = Math.max(4, Math.round((km - long - qKm) / Math.max(1, easyCount)));
    if (runs === 4) {
      workouts.push(wo(d(0), 'rest', 'rest', 'Rest'));
      if (qTitle) workouts.push(wo(d(1), 'run', qKey === 'I' ? 'intervals' : qKey === 'M' ? 'mp' : 'tempo', qTitle, { km: qKm, pace: qKey, key: true, details: 'Includes 2 km warm-up and 2 km cool-down.' }));
      workouts.push(wo(d(2), 'run', 'easy', 'Easy run', { km: easyKm, pace: 'E' }));
      workouts.push(wo(d(2), 'strength', 'strength', 'Strength', { min: 25 }));
      workouts.push(wo(d(3), 'ride', 'recovery', 'Easy spin', { min: 50 }));
      workouts.push(wo(d(4), 'run', 'strides', 'Easy run + strides', { km: easyKm, pace: 'E', details: '6×20 s strides at the end.' }));
    } else {
      workouts.push(wo(d(0), 'ride', 'recovery', 'Easy spin', { min: 45 }));
      if (qTitle) workouts.push(wo(d(1), 'run', qKey === 'I' ? 'intervals' : 'tempo', qTitle, { km: qKm, pace: qKey, key: true, details: 'Includes warm-up and cool-down.' }));
      else workouts.push(wo(d(1), 'run', 'easy', 'Easy run + strides', { km: easyKm, pace: 'E', details: '4×20 s strides.' }));
      workouts.push(wo(d(2), 'ride', 'endurance', 'Endurance ride', { min: 75 }));
      workouts.push(wo(d(2), 'strength', 'strength', 'Strength', { min: 25 }));
      workouts.push(wo(d(3), 'run', 'easy', 'Easy run', { km: easyKm, pace: 'E' }));
      workouts.push(wo(d(4), 'rest', 'rest', 'Rest'));
    }
    if (isRaceWeek) {
      workouts.push(wo(d(5), 'run', 'easy', 'Shake-out', { km: 4, pace: 'E', details: '20 minutes very easy with 4 strides.' }));
      workouts.push(wo(RACE, 'race', 'race', 'Berlin Marathon', { km: 42.2, pace: 'M', key: true, details: 'Start at the slow end of **M** pace. Fuel every 30 minutes.' }));
    } else if (phase === 'halfbuild' && phaseCount[phase] === 8) {
      workouts.push(wo(d(5), 'ride', 'recovery', 'Easy spin', { min: 30 }));
      workouts.push(wo(d(6), 'race', 'race', 'Half-marathon tune-up', { km: 21.1, pace: 'HM', key: true }));
    } else {
      workouts.push(wo(d(5), 'run', 'long', 'Long run', { km: long, pace: 'E', key: true }));
      workouts.push(wo(d(6), 'ride', 'endurance', phase === 'marathon' ? 'Recovery spin' : 'Endurance ride', { min: phase === 'marathon' ? 45 : 90 }));
    }
  }
  const target = workouts.filter(w => w.sport === 'run' || w.sport === 'race').reduce((s, w) => s + (w.sport === 'race' ? 0 : w.distanceKm || 0), 0);
  weeks.push({
    index: i, startDate: start, phase,
    label: `${{ reentry: 'Re-entry', base: 'Base', halfbuild: 'Half build', recovery: 'Recovery', base2: 'Base II', marathon: 'Marathon', taper: 'Taper' }[phase]} ${phaseCount[phase]}`,
    isCutback: cut, targetRunKm: target, baselineRunKm: target,
    focus: phase === 'reentry' ? 'Easy running only' : cut ? 'Lighter week: absorb the work' : phase === 'taper' ? 'Stay sharp, stay rested' : 'Build steadily',
    workouts,
  });
}
const plan = { version: 3, startDate: START, raceDate: RACE, raceName: 'Berlin Marathon', fiveKSeconds: 1410, paces, weeks };

// ── week of 2026-10-12 with actuals ─────────────────────────────────────────
const wk1 = structuredClone(weeks[1]);
const byDate = date => wk1.workouts.filter(w => w.date === date);
const mon = byDate('2026-10-12'), tue = byDate('2026-10-13');
mon[0].status = 'done';
tue.find(w => w.sport === 'run').status = 'done';
const acts = [
  { id: 15800000001, date: '2026-10-12', startUtc: '2026-10-12T16:05:00Z', sportType: 'Ride', name: 'Evening spin', distanceKm: 18.4, movingMin: 46, avgPaceSecPerKm: null, avgHr: 118, commute: false, workoutId: mon[0].id },
  { id: 15800000002, date: '2026-10-13', startUtc: '2026-10-13T05:58:00Z', sportType: 'Run', name: 'Morning Run', distanceKm: 5.21, movingMin: 31.6, avgPaceSecPerKm: 364, avgHr: 142, commute: false, workoutId: tue.find(w => w.sport === 'run').id },
  { id: 15800000003, date: '2026-10-13', startUtc: '2026-10-13T07:40:00Z', sportType: 'Ride', name: 'Commute to Rigshospitalet', distanceKm: 6.1, movingMin: 19, avgPaceSecPerKm: null, avgHr: null, commute: true, workoutId: null },
];
const health = (date, i) => ({
  date, steps: 6000 + ((i * 1731) % 7000), distanceKm: null, activeKcal: 380 + (i * 37) % 300,
  restingHr: 56 - Math.round(i / 9) + ((i * 7) % 3), hrvRmssd: 44 + ((i * 13) % 11), avgHr: 72,
  sleepHours: i % 9 === 4 ? null : +(6.4 + ((i * 17) % 18) / 10).toFixed(1), sleepDeepH: 1.1, sleepRemH: 1.6,
  weightKg: i % 3 === 0 ? +(78.6 - i * 0.03).toFixed(1) : null, vo2max: null, spo2: 97, exercise: [],
});
const days = Array.from({ length: 7 }, (_, k) => {
  const date = addDays(W1, k);
  const past = date <= TODAY;
  return {
    date,
    workouts: wk1.workouts.filter(w => w.date === date),
    activities: acts.filter(a => a.date === date),
    checkin: date === '2026-10-12' ? { date, sleepHours: 7.25, sleepQuality: 4, soreness: 2, mood: 4, energy: 4, note: 'Legs fine after the weekend.' } : null,
    health: past ? health(date, 30 + k) : null,
  };
});
const week = { week: wk1, days };

// ── health: 28 days to TODAY ────────────────────────────────────────────────
const healthRows = Array.from({ length: 28 }, (_, k) => health(addDays(TODAY, k - 27), k));
healthRows[27].exercise = [{ type: 'running', startUtc: '2026-10-13T05:58:00Z', durationMin: 32, distanceKm: 5.1, duplicateOfStrava: true }];
healthRows[26].exercise = [{ type: 'biking', startUtc: '2026-10-12T16:04:00Z', durationMin: 47, distanceKm: 18.2, duplicateOfStrava: true }];
healthRows[23].exercise = [{ type: 'walking', startUtc: '2026-10-09T11:30:00Z', durationMin: 41, distanceKm: 3.4, duplicateOfStrava: false }];
healthRows[20].exercise = [{ type: 'strength_training', startUtc: '2026-10-06T17:00:00Z', durationMin: 25, distanceKm: null, duplicateOfStrava: false }];
for (const k of [5, 6, 12]) healthRows[k].hrvRmssd = null;

const settings = { raceDate: RACE, raceName: 'Berlin Marathon', fiveKSeconds: 1410, hasWatch: false,
  notify: { morning: true, evening: true, activity: true, weekly: true }, morningHour: 7, eveningHour: 20 };

const reviewBody = {
  weekStart: '2026-10-05',
  headline: 'Good start: both sessions done, easy pace held. Week 1 unchanged.',
  summary: 'A short first week, and you did **exactly** what was planned.\n\nYour easy run came in at the slow end of the *E* range, which is right for a re-entry block. Sleep averaged 7.1 h.\n\n## Next week\n- Keep both runs conversational\n- Add the core session on Tuesday\n- If the calves feel tight, swap Friday’s spin for a walk',
  adherence: { score: 92, verdict: 'on_track' },
  observations: ['Saturday 5 km at 6:21/km, inside the easy range.', 'Resting HR 55–57 bpm, stable.', 'Sunday ride 62 min, as planned.'],
  riskFlags: ['Sleep under 6.5 h on two nights.'],
  changes: [],
  goalAssessment: 'Too early to predict. Re-test 5K in week 8.',
};
const reviews = [
  { id: 'r-2026-10-13-a1', weekStart: '2026-10-05', createdAt: '2026-10-12T03:52:11Z', body: reviewBody },
];
const proposals = [
  { id: 'p-2026-10-12-b7', createdAt: '2026-10-12T03:52:12Z', status: 'pending',
    summary: 'Your legs handled week 0 well. Two bigger changes need your OK.',
    changes: [
      { op: 'set_week_target', weekIndex: 4, targetRunKm: 16, reason: 'Cutback is a little deep; 16 km keeps momentum.' },
      { op: 'add', date: '2026-10-29', workout: { sport: 'run', kind: 'strides', title: 'Strides session', details: '6×20 s', distanceKm: 4, durationMin: null, paceKey: 'E' }, reason: 'Start neuromuscular work early.' },
    ] },
  { id: 'p-2026-10-05-x1', createdAt: '2026-10-05T03:50:00Z', status: 'rejected', summary: 'Old', changes: [] },
];
const changesets = [
  { id: 'c-2026-10-12-r1', createdAt: '2026-10-12T03:52:12Z', source: 'review', summary: 'Moved Friday’s spin to Thursday; added calf raises to strength.', undone: false },
  { id: 'c-2026-10-10-u1', createdAt: '2026-10-10T19:02:40Z', source: 'user', summary: 'Race settings: 5K time 23:30 → paces regenerated.', undone: false },
  { id: 'c-2026-10-09-u0', createdAt: '2026-10-09T08:00:00Z', source: 'user', summary: 'Race date set to 26 Sep 2027.', undone: true },
];
const state = {
  today: TODAY, settings,
  strava: { connected: true, athleteName: 'Bobby Lo' },
  push: { vapidPublicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U', subscribed: false },
  pendingProposals: 1,
  lastReview: { id: reviews[0].id, weekStart: reviews[0].weekStart, createdAt: reviews[0].createdAt, headline: reviewBody.headline },
  healthLastSync: '2026-10-13T06:12:00Z',
};

const out = { 'state.json': state, 'plan.json': plan, 'week-2026-10-12.json': week, 'health.json': healthRows,
  'reviews.json': reviews, 'proposals.json': proposals, 'changesets.json': changesets, 'activities.json': acts };
for (const [f, v] of Object.entries(out)) writeFileSync(join(DIR, f), JSON.stringify(v, null, 1) + '\n');
console.log(`fixtures written (plan: ${weeks.length} weeks, N=${N})`);
