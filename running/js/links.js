// Which recorded sessions count for a planned workout: the pure half of the editor on the
// session page (js/views/workout-links.js) and of the hints on Today, Week and Activity.
//
// A "day" is one entry of GET /api/week's `days`: { date, workouts, activities, health }.
// A Strava activity carries `workoutId`; a Health Connect session (day.health.exercise) carries
// `id`, `workoutId` and `duplicateOfStrava`. The choice is saved with
//   PUT /api/workouts/:id/links { activityIds: string[], healthIds: string[] }
// which names the complete set that counts for the workout, on the workout's own day only.
import { formatDistance, formatDuration, formatClock, exerciseName, exerciseFamily, sportFamily } from './format.js';

export const MAX_LINKS = 10; // of each kind; the backend refuses more

const SOURCE = { activity: 'Strava', health: 'Health Connect' };
const DUPLICATE_NOTE = 'Same as the Strava activity';
// The sport family a planned workout expects of a recorded session.
const WORKOUT_FAMILY = { run: 'run', race: 'run', ride: 'ride', strength: 'strength' };

const byStart = (a, b) => String(a.startUtc || '').localeCompare(String(b.startUtc || ''));
const dayActivities = day => [...((day && day.activities) || [])].sort(byStart);
const sum = (rows, field) => rows.reduce((total, row) => total + (row[field] || 0), 0);
const oneDecimal = x => Math.round(x * 10) / 10;

/**
 * The day's Health Connect sessions, by start time. Only those with an id: a response from
 * before the backend sent ids has nothing a link could name.
 */
export function healthSessions(day) {
  const list = (day && day.health && day.health.exercise) || [];
  return list.filter(s => s && s.id).sort(byStart);
}

/** Whether anything at all was recorded that day; without it there is nothing to choose from. */
export function hasRecorded(day) {
  return dayActivities(day).length + healthSessions(day).length > 0;
}

/**
 * What counts for a workout: its Strava activities and its Health Connect sessions. A Health
 * Connect copy of a Strava activity never counts, so nothing is counted twice.
 */
export function linkedSessions(day, workoutId) {
  return {
    activities: dayActivities(day).filter(a => a.workoutId === workoutId),
    health: healthSessions(day).filter(s => s.workoutId === workoutId && !s.duplicateOfStrava),
  };
}

/** How many sessions count, and their distance and time together. */
export function linkedTotals({ activities, health }) {
  return {
    count: activities.length + health.length,
    distanceKm: sum(activities, 'distanceKm') + sum(health, 'distanceKm'),
    durationMin: sum(activities, 'movingMin') + sum(health, 'durationMin'),
  };
}

/** 'Exactly as planned.', '1.4 km more than planned.', … or '' when there is no distance to compare. */
export function comparisonLine(workout, totals) {
  const planned = workout.distanceKm;
  const actual = totals.distanceKm;
  if (!totals.count || !(planned > 0) || !(actual > 0)) return '';
  const diff = oneDecimal(actual - planned);
  const verdict = diff === 0 ? 'Exactly as planned.'
    : diff > 0 ? `${formatDistance(diff)} more than planned.` : `${formatDistance(-diff)} short of the plan.`;
  return totals.count > 1 ? `${formatDistance(actual)} together. ${verdict}` : verdict;
}

/** '5.1 km · 32 min · 07:02': what tells two sessions of a day apart. */
export function sessionStats({ distanceKm, durationMin, startUtc }) {
  return [distanceKm == null ? '' : formatDistance(distanceKm), formatDuration(durationMin), formatClock(startUtc)]
    .filter(Boolean).join(' · ');
}

/** Why a row is not simply free: it is a copy, or it counts for another session of the day. */
function noteFor(row, workoutId, titles) {
  if (row.duplicateOfStrava) return DUPLICATE_NOTE;
  if (!row.workoutId || row.workoutId === workoutId) return null;
  return titles.has(row.workoutId) ? `Linked to ${titles.get(row.workoutId)}` : 'Linked to another session';
}

/**
 * One row per session recorded that day, for the editor: Strava first, then Health Connect,
 * each by start time. `linked` rows count for this workout now; a `disabled` row is a Health
 * Connect copy of a Strava activity, which the backend refuses.
 */
export function linkCandidates(day, workoutId) {
  const titles = new Map(((day && day.workouts) || []).map(w => [w.id, w.title]));
  const row = (kind, r, name, durationMin) => {
    const disabled = kind === 'health' && !!r.duplicateOfStrava;
    return {
      key: `${kind}:${r.id}`, kind, id: String(r.id), source: SOURCE[kind], name, commute: !!r.commute,
      stats: sessionStats({ distanceKm: r.distanceKm, durationMin, startUtc: r.startUtc }),
      linked: !disabled && r.workoutId === workoutId, disabled, note: noteFor(r, workoutId, titles),
    };
  };
  return [
    ...dayActivities(day).map(a => row('activity', a, a.name || a.sportType, a.movingMin)),
    ...healthSessions(day).map(s => row('health', s, exerciseName(s.type), s.durationMin)),
  ];
}

/** The keys ticked when the editor opens: what counts now. */
export function initialSelection(candidates) {
  return candidates.filter(c => c.linked).map(c => c.key);
}

/** The PUT body for the ticked keys: ids as strings, in the order shown, never a disabled row. */
export function linksBody(candidates, keys) {
  const ticked = new Set(keys);
  const ids = kind => candidates.filter(c => c.kind === kind && !c.disabled && ticked.has(c.key)).map(c => c.id);
  return { activityIds: ids('activity'), healthIds: ids('health') };
}

/** A message when the body breaks the backend's limit, else null. */
export function linksError({ activityIds, healthIds }) {
  if (activityIds.length > MAX_LINKS) return `Choose at most ${MAX_LINKS} Strava activities.`;
  if (healthIds.length > MAX_LINKS) return `Choose at most ${MAX_LINKS} Health Connect sessions.`;
  return null;
}

/**
 * Whether the day holds a session of the workout's own sport that counts for nothing yet.
 * Today offers "Link a recorded session" only then: the ride to work, a walk or a Health
 * Connect copy of a Strava activity should not prompt on every planned run.
 */
export function hasUnlinkedMatch(day, workout) {
  const family = WORKOUT_FAMILY[workout.sport];
  if (!family) return false;
  const planned = new Set(((day && day.workouts) || []).map(w => w.id));
  const free = row => !row.workoutId || !planned.has(row.workoutId);
  return dayActivities(day).some(a => free(a) && sportFamily(a.sportType) === family && !(family === 'ride' && a.commute))
    || healthSessions(day).some(s => free(s) && !s.duplicateOfStrava && exerciseFamily(s.type) === family);
}
