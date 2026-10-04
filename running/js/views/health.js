import { html, raw, mount } from '../dom.js';
import { api } from '../api.js';
import { getState } from '../store.js';
import { loading, errorState } from '../ui.js';
import { addDays, formatDate, formatTimestamp, formatNumber, formatDuration, formatDistance } from '../format.js';
import { sparklineSvg, buildSparkPath } from '../sparkline.js';

const METRICS = [
  { key: 'restingHr', label: 'Resting heart rate', unit: 'bpm', digits: 0, better: 'lower' },
  { key: 'hrvRmssd', label: 'HRV (RMSSD)', unit: 'ms', digits: 0, better: 'higher' },
  { key: 'sleepHours', label: 'Sleep', unit: 'h', digits: 1, better: 'higher' },
  { key: 'steps', label: 'Steps', unit: '', digits: 0, better: 'higher' },
  { key: 'weightKg', label: 'Weight', unit: 'kg', digits: 1 },
];

const EXERCISE_NAMES = { running: 'Run', biking: 'Ride', cycling: 'Ride', walking: 'Walk', strength_training: 'Strength', weightlifting: 'Strength' };
const exName = t => EXERCISE_NAMES[String(t || '').toLowerCase()] || String(t || 'Exercise').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

export async function render(el, ctx) {
  loading(el, 'Loading health data');
  let state, rows;
  try {
    state = await getState();
    const to = state.today, from = addDays(to, -27);
    rows = await api.get(`/api/health?from=${from}&to=${to}`);
  } catch (e) {
    if (ctx.isCurrent()) errorState(el, e, () => render(el, ctx));
    return;
  }
  if (!ctx.isCurrent()) return;

  const to = state.today;
  const dates = Array.from({ length: 28 }, (_, i) => addDays(to, i - 27));
  const byDate = new Map((rows || []).map(r => [r.date, r]));
  const series = k => dates.map(d => { const r = byDate.get(d); return r && r[k] != null ? r[k] : null; });
  const sessions = (rows || []).flatMap(r => (r.exercise || []).map(x => ({ ...x, date: r.date })))
    .sort((a, b) => String(b.startUtc).localeCompare(String(a.startUtc)));

  mount(el, html`
    <header class="page-head">
      <p class="eyebrow">Health Connect · last 28 days</p>
      <h1>Health</h1>
      <p class="sub">Last sync: <span class="num">${formatTimestamp(state.healthLastSync)}</span></p>
    </header>
    ${!rows || !rows.length ? html`<div class="card"><p>No health data yet.</p><p class="help">Set up the Health Connect to Webhook app. See <a class="link" href="#/settings">Settings › Health Connect</a>.</p></div>` : ''}
    <div class="metrics">
      ${METRICS.map(m => {
        const vals = series(m.key);
        const { min, max, last } = buildSparkPath(vals);
        const n = vals.filter(v => v != null);
        const avg = n.length ? n.reduce((a, b) => a + b, 0) / n.length : null;
        let lastDate = null;
        for (let i = vals.length - 1; i >= 0; i--) if (vals[i] != null) { lastDate = dates[i]; break; }
        const label = `${m.label}, 28 days: ${n.length ? `latest ${formatNumber(last, m.digits)} ${m.unit}, range ${formatNumber(min, m.digits)} to ${formatNumber(max, m.digits)} ${m.unit}, average ${formatNumber(avg, m.digits)}` : 'no data'}`;
        return html`<article class="card metric">
          <div class="metric-head">
            <h2 class="metric-label">${m.label}</h2>
            <p class="metric-val num">${formatNumber(last, m.digits)}<span class="unit">${m.unit ? ' ' + m.unit : ''}</span></p>
          </div>
          ${raw(sparklineSvg(vals, { label }))}
          <p class="metric-foot num">${n.length
            ? `${lastDate === to ? 'Today' : formatDate(lastDate)} · 28-day avg ${formatNumber(avg, m.digits)} · ${formatNumber(min, m.digits)}–${formatNumber(max, m.digits)}`
            : 'No data in the last 28 days'}</p>
        </article>`;
      })}
    </div>
    <section aria-labelledby="ex-h">
      <h2 class="section-title" id="ex-h">Exercise sessions</h2>
      <p class="help">From Health Connect. Sessions that Strava already has are greyed out and not counted twice.</p>
      ${sessions.length ? html`<ul class="plain card sessions">${sessions.map(s => html`<li class="session${s.duplicateOfStrava ? ' is-dup' : ''}">
          <span class="session-date">${formatDate(s.date)}</span>
          <span class="session-main"><span>${exName(s.type)}</span>
            <span class="num muted">${[formatDuration(s.durationMin), s.distanceKm != null ? formatDistance(s.distanceKm) : ''].filter(Boolean).join(' · ')}</span></span>
          ${s.duplicateOfStrava ? html`<span class="tag">On Strava</span>` : ''}
        </li>`)}</ul>` : html`<p class="muted">No exercise sessions in the last 28 days.</p>`}
    </section>
  `);
}
