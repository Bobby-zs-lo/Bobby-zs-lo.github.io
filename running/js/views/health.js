import { html, raw, mount } from '../dom.js';
import { api } from '../api.js';
import { getState } from '../store.js';
import { loading, errorState } from '../ui.js';
import { addDays, formatDate, formatTimestamp, formatNumber, formatDuration, formatDistance } from '../format.js';
import { sparklineSvg, buildSparkPath } from '../sparkline.js';

const METRICS = [
  { key: 'restingHr', label: 'Resting heart rate', unit: 'bpm', digits: 0, note: 'Five or more beats above your 28-day baseline for three days running is a warning sign.' },
  { key: 'hrvRmssd', label: 'HRV (RMSSD)', unit: 'ms', digits: 0, note: 'Higher is generally better recovered. Read the trend, never a single night.' },
  { key: 'sleepHours', label: 'Sleep', unit: 'h', digits: 1, note: 'Adaptation happens while you sleep. Seven to nine hours is the target.' },
  { key: 'steps', label: 'Steps', unit: '', digits: 0 },
  { key: 'activeKcal', label: 'Active energy', unit: 'kcal', digits: 0 },
  { key: 'distanceKm', label: 'Distance moved', unit: 'km', digits: 1, note: 'Everything Health Connect saw: walking, running and cycling together.' },
  { key: 'avgHr', label: 'Average heart rate', unit: 'bpm', digits: 0 },
  { key: 'weightKg', label: 'Weight', unit: 'kg', digits: 1 },
  { key: 'vo2max', label: 'VO₂max estimate', unit: 'ml/kg/min', digits: 1 },
  { key: 'spo2', label: 'Blood oxygen', unit: '%', digits: 0 },
];

/** Compact per-day log, so the raw numbers are visible and not only the trend. */
const LOG_COLUMNS = [
  { key: 'steps', label: 'Steps', digits: 0 },
  { key: 'sleepHours', label: 'Sleep', digits: 1 },
  { key: 'restingHr', label: 'RHR', digits: 0 },
  { key: 'hrvRmssd', label: 'HRV', digits: 0 },
  { key: 'activeKcal', label: 'kcal', digits: 0 },
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

  const logDates = dates.slice(-14).reverse();
  const fam = t => {
    const v = String(t || '').toLowerCase();
    if (v.includes('bik') || v.includes('cycl')) return 'ride';
    if (v.includes('run')) return 'run';
    if (v.includes('walk') || v.includes('hik')) return 'walk';
    return 'other';
  };
  const mins = (f, days) => sessions
    .filter(x => fam(x.type) === f && !x.duplicateOfStrava && days.includes(x.date))
    .reduce((t, x) => t + (x.durationMin || 0), 0);
  const last7 = dates.slice(-7), prev7 = dates.slice(-14, -7);
  const loadRows = [
    ['Cycling, 7 days', `${formatDuration(mins('ride', last7))}  (previous week ${formatDuration(mins('ride', prev7))})`],
    ['Walking, 7 days', formatDuration(mins('walk', last7))],
    ['Running, 7 days', formatDuration(mins('run', last7))],
    ['Sessions, 28 days', String(sessions.filter(x => !x.duplicateOfStrava).length)],
  ];

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
          ${m.note ? html`<p class="help">${m.note}</p>` : ''}
        </article>`;
      })}
    </div>
    <section aria-labelledby="load-h">
      <h2 class="section-title" id="load-h">Training load from your phone</h2>
      <p class="help">Cycling and walking are never planned here — they are recorded, and read as context when the running plan is adjusted.</p>
      <div class="card">
        <dl class="kv kv--wide">
          ${loadRows.map(([k, v]) => html`<dt>${k}</dt><dd><span class="num">${v}</span></dd>`)}
        </dl>
      </div>
    </section>

    <section aria-labelledby="log-h">
      <h2 class="section-title" id="log-h">Daily log</h2>
      <p class="help">The last 14 days exactly as Health Connect reported them. A dash means nothing was recorded.</p>
      <div class="card table-wrap">
        <table class="dtable">
          <thead><tr><th scope="col">Day</th>${LOG_COLUMNS.map(c => html`<th scope="col">${c.label}</th>`)}<th scope="col">Sessions</th></tr></thead>
          <tbody>
            ${logDates.map(d => {
              const r = byDate.get(d) || {};
              const ex = (r.exercise || []).filter(x => !x.duplicateOfStrava);
              return html`<tr${d === to ? raw(' class="is-today"') : ''}>
                <th scope="row">${d === to ? 'Today' : formatDate(d)}</th>
                ${LOG_COLUMNS.map(c => html`<td class="num">${r[c.key] != null ? formatNumber(r[c.key], c.digits) : '–'}</td>`)}
                <td class="num">${ex.length ? `${ex.length} · ${formatDuration(ex.reduce((t, x) => t + (x.durationMin || 0), 0))}` : '–'}</td>
              </tr>`;
            })}
          </tbody>
        </table>
      </div>
    </section>

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
