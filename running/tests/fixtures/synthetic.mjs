// Generators for the invented fixtures: a year of activities, one run's streams, route
// variants and a year of daily health. Called by build-fixtures.mjs with one shared seeded
// random source, so the output is the same on every machine.
//
// Why invented: the app shows Strava data and Strava's API policy forbids that data reaching
// an AI. Claude sessions developing this app run it against these files (via
// preview-server.mjs and mock-api.mjs) and never against the live API.
import { addDays, diffDays, mondayOf, weekdayIndex } from '../../js/format.js';
import { makeBaseLoops, pickLoop, renderLoop, encodeLoop, startOf, round } from './synthetic-geo.mjs';

const FIRST_ID = 16000000001;
// Nominal loop lengths (km): ~11 run-sized loops, then 5 ride-sized ones.
const LOOP_KMS = [5.5, 6.5, 7.5, 8.5, 9.5, 11, 12.5, 14.5, 17, 19.5, 22, 28, 40, 55, 72, 90];
const DIP_WEEKS = ['2026-07-06', '2026-07-13', '2026-07-20']; // the holiday
const STREAM_POINTS = 600;
const ROUTE_KMS = [10.1, 9.8, 10.3];
const ROUTE_SEED = 482913;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const pad = (n) => String(n).padStart(2, '0');
const wave = (i, period, phase = 0) => Math.sin((2 * Math.PI * (i + phase)) / period);

// ── activities ──────────────────────────────────────────────────────────────

/** Sessions for one Monday-based week: [{ date, kind }], kind = long | quality | easy | ride. */
function planWeek(rng, monday) {
  const dip = DIP_WEEKS.indexOf(monday);
  const runs = [1, 0, 2][dip] ?? (rng.chance(0.55) ? 4 : 3);
  const rides = [0, 1, 1][dip] ?? (rng.chance(0.5) ? 1 : 2);
  const kinds = runs >= 3 ? ['long', 'quality', ...Array(runs - 2).fill('easy')] : Array(runs).fill('easy');
  const used = new Set();
  const claim = (preferred) => {
    const day = preferred.find((d) => !used.has(d));
    used.add(day);
    return day;
  };
  const days = {
    long: () => claim(rng.chance(0.65) ? [5, 6] : [6, 5]),
    quality: () => claim(rng.chance(0.7) ? [1, 3] : [3, 1]),
    easy: () => claim(rng.chance(0.5) ? [2, 4, 0, 3] : [4, 2, 3, 0]),
    ride: () => claim([6, 2, 4, 0, 5, 3, 1]),
  };
  const sessions = [...kinds, ...Array(rides).fill('ride')].map((kind) => ({ kind, day: days[kind]() }));
  return sessions.filter(() => !rng.chance(0.05)).map(({ kind, day }) => ({ date: addDays(monday, day), kind, dip: dip >= 0 }));
}

function distanceFor({ kind, dip }, t, rng) {
  if (kind === 'ride') return round(clamp(lerp(30, 65, t) + rng.range(-15, 15), 25, 90), 2);
  if (kind === 'long') return round(clamp(lerp(12.5, 20, t) + rng.range(-1.5, 1.5), 12, 22), 2);
  if (kind === 'quality') return round(clamp(lerp(8, 11, t) + rng.range(-1, 1), 8, 12), 2);
  return dip ? round(rng.range(3.5, 6), 2) : round(clamp(lerp(5.5, 9, t) + rng.range(-1.5, 1.5), 5, 12), 2);
}

// UTC clock times that stay on the same calendar day as the local date (Europe/Copenhagen is UTC+1/+2).
function startTime({ kind, date }, rng) {
  const at = (h0, h1) => {
    const m = Math.floor(rng.range(h0 * 60, h1 * 60));
    return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  };
  if (kind === 'long') return at(7, 9.5);
  if (kind === 'ride') return weekdayIndex(date) === 6 ? at(8, 10.5) : at(16, 17.75);
  if (kind === 'quality') return rng.chance(0.5) ? at(16, 17.5) : at(5.25, 6.5);
  return rng.chance(0.55) ? at(5.1, 6.8) : at(10.2, 11.7);
}

const nameFor = ({ kind, date }, time) => ({
  long: 'Long run', quality: 'Tempo run', ride: weekdayIndex(date) === 6 ? 'Sunday ride' : 'Evening ride',
}[kind] ?? (Number(time.slice(0, 2)) < 8 ? 'Morning run' : 'Lunch run'));

const RUN_PROFILE = { // pace sec/km, average HR
  easy: { pace: [350, 390], hr: [135, 150] },
  long: { pace: [355, 385], hr: [140, 155] },
  quality: { pace: [280, 315], hr: [155, 165] },
};

function sessionToActivity(session, t, rng, loops) {
  const { kind, date } = session;
  const isRun = kind !== 'ride';
  const distanceKm = distanceFor(session, t, rng);
  const time = startTime(session, rng);
  const profile = RUN_PROFILE[kind];
  const movingS = isRun
    ? Math.round(distanceKm * rng.int(...profile.pace))
    : Math.round((distanceKm / rng.range(24, 30)) * 3600);
  const avgHr = isRun ? rng.int(...profile.hr) : rng.int(115, 140);
  const stopShare = isRun ? rng.range(0.005, 0.03) : rng.range(0.03, 0.12);
  const points = renderLoop(pickLoop(loops, distanceKm, rng), distanceKm, rng, { reverse: rng.chance(0.3) });
  return {
    id: null, date, startUtc: `${date}T${time}:00Z`, sportType: isRun ? 'Run' : 'Ride', name: nameFor(session, time),
    distanceKm, movingMin: Math.round(movingS / 6) / 10, elapsedMin: Math.round((movingS * (1 + stopShare)) / 6) / 10,
    avgPaceSecPerKm: isRun ? Math.round(movingS / distanceKm) : null,
    avgHr, maxHr: avgHr + (isRun ? rng.int(12, 28) : rng.int(20, 40)),
    elevM: Math.round(distanceKm * (isRun ? rng.range(1.5, 6) : rng.range(1.5, 5))),
    workoutId: null, avgCadence: isRun ? round(rng.range(82, 88), 1) : null, avgWatts: null, sufferScore: null,
    commute: false, polyline: encodeLoop(points), startLatLng: startOf(points),
  };
}

/** The rows already in activities.json, completed with the fields the history rows carry (and a route). */
function completeExisting(row, rng, loops) {
  const isRun = row.sportType === 'Run';
  const points = renderLoop(pickLoop(loops, row.distanceKm, rng), row.distanceKm, rng);
  return {
    id: row.id, date: row.date, startUtc: row.startUtc, sportType: row.sportType, name: row.name,
    distanceKm: row.distanceKm, movingMin: row.movingMin, elapsedMin: round(row.movingMin * 1.05, 1),
    avgPaceSecPerKm: row.avgPaceSecPerKm, avgHr: row.avgHr, maxHr: row.avgHr == null ? null : row.avgHr + (isRun ? 18 : 24),
    elevM: Math.round(row.distanceKm * 3.5), workoutId: row.workoutId, avgCadence: isRun ? 85.6 : null,
    avgWatts: null, sufferScore: null, commute: row.commute, polyline: encodeLoop(points), startLatLng: startOf(points),
  };
}

/** The two done sessions of plan week 0 (Sat run, Sun ride), matching the review fixture: 5 km at 6:21, a 62 min ride. */
function planStartActivities(rng, loops) {
  const run = renderLoop(pickLoop(loops, 5, rng), 5, rng);
  const ride = renderLoop(pickLoop(loops, 25.2, rng), 25.2, rng);
  return [
    { id: null, date: '2026-10-10', startUtc: '2026-10-10T07:12:00Z', sportType: 'Run', name: 'Morning run', distanceKm: 5, movingMin: 31.8,
      elapsedMin: 33.1, avgPaceSecPerKm: 381, avgHr: 143, maxHr: 158, elevM: 14, workoutId: 'w-2026-10-10-run', avgCadence: 84.2,
      avgWatts: null, sufferScore: null, commute: false, polyline: encodeLoop(run), startLatLng: startOf(run) },
    { id: null, date: '2026-10-11', startUtc: '2026-10-11T08:40:00Z', sportType: 'Ride', name: 'Sunday ride', distanceKm: 25.2, movingMin: 62,
      elapsedMin: 66.4, avgPaceSecPerKm: null, avgHr: 121, maxHr: 147, elevM: 33, workoutId: 'w-2026-10-11-ride', avgCadence: null,
      avgWatts: null, sufferScore: null, commute: false, polyline: encodeLoop(ride), startLatLng: startOf(ride) },
  ];
}

/**
 * A year of invented runs and rides, [from, planStart) generated week by week, then plan week 0's two
 * sessions, then `existing` (the three rows activities.json already holds, kept with their ids).
 */
export function buildHistory({ rng, existing, from, planStart }) {
  const loops = makeBaseLoops(rng, LOOP_KMS);
  const generated = [];
  for (let monday = mondayOf(from); monday < planStart; monday = addDays(monday, 7)) {
    const t = clamp(diffDays(from, monday) / 7 / 52, 0, 1);
    for (const session of planWeek(rng, monday)) {
      if (session.date >= from && session.date < planStart) generated.push(sessionToActivity(session, t, rng, loops));
    }
  }
  const fresh = [...generated, ...planStartActivities(rng, loops)]
    .sort((a, b) => a.startUtc.localeCompare(b.startUtc))
    .map((row, i) => ({ ...row, id: FIRST_ID + i }));
  const kept = existing.map((row) => completeExisting(row, rng, loops));
  return [...fresh, ...kept].sort((a, b) => a.startUtc.localeCompare(b.startUtc));
}

// ── streams ─────────────────────────────────────────────────────────────────

/** One 10 km run: 600 evenly spaced points, pace 5:30–6:10, HR drifting 125 → 160, altitude 5–25 m, cadence 82–88. */
export function buildStreams(rng) {
  const totalKm = 10;
  const phase = rng.range(0, 2 * Math.PI);
  const out = { distanceKm: [], timeS: [], hr: [], altM: [], paceSecPerKm: [], cadence: [] };
  let time = 0, prevKm = 0;
  for (let i = 0; i < STREAM_POINTS; i++) {
    const x = i / (STREAM_POINTS - 1);
    const km = totalKm * x;
    const pace = Math.round(clamp(350 + 20 * Math.sin(2 * Math.PI * 8 * x + phase) + rng.normal() * 3, 330, 370));
    time += (km - prevKm) * pace;
    prevKm = km;
    out.distanceKm.push(round(km, 3));
    out.timeS.push(Math.round(time));
    out.paceSecPerKm.push(pace);
    out.hr.push(Math.round(clamp(125 + 35 * x + 2.5 * Math.sin(2 * Math.PI * 3 * x) + rng.normal() * 1.5, 120, 165)));
    out.altM.push(round(15 + 7 * Math.sin(2 * Math.PI * 2.2 * x + 0.6) + 2.5 * Math.sin(2 * Math.PI * 7 * x), 1));
    out.cadence.push(Math.round(clamp(85 + 1.5 * Math.sin(2 * Math.PI * 5 * x) + rng.normal(), 82, 88)));
  }
  return out;
}

// ── routes ──────────────────────────────────────────────────────────────────

// Whole sine cycles, so the profile ends where it started, as a loop must.
function elevationProfile(count, rng) {
  const base = rng.range(8, 14), a1 = rng.range(5, 8), a2 = rng.range(1.5, 3.5);
  const k1 = rng.int(2, 3), k2 = rng.int(5, 7), p1 = rng.range(0, 2 * Math.PI), p2 = rng.range(0, 2 * Math.PI);
  return Array.from({ length: count }, (_, i) => {
    const x = i / (count - 1);
    return round(base + a1 * Math.sin(2 * Math.PI * k1 * x + p1) + a2 * Math.sin(2 * Math.PI * k2 * x + p2), 1);
  });
}

const climb = (values) => values.reduce((sum, v, i) => (i && v > values[i - 1] ? sum + v - values[i - 1] : sum), 0);

const SURFACES = [
  { paved: 0.84, unpaved: 0.12, unknown: 0.04 },
  { paved: 0.71, unpaved: 0.26, unknown: 0.03 },
  { paved: 0.92, unpaved: 0.05, unknown: 0.03 },
];

/** What POST /api/routes/generate answers for a 10 km run: three distinct loops starting at the fictional centre. */
export function buildRoutesGenerate(rng) {
  const loops = makeBaseLoops(rng, ROUTE_KMS, { startAtCentre: true });
  const variants = loops.map((loop, i) => {
    const points = renderLoop(loop, ROUTE_KMS[i], rng, { jitter: false });
    const elevations = elevationProfile(points.length, rng);
    const negated = elevations.map((v) => -v);
    return {
      seed: ROUTE_SEED + i, distanceKm: ROUTE_KMS[i], ascentM: Math.round(climb(elevations)), descentM: Math.round(climb(negated)),
      polyline: encodeLoop(points), elevations, surface: SURFACES[i],
    };
  });
  return { profile: 'run', targetKm: 10, variants };
}

// ── health ──────────────────────────────────────────────────────────────────

const minutesApart = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 60000;

/** Health Connect sessions for a day: the fixed ones as given, plus a Strava-duplicate for about half the activities. */
function exerciseFor(date, activities, fixed, rng) {
  const keep = fixed.map((e) => ({ ...e }));
  const mirrored = activities
    .filter((a) => !a.commute && !keep.some((e) => minutesApart(e.startUtc, a.startUtc) < 10) && rng.chance(0.45))
    .map((a) => ({
      type: a.sportType === 'Run' ? 'running' : 'biking',
      startUtc: new Date(Date.parse(a.startUtc) - rng.int(-1, 2) * 60000).toISOString().replace('.000Z', 'Z'),
      durationMin: Math.round(a.movingMin) + 1, distanceKm: round(a.distanceKm * 0.98, 1), duplicateOfStrava: true,
    }));
  const extra = [];
  if (!fixed.length && rng.chance(0.06)) {
    const durationMin = rng.int(20, 50);
    extra.push({ type: 'walking', startUtc: `${date}T11:${pad(rng.int(0, 59))}:00Z`, durationMin, distanceKm: round(durationMin * 0.07, 1), duplicateOfStrava: false });
  }
  if (!fixed.length && rng.chance(0.03)) {
    extra.push({ type: 'strength_training', startUtc: `${date}T17:00:00Z`, durationMin: 25, distanceKm: null, duplicateOfStrava: false });
  }
  return [...keep, ...mirrored, ...extra].sort((a, b) => a.startUtc.localeCompare(b.startUtc));
}

/**
 * Daily health rows for [from, to], same keys as health.json. `fixedExercise` (date → sessions) keeps the
 * sessions health.json already has, so the Health view's duplicate-of-Strava marking still shows.
 */
export function buildHealthYear({ rng, history, from, to, fixedExercise }) {
  const byDate = new Map();
  for (const a of history) byDate.set(a.date, [...(byDate.get(a.date) || []), a]);
  const rows = [];
  for (let i = 0; i <= diffDays(from, to); i++) {
    const date = addDays(from, i);
    const acts = byDate.get(date) || [];
    const runKm = acts.filter((a) => a.sportType === 'Run').reduce((sum, a) => sum + a.distanceKm, 0);
    const steps = Math.round(clamp(7000 + runKm * 650 + (weekdayIndex(date) >= 5 ? 1500 : 0) + rng.normal() * 1200, 6000, 20000));
    const sleepHours = rng.chance(0.04) ? null : round(clamp(7.2 + 0.5 * wave(i, 45) + rng.normal() * 0.6, 6, 8.5), 1);
    rows.push({
      date, steps, distanceKm: round(steps * 0.00078, 1), activeKcal: Math.round(320 + steps * 0.018 + rng.normal() * 25),
      restingHr: Math.round(clamp(52 + 2.5 * wave(i, 160) + rng.normal() * 1.6, 48, 56)),
      hrvRmssd: rng.chance(0.03) ? null : Math.round(clamp(57 + 7 * wave(i, 110, 25) + rng.normal() * 4, 45, 70)),
      avgHr: Math.round(clamp(70 + 2 * wave(i, 160) + rng.normal() * 2, 64, 78)),
      sleepHours, sleepDeepH: sleepHours == null ? null : round(rng.range(0.9, 1.5), 1), sleepRemH: sleepHours == null ? null : round(rng.range(1.3, 2), 1),
      weightKg: rng.chance(0.4) ? round(clamp(75 + 0.7 * wave(i, 200) - 0.3 * (i / 365) + rng.normal() * 0.15, 74, 76), 1) : null,
      vo2max: i % 7 === 0 ? round(clamp(52 + 2 * (i / 365) + rng.normal() * 0.6, 51, 56), 1) : null,
      spo2: rng.int(95, 98),
      exercise: exerciseFor(date, acts, fixedExercise.get(date) || [], rng),
    });
  }
  return rows;
}
