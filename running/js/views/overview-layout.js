// The Overview's customise mode, which overview.js creates once per visit. The layout it edits
// (the catalogue of cards and the pure functions on a layout) is in overview-model.js.
//
// Each card gets a toolbar (a drag handle, its widths, a hide button) and its content goes quiet
// and inert. A card moves by pointer (a placeholder shows where it will land and the others make
// way, animated FLIP-style with transforms only) or by keyboard (the handle picks it up, the
// arrows move it, Space drops it, Esc cancels; a live region says where it is). Hidden cards wait
// in a tray, from which a click or a drag brings them back. Nothing is saved until Done; Cancel,
// Esc or leaving the view puts the old layout back.
import { toString } from '../dom.js';
import { toast, busy } from '../ui.js';
import { toolbar, trayChips } from './tiles.js';
import {
  CATALOGUE, defaultLayout, visibleTiles, moveTile, setSpan, setHidden, toSaved, sameLayout, isDefault, widthChoices,
} from './overview-model.js';

const FLIP = { duration: 220, easing: 'cubic-bezier(.2, .8, .2, 1)' };
const DRAG_START_PX = 4;     // a press that moves less is a click
const EDGE_PX = 72;          // the auto-scroll band at the top and bottom of the window
const SCROLL_MAX_PX = 18;    // per frame, at the very edge
const GUARD_PX = 12;         // how far the pointer must go before a move may be undone (no ping-pong)
const LIFT = { maxW: 420, maxH: 300, minScale: 0.35, clipH: 520 }; // the ghost of a big card is a small one
const DROP_MAX_H = 360;      // the placeholder of a very tall card (the table) stops here
const TRAY_DROP_H = { kpi: 120, card: 280 }; // a card from the tray has no height yet
const STEP = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 };

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Customise mode over the Overview in `root`. `sections` maps card id → its <section> (none has
 * an inline style of its own: lifting a card writes one, dropping it removes it); `layout` is the
 * one on the page. `onChange(layout, { spans, shown })` repaints synchronously after a change
 * (the cards whose width changed or that came back), so the animation measures what was painted;
 * `save(dashboard)` stores settings.dashboard. → { apply, dress, active, cancel, destroy }.
 */
export function customiser(root, { sections, layout, onChange, save, catalogue = CATALOGUE }) {
  const known = new Map(catalogue.map(c => [c.id, c]));
  const $ = sel => root.querySelector(sel);
  const dash = $('.dash'), filters = $('.ov-filters'), opener = $('[data-customise]');
  const bar = $('[data-lay-bar]'), actions = $('[data-lay-actions]'), confirmBox = $('[data-lay-confirm]');
  const tray = $('[data-lay-tray]'), trayList = $('[data-lay-tray-list]'), live = $('[data-lay-live]');
  const resetBtn = $('[data-lay-reset]');
  let cur = layout || defaultLayout(catalogue), before = null, active = false, saving = false, placing = false;
  let drag = null, kb = null, suppressClick = false;

  const sectionOf = id => sections.get(id);
  const title = id => known.get(id)?.title || id;
  const where = id => { const v = visibleTiles(cur); return `position ${v.findIndex(t => t.id === id) + 1} of ${v.length}`; };
  const say = text => { live.textContent = ''; setTimeout(() => { live.textContent = text; }, 30); };

  // --- the layout on the page ---

  // Widths, hidden flags, then the visible cards in order. A move takes focus with it; put it back.
  function place(layout) {
    const focused = document.activeElement;
    placing = true;
    for (const t of layout) {
      const sec = sectionOf(t.id);
      [...sec.classList].filter(c => c.startsWith('tile--span-')).forEach(c => sec.classList.remove(c));
      sec.classList.add(`tile--span-${t.span}`);
      sec.hidden = t.hidden;
    }
    visibleTiles(layout).forEach((t, i) => {
      if (dash.children[i] !== sectionOf(t.id)) dash.insertBefore(sectionOf(t.id), dash.children[i] || null);
    });
    if (focused && focused !== document.activeElement && focused.isConnected) focused.focus({ preventScroll: true });
    placing = false;
  }

  function rects() {
    const m = new Map();
    for (const el of dash.children) if (!el.hidden) m.set(el, el.getBoundingClientRect());
    return m;
  }

  // FLIP: each card is drawn where it was and slides to where it now is. Transforms only.
  function flip(first, except = null) {
    if (reducedMotion()) return;
    const els = [...first.keys()].filter(el => el !== except && el.isConnected && !el.hidden);
    els.forEach(el => el.getAnimations().forEach(a => { if (a.id === 'ov-flip') a.cancel(); }));
    els.map(el => [el, first.get(el), el.getBoundingClientRect()]).forEach(([el, a, b]) => {
      const dx = a.left - b.left, dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], FLIP).id = 'ov-flip';
    });
  }

  // The dropped card settles from its ghost's box into its place.
  function land(el, from) {
    const to = el.getBoundingClientRect();
    if (reducedMotion() || !to.width) return;
    el.animate([
      { transformOrigin: '0 0', transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})` },
      { transformOrigin: '0 0', transform: 'none' },
    ], { ...FLIP, duration: FLIP.duration + 60 }).id = 'ov-flip';
  }

  function commit(next, { first = rects(), settle = null, from = null } = {}) {
    const old = new Map(cur.map(t => [t.id, t]));
    cur = next;
    place(cur);
    const spans = new Set(cur.filter(t => old.get(t.id)?.span !== t.span).map(t => t.id));
    const shown = new Set(cur.filter(t => !t.hidden && old.get(t.id)?.hidden).map(t => t.id));
    onChange(cur, { spans, shown });
    flip(first, settle);
    if (settle && from) land(settle, from);
    syncTools();
  }

  // --- the mode: toolbars, tray, bar ---

  /** Customise mode makes a card's content inert, so Tab walks the toolbars and nothing inside reacts. */
  function dress(sec) {
    for (const c of sec.children) c.inert = active && !c.classList.contains('ov-tbar');
  }

  function syncTools() {
    if (!active) return;
    for (const t of cur) {
      sectionOf(t.id).querySelectorAll('[data-span]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.span) === t.span)));
    }
    trayList.innerHTML = toString(trayChips(cur.filter(t => t.hidden).map(t => known.get(t.id))));
    resetBtn.disabled = isDefault(cur, catalogue) && isDefault(before, catalogue);
  }

  function setMode(on) {
    active = on;
    dash.classList.toggle('is-customising', on);
    filters.classList.toggle('is-customising', on);
    bar.hidden = !on;
    tray.hidden = !on;
    confirmBox.hidden = true;
    actions.hidden = false;
    if (on) document.addEventListener('keydown', onDocKey);
    else document.removeEventListener('keydown', onDocKey);
  }

  function enter() {
    if (active || opener.disabled) return;
    before = cur;
    setMode(true);
    for (const t of cur) {
      const entry = known.get(t.id);
      sectionOf(t.id).insertAdjacentHTML('beforeend', toString(toolbar(entry, t.span, widthChoices(entry))));
      dress(sectionOf(t.id));
    }
    syncTools();
    dash.querySelector('.ov-tile:not([hidden]) [data-grip]')?.focus({ preventScroll: true });
    say('Customising the Overview. Move, resize or hide cards, then choose Done.');
  }

  function leave({ refocus = true } = {}) {
    endDrag(false);
    if (kb) endPick(false);
    setMode(false);
    for (const sec of sections.values()) {
      sec.querySelector(':scope > .ov-tbar')?.remove();
      dress(sec);
    }
    if (refocus) opener.focus({ preventScroll: true });
  }

  function cancel() {
    if (!active) return;
    const back = before;
    leave();
    if (!sameLayout(back, cur)) commit(back);
    say('Customising cancelled. The layout is as it was.');
  }

  async function persist(btn, dashboard, after, message) {
    saving = true;
    try {
      await busy(btn, async () => {
        try { await save(dashboard); } catch (e) {
          toast(`Couldn’t save the layout. ${e?.message || ''}`.trim(), { kind: 'error', ms: 6000 });
          return; // still customising: nothing is lost
        }
        after();
        toast(message, { kind: 'ok' });
      });
    } finally { saving = false; }
  }

  function done(btn) {
    if (sameLayout(cur, before)) return leave(); // nothing changed: nothing to save
    // The default is saved as null, so a future default reaches a layout that never left it.
    return persist(btn, isDefault(cur, catalogue) ? null : toSaved(cur), leave, 'Layout saved');
  }

  const reset = btn => persist(btn, null, () => { leave(); commit(defaultLayout(catalogue)); }, 'Layout reset to default');

  function confirmReset(on) {
    confirmBox.hidden = !on;
    actions.hidden = on;
    (on ? confirmBox.querySelector('[data-lay-reset-no]') : resetBtn).focus();
  }

  function resize(id, span) {
    const next = setSpan(cur, id, span, catalogue);
    if (sameLayout(next, cur)) return;
    commit(next);
    const t = cur.find(x => x.id === id);
    say(`${title(id)}: ${widthChoices(known.get(id)).find(w => w.span === t.span).name}.`);
  }

  function hideTile(id) {
    const shown = visibleTiles(cur);
    if (shown.length <= 1) return say('The Overview keeps at least one card.');
    const i = shown.findIndex(t => t.id === id);
    commit(setHidden(cur, id, true));
    const after = visibleTiles(cur);
    sectionOf(after[Math.min(i, after.length - 1)].id).querySelector('[data-grip]')?.focus();
    say(`${title(id)} hidden. Add it back from Hidden cards.`);
  }

  function addTile(id, toIndex = Infinity) {
    commit(moveTile(setHidden(cur, id, false), id, toIndex));
    sectionOf(id).querySelector('[data-grip]')?.focus({ preventScroll: true });
    sectionOf(id).scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    say(`${title(id)} added at ${where(id)}.`);
  }

  // --- keyboard: the handle picks up, the arrows move, Space or Enter drops, Esc cancels ---

  function pick(id) {
    kb = { id, start: cur };
    sectionOf(id).classList.add('is-picked');
    say(`${title(id)} picked up, ${where(id)}. The arrow keys move it, Space drops it, Escape cancels.`);
  }

  function step(delta) {
    const shown = visibleTiles(cur);
    const to = shown.findIndex(t => t.id === kb.id) + delta;
    if (to < 0 || to >= shown.length) return say(`${title(kb.id)} is already ${to < 0 ? 'first' : 'last'}.`);
    commit(moveTile(cur, kb.id, to));
    sectionOf(kb.id).scrollIntoView({ block: 'nearest' });
    say(`${title(kb.id)} moved to ${where(kb.id)}.`);
  }

  function endPick(cancelled) {
    const { id, start } = kb;
    sectionOf(id).classList.remove('is-picked');
    kb = null;
    if (cancelled && !sameLayout(start, cur)) commit(start);
    say(cancelled ? `Move cancelled. ${title(id)} is back at ${where(id)}.` : `${title(id)} dropped at ${where(id)}.`);
  }

  function onKeyDown(e) {
    const grip = e.target.closest?.('[data-grip]');
    if (!grip || !active || saving || drag) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      return kb ? endPick(false) : pick(grip.dataset.grip);
    }
    if (!kb) return;
    if (STEP[e.key]) { e.preventDefault(); return step(STEP[e.key]); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endPick(true); }
  }
  // Space presses a button on keyup; the keydown already did the work.
  const onKeyUp = e => { if (e.key === ' ' && e.target.closest?.('[data-grip]')) e.preventDefault(); };
  // Tabbing away from a picked-up card drops it where it is. A move's own refocus is not a blur.
  const onFocusOut = e => { if (kb && !placing && e.target.dataset?.grip === kb.id) endPick(false); };

  function onDocKey(e) {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    e.preventDefault();
    if (drag) return endDrag(false);
    if (!confirmBox.hidden) return confirmReset(false);
    if (!saving) cancel();
  }

  // --- pointer: a ghost follows the pointer, a placeholder shows where the card will land ---

  function placeholder(id, span, height) {
    const ph = document.createElement('div');
    ph.className = `ov-drop tile--span-${span}${known.get(id).kind === 'kpi' ? ' ov-drop--kpi' : ''}`;
    ph.style.minHeight = `${Math.round(Math.min(height, DROP_MAX_H))}px`;
    ph.setAttribute('aria-hidden', 'true');
    return ph;
  }

  const isCard = el => el.classList.contains('ov-tile') && !el.hidden && !el.classList.contains('is-lifted');
  /** The visible card just before `node` in the grid, or null: where a placeholder put there follows. */
  function prevCard(node) {
    let p = node.previousElementSibling;
    while (p && !isCard(p)) p = p.previousElementSibling;
    return p;
  }
  const cardsBefore = node => { let n = 0; for (let p = prevCard(node); p; p = prevCard(p)) n++; return n; };

  function onPointerDown(e) {
    const src = e.target.closest('[data-grip], [data-add]');
    if (!src || !active || saving || kb || drag || e.button !== 0) return;
    const fromTray = src.dataset.add != null;
    drag = { id: fromTray ? src.dataset.add : src.dataset.grip, fromTray, src, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
    src.setPointerCapture?.(e.pointerId);
  }

  // The card itself is lifted out of the grid (so its map and charts come along), scaled to fit
  // the hand; a card from the tray is a copy of its chip, and gets a placeholder once over a card.
  function lift() {
    const d = drag;
    const ghost = d.fromTray ? d.src.cloneNode(true) : sectionOf(d.id);
    ghost.getAnimations().forEach(a => a.cancel()); // measured where it is, not mid-slide
    const r = (d.fromTray ? d.src : ghost).getBoundingClientRect();
    Object.assign(d, { lifted: true, ghost, ph: null });
    suppressClick = true; // the click that ends this press must not also press the chip
    if (d.fromTray) {
      ghost.removeAttribute('data-add');
      ghost.classList.add('ov-tray-ghost');
      ghost.setAttribute('aria-hidden', 'true');
      tray.append(ghost);
      d.phH = TRAY_DROP_H[known.get(d.id).kind] || TRAY_DROP_H.card;
    } else {
      d.ph = placeholder(d.id, cur.find(t => t.id === d.id).span, r.height);
      ghost.before(d.ph);
    }
    const h = Math.min(r.height, LIFT.clipH);
    const scale = d.fromTray ? 1 : Math.max(LIFT.minScale, Math.min(1, LIFT.maxW / r.width, LIFT.maxH / h));
    Object.assign(ghost.style, {
      position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${h}px`,
      margin: '0', zIndex: '60', transformOrigin: `${d.x0 - r.left}px ${d.y0 - r.top}px`,
    });
    ghost.style.setProperty('--ov-lift-scale', String(scale));
    ghost.classList.add('is-lifted');
    ghost.classList.toggle('is-clipped', h < r.height);
    requestAnimationFrame(() => ghost.classList.add('is-up'));
    dash.classList.add('is-dragging');
    d.raf = requestAnimationFrame(autoScroll);
  }

  function onPointerMove(e) {
    const d = drag;
    if (!d || e.pointerId !== d.pointerId) return;
    d.x = e.clientX;
    d.y = e.clientY;
    if (!d.lifted) {
      if (Math.hypot(d.x - d.x0, d.y - d.y0) < DRAG_START_PX) return;
      lift();
    }
    d.ghost.style.translate = `${d.x - d.x0}px ${d.y - d.y0}px`;
    hitTest();
  }

  // Over a card, the placeholder goes before it when the pointer is in its top-left half
  // (split on the diagonal, so wide and tall cards both read naturally), else after it.
  function hitTest() {
    const d = drag;
    const over = document.elementFromPoint(d.x, d.y)?.closest('.ov-tile');
    if (!over || !dash.contains(over) || !isCard(over)) return;
    const r = over.getBoundingClientRect();
    const before = (d.x - r.left) / r.width + (d.y - r.top) / r.height < 1;
    const anchor = before ? prevCard(over) : over;
    const was = d.ph?.isConnected ? prevCard(d.ph) : undefined;
    if (was === anchor) return;
    if (d.guard && d.guard.anchor === anchor && Math.hypot(d.x - d.guard.x, d.y - d.guard.y) < GUARD_PX) return;
    const first = rects();
    d.guard = { anchor: was, x: d.x, y: d.y };
    d.ph = d.ph || placeholder(d.id, cur.find(t => t.id === d.id).span, d.phH);
    if (before) over.before(d.ph); else over.after(d.ph);
    flip(first, d.ghost);
  }

  function autoScroll() {
    const d = drag;
    if (!d) return;
    const top = filters.getBoundingClientRect().bottom, bottom = window.innerHeight;
    let v = 0;
    if (d.y < top + EDGE_PX) v = -SCROLL_MAX_PX * Math.min(1, (top + EDGE_PX - d.y) / EDGE_PX);
    else if (d.y > bottom - EDGE_PX) v = SCROLL_MAX_PX * Math.min(1, (d.y - bottom + EDGE_PX) / EDGE_PX);
    const y = window.scrollY;
    if (v) window.scrollBy(0, Math.round(v));
    if (window.scrollY !== y) hitTest();
    d.raf = requestAnimationFrame(autoScroll);
  }

  function endDrag(drop) {
    const d = drag;
    if (!d) return;
    drag = null;
    cancelAnimationFrame(d.raf);
    if (d.src.hasPointerCapture?.(d.pointerId)) d.src.releasePointerCapture(d.pointerId);
    setTimeout(() => { suppressClick = false; }, 0); // after the click this pointerup produces
    if (!d.lifted) return;
    dash.classList.remove('is-dragging');
    const first = rects();
    const from = d.ghost.getBoundingClientRect();
    const k = d.ph?.isConnected ? cardsBefore(d.ph) : -1;
    if (d.fromTray) {
      // Dropped back on the tray, or never over a card: nothing happens.
      const back = tray.contains(document.elementFromPoint(d.x, d.y));
      d.ghost.remove();
      d.ph?.remove();
      return drop && k >= 0 && !back ? addTile(d.id, k) : flip(first);
    }
    d.ph.replaceWith(d.ghost);
    d.ghost.removeAttribute('style');
    d.ghost.classList.remove('is-lifted', 'is-up', 'is-clipped');
    commit(drop ? moveTile(cur, d.id, k) : cur, { first, settle: d.ghost, from });
    say(drop ? `${title(d.id)} moved to ${where(d.id)}.` : `Move cancelled. ${title(d.id)} is back at ${where(d.id)}.`);
  }

  const onPointerUp = e => { if (drag && e.pointerId === drag.pointerId) endDrag(e.type === 'pointerup'); };

  // --- clicks ---

  const BUTTONS = [
    ['[data-span]', b => resize(b.dataset.for, Number(b.dataset.span))], ['[data-hide]', b => hideTile(b.dataset.hide)],
    ['[data-add]', b => addTile(b.dataset.add)], ['[data-lay-done]', done], ['[data-lay-cancel]', cancel],
    ['[data-lay-reset]', () => confirmReset(true)], ['[data-lay-reset-no]', () => confirmReset(false)], ['[data-lay-reset-yes]', reset],
  ];

  function onClick(e) {
    const t = e.target;
    if (t.closest('[data-customise]')) return enter();
    if (!active || saving) return;
    if (suppressClick && t.closest('[data-add], [data-grip]')) { suppressClick = false; return; }
    const grip = t.closest('[data-grip]');
    // A click a screen reader sends (detail 0) works as Space; a mouse press on the handle is a drag.
    if (grip) { if (e.detail === 0 && !drag) { if (kb) endPick(false); else pick(grip.dataset.grip); } return; }
    for (const [sel, run] of BUTTONS) {
      const b = t.closest(sel);
      if (b) return run(b);
    }
  }

  const listeners = [['click', onClick], ['keydown', onKeyDown], ['keyup', onKeyUp], ['focusout', onFocusOut],
    ['pointerdown', onPointerDown], ['pointermove', onPointerMove], ['pointerup', onPointerUp], ['pointercancel', onPointerUp]];
  listeners.forEach(([type, fn]) => root.addEventListener(type, fn));

  return {
    /** Shows `layout` (outside customise mode: the saved one, on arrival). */
    apply(next) { if (!active && !sameLayout(next, cur)) commit(next, { first: new Map() }); },
    get active() { return active; },
    dress,
    cancel,
    destroy() {
      if (active) leave({ refocus: false });
      listeners.forEach(([type, fn]) => root.removeEventListener(type, fn));
    },
  };
}
