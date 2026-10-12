// The Coach page (#/reviews): what waits for Bobby's approval, the thread with the coach, his
// goals, the notes the coach keeps, the weekly reviews and the log of plan changes.
//
// The page is drawn in regions, each redrawn on its own, because a reply takes minutes: while one
// is awaited the page asks GET /api/coach every few seconds, and a whole redraw would take the
// words out of the composer. #/reviews?about=workout:<id> opens with the composer set to that.
import { html, raw, mount } from '../dom.js';
import { api } from '../api.js';
import { getState, getPlan, patchState } from '../store.js';
import { isDesk } from '../layout.js';
import { clearParams } from '../router.js';
import { loading, errorState, toast, busy } from '../ui.js';
import { formatWeekRange, formatTimestamp, diffDays } from '../format.js';
import { renderMarkdown } from '../markdown.js';
import { describeChange, undoableId, parseReviewBody } from '../changes.js';
import { parseAbout, waitingState, newReplies, POLL_MS, MAIN_GOAL } from '../coach.js';
import { threadFrame, drawLog, drawWait, drawAbout, wireThread, focusComposer } from './coach-thread.js';
import { goalsCard, notesCard } from './coach-goals.js';

const VERDICTS = { on_track: 'On track', minor_deviation: 'Minor deviation', major_deviation: 'Major deviation' };
const SOURCES = { review: 'Weekly review', user: 'You', proposal: 'Accepted proposal', coach: 'Coach' };

export async function render(el, ctx) {
  loading(el, 'Loading the coach');
  let proposals, reviews, changesets, coach, today, lookup = () => undefined;
  const loadPlanLookup = async () => {
    try {
      const plan = await getPlan();
      const idx = new Map(plan.weeks.flatMap(w => w.workouts).map(w => [w.id, w]));
      lookup = id => idx.get(id);
    } catch { /* titles fall back to the id */ }
  };
  const loadLists = async () => {
    [proposals, reviews, changesets] = await Promise.all([api.get('/api/proposals'), api.get('/api/reviews'), api.get('/api/changesets')]);
  };
  try {
    [coach, { today }] = await Promise.all([api.get('/api/coach'), getState(), loadLists(), loadPlanLookup()]);
  } catch (e) {
    if (ctx.isCurrent()) errorState(el, e, () => render(el, ctx));
    return undefined;
  }
  if (!ctx.isCurrent()) return undefined;

  // What the next message is about: from the address once, then from the Comment buttons.
  let about = null, expanded = false, timer = null, goalsUi = null, notesUi = null;
  if (ctx.params.about) clearParams();

  /** A bare { type, id } gains the title and date the label needs, from what the page already holds. */
  const fillAbout = a => {
    if (!a) return null;
    if (a.type === 'workout') { const w = lookup(a.id); return w ? { ...a, title: w.title, date: w.date } : a; }
    if (a.type === 'review') { const r = (reviews || []).find(x => x.id === a.id); return r ? { ...a, weekStart: r.weekStart } : a; }
    if (a.type === 'proposal') { const p = (proposals || []).find(x => x.id === a.id); return p ? { ...a, summary: p.summary } : a; }
    if (a.type === 'goal') { const g = a.id === MAIN_GOAL ? coach.goals.main : coach.goals.items.find(x => x.id === a.id); return g ? { ...a, title: g.title } : a; }
    return a;
  };
  const setAbout = (a, { focus = true } = {}) => {
    about = fillAbout(a);
    drawAbout(el, about);
    if (focus) focusComposer(el);
  };

  // ── regions ───────────────────────────────────────────────────────────────
  const region = id => el.querySelector(`#${id}`);

  const drawProposals = () => {
    const pending = (proposals || []).filter(p => p.status === 'pending');
    mount(region('r-proposals'), pending.length ? html`<section aria-labelledby="prop-h" class="stack">
      <h2 class="section-title" id="prop-h">Awaiting your approval</h2>
      ${pending.map(p => html`<article class="card proposal" data-id="${p.id}">
        <p class="eyebrow">Proposal · ${formatTimestamp(p.createdAt)}</p>
        ${p.summary ? html`<div class="md">${raw(renderMarkdown(p.summary))}</div>` : ''}
        <ul class="changes">${(p.changes || []).map(c => html`<li>
          <span>${describeChange(c, lookup)}</span>
          ${c.reason ? html`<span class="change-reason">${c.reason}</span>` : ''}
        </li>`)}</ul>
        <div class="actions">
          <button type="button" class="btn btn--primary" data-accept>Accept</button>
          <button type="button" class="btn" data-reject>Reject</button>
          <button type="button" class="btn btn--quiet" data-comment="proposal:${p.id}">Comment</button>
        </div>
      </article>`)}
    </section>` : '');
  };

  const drawReviews = () => {
    mount(region('r-reviews'), html`<section aria-labelledby="rev-h" class="stack">
      <h2 class="section-title" id="rev-h">Weekly reviews</h2>
      ${(reviews || []).length ? reviews.map((r, i) => {
        const b = parseReviewBody(r.body);
        const ad = b.adherence || {};
        return html`<article class="card review${i === 0 ? ' is-latest' : ''}">
          <div class="review-top">
            <p class="eyebrow">Week of ${formatWeekRange(r.weekStart)}</p>
            ${ad.verdict ? html`<span class="badge badge--${ad.verdict}"><span class="num">${ad.score ?? '–'}</span> · ${VERDICTS[ad.verdict] || ad.verdict}</span>` : ''}
          </div>
          <h3 class="review-headline">${b.headline || 'Weekly review'}</h3>
          ${b.summary ? html`<div class="md">${raw(renderMarkdown(b.summary))}</div>` : ''}
          ${(b.observations || []).length ? html`<h4 class="mini-h">Observations</h4><ul class="bullets">${b.observations.map(o => html`<li>${o}</li>`)}</ul>` : ''}
          ${(b.riskFlags || []).length ? html`<h4 class="mini-h mini-h--risk">Risk flags</h4><ul class="bullets bullets--risk">${b.riskFlags.map(o => html`<li>${o}</li>`)}</ul>` : ''}
          ${b.goalAssessment ? html`<h4 class="mini-h">Goal</h4><p>${b.goalAssessment}</p>` : ''}
          <div class="review-foot">
            <p class="help">${formatTimestamp(r.createdAt)}</p>
            <button type="button" class="btn btn--sm btn--quiet" data-comment="review:${r.id}">Comment</button>
          </div>
        </article>`;
      }) : html`<div class="card"><p class="muted">No reviews yet. The first one arrives on Monday morning.</p></div>`}
    </section>`);
  };

  const drawChanges = () => {
    const undoId = undoableId(changesets);
    mount(region('r-changes'), html`<section aria-labelledby="cs-h">
      <h2 class="section-title" id="cs-h">Plan changes</h2>
      ${(changesets || []).length ? html`<ul class="plain card changesets">${changesets.map(c => html`<li class="cs${c.undone ? ' is-undone' : ''}" data-id="${c.id}">
        <div class="cs-main">
          <span class="cs-summary">${c.summary || 'Plan change'}</span>
          <span class="cs-meta">${SOURCES[c.source] || c.source} · ${formatTimestamp(c.createdAt)}${c.undone ? ' · undone' : ''}</span>
        </div>
        ${c.id === undoId ? html`<button type="button" class="btn btn--sm" data-undo>Undo</button>` : ''}
      </li>`)}</ul>` : html`<p class="muted">No changes yet.</p>`}
    </section>`);
  };

  const drawThread = () => {
    drawLog(el, coach.messages, { lookup, expanded });
    drawWait(el, coach.status);
  };

  // The cards keep a form he is filling in over a redraw, unless it is forced (after his own save).
  const drawSides = ({ force = false } = {}) => {
    goalsUi.set(coach.goals, today, { force });
    notesUi.set(coach.notes, { force });
  };

  /** The plan-side lists again: after a reply, an accept, a reject or an undo, any of them may have moved. */
  const reloadLists = async () => {
    await loadLists();
    patchState({ pendingProposals: proposals.filter(p => p.status === 'pending').length });
    try { await getPlan({ force: true }); } catch { /* the copy in memory still names the workouts */ }
    await loadPlanLookup();
    if (!ctx.isCurrent()) return;
    drawProposals();
    drawReviews();
    drawChanges();
  };

  // ── the thread: taking in a new state, and asking again while a reply is awaited ──
  const takeCoach = async (next, { quiet = false } = {}) => {
    const fresh = newReplies(coach.messages, next.messages);
    coach = next;
    drawThread();
    drawSides();
    if (fresh.length) {
      if (!quiet) toast('The coach replied', { kind: 'ok' });
      await reloadLists();
      if (ctx.isCurrent()) drawThread(); // a reply's changes are named after the plan as it is now
    }
    schedule();
  };
  const schedule = () => {
    clearTimeout(timer);
    if (ctx.isCurrent() && waitingState(coach.status).poll) timer = setTimeout(poll, POLL_MS);
  };
  const poll = async () => {
    if (!ctx.isCurrent()) return;
    if (document.hidden) { schedule(); return; }
    try { await takeCoach(await api.get('/api/coach')); } catch { schedule(); /* offline for a moment: ask again */ }
  };
  const reloadCoach = async () => {
    const next = await api.get('/api/coach');
    if (!ctx.isCurrent()) return;
    coach = next;
    drawThread();
    drawSides({ force: true });
    schedule();
  };

  /** After a change that may have moved the race: the cached state holds its date and name too. */
  const reloadGoal = async () => {
    try { await getState({ force: true }); } catch { /* the next page load reads it again */ }
    await reloadCoach();
  };

  // ── the frame: built once; a change of layout only moves its parts ────────
  const days = coach.goals.main?.date ? diffDays(today, coach.goals.main.date) : null;
  const slot = id => html`<div class="region" id="${id}"></div>`;
  mount(el, html`<header class="page-head">
      <p class="eyebrow">${coach.goals.main?.title || 'Training'}${days != null && days > 0 ? ` · ${days} days to go` : ''}</p>
      <h1>Coach</h1>
    </header>
    ${slot('r-proposals')}${threadFrame()}${slot('r-goals')}${slot('r-notes')}${slot('r-reviews')}${slot('r-changes')}`);
  const part = {
    proposals: region('r-proposals'), thread: el.querySelector('.coach-thread'), goals: region('r-goals'),
    notes: region('r-notes'), reviews: region('r-reviews'), changes: region('r-changes'),
  };
  const div = name => Object.assign(document.createElement('div'), { className: name });
  const cols = div('coach-cols'), main = div('coach-main'), side = div('coach-side');
  cols.append(main, side);

  /**
   * One column on a phone, in the order he needs it; two on a desk, with what needs him beside the
   * thread. The parts are moved, never redrawn, so a half-written message or goal survives a resize.
   */
  const arrange = () => {
    const focused = document.activeElement;
    if (isDesk()) {
      main.append(part.thread, part.reviews);
      side.append(part.proposals, part.goals, part.notes, part.changes);
      el.append(cols);
    } else {
      cols.remove();
      el.append(part.proposals, part.thread, part.goals, part.notes, part.reviews, part.changes);
    }
    // Moving an element takes the focus off it.
    if (focused instanceof HTMLElement && el.contains(focused) && document.activeElement !== focused) focused.focus({ preventScroll: true });
  };

  const wire = () => {
    wireThread(el, {
      onSend: async text => {
        const res = await api.post('/api/coach/messages', about ? { text, about: { type: about.type, id: about.id } } : { text });
        about = null;
        drawAbout(el, null);
        expanded = false;
        await takeCoach(res, { quiet: true });
        if (res.fire && res.fire.reason === 'fire_failed') toast('Saved, but the coach could not be started. Try again in a moment.', { kind: 'error', ms: 6000 });
      },
      onRetry: btn => busy(btn, async () => {
        try {
          const res = await api.post('/api/coach/retry');
          await takeCoach(res, { quiet: true });
          if (res.fire && !res.fire.fired && res.fire.reason !== 'in_flight') toast('The coach could not be started. Try again in a few minutes.', { kind: 'error', ms: 6000 });
        } catch (ex) { toast(ex.message, { kind: 'error' }); }
      }),
      onEarlier: () => { expanded = true; drawThread(); },
      onAboutClear: () => { about = null; drawAbout(el, null); },
    });

    // Comment on a review or a proposal: the composer takes it from there.
    for (const id of ['r-proposals', 'r-reviews']) {
      region(id).addEventListener('click', e => {
        const b = e.target instanceof Element && e.target.closest('[data-comment]');
        if (b) setAbout(parseAbout(b.dataset.comment));
      });
    }
    region('r-proposals').addEventListener('click', e => {
      const btn = e.target instanceof Element && e.target.closest('[data-accept], [data-reject]');
      if (!btn) return;
      const id = btn.closest('.proposal').dataset.id;
      const accept = btn.matches('[data-accept]');
      busy(btn, async () => {
        try {
          const res = await api.post(`/api/proposals/${encodeURIComponent(id)}/${accept ? 'accept' : 'reject'}`);
          const rej = accept && res && Array.isArray(res.rejected) ? res.rejected.length : 0;
          toast(!accept ? 'Rejected. The plan stays as it is.'
            : rej ? `Accepted. ${rej} change${rej === 1 ? ' was' : 's were'} no longer valid and skipped.` : 'Accepted. The plan is updated.', accept ? { kind: 'ok' } : {});
          await reloadLists();
          if (accept) await reloadGoal(); // an accepted move of the race changes the main goal
        } catch (ex) { toast(ex.message, { kind: 'error' }); }
      });
    });
    region('r-changes').addEventListener('click', e => {
      const undo = e.target instanceof Element && e.target.closest('[data-undo]');
      if (!undo) return;
      busy(undo, async () => {
        try {
          await api.post(`/api/changesets/${encodeURIComponent(undo.closest('[data-id]').dataset.id)}/undo`);
          toast('Change undone', { kind: 'ok' });
          await reloadLists();
          await reloadGoal(); // undoing a moved race moves it back
        } catch (ex) {
          toast(ex.status === 409 ? 'Only the most recent change can be undone.' : ex.message, { kind: 'error' });
        }
      });
    });
  };

  // Listeners outside the view take themselves away once another page has it.
  const onLayout = () => { if (ctx.isCurrent()) arrange(); else stop(); };
  const onVisible = () => { if (!ctx.isCurrent()) stop(); else if (!document.hidden && waitingState(coach.status).poll) poll(); };
  const stop = () => {
    clearTimeout(timer);
    window.removeEventListener('layout:change', onLayout);
    document.removeEventListener('visibilitychange', onVisible);
  };
  window.addEventListener('layout:change', onLayout);
  document.addEventListener('visibilitychange', onVisible);

  arrange();
  goalsUi = goalsCard(part.goals, { onChanged: reloadCoach, onAbout: a => setAbout(a) });
  notesUi = notesCard(part.notes, { onChanged: reloadCoach });
  drawProposals();
  drawThread();
  drawSides({ force: true });
  drawReviews();
  drawChanges();
  wire();
  setAbout(parseAbout(ctx.params.about), { focus: !!ctx.params.about });
  schedule();
  return stop;
}
