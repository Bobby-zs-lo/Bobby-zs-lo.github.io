// Pieces shared by Today and Week.
import { html, raw } from '../dom.js';
import { formatDistance, formatDuration, formatPace, sportFamily, workoutAmount, paceRange, PACE_NAMES, dayShort, parseDate } from '../format.js';
import { statusChip } from '../ui.js';

export const SPORT_NAMES = { run: 'Run', ride: 'Ride', strength: 'Strength', rest: 'Rest', race: 'Race' };

export function activityLine(a) {
  const bits = [formatDistance(a.distanceKm), formatDuration(a.movingMin)];
  if (sportFamily(a.sportType) === 'run' && a.avgPaceSecPerKm) bits.push(`${formatPace(a.avgPaceSecPerKm)}/km`);
  if (a.avgHr) bits.push(`${Math.round(a.avgHr)} bpm`);
  return bits.join(' · ');
}

export function activityRow(a) {
  return html`<div class="activity">
    <span class="activity-src">Strava</span>
    <span class="activity-name">${a.name || a.sportType}${a.commute ? html` <span class="tag">Commute</span>` : ''}</span>
    <span class="activity-stats num">${activityLine(a)}</span>
  </div>`;
}

/** '20 s', '8 min', '1:30 h' — the clock side of a segment. */
export function formatSegDuration(sec) {
  if (!sec) return '';
  if (sec < 60) return `${sec} s`;
  if (sec % 60 === 0 && sec < 3600) return `${sec / 60} min`;
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`;
}

/** The work a segment adds up to, e.g. '5 × 1 km (5 km)' or '4 × 20 s'. */
export function segmentAmount(g) {
  const unit = g.distanceKm ? formatDistance(g.distanceKm) : formatSegDuration(g.durationSec);
  if (!unit) return '';
  if ((g.reps || 1) <= 1) return unit;
  const total = g.distanceKm ? formatDistance(Math.round(g.reps * g.distanceKm * 10) / 10) : formatSegDuration(g.reps * g.durationSec);
  return `${g.reps} × ${unit} (${total})`;
}

/** The step-by-step plan for one session: what to do and what to hit. */
export function segmentList(segments, { compact = false } = {}) {
  if (!segments || !segments.length) return '';
  return html`<ol class="segs${compact ? ' segs--compact' : ''}">
    ${segments.map((g, i) => html`<li class="seg-row">
      <span class="seg-no num" aria-hidden="true">${i + 1}</span>
      <div class="seg-main">
        <span class="seg-label">${g.label}</span>
        ${segmentAmount(g) ? html`<span class="seg-amount num">${segmentAmount(g)}</span>` : ''}
        ${!compact && g.detail ? html`<span class="seg-detail">${g.detail}</span>` : ''}
        ${g.recovery ? html`<span class="seg-rec">Recovery · ${g.recovery}</span>` : ''}
      </div>
      <div class="seg-target">
        ${g.targetTime ? html`<span class="seg-time num">${g.targetTime}</span><span class="seg-time-label">per rep</span>` : ''}
        ${g.target ? html`<span class="seg-pace num">${g.target}</span>` : ''}
        ${!g.target && !g.targetTime && g.durationSec ? html`<span class="seg-pace muted">by effort</span>` : ''}
      </div>
    </li>`)}
  </ol>`;
}

export function workoutMini(w, paces) {
  const pr = paceRange(paces, w.paceKey);
  const body = html`<div class="wmini-main">
      <span class="wmini-title">${w.title}</span>
      <span class="wmini-meta num">${[workoutAmount(w), pr].filter(Boolean).join(' · ')}</span>
    </div>
    ${w.sport === 'rest' ? '' : statusChip(w.status)}`;
  return html`<li class="wmini wmini--${w.sport}${w.key ? ' is-key' : ''}">
    ${w.sport === 'rest' ? body : html`<a class="wmini-link" href="#/workout/${encodeURIComponent(w.id)}">${body}</a>`}
  </li>`;
}

/** The 7-cell strip used on Today ("Week at a glance"). */
export function weekStrip(days, today) {
  return html`<ol class="strip" aria-label="Week at a glance">
    ${days.map(d => {
      const ws = d.workouts.filter(w => w.sport !== 'rest');
      const label = `${dayShort(d.date)} ${parseDate(d.date).getUTCDate()}: ${ws.length ? ws.map(w => `${w.title} (${w.status})`).join(', ') : 'rest'}`;
      return html`<li class="strip-day${d.date === today ? ' is-today' : ''}${d.date < today ? ' is-past' : ''}">
        <a href="#/week?date=${d.date}" aria-label="${label}">
          <span class="strip-dow">${dayShort(d.date).slice(0, 2)}</span>
          <span class="strip-num num">${parseDate(d.date).getUTCDate()}</span>
          <span class="strip-dots" aria-hidden="true">${ws.length ? ws.map(w => html`<i class="dot dot--${w.sport} dot--${w.status}"></i>`) : html`<i class="dot dot--rest"></i>`}</span>
        </a>
      </li>`;
    })}
  </ol>`;
}

export function kmBar(actual, target) {
  const pct = target > 0 ? Math.min(100, (actual / target) * 100) : 0;
  const over = target > 0 && actual > target;
  return html`<div class="kmbar">
    <div class="kmbar-head">
      <span class="kmbar-label">Run volume</span>
      <span class="kmbar-val num"><strong>${formatDistance(actual, { unit: false })}</strong> / ${formatDistance(target)}</span>
    </div>
    <div class="kmbar-track${over ? ' is-over' : ''}" role="progressbar" aria-label="Run kilometres this week" aria-valuemin="0" aria-valuemax="${Math.round(target * 10) / 10}" aria-valuenow="${Math.round(actual * 10) / 10}" aria-valuetext="${formatDistance(actual)} of ${formatDistance(target)} planned">
      <span style="width:${pct.toFixed(1)}%"></span>
    </div>
  </div>`;
}

export { raw, PACE_NAMES };
