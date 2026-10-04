// One recorded activity in full: every stored field, plus per-kilometre splits
// measured against the target pace of the session it was matched to.
import { html, raw, mount } from '../dom.js';
import { api } from '../api.js';
import { loading, errorState } from '../ui.js';
import { formatDate, formatDistance, formatDuration, formatPace, formatNumber, parsePace, paceRange, PACE_NAMES, dayLong, sportFamily } from '../format.js';
import { SPORT_NAMES } from './common.js';

const BACK = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M15 18l-6-6 6-6"/></svg>';

const clockTime = iso => {
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
};

/** Where a split sits against the session's target window. */
function verdict(sec, lo, hi) {
  if (sec == null || lo == null) return null;
  if (sec < lo) return 'fast';
  if (sec > hi) return 'slow';
  return 'on';
}

const VERDICT_TEXT = { fast: 'faster than target', on: 'on target', slow: 'slower than target' };

function statRows(a) {
  const isRun = sportFamily(a.sportType) === 'run';
  const rows = [
    ['Distance', formatDistance(a.distanceKm)],
    ['Moving time', formatDuration(a.movingMin)],
  ];
  if (a.elapsedMin != null && Math.abs(a.elapsedMin - a.movingMin) >= 0.5) rows.push(['Elapsed', formatDuration(a.elapsedMin)]);
  if (isRun && a.avgPaceSecPerKm) rows.push(['Average pace', `${formatPace(a.avgPaceSecPerKm)}/km`]);
  if (!isRun && a.distanceKm > 0 && a.movingMin > 0) rows.push(['Average speed', `${formatNumber(a.distanceKm / (a.movingMin / 60), 1)} km/h`]);
  if (a.avgHr) rows.push(['Average heart rate', `${Math.round(a.avgHr)} bpm`]);
  if (a.maxHr) rows.push(['Max heart rate', `${Math.round(a.maxHr)} bpm`]);
  if (a.elevM != null) rows.push(['Elevation gain', `${formatNumber(a.elevM, 0)} m`]);
  rows.push(['Started', `${formatDate(a.date)} ${clockTime(a.startUtc)}`]);
  rows.push(['Type', `${SPORT_NAMES[sportFamily(a.sportType)] || a.sportType}${a.commute ? ' · commute' : ''}`]);
  return rows;
}

function splitsTable(splits, lo, hi) {
  return html`<div class="card table-wrap">
    <table class="dtable">
      <thead><tr><th scope="col">Km</th><th scope="col">Pace</th><th scope="col">Time</th><th scope="col">HR</th><th scope="col">Elev</th></tr></thead>
      <tbody>
        ${splits.map(s => {
          const v = verdict(s.paceSecPerKm, lo, hi);
          return html`<tr>
            <th scope="row">${s.distanceKm >= 0.98 ? s.index : `${s.index} (${formatDistance(s.distanceKm)})`}</th>
            <td class="num${v ? ` split--${v}` : ''}" ${v ? raw(`title="${VERDICT_TEXT[v]}"`) : ''}>${s.paceSecPerKm ? `${formatPace(s.paceSecPerKm)}` : '–'}${v ? html`<span class="sr-only"> — ${VERDICT_TEXT[v]}</span>` : ''}</td>
            <td class="num">${s.movingS ? formatDuration(s.movingS / 60) : '–'}</td>
            <td class="num">${s.avgHr ? Math.round(s.avgHr) : '–'}</td>
            <td class="num">${s.elevM != null ? `${s.elevM > 0 ? '+' : ''}${formatNumber(s.elevM, 0)}` : '–'}</td>
          </tr>`;
        })}
      </tbody>
    </table>
  </div>`;
}

export async function render(el, ctx) {
  const id = (ctx.rest && ctx.rest[0]) || '';
  if (!id) { mount(el, html`<p class="state">No activity chosen.</p>`); return; }
  loading(el, 'Loading activity');

  let data;
  try { data = await api.get(`/api/activities/${encodeURIComponent(id)}`); }
  catch (e) { if (ctx.isCurrent()) errorState(el, e, () => render(el, ctx)); return; }
  if (!ctx.isCurrent()) return;

  const { activity: a, workout: w, paces } = data;
  const range = w ? paceRange(paces, w.paceKey) : null;
  const lo = range && paces[w.paceKey] ? parsePace(paces[w.paceKey].min) : null;
  const hi = range && paces[w.paceKey] ? parsePace(paces[w.paceKey].max) : null;
  const splits = a.splits || [];
  const onTarget = lo != null ? splits.filter(s => verdict(s.paceSecPerKm, lo, hi) === 'on').length : null;

  mount(el, html`
    <header class="page-head page-head--nav">
      <a class="icon-btn" href="#/week?date=${a.date}" aria-label="Back to the week">${raw(BACK)}</a>
      <div class="page-head-mid">
        <p class="eyebrow">${dayLong(a.date)} ${formatDate(a.date)}</p>
        <h1 class="h1--compact">${a.name || a.sportType}</h1>
      </div>
      <span></span>
    </header>

    <article class="card">
      <p class="eyebrow">Recorded by Strava</p>
      <dl class="kv kv--wide">
        ${statRows(a).map(([k, v]) => html`<dt>${k}</dt><dd><span class="num">${v}</span></dd>`)}
      </dl>
    </article>

    ${w ? html`<section class="card">
      <h2 class="section-title">Matched to a session</h2>
      <p><a class="link" href="#/workout/${encodeURIComponent(w.id)}">${w.title} →</a></p>
      ${range ? html`<p class="help">Target pace ${range} · ${PACE_NAMES[w.paceKey] || ''}${
        onTarget != null && splits.length ? ` · ${onTarget} of ${splits.length} kilometres inside the window` : ''}</p>` : ''}
    </section>` : html`<section class="card banner banner--quiet">
      <p>Not matched to a planned session. It still counts as load the weekly review can take into account.</p>
    </section>`}

    ${splits.length ? html`<section aria-labelledby="sp-h">
      <h2 class="section-title" id="sp-h">Kilometre splits</h2>
      ${lo != null ? html`<p class="help">Paces outside the ${range} target window are marked.</p>` : ''}
      ${splitsTable(splits, lo, hi)}
    </section>` : html`<p class="help">No kilometre splits were recorded for this activity.</p>`}
  `);
}
