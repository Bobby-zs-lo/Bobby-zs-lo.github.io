// Small shared UI pieces: toasts, loading/error states, status chips.
import { html, raw, mount } from './dom.js';
import { STATUS_NAMES } from './format.js';

export function toast(message, { kind = 'info', ms = 3800 } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  setTimeout(() => {
    el.classList.remove('is-in');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

export function loading(el, label = 'Loading') {
  mount(el, html`<div class="state state--loading" role="status"><span class="spinner" aria-hidden="true"></span>${label}…</div>`);
}

export function errorState(el, err, retry) {
  mount(el, html`<div class="state state--error card" role="alert">
    <p class="state-title">Couldn’t load this page</p>
    <p class="muted">${err && err.message ? err.message : String(err)}</p>
    ${retry ? html`<button type="button" class="btn" data-retry>Try again</button>` : ''}
  </div>`);
  if (retry) el.querySelector('[data-retry]').addEventListener('click', retry);
}

export function statusChip(status) {
  const s = status || 'planned';
  return html`<span class="chip chip--${s}">${s === 'done' ? raw('<span aria-hidden="true">✓ </span>') : ''}${STATUS_NAMES[s] || s}</span>`;
}

/** Disable a button while an async action runs. */
export async function busy(btn, fn) {
  if (btn.disabled) return;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  try { return await fn(); }
  finally { btn.disabled = false; btn.removeAttribute('aria-busy'); }
}
