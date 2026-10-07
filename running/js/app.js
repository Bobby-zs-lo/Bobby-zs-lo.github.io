// App shell: header, tabs (a bottom bar on a phone, a left rail on a desk), offline badge,
// toasts, hash routing.
import { parseHash, buildHash, navigate } from './router.js';
import { initLayout, isDesk } from './layout.js';
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
  overview: () => import('./views/overview.js'),
  routes: () => import('./views/routes.js'),
};
// [route, label, deskOnly]. Desk-only tabs are always in the DOM but hidden by css/desk.css on a
// phone, so the bottom bar shows the other six. Routes is on both: planning a run happens on the go too.
const TABS = [
  ['overview', 'Overview', true], ['today', 'Today'], ['week', 'Week'], ['plan', 'Plan'],
  ['routes', 'Routes'], ['health', 'Health'], ['reviews', 'Reviews'],
];
const TITLES = {
  login: 'Sign in', today: 'Today', week: 'Week', plan: 'Plan', health: 'Health', reviews: 'Reviews',
  settings: 'Settings', workout: 'Session', activity: 'Activity', overview: 'Overview', routes: 'Routes',
};

// Where a bare URL, an unknown route and a fresh sign-in land: the dashboard on a desk, the day
// on a phone. The manifest's start_url is a bare './' for the same reason.
const homeRoute = () => (isDesk() ? 'overview' : 'today');
const BARE_HASHES = new Set(['', '#', '#/']);

// Before the shell mounts, so the first paint already has the right data-layout.
initLayout();

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
    ${TABS.map(([k, label, desk]) => html`<a class="${desk ? 'tab tab--desk' : 'tab'}" href="#/${k}" data-tab="${k}">${raw(ICONS[k])}<span>${label}</span></a>`)}
  </nav>
  <div class="toasts" id="toasts"></div>
`);

const view = document.getElementById('view');
const offlineEl = document.getElementById('offline');
const brand = document.querySelector('.brand');

// The brand is the home link, so it follows the layout when the window crosses the breakpoint.
function syncBrand() {
  const home = homeRoute();
  brand.setAttribute('href', `#/${home}`);
  brand.setAttribute('aria-label', `Running, ${home}`);
}
window.addEventListener('layout:change', syncBrand);
syncBrand();

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
  let r = parseHash(location.hash);
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
  if (authed && r.path === 'login') return navigate(homeRoute());
  // A bare URL or an unknown route opens this layout's home view. replaceState, not navigate: a
  // new history entry would send Back to the old URL, which would redirect straight forward again.
  if (BARE_HASHES.has(location.hash) || !r.known) {
    history.replaceState(null, '', buildHash(homeRoute()));
    r = parseHash(location.hash);
  }

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
  else if (user && path === 'login') navigate(homeRoute());
});
updateOffline();

// sw.js asks an open window to switch view after a notification tap.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => {
    const d = e.data || {};
    if (d.type === 'navigate' && typeof d.hash === 'string' && d.hash.startsWith('#/')) location.hash = d.hash;
  });
}
