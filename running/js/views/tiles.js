// Overview tiles, part one: the shared tile pieces, the KPI band, the header summary, health
// and the next run. Each renderer takes the model from overview-model.js plus the tile's DOM
// id and returns the tile's inner markup; nothing here touches the DOM, so a filter change is
// one string build per tile and one innerHTML write. Charts live in tiles-charts.js, the maps
// in tiles-map.js and the activities table in tiles-table.js.
import { html, raw } from '../dom.js';
import {
  formatDate, formatDistance, formatNumber, formatPace, paceRange, PACE_NAMES, PHASE_NAMES, diffDays,
} from '../format.js';
import { buildHash } from '../router.js';
import { sparklineSvg } from '../sparkline.js';
import { segmentAmount } from './common.js';

// --- shared pieces -------------------------------------------------------------

export const SPORT_LABELS = { run: 'Running', ride: 'Riding', all: 'Everything' };
const SPORT_PHRASES = { run: 'of running', ride: 'of riding', all: 'in all' };
const MINUS = '−'; // a real minus sign lines up with the plus in tabular figures

/** '12 Oct' */
export const shortDate = iso => formatDate(iso).replace(/^\S+ /, '');
/** '12 Oct 2026' */
export const longDate = iso => formatDate(iso, { year: true }).replace(/^\S+ /, '');
export const km = v => formatDistance(v, { unit: false });
export const signed = (v, digits = 1) => {
  const r = Number(v.toFixed(digits));
  return r > 0 ? `+${formatNumber(r, digits)}` : r < 0 ? `${MINUS}${formatNumber(-r, digits)}` : formatNumber(0, digits);
};
export const pct = share => Math.round(share * 100);

// Four arrows out to the corners, drawn like js/icons.js (24-unit grid, round caps, currentColor)
// and shown at 16 px.
const EXPAND_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
  + '<path d="M14.5 4H20v5.5M20 4l-6 6M9.5 20H4v-5.5M4 20l6-6M4 9.5V4h5.5M4 4l6 6M20 14.5V20h-5.5M20 20l-6-6"/></svg>';

/**
 * A tile's head: its label, an optional meta line and, with `enlarge`, the button that opens the
 * tile in focus mode (overview.js; the tile's section must carry data-focusable). The button is
 * named "Enlarge" and described by the tile's label, so a screen reader hears which tile.
 */
export function head(id, label, meta = '', { enlarge = false } = {}) {
  return html`<div class="tile-head">
    <h2 class="tile-label" id="${id}-h">${label}</h2>${meta ? html`<span class="tile-meta">${meta}</span>` : ''}${enlarge
      ? html`<button type="button" class="ov-enlarge" data-enlarge aria-label="Enlarge" aria-describedby="${id}-h" aria-haspopup="dialog" aria-expanded="false" title="Enlarge">${raw(EXPAND_ICON)}</button>`
      : ''}
  </div>`;
}
export const empty = text => html`<p class="tile-empty">${text}</p>`;
/** A failed request, said once and quietly in the tile that needed it. */
export const failed = (what, err) => empty(`Couldn’t load ${what}. ${err?.message || ''}`.trim());

/** 'Today', 'Tomorrow', 'In 4 days', or a date for anything further out or in the past. */
export function relDay(today, iso) {
  const n = diffDays(today, iso);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n > 1 && n < 7) return `In ${n} days`;
  return formatDate(iso);
}

// --- header --------------------------------------------------------------------

/** "Week 2 of 51 · 348 days to Berlin Marathon · 41 km of running in the last 4 weeks" */
export function summaryLine(m) {
  const parts = [];
  const pos = m.position;
  if (m.errors.plan) parts.push('Plan unavailable');
  else if (pos.current) parts.push(html`Week <strong>${pos.currentN}</strong> of ${pos.total}`);
  else if (pos.start && m.today < pos.start) parts.push(html`Plan starts <strong>${formatDate(pos.start)}</strong>`);
  else if (pos.total) parts.push('The plan has finished');
  if (m.race && m.race.days > 0) parts.push(html`<strong>${formatNumber(m.race.days)}</strong> days to ${m.race.name}`);
  else if (m.race && m.race.days === 0) parts.push(html`Race day: <strong>${m.race.name}</strong>`);
  if (!m.errors.acts) parts.push(html`<strong>${km(m.recentKm)} km</strong> ${SPORT_PHRASES[m.filters.s]} in the last 4 weeks`);
  return parts.map((part, i) => html`${i ? html`<span class="ov-dot" aria-hidden="true"> · </span>` : ''}<span>${part}</span>`);
}

/** What the tiles are looking at: the period, the sport, the picked week. */
export function scopeLine(m) {
  const { from, to } = m.range;
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const span = `${sameYear ? shortDate(from) : longDate(from)} – ${longDate(to)}`;
  return html`<span>${span}</span><span>${SPORT_LABELS[m.filters.s]}</span>${m.sel ? html`<span class="ov-scope-week">Week of ${shortDate(m.sel)}</span>` : ''}`;
}

// --- KPI band ------------------------------------------------------------------

const value = (n, unit) => html`${n}${unit ? html`<span class="unit">${unit}</span>` : ''}`;

function kpi(id, label, val, sub, { extra = '', tone = '' } = {}) {
  return html`${head(id, label)}
    <p class="kpi${tone ? ` kpi--${tone}` : ''}">${val}</p>
    ${extra}
    <p class="kpi-sub">${sub}</p>`;
}

/** A hairline meter: the planned amount is the track, what was done fills it in the accent. */
function meter(parts, label) {
  return html`<div class="ov-meter" role="img" aria-label="${label}">${parts.filter(pt => pt.share > 0).map(pt =>
    html`<span class="ov-meter-${pt.kind}" style="width:${(Math.min(1, pt.share) * 100).toFixed(1)}%"></span>`)}</div>`;
}

export function raceKpi(m, id) {
  const label = 'Days to race';
  if (m.errors.state) return html`${head(id, label)}${failed('your settings', m.errors.state)}`;
  const r = m.race;
  if (!r) return kpi(id, label, '—', 'No race set in Settings');
  if (r.days < 0) return kpi(id, label, '—', html`${r.name} was ${longDate(r.date)}`);
  if (r.days === 0) return kpi(id, label, value('Today'), r.name);
  // Within a year the day and month are unambiguous, and the shorter line stays on one row.
  const when = r.days < 365 ? shortDate(r.date) : longDate(r.date);
  return kpi(id, label, value(formatNumber(r.days), r.days === 1 ? 'day' : 'days'), html`${r.name} · ${when}`);
}

export function weekKpi(m, id) {
  const label = m.sel ? `Week of ${shortDate(m.sel)}` : 'This week';
  if (m.errors.acts) return html`${head(id, label)}${failed('activities', m.errors.acts)}`;
  const { actualKm, plannedKm } = m.weekRow || { actualKm: 0, plannedKm: null };
  if (!(plannedKm > 0)) {
    const why = m.filters.s === 'ride' ? 'Rides are recorded, never planned' : `Nothing planned ${m.sel ? 'that' : 'this'} week`;
    return kpi(id, label, value(km(actualKm), 'km'), why);
  }
  const share = m.weekRunKm / plannedKm;
  const meterBar = meter([{ kind: 'done', share }], `${km(m.weekRunKm)} of ${km(plannedKm)} km run`);
  if (m.filters.s === 'all') {
    return kpi(id, label, value(km(actualKm), 'km'), `Runs ${km(m.weekRunKm)} of ${km(plannedKm)} km planned`, { extra: meterBar });
  }
  return kpi(id, label, value(km(actualKm), `/ ${km(plannedKm)} km`), `${pct(share)} % of the plan`, { extra: meterBar });
}

export function hitKpi(m, id) {
  const label = 'Plan hit';
  if (m.errors.plan) return html`${head(id, label)}${failed('the plan', m.errors.plan)}`;
  const h = m.hit;
  const start = m.position.start;
  if (!h || !h.total) {
    const why = start && m.today <= start ? `The plan starts ${formatDate(start)}` : 'No sessions due in this period';
    return kpi(id, label, '—', why);
  }
  const bits = [`${h.done} of ${h.total} ${h.total === 1 ? 'session' : 'sessions'}`];
  if (h.partial) bits.push(`${h.partial} partial`);
  return kpi(id, label, value(h.pct, '%'), bits.join(' · '), {
    tone: h.pct < 60 ? 'warn' : '',
    extra: meter([
      { kind: 'done', share: h.done / h.total },
      { kind: 'partial', share: h.partial / h.total },
      { kind: 'skipped', share: h.skipped / h.total },
    ], `${h.done} done, ${h.partial} partial, ${h.skipped} skipped, ${h.missed} missed`),
  });
}

export function easyKpi(m, id) {
  const label = 'Easy runs too fast';
  if (m.errors.acts || m.errors.plan) return html`${head(id, label)}${failed(m.errors.acts ? 'activities' : 'the plan', m.errors.acts || m.errors.plan)}`;
  const e = m.easy;
  if (e.limit == null) return kpi(id, label, '—', 'No easy pace in the plan yet');
  const limit = `faster than ${formatPace(e.limit)}/km`;
  if (!e.total) return kpi(id, label, '—', html`No easy runs yet · ${limit}`);
  return kpi(id, label, value(e.count, `of ${e.total}`), limit, { tone: e.count / e.total >= 0.25 ? 'warn' : '' });
}

// Form bands: above +5 rested, -10 to +5 normal training, below -10 carrying fatigue.
const FRESH_ABOVE = 5;
const TIRED_BELOW = -10;
export const formWord = form => (form > FRESH_ABOVE ? 'fresh' : form >= TIRED_BELOW ? 'neutral' : 'tired');

export function formKpi(m, id) {
  const label = 'Fitness · form';
  if (m.errors.acts) return html`${head(id, label)}${failed('activities', m.errors.acts)}`;
  const last = m.load[m.load.length - 1];
  if (!last) return kpi(id, label, '—', 'No activities yet');
  const word = formWord(last.form);
  return kpi(id, label, value(formatNumber(last.fitness, 0)),
    html`Form ${signed(last.form)} · <span class="ov-word ov-word--${word}">${word}</span>`);
}

export function phaseKpi(m, id) {
  const label = 'Phase';
  if (m.errors.plan) return html`${head(id, label)}${failed('the plan', m.errors.plan)}`;
  const pos = m.position;
  if (!pos.total) return kpi(id, label, '—', 'No plan yet');
  if (!pos.focus) {
    if (pos.start && m.focusWeek < pos.start) return kpi(id, label, html`<span class="kpi-text">Not started</span>`, `Starts ${formatDate(pos.start)}`);
    return kpi(id, label, html`<span class="kpi-text">Finished</span>`, `Ended ${formatDate(pos.end)}`);
  }
  const w = pos.focus;
  const bits = [`Week ${pos.focusN} of ${pos.total}`];
  if (w.isCutback) bits.push('cutback');
  else if (w.label) bits.push(w.label);
  return kpi(id, label, html`<span class="kpi-text">${PHASE_NAMES[w.phase] || w.phase || '—'}</span>`, bits.join(' · '));
}

// --- health --------------------------------------------------------------------

const HEALTH_ROWS = [
  { key: 'restingHr', label: 'Resting HR', unit: 'bpm', digits: 0 },
  { key: 'hrvRmssd', label: 'HRV', unit: 'ms', digits: 0 },
  { key: 'sleepHours', label: 'Sleep', unit: 'h', digits: 1 },
  { key: 'steps', label: 'Steps', unit: '', digits: 0 },
  { key: 'weightKg', label: 'Weight', unit: 'kg', digits: 1 },
];
const SPARK_HEIGHT = 28;
// The label and value columns of a row and their gaps (.ov-hrow in desk.css), wide and narrow.
const HEALTH_FIXED_PX = 200;
const HEALTH_FIXED_NARROW_PX = 168;
const HEALTH_NARROW_BELOW_PX = 330; // the @container breakpoint for .ov-health

export function healthTile(m, id, width) {
  const h = m.health;
  const meta = `${h.days} days`;
  if (m.errors.health) return html`${head(id, 'Health', meta)}${failed('health data', m.errors.health)}`;
  const sparkW = Math.max(60, Math.round(width - (width < HEALTH_NARROW_BELOW_PX ? HEALTH_FIXED_NARROW_PX : HEALTH_FIXED_PX)));
  if (HEALTH_ROWS.every(r => h.series[r.key].latest == null)) return html`${head(id, 'Health', meta)}${empty('No health data in this period.')}`;
  const rows = HEALTH_ROWS.map(r => {
    const s = h.series[r.key];
    if (s.latest == null) {
      return html`<li class="ov-hrow is-empty"><span class="ov-hlabel">${r.label}</span><span class="ov-hval">No data</span><span></span></li>`;
    }
    return html`<li class="ov-hrow">
      <span class="ov-hlabel">${r.label}<span class="ov-havg">avg ${formatNumber(s.mean, r.digits)}</span></span>
      <span class="ov-hval"><span class="ov-hnum">${formatNumber(s.latest, r.digits)}</span>${r.unit ? html`<span class="unit">${r.unit}</span>` : ''}</span>
      <span class="ov-hspark">${raw(sparklineSvg(s.values, { label: `${r.label}, ${meta}`, width: sparkW, height: SPARK_HEIGHT }))}</span>
    </li>`;
  });
  return html`${head(id, 'Health', meta)}<ul class="ov-health" role="list">${rows}</ul>
    <p class="ov-caption">Latest reading and the average over the period, from Health Connect.</p>`;
}

// --- next run ------------------------------------------------------------------

/** Session notes are Markdown; the tile wants one plain sentence or two. */
const plainText = s => String(s || '').split('\n').map(l => l.replace(/^\s*[-*]\s+/, '').trim()).filter(Boolean).join(' · ');

export function nextTile(m, id) {
  const { mode, pick, then } = m.next;
  const label = mode === 'week' ? 'Key session' : 'Next run';
  if (m.errors.plan) return html`${head(id, label)}${failed('the plan', m.errors.plan)}`;
  if (!pick) {
    const why = mode === 'week' ? `No run planned in the week of ${shortDate(m.sel)}` : 'No runs left in the plan';
    return html`${head(id, label)}${empty(why)}`;
  }
  const meta = mode === 'week' ? `Week of ${shortDate(m.sel)}` : relDay(m.today, pick.date);
  const pr = paceRange(m.paces, pick.paceKey);
  const segs = (pick.segments || []).map(g => [g.label, segmentAmount(g)].filter(Boolean).join(' '));
  const route = pick.distanceKm ? buildHash('routes', { km: pick.distanceKm, from: pick.id }) : null;
  return html`${head(id, label, meta)}
    <div class="ov-next-grid${then.length ? '' : ' is-single'}">
    <div class="ov-next">
      <p class="ov-when">${formatDate(pick.date, { long: true })}${pick.key ? html` · <span class="ov-key">Key session</span>` : ''}</p>
      <h3 class="ov-title">${pick.title}</h3>
      <p class="ov-amount">
        ${pick.distanceKm != null ? html`<span class="ov-big">${km(pick.distanceKm)}</span><span class="unit">km</span>` : ''}
        ${pr ? html`<span class="pace-key">${pick.paceKey}</span><span class="ov-pace">${pr}</span><span class="ov-pace-name">${PACE_NAMES[pick.paceKey] || ''}</span>` : ''}
      </p>
      ${pick.details ? html`<p class="ov-detail">${plainText(pick.details)}</p>` : ''}
      ${segs.length ? html`<ol class="ov-segs">${segs.map(t => html`<li>${t}</li>`)}</ol>` : ''}
      <div class="ov-actions">
        <a class="btn btn--sm" href="#/workout/${encodeURIComponent(pick.id)}">Open session</a>
        ${route ? html`<a class="btn btn--sm btn--primary" href="${route}">Make a route</a>` : ''}
      </div>
    </div>
    ${then.length ? html`<div class="ov-then">
      <p class="ov-then-h">After that</p>
      <ol>${then.map(w => html`<li><a href="#/workout/${encodeURIComponent(w.id)}">
        <span class="ov-then-date">${formatDate(w.date)}</span><span class="ov-then-title">${w.title}</span>
        <span class="ov-then-km">${w.distanceKm != null ? `${km(w.distanceKm)} km` : ''}</span></a></li>`)}</ol>
    </div>` : ''}
    </div>`;
}

