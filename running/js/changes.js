// Human-readable descriptions of plan change operations (spec 4.4).
import { formatDate, formatDistance, formatDuration, formatMmSs } from './format.js';

/** 'w-2026-10-13-run-2' → { date: '2026-10-13', sport: 'run' } */
export function parseWorkoutId(id) {
  const m = /^w-(\d{4}-\d{2}-\d{2})-([a-z]+)/.exec(id || '');
  return m ? { date: m[1], sport: m[2] } : null;
}

/** lookup(id) → Workout | undefined (from the plan) */
export function workoutName(id, lookup) {
  const w = lookup && lookup(id);
  const p = parseWorkoutId(id);
  const date = (w && w.date) || (p && p.date);
  const title = (w && w.title) || (p && `${p.sport[0].toUpperCase()}${p.sport.slice(1)} session`) || id;
  return date ? `${title} (${formatDate(date)})` : title;
}

function fields(set) {
  const out = [];
  if (!set) return out;
  if (set.title != null) out.push(`title “${set.title}”`);
  if (set.distanceKm != null) out.push(formatDistance(set.distanceKm));
  if (set.durationMin != null) out.push(formatDuration(set.durationMin));
  if (set.kind != null) out.push(`type ${set.kind.replace('_', ' ')}`);
  if (set.paceKey != null) out.push(`${set.paceKey} pace`);
  if (set.details != null) out.push(`details “${set.details}”`);
  return out;
}

export function describeChange(c, lookup) {
  if (!c || typeof c !== 'object') return 'Unknown change';
  switch (c.op) {
    case 'update': {
      const f = fields(c.set);
      return `Change ${workoutName(c.workoutId, lookup)}${f.length ? ': ' + f.join(', ') : ''}`;
    }
    case 'move': return `Move ${workoutName(c.workoutId, lookup)} to ${formatDate(c.toDate)}`;
    case 'replace': {
      const w = c.with || {};
      const amt = [w.distanceKm != null && formatDistance(w.distanceKm), w.durationMin != null && formatDuration(w.durationMin)].filter(Boolean).join(', ');
      return `Replace ${workoutName(c.workoutId, lookup)} with ${w.title || w.kind || 'a new session'}${amt ? ` (${amt})` : ''}`;
    }
    case 'add': {
      const w = c.workout || {};
      const amt = [w.distanceKm != null && formatDistance(w.distanceKm), w.durationMin != null && formatDuration(w.durationMin)].filter(Boolean).join(', ');
      return `Add ${w.title || w.kind || 'a session'}${amt ? ` (${amt})` : ''} on ${formatDate(c.date)}`;
    }
    case 'remove': return `Remove ${workoutName(c.workoutId, lookup)}`;
    case 'repeat_week': return `Repeat week ${c.weekIndex} next week (later weeks shift; race date unchanged)`;
    case 'set_week_target': return `Set week ${c.weekIndex} running volume to ${formatDistance(c.targetRunKm)}`;
    case 'set_paces': return `Update training paces from a 5K of ${formatMmSs(c.fiveKSeconds)}`;
    default: return `Unknown change (${String(c.op)})`;
  }
}

/** Index of the changeset that may be undone: the newest one not yet undone. */
export function undoableId(changesets) {
  const live = (changesets || []).filter(c => !c.undone);
  if (!live.length) return null;
  return live.reduce((a, b) => (String(b.createdAt) > String(a.createdAt) ? b : a)).id;
}

/** Review body may arrive as an object or a JSON string (see README notes). */
export function parseReviewBody(body) {
  if (body && typeof body === 'object') return body;
  if (typeof body === 'string') {
    try { const o = JSON.parse(body); if (o && typeof o === 'object') return o; } catch { /* plain markdown */ }
    return { summary: body };
  }
  return {};
}
