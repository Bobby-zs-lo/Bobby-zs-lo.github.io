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

export function workoutMini(w, paces) {
  const pr = paceRange(paces, w.paceKey);
  return html`<li class="wmini wmini--${w.sport}${w.key ? ' is-key' : ''}">
    <div class="wmini-main">
      <span class="wmini-title">${w.title}</span>
      <span class="wmini-meta num">${[workoutAmount(w), pr].filter(Boolean).join(' · ')}</span>
    </div>
    ${w.sport === 'rest' ? '' : statusChip(w.status)}
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
