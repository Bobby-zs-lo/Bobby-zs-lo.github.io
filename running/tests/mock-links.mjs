// The linking half of the mock API (tests/mock-api.mjs): which recorded sessions count for a
// planned workout, and the workout statuses that follow from that.
//
// Contract (the backend's; docs/superpowers/specs/2026-10-10-manual-activity-links-design.md in
// Running-with-Claude): PUT /api/workouts/:id/links { activityIds: string[], healthIds: string[] }
// names the complete set of sessions that count for the workout: replace semantics, the workout's
// own day only, at most ten different ids of each. 400 for a body of another shape, an id that is
// no session of that day, or a Health Connect session that is a copy of a Strava activity; 404 for
// an unknown workout. Every activity the request links or unlinks gets linkSource 'user', the
// workout gets linksBy 'user', and the status of the workout (and of any workout that lost a
// session) is worked out again from what is linked: 'done' at 80 % of the plan, else 'partial',
// back to 'planned' with nothing linked. A status set by hand (statusSource 'user') is never touched.
//
// Same rules, same order and same messages as setWorkoutLinks in functions/src/service.js: the
// front end shows the server's words. The fixtures are never written: what changed lives in the
// store made here, one per mock.

const MAX_LINKS = 10;
const MAX_ID_LENGTH = 80;
const DONE_SHARE = 0.8;
const FROM_LINKS = new Set(['strava', 'health']);
const ACTION_STATUS = { done: 'done', skip: 'skipped', undo_status: 'planned' };

// Rounded, as on the backend, so that parts adding up to exactly 80 % are not lost to floating point.
const total = (values) => Math.round(values.reduce((sum, x) => sum + (x || 0), 0) * 100) / 100;

/** planStatus in functions/src/match.js: by distance, or by duration when only a duration is planned. */
function planStatus(total, workout) {
  if (workout.distanceKm > 0) return total.distanceKm >= DONE_SHARE * workout.distanceKm ? 'done' : 'partial';
  if (workout.durationMin > 0) return total.movingMin >= DONE_SHARE * workout.durationMin ? 'done' : 'partial';
  return 'done';
}

function idList(body, key, fail) {
  const ids = body[key];
  const ok = Array.isArray(ids) && ids.length <= MAX_LINKS
    && ids.every((id) => typeof id === 'string' && id.length > 0 && id.length <= MAX_ID_LENGTH)
    && new Set(ids).size === ids.length;
  if (!ok) fail(400, `${key} must be a list of at most ${MAX_LINKS} different ids, each a string`);
  return ids;
}

function parseLinks(body, fail) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Body must be { activityIds, healthIds }');
  return { activityIds: idList(body, 'activityIds', fail), healthIds: idList(body, 'healthIds', fail) };
}

/**
 * `activities()` are the stored activity rows, `sessions()` the Health Connect sessions with their
 * `date`, `findWorkout(id)` the planned workout or null, `fail(status, message)` throws the API error.
 * All three are read on every call, so rebuilt fixtures show without a restart.
 */
export function createLinkStore({ activities, sessions, findWorkout, fail }) {
  const activityLinks = new Map(); // activity id → { workoutId, linkSource }
  const healthLinks = new Map();   // Health Connect session id → workout id or null, where this mock changed it
  const marks = new Map();         // workout id → { status, statusSource, linksBy }, whichever were set here

  const linkOf = (a) => activityLinks.get(String(a.id)) || { workoutId: a.workoutId ?? null, linkSource: a.linkSource ?? null };
  const linkedActivities = (id) => activities().filter((a) => linkOf(a).workoutId === id);
  // A fixture session that carries a workoutId was linked before this mock began (the backend keeps these in kv `healthLinks`).
  const healthLinkOf = (s) => (healthLinks.has(s.id) ? healthLinks.get(s.id) : s.workoutId ?? null);
  // A copy of a Strava activity can still hold a link from before Strava had the session. It counts for nothing.
  const linkedSessions = (id) => sessions().filter((s) => healthLinkOf(s) === id && !s.duplicateOfStrava);
  const mark = (id, patch) => marks.set(id, { ...marks.get(id), ...patch });

  // The fixtures carry a status but not where it came from: one with an activity linked to it
  // came from Strava, any other was set by hand.
  const sourceOf = (w) => {
    if (w.statusSource !== undefined) return w.statusSource;
    if (!w.status || w.status === 'planned') return null;
    return activities().some((a) => a.workoutId === w.id) ? 'strava' : 'user';
  };
  const current = (w) => ({ ...w, statusSource: sourceOf(w), ...marks.get(w.id) });

  function recompute(id) {
    const base = findWorkout(id);
    if (!base) return;
    const w = current(base);
    if (w.statusSource === 'user') return;
    const acts = linkedActivities(id);
    const health = linkedSessions(id);
    if (!acts.length && !health.length) {
      if (FROM_LINKS.has(w.statusSource)) mark(id, { status: 'planned', statusSource: null });
      return;
    }
    const done = {
      distanceKm: total([...acts, ...health].map((x) => x.distanceKm)),
      movingMin: total([...acts.map((a) => a.movingMin), ...health.map((s) => s.durationMin)]),
    };
    mark(id, { status: planStatus(done, w), statusSource: acts.length ? 'strava' : 'health' });
  }

  function save(id, body) {
    const { activityIds, healthIds } = parseLinks(body, fail);
    const base = findWorkout(id) || fail(404, 'Workout not found');
    // An unknown id and one of another day end the same way: it is no session of the workout's date.
    const acts = activityIds.map((aid) => activities().find((a) => String(a.id) === aid && a.date === base.date)
      || fail(400, `No Strava activity ${aid} on ${base.date}`));
    const health = healthIds.map((hid) => {
      const session = sessions().find((s) => s.id === hid && s.date === base.date)
        || fail(400, `No Health Connect exercise session ${hid} on ${base.date}`);
      if (session.duplicateOfStrava) fail(400, `Health Connect session ${hid} is the same as a Strava activity of that day`);
      return session;
    });

    // Everything checked out; only now does anything change.
    const lost = new Set();
    const moveFrom = (before) => { if (before && before !== id) lost.add(before); };
    for (const a of linkedActivities(id)) {
      if (!activityIds.includes(String(a.id))) activityLinks.set(String(a.id), { workoutId: null, linkSource: 'user' });
    }
    for (const a of acts) {
      moveFrom(linkOf(a).workoutId);
      activityLinks.set(String(a.id), { workoutId: id, linkSource: 'user' });
    }
    for (const session of sessions()) {
      if (healthLinkOf(session) === id && !healthIds.includes(session.id)) healthLinks.set(session.id, null);
    }
    for (const session of health) {
      moveFrom(healthLinkOf(session));
      healthLinks.set(session.id, id);
    }
    mark(id, { linksBy: 'user' });
    for (const workoutId of [id, ...lost]) recompute(workoutId);
    return { ok: true, workout: current(base) };
  }

  /** POST /api/workouts/:id/action. A status sticks, as on the backend; a move only answers (the mock has no calendar to move it on). */
  function act(id, action) {
    const base = findWorkout(id) || fail(404, 'Workout not found');
    if (action === 'move_tomorrow') return { workout: { ...current(base), status: 'moved' } };
    const status = ACTION_STATUS[action] || fail(400, 'Unknown action');
    mark(id, { status, statusSource: action === 'undo_status' ? null : 'user' });
    return { workout: current(base) };
  }

  return {
    save,
    act,
    /** An activity row as the API shows it now: its link and who made it. */
    activity: (a) => ({ ...a, ...linkOf(a) }),
    /** A Health Connect session with the workout it counts for, or null. */
    session: (s) => ({ ...s, workoutId: healthLinkOf(s) }),
    /** A workout with its status as it stands. Untouched ones are returned as the fixture has them. */
    workout: (w) => (w && marks.has(w.id) ? { ...w, ...marks.get(w.id) } : w),
  };
}
