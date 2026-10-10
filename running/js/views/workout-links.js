// "What you actually did" on the session page, and the editor that decides it: every session
// recorded that day with a checkbox, saved with PUT /api/workouts/:id/links. The rules (whether
// there is a choice, what is listed, what is ticked, what is sent) are in js/links.js; this file
// is the card and its wiring. The card shows either the sessions that count or the editor, never both.
import { html, raw } from '../dom.js';
import { api } from '../api.js';
import { busy, toast } from '../ui.js';
import { formatDate } from '../format.js';
import { canLink, linkedSessions, linkedTotals, comparisonLine, linkCandidates, linksBody, linksError } from '../links.js';
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
    <p class="form-error" data-link-error role="alert" tabindex="-1" hidden></p>
    <div class="actions">
      <button type="submit" class="btn btn--primary">${SAVE}</button>
      <button type="button" class="btn" data-link-cancel>Cancel</button>
    </div>
  </form>`;
}

/**
 * The card, or nothing when there is no choice to make (a rest day, or nothing recorded). It has
 * one button that opens the editor: Change beside the heading when something counts, Link a
 * recorded session under the empty state when nothing does.
 */
export function actualSection(w, day) {
  if (!canLink(w, day)) return '';
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

/** Sends what is ticked. Null when it was stored, else why not: the limit, or the server's own words. */
async function sendLinks(workout, day, form) {
  const ticked = [...form.querySelectorAll('input[name=session]:checked')].map(box => box.value);
  const body = linksBody(linkCandidates(day, workout.id), ticked);
  const problem = linksError(body);
  if (problem) return problem;
  try {
    await api.put(`/api/workouts/${encodeURIComponent(workout.id)}/links`, body);
    return null;
  } catch (ex) { return ex.message; }
}

/**
 * Wire the card actualSection drew; true when it opened in the editor. `open` asks for that
 * (#/workout/<id>?link=1) and gets it only if there is a card. `onSaved` runs once a choice is
 * stored and should redraw the page; `onClosed` runs when the editor closes without one.
 */
export function wireActual(el, { workout, day, open = false, onSaved, onClosed }) {
  const section = el.querySelector('[data-actual]');
  if (!section) return false;
  const find = selector => section.querySelector(selector);
  const view = find('[data-actual-view]'), form = find('[data-link-form]'), error = find('[data-link-error]');
  const save = find('button[type=submit]'), cancel = find('[data-link-cancel]'), opener = find('[data-link-open]');

  const show = editing => { form.hidden = !editing; view.hidden = editing; opener.hidden = editing; };
  // Keyboard and screen reader land on the first box that can be ticked: its label reads the session out.
  const focusEditor = () => (form.querySelector('input[name=session]:not(:disabled)') || cancel).focus({ preventScroll: true });
  const close = () => {
    form.reset(); // back to what counts now, for the next time it opens
    error.hidden = true;
    show(false);
    opener.focus({ preventScroll: true });
    onClosed();
  };
  /** One attempt to save. Resolves to the refusal shown, or to null once the page has been redrawn. */
  const attempt = async () => {
    error.hidden = true;
    cancel.disabled = true;
    save.textContent = SAVING;
    const refusal = await sendLinks(workout, day, form);
    if (!refusal) {
      toast(SAVED, { kind: 'ok' });
      await onSaved(); // redraws the page, this form included, so "Saving…" stays until then
      return null;
    }
    cancel.disabled = false;
    save.textContent = SAVE;
    error.textContent = refusal; // the editor stays open with the ticks as they were
    error.hidden = false;
    return refusal;
  };

  opener.addEventListener('click', () => {
    // Focus moves before the button is hidden: coming from a button that was clicked or tapped
    // the box draws no focus ring, coming from one reached by keyboard it does.
    form.hidden = false;
    focusEditor();
    show(true);
  });
  cancel.addEventListener('click', close);
  form.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !save.disabled) { e.preventDefault(); close(); }
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    // After busy() has given the button back: focus left on a disabled control goes nowhere.
    if (await busy(save, attempt)) error.focus();
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
  return open;
}
