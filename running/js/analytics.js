// Training analytics for the desk views: plan adherence, weekly volume, pace
// zones, efficiency and the fitness / fatigue / form curves. Everything here is
// a pure function of the plan, the activity list and the health rows. There is
// no DOM, network or clock access (callers pass `today`), so it is easy to test.
// Dates are 'YYYY-MM-DD' strings, which sort and compare correctly as text.

import { addDays, diffDays, mondayOf, parsePace, sportFamily } from './format.js';

/** Pace zones from slowest to fastest; ties between two zones go to the earlier one. */
export const ZONE_ORDER = Object.freeze(['E', 'M', 'HM', 'T', 'I', 'R']);

/** A year as the views count it: 52 whole weeks, so a year back from a Tuesday is a Tuesday. */
export const YEAR_DAYS = 364;

const EASY_KINDS = new Set(['easy', 'long', 'recovery']);
const HIT_STATUSES = ['done', 'partial', 'skipped'];

// Fitness and fatigue are exponentially weighted averages of daily load; the
// classic CTL / ATL time constants.
const FITNESS_DAYS = 42;
const FATIGUE_DAYS = 7;

// Banister TRIMP weights, and the per-minute load used when no HR was recorded.
const TRIMP_SCALE = 0.64;
const TRIMP_EXPONENT = 1.92;
const NO_HR_LOAD_PER_MIN = { run: 1.2, ride: 0.8, other: 0.6 };

const DEFAULT_HR_REST = 55;
const DEFAULT_HR_MAX = 190;
// A max within this many beats of rest would make heart-rate reserve meaningless.
const MIN_HR_SPREAD = 40;
// Optical wrist sensors spike well past any real maximum; drop those readings.
const MAX_PLAUSIBLE_HR = 220;

// Period lengths measured back from the Monday of this week.
const WEEK_SPAN_DAYS = { '4w': 21, '12w': 77 };

// `+ 0` turns a rounded -0 into 0, so a tiny negative form never prints as '-0'.
const round1 = x => Math.round(x * 10) / 10 + 0;
const round2 = x => Math.round(x * 100) / 100 + 0;
const round3 = x => Math.round(x * 1000) / 1000 + 0;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const isPositive = v => typeof v === 'number' && Number.isFinite(v) && v > 0;
// Anything that iterates or buckets by date needs a real calendar-shaped date;
// a stray string would otherwise sort into the range or crash the date maths.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const hasValidDate = a => ISO_DATE.test(a?.date);
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/** A planned session the plan counts as running: a run, or the race itself. */
export const isRunWorkout = w => w.sport === 'run' || w.sport === 'race';

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// --- periods and filtering ---------------------------------------------------

export function periodRange(key, today, plan) {
  const seasonStart = plan?.weeks?.[0]?.startDate;
  if (key === '1y') return { from: addDays(today, -YEAR_DAYS), to: today };
  if (key === 'all') return { from: '2000-01-01', to: today };
  if (key === 'season' && seasonStart) {
    // Before the plan begins, show its first week rather than an inverted range.
    return { from: seasonStart, to: today < seasonStart ? addDays(seasonStart, 6) : today };
  }
  // '4w', '12w' and anything unknown.
  return { from: addDays(mondayOf(today), -(WEEK_SPAN_DAYS[key] ?? WEEK_SPAN_DAYS['12w'])), to: today };
}

export function filterActivities(acts, { from, to, sport = 'all' }) {
  return (acts || []).filter(a => hasValidDate(a) && a.date >= from && a.date <= to
    && (sport === 'all' || sportFamily(a.sportType) === sport));
}

/** Every Monday from the week of `from` through the week of `to`, inclusive. */
export function weeksBetween(from, to) {
  const weeks = [];
  const last = mondayOf(to);
  for (let monday = mondayOf(from); monday <= last; monday = addDays(monday, 7)) weeks.push(monday);
  return weeks;
}

export function weekOf(plan, date) {
  const monday = mondayOf(date);
  return (plan?.weeks || []).find(w => w.startDate === monday) || null;
}

// --- volume and plan adherence -----------------------------------------------

// The plan prescribes running only, so a non-running sport has no plan at all
// (null, which the bars read as "no plan" rather than "planned 0 km"), and nor
// does a week missing from the plan. 'all' keeps the run plan, because running
// is all the plan ever asks for.
function plannedKmFor(week, sport) {
  if (!week || (sport !== 'run' && sport !== 'all')) return null;
  return round1(week.workouts.filter(isRunWorkout).reduce((sum, w) => sum + (w.distanceKm || 0), 0));
}

export function weeklyVolume(plan, acts, { from, to, sport = 'run' }) {
  const weeks = weeksBetween(from, to);
  if (!weeks.length) return [];
  // Whole weeks count, whatever the range edges are. One pass over the span,
  // bucketed by Monday, instead of a filter per week.
  const kmByWeek = new Map();
  for (const a of filterActivities(acts, { from: weeks[0], to: addDays(weeks[weeks.length - 1], 6), sport })) {
    const monday = mondayOf(a.date);
    kmByWeek.set(monday, (kmByWeek.get(monday) || 0) + (a.distanceKm || 0));
  }
  return weeks.map(week => {
    const planWeek = weekOf(plan, week);
    return {
      week,
      plannedKm: plannedKmFor(planWeek, sport),
      actualKm: round1(kmByWeek.get(week) || 0),
      label: planWeek?.label ?? null,
      phase: planWeek?.phase ?? null,
      isCutback: Boolean(planWeek?.isCutback),
    };
  });
}

/** How much of the past plan was run. Today and the future are not judged yet. */
export function planHitRate(plan, { from, to, today }) {
  const n = { done: 0, partial: 0, skipped: 0, missed: 0 };
  for (const week of plan?.weeks || []) {
    for (const w of week.workouts || []) {
      if (!isRunWorkout(w) || w.date < from || w.date > to || w.date >= today) continue;
      // Still 'planned' or 'moved' in the past means it never happened.
      n[HIT_STATUSES.includes(w.status) ? w.status : 'missed']++;
    }
  }
  const total = n.done + n.partial + n.skipped + n.missed;
  return { ...n, total, pct: total ? Math.round(100 * (n.done + 0.5 * n.partial) / total) : null };
}

// --- easy days and pace zones ------------------------------------------------

/** Easy, long and recovery runs run faster than the easy pace allows (less `slackSec`). */
export function easyTooFast(plan, acts, paces, { from, to, slackSec = 10 }) {
  const easyFastest = parsePace(paces?.E?.min);
  if (easyFastest == null) return { count: 0, total: 0, ids: [] }; // nothing to judge against
  const kindById = new Map();
  for (const week of plan?.weeks || []) for (const w of week.workouts || []) kindById.set(w.id, w.kind);
  const easyRuns = filterActivities(acts, { from, to, sport: 'run' })
    .filter(a => a.workoutId != null && EASY_KINDS.has(kindById.get(a.workoutId)) && a.avgPaceSecPerKm != null);
  const ids = easyRuns.filter(a => a.avgPaceSecPerKm < easyFastest - slackSec).map(a => a.id);
  return { count: ids.length, total: easyRuns.length, ids };
}

/** Which pace zone an average pace (sec/km) belongs to, or null if it cannot say. */
export function classifyPace(sec, paces) {
  if (!Number.isFinite(sec) || !paces) return null;
  const windows = ZONE_ORDER
    .map(key => ({ key, lo: parsePace(paces[key]?.min), hi: parsePace(paces[key]?.max) }))
    .filter(w => w.lo != null && w.hi != null);
  if (!windows.length) return null;
  // Slower than easy is still easy; faster than the fastest zone is that zone.
  const easy = windows.find(w => w.key === 'E');
  if (easy && sec > easy.hi) return 'E';
  const fastest = windows.reduce((best, w) => (w.lo < best.lo ? w : best));
  if (sec < fastest.lo) return fastest.key;
  // In between: the nearest window (0 inside it). Strict `<` keeps the slower zone on a tie.
  let best = null;
  let bestGap = Infinity;
  for (const w of windows) {
    const gap = Math.max(w.lo - sec, sec - w.hi, 0);
    if (gap < bestGap) { best = w.key; bestGap = gap; }
  }
  return best;
}

/** Time in each zone, by each run's average pace (imported runs carry no splits). */
export function paceZoneShares(acts, paces) {
  const minutes = Object.fromEntries(ZONE_ORDER.map(key => [key, 0]));
  for (const a of acts || []) {
    if (sportFamily(a.sportType) !== 'run' || !isPositive(a.avgPaceSecPerKm)) continue;
    const key = classifyPace(a.avgPaceSecPerKm, paces);
    if (key && isPositive(a.movingMin)) minutes[key] += a.movingMin;
  }
  const total = ZONE_ORDER.reduce((sum, key) => sum + minutes[key], 0);
  return ZONE_ORDER.map(key => ({
    key,
    minutes: round1(minutes[key]),
    share: total ? round3(minutes[key] / total) : 0,
  }));
}

// --- efficiency and heart-rate defaults --------------------------------------

/** Efficiency factor: metres covered per heartbeat, (60000 / pace) / avgHr. */
export function efficiencySeries(acts) {
  return (acts || [])
    .filter(a => hasValidDate(a) && sportFamily(a.sportType) === 'run' && isPositive(a.avgHr) && isPositive(a.avgPaceSecPerKm))
    .map(a => ({ date: a.date, ef: round2((60000 / a.avgPaceSecPerKm) / a.avgHr) }))
    .sort(byDate);
}

/** Median `ef` over the `days` days ending on each point's date: (date - days, date]. */
export function rollingMedian(series, days) {
  const points = [...(series || [])].sort(byDate);
  let lo = 0;
  return points.map((p, i) => {
    while (lo < i && diffDays(points[lo].date, p.date) >= days) lo++;
    // Points sharing this date all see the whole day, so look past i to the end of it.
    let hi = i;
    while (hi + 1 < points.length && points[hi + 1].date === p.date) hi++;
    return { date: p.date, value: round2(median(points.slice(lo, hi + 1).map(q => q.ef))) };
  });
}

/** Resting HR from the health rows (median), max HR from the activities (highest seen). */
export function hrDefaults(acts, health) {
  const rests = (health || []).map(h => h.restingHr).filter(isPositive);
  const maxes = (acts || []).map(a => a.maxHr).filter(hr => isPositive(hr) && hr <= MAX_PLAUSIBLE_HR);
  const hrRest = rests.length ? median(rests) : DEFAULT_HR_REST;
  const seenMax = maxes.length ? maxes.reduce((a, b) => Math.max(a, b)) : DEFAULT_HR_MAX;
  return { hrRest, hrMax: Math.max(seenMax, hrRest + MIN_HR_SPREAD) };
}

// --- load --------------------------------------------------------------------

/** Banister TRIMP when the activity has HR; a duration estimate by sport otherwise. */
export function activityLoad(a, { hrRest, hrMax }) {
  if (!isPositive(a.movingMin)) return 0;
  const reserve = hrMax - hrRest;
  if (isPositive(a.avgHr) && reserve > 0) {
    const hrr = clamp((a.avgHr - hrRest) / reserve, 0, 1);
    return a.movingMin * hrr * TRIMP_SCALE * Math.exp(TRIMP_EXPONENT * hrr);
  }
  return a.movingMin * (NO_HR_LOAD_PER_MIN[sportFamily(a.sportType)] ?? NO_HR_LOAD_PER_MIN.other);
}

/**
 * Daily load with fitness (42 d), fatigue (7 d) and form (fitness - fatigue).
 * The averages start at zero on the first activity, so days before `from` warm
 * them up but are not returned. Loads are bucketed by date first, so years of
 * activities cost one pass plus one step per calendar day.
 */
export function loadSeries(acts, { from, to, hrRest, hrMax }) {
  if (from > to) return [];
  const loadByDate = new Map();
  let start = from;
  for (const a of acts || []) {
    if (!hasValidDate(a) || a.date > to) continue;
    loadByDate.set(a.date, (loadByDate.get(a.date) || 0) + activityLoad(a, { hrRest, hrMax }));
    if (a.date < start) start = a.date;
  }
  const series = [];
  let fitness = 0;
  let fatigue = 0;
  for (let date = start; date <= to; date = addDays(date, 1)) {
    const load = loadByDate.get(date) || 0;
    fitness += (load - fitness) / FITNESS_DAYS; // carry the unrounded state forward
    fatigue += (load - fatigue) / FATIGUE_DAYS;
    if (date >= from) {
      series.push({ date, load: round1(load), fitness: round1(fitness), fatigue: round1(fatigue), form: round1(fitness - fatigue) });
    }
  }
  return series;
}

/** Earliest valid activity date, or null; lets a view clamp the 'all' period to real data. */
export function firstActivityDate(acts) {
  let first = null;
  for (const a of acts || []) {
    if (hasValidDate(a) && (first === null || a.date < first)) first = a.date;
  }
  return first;
}

/** Date -> total kilometres that day, across every sport (filter first to narrow). */
export function dailyKm(acts) {
  const km = new Map();
  for (const a of acts || []) {
    if (hasValidDate(a)) km.set(a.date, (km.get(a.date) || 0) + (a.distanceKm || 0));
  }
  return new Map([...km].map(([date, total]) => [date, round1(total)]));
}
