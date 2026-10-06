// The Overview's numbers, computed once per filter change from the loaded data. Pure: no DOM,
// no network and no clock (today comes from /api/state), so a filter click costs one pass
// here and the tiles only format what it returns. Every aggregate comes from analytics.js;
// this file decides which slice of the data each tile looks at, which dates the visit's
// requests must cover (its network is the `get` it is handed), and the layout of the cards.
import { addDays, diffDays, mondayOf, parsePace } from '../format.js';
import { haversineKm } from '../geo.js';
import {
  periodRange, filterActivities, weeklyVolume, planHitRate, easyTooFast, paceZoneShares,
  efficiencySeries, rollingMedian, hrDefaults, loadSeries, dailyKm, weekOf, firstActivityDate,
  isRunWorkout, YEAR_DAYS,
} from '../analytics.js';

export const PERIODS = [['4w', '4 weeks'], ['12w', '12 weeks'], ['season', 'Season'], ['1y', '1 year'], ['all', 'All']];
export const SPORTS = [['run', 'Running'], ['ride', 'Riding'], ['all', 'Everything']];
const DEFAULT_FILTERS = { p: '12w', s: 'run' };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_BAR_WEEKS = 104;   // two years of bars is as many as 720 px can tell apart
export const CALENDAR_WEEKS = 53;
const EFFICIENCY_DAYS = 28;
const EASY_SLACK_SEC = 10;
const RECENT_DAYS = 28;             // "in the last 4 weeks", today included
const UPCOMING_RUNS = 3;            // listed under the next run
const CLOSED = new Set(['done', 'skipped']);
const CELL_DEG = 0.045;             // a frame cell: 0.045° of latitude is about 5 km
const MIN_COS_LAT = 0.01;           // keeps a cell finite near the poles
const FRAME_RADIUS_KM = 15;

const isLatLng = p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/**
 * Where most of the running is: `starts` is one [lat, lng] per activity, newest first. The starts
 * are binned into cells about 5 km square (the longitude step widens with the latitude), and each
 * cell is a candidate centre at its mean start, scored by the starts within `radiusKm` of it, so
 * a home cluster split over a cell corner still outweighs a holiday that fits in one cell. Ties
 * go to the fuller cell, then to the one with the most recent start. The members are the starts
 * within `radiusKm` of the winning centre, so a run abroad never stretches the frame.
 * → { centre: [lat, lng], members: indices into `starts` }, or null when no start is a point.
 */
export function densestFrame(starts, { radiusKm = FRAME_RADIUS_KM } = {}) {
  const points = [];
  const cells = new Map(); // key → { first, n, lat, lng }: the newest index in it, and its running sums
  (starts || []).forEach((p, i) => {
    if (!isLatLng(p)) return;
    points.push([p, i]);
    const row = Math.floor(p[0] / CELL_DEG);
    const cos = Math.max(MIN_COS_LAT, Math.cos(((row + 0.5) * CELL_DEG * Math.PI) / 180));
    const key = `${row}:${Math.floor(p[1] / (CELL_DEG / cos))}`;
    const cell = cells.get(key) || { first: i, n: 0, lat: 0, lng: 0 };
    cells.set(key, { first: cell.first, n: cell.n + 1, lat: cell.lat + p[0], lng: cell.lng + p[1] });
  });
  let best = null;
  for (const cell of cells.values()) { // cells × starts: a few hundred by a few thousand at most
    const centre = [cell.lat / cell.n, cell.lng / cell.n];
    const members = points.filter(([p]) => haversineKm(p, centre) <= radiusKm).map(([, i]) => i);
    const c = { ...cell, centre, members };
    if (!best || members.length > best.members.length || (members.length === best.members.length
      && (cell.n > best.n || (cell.n === best.n && cell.first < best.first)))) best = c;
  }
  if (!best) return null;
  // A radius smaller than the cell could leave even the winning cell out; frame its newest start then.
  return { centre: best.centre, members: best.members.length ? best.members : [best.first] };
}

/** The hash's filters (p period, s sport, w a picked week's Monday), each valid or its default. */
export function readFilters(params = {}) {
  const p = PERIODS.some(([k]) => k === params.p) ? params.p : DEFAULT_FILTERS.p;
  const s = SPORTS.some(([k]) => k === params.s) ? params.s : DEFAULT_FILTERS.s;
  const w = ISO.test(params.w || '') && mondayOf(params.w) === params.w ? params.w : null;
  return { p, s, w };
}

/** settings.home ({ lat, lng }) as a point, or null. */
const homePoint = home => (home && isLatLng([home.lat, home.lng]) ? [home.lat, home.lng] : null);

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
    home: homePoint(settings?.home), // where an empty map opens
  };
}

// --- the requests of a visit -----------------------------------------------------

const WARMUP_DAYS = 90;   // fitness is a 42-day average: three months lets it settle before the period starts
const ALL_FROM = '2000-01-01';
const PATHS = { acts: '/api/activities', health: '/api/health', routes: '/api/activities' };

/**
 * The requests of one visit, made through `get(url)`. `load(kind, from, to)` resolves that
 * kind's rows between the dates, reusing a response that already covers them. overview.js makes
 * one per visit: a module-level cache outlived the visit, so it served the last visit's data
 * (after a sign-out, the last user's) and grew for as long as the tab stayed open.
 */
export function createSession(get) {
  const cache = new Map(); // URL → promise of the rows; a failure is dropped, so the next load retries
  const spans = { acts: [], health: [], routes: [] }; // what each kind's responses cover

  function fetchOnce(url) {
    if (!cache.has(url)) cache.set(url, get(url).catch(e => { cache.delete(url); throw e; }));
    return cache.get(url);
  }

  function load(kind, from, to) {
    const hit = spans[kind].find(s => s.from <= from && s.to >= to);
    const url = hit ? hit.url : `${PATHS[kind]}?from=${from}&to=${to}${kind === 'routes' ? '&with=polyline' : ''}`;
    return fetchOnce(url).then(rows => {
      if (!spans[kind].some(s => s.url === url)) spans[kind].push({ from, to, url });
      return Array.isArray(rows) ? rows : [];
    });
  }

  return { load };
}

const minDate = (a, b) => (a < b ? a : b);
const maxDate = (a, b) => (a > b ? a : b);

/** The dates each request must cover for these filters. */
export function requestWindows(p, today, plan) {
  const from = p === 'all' ? ALL_FROM : periodRange(p, today, plan).from;
  return {
    // A year and a quarter whatever the period: the calendar always shows a year, and the
    // four short periods then share one cached response.
    acts: minDate(addDays(from, -WARMUP_DAYS), addDays(today, -(YEAR_DAYS + WARMUP_DAYS))),
    health: maxDate(from, addDays(today, -YEAR_DAYS)),
  };
}

// --- the layout --------------------------------------------------------------------
// A layout is a list of { id, span, hidden } in display order, one entry per catalogue card. It
// is saved as settings.dashboard = { version: 1, tiles: [...] } (null: the default), and
// resolveLayout() turns whatever was saved into a whole, valid layout: unknown cards dropped,
// new ones appended, a width a card does not allow moved to the nearest one it does. Customise
// mode, which edits it, is overview-layout.js; tests/overview-layout.test.mjs covers both.

export const LAYOUT_VERSION = 1;
const KPI = [2, 3, 4];
const WIDE = [4, 6, 8, 12];
const card = (id, title, widths, span, kind = 'card') => Object.freeze({ id, title, widths: Object.freeze(widths), span, kind });

/** Every card the Overview can show, in its default order and at its default width. */
export const CATALOGUE = Object.freeze([
  card('kpi-race', 'Days to race', KPI, 2, 'kpi'), card('kpi-week', 'This week', KPI, 2, 'kpi'),
  card('kpi-plan', 'Plan hit', KPI, 2, 'kpi'), card('kpi-easy', 'Easy runs too fast', KPI, 2, 'kpi'),
  card('kpi-form', 'Fitness · form', KPI, 2, 'kpi'), card('kpi-phase', 'Phase', KPI, 2, 'kpi'),
  card('volume', 'Weekly volume', [6, 8, 12], 8), card('heatmap', 'Heatmap', WIDE, 4),
  card('zones', 'Pace zones', WIDE, 4), card('efficiency', 'Efficiency', WIDE, 4), card('fitness', 'Fitness and form', WIDE, 4),
  card('calendar', 'Consistency', [6, 8, 12], 8), card('health', 'Health', [4, 6, 8], 4),
  card('last', 'Last activity', [6, 8, 12], 6), card('next', 'Next run', WIDE, 6),
  card('table', 'Activities', [8, 12], 12),
]);

// One ladder per kind of card, so "L" is the same width on every chart.
const SIZES = { kpi: { 2: 'S', 3: 'M', 4: 'L' }, card: { 4: 'S', 6: 'M', 8: 'L', 12: 'XL' } };
const SIZE_WORDS = { S: 'Small', M: 'Medium', L: 'Large', XL: 'Extra large' };
const SHARES = { 2: 'a sixth of the row', 3: 'a quarter of the row', 4: 'a third of the row', 6: 'half the row', 8: 'two thirds of the row', 12: 'the full row' };

const tile = (id, span, hidden) => Object.freeze({ id, span, hidden });
const frozen = list => Object.freeze(list);
const indexById = catalogue => new Map(catalogue.map(c => [c.id, c]));

/** A card's width chips: [{ span, size: 'L', name: 'Large', share: 'two thirds of the row' }]. */
export function widthChoices(entry) {
  const names = SIZES[entry.kind] || SIZES.card;
  return entry.widths.map(span => {
    const size = names[span] || String(span);
    return { span, size, name: SIZE_WORDS[size] || `${span} columns`, share: SHARES[span] || `${span} of 12 columns` };
  });
}

/** The width this card allows nearest to `span` (a tie goes to the wider); not a number: its default. */
export function clampSpan(span, entry) {
  if (typeof span !== 'number' || !Number.isFinite(span)) return entry.span;
  return entry.widths.reduce((best, w) => {
    const d = Math.abs(w - span), bd = Math.abs(best - span);
    return d < bd || (d === bd && w > best) ? w : best;
  });
}

export const defaultLayout = (catalogue = CATALOGUE) => frozen(catalogue.map(c => tile(c.id, c.span, false)));

/** settings.dashboard (anything) → a whole layout of this catalogue. */
export function resolveLayout(saved, catalogue = CATALOGUE) {
  const known = indexById(catalogue);
  const list = saved && saved.version === LAYOUT_VERSION && Array.isArray(saved.tiles) ? saved.tiles : [];
  const out = [], seen = new Set();
  for (const t of list) {
    const entry = t && typeof t === 'object' ? known.get(t.id) : null;
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(tile(entry.id, clampSpan(t.span, entry), t.hidden === true));
  }
  // A card the saved layout has never heard of (a new one) is shown, at the end, at its default width.
  for (const c of catalogue) if (!seen.has(c.id)) out.push(tile(c.id, c.span, false));
  return frozen(out);
}

export const visibleTiles = layout => layout.filter(t => !t.hidden);

/**
 * Moves a card to `toIndex` among the visible cards, counted after the move (clamped to the
 * ends), so a hidden card never takes up a position the owner can see.
 */
export function moveTile(layout, id, toIndex) {
  const moving = layout.find(t => t.id === id);
  if (!moving) return layout;
  const rest = layout.filter(t => t.id !== id);
  const shown = visibleTiles(rest);
  const k = Math.max(0, Math.min(shown.length, Math.trunc(toIndex) || 0));
  const at = k < shown.length ? rest.indexOf(shown[k]) : rest.length;
  return frozen([...rest.slice(0, at), moving, ...rest.slice(at)]);
}

export function setSpan(layout, id, span, catalogue = CATALOGUE) {
  const entry = indexById(catalogue).get(id);
  if (!entry) return layout;
  return frozen(layout.map(t => (t.id === id ? tile(id, clampSpan(span, entry), t.hidden) : t)));
}

/** Hides a card, or shows it again at the end, where the owner will look for it. */
export function setHidden(layout, id, hidden) {
  const t = layout.find(x => x.id === id);
  if (!t || t.hidden === !!hidden) return layout;
  const next = frozen(layout.map(x => (x.id === id ? tile(id, x.span, !!hidden) : x)));
  return hidden ? next : moveTile(next, id, Infinity);
}

/** The shape settings.dashboard takes: { version, tiles: [{ id, span, hidden }] }, nothing else. */
export const toSaved = layout => ({ version: LAYOUT_VERSION, tiles: layout.map(({ id, span, hidden }) => ({ id, span, hidden })) });

export const sameLayout = (a, b) => !!a && !!b && a.length === b.length
  && a.every((t, i) => t.id === b[i].id && t.span === b[i].span && t.hidden === b[i].hidden);

export const isDefault = (layout, catalogue = CATALOGUE) => sameLayout(layout, defaultLayout(catalogue));
