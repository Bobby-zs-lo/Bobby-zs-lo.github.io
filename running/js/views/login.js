import { html, mount } from '../dom.js';
import { api, setToken } from '../api.js';
import { navigate } from '../router.js';
import { invalidate } from '../store.js';

export function defaultDeviceName() {
  try {
    const uad = navigator.userAgentData;
    const plat = (uad && uad.platform) || navigator.platform || '';
    const mobile = uad ? uad.mobile : /Mobi|Android/i.test(navigator.userAgent);
    const brand = uad && uad.brands && (uad.brands.find(b => /Chrome|Edge|Firefox|Opera/.test(b.brand)) || {}).brand;
    const os = /Android/i.test(plat + navigator.userAgent) ? 'Android' : (plat || 'Browser');
    return [os, mobile ? 'phone' : '', brand ? `(${brand})` : ''].filter(Boolean).join(' ').slice(0, 60);
  } catch { return 'My phone'; }
}

export async function render(el) {
  mount(el, html`
    <section class="login">
      <p class="eyebrow">Private</p>
      <h1 class="login-title">Running</h1>
      <p class="lede">Sign in on this device. You only need to do this once per phone.</p>
      <form class="card form" id="login-form" novalidate>
        <div class="field">
          <label for="passphrase">Passphrase</label>
          <input id="passphrase" name="passphrase" type="password" autocomplete="current-password" required autofocus>
        </div>
        <div class="field">
          <label for="deviceName">Device name</label>
          <input id="deviceName" name="deviceName" type="text" autocomplete="off" maxlength="60" value="${defaultDeviceName()}">
          <p class="help">Shown when you sign devices out.</p>
        </div>
        <p class="form-error" id="login-error" role="alert" hidden></p>
        <button class="btn btn--primary btn--block" type="submit">Sign in</button>
      </form>
    </section>`);

  const form = el.querySelector('#login-form');
  const err = el.querySelector('#login-error');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const passphrase = form.passphrase.value;
    const deviceName = form.deviceName.value.trim() || 'Phone';
    err.hidden = true;
    if (!passphrase) { err.textContent = 'Enter your passphrase.'; err.hidden = false; form.passphrase.focus(); return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      const { token } = await api.post('/api/login', { passphrase, deviceName }, { auth: false });
      if (!token) throw new Error('No token in the response.');
      if (!setToken(token)) throw new Error('This browser blocks storage, so the app can’t remember you. Turn off private mode and try again.');
      invalidate();
      navigate('today');
    } catch (ex) {
      err.textContent = ex.status === 401 || ex.status === 403 ? 'That passphrase didn’t work.' : ex.message;
      err.hidden = false;
      form.passphrase.select();
    } finally {
      btn.disabled = false; btn.textContent = 'Sign in';
    }
  });
}
