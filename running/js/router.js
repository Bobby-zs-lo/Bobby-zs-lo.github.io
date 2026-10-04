// Hash router: '#/settings?strava=ok' → { path: 'settings', params: { strava: 'ok' } }

export const ROUTES = ['login', 'today', 'week', 'plan', 'health', 'reviews', 'settings', 'workout'];
export const DEFAULT_ROUTE = 'today';

export function parseHash(hash) {
  let h = String(hash || '').replace(/^#/, '').replace(/^\/+/, '');
  const q = h.indexOf('?');
  const pathPart = q >= 0 ? h.slice(0, q) : h;
  const query = q >= 0 ? h.slice(q + 1) : '';
  const segs = pathPart.split('/').filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch { return s; } });
  const params = {};
  for (const [k, v] of new URLSearchParams(query)) params[k] = v;
  const path = segs[0] && ROUTES.includes(segs[0]) ? segs[0] : DEFAULT_ROUTE;
  return { path, rest: segs.slice(1), params, known: !segs[0] || ROUTES.includes(segs[0]) };
}

export function buildHash(path, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
  return `#/${path}${qs ? '?' + qs : ''}`;
}

export function navigate(path, params) {
  const h = buildHash(path, params);
  if (location.hash === h) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = h;
}

/** Drop the query from the current hash without adding a history entry. */
export function clearParams() {
  const { path } = parseHash(location.hash);
  history.replaceState(null, '', buildHash(path));
}
