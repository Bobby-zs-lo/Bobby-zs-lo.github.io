// Pure formatting helpers. Dates are 'YYYY-MM-DD' strings handled in UTC so
// the device time zone never shifts a day. Weeks start on Monday (Danish).

const pad2 = n => String(n).padStart(2, '0');

export function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}
export function toISODate(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
export function addDays(s, n) {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toISODate(d);
}
/** Monday = 0 … Sunday = 6 */
export function weekdayIndex(s) {
  return (parseDate(s).getUTCDay() + 6) % 7;
}
export function mondayOf(s) {
  return addDays(s, -weekdayIndex(s));
}
export function weekDates(s) {
  const mon = mondayOf(s);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}
export function diffDays(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}
/**
 * The date in Copenhagen, for a view whose /api/state (which carries the server's `today`)
 * failed. Not toISODate(new Date()): that is the UTC date, a day behind until 01:00 or 02:00.
 */
export function copenhagenToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen' }).format(now);
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

export const dayShort = s => DAYS[weekdayIndex(s)];
export const dayLong = s => DAYS_LONG[weekdayIndex(s)];

/** 'Tue 13 Oct' */
export function formatDate(s, { year = false, long = false } = {}) {
  const d = parseDate(s);
  if (!d) return '';
  const day = long ? DAYS_LONG[weekdayIndex(s)] : DAYS[weekdayIndex(s)];
  const mon = long ? MONTHS_LONG[d.getUTCMonth()] : MONTHS[d.getUTCMonth()];
  return `${day} ${d.getUTCDate()} ${mon}${year ? ' ' + d.getUTCFullYear() : ''}`;
}
/** '12–18 Oct' or '28 Sep – 4 Oct' */
export function formatWeekRange(startDate) {
  const a = parseDate(startDate), b = parseDate(addDays(startDate, 6));
  if (a.getUTCMonth() === b.getUTCMonth()) {
    return `${a.getUTCDate()}–${b.getUTCDate()} ${MONTHS[a.getUTCMonth()]}`;
  }
  return `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`;
}

/** 364 → '6:04' */
export function formatPace(secPerKm) {
  if (secPerKm == null || !isFinite(secPerKm) || secPerKm <= 0) return '–';
  let s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}
/** '5:55' → 355 */
export function parsePace(str) {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(String(str || '').trim());
  return m ? +m[1] * 60 + +m[2] : null;
}
/** paces = plan.paces, key = 'E' → '5:55–6:30/km' */
export function paceRange(paces, key) {
  const p = key && paces && paces[key];
  if (!p) return '';
  if (p.min && p.max && p.min !== p.max) return `${p.min}–${p.max}/km`;
  return `${p.min || p.max}/km`;
}
export const PACE_NAMES = { E: 'Easy', M: 'Marathon', T: 'Threshold', I: 'Interval', R: 'Repetition', HM: 'Half marathon' };

/** 5 → '5 km', 5.24 → '5.2 km', 0.4 → '0.4 km' */
export function formatDistance(km, { unit = true } = {}) {
  if (km == null || !isFinite(km)) return '–';
  const r = Math.round(km * 10) / 10;
  const s = Number.isInteger(r) ? String(r) : r.toFixed(1);
  return unit ? `${s} km` : s;
}
/** minutes → '45 min' / '1 h' / '1 h 30 min' */
export function formatDuration(min) {
  if (min == null || !isFinite(min)) return '–';
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${pad2(r)} min` : `${h} h`;
}
/** seconds → 'mm:ss' (or 'h:mm:ss' past an hour) */
export function formatMmSs(sec) {
  if (sec == null || !isFinite(sec)) return '';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${pad2(m)}:${pad2(r)}` : `${m}:${pad2(r)}`;
}
/** 'mm:ss' or 'h:mm:ss' → seconds, or null when malformed */
export function parseMmSs(str) {
  const t = String(str || '').trim();
  let m = /^(\d{1,3}):([0-5]\d)$/.exec(t);
  if (m) return +m[1] * 60 + +m[2];
  m = /^(\d):([0-5]\d):([0-5]\d)$/.exec(t);
  if (m) return +m[1] * 3600 + +m[2] * 60 + +m[3];
  return null;
}
/** Workout amount line: '5 km', '60 min', '10 km · 50 min' */
export function workoutAmount(w) {
  const parts = [];
  if (w.distanceKm != null) parts.push(formatDistance(w.distanceKm));
  if (w.durationMin != null) parts.push(formatDuration(w.durationMin));
  return parts.join(' · ');
}
/** ISO timestamp → '14 Oct, 08:12' (en-GB, Copenhagen time) */
export function formatTimestamp(iso, now = new Date()) {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (isNaN(d)) return 'never';
  const tz = 'Europe/Copenhagen';
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(d);
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short' }).format(d);
  const mins = Math.round((now - d) / 60000);
  let rel = '';
  if (mins >= 0 && mins < 60) rel = mins <= 1 ? 'just now' : `${mins} min ago`;
  else if (mins >= 60 && mins < 60 * 24) rel = `${Math.round(mins / 60)} h ago`;
  return rel ? `${day}, ${time} (${rel})` : `${day}, ${time}`;
}
/** ISO timestamp → '07:58' (24 hours, Copenhagen time), '' when there is none */
export function formatClock(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d)) return '';
  // hourCycle, not hour12: with hour12 false some engines write midnight as '24:05'.
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
}
export function formatNumber(n, digits = 0) {
  if (n == null || !isFinite(n)) return '–';
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
}

export const RUN_SPORTS = new Set(['Run', 'TrailRun', 'VirtualRun']);
export const RIDE_SPORTS = new Set(['Ride', 'VirtualRide', 'GravelRide', 'MountainBikeRide', 'EBikeRide', 'EMountainBikeRide']);
export function sportFamily(sportType) {
  if (RUN_SPORTS.has(sportType)) return 'run';
  if (RIDE_SPORTS.has(sportType)) return 'ride';
  if (['WeightTraining', 'Workout', 'Crossfit'].includes(sportType)) return 'strength';
  return 'other';
}
/** Sum of run km over a list of Strava activities */
export function runKm(activities) {
  return (activities || []).reduce((s, a) => s + (sportFamily(a.sportType) === 'run' ? (a.distanceKm || 0) : 0), 0);
}

// Health Connect names its exercise sessions by type, and the backend passes the name on in
// capitals: 'RUNNING', 'BIKING', 'STRENGTH_TRAINING', …
const EXERCISE_NAMES = {
  running: 'Run', running_treadmill: 'Treadmill run', biking: 'Ride', cycling: 'Ride', walking: 'Walk',
  strength_training: 'Strength', weightlifting: 'Strength',
};
/** 'RUNNING' → 'Run'; a type without a short name is spelled out: 'OTHER_WORKOUT' → 'Other workout' */
export function exerciseName(type) {
  const key = String(type || '').toLowerCase();
  return EXERCISE_NAMES[key] || (key || 'exercise').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}
/** 'run' | 'ride' | 'walk' | 'strength' | 'other', the Health Connect counterpart of sportFamily */
export function exerciseFamily(type) {
  const v = String(type || '').toLowerCase();
  if (v.includes('bik') || v.includes('cycl')) return 'ride';
  if (v.includes('run')) return 'run';
  if (v.includes('walk') || v.includes('hik')) return 'walk';
  if (v.includes('strength') || v.includes('weight')) return 'strength';
  return 'other';
}
export const PHASE_NAMES = {
  reentry: 'Re-entry', base: 'Base', halfbuild: 'Half-marathon build', recovery: 'Recovery',
  base2: 'Base II', marathon: 'Marathon build', taper: 'Taper',
};
export const STATUS_NAMES = { planned: 'Planned', done: 'Done', partial: 'Partial', skipped: 'Skipped', moved: 'Moved' };
