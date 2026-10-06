// Tests for js/map.js: the loader's retry behaviour, fit()'s input handling, destroy()'s safety,
// and the scheme re-colouring's bookkeeping. Leaflet itself is not loaded: a fake document records
// what the loader appends, a fake ctx records what fit() and destroy() ask of the map, and a fake L
// stands in for the layers. Drawing is checked by screenshot, not here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEAFLET, loadLeaflet, fit, destroy } from '../js/map.js';

// The loader keeps its promise at module level, so a test that needs a clean one imports its own copy.
let copies = 0;
const freshMapModule = () => import(`../js/map.js?copy=${++copies}`);

function fakeDom() {
  const appended = [];
  const node = tag => {
    const handlers = {};
    return {
      tag, removed: false,
      addEventListener: (type, fn) => { handlers[type] = fn; },
      remove() { this.removed = true; },
      fire: type => handlers[type](),
    };
  };
  globalThis.window = {};
  globalThis.document = {
    createElement: node,
    head: { appendChild: n => { appended.push(n); } },
    // Only the one query map.js makes: the stylesheet links still on the page.
    querySelectorAll: sel => {
      assert.equal(sel, 'link[rel="stylesheet"]');
      return appended.filter(n => n.tag === 'link' && n.rel === 'stylesheet' && !n.removed);
    },
  };
  return appended;
}

test('Leaflet is pinned to cdnjs with integrity hashes for both files', () => {
  for (const key of ['js', 'css']) {
    assert.match(LEAFLET[key], /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\/1\.9\.4\//);
    assert.match(LEAFLET[`${key}Sri`], /^sha512-[A-Za-z0-9+/]+=*$/);
  }
});

test('loadLeaflet: both files are requested with SRI and anonymous CORS', async () => {
  const appended = fakeDom();
  const p = loadLeaflet();
  assert.equal(appended.length, 2);
  const [css, js] = appended;
  assert.equal(css.href, LEAFLET.css);
  assert.equal(css.integrity, LEAFLET.cssSri);
  assert.equal(js.src, LEAFLET.js);
  assert.equal(js.integrity, LEAFLET.jsSri);
  assert.ok(appended.every(n => n.crossOrigin === 'anonymous'));
  assert.equal(loadLeaflet(), p, 'a second call joins the first');
  // Leave the memo clean for the next test: fail the pending load.
  js.fire('error');
  await assert.rejects(p);
});

test('loadLeaflet: a failure removes the tags and the next call is a real retry', async () => {
  const appended = fakeDom();
  const first = loadLeaflet();
  appended[1].fire('error');
  await assert.rejects(first, /could not be loaded/);
  assert.ok(appended.every(n => n.removed), 'failed tags are taken out of the page');

  const second = loadLeaflet();
  assert.notEqual(second, first);
  assert.equal(appended.length, 4, 'a retry appends fresh tags');
  const L = { map() {} };
  globalThis.window.L = L;
  appended[2].fire('load');
  appended[3].fire('load');
  assert.equal(await second, L);
  assert.equal(await loadLeaflet(), L, 'after a success the same Leaflet is handed out');
  assert.equal(appended.length, 4, 'and no further tags are added');
});

const fakeCtx = () => {
  const calls = { fit: [], remove: 0, listeners: [] };
  return {
    calls,
    ctx: {
      L: { latLngBounds: points => ({ points }) },
      map: { fitBounds: (bounds, opts) => calls.fit.push({ bounds, opts }), remove: () => { calls.remove++; } },
      themed: [() => {}],
      scheme: { mq: { removeEventListener: (type, fn) => calls.listeners.push([type, fn]) }, onChange: () => {} },
      destroyed: false,
    },
  };
};

test('fit: empty or unusable input does nothing', () => {
  const { ctx, calls } = fakeCtx();
  fit(ctx, []);
  fit(ctx, null);
  fit(ctx, [[], [null, 1], ['a', 'b']]);
  assert.equal(calls.fit.length, 0);
});

test('fit: frames a flat list of points with the padding on both axes', () => {
  const { ctx, calls } = fakeCtx();
  const pts = [[55.1, 12.1], [55.2, 12.3]];
  fit(ctx, pts, { padding: 10 });
  assert.deepEqual(calls.fit[0].bounds.points, pts);
  assert.deepEqual(calls.fit[0].opts.padding, [10, 10]);
  assert.equal(calls.fit[0].opts.animate, false);
});

test('fit: a list of routes is flattened, and bad points are skipped', () => {
  const { ctx, calls } = fakeCtx();
  fit(ctx, [[[55, 12], [55.1, 12.1]], [[56, 13], [NaN, 2]], []]);
  assert.deepEqual(calls.fit[0].bounds.points, [[55, 12], [55.1, 12.1], [56, 13]]);
  assert.deepEqual(calls.fit[0].opts.padding, [24, 24], 'the default padding');
});

test('destroy: removes the scheme listener and the map, once', () => {
  const { ctx, calls } = fakeCtx();
  destroy(ctx);
  destroy(ctx);
  assert.equal(calls.remove, 1);
  assert.equal(calls.listeners.length, 1);
  assert.equal(calls.listeners[0][0], 'change');
  assert.equal(ctx.themed.length, 0);
});

test('destroy: null and undefined are fine', () => {
  assert.doesNotThrow(() => destroy(null));
  assert.doesNotThrow(() => destroy(undefined));
});

test('loadLeaflet: a Leaflet already on the page still waits for its stylesheet', async () => {
  const { loadLeaflet: load } = await freshMapModule();
  const appended = fakeDom();
  const L = { map() {} };
  globalThis.window.L = L;
  const p = load();
  assert.deepEqual(appended.map(n => n.tag), ['link'], 'only the missing stylesheet is added');
  assert.equal(appended[0].href, LEAFLET.css);
  assert.equal(appended[0].integrity, LEAFLET.cssSri);
  appended[0].fire('load');
  assert.equal(await p, L);
});

test('loadLeaflet: with Leaflet and its stylesheet both on the page nothing is added', async () => {
  const { loadLeaflet: load } = await freshMapModule();
  const appended = fakeDom();
  appended.push({ tag: 'link', rel: 'stylesheet', href: LEAFLET.css, removed: false });
  const L = { map() {} };
  globalThis.window.L = L;
  assert.equal(await load(), L);
  assert.equal(appended.length, 1);
});

// --- scheme re-colouring --------------------------------------------------------

// Just enough Leaflet for createMap and the layer helpers: layers that are evented (on, once,
// fire), go on and off a map (a layer taken off fires 'remove', as Leaflet's does), and record
// their styles and tooltip.
function fakeLeaflet() {
  const evented = () => {
    const handlers = {};
    return {
      on(type, fn) { (handlers[type] ||= []).push({ fn, once: false }); return this; },
      once(type, fn) { (handlers[type] ||= []).push({ fn, once: true }); return this; },
      fire(type) {
        const due = handlers[type] || [];
        handlers[type] = due.filter(h => !h.once);
        due.forEach(h => h.fn());
        return this;
      },
    };
  };
  const layer = options => Object.assign(evented(), {
    options, styles: [], tooltip: null, children: [], map: null,
    setStyle(style) { this.styles.push(style); return this; },
    bindTooltip(content) { this.tooltip = content; return this; },
    bringToFront() { return this; },
    addLayer(child) { this.children.push(child); return this; },
    eachLayer(fn) { this.children.forEach(fn); },
    addTo(map) { this.map = map; map.layers.add(this); return this; },
    remove() {
      if (!this.map || !this.map.layers.delete(this)) return this;
      this.map = null;
      this.children.forEach(child => child.fire('remove'));
      return this.fire('remove');
    },
  });
  const L = {
    canvas: () => ({}),
    tileLayer: (url, options) => layer(options),
    polyline: (points, options) => layer(options),
    circleMarker: (point, options) => layer(options),
    layerGroup: () => layer({}),
    map: () => Object.assign(evented(), {
      layers: new Set(),
      attributionControl: { setPrefix() {} },
      setView() { return this; },
      hasLayer(l) { return this.layers.has(l); },
      remove() { [...this.layers].forEach(l => l.remove()); },
    }),
  };
  return L;
}

async function fakeMap() {
  const lib = await freshMapModule();
  const appended = fakeDom();
  appended.push({ tag: 'link', rel: 'stylesheet', href: LEAFLET.css, removed: false });
  globalThis.window.L = fakeLeaflet();
  const colours = { '--accent': 'red', '--card': 'white' };
  globalThis.document.documentElement = {};
  globalThis.getComputedStyle = () => ({ getPropertyValue: name => colours[name] || '' });
  const mq = { listeners: [], addEventListener(type, fn) { this.listeners.push(fn); }, removeEventListener(type, fn) { this.listeners = this.listeners.filter(f => f !== fn); } };
  globalThis.matchMedia = () => mq;
  const ctx = await lib.createMap({});
  const flipScheme = accent => { colours['--accent'] = accent; mq.listeners.forEach(fn => fn()); };
  return { lib, ctx, mq, flipScheme };
}

const ROUTE = [[55.68, 12.57], [55.69, 12.58]];
const lastStyle = layer => layer.styles[layer.styles.length - 1];

test('theming: a layer taken off the map takes its re-colouring with it', async () => {
  const { lib, ctx, flipScheme } = await fakeMap();
  // What Overview does on every week click: the heat and pick layers are swapped for new ones.
  let heat = null, pick = null;
  for (let i = 0; i < 200; i++) {
    if (heat) heat.remove();
    if (pick) pick.remove();
    heat = lib.addLines(ctx, [{ id: 1, points: ROUTE }, { id: 2, points: ROUTE }]);
    pick = lib.addLines(ctx, [{ id: 1, points: ROUTE }], { weight: 3, opacity: 0.95 });
  }
  assert.equal(ctx.themed.length, 2, 'only the two live layers are tracked');

  const line = lib.addLine(ctx, ROUTE);
  const start = lib.addStart(ctx, ROUTE[0]);
  assert.equal(ctx.themed.length, 4);
  flipScheme('coral');
  assert.equal(lastStyle(line).color, 'coral');
  assert.equal(lastStyle(start).color, 'coral');
  assert.ok(heat.children.every(l => lastStyle(l).color === 'coral'), 'every line of a group is re-coloured');

  line.remove();
  start.remove();
  heat.remove();
  assert.equal(ctx.themed.length, 1);
  lib.destroy(ctx);
  assert.equal(ctx.themed.length, 0);
});

test('theming: a line with a fixed colour is never tracked', async () => {
  const { lib, ctx } = await fakeMap();
  lib.addLine(ctx, ROUTE, { color: '#123456' });
  lib.addLines(ctx, [{ id: 1, points: ROUTE }], { color: '#123456' });
  assert.equal(ctx.themed.length, 0);
});

test('addLine: a tooltip is text, never markup', async () => {
  const { lib, ctx } = await fakeMap();
  const text = '<img src=x onerror=alert(1)> A · 5 km';
  const line = lib.addLine(ctx, ROUTE, { tooltip: text, color: '#123456' });
  assert.equal(typeof line.tooltip, 'object', 'an element, which Leaflet appends rather than parsing');
  assert.equal(line.tooltip.textContent, text);
  assert.equal(line.options.interactive, true);
});

test('the OpenStreetMap credit opens in a new tab without handing it the page', async () => {
  const { ctx } = await fakeMap();
  assert.match(ctx.tiles.options.attribution, /<a href="https:\/\/www\.openstreetmap\.org\/copyright" target="_blank" rel="noopener">/);
  assert.equal(ctx.tiles.options.referrerPolicy, 'origin');
});
