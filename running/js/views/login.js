import { html, raw, mount } from '../dom.js';
import { signIn } from '../auth.js';
import { toast, busy } from '../ui.js';
import { invalidate } from '../store.js';

const GOOGLE_G = '<svg class="google-g" viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.8 6.1C12.3 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.4 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.7-4.1-13.6-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';

/** Firebase error → something a person can act on. */
export function signInMessage(err) {
  const code = (err && err.code) || '';
  if (code === 'auth/popup-blocked') return 'The sign-in window was blocked. Allow pop-ups for this site, then try again.';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || code === 'auth/user-cancelled') return 'Sign-in was cancelled. Try again.';
  if (code === 'auth/network-request-failed') return 'Can’t reach Google. Check your connection and try again.';
  if (code === 'auth/unauthorized-domain') return 'This site isn’t set up for sign-in yet (authorised domains in Firebase).';
  return (err && err.message) ? `Sign-in failed: ${err.message}` : 'Sign-in failed. Try again.';
}

export async function render(el) {
  mount(el, html`
    <section class="login">
      <p class="eyebrow">Private</p>
      <h1 class="login-title">Running</h1>
      <p class="lede">Only Bobby’s Google account can open this app.</p>
      <div class="card login-card">
        <button class="btn btn--primary btn--block btn--google" type="button" id="google-signin">${raw(GOOGLE_G)}<span>Sign in with Google</span></button>
      </div>
    </section>`);

  const btn = el.querySelector('#google-signin');
  btn.addEventListener('click', () => busy(btn, async () => {
    try {
      await signIn();
      invalidate();
      // app.js listens for the auth change and moves on to Today.
    } catch (ex) {
      toast(signInMessage(ex), { kind: 'error', ms: 6000 });
    }
  }));
}
