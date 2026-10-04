import { html, raw, mount } from '../dom.js';
import { api } from '../api.js';
import { getState, getPaces } from '../store.js';
import { loading, errorState, statusChip } from '../ui.js';
import { navigate } from '../router.js';
import { addDays, formatWeekRange, formatDate, dayShort, parseDate, runKm, PHASE_NAMES, workoutAmount, paceRange } from '../format.js';
import { activityRow, kmBar } from './common.js';
import { ICONS } from '../icons.js';


function checkinLine(c) {
  if (!c) return '';
  const bits = [];
  if (c.sleepHours != null) bits.push(`slept ${c.sleepHours} h`);
  if (c.energy != null) bits.push(`energy ${c.energy}/5`);
  if (c.soreness != null) bits.push(`soreness ${c.soreness}/10`);
  return bits.length ? html`<p class="day-checkin num">Check-in: ${bits.join(' · ')}</p>` : '';
}

export async function render(el, ctx) {
  loading(el);
  let state, wk, paces;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(ctx.params.date || '') ? ctx.params.date : null;
  try {
    state = await getState();
    wk = await api.get(`/api/week${date ? `?date=${date}` : ''}`);
    paces = await getPaces(wk);
  } catch (e) {
    if (ctx.isCurrent()) errorState(el, e, () => render(el, ctx));
    return;
  }
  if (!ctx.isCurrent()) return;

  const today = state.today;
  const week = wk.week || {};
  const start = week.startDate || (wk.days[0] && wk.days[0].date);
  const acts = wk.days.flatMap(d => d.activities || []);
  const actual = runKm(acts);
  const isThisWeek = today >= start && today <= addDays(start, 6);

  mount(el, html`
    <header class="page-head page-head--nav">
      <button type="button" class="icon-btn" data-go="-7" aria-label="Previous week">${raw(ICONS.prev)}</button>
      <div class="page-head-mid">
        <p class="eyebrow">${week.index != null ? `Week ${week.index}` : 'Week'} · ${PHASE_NAMES[week.phase] || week.phase || ''}</p>
        <h1 class="h1--compact">${formatWeekRange(start)}</h1>
      </div>
      <button type="button" class="icon-btn" data-go="7" aria-label="Next week">${raw(ICONS.next)}</button>
    </header>
    <div class="card">
      ${kmBar(actual, week.targetRunKm || 0)}
      <p class="help">${[week.label, week.isCutback ? 'Cutback week' : '', week.focus].filter(Boolean).join(' · ')}</p>
      ${isThisWeek ? '' : html`<button type="button" class="btn btn--quiet btn--sm" data-today>Back to this week</button>`}
    </div>
    <ol class="days">
      ${wk.days.map(d => {
        const ws = d.workouts || [];
        const as = d.activities || [];
        return html`<li class="day${d.date === today ? ' is-today' : ''}${d.date < today ? ' is-past' : ''}" ${d.date === today ? raw('aria-current="date"') : ''}>
          <div class="day-date">
            <span class="day-dow">${dayShort(d.date)}</span>
            <span class="day-num num">${parseDate(d.date).getUTCDate()}</span>
          </div>
          <div class="day-body">
            ${ws.length ? html`<ul class="plain">${ws.map(w => html`<li class="day-w${w.key ? ' is-key' : ''}${w.sport === 'race' ? ' is-race' : ''}">
                <a class="day-w-link" href="#/workout/${encodeURIComponent(w.id)}"><span class="day-w-title">${w.title}</span>
                <span class="day-w-meta num">${[workoutAmount(w), paceRange(paces, w.paceKey)].filter(Boolean).join(' · ')}</span>
                ${w.details ? html`<span class="day-w-detail">${w.details}</span>` : ''}</a>
                ${w.sport === 'rest' ? '' : statusChip(w.status)}
              </li>`)}</ul>` : html`<p class="muted">Rest</p>`}
            ${as.map(activityRow)}
            ${checkinLine(d.checkin)}
          </div>
        </li>`;
      })}
    </ol>
  `);

  el.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => navigate('week', { date: addDays(start, +b.dataset.go) })));
  const t = el.querySelector('[data-today]');
  if (t) t.addEventListener('click', () => navigate('week'));
}
