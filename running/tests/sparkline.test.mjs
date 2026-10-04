import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSparkPath, sparklineSvg } from '../js/sparkline.js';

test('maps min to bottom and max to top inside the padding', () => {
  const { d, points, min, max, last } = buildSparkPath([10, 20, 15], { width: 104, height: 24, pad: 2 });
  assert.equal(min, 10); assert.equal(max, 20); assert.equal(last, 15);
  assert.deepEqual(points.map(p => [p.x, p.y]), [[2, 22], [52, 2], [102, 12]]);
  assert.equal(d, 'M2 22L52 2L102 12');
});

test('null values split the line into segments', () => {
  const { d, points } = buildSparkPath([1, null, 3, 4], { width: 34, height: 10, pad: 2 });
  assert.equal(points.length, 3);
  assert.equal((d.match(/M/g) || []).length, 2);
  assert.ok(d.startsWith('M2 8M'));
});

test('flat and single-value series are centred vertically', () => {
  const flat = buildSparkPath([5, 5, 5], { width: 20, height: 10, pad: 0 });
  assert.ok(flat.points.every(p => p.y === 5));
  const one = buildSparkPath([null, 7, null], { width: 20, height: 10, pad: 0 });
  assert.equal(one.points.length, 1);
  assert.equal(one.last, 7);
});

test('empty series yields no path', () => {
  assert.deepEqual(buildSparkPath([null, null]), { d: '', points: [], min: null, max: null, last: null });
  assert.deepEqual(buildSparkPath([]), { d: '', points: [], min: null, max: null, last: null });
});

test('svg is labelled, escapes the label, marks lone points', () => {
  const svg = sparklineSvg([1, null, 3, 4], { label: 'HRV <28 days>' });
  assert.match(svg, /role="img"/);
  assert.match(svg, /aria-label="HRV &lt;28 days&gt;"/);
  assert.match(svg, /class="spark-dot"/); // the isolated first point
  assert.match(svg, /class="spark-last"/);
  assert.match(sparklineSvg([], { label: 'x' }), /aria-label="x: no data"/);
});
