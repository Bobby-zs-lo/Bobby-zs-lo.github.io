// Tests for the encoded-polyline codec (Google's algorithm, used for route geometry).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodePolyline, encodePolyline } from '../js/polyline.js';

const REF_STR = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
const REF_PTS = [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]];

test('decodes Google\'s reference example', () => {
  assert.deepEqual(decodePolyline(REF_STR), REF_PTS);
});

test('encodes Google\'s reference example', () => {
  assert.equal(encodePolyline(REF_PTS), REF_STR);
});

test('round-trips', () => {
  const pts = [[55.67612, 12.56834], [55.6801, 12.57], [55.67612, 12.56834]];
  assert.deepEqual(decodePolyline(encodePolyline(pts)), pts);
});

test('empty and junk are empty arrays', () => {
  assert.deepEqual(decodePolyline(''), []);
  assert.deepEqual(decodePolyline(null), []);
  assert.deepEqual(decodePolyline(undefined), []);
  assert.deepEqual(decodePolyline(42), []);
  assert.deepEqual(decodePolyline({}), []);
});

test('encoding no points gives an empty string', () => {
  assert.equal(encodePolyline([]), '');
});

test('a malformed tail stops decoding instead of throwing', () => {
  // Truncate mid-number: the first point is complete, the second is cut off.
  const truncated = REF_STR.slice(0, 14);
  assert.doesNotThrow(() => decodePolyline(truncated));
  assert.deepEqual(decodePolyline(truncated), [[38.5, -120.2]]);
  // A lone lat without its lng is dropped, not half-emitted.
  assert.deepEqual(decodePolyline('_p~iF'), []);
});

test('negative coordinates and the equator/meridian round-trip', () => {
  const pts = [[0, 0], [-33.8688, 151.2093], [-0.00001, -0.00001]];
  assert.deepEqual(decodePolyline(encodePolyline(pts)), pts);
});

test('precision 6 round-trips six decimals', () => {
  const pts = [[55.676123, 12.568341], [55.680101, 12.570002]];
  assert.deepEqual(decodePolyline(encodePolyline(pts, 6), 6), pts);
});

test('precision 7 round-trips, including deltas beyond 32 bits', () => {
  // Sydney -> Copenhagen-ish jumps are ~1.6e9 in 1e-7 units, past what bit operators can hold.
  const pts = [[55.6761234, 12.5683412], [-33.8688197, 151.2092955], [89.9999999, -179.9999999]];
  assert.deepEqual(decodePolyline(encodePolyline(pts, 7), 7), pts);
});

test('encoding skips malformed and non-finite points', () => {
  const good = [[38.5, -120.2], [40.7, -120.95]];
  const messy = [good[0], null, [NaN, 1], [1], [Infinity, 2], [3, -Infinity], 'ab', {}, ['55', '12'], good[1]];
  assert.equal(encodePolyline(messy), encodePolyline(good));
});

test('encoding a non-array is an empty string', () => {
  assert.equal(encodePolyline(null), '');
  assert.equal(encodePolyline(undefined), '');
});

test('a value too large for a safe integer stops decoding', () => {
  // 14 continuation chars carry 14 * 5 = 70 bits: far past 2^53.
  const overflow = '~'.repeat(14) + '?';
  assert.deepEqual(decodePolyline(overflow + '??'), []);
  // Points decoded before the bad value are kept.
  assert.deepEqual(decodePolyline(encodePolyline([[38.5, -120.2]]) + overflow + '??'), [[38.5, -120.2]]);
});

test('decoded values are rounded to the precision (no float noise)', () => {
  const [[lat, lng]] = decodePolyline(encodePolyline([[55.67612, 12.56834]]));
  assert.equal(lat, 55.67612);
  assert.equal(lng, 12.56834);
});
