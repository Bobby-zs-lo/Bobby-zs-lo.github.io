// Desk layout: wide screens get a left rail and the Overview/Routes views. Phone layout is untouched.
// The result lives on <html data-layout>, so every desk rule in css/desk.css can be scoped to it
// and a phone never matches one by accident.
export const DESK_QUERY = '(min-width: 1100px)';

// matchMedia is missing under node:test; there the app is never on a desk.
const mq = typeof matchMedia === 'function' ? matchMedia(DESK_QUERY) : null;

export const isDesk = () => !!(mq && mq.matches);

export function initLayout() {
  const apply = () => {
    document.documentElement.dataset.layout = isDesk() ? 'desk' : 'phone';
    window.dispatchEvent(new CustomEvent('layout:change'));
  };
  apply();
  if (mq) mq.addEventListener('change', apply);
}
