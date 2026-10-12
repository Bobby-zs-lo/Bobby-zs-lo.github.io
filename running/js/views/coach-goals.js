// The two cards beside the thread on the Coach page: what Bobby is training for, and the
// standing notes the coach works from. Both are his to edit; the coach changes them too, when
// he tells it something that should last. The rules are in js/coach.js.
import { html, raw, mount } from '../dom.js';
import { api } from '../api.js';
import { toast, busy } from '../ui.js';
import { formatMmSs } from '../format.js';
import { goalFacts, sortGoals, goalFromForm, parseTarget, MAIN_GOAL, MAX_NOTE_CHARS } from '../coach.js';

const STATUS_NAMES = { active: 'Active', achieved: 'Achieved', dropped: 'Dropped' };
const opt = (value, label, selected) => html`<option value="${value}"${value === selected ? raw(' selected') : ''}>${label}</option>`;

// ── goals ───────────────────────────────────────────────────────────────────

function goalRow(g, today, { main = false } = {}) {
  const facts = goalFacts(g, today);
  return html`<li class="goal${main ? ' goal--main' : ''}${g.status && g.status !== 'active' ? ` is-${g.status}` : ''}" data-goal="${g.id}">
    <div class="goal-main">
      <p class="goal-title">${main ? html`<span class="race-mark" aria-hidden="true">★ </span>` : ''}${g.title}${main ? html` <span class="tag tag--race">Main goal</span>`
        : g.status !== 'active' ? html` <span class="tag">${STATUS_NAMES[g.status] || g.status}</span>` : g.kind === 'race' ? html` <span class="tag">Race</span>` : ''}</p>
      ${facts ? html`<p class="goal-facts num">${facts}</p>` : ''}
      ${main && !g.targetSeconds ? html`<p class="goal-facts muted">No target time yet.</p>` : ''}
      ${g.note ? html`<p class="goal-note">${g.note}</p>` : ''}
    </div>
    <div class="goal-actions">
      <button type="button" class="btn btn--sm btn--quiet" data-goal-edit="${g.id}" aria-label="Edit ${g.title}">${main && !g.targetSeconds ? 'Set target' : 'Edit'}</button>
      <button type="button" class="btn btn--sm btn--quiet" data-goal-about="${g.id}" aria-label="Write to the coach about ${g.title}">Comment</button>
    </div>
  </li>`;
}

function goalForm(g) {
  const main = !!g && g.id === MAIN_GOAL;
  const fresh = !g;
  const v = g || { kind: 'milestone', status: 'active' };
  return html`<form class="goal-form" data-goal-form="${fresh ? 'new' : g.id}" novalidate>
    <h3 class="goal-form-title">${fresh ? 'New goal' : main ? `${g.title}: target` : 'Edit goal'}</h3>
    ${main ? '' : html`
      <div class="field"><label for="g-title">What</label>
        <input id="g-title" name="title" type="text" maxlength="80" value="${v.title || ''}" placeholder="Half marathon, 10 km under 50…" required></div>
      <div class="field-pair">
        <div class="field"><label for="g-kind">Kind</label>
          <select id="g-kind" name="kind">${opt('milestone', 'Milestone', v.kind)}${opt('race', 'Race', v.kind)}</select></div>
        <div class="field"><label for="g-date">Date <span class="opt">optional</span></label>
          <input id="g-date" name="date" type="date" value="${v.date || ''}"></div>
      </div>`}
    <div class="field-pair">
      ${main ? '' : html`<div class="field"><label for="g-km">Distance, km <span class="opt">optional</span></label>
        <input id="g-km" name="distanceKm" type="text" inputmode="decimal" class="num" value="${v.distanceKm ?? ''}" placeholder="21.1"></div>`}
      <div class="field"><label for="g-target">Target time${main ? '' : html` <span class="opt">optional</span>`}</label>
        <input id="g-target" name="target" type="text" inputmode="numeric" class="num" value="${v.targetSeconds ? formatMmSs(v.targetSeconds) : ''}" placeholder="${main ? '3:45:00' : '1:45:00'}" aria-describedby="g-target-help"></div>
    </div>
    <p class="help" id="g-target-help">h:mm:ss or mm:ss.${main ? ' The race itself and its date are changed in Settings, or by asking the coach.' : ''}</p>
    <div class="field"><label for="g-note">Note <span class="opt">optional</span></label>
      <input id="g-note" name="note" type="text" maxlength="300" value="${v.note || ''}"></div>
    ${fresh || main ? '' : html`<div class="field"><label for="g-status">Status</label>
      <select id="g-status" name="status">${Object.entries(STATUS_NAMES).map(([k, label]) => opt(k, label, v.status))}</select></div>`}
    <p class="form-error" data-goal-error role="alert" hidden></p>
    <div class="actions">
      <button type="submit" class="btn btn--primary">Save</button>
      <button type="button" class="btn" data-goal-cancel>Cancel</button>
      ${fresh || main ? '' : html`<button type="button" class="btn btn--danger" data-goal-remove>Remove</button>`}
    </div>
  </form>`;
}

/**
 * The goals card in `host`. hooks: onChanged() after a save or a removal (the page reloads the
 * goals and calls set), onAbout({ type: 'goal', id }) when he wants to write about one.
 * → { set(goals, today, { force }) }: takes the goals in, and redraws unless a form is open (a
 * redraw would throw away what he is typing). `force` redraws anyway: after his own save.
 */
export function goalsCard(host, hooks) {
  let goals = { main: null, items: [] }, today = null;
  let editing = null; // null, 'new' or a goal id

  const find = id => (id === MAIN_GOAL ? goals.main : goals.items.find(g => g.id === id));

  function draw() {
    const items = sortGoals(goals.items);
    const edited = editing && editing !== 'new' ? find(editing) : null;
    mount(host, html`<section class="card goals" aria-labelledby="goals-h">
      <h2 class="section-title" id="goals-h">What you are training for</h2>
      <ul class="plain goal-list">
        ${goals.main ? goalRow(goals.main, today, { main: true }) : ''}
        ${items.map(g => goalRow(g, today))}
      </ul>
      ${editing === 'new' ? goalForm(null) : edited ? goalForm(edited)
        : html`<button type="button" class="btn" data-goal-new>Add a goal</button>
               <p class="help">A tune-up race, a time to hit by a date. Or tell the coach, and it adds the goal and plans toward it.</p>`}
    </section>`);
    wire();
  }

  function close(focusSelector) {
    editing = null;
    draw();
    const back = focusSelector && host.querySelector(focusSelector);
    if (back) back.focus();
  }

  function wire() {
    host.querySelector('[data-goal-new]')?.addEventListener('click', () => { editing = 'new'; draw(); host.querySelector('#g-title').focus(); });
    host.querySelectorAll('[data-goal-edit]').forEach(b => b.addEventListener('click', () => {
      editing = b.dataset.goalEdit;
      draw();
      (host.querySelector('#g-title') || host.querySelector('#g-target')).focus();
    }));
    host.querySelectorAll('[data-goal-about]').forEach(b => b.addEventListener('click', () => hooks.onAbout({ type: 'goal', id: b.dataset.goalAbout })));

    const form = host.querySelector('[data-goal-form]');
    if (!form) return;
    const id = form.dataset.goalForm;
    // form.elements, never form.<name>: a field called title or target would hide the form's own property.
    const fields = form.elements;
    const error = form.querySelector('[data-goal-error]');
    const fail = (msg, field) => {
      error.textContent = msg;
      error.hidden = false;
      const input = field && fields[field];
      if (input) { input.setAttribute('aria-invalid', 'true'); input.focus(); }
    };
    form.querySelector('[data-goal-cancel]').addEventListener('click', () => close(id === 'new' ? '[data-goal-new]' : `[data-goal-edit="${id}"]`));
    form.addEventListener('submit', e => {
      e.preventDefault();
      form.querySelectorAll('[aria-invalid]').forEach(i => i.removeAttribute('aria-invalid'));
      let body;
      if (id === MAIN_GOAL) {
        const target = parseTarget(fields.target.value);
        if (target.error) return fail(target.error, 'target');
        body = { targetSeconds: target.seconds, note: fields.note.value.trim() || null };
      } else {
        const parsed = goalFromForm({ title: fields.title.value, kind: fields.kind.value, date: fields.date.value, distanceKm: fields.distanceKm.value, target: fields.target.value, note: fields.note.value });
        if (parsed.error) return fail(parsed.error, parsed.field);
        body = id === 'new' ? parsed.body : { ...parsed.body, status: fields.status.value };
      }
      return busy(form.querySelector('button[type=submit]'), async () => {
        try {
          if (id === 'new') await api.post('/api/goals', body);
          else await api.put(`/api/goals/${encodeURIComponent(id)}`, body);
          editing = null;
          toast(id === 'new' ? 'Goal added' : 'Goal saved', { kind: 'ok' });
          await hooks.onChanged();
        } catch (ex) { fail(ex.message); }
      });
    });
    form.querySelector('[data-goal-remove]')?.addEventListener('click', e => {
      if (!confirm('Remove this goal?')) return;
      busy(e.currentTarget, async () => {
        try {
          await api.del(`/api/goals/${encodeURIComponent(id)}`);
          editing = null;
          toast('Goal removed', { kind: 'ok' });
          await hooks.onChanged();
        } catch (ex) { fail(ex.message); }
      });
    });
  }

  return {
    set(nextGoals, nextToday, { force = false } = {}) {
      goals = nextGoals || { main: null, items: [] };
      today = nextToday;
      if (force || editing == null) draw();
    },
  };
}

// ── notes ───────────────────────────────────────────────────────────────────

/**
 * The notes card in `host`. hooks: onChanged() after an add or a removal.
 * → { set(notes, { force }) }: redraws unless the add field holds text, which a redraw would lose.
 */
export function notesCard(host, hooks) {
  let notes = [];

  function draw() {
    mount(host, html`<section class="card notes" aria-labelledby="notes-h">
      <h2 class="section-title" id="notes-h">What the coach keeps in mind</h2>
      ${notes.length ? html`<ul class="plain note-list">${notes.map(n => html`<li class="note">
        <span class="note-text">${n.text}</span>
        <span class="note-by">${n.by === 'coach' ? 'Coach' : 'You'}</span>
        <button type="button" class="chip-x" data-note-remove="${n.id}" aria-label="Remove the note: ${n.text}">×</button>
      </li>`)}</ul>` : html`<p class="muted">Nothing yet. Things that should hold from week to week belong here: days you cannot run, how you like the long run, what to go easy on.</p>`}
      <form class="note-form" novalidate>
        <label class="sr-only" for="note-text">A new note for the coach</label>
        <input id="note-text" name="text" type="text" maxlength="${MAX_NOTE_CHARS}" placeholder="No runs on Tuesdays">
        <button type="submit" class="btn">Add</button>
      </form>
      <p class="form-error" data-note-error role="alert" hidden></p>
    </section>`);

    const form = host.querySelector('.note-form');
    const error = host.querySelector('[data-note-error]');
    const fail = msg => { error.textContent = msg; error.hidden = false; };
    form.addEventListener('submit', e => {
      e.preventDefault();
      const input = form.elements.text;
      const text = input.value.trim();
      if (!text) { input.focus(); return; }
      busy(form.querySelector('button[type=submit]'), async () => {
        try {
          await api.post('/api/coach/notes', { text });
          input.value = '';
          await hooks.onChanged();
          host.querySelector('#note-text')?.focus();
        } catch (ex) { fail(ex.message); }
      });
    });
    host.querySelectorAll('[data-note-remove]').forEach(b => b.addEventListener('click', () => busy(b, async () => {
      try {
        await api.del(`/api/coach/notes/${encodeURIComponent(b.dataset.noteRemove)}`);
        await hooks.onChanged();
      } catch (ex) { fail(ex.message); }
    })));
  }

  return {
    set(next, { force = false } = {}) {
      notes = next || [];
      if (force || !host.querySelector('#note-text')?.value) draw();
    },
  };
}
