// Tests for the pure geometry/export helpers (distance, sampling, GPX, map-app deep links).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm, pathKm, bbox, samplePoints, buildGpx, googleMapsUrl, cccUrl, gpxFilename } from '../js/geo.js';

test('haversine: 1° of latitude ≈ 111.2 km', () => {
  assert.ok(Math.abs(haversineKm([55, 12], [56, 12]) - 111.19) < 0.05);
});

test('haversine: identical points are 0 km', () => {
  assert.equal(haversineKm([55.5, 12.5], [55.5, 12.5]), 0);
});

test('pathKm sums legs', () => {
  assert.ok(Math.abs(pathKm([[55, 12], [56, 12], [55, 12]]) - 222.39) < 0.1);
});

test('pathKm of fewer than two points is 0', () => {
  assert.equal(pathKm([]), 0);
  assert.equal(pathKm([[55, 12]]), 0);
});

test('bbox', () => {
  assert.deepEqual(bbox([[1, 5], [3, 2], [2, 9]]), [[1, 2], [3, 9]]);
  assert.equal(bbox([]), null);
});

test('bbox of a single point is that point twice', () => {
  assert.deepEqual(bbox([[4, 7]]), [[4, 7], [4, 7]]);
});

test('samplePoints spaces by distance and excludes the ends', () => {
  const line = Array.from({ length: 101 }, (_, i) => [55, 12 + i * 0.001]);
  const s = samplePoints(line, 4);
  assert.deepEqual(s.map(p => p[1]), [12.02, 12.04, 12.06, 12.08]);
});

test('samplePoints on sparse geometry never returns an end or a repeat', () => {
  // A 5-vertex closed loop asked for 9 samples: only the 3 interior vertices exist to pick.
  const line = [[55, 12], [55.01, 12], [55.01, 12.01], [55, 12.01], [55, 12]];
  const s = samplePoints(line, 9);
  assert.equal(new Set(s).size, s.length);
  assert.ok(!s.includes(line[0]) && !s.includes(line[4]));
  assert.deepEqual(s, [line[1], line[2], line[3]]);
});

test('samplePoints picks by distance, not by index', () => {
  // Three vertices bunched at the start, then long legs: the halfway point by distance is the
  // vertex at 12.1 (index 3), whereas the middle by index would be 12.002 (index 2).
  const line = [[55, 12], [55, 12.001], [55, 12.002], [55, 12.1], [55, 12.2]];
  assert.deepEqual(samplePoints(line, 1), [[55, 12.1]]);
});

test('samplePoints with fewer than 3 points is empty', () => {
  assert.deepEqual(samplePoints([], 4), []);
  assert.deepEqual(samplePoints([[55, 12]], 4), []);
  assert.deepEqual(samplePoints([[55, 12], [55, 12.1]], 4), []);
});

test('samplePoints with n < 1 is empty', () => {
  const line = [[55, 12], [55, 12.1], [55, 12.2]];
  assert.deepEqual(samplePoints(line, 0), []);
});

test('buildGpx makes a GPX 1.1 track with elevation and escapes the name', () => {
  const x = buildGpx({ name: 'Run <18 km>', points: [[55.1, 12.2], [55.2, 12.3]], elevations: [5, null] });
  assert.match(x, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(x, /<gpx version="1.1" creator="Running"/);
  assert.match(x, /<name>Run &lt;18 km&gt;<\/name>/);
  assert.match(x, /<trkpt lat="55.10000" lon="12.20000"><ele>5<\/ele><\/trkpt>/);
  assert.match(x, /<trkpt lat="55.20000" lon="12.30000"\/>/);
});

test('buildGpx declares the GPX 1.1 namespace and nests metadata, trk and trkseg', () => {
  const x = buildGpx({ name: 'A', points: [[55, 12]] });
  assert.match(x, /xmlns="http:\/\/www\.topografix\.com\/GPX\/1\/1"/);
  assert.match(x, /<metadata><name>A<\/name><\/metadata>/);
  assert.match(x, /<trk><name>A<\/name><trkseg>/);
  assert.match(x, /<\/trkseg><\/trk>\s*<\/gpx>\s*$/);
});

test('buildGpx escapes all five XML special characters in the name', () => {
  const x = buildGpx({ name: `a&b<c>d"e'f`, points: [[55, 12]] });
  assert.match(x, /<name>a&amp;b&lt;c&gt;d&quot;e&apos;f<\/name>/);
});

test('buildGpx adds a metadata time only when one is given', () => {
  assert.doesNotMatch(buildGpx({ name: 'A', points: [[55, 12]] }), /<time>/);
  const x = buildGpx({ name: 'A', points: [[55, 12]], time: '2026-10-10T08:00:00Z' });
  assert.match(x, /<metadata><name>A<\/name><time>2026-10-10T08:00:00Z<\/time><\/metadata>/);
});

test('buildGpx rounds elevation to 1 decimal and drops a trailing .0', () => {
  const x = buildGpx({ name: 'A', points: [[55, 12], [55, 12.1], [55, 12.2], [55, 12.3]], elevations: [12.34, 7.0, 0, NaN] });
  assert.match(x, /<ele>12\.3<\/ele>/);
  assert.match(x, /<ele>7<\/ele>/);
  assert.match(x, /<ele>0<\/ele>/);
  assert.match(x, /<trkpt lat="55.00000" lon="12.30000"\/>/);
});

test('googleMapsUrl: ≤ 9 waypoints, origin/destination, mode', () => {
  const line = Array.from({ length: 50 }, (_, i) => [55 + i * 0.001, 12]);
  const u = new URL(googleMapsUrl(line, 'walking'));
  assert.equal(u.origin + u.pathname, 'https://www.google.com/maps/dir/');
  assert.equal(u.searchParams.get('api'), '1');
  assert.equal(u.searchParams.get('origin'), '55.00000,12.00000');
  assert.equal(u.searchParams.get('destination'), '55.04900,12.00000');
  assert.equal(u.searchParams.get('travelmode'), 'walking');
  assert.equal(u.searchParams.get('waypoints').split('|').length, 9);
});

test('googleMapsUrl omits waypoints when the route is too short to sample', () => {
  const u = new URL(googleMapsUrl([[55, 12], [55.1, 12.1]], 'driving'));
  assert.equal(u.searchParams.has('waypoints'), false);
  assert.equal(u.searchParams.get('destination'), '55.10000,12.10000');
});

test('googleMapsUrl defaults the travel mode to walking', () => {
  const u = new URL(googleMapsUrl([[55, 12], [55.1, 12.1]]));
  assert.equal(u.searchParams.get('travelmode'), 'walking');
});

test('googleMapsUrl returns null with fewer than 2 points or no array', () => {
  assert.equal(googleMapsUrl([], 'walking'), null);
  assert.equal(googleMapsUrl([[55, 12]], 'walking'), null);
  assert.equal(googleMapsUrl(null, 'walking'), null);
  assert.equal(googleMapsUrl(undefined), null);
});

test('buildGpx tolerates null elevations', () => {
  const x = buildGpx({ name: 'A', points: [[55, 12]], elevations: null });
  assert.match(x, /<trkpt lat="55.00000" lon="12.00000"\/>/);
  assert.doesNotMatch(x, /<ele>/);
});

test('buildGpx falls back to "Route" when the name is missing or empty', () => {
  for (const name of [undefined, null, '']) {
    const x = buildGpx({ name, points: [[55, 12]] });
    assert.match(x, /<metadata><name>Route<\/name><\/metadata>/);
    assert.match(x, /<trk><name>Route<\/name><trkseg>/);
  }
});

test('buildGpx strips XML-invalid control characters from the name but keeps tab/newline', () => {
  const x = buildGpx({ name: 'A\u0000B\u0008C\u000BD\u000CE\u001FF\tG\nH', points: [[55, 12]] });
  assert.ok(x.includes('<name>ABCDEF\tG\nH</name>'));
  // A name that is nothing but control characters is as good as missing.
  assert.match(buildGpx({ name: '\u0000\u0001', points: [[55, 12]] }), /<name>Route<\/name>/);
});

test('cccUrl', () => {
  assert.equal(cccUrl([55.676123, 12.568341], 80.4), 'https://www.ccc-bike.com/app/?start=55.67612%2C12.56834&km=80&mode=loop');
});

test('cccUrl returns null when the distance or coordinates are not finite', () => {
  assert.equal(cccUrl([55, 12], NaN), null);
  assert.equal(cccUrl([55, 12], Infinity), null);
  assert.equal(cccUrl([55, 12], undefined), null);
  assert.equal(cccUrl([NaN, 12], 80), null);
  assert.equal(cccUrl([55, Infinity], 80), null);
  assert.equal(cccUrl([55], 80), null);
  assert.equal(cccUrl(null, 80), null);
});

test('gpxFilename', () => {
  assert.equal(gpxFilename('run', 18.24, '2026-10-10'), 'run-18km-2026-10-10.gpx');
});
