import { html, raw, mount } from '../dom.js';
import { api } from '../api.js';
import { getState, getPlan, patchState } from '../store.js';
import { loading, errorState, toast, busy } from '../ui.js';
import { formatDate, formatWeekRange, formatTimestamp } from '../format.js';
import { renderMarkdown } from '../markdown.js';
import { describeChange, undoableId, parseReviewBody } from '../changes.js';

const VERDICTS = { on_track: 'On track', minor_deviation: 'Minor deviation', major_deviation: 'Major deviation' };
const SOURCES = { review: 'Weekly review', user: 'You', proposal: 'Accepted proposal' };

export async function render(el, ctx) {
  loading(el, 'Loading reviews');
  let proposals, reviews, changesets, lookup = () => undefined;
  const load = async () => {
    [proposals, reviews, changesets] = await Promise.all([
      api.get('/api/proposals'), api.get('/api/reviews'), api.get('/api/changesets'),
    ]);
    try {
      const plan = await getPlan();
      const idx = new Map(plan.weeks.flatMap(w => w.workouts).map(w => [w.id, w]));
      lookup = id => idx.get(id);
    } catch { /* titles fall back to the id */ }
  };
  try { await load(); } catch (e) {
    if (ctx.isCurrent()) errorState(el, e, () => render(el, ctx));
    return;
  }
  if (!ctx.isCurrent()) return;

  const draw = () => {
    const pending = (proposals || []).filter(p => p.status === 'pending');
    const undoId = undoableId(changesets);
    mount(el, html`
      <header class="page-head">
        <p class="eyebrow">Coach</p>
        <h1>Reviews</h1>
      </header>
      ${pending.length ? html`<section aria-labelledby="prop-h" class="stack">
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
          </div>
        </article>`)}
      </section>` : ''}
      <section aria-labelledby="rev-h" class="stack">
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
            <p class="help">${formatTimestamp(r.createdAt)}</p>
          </article>`;
        }) : html`<div class="card"><p class="muted">No reviews yet. The first one arrives on Monday morning.</p></div>`}
      </section>
      <section aria-labelledby="cs-h">
        <h2 class="section-title" id="cs-h">Plan changes</h2>
        ${(changesets || []).length ? html`<ul class="plain card changesets">${changesets.map(c => html`<li class="cs${c.undone ? ' is-undone' : ''}" data-id="${c.id}">
          <div class="cs-main">
            <span class="cs-summary">${c.summary || 'Plan change'}</span>
            <span class="cs-meta">${SOURCES[c.source] || c.source} · ${formatTimestamp(c.createdAt)}${c.undone ? ' · undone' : ''}</span>
          </div>
          ${c.id === undoId ? html`<button type="button" class="btn btn--sm" data-undo>Undo</button>` : ''}
        </li>`)}</ul>` : html`<p class="muted">No changes yet.</p>`}
      </section>
    `);
    wire();
  };

  const refresh = async () => {
    await load();
    patchState({ pendingProposals: proposals.filter(p => p.status === 'pending').length });
    getPlan({ force: true }).catch(() => {});
    if (ctx.isCurrent()) draw();
  };

  const wire = () => {
    el.querySelectorAll('.proposal').forEach(card => {
      const id = card.dataset.id;
      card.querySelector('[data-accept]').addEventListener('click', e => busy(e.currentTarget, async () => {
        try {
          const res = await api.post(`/api/proposals/${encodeURIComponent(id)}/accept`);
          const rej = res && Array.isArray(res.rejected) ? res.rejected.length : 0;
          toast(rej ? `Accepted. ${rej} change${rej === 1 ? ' was' : 's were'} no longer valid and skipped.` : 'Accepted. The plan is updated.', { kind: 'ok' });
          await refresh();
        } catch (ex) { toast(ex.message, { kind: 'error' }); }
      }));
      card.querySelector('[data-reject]').addEventListener('click', e => busy(e.currentTarget, async () => {
        try {
          await api.post(`/api/proposals/${encodeURIComponent(id)}/reject`);
          toast('Rejected. The plan stays as it is.');
          await refresh();
        } catch (ex) { toast(ex.message, { kind: 'error' }); }
      }));
    });
    const undo = el.querySelector('[data-undo]');
    if (undo) undo.addEventListener('click', () => busy(undo, async () => {
      const id = undo.closest('[data-id]').dataset.id;
      try {
        await api.post(`/api/changesets/${encodeURIComponent(id)}/undo`);
        toast('Change undone', { kind: 'ok' });
        await refresh();
      } catch (ex) {
        toast(ex.status === 409 ? 'Only the most recent change can be undone.' : ex.message, { kind: 'error' });
      }
    }));
  };

  draw();
}
