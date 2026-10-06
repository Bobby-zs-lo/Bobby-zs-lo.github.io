// The Overview's layout (overview-model.js): the catalogue, the pure functions that edit a
// layout, and the saved shape, checked against the backend's contract for settings.dashboard.
// Customise mode's DOM side (overview-layout.js: drag, keyboard, save) is covered on the
// preview server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOGUE, LAYOUT_VERSION, clampSpan, defaultLayout, resolveLayout, visibleTiles, moveTile, setSpan,
  setHidden, toSaved, sameLayout, isDefault, widthChoices,
} from '../js/views/overview-model.js';
import { toolbar, trayChips } from '../js/views/tiles.js';
import { toString } from '../js/dom.js';

// The backend's rules (functions/src/service.js validateDashboard), restated: a saved layout
// that passes here is one PUT /api/settings accepts.
const SPANS = [2, 3, 4, 6, 8, 12];
const ID = /^[a-z][a-z0-9-]{0,31}$/;
function contractErrors(d) {
  if (d === null) return [];
  const errs = [];
  if (!d || typeof d !== 'object' || Object.keys(d).sort().join() !== 'tiles,version') errs.push('shape');
  if (d.version !== 1) errs.push('version');
  if (!Array.isArray(d.tiles) || d.tiles.length < 1 || d.tiles.length > 40) return [...errs, 'tiles'];
  const seen = new Set();
  for (const t of d.tiles) {
    if (Object.keys(t).sort().join() !== 'hidden,id,span') errs.push(`keys of ${t.id}`);
    if (typeof t.id !== 'string' || !ID.test(t.id) || seen.has(t.id)) errs.push(`id ${t.id}`);
    seen.add(t.id);
    if (!SPANS.includes(t.span)) errs.push(`span of ${t.id}`);
    if (typeof t.hidden !== 'boolean') errs.push(`hidden of ${t.id}`);
  }
  return errs;
}

const ids = layout => layout.map(t => t.id);
const shownIds = layout => ids(visibleTiles(layout));
const byId = (layout, id) => layout.find(t => t.id === id);
const entry = id => CATALOGUE.find(c => c.id === id);

test('the catalogue: unique ids the backend accepts, defaults among each card’s widths, every width named', () => {
  assert.equal(new Set(ids(CATALOGUE)).size, CATALOGUE.length);
  assert.ok(CATALOGUE.length <= 40);
  for (const c of CATALOGUE) {
    assert.match(c.id, ID);
    assert.ok(c.widths.includes(c.span), `${c.id} default width`);
    assert.ok(c.widths.every(w => SPANS.includes(w)), `${c.id} widths`);
    assert.ok(widthChoices(c).every(w => /^(S|M|L|XL)$/.test(w.size) && w.name && w.share), `${c.id} width names`);
  }
});

test('the default order is the one the Overview had: the KPI band, the charts, the table', () => {
  assert.deepEqual(ids(defaultLayout()), [
    'kpi-race', 'kpi-week', 'kpi-plan', 'kpi-easy', 'kpi-form', 'kpi-phase', 'volume', 'heatmap', 'zones',
    'efficiency', 'fitness', 'calendar', 'health', 'last', 'next', 'table',
  ]);
  assert.deepEqual(defaultLayout().map(t => t.span), [2, 2, 2, 2, 2, 2, 8, 4, 4, 4, 4, 8, 4, 6, 6, 12]);
  assert.ok(defaultLayout().every(t => t.hidden === false));
});

test('width names: one ladder for the KPIs, one for the cards, so L is the same width on every chart', () => {
  assert.deepEqual(widthChoices(entry('kpi-race')).map(w => w.size), ['S', 'M', 'L']);
  assert.deepEqual(widthChoices(entry('heatmap')).map(w => [w.span, w.size]), [[4, 'S'], [6, 'M'], [8, 'L'], [12, 'XL']]);
  assert.deepEqual(widthChoices(entry('volume')).map(w => [w.span, w.size]), [[6, 'M'], [8, 'L'], [12, 'XL']]);
  assert.deepEqual(widthChoices(entry('table')).map(w => w.size), ['L', 'XL']);
  assert.equal(widthChoices(entry('volume')).find(w => w.span === 12).name, 'Extra large');
});

test('nothing saved, or something that is not a layout, gives the default', () => {
  for (const saved of [null, undefined, 'x', 42, [], {}, { version: 2, tiles: [{ id: 'volume', span: 12, hidden: false }] }, { version: 1, tiles: 'no' }]) {
    assert.ok(isDefault(resolveLayout(saved)), JSON.stringify(saved));
  }
});

test('a saved layout keeps its order, widths and hidden cards', () => {
  const saved = { version: 1, tiles: [
    { id: 'heatmap', span: 8, hidden: false }, { id: 'volume', span: 12, hidden: false }, { id: 'efficiency', span: 4, hidden: true },
  ] };
  const layout = resolveLayout(saved);
  assert.deepEqual(layout.slice(0, 3), saved.tiles);
  assert.equal(layout.length, CATALOGUE.length);
});

test('unknown cards and repeats are dropped; cards the layout never knew come back at the end, shown, at their default width', () => {
  const layout = resolveLayout({ version: 1, tiles: [
    { id: 'gone-tile', span: 4, hidden: false }, null, 'table', { id: 'table', span: 8, hidden: true },
    { id: 'table', span: 12, hidden: false }, { id: '__proto__', span: 4, hidden: false }, { id: 'kpi-race', span: 3, hidden: false },
  ] });
  assert.deepEqual(ids(layout).slice(0, 2), ['table', 'kpi-race']);
  assert.deepEqual(byId(layout, 'table'), { id: 'table', span: 8, hidden: true });
  assert.equal(layout.length, CATALOGUE.length);
  const rest = layout.slice(2);
  assert.deepEqual(ids(rest), ids(CATALOGUE).filter(id => id !== 'table' && id !== 'kpi-race'));
  assert.ok(rest.every(t => t.hidden === false && t.span === entry(t.id).span));
});

test('a width a card does not allow becomes the nearest it does (a tie goes wider); a non-number, the default', () => {
  const layout = resolveLayout({ version: 1, tiles: [
    { id: 'volume', span: 4, hidden: false }, { id: 'table', span: 6, hidden: false }, { id: 'health', span: 12, hidden: false },
    { id: 'kpi-week', span: 12, hidden: false }, { id: 'heatmap', span: 5, hidden: false }, { id: 'zones', span: '8', hidden: false },
    { id: 'next', span: Number.NaN, hidden: 'yes' },
  ] });
  assert.equal(byId(layout, 'volume').span, 6);
  assert.equal(byId(layout, 'table').span, 8);
  assert.equal(byId(layout, 'health').span, 8);
  assert.equal(byId(layout, 'kpi-week').span, 4);
  assert.equal(byId(layout, 'heatmap').span, 6);
  assert.equal(byId(layout, 'zones').span, 4);
  assert.deepEqual(byId(layout, 'next'), { id: 'next', span: 6, hidden: false }); // only true hides
  assert.equal(clampSpan(7, entry('heatmap')), 8);
  assert.equal(clampSpan(Infinity, entry('heatmap')), 4);
});

test('moveTile: to a position among the visible cards, clamped; hidden cards take no position', () => {
  const base = defaultLayout();
  assert.deepEqual(shownIds(moveTile(base, 'heatmap', 0)).slice(0, 2), ['heatmap', 'kpi-race']);
  assert.deepEqual(shownIds(moveTile(base, 'kpi-race', 99)).slice(-2), ['table', 'kpi-race']);
  assert.deepEqual(shownIds(moveTile(base, 'table', -5))[0], 'table');
  const hidden = setHidden(setHidden(base, 'kpi-race', true), 'kpi-week', true);
  const moved = moveTile(hidden, 'heatmap', 1);
  assert.deepEqual(shownIds(moved).slice(0, 3), ['kpi-plan', 'heatmap', 'kpi-easy']);
  assert.equal(moved.length, base.length);
  assert.equal(moveTile(base, 'nope', 0), base);
  assert.deepEqual(ids(moveTile(base, 'zones', Number.NaN))[0], 'zones');
});

test('the edits never change the layout they are given', () => {
  const base = defaultLayout();
  const copy = JSON.stringify(base);
  moveTile(base, 'table', 0);
  setSpan(base, 'volume', 12);
  setHidden(base, 'zones', true);
  assert.equal(JSON.stringify(base), copy);
  assert.ok(Object.isFrozen(base) && Object.isFrozen(base[0]));
});

test('setSpan: an allowed width is set, any other clamped; an unknown card changes nothing', () => {
  const base = defaultLayout();
  assert.equal(byId(setSpan(base, 'volume', 12), 'volume').span, 12);
  assert.equal(byId(setSpan(base, 'volume', 2), 'volume').span, 6);
  assert.equal(setSpan(base, 'nope', 4), base);
  assert.deepEqual(ids(setSpan(base, 'volume', 12)), ids(base));
});

test('setHidden: a hidden card keeps its place; shown again it goes to the end', () => {
  const base = defaultLayout();
  const hidden = setHidden(base, 'efficiency', true);
  assert.deepEqual(ids(hidden), ids(base));
  assert.ok(!shownIds(hidden).includes('efficiency'));
  const back = setHidden(hidden, 'efficiency', false);
  assert.deepEqual(shownIds(back).slice(-2), ['table', 'efficiency']);
  assert.equal(byId(back, 'efficiency').span, 4);
  assert.equal(setHidden(base, 'efficiency', false), base);
  assert.equal(setHidden(base, 'nope', true), base);
});

test('toSaved: the contract’s shape, which resolveLayout reads back unchanged', () => {
  const layout = setHidden(setSpan(moveTile(defaultLayout(), 'heatmap', 0), 'volume', 12), 'efficiency', true);
  const saved = toSaved(layout);
  assert.deepEqual(contractErrors(saved), []);
  assert.equal(saved.version, LAYOUT_VERSION);
  assert.deepEqual(saved.tiles[0], { id: 'heatmap', span: 4, hidden: false });
  assert.ok(sameLayout(resolveLayout(JSON.parse(JSON.stringify(saved))), layout));
  assert.deepEqual(contractErrors(toSaved(defaultLayout())), []);
});

test('isDefault and sameLayout: any move, width or hidden card is a change', () => {
  const base = defaultLayout();
  assert.ok(isDefault(base) && isDefault(resolveLayout(toSaved(base))));
  assert.ok(!isDefault(moveTile(base, 'table', 0)));
  assert.ok(!isDefault(setSpan(base, 'table', 8)));
  assert.ok(!isDefault(setHidden(base, 'table', true)));
  assert.ok(isDefault(moveTile(moveTile(base, 'table', 0), 'table', 99)));
  assert.ok(!sameLayout(base, base.slice(1)) && !sameLayout(base, null));
});

test('the toolbar names its card in every control and says which width is pressed; titles are escaped', () => {
  const card = { id: 'zones', title: 'Pace <zones>', widths: [4, 6], span: 4, kind: 'card' };
  const out = toString(toolbar(card, 6, widthChoices(card)));
  assert.match(out, /aria-label="Move Pace &lt;zones&gt;"/);
  assert.match(out, /aria-label="Hide Pace &lt;zones&gt;"/);
  assert.match(out, /data-span="4"[^>]*aria-pressed="false"/);
  assert.match(out, /data-span="6"[^>]*aria-pressed="true"/);
  assert.ok(!out.includes('<zones>'));
  assert.match(toString(trayChips([])), /Nothing hidden/);
  assert.match(toString(trayChips([entry('heatmap')])), /data-add="heatmap" aria-label="Add Heatmap"/);
});
