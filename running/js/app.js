// App shell: header, bottom tabs, offline badge, toasts, hash routing.
import { parseHash, navigate } from './router.js';
import { netStatus, clearApiCache } from './api.js';
import { initAuth, onUser, currentUser } from './auth.js';
import { invalidate } from './store.js';
import { ICONS } from './icons.js';
import { html, raw, mount } from './dom.js';
import { errorState, loading } from './ui.js';
import { formatTimestamp } from './format.js';

const VIEWS = {
  login: () => import('./views/login.js'),
  today: () => import('./views/today.js'),
  week: () => import('./views/week.js'),
  plan: () => import('./views/plan.js'),
  health: () => import('./views/health.js'),
  reviews: () => import('./views/reviews.js'),
  settings: () => import('./views/settings.js'),
  workout: () => import('./views/workout.js'),
  activity: () => import('./views/activity.js'),
};
const TABS = [['today', 'Today'], ['week', 'Week'], ['plan', 'Plan'], ['health', 'Health'], ['reviews', 'Reviews']];
const TITLES = { login: 'Sign in', today: 'Today', week: 'Week', plan: 'Plan', health: 'Health', reviews: 'Reviews', settings: 'Settings', workout: 'Session', activity: 'Activity' };

const root = document.getElementById('app');
mount(root, html`
  <a class="skip" href="#view">Skip to content</a>
  <header class="top" id="top">
    <a class="brand" href="#/today" aria-label="Running, today">Running<span class="brand-dot">.</span></a>
    <span class="offline-badge" id="offline" hidden>Offline</span>
    <a class="icon-btn gear" id="gear" href="#/settings" aria-label="Settings">${raw(ICONS.gear)}</a>
  </header>
  <main id="view" class="view" tabindex="-1"></main>
  <nav class="tabs" id="tabs" aria-label="Sections">
    ${TABS.map(([k, label]) => html`<a class="tab" href="#/${k}" data-tab="${k}">${raw(ICONS[k])}<span>${label}</span></a>`)}
  </nav>
  <div class="toasts" id="toasts"></div>
`);

const view = document.getElementById('view');
const offlineEl = document.getElementById('offline');
let renderSeq = 0;
let cleanup = null;

function updateOffline() {
  const off = netStatus.offline || (typeof navigator !== 'undefined' && navigator.onLine === false);
  offlineEl.hidden = !off;
  offlineEl.textContent = netStatus.cachedAt ? 'Offline · saved copy' : 'Offline';
  offlineEl.title = netStatus.cachedAt ? `Showing data saved ${formatTimestamp(netStatus.cachedAt)}` : 'No connection';
}
window.addEventListener('api:net', updateOffline);
window.addEventListener('online', updateOffline);
window.addEventListener('offline', updateOffline);

// Router guard: nothing renders until Firebase has restored (or not) the saved session.
let authReady = null, authResolved = false;
function waitForAuth() {
  if (!authReady) {
    authReady = Promise.resolve(initAuth()).then(
      () => { authResolved = true; },
      e => { authReady = null; throw e; },
    );
  }
  return authReady;
}

async function route() {
  const r = parseHash(location.hash);
  if (!authResolved) {
    const seq = ++renderSeq;
    document.body.dataset.route = 'boot';
    loading(view, 'Checking sign-in');
    try { await waitForAuth(); } catch {
      if (seq === renderSeq) errorState(view, new Error('Couldn’t load sign-in. Check your connection and try again.'), route);
      return;
    }
    if (seq !== renderSeq) return; // a newer route() call took over
  }
  const authed = !!currentUser();
  if (!authed && r.path !== 'login') return navigate('login');
  if (authed && r.path === 'login') return navigate('today');
  if (!r.known) return navigate('today');

  document.body.dataset.route = r.path;
  document.title = `${TITLES[r.path]} · Running`;
  document.querySelectorAll('.tab').forEach(t => {
    const on = t.dataset.tab === r.path;
    t.classList.toggle('is-active', on);
    if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
  document.getElementById('gear').classList.toggle('is-active', r.path === 'settings');

  const seq = ++renderSeq;
  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* ignore */ } }
  cleanup = null;
  try {
    const mod = await VIEWS[r.path]();
    if (seq !== renderSeq) return;
    window.scrollTo(0, 0);
    cleanup = await mod.render(view, { params: r.params, rest: r.rest, isCurrent: () => seq === renderSeq });
    // Move keyboard and screen-reader focus into the new view; without this, focus stays
    // on the tab link that was just activated and nothing is announced.
    if (seq === renderSeq) view.focus({ preventScroll: true });
  } catch (e) {
    if (seq === renderSeq) errorState(view, e, route);
  }
}

window.addEventListener('hashchange', route);
route();

// Sign-in / sign-out (here or in another tab): leave or return to the login screen.
let lastUid = undefined;
onUser(user => {
  const uid = user ? user.uid : null;
  if (lastUid !== undefined && uid !== lastUid) invalidate();
  lastUid = uid;
  if (!authResolved) return; // the first route() is still waiting and will decide
  const { path } = parseHash(location.hash);
  if (!user && path !== 'login') { clearApiCache(); navigate('login'); }
  else if (user && path === 'login') navigate('today');
});
updateOffline();

// sw.js asks an open window to switch view after a notification tap.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => {
    const d = e.data || {};
    if (d.type === 'navigate' && typeof d.hash === 'string' && d.hash.startsWith('#/')) location.hash = d.hash;
  });
}
