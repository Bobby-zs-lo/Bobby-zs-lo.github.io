// The thread with the coach on the Coach page: the messages, the line that says a reply is on
// its way, and the composer. js/views/reviews.js owns the data and the polling; this file draws
// and wires. The rules (what a message is about, how an outcome reads) are in js/coach.js.
import { html, raw, mount } from '../dom.js';
import { renderMarkdown } from '../markdown.js';
import { formatTimestamp } from '../format.js';
import { aboutLabel, aboutHref, outcomeLines, OUTCOME_TAGS, waitingState, foldThread, checkMessage, MAX_MESSAGE_CHARS } from '../coach.js';

const VISIBLE = 8;            // messages shown before "Show earlier"
const COUNT_FROM = 1600;      // the counter appears when the limit is near
const STARTERS = [
  'From now on I can’t run on Tuesdays.',
  'New sub-goal: a half marathon in April, in 1:45.',
  'Last week felt too easy. Can we build a little faster?',
];

/** The section with its empty parts; drawLog, drawWait and drawAbout fill them. */
export function threadFrame() {
  return html`<section class="card coach-thread" aria-labelledby="thread-h">
    <h2 class="section-title" id="thread-h">Talk to the coach</h2>
    <p class="help">Comment on the plan or on a review, say what should change, or set a new goal. The coach looks at what you actually ran before it answers, so a reply takes a few minutes.</p>
    <div class="coach-log" id="coach-log" role="log" aria-label="Conversation with the coach"></div>
    <div id="coach-wait"></div>
    <form class="coach-form" id="coach-form" novalidate>
      <div id="coach-about"></div>
      <label class="sr-only" for="coach-text">Message to the coach</label>
      <textarea id="coach-text" name="text" rows="3" maxlength="${MAX_MESSAGE_CHARS}" placeholder="Write to the coach" aria-describedby="coach-count"></textarea>
      <div class="coach-form-foot">
        <span class="help num" id="coach-count" aria-live="polite"></span>
        <button class="btn btn--primary" type="submit">Send</button>
      </div>
      <p class="form-error" id="coach-error" role="alert" hidden></p>
    </form>
  </section>`;
}

function aboutLine(about) {
  const label = aboutLabel(about);
  if (!label) return '';
  const href = aboutHref(about);
  return html`<p class="msg-about"><span class="msg-re">Re</span> ${href ? html`<a href="${href}">${label}</a>` : label}</p>`;
}

function outcome(result, lookup, proposal) {
  const lines = outcomeLines(result, lookup, proposal);
  if (!lines.length) return '';
  return html`<ul class="plain msg-outcome">${lines.map(l => html`<li class="out out--${l.kind}">
    <span class="out-tag">${OUTCOME_TAGS[l.kind]}</span>
    <span class="out-text">${l.text}${l.reason ? html`<span class="out-reason">${l.reason}</span>` : ''}</span>
  </li>`)}</ul>`;
}

function message(m, lookup, proposal) {
  const mine = m.role === 'user';
  // tabindex -1: "Show earlier" hands the focus to the first message it brought back.
  return html`<article class="msg msg--${mine ? 'user' : 'coach'}${mine && m.status === 'pending' ? ' is-pending' : ''}" data-msg="${m.id}" tabindex="-1">
    <p class="msg-meta"><span class="msg-who">${mine ? 'You' : 'Coach'}</span><time datetime="${m.createdAt}">${formatTimestamp(m.createdAt)}</time>${mine && m.status === 'pending' ? html`<span class="msg-state">Not answered yet</span>` : ''}</p>
    ${aboutLine(m.about)}
    <div class="msg-body md">${raw(renderMarkdown(m.text))}</div>
    ${mine ? '' : outcome(m.result, lookup, proposal)}
    ${!mine && proposal === 'pending' ? html`<p class="help"><a class="link" href="#r-proposals" data-to-proposals>Go to what needs your approval</a></p>` : ''}
  </article>`;
}

/**
 * `expanded` shows the whole thread; otherwise the last few, with a button for the rest.
 * `proposalOf(messageId)` says what became of the proposal a reply made (see outcomeLines).
 */
export function drawLog(el, messages, { lookup, expanded, proposalOf = () => null }) {
  const host = el.querySelector('#coach-log');
  if (!host) return;
  if (!messages.length) {
    mount(host, html`<div class="coach-empty">
      <p class="muted">Nothing said yet. You could start with:</p>
      <ul class="plain coach-starters">${STARTERS.map(s => html`<li><button type="button" class="starter" data-starter="${s}">${s}</button></li>`)}</ul>
    </div>`);
    return;
  }
  const { hidden, shown } = expanded ? { hidden: 0, shown: messages } : foldThread(messages, VISIBLE);
  mount(host, html`
    ${hidden ? html`<button type="button" class="btn btn--quiet coach-earlier" data-earlier>Show ${hidden} earlier message${hidden === 1 ? '' : 's'}</button>` : ''}
    ${shown.map(m => message(m, lookup, proposalOf(m.id)))}`);
}

export function drawWait(el, status) {
  const host = el.querySelector('#coach-wait');
  if (!host) return;
  const w = waitingState(status);
  mount(host, w.line ? html`<div class="coach-wait coach-wait--${status.state}" role="status">
    ${w.poll ? html`<span class="coach-dots" aria-hidden="true"><i></i><i></i><i></i></span>` : ''}
    <p>${w.line}</p>
    ${w.retry ? html`<button type="button" class="btn" data-retry>Try again</button>` : ''}
  </div>` : '');
}

/** The chip above the composer that says what the next message is about. */
export function drawAbout(el, about) {
  const host = el.querySelector('#coach-about');
  if (!host) return;
  const label = aboutLabel(about);
  mount(host, label ? html`<p class="coach-about">
    <span class="msg-re">About</span><span class="coach-about-label">${label}</span>
    <button type="button" class="chip-x" data-about-clear aria-label="Not about this after all">×</button>
  </p>` : '');
}

/** Puts the cursor in the composer and brings it into view. */
export function focusComposer(el) {
  const ta = el.querySelector('#coach-text');
  if (!ta) return;
  ta.focus({ preventScroll: true });
  ta.scrollIntoView({ block: 'center', behavior: 'instant' });
}

/**
 * Wires the section once. hooks: onSend(text) → resolves when the message is stored
 * (and rejects with the error to show), onRetry(button), onEarlier(), onAboutClear().
 */
export function wireThread(el, hooks) {
  const section = el.querySelector('.coach-thread');
  const form = el.querySelector('#coach-form');
  const ta = form.querySelector('#coach-text');
  const count = form.querySelector('#coach-count');
  const error = form.querySelector('#coach-error');
  const submit = form.querySelector('button[type=submit]');
  const showError = msg => { error.textContent = msg || ''; error.hidden = !msg; };
  const showCount = () => { count.textContent = ta.value.length >= COUNT_FROM ? `${ta.value.length} / ${MAX_MESSAGE_CHARS}` : ''; };

  ta.addEventListener('input', () => { showCount(); showError(''); });
  // Enter makes a new line, as in a letter; Ctrl or ⌘ with Enter sends.
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (submit.disabled) return;
    const checked = checkMessage(ta.value);
    if (checked.error) { showError(checked.error); ta.focus(); return; }
    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    try {
      await hooks.onSend(checked.text);
      // Only what was sent is taken away: the request can take seconds, and he may have typed on.
      if (ta.value.trim() === checked.text) ta.value = '';
      showCount();
      showError('');
    } catch (ex) {
      showError(ex.message);
    } finally {
      submit.disabled = false;
      submit.removeAttribute('aria-busy');
    }
  });

  section.addEventListener('click', e => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const starter = t.closest('[data-starter]');
    if (starter) { ta.value = starter.dataset.starter; showCount(); ta.focus(); return; }
    const retry = t.closest('[data-retry]');
    if (retry) { hooks.onRetry(retry); return; }
    if (t.closest('[data-earlier]')) { hooks.onEarlier(); return; }
    if (t.closest('[data-about-clear]')) { hooks.onAboutClear(); ta.focus(); return; }
    const jump = t.closest('[data-to-proposals]');
    if (jump) {
      e.preventDefault(); // '#r-proposals' is no route: scroll there instead of navigating
      const target = document.getElementById('r-proposals');
      if (target) target.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  });
  showCount();
}
