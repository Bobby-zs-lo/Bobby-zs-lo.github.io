// Fetch wrapper for the running-coach API (Firebase Cloud Functions).
// Every authenticated request carries the Firebase ID token as a bearer token.
import { API_BASE } from './config.js';
import { getIdToken, signOut, currentUser } from './auth.js';
import { toast } from './ui.js';

export const API_CACHE = 'running-api'; // must match sw.js

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
  if (auth) {
    let token = null, refreshFailed = false;
    try { token = await getIdToken(); } catch { refreshFailed = true; }
    if (token) headers.Authorization = `Bearer ${token}`;
    // A token refresh can fail offline; still ask, so sw.js can answer with a saved copy.
    else if (!(refreshFailed && currentUser())) {
      toLogin();
      throw new ApiError('Please sign in.', 401);
    }
  }

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
    await endSession();
    throw new ApiError((data && data.error) || 'Please sign in again.', 401, data);
  }
  if (res.status === 403 && auth && data && data.error === 'not the owner') {
    toast('This account isn’t allowed', { kind: 'error', ms: 6000 });
    await endSession();
    throw new ApiError('This account isn’t allowed', 403, data);
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

function toLogin() {
  if (typeof location !== 'undefined' && !location.hash.startsWith('#/login')) location.hash = '#/login';
}

/** Server rejected the token: sign out of Firebase, drop offline copies, show the login screen. */
async function endSession() {
  await clearApiCache();
  try { await signOut(); } catch { /* already signed out */ }
  toLogin();
}

/** Remove cached API responses (on sign-out, so another person never sees them offline). */
export async function clearApiCache() {
  try { if (typeof caches !== 'undefined') await caches.delete(API_CACHE); } catch { /* ignore */ }
}
