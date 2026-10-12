// The Coach page (#/reviews): what waits for Bobby's approval, the thread with the coach, his
// goals, the notes the coach keeps, the weekly reviews and the log of plan changes.
//
// The page is drawn in regions, each redrawn on its own and only when what it shows has changed,
// because a reply takes minutes: while one is awaited the page asks GET /api/coach every few
// seconds, and a whole redraw would take the words out of the composer and the focus off whatever
// he is on. #/reviews?about=workout:<id> opens with the composer set to that.
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
  // A backend from before the thread answers 404: the page then is what it was, proposals and reviews.
  const loadCoach = () => api.get('/api/coach').catch(e => { if (e.status === 404) return null; throw e; });
  try {
    [coach, { today }] = await Promise.all([loadCoach(), getState(), loadLists(), loadPlanLookup()]);
  } catch (e) {
    if (ctx.isCurrent()) errorState(el, e, () => render(el, ctx));
    return undefined;
  }
  if (!ctx.isCurrent()) return undefined;
  const hasCoach = !!coach;

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
  const shown = new Map();
  /** Mounts `tpl()` in a region unless `key` says the region already shows it. */
  const draw = (id, key, tpl) => {
    const k = JSON.stringify(key);
    if (shown.get(id) === k) return;
    shown.set(id, k);
    mount(region(id), tpl());
  };
  // Without a thread there is nobody to comment to.
  const comment = (what, label) => (hasCoach
    ? html`<button type="button" class="btn btn--quiet" data-comment="${what}" aria-label="${label}">Comment</button>` : '');
  let planStamp = 0; // counts reloads of the plan: changes are named after the plan as it is now

  const drawHead = () => {
    const main = hasCoach ? coach.goals.main : null;
    const days = main?.date ? diffDays(today, main.date) : null;
    draw('r-head', [main?.title, days], () => html`<header class="page-head">
      <p class="eyebrow">${main?.title || 'Training'}${days != null && days > 0 ? ` · ${days} days to go` : ''}</p>
      <h1>Coach</h1>
    </header>`);
  };

  const drawProposals = () => {
    const pending = (proposals || []).filter(p => p.status === 'pending');
    draw('r-proposals', [pending, planStamp], () => (pending.length ? html`<section aria-labelledby="prop-h" class="stack">
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
          ${comment(`proposal:${p.id}`, 'Comment on this proposal to the coach')}
        </div>
      </article>`)}
    </section>` : ''));
  };

  const drawReviews = () => {
    draw('r-reviews', reviews, () => html`<section aria-labelledby="rev-h" class="stack">
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
            ${comment(`review:${r.id}`, `Comment on the review of ${formatWeekRange(r.weekStart)} to the coach`)}
          </div>
        </article>`;
      }) : html`<div class="card"><p class="muted">No reviews yet. The first one arrives on Monday morning.</p></div>`}
    </section>`);
  };

  const drawChanges = () => {
    const undoId = undoableId(changesets);
    draw('r-changes', changesets, () => html`<section aria-labelledby="cs-h">
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

  // What became of the proposal a reply made, for the tag beside it in the thread.
  const proposalOf = id => (proposals || []).find(p => p.messageId === id)?.status ?? null;
  let logKey = null, waitKey = null;

  /** The thread and the line under it, each only when it would read differently. */
  const drawThread = () => {
    if (!hasCoach) return;
    const key = JSON.stringify([expanded, planStamp, coach.messages.map(m => [m.id, m.status ?? '', proposalOf(m.id)])]);
    if (key !== logKey) {
      logKey = key;
      drawLog(el, coach.messages, { lookup, expanded, proposalOf });
    }
    if (coach.status.state !== waitKey) {
      waitKey = coach.status.state;
      drawWait(el, coach.status);
    }
  };

  /** The two cards take the data in; `force` names the one whose own save this follows ('goals' or 'notes'). */
  const drawSides = (force = null) => {
    if (!hasCoach) return;
    goalsUi.set(coach.goals, today, { force: force === 'goals', plan: coach.plan || null });
    notesUi.set(coach.notes, { force: force === 'notes' });
  };

  /** The plan-side lists again: after a reply, an accept, a reject or an undo, any of them may have moved. */
  const reloadLists = async () => {
    await loadLists();
    patchState({ pendingProposals: proposals.filter(p => p.status === 'pending').length });
    try { await getPlan({ force: true }); } catch { /* the copy in memory still names the workouts */ }
    await loadPlanLookup();
    if (!ctx.isCurrent()) return;
    planStamp++;
    drawProposals();
    drawReviews();
    drawChanges();
    drawThread();
  };

  // ── the thread: taking in a new state, and asking again while a reply is awaited ──
  // Answers can arrive out of order (a poll that left before a send comes back after it). Each
  // request takes a number, and an answer older than one already taken in is dropped.
  let asked = 0, taken = 0;
  const ask = async request => {
    const id = ++asked;
    const value = await request();
    const stale = id < taken;
    if (!stale) taken = id;
    return { value, stale };
  };

  const takeCoach = async (next, { quiet = false, force = null } = {}) => {
    if (!ctx.isCurrent()) return;
    const fresh = newReplies(coach.messages, next.messages);
    coach = next;
    drawHead();
    drawThread();
    drawSides(force);
    schedule();
    if (!fresh.length) return;
    if (!quiet) toast('The coach replied', { kind: 'ok' });
    try { await reloadLists(); } catch { /* the lists are read again on the next visit */ }
  };
  const schedule = () => {
    clearTimeout(timer);
    if (hasCoach && ctx.isCurrent() && waitingState(coach.status).poll) timer = setTimeout(poll, POLL_MS);
  };
  const poll = async () => {
    if (!ctx.isCurrent()) return;
    if (document.hidden) { schedule(); return; }
    try {
      const { value, stale } = await ask(() => api.get('/api/coach'));
      if (stale) schedule(); else await takeCoach(value);
    } catch { schedule(); /* offline for a moment: ask again */ }
  };
  /** After a change of his own: the thread's state again. A reply that came in meanwhile counts as one. */
  const reloadCoach = async (force = null) => {
    if (!hasCoach) return;
    const { value, stale } = await ask(() => api.get('/api/coach'));
    if (!stale) await takeCoach(value, { force });
  };
  /** After a change that may have moved the race: the cached state holds its date and name too. */
  const reloadGoal = async () => {
    try { await getState({ force: true }); } catch { /* the next page load reads it again */ }
    await reloadCoach();
  };

  // ── the frame: built once; a change of layout only moves its parts ────────
  const slot = id => html`<div class="region" id="${id}"></div>`;
  mount(el, html`${slot('r-head')}${slot('r-proposals')}${hasCoach ? threadFrame() : ''}${slot('r-goals')}${slot('r-notes')}${slot('r-reviews')}${slot('r-changes')}`);
  const part = {
    proposals: region('r-proposals'), thread: el.querySelector('.coach-thread'), goals: region('r-goals'),
    notes: region('r-notes'), reviews: region('r-reviews'), changes: region('r-changes'),
  };
  const div = name => Object.assign(document.createElement('div'), { className: name });
  const cols = div('coach-cols'), main = div('coach-main'), side = div('coach-side');
  cols.append(main, side);
  const present = nodes => nodes.filter(Boolean); // the thread is not there on a backend without it

  /**
   * One column on a phone, in the order he needs it; two on a desk, with what needs him beside the
   * thread. The parts are moved, never redrawn, so a half-written message or goal survives a resize.
   */
  const arrange = () => {
    const focused = document.activeElement;
    if (isDesk()) {
      main.append(...present([part.thread, part.reviews]));
      side.append(part.proposals, part.goals, part.notes, part.changes);
      el.append(cols);
    } else {
      cols.remove();
      el.append(...present([part.proposals, part.thread, part.goals, part.notes, part.reviews, part.changes]));
    }
    // Moving an element takes the focus off it.
    if (focused instanceof HTMLElement && el.contains(focused) && document.activeElement !== focused) focused.focus({ preventScroll: true });
  };

  const wireThreadPart = () => wireThread(el, {
    onSend: async text => {
      const { value: res, stale } = await ask(() => api.post('/api/coach/messages', about ? { text, about: { type: about.type, id: about.id } } : { text }));
      // The message is stored. What follows only redraws, and must not come back to him as "not sent".
      about = null;
      drawAbout(el, null);
      expanded = false;
      if (!stale) await takeCoach(res, { quiet: true }).catch(() => {});
      if (res.fire && res.fire.reason === 'fire_failed') toast('Saved, but the coach could not be started. Try again in a moment.', { kind: 'error', ms: 6000 });
    },
    onRetry: btn => busy(btn, async () => {
      try {
        const { value: res, stale } = await ask(() => api.post('/api/coach/retry'));
        if (!stale) await takeCoach(res, { quiet: true });
        if (res.fire && !res.fire.fired && res.fire.reason !== 'in_flight') {
          toast(res.fire.reason === 'too_soon' ? 'Give it a few seconds, then try again.' : 'The coach could not be started. Try again in a few minutes.', { kind: 'error', ms: 6000 });
        }
        if (!el.querySelector('[data-retry]')) focusComposer(el); // the button went with the wait
      } catch (ex) { toast(ex.message, { kind: 'error' }); }
    }),
    onEarlier: () => {
      expanded = true;
      drawThread();
      el.querySelector('#coach-log .msg')?.focus(); // the button is gone: on to the oldest message
    },
    onAboutClear: () => { about = null; drawAbout(el, null); },
  });

  const wire = () => {
    if (hasCoach) wireThreadPart();

    // Comment on a review or a proposal: the composer takes it from there.
    for (const host of [part.proposals, part.reviews]) {
      host.addEventListener('click', e => {
        const b = e.target instanceof Element && e.target.closest('[data-comment]');
        if (b) setAbout(parseAbout(b.dataset.comment));
      });
    }
    part.proposals.addEventListener('click', e => {
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
    part.changes.addEventListener('click', e => {
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
  const onVisible = () => { if (!ctx.isCurrent()) stop(); else if (hasCoach && !document.hidden && waitingState(coach.status).poll) poll(); };
  const stop = () => {
    clearTimeout(timer);
    window.removeEventListener('layout:change', onLayout);
    document.removeEventListener('visibilitychange', onVisible);
  };
  window.addEventListener('layout:change', onLayout);
  document.addEventListener('visibilitychange', onVisible);

  arrange();
  if (hasCoach) {
    goalsUi = goalsCard(part.goals, {
      onChanged: () => reloadCoach('goals'), onAbout: a => setAbout(a),
      // Every future week again: the plan, its log of changes and how it stands to the goals all move.
      onRebuild: async () => { await api.post('/api/plan/rebuild'); await reloadLists(); await reloadCoach('goals'); },
    });
    notesUi = notesCard(part.notes, { onChanged: () => reloadCoach('notes') });
  }
  drawHead();
  drawProposals();
  drawThread();
  drawSides();
  drawReviews();
  drawChanges();
  wire();
  if (hasCoach) setAbout(parseAbout(ctx.params.about), { focus: !!ctx.params.about });
  schedule();
  return stop;
}
