// "What you actually did" on the session page, and the editor that decides it: every session
// recorded that day with a checkbox, saved with PUT /api/workouts/:id/links. The rules (what is
// listed, what is ticked, what is sent) are in js/links.js; this file is the card and its wiring.
// The card shows either the sessions that count or the editor, never both.
import { html, raw } from '../dom.js';
import { api } from '../api.js';
import { busy, toast } from '../ui.js';
import { formatDate } from '../format.js';
import { hasRecorded, linkedSessions, linkedTotals, comparisonLine, linkCandidates, linksBody, linksError } from '../links.js';
import { linkedRows } from './common.js';

const SAVED = 'Sessions updated';
const SAVE = 'Save';
const SAVING = 'Saving…';
const MOVES_HERE = 'Ticking moves it here.';

function option(c) {
  // A disabled row's note says why; any other note names the session that has it now.
  const note = c.note && !c.disabled ? `${c.note}. ${MOVES_HERE}` : c.note;
  return html`<li><label class="link-opt${c.disabled ? ' is-disabled' : ''}">
    <input type="checkbox" name="session" value="${c.key}"${c.linked ? raw(' checked') : ''}${c.disabled ? raw(' disabled') : ''}>
    <span class="activity${c.kind === 'health' ? ' activity--health' : ''}">
      <span class="activity-src">${c.source}</span>
      <span class="activity-name">${c.name}${c.commute ? html` <span class="tag">Commute</span>` : ''}</span>
      <span class="activity-stats num">${c.stats}</span>
      ${note ? html`<span class="link-note">${note}</span>` : ''}
    </span>
  </label></li>`;
}

function editor(day, candidates) {
  return html`<form class="link-editor" data-link-form hidden novalidate>
    <fieldset class="link-set" aria-describedby="link-help">
      <legend>Recorded on ${formatDate(day.date, { long: true })}</legend>
      <p class="help" id="link-help">Tick everything that counts for this session. A warm-up and the session itself can count together.</p>
      <ul class="plain link-list">${candidates.map(option)}</ul>
    </fieldset>
    <p class="form-error" data-link-error role="alert" hidden></p>
    <div class="actions">
      <button type="submit" class="btn btn--primary">${SAVE}</button>
      <button type="button" class="btn" data-link-cancel>Cancel</button>
    </div>
  </form>`;
}

/** The card, or nothing when the day has no recorded session to show or to choose from. */
export function actualSection(w, day) {
  if (!hasRecorded(day)) return '';
  const linked = linkedSessions(day, w.id);
  const totals = linkedTotals(linked);
  const line = comparisonLine(w, totals);
  return html`<section class="card actual" data-actual aria-labelledby="actual-h">
    <div class="section-head">
      <h2 class="section-title" id="actual-h">What you actually did</h2>
      ${totals.count ? html`<button type="button" class="btn" data-link-open aria-label="Change which sessions count">Change</button>` : ''}
    </div>
    <div class="actual-view" data-actual-view>
      ${totals.count ? html`<div class="actual-rows">${linkedRows(linked)}</div>` : html`<p class="muted">Nothing linked to this session yet.</p>`}
      ${line ? html`<p class="help">${line}</p>` : ''}
      ${totals.count ? '' : html`<button type="button" class="btn" data-link-open>Link a recorded session</button>`}
    </div>
    ${editor(day, linkCandidates(day, w.id))}
  </section>`;
}

/**
 * Wire the card actualSection drew. `open` starts in the editor (#/workout/<id>?link=1).
 * `onSaved` runs once a choice is stored and should redraw the page; `onClosed` runs when the
 * editor closes without one.
 */
export function wireActual(el, { workout, day, open = false, onSaved, onClosed }) {
  const section = el.querySelector('[data-actual]');
  if (!section) return;
  const view = section.querySelector('[data-actual-view]');
  const form = section.querySelector('[data-link-form]');
  const error = form.querySelector('[data-link-error]');
  const save = form.querySelector('button[type=submit]');
  const cancel = form.querySelector('[data-link-cancel]');
  const openers = [...section.querySelectorAll('[data-link-open]')];
  const candidates = linkCandidates(day, workout.id);
  let opener = openers[0];

  const show = editing => {
    form.hidden = !editing;
    view.hidden = editing;
    for (const b of openers) b.hidden = editing;
  };
  // Keyboard and screen reader land on the first box that can be ticked: its label reads the session out.
  const focusEditor = () => (form.querySelector('input[name=session]:not(:disabled)') || cancel).focus({ preventScroll: true });
  const fail = message => { error.textContent = message; error.hidden = false; };
  const close = () => {
    form.reset(); // back to what counts now, for the next time it opens
    error.hidden = true;
    show(false);
    opener.focus({ preventScroll: true });
    if (onClosed) onClosed();
  };

  for (const b of openers) {
    b.addEventListener('click', () => {
      opener = b;
      // Focus moves before the button is hidden: coming from a button that was clicked or tapped
      // the box draws no focus ring, coming from one reached by keyboard it does.
      form.hidden = false;
      focusEditor();
      show(true);
    });
  }
  cancel.addEventListener('click', close);
  form.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !save.disabled) { e.preventDefault(); close(); }
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    busy(save, async () => {
      const keys = [...form.querySelectorAll('input[name=session]:checked')].map(box => box.value);
      const body = linksBody(candidates, keys);
      const problem = linksError(body);
      if (problem) { fail(problem); return; }
      error.hidden = true;
      cancel.disabled = true;
      save.textContent = SAVING;
      try {
        await api.put(`/api/workouts/${encodeURIComponent(workout.id)}/links`, body);
      } catch (ex) {
        fail(ex.message); // the server's own words; the editor stays open with the ticks as they were
        cancel.disabled = false;
        save.textContent = SAVE;
        return;
      }
      toast(SAVED, { kind: 'ok' });
      await onSaved(); // redraws the page, this form included, so "Saving…" stays until then
    });
  });

  if (open) {
    show(true);
    // The app shell moves focus to the view once render() returns; take it back after that, and
    // bring the card up under the header: the editor is why this address was opened.
    setTimeout(() => {
      if (!section.isConnected || form.hidden) return;
      section.scrollIntoView({ block: 'start' });
      focusEditor();
    }, 0);
  }
}
