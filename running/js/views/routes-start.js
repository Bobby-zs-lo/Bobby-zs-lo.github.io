// The Start field of the Routes form (views/routes.js): what the start is, "Use my location" and
// "Save as home". The view owns the start (st.start, st.startKind, st.home) and moves it with
// setStart(point, kind); this shows it and asks for it to change.
import { mount } from '../dom.js';
import { api } from '../api.js';
import { patchState, peekState } from '../store.js';
import { toast, busy } from '../ui.js';
import { currentPosition } from '../geolocate.js';
import { startTpl } from './routes-ui.js';

/** centreOn(point): bring a located start into view. Returns { sync(), say(text, isError) }. */
export function bindStart(root, { st, setStart, alive, centreOn }) {
  const $ = sel => root.querySelector(sel);
  const saveBtn = $('#rt-save-home'), msg = $('#rt-start-msg');

  function say(text, isError = false) {
    msg.textContent = text;
    msg.classList.toggle('rt-msg--error', isError);
  }

  // "Saved as home" is a confirmation, not a dead button (routes.css keeps it at full strength).
  function sync() {
    mount($('#rt-start'), startTpl(st.start, st.startKind));
    saveBtn.hidden = !st.start;
    saveBtn.disabled = st.startKind === 'home';
    saveBtn.classList.toggle('is-saved', st.startKind === 'home');
    saveBtn.textContent = st.startKind === 'home' ? 'Saved as home' : 'Save as home';
  }

  $('#rt-locate').addEventListener('click', e => busy(e.currentTarget, async () => {
    say('Finding your location…');
    try {
      const point = await currentPosition();
      if (!alive()) return;
      setStart(point, 'location');
      centreOn(st.start);
    } catch (ex) {
      if (alive()) say(ex.message, true);
    }
  }));

  saveBtn.addEventListener('click', async () => {
    if (!st.start) return;
    const next = { lat: st.start[0], lng: st.start[1] };
    await busy(saveBtn, async () => {
      try {
        const saved = await api.put('/api/settings', { home: next });
        const savedHome = (saved && saved.home) || next;
        const cur = peekState();
        if (cur) patchState({ settings: { ...(cur.settings || {}), home: savedHome } });
        if (!alive()) return;
        st.home = [savedHome.lat, savedHome.lng];
        st.startKind = 'home';
        toast('Home saved', { kind: 'ok' });
      } catch (ex) {
        if (alive()) say(ex.message, true);
      }
    });
    if (alive()) sync(); // after busy(), which re-enables the button on its way out
  });

  return { sync, say };
}
