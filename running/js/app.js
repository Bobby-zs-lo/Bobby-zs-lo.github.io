// App shell: header, bottom tabs, offline badge, toasts, hash routing.
import { parseHash, navigate } from './router.js';
import { getToken, netStatus } from './api.js';
import { ICONS } from './icons.js';
import { html, raw, mount } from './dom.js';
import { errorState } from './ui.js';
import { formatTimestamp } from './format.js';

const VIEWS = {
  login: () => import('./views/login.js'),
  today: () => import('./views/today.js'),
  week: () => import('./views/week.js'),
  plan: () => import('./views/plan.js'),
  health: () => import('./views/health.js'),
  reviews: () => import('./views/reviews.js'),
  settings: () => import('./views/settings.js'),
};
const TABS = [['today', 'Today'], ['week', 'Week'], ['plan', 'Plan'], ['health', 'Health'], ['reviews', 'Reviews']];
const TITLES = { login: 'Sign in', today: 'Today', week: 'Week', plan: 'Plan', health: 'Health', reviews: 'Reviews', settings: 'Settings' };

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
  <div class="toasts" id="toasts" aria-live="polite"></div>
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

async function route() {
  const r = parseHash(location.hash);
  const authed = !!getToken();
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
    cleanup = await mod.render(view, { params: r.params, isCurrent: () => seq === renderSeq });
  } catch (e) {
    if (seq === renderSeq) errorState(view, e, route);
  }
}

window.addEventListener('hashchange', route);
route();
updateOffline();

// sw.js asks an open window to switch view after a notification tap.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => {
    const d = e.data || {};
    if (d.type === 'navigate' && typeof d.hash === 'string' && d.hash.startsWith('#/')) location.hash = d.hash;
  });
}
