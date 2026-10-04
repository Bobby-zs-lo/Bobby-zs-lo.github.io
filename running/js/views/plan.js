import { html, raw, mount } from '../dom.js';
import { getState, getPlan } from '../store.js';
import { loading, errorState, statusChip } from '../ui.js';
import { addDays, formatWeekRange, formatDate, dayShort, PHASE_NAMES, workoutAmount, paceRange, formatDistance, diffDays } from '../format.js';
import { ICONS } from '../icons.js';

/** Group consecutive weeks with the same phase (week 0 joins the first group). */
export function groupByPhase(weeks) {
  const groups = [];
  for (const w of weeks) {
    const last = groups[groups.length - 1];
    if (last && (last.phase === w.phase || (w.index === 1 && last.weeks.every(x => x.index === 0)))) last.weeks.push(w);
    else groups.push({ phase: w.phase, weeks: [w] });
  }
  for (const g of groups) g.phase = g.weeks[g.weeks.length - 1].phase;
  return groups;
}

export async function render(el, ctx) {
  loading(el, 'Loading plan');
  let state, plan;
  try {
    [state, plan] = await Promise.all([getState(), getPlan()]);
  } catch (e) {
    if (ctx.isCurrent()) errorState(el, e, () => render(el, ctx));
    return;
  }
  if (!ctx.isCurrent()) return;

  const today = state.today;
  const raceDate = plan.raceDate;
  const weeks = plan.weeks || [];
  const groups = groupByPhase(weeks);
  const inWeek = (w, d) => d >= w.startDate && d <= addDays(w.startDate, 6);
  const daysToRace = raceDate ? diffDays(today, raceDate) : null;
  const weeksToRace = daysToRace != null ? Math.ceil(daysToRace / 7) : null;

  mount(el, html`
    <header class="page-head">
      <p class="eyebrow">${plan.raceName || 'Race'} · ${raceDate ? formatDate(raceDate, { year: true }) : ''}</p>
      <h1>Plan</h1>
      ${daysToRace != null && daysToRace >= 0 ? html`<p class="sub num">${daysToRace === 0 ? 'Race day.' : `${daysToRace} days to go · ${weeksToRace} ${weeksToRace === 1 ? 'week' : 'weeks'}`}</p>` : ''}
    </header>
    ${groups.map(g => {
      const first = g.weeks[0], last = g.weeks[g.weeks.length - 1];
      const km = g.weeks.reduce((s, w) => s + (w.targetRunKm || 0), 0);
      return html`<section class="phase" aria-label="${PHASE_NAMES[g.phase] || g.phase}">
        <header class="phase-head">
          <h2 class="phase-title">${PHASE_NAMES[g.phase] || g.phase}</h2>
          <p class="phase-meta num">Weeks ${first.index}${last.index !== first.index ? `–${last.index}` : ''} · ${formatDate(first.startDate)} – ${formatDate(addDays(last.startDate, 6))} · ${formatDistance(km)}</p>
        </header>
        <ol class="weeks">
          ${g.weeks.map(w => {
            const current = inWeek(w, today);
            const raceWeek = raceDate && inWeek(w, raceDate);
            const past = addDays(w.startDate, 6) < today;
            const done = w.workouts.filter(x => x.sport !== 'rest' && (x.status === 'done' || x.status === 'partial')).length;
            const total = w.workouts.filter(x => x.sport !== 'rest').length;
            return html`<li class="wk${current ? ' is-current' : ''}${past ? ' is-past' : ''}${raceWeek ? ' is-raceweek' : ''}" id="wk-${w.index}">
              <details${current ? raw(' open') : ''}>
                <summary>
                  <span class="wk-idx num">${w.index}</span>
                  <span class="wk-main">
                    <span class="wk-label">${w.label || `Week ${w.index}`}${current ? html` <span class="tag tag--accent">This week</span>` : ''}${raceWeek ? html` <span class="tag tag--race">Race</span>` : ''}${w.isCutback ? html` <span class="tag">Cutback</span>` : ''}</span>
                    <span class="wk-meta num">${formatWeekRange(w.startDate)}${past && total ? ` · ${done}/${total} done` : ''}</span>
                  </span>
                  <span class="wk-km num">${formatDistance(w.targetRunKm)}</span>
                  <span class="wk-chev">${raw(ICONS.chevron)}</span>
                </summary>
                <div class="wk-body">
                  ${w.focus ? html`<p class="help">${w.focus}</p>` : ''}
                  <ul class="plain wk-list">
                    ${w.workouts.map(x => {
                      const isRace = x.sport === 'race' || x.date === raceDate && x.kind === 'race';
                      return html`<li class="wk-w wk-w--${x.sport}${x.key ? ' is-key' : ''}${isRace ? ' is-race' : ''}${x.date === today ? ' is-today' : ''}">
                        <span class="wk-w-day">${dayShort(x.date)}</span>
                        <span class="wk-w-main"><span class="wk-w-title">${isRace ? html`<span class="race-mark" aria-hidden="true">★ </span>` : ''}${x.title}</span>
                          <span class="wk-w-meta num">${[workoutAmount(x), paceRange(plan.paces, x.paceKey)].filter(Boolean).join(' · ')}</span></span>
                        ${x.sport === 'rest' || x.status === 'planned' ? '' : statusChip(x.status)}
                      </li>`;
                    })}
                  </ul>
                </div>
              </details>
            </li>`;
          })}
        </ol>
      </section>`;
    })}
  `);

  const cur = el.querySelector('.wk.is-current');
  if (cur) requestAnimationFrame(() => {
    const top = cur.getBoundingClientRect().top + window.scrollY - 140;
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
  });
}
