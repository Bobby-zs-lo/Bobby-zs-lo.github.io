// The Overview's numbers, computed once per filter change from the loaded data. Pure: no DOM,
// no network and no clock (today comes from /api/state), so a filter click costs one pass
// here and the tiles only format what it returns. Every aggregate comes from analytics.js;
// this file decides which slice of the data each tile looks at.
import { addDays, diffDays, mondayOf, parsePace } from '../format.js';
import {
  periodRange, filterActivities, weeklyVolume, planHitRate, easyTooFast, paceZoneShares,
  efficiencySeries, rollingMedian, hrDefaults, loadSeries, dailyKm, weekOf, firstActivityDate,
} from '../analytics.js';

export const MAX_BAR_WEEKS = 104;   // two years of bars is as many as 720 px can tell apart
export const CALENDAR_WEEKS = 53;
const EFFICIENCY_DAYS = 28;
const EASY_SLACK_SEC = 10;
const RECENT_DAYS = 28;             // "in the last 4 weeks", today included
const YEAR_DAYS = 364;
const UPCOMING_RUNS = 3;            // listed under the next run
const CLOSED = new Set(['done', 'skipped']);

const isRunWorkout = w => w.sport === 'run' || w.sport === 'race';
const byStart = (a, b) => String(a.startUtc || a.date).localeCompare(String(b.startUtc || b.date));
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
const sumKm = acts => acts.reduce((s, a) => s + (a.distanceKm || 0), 0);

/** The visible date range; 'all' starts at the first activity rather than in the year 2000. */
export function displayRange(p, today, plan, acts) {
  const base = periodRange(p, today, plan);
  if (p !== 'all') return base;
  const first = firstActivityDate(acts);
  return { from: first && first <= today ? first : addDays(today, -YEAR_DAYS), to: today };
}

function planPosition(plan, today, focusWeek) {
  const weeks = plan?.weeks || [];
  const current = weekOf(plan, today);
  const focus = weekOf(plan, focusWeek);
  const n = w => (w ? weeks.indexOf(w) + 1 : null);
  return {
    current, currentN: n(current), focus, focusN: n(focus), total: weeks.length,
    start: weeks[0]?.startDate || null,
    end: weeks.length ? addDays(weeks[weeks.length - 1].startDate, 6) : null,
  };
}

function nextRun(plan, today, sel) {
  const weeks = plan?.weeks || [];
  if (sel) {
    // A picked week shows its key session: the one marked key, else its longest run.
    const runs = (weekOf(plan, sel)?.workouts || []).filter(isRunWorkout);
    const pick = runs.find(w => w.key) || [...runs].sort((a, b) => (b.distanceKm || 0) - (a.distanceKm || 0))[0] || null;
    return { mode: 'week', pick, then: [] };
  }
  const upcoming = weeks.flatMap(w => w.workouts || [])
    .filter(w => isRunWorkout(w) && w.date >= today && !CLOSED.has(w.status))
    .sort(byDate);
  return { mode: 'next', pick: upcoming[0] || null, then: upcoming.slice(1, 1 + UPCOMING_RUNS) };
}

/** Active days, the longest run of consecutive active days, and the one still going today. */
function streaks(kmByDate, from, to) {
  let active = 0, longest = 0, run = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if ((kmByDate.get(d) || 0) > 0) { active++; run++; longest = Math.max(longest, run); }
    else run = 0;
  }
  // A rest day today does not break the streak yet: count back from yesterday instead.
  let current = 0;
  let d = (kmByDate.get(to) || 0) > 0 ? to : addDays(to, -1);
  while (d >= from && (kmByDate.get(d) || 0) > 0) { current++; d = addDays(d, -1); }
  return { active, longest, current, days: diffDays(from, to) + 1 };
}

/** Per weekday (Monday first): how many of those days there were, and on how many you moved. */
function weekdays(kmByDate, monday, to) {
  const out = Array.from({ length: 7 }, () => ({ days: 0, active: 0 }));
  for (let d = monday, i = 0; d <= to; d = addDays(d, 1), i = (i + 1) % 7) {
    out[i].days++;
    if ((kmByDate.get(d) || 0) > 0) out[i].active++;
  }
  return out;
}

const HEALTH_KEYS = ['restingHr', 'hrvRmssd', 'sleepHours', 'steps', 'weightKg'];

function healthSeries(rows, from, to) {
  const byDate = new Map((rows || []).map(r => [r.date, r]));
  const dates = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  const series = {};
  for (const key of HEALTH_KEYS) {
    const values = dates.map(d => {
      const v = byDate.get(d)?.[key];
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    });
    const present = values.filter(v => v != null);
    series[key] = {
      values,
      latest: present.length ? present[present.length - 1] : null,
      mean: present.length ? present.reduce((a, b) => a + b, 0) / present.length : null,
    };
  }
  return { from, to, days: dates.length, series };
}

/**
 * Everything the tiles show. `acts` may include up to a year and a quarter before the period
 * (warm-up for the load curves, and the calendar's full year); `errors` names the requests
 * that failed, so each tile can say so on its own.
 */
export function buildModel({ today, settings, plan, acts, health, filters, errors = {} }) {
  const { p, s } = filters;
  const all = [...(acts || [])].sort(byStart);
  const range = displayRange(p, today, plan, all);
  const paces = plan?.paces || null;

  let weekRows = weeklyVolume(plan, all, { ...range, sport: s });
  const totalWeeks = weekRows.length;
  const capped = weekRows.length > MAX_BAR_WEEKS;
  if (capped) weekRows = weekRows.slice(-MAX_BAR_WEEKS);
  // A week outside the bars (the period shrank under it) is dropped rather than kept invisibly.
  const sel = filters.w && weekRows.some(r => r.week === filters.w) ? filters.w : null;
  const focusWeek = sel || mondayOf(today);

  const periodActs = filterActivities(all, { ...range, sport: s });
  const weekActs = filterActivities(all, { from: focusWeek, to: addDays(focusWeek, 6), sport: s });
  const scoped = sel ? weekActs : periodActs;
  const weekRow = weeklyVolume(plan, all, { from: focusWeek, to: focusWeek, sport: s })[0];
  // The plan is running only, so 'Everything' still measures plan progress by run km.
  const weekRunKm = s === 'run' ? weekRow.actualKm : weeklyVolume(plan, all, { from: focusWeek, to: focusWeek, sport: 'run' })[0].actualKm;

  const raceDate = settings?.raceDate || plan?.raceDate || null;
  const race = raceDate
    ? { date: raceDate, name: settings?.raceName || plan?.raceName || 'race day', days: diffDays(today, raceDate) }
    : null;

  const easyFastest = parsePace(paces?.E?.min);
  const easy = {
    ...easyTooFast(plan, all, paces, { ...range, slackSec: EASY_SLACK_SEC }),
    limit: easyFastest == null ? null : easyFastest - EASY_SLACK_SEC,
  };

  // Load is physiological, so it counts every sport whatever the sport filter says.
  const hr = hrDefaults(all, health);
  const load = all.length ? loadSeries(all, { ...range, ...hr }) : [];

  const effFrom = addDays(range.from, -EFFICIENCY_DAYS);
  const eff = rollingMedian(efficiencySeries(filterActivities(all, { from: effFrom, to: range.to, sport: 'run' })), EFFICIENCY_DAYS)
    .filter(pt => pt.date >= range.from && pt.value != null);

  const calFrom = addDays(mondayOf(today), -(CALENDAR_WEEKS - 1) * 7);
  const calKm = dailyKm(filterActivities(all, { from: calFrom, to: today, sport: s }));

  const healthFrom = range.from > addDays(today, -YEAR_DAYS) ? range.from : addDays(today, -YEAR_DAYS);
  const recent = filterActivities(all, { from: addDays(today, -(RECENT_DAYS - 1)), to: today, sport: s });

  return {
    today, filters: { ...filters, w: sel }, range, sel, focusWeek, errors, plan, paces,
    weekRows, capped, totalWeeks, weekRow, weekRunKm, weekActs, periodActs, scoped,
    periodKm: sumKm(periodActs),
    longest: periodActs.reduce((best, a) => ((a.distanceKm || 0) > (best?.distanceKm || 0) ? a : best), null),
    race, position: planPosition(plan, today, focusWeek),
    hit: plan ? planHitRate(plan, { ...range, today }) : null,
    easy, load, eff, hr,
    zones: s === 'ride' || !paces ? null : paceZoneShares(periodActs, paces),
    cal: { km: calKm, from: calFrom, ...streaks(calKm, calFrom, today), weekdays: weekdays(calKm, calFrom, today) },
    health: healthSeries(health, healthFrom, today),
    last: scoped.length ? scoped[scoped.length - 1] : null,
    next: nextRun(plan, today, sel),
    sessions: new Map((plan?.weeks || []).flatMap(w => w.workouts || []).map(w => [w.id, w])),
    recentKm: sumKm(recent),
  };
}

