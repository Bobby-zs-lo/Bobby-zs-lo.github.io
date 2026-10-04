// In-memory cache of the two "big" reads so tab switches stay instant.
import { api } from './api.js';

let state = null, plan = null, planPromise = null;

export async function getState({ force = false } = {}) {
  if (!state || force) state = await api.get('/api/state');
  return state;
}
export function peekState() { return state; }
export function patchState(p) { if (state) state = { ...state, ...p }; }

export async function getPlan({ force = false } = {}) {
  if (plan && !force) return plan;
  if (!planPromise || force) {
    planPromise = api.get('/api/plan').then(p => (plan = p)).finally(() => { planPromise = null; });
  }
  return planPromise;
}
export function peekPlan() { return plan; }

/** Pace table: from the week response if the backend includes it, else from the plan. */
export async function getPaces(weekResp) {
  if (weekResp && weekResp.paces) return weekResp.paces;
  if (state && state.paces) return state.paces;
  try { return (await getPlan()).paces || {}; } catch { return {}; }
}

export function invalidate() { state = null; plan = null; }
