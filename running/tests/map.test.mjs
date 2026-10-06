// Tests for js/map.js: the loader's retry behaviour, fit()'s input handling and destroy()'s safety.
// Leaflet itself is not loaded: a fake document records what the loader appends, and a fake ctx
// records what fit() and destroy() ask of the map. Drawing is checked by screenshot, not here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEAFLET, loadLeaflet, fit, destroy } from '../js/map.js';

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
  globalThis.document = { createElement: node, head: { appendChild: n => { appended.push(n); } } };
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
