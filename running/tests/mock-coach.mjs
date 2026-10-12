// The coach half of the mock API (tests/mock-api.mjs): the thread with the coach, Bobby's goals
// and the notes the coach keeps.
//
// Contract (the backend's; functions/src/coach.js and coach-data.js in Running-with-Claude, spec
// docs/superpowers/specs/2026-10-12-coach-chat-design.md): GET /api/coach is { messages, status,
// goals: { main, items }, notes }; POST /api/coach/messages { text, about? } stores a message and
// answers with that view plus { sent, fire }; POST /api/coach/retry; POST and DELETE
// /api/coach/notes; POST, PUT and DELETE /api/goals. The checks and their words follow the backend,
// because the front end shows them as they come.
//
// There is no routine behind a mock, so a canned coach stands in. A message is "read" for
// `replyDelayMs` (status thinking); the first request after that finds the reply. What it says
// depends on a few words in the message, so every kind of outcome can be looked at:
//   goal, mål, half, halv   → adds a half-marathon goal
//   tuesday, tirsdag        → adds a note
//   easier, shorter, kortere → reports one applied plan change (the mock's plan itself stays as it is)
//   impossible, umulig      → reports one change that was refused
//   silence, stilhed        → no reply: the status turns stalled, and Try again gets one
// GET /api/coach also carries `plan`: { stale, events, notInPlan }, how the plan stands to the goals.
// The mock has no generator, so "the plan" here is only what it was last built for: stale turns
// true when the main target or a dated goal with a distance has changed since, and POST
// /api/plan/rebuild makes it current again. Each goal's outlook is worked out with Riegel's rule of
// thumb from the 5K time, which is close to the backend's VDOT figures and nothing more.
// Everything lives in the store made here, one per mock; the fixtures are never written.

const MAX_MESSAGE_CHARS = 2000;
const MAX_PENDING = 10;
const MAX_GOALS = 12;
const MAX_NOTES = 20;
const MAX_NOTE_CHARS = 240;
const MAIN = 'main';
const DEFAULT_REPLY_DELAY_MS = 6000; // long enough to see the waiting state in the preview
const SEED_AT = ['2026-10-12T17:40:00Z', '2026-10-12T17:43:00Z'];
const EASIER = { op: 'update', workoutId: 'w-2026-10-17-run', set: { distanceKm: 6 }, reason: 'You asked for an easier week' };
const TOO_FAR = { op: 'update', workoutId: 'w-2026-10-17-run', set: { distanceKm: 40 }, reason: 'You asked for a very long run' };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isRealDate = (s) => typeof s === 'string' && DATE.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const isBlank = (v) => v == null || (typeof v === 'string' && !v.trim());
const emptyResult = () => ({ applied: [], proposed: [], rejected: [], goals: { applied: [], rejected: [] }, notes: { applied: [], rejected: [] } });

/**
 * `settings()` are the mock's settings (the main goal is its race), `findWorkout(id)` a planned workout
 * or null, `reviews()` and `proposals()` the fixture lists, `fail(status, message)` throws the API
 * error, `now()` the clock (tests pass their own).
 */
export function createCoachStore({ settings, findWorkout, reviews, proposals, fail, replyDelayMs = DEFAULT_REPLY_DELAY_MS, now = () => Date.now() }) {
  let seq = 0;
  const id = (prefix) => `${prefix}${++seq}`;
  let main = { targetSeconds: null, note: null };
  let goals = [{
    id: id('g'), title: '10 km under 50:00', kind: 'milestone', date: '2027-03-01', distanceKm: 10, targetSeconds: 3000,
    note: null, status: 'active', by: 'user', createdAt: SEED_AT[0], updatedAt: SEED_AT[0],
  }];
  let notes = [
    { id: id('n'), text: 'Commutes by bike five days a week', by: 'user', createdAt: SEED_AT[0] },
    { id: id('n'), text: 'Long run on Saturdays', by: 'coach', createdAt: SEED_AT[1] },
  ];
  const messages = [
    { id: 'm-seed-1', createdAt: SEED_AT[0], role: 'user', text: 'Can the long run stay on Saturdays? Sundays are for the family.', about: { type: 'plan' }, status: 'answered' },
    {
      id: 'm-seed-2', createdAt: SEED_AT[1], role: 'coach', about: null, replyTo: ['m-seed-1'],
      text: 'Yes. **Saturday is the long-run day from now on**, and I have noted it so the Monday review keeps to it.\n\nNothing in this week had to move.',
      result: { ...emptyResult(), notes: { applied: [{ op: 'add', note: { id: 'n2', text: 'Long run on Saturdays' } }], rejected: [] } },
    },
  ];
  let firedAt = null; // when the canned coach started reading, or null

  const pending = () => messages.filter((m) => m.role === 'user' && m.status === 'pending');
  const iso = () => new Date(now()).toISOString();

  // ---------- the canned coach ----------

  function answer(waiting) {
    const said = waiting.map((m) => m.text).join(' ');
    const result = emptyResult();
    const parts = [];
    if (/goal|mål|half|halv/i.test(said) && goals.length < MAX_GOALS) {
      const goal = { id: id('g'), title: 'Half marathon', kind: 'race', date: '2027-04-18', distanceKm: 21.1, targetSeconds: 6300, note: null, status: 'active', by: 'coach', createdAt: iso(), updatedAt: iso() };
      goals = [...goals, goal];
      result.goals.applied.push({ op: 'add', goal: { id: goal.id, title: goal.title, kind: goal.kind, date: goal.date, distanceKm: goal.distanceKm, targetSeconds: goal.targetSeconds, status: goal.status } });
      parts.push('I have added the half marathon as a goal and will build toward it in the spring.');
    }
    if (/tuesday|tirsdag/i.test(said) && !notes.some((n) => n.text === 'No runs on Tuesdays') && notes.length < MAX_NOTES) {
      const note = { id: id('n'), text: 'No runs on Tuesdays', by: 'coach', createdAt: iso() };
      notes = [...notes, note];
      result.notes.applied.push({ op: 'add', note: { id: note.id, text: note.text } });
      parts.push('Tuesdays are off from now on.');
    }
    if (/easier|shorter|kortere/i.test(said)) {
      result.applied.push(EASIER);
      parts.push('Saturday’s long run is a little shorter this week.');
    }
    if (/impossible|umulig/i.test(said)) {
      result.rejected.push({ change: TOO_FAR, error: 'run longer than 35 km' });
      parts.push('That one the plan does not allow, and for good reason.');
    }
    const text = parts.length ? parts.join(' ') : 'Understood. Nothing in the plan needs to change for that; keep the easy runs easy and tell me how Thursday feels.';
    const reply = { id: id('m'), createdAt: iso(), role: 'coach', text, about: null, replyTo: waiting.map((m) => m.id), result };
    messages.push(reply);
    for (const m of waiting) m.status = 'answered';
    firedAt = null;
  }

  /** Lets time pass: a run that has read for long enough answers, unless it was asked for silence. */
  function settle() {
    const waiting = pending();
    if (!waiting.length || firedAt == null || now() - firedAt < replyDelayMs) return;
    if (waiting.some((m) => /silence|stilhed/i.test(m.text) && !m.retried)) { firedAt = null; return; } // stalled until he tries again
    answer(waiting);
  }

  function status() {
    if (!pending().length) return { state: 'idle' };
    return firedAt == null ? { state: 'stalled' } : { state: 'thinking', since: new Date(firedAt).toISOString() };
  }

  function goalsView() {
    const s = settings();
    return {
      main: { id: MAIN, title: s.raceName, kind: 'race', date: s.raceDate, distanceKm: s.raceDistanceKm ?? 42.195, targetSeconds: main.targetSeconds, note: main.note },
      items: structuredClone(goals),
    };
  }

  // ---------- how the plan stands to the goals ----------

  /** The goals a plan would be built for: the main race, then active goals with a date before it and a distance. */
  function plannable() {
    const s = settings();
    const mainEvent = { id: MAIN, name: s.raceName, date: s.raceDate, distanceKm: s.raceDistanceKm ?? 42.195, kind: 'race', main: true, targetSeconds: main.targetSeconds };
    const onTheWay = goals.filter((g) => g.status === 'active' && g.date && g.distanceKm > 0 && g.date < s.raceDate)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((g) => ({ id: g.id, name: g.title, date: g.date, distanceKm: g.distanceKm, kind: g.kind === 'race' || g.distanceKm > 12 ? 'race' : 'trial', main: false, targetSeconds: g.targetSeconds }));
    return [mainEvent, ...onTheWay];
  }
  const signature = () => JSON.stringify([settings().fiveKSeconds, plannable().map((e) => [e.id, e.date, e.distanceKm, e.kind, e.targetSeconds])]);
  const LONGEST_RUN_KM = 18; // what the mock's plan has him run in one go before any goal on the way
  const outlook = (e) => (e.main ? looks(e) : { ...looks(e), longestRunBeforeKm: LONGEST_RUN_KM, prepared: e.distanceKm <= LONGEST_RUN_KM * 1.5 });
  function looks(e) {
    const fiveK = settings().fiveKSeconds;
    const scale = (e.distanceKm / 5) ** 1.06; // Riegel
    const predictedSeconds = Math.round(fiveK * scale);
    if (!e.targetSeconds) return { ...e, predictedSeconds, requiredFiveKSeconds: null, verdict: null };
    const ratio = e.targetSeconds / predictedSeconds;
    const verdict = ratio >= 1 ? 'in_hand' : ratio >= 0.965 ? 'within_reach' : ratio >= 0.93 ? 'ambitious' : 'beyond';
    return { ...e, predictedSeconds, requiredFiveKSeconds: Math.round(e.targetSeconds / scale), verdict };
  }
  let built = { signature: signature(), events: plannable().map(outlook) };
  function planState() {
    const s = settings();
    return {
      stale: built.signature !== signature(),
      events: structuredClone(built.events),
      notInPlan: [
        ...goals.filter((g) => g.status === 'active' && g.date && g.distanceKm > 0 && g.date >= s.raceDate)
          .map((g) => ({ id: g.id, name: g.title, date: g.date, reason: 'after_main_race' })),
        ...goals.filter((g) => g.status === 'active' && g.kind === 'race' && g.date && !(g.distanceKm > 0))
          .map((g) => ({ id: g.id, name: g.title, date: g.date, reason: 'no_distance' })),
      ],
    };
  }
  function rebuild() {
    built = { signature: signature(), events: plannable().map(outlook) };
    return { ok: true };
  }

  const snapshot = () => ({ messages: structuredClone(messages), status: status(), goals: goalsView(), notes: structuredClone(notes), plan: planState() });

  /** GET /api/coach: what there is once time has had its say. */
  function view() {
    settle();
    return snapshot();
  }

  // ---------- messages ----------

  function resolveAbout(about) {
    if (about == null) return null;
    const aid = typeof about?.id === 'string' ? about.id : '';
    switch (about?.type) {
      case 'plan': return { type: 'plan' };
      case 'workout': {
        const w = findWorkout(aid) || fail(404, 'That session is no longer in the plan');
        return { type: 'workout', id: w.id, date: w.date, title: w.title };
      }
      case 'review': {
        const r = reviews().find((x) => x.id === aid) || fail(404, 'That review is no longer there');
        const body = typeof r.body === 'string' ? {} : r.body || {};
        return { type: 'review', id: r.id, weekStart: r.weekStart, headline: body.headline ?? null };
      }
      case 'proposal': {
        const p = proposals().find((x) => x.id === aid) || fail(404, 'That proposal is no longer there');
        return { type: 'proposal', id: p.id, summary: p.summary ?? null };
      }
      case 'goal': {
        const g = aid === MAIN ? goalsView().main : goals.find((x) => x.id === aid) || fail(404, 'That goal is no longer there');
        return { type: 'goal', id: g.id, title: g.title };
      }
      default: return fail(400, 'about must name a review, a proposal, a session, a goal or the plan');
    }
  }

  function send(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Body must be { text, about? }');
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > MAX_MESSAGE_CHARS) fail(400, `A message needs 1–${MAX_MESSAGE_CHARS} characters`);
    settle();
    if (pending().length >= MAX_PENDING) fail(409, 'The coach has not answered your earlier messages yet. Wait for a reply before writing more');
    const message = { id: id('m'), createdAt: iso(), role: 'user', text, about: resolveAbout(body.about), status: 'pending' };
    messages.push(message);
    const fired = firedAt == null;
    if (fired) firedAt = now();
    // The answer to a send is the thread as it stands, never an instant reply: the coach reads first.
    return { ...snapshot(), sent: message.id, fire: fired ? { fired: true } : { fired: false, reason: 'in_flight' } };
  }

  function retry() {
    settle();
    const waiting = pending();
    if (!waiting.length) fail(409, 'Nothing is waiting for an answer');
    for (const m of waiting) m.retried = true;
    const fired = firedAt == null;
    if (fired) firedAt = now();
    return { ...snapshot(), fire: fired ? { fired: true } : { fired: false, reason: 'in_flight' } };
  }

  // ---------- goals and notes: the checks of coach-data.js, in its words ----------

  const FIELD = {
    title: (v) => (typeof v === 'string' && v.trim() && v.trim().length <= 80 ? v.trim() : fail(400, 'A goal needs a title of 1–80 characters')),
    kind: (v) => (v === 'race' || v === 'milestone' ? v : fail(400, 'A goal is a race or a milestone')),
    date: (v) => (isBlank(v) ? null : isRealDate(v) ? v : fail(400, 'The date must be a real date, YYYY-MM-DD')),
    distanceKm: (v) => (v == null ? null : typeof v === 'number' && v >= 0.1 && v <= 500 ? Math.round(v * 1000) / 1000 : fail(400, 'The distance must be 0.1–500 km')),
    targetSeconds: (v) => (v == null ? null : Number.isInteger(v) && v >= 10 && v <= 360000 ? v : fail(400, 'The target time must be whole seconds, between 10 seconds and 100 hours')),
    note: (v) => (isBlank(v) ? null : typeof v === 'string' && v.trim().length <= 300 ? v.trim() : fail(400, 'A goal note can be at most 300 characters')),
    status: (v) => (['active', 'achieved', 'dropped'].includes(v) ? v : fail(400, 'A goal is active, achieved or dropped')),
  };
  function clean(input, allowed) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'A goal change must be an object of fields');
    const keys = Object.keys(input);
    const stray = keys.find((k) => !allowed.includes(k));
    if (stray) fail(400, `${stray} cannot be set here`);
    if (!keys.length) fail(400, 'Nothing to change');
    return Object.fromEntries(keys.map((k) => [k, FIELD[k](input[k])]));
  }
  const NEW_FIELDS = ['title', 'kind', 'date', 'distanceKm', 'targetSeconds', 'note'];

  function addGoal(body) {
    if (goals.length >= MAX_GOALS) fail(400, `There can be at most ${MAX_GOALS} goals. Remove one first`);
    const f = clean(body, NEW_FIELDS);
    if (!f.title) fail(400, 'A goal needs a title of 1–80 characters');
    const goal = { id: id('g'), title: f.title, kind: f.kind ?? 'milestone', date: f.date ?? null, distanceKm: f.distanceKm ?? null, targetSeconds: f.targetSeconds ?? null, note: f.note ?? null, status: 'active', by: 'user', createdAt: iso(), updatedAt: iso() };
    goals = [...goals, goal];
    return { goal: structuredClone(goal) };
  }
  function updateGoal(gid, body) {
    if (gid === MAIN) {
      main = { ...main, ...clean(body, ['targetSeconds', 'note']) };
      return { goal: { id: MAIN, ...main } };
    }
    const old = goals.find((g) => g.id === gid) || fail(404, 'No such goal');
    const goal = { ...old, ...clean(body, [...NEW_FIELDS, 'status']), updatedAt: iso() };
    goals = goals.map((g) => (g.id === gid ? goal : g));
    return { goal: structuredClone(goal) };
  }
  function removeGoal(gid) {
    if (gid === MAIN) fail(400, 'The main goal cannot be removed. Change the race in Settings instead');
    if (!goals.some((g) => g.id === gid)) fail(404, 'No such goal');
    goals = goals.filter((g) => g.id !== gid);
    return { ok: true };
  }
  function addNote(body) {
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > MAX_NOTE_CHARS) fail(400, `A note needs 1–${MAX_NOTE_CHARS} characters`);
    if (notes.some((n) => n.text.toLowerCase() === text.toLowerCase())) fail(400, 'That note is already there');
    if (notes.length >= MAX_NOTES) fail(400, `There can be at most ${MAX_NOTES} notes. Remove one first`);
    const note = { id: id('n'), text, by: 'user', createdAt: iso() };
    notes = [...notes, note];
    return { note: structuredClone(note) };
  }
  function removeNote(nid) {
    if (!notes.some((n) => n.id === nid)) fail(404, 'No such note');
    notes = notes.filter((n) => n.id !== nid);
    return { ok: true };
  }

  return { view, send, retry, addGoal, updateGoal, removeGoal, addNote, removeNote, rebuild };
}
