// One session in full: what to run, what to hit, and what actually happened. Which recorded
// sessions count as "what happened" is chosen here too (js/views/workout-links.js);
// #/workout/<id>?link=1 opens straight into that choice.
import { html, raw, mount } from '../dom.js';
import { api } from '../api.js';
import { getPlan, getPaces } from '../store.js';
import { buildHash } from '../router.js';
import { loading, errorState, statusChip, toast, busy } from '../ui.js';
import { formatDate, workoutAmount, paceRange, PACE_NAMES, PHASE_NAMES } from '../format.js';
import { SPORT_NAMES, segmentList } from './common.js';
import { actualSection, wireActual } from './workout-links.js';
import { renderMarkdown } from '../markdown.js';

const ACTION_DONE = { done: 'Marked as done', skip: 'Skipped', move_tomorrow: 'Moved to tomorrow', undo_status: 'Status reset' };

const KIND_NOTES = {
  easy: 'Easy running is the base of everything. About 80% of your weekly kilometres belong here, and running them too fast is the most common way to stall progress.',
  long: 'The long run builds the durability the marathon is actually limited by. Keep it conversational and let the distance do the work.',
  tempo: 'Threshold work raises the pace you can hold before lactate accumulates. It is the single most valuable quality session for a marathon.',
  intervals: 'Intervals at 3–5K effort develop VO₂max. Use them sparingly: they cost the most recovery of anything in the plan.',
  hills: 'Hills build strength and running form with far less impact than flat speedwork. Effort is the target, never pace.',
  fartlek: 'Unstructured speed play. The point is to vary the pace by feel and keep running relaxed.',
  mp: 'Marathon-pace work rehearses race rhythm, fuelling and kit. On race day nothing should be new.',
  time_trial: 'A hard, even 5K to recalibrate every training pace. Run it on the same route each time so the results compare.',
  race: 'Race day. Start slower than feels right, stay patient, and keep taking carbohydrate from the first half.',
};

function header(w, week) {
  const phase = week ? PHASE_NAMES[week.phase] || week.phase : null;
  return html`<header class="page-head page-head--nav">
    <a class="icon-btn" href="#/week?date=${w.date}" aria-label="Back to the week">${raw('<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M15 18l-6-6 6-6"/></svg>')}</a>
    <div class="page-head-mid">
      <p class="eyebrow">${formatDate(w.date, { long: true })}</p>
      <h1 class="h1--compact">${w.title}</h1>
    </div>
    <span></span>
  </header>
  ${week ? html`<p class="help">Week ${week.index} · ${week.label}${phase ? ` · ${phase}` : ''}${week.isCutback ? ' · cutback week' : ''}</p>` : ''}`;
}

function facts(w, paces) {
  const pr = paceRange(paces, w.paceKey);
  const rows = [];
  if (workoutAmount(w)) rows.push(['Planned', workoutAmount(w)]);
  if (pr) rows.push(['Target pace', `${pr} · ${PACE_NAMES[w.paceKey] || ''}`]);
  rows.push(['Type', `${SPORT_NAMES[w.sport] || w.sport}${w.key ? ' · key session' : ''}`]);
  rows.push(['Status', null]);
  return html`<dl class="kv kv--wide">
    ${rows.map(([k, v]) => html`<dt>${k}</dt><dd>${v == null ? statusChip(w.status) : html`<span class="num">${v}</span>`}</dd>`)}
  </dl>`;
}

/** A run with a distance can seed the route generator, on the phone as on the desk. */
function routeLink(w) {
  if (w.sport !== 'run' || !(w.distanceKm > 0)) return '';
  return html`<p><a class="link" href="${buildHash('routes', { km: w.distanceKm, from: w.id })}">Make a route for this run →</a></p>`;
}

/** `quiet` redraws over the page as it stands, without the loading state: after a save, in place. */
export async function render(el, ctx, { quiet = false } = {}) {
  const id = (ctx.rest && ctx.rest[0]) || '';
  if (!id) { mount(el, html`<p class="state">No session chosen.</p>`); return; }
  if (!quiet) loading(el, 'Loading session');
  // ?link=1 opens the editor once. Every redraw from this page goes without it, and so does the
  // address once the editor has closed, or a reload would open it again.
  const wantsEditor = ctx.params.link === '1';
  const again = { ...ctx, params: { ...ctx.params, link: undefined } };
  const forgetLinkParam = () => {
    if (wantsEditor && ctx.isCurrent()) history.replaceState(null, '', `#/workout/${encodeURIComponent(id)}`);
  };

  let plan, week, w, paces, day = null;
  try {
    plan = await getPlan();
    for (const wk of plan.weeks) {
      const hit = wk.workouts.find(x => x.id === id);
      if (hit) { week = wk; w = hit; break; }
    }
    if (!w) { errorState(el, new Error('That session is no longer in the plan.')); return; }
    paces = await getPaces();
    try {
      const resp = await api.get(`/api/week?date=${w.date}`);
      day = (resp.days || []).find(d => d.date === w.date) || null;
      const fresh = day && (day.workouts || []).find(x => x.id === id);
      if (fresh) w = { ...w, status: fresh.status };
    } catch { /* the plan alone is enough to show the session */ }
  } catch (e) { errorState(el, e, () => render(el, ctx)); return; }
  if (!ctx.isCurrent()) return;

  const actionable = w.status === 'planned';
  const note = KIND_NOTES[w.kind];

  mount(el, html`
    ${header(w, week)}

    <article class="card workout workout--${w.sport}${w.key ? ' is-key' : ''}">
      ${workoutAmount(w) ? html`<p class="workout-amount num">${workoutAmount(w)}</p>` : ''}
      ${w.details ? html`<div class="workout-details md">${raw(renderMarkdown(w.details))}</div>` : ''}
      ${facts(w, paces)}
      ${routeLink(w)}
    </article>

    ${w.segments && w.segments.length ? html`<section class="card">
      <h2 class="section-title">The session, step by step</h2>
      <p class="help">Times are what one repetition should take at the target pace.</p>
      ${segmentList(w.segments)}
    </section>` : ''}

    ${note ? html`<section class="card banner--quiet banner">
      <p class="eyebrow">Why this session</p>
      <p>${note}</p>
    </section>` : ''}

    ${actualSection(w, day)}

    <div class="actions" id="workout-actions">
      ${actionable
        ? html`<button type="button" class="btn btn--primary" data-action="done">Done</button>
               <button type="button" class="btn" data-action="skip">Skip</button>
               <button type="button" class="btn" data-action="move_tomorrow">Move to tomorrow</button>`
        : html`<button type="button" class="btn btn--quiet" data-action="undo_status">Undo status</button>`}
    </div>
  `);

  el.querySelectorAll('#workout-actions [data-action]').forEach(btn => {
    btn.addEventListener('click', e => busy(e.currentTarget, async () => {
      const action = btn.dataset.action;
      try {
        await api.post(`/api/workouts/${encodeURIComponent(id)}/action`, { action });
        toast(ACTION_DONE[action] || 'Saved', { kind: 'ok' });
        await getPlan({ force: true });
        render(el, again);
      } catch (ex) { toast(ex.message, { kind: 'error' }); }
    }));
  });

  wireActual(el, {
    workout: w, day, open: wantsEditor, onClosed: forgetLinkParam,
    onSaved: async () => {
      forgetLinkParam();
      // The status follows the links, and the plan holds the status. If the plan cannot be
      // read again the week still can: the redraw below takes the status from there.
      try { await getPlan({ force: true }); } catch { /* keep the copy in memory */ }
      await render(el, again, { quiet: true });
      const opener = ctx.isCurrent() && el.querySelector('[data-link-open]');
      if (opener) opener.focus();
    },
  });
}
