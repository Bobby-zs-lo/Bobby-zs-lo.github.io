// Fetch wrapper for the running-coach Worker.
import { API_BASE } from './config.js';

const TOKEN_KEY = 'running.token';
export const API_CACHE = 'running-api'; // must match sw.js

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t) {
  try { localStorage.setItem(TOKEN_KEY, t); return true; } catch { return false; }
}
export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ }
}

export class ApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/** Network status as seen by the API layer. `cachedAt` is set when the SW served a stale copy. */
export const netStatus = { offline: false, cachedAt: null };
function setNet(offline, cachedAt = null) {
  const changed = netStatus.offline !== offline || netStatus.cachedAt !== cachedAt;
  netStatus.offline = offline;
  netStatus.cachedAt = cachedAt;
  if (changed && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('api:net', { detail: { ...netStatus } }));
}

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(API_BASE + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      mode: 'cors', credentials: 'omit', cache: 'no-store',
    });
  } catch {
    setNet(true);
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }
  // sw.js marks responses it had to answer itself while offline.
  const swOffline = res.headers.get('X-Running-Offline') === '1';
  setNet(swOffline, (swOffline && res.headers.get('X-Running-Saved-At')) || null);

  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }
  if (res.status === 401 && auth) {
    clearToken();
    if (typeof location !== 'undefined' && !location.hash.startsWith('#/login')) location.hash = '#/login';
    throw new ApiError((data && data.error) || 'Please sign in again.', 401, data);
  }
  if (!res.ok) {
    const msg = (data && typeof data.error === 'string' && data.error)
      || (res.status === 429 ? 'Too many attempts. Wait a few minutes and try again.' : `Request failed (${res.status}).`);
    throw new ApiError(msg, res.status, data);
  }
  if (text && data === null) throw new ApiError('The server sent a response the app could not read.', res.status);
  return data;
}

api.get = (p, o) => api(p, { ...o, method: 'GET' });
api.post = (p, body, o) => api(p, { ...o, method: 'POST', body: body ?? {} });
api.put = (p, body, o) => api(p, { ...o, method: 'PUT', body });

/** Remove cached API responses (on sign-out, so another person never sees them offline). */
export async function clearApiCache() {
  try { if (typeof caches !== 'undefined') await caches.delete(API_CACHE); } catch { /* ignore */ }
}
