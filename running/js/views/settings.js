import { html, raw, mount } from '../dom.js';
import { api, clearApiCache } from '../api.js';
import { signOut as authSignOut } from '../auth.js';
import { getState, patchState, invalidate } from '../store.js';
import { loading, errorState, toast, busy } from '../ui.js';
import { clearParams, navigate } from '../router.js';
import { formatMmSs, parseMmSs, formatTimestamp } from '../format.js';
import { enablePush, permissionState, pushSupported, currentSubscription } from '../push.js';
import { API_BASE, APP_VERSION } from '../config.js';

const NOTIFS = [
  ['morning', 'Morning', 'Today’s session at your chosen hour'],
  ['evening', 'Evening', 'Nudge if today’s run isn’t logged yet'],
  ['activity', 'After an activity', 'A note when Strava gets a new activity'],
  ['weekly', 'Weekly review', 'When the Monday review is in'],
];

const hourOptions = sel => Array.from({ length: 24 }, (_, h) =>
  html`<option value="${h}"${h === sel ? raw(' selected') : ''}>${String(h).padStart(2, '0')}:00</option>`);

const toggle = (name, label, help, checked) => {
  const helpId = `${name.replace(/[^a-z0-9]+/gi, '-')}-help`;
  return html`<label class="switch">
  <span class="switch-text"><span class="switch-label">${label}</span>${help ? html`<span class="help" id="${helpId}">${help}</span>` : ''}</span>
  <input type="checkbox" name="${name}" role="switch"${help ? raw(` aria-describedby="${helpId}"`) : ''}${checked ? raw(' checked') : ''}>
  <span class="switch-ui" aria-hidden="true"></span>
</label>`;
};

export async function render(el, ctx) {
  const flag = ctx.params.strava;
  if (flag) {
    clearParams();
    if (flag === 'ok') toast('Strava connected', { kind: 'ok' });
    else toast('Strava connection failed. Try again.', { kind: 'error' });
  }
  loading(el, 'Loading settings');
  let state;
  try { state = await getState({ force: !!flag }); } catch (e) {
    if (ctx.isCurrent()) errorState(el, e, () => render(el, ctx));
    return;
  }
  if (!ctx.isCurrent()) return;

  const s = state.settings || {};
  const n = s.notify || {};
  const strava = state.strava || {};
  const push = state.push || {};
  const perm = permissionState();
  const ingestUrl = `${API_BASE}/ingest/health`;

  mount(el, html`
    <header class="page-head">
      <p class="eyebrow">Running · v${APP_VERSION}</p>
      <h1>Settings</h1>
    </header>

    <form class="card form" id="settings-form" novalidate>
      <h2 class="section-title">Race and fitness</h2>
      <div class="field"><label for="raceName">Race</label>
        <input id="raceName" name="raceName" type="text" maxlength="80" value="${s.raceName || ''}" required></div>
      <div class="field"><label for="raceDate">Race date</label>
        <input id="raceDate" name="raceDate" type="date" value="${s.raceDate || ''}" required></div>
      <div class="field"><label for="fiveK">Current 5K time</label>
        <input id="fiveK" name="fiveK" type="text" inputmode="numeric" placeholder="23:30" pattern="\\d{1,2}:[0-5]\\d" value="${formatMmSs(s.fiveKSeconds)}" aria-describedby="fiveK-help" class="num input--short">
        <p class="help" id="fiveK-help">mm:ss. Sets your training paces. Changing the race or the 5K time regenerates all <strong>future</strong> weeks; past weeks and their statuses stay.</p></div>
      ${toggle('hasWatch', 'I have a GPS watch', 'Sessions can use pace and heart-rate targets', !!s.hasWatch)}

      <h2 class="section-title">Notifications</h2>
      ${NOTIFS.map(([k, label, help]) => toggle(`notify.${k}`, label, help, n[k] !== false))}
      <div class="field-pair">
        <div class="field"><label for="morningHour">Morning at</label><select id="morningHour" name="morningHour" class="num">${hourOptions(s.morningHour ?? 7)}</select></div>
        <div class="field"><label for="eveningHour">Evening at</label><select id="eveningHour" name="eveningHour" class="num">${hourOptions(s.eveningHour ?? 20)}</select></div>
      </div>
      <button class="btn btn--primary btn--block" type="submit">Save settings</button>
    </form>

    <section class="card">
      <h2 class="section-title">This phone</h2>
      <p class="status-line"><span class="status-dot${push.subscribed && perm === 'granted' ? ' is-on' : ''}"></span><span id="push-status">${
        !pushSupported() ? 'Push isn’t supported in this browser.'
          : perm === 'denied' ? 'Notifications are blocked for this site.'
          : perm === 'granted' && push.subscribed ? 'Notifications are on.'
          : 'Notifications are off on this phone.'}</span></p>
      <div class="actions">
        <button type="button" class="btn btn--primary" id="push-enable">${perm === 'granted' && push.subscribed ? 'Re-enable notifications' : 'Enable notifications'}</button>
        <button type="button" class="btn" id="push-test">Send test</button>
      </div>
    </section>

    <section class="card">
      <h2 class="section-title">Strava</h2>
      <p class="status-line"><span class="status-dot${strava.connected ? ' is-on' : ''}"></span><span>${strava.connected ? html`Connected${strava.athleteName ? html` as <strong>${strava.athleteName}</strong>` : ''}` : 'Not connected. Connect to log activities automatically.'}</span></p>
      <div class="actions">
        <button type="button" class="btn${strava.connected ? '' : ' btn--primary'}" id="strava-connect">${strava.connected ? 'Reconnect Strava' : 'Connect Strava'}</button>
        <button type="button" class="btn" id="strava-webhook"${strava.connected ? '' : raw(' disabled')}>Register Strava webhook</button>
      </div>
      <p class="help">Register the webhook once after connecting, so new activities arrive within a minute.</p>
    </section>

    <section class="card">
      <h2 class="section-title">Health Connect</h2>
      <p>In the <strong>Health Connect to Webhook</strong> app, add a webhook:</p>
      <dl class="kv">
        <dt>URL</dt><dd><code class="copyable" id="ingest-url">${ingestUrl}</code> <button type="button" class="btn btn--sm" data-copy="${ingestUrl}" aria-label="Copy webhook URL">Copy</button></dd>
        <dt>Header</dt><dd><code>X-Ingest-Key</code> <button type="button" class="btn btn--sm" data-copy="X-Ingest-Key" aria-label="Copy header name">Copy</button></dd>
        <dt>Value</dt><dd class="muted">The ingest key printed at setup (SETUP.md). It is never shown here.</dd>
        <dt>Interval</dt><dd>60 minutes</dd>
      </dl>
      <p class="help">Last sync: <span class="num">${formatTimestamp(state.healthLastSync)}</span></p>
    </section>

    <section class="card">
      <h2 class="section-title">Account</h2>
      <div class="actions">
        <button type="button" class="btn" id="logout">Sign out</button>
        <button type="button" class="btn btn--danger" id="logout-all">Sign out everywhere</button>
      </div>
    </section>
  `);

  const form = el.querySelector('#settings-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fiveKSeconds = parseMmSs(form.fiveK.value);
    if (fiveKSeconds == null || fiveKSeconds < 12 * 60 || fiveKSeconds > 60 * 60) {
      toast('Enter the 5K time as mm:ss, e.g. 23:30.', { kind: 'error' });
      form.fiveK.setAttribute('aria-invalid', 'true');
      form.fiveK.focus();
      return;
    }
    if (!form.raceName.value.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(form.raceDate.value)) {
      const bad = form.raceName.value.trim() ? form.raceDate : form.raceName;
      bad.setAttribute('aria-invalid', 'true');
      bad.focus();
      toast('Race name and date are required.', { kind: 'error' });
      return;
    }
    const next = {
      raceName: form.raceName.value.trim(), raceDate: form.raceDate.value, fiveKSeconds,
      hasWatch: form.hasWatch.checked,
      notify: Object.fromEntries(NOTIFS.map(([k]) => [k, form[`notify.${k}`].checked])),
      morningHour: +form.morningHour.value, eveningHour: +form.eveningHour.value,
    };
    const patch = {};
    for (const [k, v] of Object.entries(next)) if (JSON.stringify(v) !== JSON.stringify(s[k])) patch[k] = v;
    if (!Object.keys(patch).length) { toast('Nothing changed'); return; }
    const regen = ['raceName', 'raceDate', 'fiveKSeconds'].some(k => k in patch);
    if (regen && !confirm('This regenerates all future weeks of the plan from tomorrow. Past weeks stay. Continue?')) return;
    await busy(form.querySelector('button[type=submit]'), async () => {
      try {
        const saved = await api.put('/api/settings', patch);
        Object.assign(s, saved || patch);
        patchState({ settings: { ...s } });
        if (regen) invalidate();
        toast(regen ? 'Saved. Future weeks were regenerated.' : 'Settings saved', { kind: 'ok' });
      } catch (ex) { toast(ex.message, { kind: 'error' }); }
    });
  });

  const $ = id => el.querySelector(id);
  $('#push-enable').addEventListener('click', e => busy(e.currentTarget, async () => {
    try {
      await enablePush(push.vapidPublicKey);
      push.subscribed = true;
      patchState({ push: { ...push } });
      $('#push-status').textContent = 'Notifications are on.';
      el.querySelector('.status-dot').classList.add('is-on');
      toast('Notifications enabled', { kind: 'ok' });
    } catch (ex) { toast(ex.message, { kind: 'error', ms: 6000 }); }
  }));
  $('#push-test').addEventListener('click', e => busy(e.currentTarget, async () => {
    try {
      const r = await api.post('/api/push/test');
      const sent = r && r.sent != null ? r.sent : 0;
      toast(sent ? `Test sent to ${sent} device${sent === 1 ? '' : 's'}` : 'No subscribed devices. Enable notifications first.', { kind: sent ? 'ok' : 'error' });
    } catch (ex) { toast(ex.message, { kind: 'error' }); }
  }));
  $('#strava-connect').addEventListener('click', e => busy(e.currentTarget, async () => {
    try {
      const { url } = await api.get('/api/strava/connect');
      if (!/^https:\/\//.test(url || '')) throw new Error('The server did not return a Strava link.');
      location.href = url;
    } catch (ex) { toast(ex.message, { kind: 'error' }); }
  }));
  $('#strava-webhook').addEventListener('click', e => busy(e.currentTarget, async () => {
    try {
      const r = await api.post('/api/strava/register-webhook');
      toast(`Webhook registered${r && r.id ? ` (id ${r.id})` : ''}`, { kind: 'ok' });
    } catch (ex) { toast(ex.message, { kind: 'error' }); }
  }));
  el.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast('Copied'); }
    catch { toast('Copy failed. Long-press the text to copy it.', { kind: 'error' }); }
  }));

  const signOut = async all => {
    if (all) {
      try { await api.post('/api/logout-all'); }
      catch (ex) { if (ex.status !== 401) toast(`Signed out here, but the server said: ${ex.message}`, { kind: 'error' }); }
    }
    try { const sub = await currentSubscription(); if (sub) await sub.unsubscribe(); } catch { /* ignore */ }
    await clearApiCache();
    try { await authSignOut(); } catch { /* already signed out */ }
    invalidate();
    navigate('login');
  };
  $('#logout').addEventListener('click', e => busy(e.currentTarget, () => signOut(false)));
  $('#logout-all').addEventListener('click', e => {
    if (!confirm('Sign out every device, including this one?')) return;
    busy(e.currentTarget, () => signOut(true));
  });
}
