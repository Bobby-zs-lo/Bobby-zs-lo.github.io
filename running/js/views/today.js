import { html, raw, mount } from '../dom.js';
import { api } from '../api.js';
import { getState, getPaces } from '../store.js';
import { loading, errorState, statusChip, toast, busy } from '../ui.js';
import { formatDate, workoutAmount, paceRange, PACE_NAMES, PHASE_NAMES, formatNumber } from '../format.js';
import { SPORT_NAMES, activityRow, weekStrip } from './common.js';
import { renderMarkdown } from '../markdown.js';

const ACTION_DONE = { done: 'Marked as done', skip: 'Skipped', move_tomorrow: 'Moved to tomorrow', undo_status: 'Status reset' };

function workoutCard(w, paces, activities) {
  const matched = activities.filter(a => a.workoutId === w.id);
  const pr = paceRange(paces, w.paceKey);
  const isRest = w.sport === 'rest';
  const actionable = !isRest && w.status === 'planned';
  return html`<article class="card workout workout--${w.sport}${w.key ? ' is-key' : ''}${w.sport === 'race' ? ' is-race' : ''}" data-id="${w.id}">
    <div class="workout-top">
      <p class="eyebrow">${SPORT_NAMES[w.sport] || w.sport}${w.key ? ' · Key session' : ''}</p>
      ${isRest ? '' : statusChip(w.status)}
    </div>
    <h2 class="workout-title">${w.title}</h2>
    ${workoutAmount(w) ? html`<p class="workout-amount num">${workoutAmount(w)}</p>` : ''}
    ${pr ? html`<p class="workout-pace num"><span class="pace-key">${w.paceKey}</span>${pr}<span class="muted"> · ${PACE_NAMES[w.paceKey] || ''} pace</span></p>` : ''}
    ${w.details ? html`<div class="workout-details md">${raw(renderMarkdown(w.details))}</div>` : ''}
    ${matched.length ? html`<div class="matched">${matched.map(activityRow)}</div>` : ''}
    ${isRest ? '' : html`<div class="actions">
      ${actionable
        ? html`<button type="button" class="btn btn--primary" data-action="done">Done</button>
               <button type="button" class="btn" data-action="skip">Skip</button>
               <button type="button" class="btn" data-action="move_tomorrow">Move to tomorrow</button>`
        : html`<button type="button" class="btn btn--quiet" data-action="undo_status">Undo status</button>`}
    </div>`}
  </article>`;
}

function radios(name, from, to, value, labels = {}) {
  const out = [];
  for (let i = from; i <= to; i++) {
    out.push(html`<label class="seg-opt"><input type="radio" name="${name}" value="${i}"${value === i ? raw(' checked') : ''}><span>${labels[i] || i}</span></label>`);
  }
  return out;
}

function checkinForm(date, c) {
  c = c || {};
  return html`<form class="card form checkin" id="checkin" novalidate>
    <h2 class="section-title">Check-in</h2>
    <p class="help">${c.sleepHours != null || c.mood != null ? 'Saved for today. Change anything and save again.' : 'Ten seconds. It helps the weekly review.'}</p>
    <div class="field field--row">
      <label for="sleepHours">Sleep</label>
      <div class="input-unit"><input id="sleepHours" name="sleepHours" type="number" inputmode="decimal" min="0" max="16" step="0.25" value="${c.sleepHours ?? ''}" placeholder="7.5"><span>hours</span></div>
    </div>
    <fieldset class="field"><legend>Sleep quality</legend><div class="seg">${radios('sleepQuality', 1, 5, c.sleepQuality, { 1: '1 poor', 5: '5 great' })}</div></fieldset>
    <div class="field">
      <label for="soreness">Soreness <output id="soreness-out" class="num" for="soreness">${c.soreness ?? 0}</output><span class="muted"> / 10</span></label>
      <input id="soreness" name="soreness" type="range" min="0" max="10" step="1" value="${c.soreness ?? 0}">
      <div class="range-ends"><span>none</span><span>very sore</span></div>
    </div>
    <fieldset class="field"><legend>Mood</legend><div class="seg">${radios('mood', 1, 5, c.mood, { 1: '1 low', 5: '5 great' })}</div></fieldset>
    <fieldset class="field"><legend>Energy</legend><div class="seg">${radios('energy', 1, 5, c.energy, { 1: '1 flat', 5: '5 fresh' })}</div></fieldset>
    <div class="field">
      <label for="note">Note</label>
      <textarea id="note" name="note" rows="2" maxlength="500" placeholder="Anything worth knowing: niggles, stress, travel…">${c.note || ''}</textarea>
    </div>
    <input type="hidden" name="date" value="${date}">
    <button class="btn btn--primary btn--block" type="submit">Save check-in</button>
  </form>`;
}

export async function render(el, ctx) {
  loading(el);
  let state, wk, paces;
  try {
    [state, wk] = await Promise.all([getState(), api.get('/api/week')]);
    paces = await getPaces(wk);
  } catch (e) {
    if (ctx.isCurrent()) errorState(el, e, () => render(el, ctx));
    return;
  }
  if (!ctx.isCurrent()) return;

  const today = state.today;
  const draw = () => {
    const day = wk.days.find(d => d.date === today) || { date: today, workouts: [], activities: [], checkin: null };
    const workouts = day.workouts || [];
    const activities = day.activities || [];
    const unmatched = activities.filter(a => !a.workoutId || !workouts.some(w => w.id === a.workoutId));
    const allRest = !workouts.length || workouts.every(w => w.sport === 'rest');
    const week = wk.week;

    mount(el, html`
      <header class="page-head">
        <p class="eyebrow">${formatDate(today, { long: true })}</p>
        <h1>Today</h1>
        ${week ? html`<p class="sub">Week ${week.index} · ${PHASE_NAMES[week.phase] || week.phase}${week.isCutback ? ' · cutback' : ''}</p>` : ''}
      </header>
      ${state.pendingProposals > 0 ? html`<a class="banner" href="#/reviews"><strong class="num">${state.pendingProposals}</strong> plan ${state.pendingProposals === 1 ? 'change' : 'changes'} awaiting your approval <span aria-hidden="true">→</span></a>` : ''}
      ${state.strava && state.strava.connected === false ? html`<a class="banner banner--quiet" href="#/settings">Strava isn’t connected. Connect it to log runs automatically <span aria-hidden="true">→</span></a>` : ''}
      <section class="stack" aria-label="Today’s sessions">
        ${allRest ? html`<article class="card workout workout--rest">
            <p class="eyebrow">Rest</p>
            <h2 class="workout-title">${workouts[0] ? workouts[0].title : 'Rest day'}</h2>
            <p class="muted">${workouts[0] && workouts[0].details ? workouts[0].details : 'An easy spin or a walk is fine. Sleep counts as training.'}</p>
          </article>` : workouts.filter(w => w.sport !== 'rest').map(w => workoutCard(w, paces, activities))}
        ${unmatched.length ? html`<div class="card"><h2 class="section-title">Also today</h2>${unmatched.map(activityRow)}</div>` : ''}
      </section>
      <section class="glance" aria-labelledby="glance-h">
        <div class="section-head"><h2 class="section-title" id="glance-h">Week at a glance</h2><a class="link" href="#/week">Full week</a></div>
        ${weekStrip(wk.days, today)}
        ${week ? html`<p class="help num">${formatNumber(week.targetRunKm, 0)} km planned this week${week.focus ? ` · ${week.focus}` : ''}</p>` : ''}
      </section>
      ${checkinForm(today, day.checkin)}
    `);
    wire(day);
  };

  const wire = day => {
    el.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', () => busy(btn, async () => {
      const card = btn.closest('[data-id]');
      const id = card.dataset.id;
      const action = btn.dataset.action;
      try {
        const res = await api.post(`/api/workouts/${encodeURIComponent(id)}/action`, { action });
        const updated = res && res.workout;
        if (action === 'move_tomorrow') {
          // The workout leaves today; refetch so tomorrow shows it too.
          wk = await api.get('/api/week');
        } else if (updated) {
          for (const d of wk.days) d.workouts = d.workouts.map(w => (w.id === updated.id ? updated : w));
        }
        toast(ACTION_DONE[action] || 'Saved', { kind: 'ok' });
        draw();
      } catch (e) {
        toast(e.message, { kind: 'error' });
      }
    })));

    const form = el.querySelector('#checkin');
    const sor = form.querySelector('#soreness');
    const out = form.querySelector('#soreness-out');
    sor.addEventListener('input', () => { out.textContent = sor.value; });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(form);
      const num = k => (fd.get(k) === null || fd.get(k) === '' ? null : Number(fd.get(k)));
      const body = {
        date: fd.get('date'), sleepHours: num('sleepHours'), sleepQuality: num('sleepQuality'),
        soreness: num('soreness'), mood: num('mood'), energy: num('energy'), note: (fd.get('note') || '').trim(),
      };
      if (body.sleepHours != null && (body.sleepHours < 0 || body.sleepHours > 16)) {
        toast('Sleep should be between 0 and 16 hours.', { kind: 'error' });
        return;
      }
      const btn = form.querySelector('button[type=submit]');
      await busy(btn, async () => {
        try {
          await api.post('/api/checkin', body);
          day.checkin = body;
          toast('Check-in saved', { kind: 'ok' });
        } catch (ex) { toast(ex.message, { kind: 'error' }); }
      });
    });
  };

  draw();
}
