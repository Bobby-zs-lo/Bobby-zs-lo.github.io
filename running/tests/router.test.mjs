import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, buildHash } from '../js/router.js';

test('parses paths and defaults to today', () => {
  assert.deepEqual(parseHash(''), { path: 'today', rest: [], params: {}, known: true });
  assert.equal(parseHash('#').path, 'today');
  assert.equal(parseHash('#/').path, 'today');
  assert.equal(parseHash('#/plan').path, 'plan');
  assert.equal(parseHash('#plan').path, 'plan');
  assert.equal(parseHash('#/login').path, 'login');
});

test('query parameters', () => {
  const r = parseHash('#/settings?strava=ok');
  assert.equal(r.path, 'settings');
  assert.deepEqual(r.params, { strava: 'ok' });
  assert.deepEqual(parseHash('#/week?date=2026-10-19&x=a%20b').params, { date: '2026-10-19', x: 'a b' });
});

test('unknown routes are flagged and fall back to today', () => {
  const r = parseHash('#/nope/1');
  assert.equal(r.path, 'today');
  assert.equal(r.known, false);
  assert.deepEqual(parseHash('#/plan/12').rest, ['12']);
  assert.equal(parseHash('#/%E0%A4%A').known, false); // bad escape does not throw
});

test('buildHash round-trips and drops empty params', () => {
  assert.equal(buildHash('week', { date: '2026-10-19' }), '#/week?date=2026-10-19');
  assert.equal(buildHash('today', { a: null, b: '' }), '#/today');
  const h = buildHash('settings', { strava: 'error' });
  assert.deepEqual(parseHash(h).params, { strava: 'error' });
});
