// Overview tiles, part two: the chart tiles (weekly volume, pace zones, efficiency, fitness
// and form, the consistency calendar). Each is drawn at the width its tile measured, so the
// SVG's user units are screen pixels and 10 px axis labels stay 10 px at any window width;
// overview.js redraws them when the dashboard is resized.
import { html, raw } from '../dom.js';
import { formatDate, formatDuration, formatNumber, paceRange, PACE_NAMES, PHASE_NAMES, diffDays, addDays } from '../format.js';
import { barsSvg, stackedBarSvg, lineSvg, calendarSvg, CALENDAR_TOP } from '../charts.js';
import { ZONE_ORDER } from '../analytics.js';
import { MAX_BAR_WEEKS, CALENDAR_WEEKS } from './overview-model.js';
import { head, empty, failed, shortDate, km, signed, pct, formWord } from './tiles.js';

const BARS_HEIGHT = 240;
const LINE_HEIGHT = 148;
const ZONE_BAR_HEIGHT = 20;
const CAL_GAP = 2;
const CAL_CELL_MIN = 7;
const CAL_CELL_MAX = 14;      // beyond this the year stops reading as one block
const LEGEND_DAYS = ['Rest', 'Under 5', '5–10', '10–16', '16 km +'];
const CAL_DAYS_PX = 30;       // the weekday label column left of the grid
const CAL_DAY_LABELS = [[0, 'Mon'], [2, 'Wed'], [4, 'Fri']];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const pad2 = n => String(n).padStart(2, '0');
/** '51 min' under an hour, '33:15 h' above: fits a narrow tabular column. */
const hoursMinutes = min => {
  const m = Math.round(min);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}:${pad2(m % 60)} h`;
};

// barsSvg names up to 13 weeks on the x axis; '27 Jul' needs ~42 px of 10 px mono, so a
// narrow chart drops labels (counting back from the newest, which stays named). Only the
// visible text goes: every bar keeps its full accessible name.
const AXIS_CHAR_PX = 6.2;
const AXIS_LABEL_GAP_PX = 8;
const BARS_PLOT_INSET_PX = 36; // barsSvg's left + right padding
const X_LABEL = /<text class="axis axis--x"[^>]*>[^<]*<\/text>/g;
function thinAxis(svg, width) {
  const labels = svg.match(X_LABEL) || [];
  if (labels.length < 2) return svg;
  const widest = Math.max(...labels.map(l => l.replace(/<[^>]+>/g, '').length)) * AXIS_CHAR_PX + AXIS_LABEL_GAP_PX;
  const every = Math.ceil((labels.length * widest) / (width - BARS_PLOT_INSET_PX));
  if (every <= 1) return svg;
  let i = 0;
  return svg.replace(X_LABEL, label => ((labels.length - 1 - i++) % every ? '' : label));
}

const swatch = cls => html`<i class="ov-swatch ${cls}" aria-hidden="true"></i>`;
const caption = text => html`<p class="ov-caption">${text}</p>`;
const lede = (num, unit, rest) => html`<p class="ov-lede"><span class="ov-num">${num}</span>${unit ? html`<span class="unit">${unit}</span>` : ''}${rest ? html`<span class="ov-lede-sub">${rest}</span>` : ''}</p>`;

/** Three x labels (first, middle, last point) in the chart's own x units. */
function edgeLabels(points, dateOf) {
  if (!points.length) return [];
  const idx = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  return idx.map(i => ({ x: points[i].x, text: shortDate(dateOf(i)) }));
}

// --- weekly volume -------------------------------------------------------------

function weekReadout(m) {
  if (!m.sel) return html`<p class="ov-hint">Pick a week to focus the KPIs, sessions and table on it.</p>`;
  const row = m.weekRow || {};
  const planWeek = m.position.focus;
  const planned = row.plannedKm > 0 ? html` of ${km(row.plannedKm)}` : '';
  const n = m.weekActs.length;
  return html`<div class="ov-readout">
    <span class="ov-readout-k">Week of ${shortDate(m.sel)}</span>
    ${planWeek ? html`<span>${PHASE_NAMES[planWeek.phase] || planWeek.phase}${planWeek.label ? ` · ${planWeek.label}` : ''}</span>` : ''}
    <span><strong>${km(row.actualKm || 0)}</strong>${planned} km</span>
    <span>${n} ${n === 1 ? 'activity' : 'activities'}</span>
    <a class="ov-link" href="#/week?date=${m.sel}">Open the week →</a>
    <button type="button" class="ov-clear" data-clear-week="bar">Clear</button>
  </div>`;
}

export function volumeTile(m, id, width) {
  const isRide = m.filters.s === 'ride';
  const legend = html`<span class="ov-legend">${isRide ? '' : html`<span>${swatch('ov-swatch--plan')}Planned</span>`}<span>${swatch('ov-swatch--actual')}Actual</span></span>`;
  if (m.errors.acts) return html`${head(id, 'Weekly volume')}${failed('activities', m.errors.acts)}`;
  const rows = m.weekRows.map(r => ({ key: r.week, label: shortDate(r.week), planned: r.plannedKm, actual: r.actualKm }));
  if (!rows.some(r => r.actual > 0 || r.planned > 0)) {
    return html`${head(id, 'Weekly volume')}${empty('Nothing planned or recorded in this period.')}`;
  }
  const weeks = Math.max(1, m.totalWeeks);
  const count = m.periodActs.length;
  const rest = [`${km(m.periodKm / weeks)} km a week`, `${count} ${count === 1 ? 'activity' : 'activities'}`];
  if (m.longest) rest.push(`longest ${km(m.longest.distanceKm)} km`);
  const svg = barsSvg(rows, { width, height: BARS_HEIGHT, selected: m.sel, label: `Weekly volume in km, ${isRide ? 'actual' : 'planned and actual'}` });
  return html`<div class="tile-head"><h2 class="tile-label" id="${id}-h">Weekly volume</h2>${legend}</div>
    ${lede(km(m.periodKm), 'km', rest.join(' · '))}
    <div class="ov-chart ov-chart--bars">${raw(thinAxis(svg, width))}</div>
    ${m.capped ? caption(`Showing the last ${MAX_BAR_WEEKS} of ${m.totalWeeks} weeks.`) : ''}
    ${weekReadout(m)}`;
}

/**
 * The week a click on the volume chart means. A week's bars are a few pixels wide on a
 * year-long chart, with a gap between plan and actual: a click anywhere in the week's column
 * counts, resolved to the nearest bar group (null outside every column).
 */
export function nearestBar(svg, x) {
  const groups = [...svg.querySelectorAll('.bars[data-key]')];
  const centres = groups.map(g => { const r = g.getBoundingClientRect(); return r.left + r.width / 2; });
  const slot = centres.length > 1 ? Math.abs(centres[1] - centres[0]) : Infinity;
  let best = -1;
  centres.forEach((c, i) => { if (best < 0 || Math.abs(c - x) < Math.abs(centres[best] - x)) best = i; });
  return best >= 0 && Math.abs(centres[best] - x) <= slot / 2 + 1 ? groups[best] : null;
}

// --- pace zones ----------------------------------------------------------------

export function zonesTile(m, id, width) {
  const label = 'Pace zones';
  if (m.errors.acts) return html`${head(id, label)}${failed('activities', m.errors.acts)}`;
  if (m.filters.s === 'ride') return html`${head(id, label)}${empty('Pace zones are for runs. Pick Running or Everything.')}`;
  if (m.errors.plan || !m.zones) return html`${head(id, label)}${empty('No pace windows yet: the plan sets them.')}`;
  const total = m.zones.reduce((s, z) => s + z.minutes, 0);
  if (!total) return html`${head(id, label)}${empty('No runs with a pace in this period.')}`;
  const parts = m.zones.map(z => ({ key: z.key, label: PACE_NAMES[z.key] || z.key, share: z.share }));
  const easy = m.zones.find(z => z.key === 'E');
  const svg = stackedBarSvg(parts, { width, height: ZONE_BAR_HEIGHT, label: 'Share of running time by pace zone' });
  return html`${head(id, label, formatDuration(total))}
    ${lede(pct(easy?.share || 0), '%', 'of running time at easy pace')}
    <div class="ov-chart ov-chart--zones">${raw(svg)}</div>
    <ul class="ov-zones" role="list">${ZONE_ORDER.map(key => {
      const z = m.zones.find(x => x.key === key);
      return html`<li class="${z.minutes ? '' : 'is-zero'}">
        <span class="ov-zone-name">${swatch(`zone--${key}`)}${PACE_NAMES[key] || key}</span>
        <span class="ov-zone-win">${paceRange(m.paces, key).replace('/km', '')}</span>
        <span class="ov-zone-min">${z.minutes ? hoursMinutes(z.minutes) : '–'}</span>
        <span class="ov-zone-pct">${z.minutes ? `${pct(z.share)} %` : ''}</span>
      </li>`;
    })}</ul>
    ${caption('By each run’s average pace against your current pace windows.')}`;
}

// --- efficiency ----------------------------------------------------------------

export function efficiencyTile(m, id, width) {
  const label = 'Efficiency';
  if (m.errors.acts) return html`${head(id, label)}${failed('activities', m.errors.acts)}`;
  if (m.filters.s === 'ride') return html`${head(id, label)}${empty('Efficiency is measured on runs. Pick Running or Everything.')}`;
  if (!m.eff.length) return html`${head(id, label)}${empty('No runs with heart rate in this period.')}`;
  const pts = m.eff.map(p => ({ x: diffDays(m.range.from, p.date), y: p.value }));
  const first = m.eff[0].value, last = m.eff[m.eff.length - 1].value;
  const change = last - first;
  const svg = lineSvg(pts, {
    width, height: LINE_HEIGHT, yFormat: v => v.toFixed(2), label: 'Efficiency, 28-day median',
    xLabels: edgeLabels(pts, i => m.eff[i].date),
  });
  return html`${head(id, label, `${m.eff.length} runs`)}
    ${lede(last.toFixed(2), '', html`<span class="ov-delta ov-delta--${change >= 0 ? 'up' : 'down'}">${signed(change, 2)}</span> since ${shortDate(m.eff[0].date)}`)}
    <div class="ov-chart">${raw(svg)}</div>
    ${caption('Metres per minute per heartbeat, 28-day median. Higher is fitter.')}`;
}

// --- fitness and form ----------------------------------------------------------

export function loadTile(m, id, width) {
  const label = 'Fitness and form';
  if (m.errors.acts) return html`${head(id, label)}${failed('activities', m.errors.acts)}`;
  if (!m.load.length) return html`${head(id, label)}${empty('No activities to build a load curve from.')}`;
  const pts = m.load.map((p, i) => ({ x: i, y: p.fitness }));
  const fatigue = m.load.map((p, i) => ({ x: i, y: p.fatigue }));
  const last = m.load[m.load.length - 1];
  const word = formWord(last.form);
  const svg = lineSvg(pts, {
    width, height: LINE_HEIGHT, yFormat: v => String(Math.round(v)), label: 'Fitness (42-day) and fatigue (7-day) load',
    extra: [{ points: fatigue, className: 'line--muted' }], xLabels: edgeLabels(pts, i => m.load[i].date),
  });
  return html`<div class="tile-head"><h2 class="tile-label" id="${id}-h">${label}</h2>
      <span class="ov-legend"><span>${swatch('ov-swatch--line')}Fitness</span><span>${swatch('ov-swatch--muted')}Fatigue</span></span></div>
    ${lede(formatNumber(last.fitness, 1), '', html`form ${signed(last.form)} · <span class="ov-word ov-word--${word}">${word}</span>`)}
    <div class="ov-chart">${raw(svg)}</div>
    ${caption('Training load from heart rate, every sport. Fitness is the 42-day average, fatigue the 7-day; form is fitness minus fatigue.')}`;
}

// --- consistency calendar ------------------------------------------------------

// Marks the days outside the period and the picked week, so the year reads against the filters.
function markCells(svg, m) {
  const selEnd = m.sel ? addDays(m.sel, 6) : null;
  return svg.replace(/class="cal cal--(\d)" data-date="(\d{4}-\d{2}-\d{2})"/g, (all, level, date) => {
    const out = date < m.range.from || date > m.range.to ? ' is-out' : '';
    const sel = m.sel && date >= m.sel && date <= selEnd ? ' is-sel' : '';
    return `class="cal cal--${level}${out}${sel}" data-date="${date}"`;
  });
}

// The SVG keeps its own pixel size (width/height from the viewBox) so it never scales past
// CAL_CELL_MAX; CSS lets it shrink if the tile narrows before the next redraw.
const naturalSize = svg => svg.replace(/^<svg ([^>]*?)viewBox="0 0 ([\d.]+) ([\d.]+)"/, '<svg $1width="$2" height="$3" viewBox="0 0 $2 $3"');

/** How often each weekday is an active day: the shape of a typical week, read off the year. */
function weekdayStrip(days) {
  const shares = days.map(d => (d.days ? d.active / d.days : 0));
  const label = WEEKDAYS.map((name, i) => `${name} ${pct(shares[i])} %`).join(', ');
  return html`<div class="ov-wdays" role="img" aria-label="Share of weeks with activity, by weekday: ${label}">
    <span class="ov-wdays-h">Weeks active, by day · %</span>
    <span class="ov-wday-cols">${WEEKDAYS.map((name, i) => html`<span class="ov-wday">
      <span class="ov-wday-n">${pct(shares[i])}</span>
      <span class="ov-wday-bar"><i style="height:${(shares[i] * 100).toFixed(1)}%"></i></span>
      <span class="ov-wday-d">${name.slice(0, 2)}</span>
    </span>`)}</span>
  </div>`;
}

export function calendarTile(m, id, width) {
  const label = 'Consistency';
  if (m.errors.acts) return html`${head(id, label)}${failed('activities', m.errors.acts)}`;
  const cell = Math.max(CAL_CELL_MIN, Math.min(CAL_CELL_MAX, Math.floor((width - CAL_DAYS_PX + CAL_GAP) / CALENDAR_WEEKS) - CAL_GAP));
  const stride = cell + CAL_GAP;
  // Positioned to the pixel against the SVG's rows, which is why the SVG keeps its natural size.
  const days = html`<span class="ov-cal-days" aria-hidden="true">${CAL_DAY_LABELS.map(([r, text]) =>
    html`<span style="top:${CALENDAR_TOP + r * stride}px;height:${cell}px;line-height:${cell}px">${text}</span>`)}</span>`;
  const svg = calendarSvg(m.cal.km, { end: m.today, weeks: CALENDAR_WEEKS, cell, gap: CAL_GAP, label: `Distance per day, last ${CALENDAR_WEEKS} weeks` });
  const c = m.cal;
  const rest = [`longest streak ${c.longest} ${c.longest === 1 ? 'day' : 'days'}`];
  if (c.current) rest.push(`${c.current} in a row now`);
  return html`${head(id, label, `Last ${CALENDAR_WEEKS} weeks · ${formatDate(m.today)}`)}
    ${lede(c.active, 'active days', [`of ${c.days}`, ...rest].join(' · '))}
    <div class="ov-chart ov-chart--cal">${days}${raw(naturalSize(markCells(svg, m)))}</div>
    <div class="ov-cal-foot">
      ${weekdayStrip(c.weekdays)}
      <div class="ov-cal-key">
        <span class="ov-legend ov-legend--cal">${LEGEND_DAYS.map((t, i) => html`<span>${swatch(`cal--${i}`)}${t}</span>`)}</span>
        <span class="ov-hint">Days outside the period are faded. Pick a day to open its week.</span>
      </div>
    </div>`;
}
