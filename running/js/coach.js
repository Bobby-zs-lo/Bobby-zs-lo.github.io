// The thread with the coach, as pure logic: what a message is about, how a reply's outcome
// reads, what the page says while a reply is awaited, and how goals are written and read.
// No DOM and no network, so tests/coach.test.mjs can hold it to its word. The views are
// js/views/coach-thread.js and js/views/coach-goals.js.
import { formatDate, formatWeekRange, formatDistance, formatMmSs, diffDays } from './format.js';
import { describeChange } from './changes.js';

export const MAX_MESSAGE_CHARS = 2000;
export const MAX_NOTE_CHARS = 240;
export const POLL_MS = 8000;
export const MAIN_GOAL = 'main';
const ABOUT_TYPES = ['workout', 'review', 'proposal', 'goal'];

// ── what a message is about ─────────────────────────────────────────────────

/** '?about=workout:w-2026-10-22-run' → { type: 'workout', id: 'w-2026-10-22-run' }; 'plan' → { type: 'plan' }; else null. */
export function parseAbout(param) {
  const s = String(param || '');
  if (s === 'plan') return { type: 'plan' };
  const cut = s.indexOf(':');
  const type = s.slice(0, cut), id = s.slice(cut + 1);
  return cut > 0 && ABOUT_TYPES.includes(type) && id ? { type, id } : null;
}

export const aboutParam = about => (about.type === 'plan' ? 'plan' : `${about.type}:${about.id}`);

/** The line that says what a message is about. `about` is the server's (it carries titles and dates) or a bare { type, id }. */
export function aboutLabel(about) {
  if (!about) return '';
  switch (about.type) {
    case 'plan': return 'The plan as a whole';
    case 'workout': return about.title ? `${about.title}, ${formatDate(about.date)}` : 'A planned session';
    case 'review': return about.weekStart ? `Review of ${formatWeekRange(about.weekStart)}` : 'A weekly review';
    case 'proposal': return about.summary ? `Proposal: ${about.summary}` : 'A proposal';
    case 'goal': return about.title ? `Goal: ${about.title}` : 'A goal';
    default: return '';
  }
}

/** Where the thing a message is about can be opened, or null when it has no page of its own. */
export const aboutHref = about => (about && about.type === 'workout' && about.id ? `#/workout/${encodeURIComponent(about.id)}` : null);

// ── a reply's outcome ───────────────────────────────────────────────────────

const GOAL_VERBS = { add: 'Goal added', update: 'Goal updated', remove: 'Goal removed' };
const NOTE_VERBS = { add: 'Noted', remove: 'Note dropped' };

function goalText(a) {
  const g = a.goal || {};
  const name = g.id === MAIN_GOAL ? 'the marathon' : g.title || 'a goal';
  const target = g.targetSeconds ? `, target ${formatMmSs(g.targetSeconds)}` : '';
  const state = a.op === 'update' && g.status && g.status !== 'active' ? ` (${g.status})` : '';
  return `${GOAL_VERBS[a.op] || 'Goal changed'}: ${name}${a.op === 'remove' ? '' : target}${state}`;
}

/**
 * What a reply did, one line each, in the order Bobby needs it: what waits for him, what changed,
 * what could not be done. `lookup(id)` finds a workout in the plan for its title. `proposal` is
 * what became of the reply's proposal: 'pending', 'accepted', 'rejected', or null when the page
 * no longer knows (the list of proposals holds only the latest).
 * → [{ kind: 'waiting' | 'proposed' | 'accepted' | 'declined' | 'applied' | 'goal' | 'note' | 'rejected', text, reason }]
 */
export function outcomeLines(result, lookup, proposal = null) {
  if (!result) return [];
  const change = (kind, c, reason) => ({ kind, text: describeChange(c, lookup), reason: reason || null });
  const proposed = PROPOSAL_KINDS[proposal] || 'proposed';
  return [
    ...(result.proposed || []).map(c => change(proposed, c, c.reason)),
    ...(result.applied || []).map(c => change('applied', c, c.reason)),
    ...((result.goals && result.goals.applied) || []).map(a => ({ kind: 'goal', text: goalText(a), reason: null })),
    ...((result.notes && result.notes.applied) || []).map(a => ({ kind: 'note', text: `${NOTE_VERBS[a.op] || 'Note'}: “${(a.note && a.note.text) || ''}”`, reason: null })),
    ...(result.rejected || []).map(r => change('rejected', r.change, r.error)),
    ...((result.goals && result.goals.rejected) || []).map(r => ({ kind: 'rejected', text: 'A goal change', reason: r.error })),
    ...((result.notes && result.notes.rejected) || []).map(r => ({ kind: 'rejected', text: 'A note change', reason: r.error })),
  ];
}

const PROPOSAL_KINDS = { pending: 'waiting', accepted: 'accepted', rejected: 'declined' };
export const OUTCOME_TAGS = {
  waiting: 'Needs you', proposed: 'Proposed', accepted: 'Accepted', declined: 'Declined',
  applied: 'Done', goal: 'Goal', note: 'Note', rejected: 'Not possible',
};

// ── waiting for a reply ─────────────────────────────────────────────────────

/**
 * What the thread says and does for a status of GET /api/coach.
 * → { line, poll, retry }: the text under the thread (null when nothing waits), whether to ask
 * again in POLL_MS, and whether to offer "Try again".
 */
export function waitingState(status) {
  switch (status && status.state) {
    case 'thinking':
      return { line: 'The coach is reading. A reply usually takes two to three minutes, and you get a notification when it is in.', poll: true, retry: false };
    case 'stalled':
      return { line: 'No reply yet. The coach did not start, or took too long.', poll: false, retry: true };
    case 'offline':
      return { line: 'Saved. Chat is not connected yet, so the coach answers with the next weekly review.', poll: false, retry: false };
    default:
      return { line: null, poll: false, retry: false };
  }
}

/** The ids of the coach's messages in `after` that `before` did not have: a reply came in. */
export function newReplies(before, after) {
  const seen = new Set((before || []).map(m => m.id));
  return (after || []).filter(m => m.role === 'coach' && !seen.has(m.id)).map(m => m.id);
}

/** The newest `visible` messages, and how many older ones stay folded away. */
export function foldThread(messages, visible) {
  const all = messages || [];
  const hidden = Math.max(0, all.length - visible);
  return { hidden, shown: all.slice(hidden) };
}

/** The message as it will be sent, or the reason it cannot be. */
export function checkMessage(text) {
  const t = String(text || '').trim();
  if (!t) return { error: 'Write something first.' };
  if (t.length > MAX_MESSAGE_CHARS) return { error: `That is ${t.length} characters; a message can hold ${MAX_MESSAGE_CHARS}.` };
  return { text: t };
}

// ── goals ───────────────────────────────────────────────────────────────────

/** 'in 188 days', 'tomorrow', 'today', '12 days ago'; '' without a date. */
export function countdown(date, today) {
  if (!date || !today) return '';
  const d = diffDays(today, date);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return 'yesterday';
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

/** The facts of a goal on one line: 'Sun 18 Apr 2027 · in 188 days · 21.1 km · target 1:45:00'. */
export function goalFacts(goal, today) {
  return [
    goal.date && formatDate(goal.date, { year: true }),
    goal.status !== 'achieved' && goal.status !== 'dropped' && countdown(goal.date, today),
    goal.distanceKm ? formatDistance(Math.round(goal.distanceKm * 10) / 10) : null,
    goal.targetSeconds ? `target ${formatMmSs(goal.targetSeconds)}` : null,
  ].filter(Boolean).join(' · ');
}

/** Active goals by date (dated first), then the achieved and the dropped. */
export function sortGoals(items) {
  const rank = g => (g.status === 'active' ? 0 : g.status === 'achieved' ? 1 : 2);
  return [...(items || [])].sort((a, b) =>
    rank(a) - rank(b) || (a.date ? 0 : 1) - (b.date ? 0 : 1) || String(a.date || '').localeCompare(String(b.date || '')) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

/**
 * A goal form's fields as the API wants them. → { body } or { error, field }.
 * `values`: { title, kind, date, distanceKm, target, note } as typed. An empty optional field is null.
 */
export function goalFromForm(values) {
  const title = String(values.title || '').trim();
  if (!title) return { error: 'Give the goal a name.', field: 'title' };
  if (title.length > 80) return { error: 'The name can be 80 characters at most.', field: 'title' };
  const body = { title, kind: values.kind === 'race' ? 'race' : 'milestone', date: values.date || null, distanceKm: null, targetSeconds: null, note: String(values.note || '').trim() || null };
  const km = String(values.distanceKm || '').trim().replace(',', '.');
  if (km) {
    const n = Number(km);
    if (!Number.isFinite(n) || n < 0.1 || n > 500) return { error: 'Enter the distance in kilometres, e.g. 21.1.', field: 'distanceKm' };
    body.distanceKm = n;
  }
  const target = parseTarget(values.target);
  if (target.error) return { error: target.error, field: 'target' };
  body.targetSeconds = target.seconds;
  if (body.note && body.note.length > 300) return { error: 'The note can be 300 characters at most.', field: 'note' };
  return { body };
}

/**
 * A target time as the goal form holds it: always h:mm:ss, typed as digits on a number pad with
 * the colons filled in (maskTime with HMS). '1:45:00' → { seconds: 6300 }; '0:22:30' → 1350;
 * a time stopped after the minutes is taken as whole minutes ('1:45' → 1:45:00), after the hour
 * as whole hours; '' → { seconds: null }; anything else → { error }.
 */
export function parseTarget(str) {
  const digits = String(str || '').replace(/\D/g, '');
  if (!digits) return { seconds: null };
  const error = { error: 'Enter the time as h:mm:ss. Type the digits only: 14500 gives 1:45:00, 02230 gives 0:22:30.' };
  if (![1, 3, 5].includes(digits.length)) return error;
  const [h, m, s] = [digits.slice(0, 1), digits.slice(1, 3) || '0', digits.slice(3, 5) || '0'].map(Number);
  const seconds = h * 3600 + m * 60 + s;
  return m > 59 || s > 59 || seconds < 10 ? error : { seconds };
}
