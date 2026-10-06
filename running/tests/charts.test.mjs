import { test } from 'node:test';
import assert from 'node:assert/strict';
import { niceTicks, barsSvg, stackedBarSvg, lineSvg, calendarSvg, profileSvg } from '../js/charts.js';

const count = (s, re) => (s.match(re) || []).length;

// Invariants every chart must keep: no stray NaN, numbers rounded to one
// decimal, and no colours or inline styles (the stylesheet owns those).
function assertClean(svg) {
  assert.ok(!/NaN|undefined|Infinity/.test(svg), 'no NaN/undefined/Infinity');
  assert.ok(!/\d\.\d{2,}/.test(svg), 'numbers are rounded to one decimal');
  assert.ok(!/\s(style|fill|stroke)=/.test(svg), 'no colours or inline styles');
}

// --- niceTicks ---------------------------------------------------------------

test('niceTicks picks a round step and covers the max', () => {
  assert.deepEqual(niceTicks(37), [0, 10, 20, 30, 40]);
  assert.deepEqual(niceTicks(7), [0, 2, 4, 6, 8]);
  assert.deepEqual(niceTicks(100), [0, 25, 50, 75, 100]);
});

test('niceTicks falls back to [0, 1] for empty or invalid maxima', () => {
  for (const bad of [0, -5, NaN, Infinity, undefined, null]) assert.deepEqual(niceTicks(bad), [0, 1]);
});

test('niceTicks has no floating-point dust on fractional steps', () => {
  assert.deepEqual(niceTicks(0.3), [0, 0.1, 0.2, 0.3]);
});

test('niceTicks never needs more than one decimal (no 0.25 steps)', () => {
  assert.deepEqual(niceTicks(1), [0, 0.2, 0.4, 0.6, 0.8, 1]);
  assert.deepEqual(niceTicks(1.1), [0, 0.2, 0.4, 0.6, 0.8, 1, 1.2]);
  assert.deepEqual(niceTicks(0.04), [0, 0.1]); // too small for a finer step: stay at 0.1
  assert.deepEqual(niceTicks(0.004), [0, 0.1]);
  for (const max of [0.004, 0.04, 0.05, 0.1, 0.3, 0.9, 1, 1.1, 2.4, 7, 9.9, 37, 120, 999, 12345]) {
    const ticks = niceTicks(max);
    assert.equal(ticks[0], 0);
    assert.ok(ticks[ticks.length - 1] >= max, `ticks cover ${max}`);
    ticks.forEach((t, i) => {
      assert.equal(Math.round(t * 10) / 10, t, `${t} has at most one decimal (max ${max})`);
      if (i) assert.ok(t > ticks[i - 1], `ticks ascend (max ${max})`);
    });
  }
});

// --- barsSvg -----------------------------------------------------------------

const ROWS = [
  { key: '2026-W38', label: 'W38', planned: 40, actual: 38.5 },
  { key: '2026-W39', label: 'W39', planned: null, actual: 12 },
  { key: '2026-W40', label: '<b>W40</b>', planned: 50, actual: 0 },
];

test('barsSvg draws one interactive group per row with planned and actual bars', () => {
  const svg = barsSvg(ROWS);
  assert.match(svg, /^<svg class="chart chart--bars" viewBox="0 0 720 200" role="group" aria-label="Weekly volume">/);
  assert.equal(count(svg, /class="bars/g), 3);
  assert.equal(count(svg, /bar--planned/g), 2); // the unplanned week has no planned bar
  assert.equal(count(svg, /bar--actual/g), 3);
  assert.equal(count(svg, /role="button" tabindex="0"/g), 3);
  assert.ok(count(svg, /<line class="grid"/g) >= 2);
  assertClean(svg);
});

test('barsSvg marks exactly the selected row', () => {
  const svg = barsSvg(ROWS, { selected: '2026-W39' });
  assert.equal(count(svg, /aria-pressed="true"/g), 1);
  assert.equal(count(svg, /aria-pressed="false"/g), 2);
  assert.equal(count(svg, /is-selected/g), 1);
  assert.match(svg, /<g class="bars is-selected" data-key="2026-W39"/);
  assert.equal(count(barsSvg(ROWS), /aria-pressed="true"/g), 0);
});

test('barsSvg escapes labels and describes each row', () => {
  const svg = barsSvg(ROWS);
  assert.ok(!svg.includes('<b>'));
  assert.match(svg, /aria-label="&lt;b&gt;W40&lt;\/b&gt;: planned 50 km, actual 0 km"/);
  assert.match(svg, /aria-label="W38: planned 40 km, actual 38.5 km"/);
  assert.match(svg, /<title>W38: planned 40 km, actual 38.5 km<\/title>/);
  assert.match(barsSvg(ROWS, { unit: 'h', label: 'Time <x>' }), /aria-label="Time &lt;x&gt;"/);
});

test('barsSvg allows zero-height actual bars and never goes negative', () => {
  const svg = barsSvg(ROWS);
  const w40 = svg.slice(svg.indexOf('data-key="2026-W40"'));
  assert.match(w40, /<rect class="bar bar--actual"[^>]*height="0"/);
  const odd = barsSvg([{ key: 'a', label: 'A', planned: -3, actual: NaN }]);
  assert.ok(!/height="-/.test(odd));
  assertClean(odd);
});

test('barsSvg labels at most 13 rows on the x axis and always the last', () => {
  const rows = Array.from({ length: 52 }, (_, i) => ({ key: `k${i}`, label: `W${i + 1}`, planned: 30, actual: 25 }));
  const svg = barsSvg(rows);
  const xs = svg.match(/<text class="axis axis--x"[^>]*>[^<]*<\/text>/g) || [];
  assert.ok(xs.length > 1 && xs.length <= 13, `got ${xs.length} x labels`);
  assert.match(xs[xs.length - 1], />W52</);
  assert.equal(count(barsSvg(ROWS), /axis--x/g), 3); // few rows: label them all
});

test('barsSvg with no rows returns the empty state', () => {
  const svg = barsSvg([]);
  assert.match(svg, /chart-empty/);
  assert.match(svg, />No data</);
  assertClean(svg);
});

// --- stackedBarSvg -----------------------------------------------------------

test('stackedBarSvg draws one titled segment per non-zero share', () => {
  const svg = stackedBarSvg([
    { key: 'E', label: 'Easy', share: 0.78 },
    { key: 'M', label: 'Marathon', share: 0.22 },
    { key: 'T', label: 'Threshold', share: 0 },
  ]);
  assert.match(svg, /^<svg class="chart chart--stacked" viewBox="0 0 320 18" role="img" aria-label="Share">/);
  assert.equal(count(svg, /zone--E/g), 1);
  assert.equal(count(svg, /zone--M/g), 1);
  assert.equal(count(svg, /zone--T/g), 0);
  // Not "seg": running.css styles .seg as the check-in's segmented control.
  assert.doesNotMatch(svg, /class="seg/);
  assert.match(svg, /<title>Easy 78 %<\/title>/);
  assert.match(svg, /<title>Marathon 22 %<\/title>/);
  assertClean(svg);
});

test('stackedBarSvg segments follow each other and fill the width', () => {
  const svg = stackedBarSvg([{ key: 'a', label: 'A', share: 0.5 }, { key: 'b', label: 'B', share: 0.5 }], { width: 200 });
  assert.match(svg, /<rect class="zone zone--a" x="0" y="0" width="100" height="18"/);
  assert.match(svg, /<rect class="zone zone--b" x="100" y="0" width="100" height="18"/);
});

test('stackedBarSvg escapes labels and falls back to the empty state', () => {
  const svg = stackedBarSvg([{ key: 'x', label: '<i>Z</i>', share: 1 }]);
  assert.ok(!svg.includes('<i>'));
  assert.match(stackedBarSvg([{ key: 'x', label: 'X', share: 0 }]), /chart-empty/);
  assert.match(stackedBarSvg([]), /chart-empty/);
});

// --- lineSvg -----------------------------------------------------------------

const pathOf = svg => (svg.match(/<path class="line" d="([^"]*)"/) || [])[1];
const ysOf = d => (d.match(/[ML]-?[\d.]+ (-?[\d.]+)/g) || []).map(s => Number(s.split(' ')[1]));

test('lineSvg with no finite points is the empty state', () => {
  for (const pts of [[], [{ x: 0, y: null }, { x: 1, y: NaN }]]) {
    const svg = lineSvg(pts, { label: 'Pace' });
    assert.match(svg, /<svg class="chart chart-empty"/);
    assert.match(svg, /<text class="axis"[^>]*>No data<\/text>/);
    assertClean(svg);
  }
});

test('lineSvg breaks the path where y is null', () => {
  const svg = lineSvg([{ x: 0, y: 1 }, { x: 1, y: null }, { x: 2, y: 3 }, { x: 3, y: 4 }]);
  const d = pathOf(svg);
  assert.equal(count(d, /M/g), 2);
  assert.equal(count(d, /L/g), 1);
  assert.match(svg, /^<svg class="chart chart--line" viewBox="0 0 320 120" role="img"/);
  assertClean(svg);
});

test('lineSvg draws a point isolated by gaps as a zero-length segment', () => {
  // "M x y" alone paints nothing; "h0" gives a round line-cap something to draw.
  const d = pathOf(lineSvg([{ x: 0, y: 1 }, { x: 1, y: null }, { x: 2, y: 3 }, { x: 3, y: 4 }]));
  assert.equal(count(d, /h0/g), 1);
  assert.match(d, /^M[\d.]+ [\d.]+h0M/);
  assert.equal(count(pathOf(lineSvg([{ x: 0, y: 1 }, { x: 1, y: 2 }])), /h0/g), 0);
});

test('lineSvg puts high values at the top, or at the bottom when inverted', () => {
  const pts = [{ x: 0, y: 1 }, { x: 1, y: 9 }];
  const [lowY, highY] = ysOf(pathOf(lineSvg(pts)));
  assert.ok(highY < lowY, 'highest value has the smallest pixel y');
  const [lowI, highI] = ysOf(pathOf(lineSvg(pts, { invert: true })));
  assert.ok(lowI < highI, 'inverted: lowest value has the smallest pixel y');
});

test('lineSvg labels three y ticks through yFormat and the given x labels', () => {
  const svg = lineSvg([{ x: 0, y: 300 }, { x: 10, y: 360 }], {
    yFormat: v => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`,
    xLabels: [{ x: 0, text: 'Oct' }, { x: 10, text: '<Nov>' }],
  });
  assert.match(svg, />5:00</);
  assert.match(svg, />5:30</);
  assert.match(svg, />6:00</);
  assert.equal(count(svg, /<text class="axis"[^>]*>\d:\d\d</g), 3);
  assert.match(svg, /<text class="axis axis--x"[^>]*>Oct<\/text>/);
  assert.match(svg, />&lt;Nov&gt;</);
  assertClean(svg);
});

test('lineSvg draws extra series on the same scales with their class', () => {
  const svg = lineSvg([{ x: 0, y: 2 }, { x: 1, y: 4 }], { extra: [{ points: [{ x: 0, y: 3 }, { x: 1, y: 3 }], className: 'line--avg' }] });
  assert.match(svg, /<path class="line line--avg" d="M[^"]+L[^"]+"/);
  assertClean(svg);
});

test('lineSvg copes with a single point and a flat series', () => {
  assertClean(lineSvg([{ x: 5, y: 7 }]));
  const flat = lineSvg([{ x: 0, y: 7 }, { x: 1, y: 7 }]);
  assertClean(flat);
  assert.ok(pathOf(flat).startsWith('M'));
});

test('lineSvg escapes its label', () => {
  assert.match(lineSvg([{ x: 0, y: 1 }], { label: 'A "b" <c>' }), /aria-label="A &quot;b&quot; &lt;c&gt;"/);
});

// --- calendarSvg -------------------------------------------------------------

test('calendarSvg draws Monday-first columns and omits days after the end date', () => {
  const svg = calendarSvg(new Map([['2026-10-12', 12]]), { end: '2026-10-13', weeks: 2 });
  assert.match(svg, /^<svg class="chart chart--calendar" viewBox="0 0 \d+ \d+" role="img" aria-label="Daily distance">/);
  assert.equal(count(svg, /class="cal /g), 9); // Mon 5 Oct ... Tue 13 Oct
  assert.equal(count(svg, /cal--3/g), 1);
  assert.match(svg, /class="cal cal--3" data-date="2026-10-12"/);
  assert.equal(count(svg, /cal--0/g), 8);
  assert.ok(!svg.includes('2026-10-14'));
  assert.match(svg, /data-date="2026-10-05"/);
  assert.match(svg, /<title>Mon 12 Oct · 12 km<\/title>/);
  assertClean(svg);
});

test('calendarSvg levels split at 5, 10 and 16 km', () => {
  const km = new Map([['2026-10-05', 0], ['2026-10-06', 4.9], ['2026-10-07', 5], ['2026-10-08', 9.9], ['2026-10-09', 10], ['2026-10-10', 15.9], ['2026-10-11', 16]]);
  const svg = calendarSvg(km, { end: '2026-10-11', weeks: 1 });
  const level = d => svg.match(new RegExp(`cal--(\\d)" data-date="${d}"`))[1];
  assert.deepEqual(['05', '06', '07', '08', '09', '10', '11'].map(n => level(`2026-10-${n}`)), ['0', '1', '2', '2', '3', '3', '4']);
});

test('calendarSvg puts a month label above each month start, dropping a cramped first one', () => {
  const full = calendarSvg(new Map(), { end: '2026-10-13' });
  assert.equal(count(full, /<text class="axis"/g), 13);
  assert.match(full, /<text class="axis"[^>]*>Nov<\/text>/);
  const short = calendarSvg(new Map(), { end: '2026-10-13', weeks: 3 }); // Sep 28, Oct 5, Oct 12
  assert.equal(count(short, /<text class="axis"/g), 1);
  assert.match(short, />Oct</);
});

test('calendarSvg with a missing or invalid end date is the empty state (it never reads the clock)', () => {
  for (const opts of [{}, { end: 'nope' }, { end: '2026-13-45' }, { end: '2026-02-30' }, { end: '2026-1-5' }]) {
    const svg = calendarSvg(new Map(), opts);
    assert.match(svg, /chart-empty/);
    assertClean(svg);
  }
});

test('calendarSvg walks real calendar days across a leap day', () => {
  const svg = calendarSvg(new Map([['2028-02-29', 6]]), { end: '2028-03-01', weeks: 1 }); // Mon 28 Feb ... Wed 1 Mar
  assert.equal(count(svg, /class="cal /g), 3);
  assert.match(svg, /class="cal cal--2" data-date="2028-02-29"/);
  assert.match(svg, /<title>Tue 29 Feb · 6 km<\/title>/);
  assert.match(svg, /data-date="2028-03-01"/);
});

// --- profileSvg --------------------------------------------------------------

test('profileSvg draws a closed area and labels the extremes', () => {
  const svg = profileSvg([0, 1, 2], [5, null, 9]);
  assert.match(svg, /^<svg class="chart chart--profile" viewBox="0 0 320 80" role="img" aria-label="Elevation">/);
  assert.match(svg, /<path class="profile" d="M[^"]+Z"/);
  assert.equal(count(svg, /<text class="axis"/g), 2);
  assert.match(svg, />5 m</);
  assert.match(svg, />9 m</);
  assertClean(svg);
});

test('profileSvg with nothing finite is the empty state', () => {
  assert.match(profileSvg([], []), /chart-empty/);
  assert.match(profileSvg([0, 1], [null, NaN]), /chart-empty/);
});

test('profileSvg copes with a flat or single-point route', () => {
  assertClean(profileSvg([0, 1, 2], [10, 10, 10]));
  assertClean(profileSvg([3], [42]));
});

test('barsSvg y labels are the nice ticks, one decimal at most', () => {
  const svg = barsSvg([{ key: 'a', label: 'A', planned: 1, actual: 0.9 }]);
  const labels = [...svg.matchAll(/<text class="axis" [^>]*text-anchor="end">([^<]*)</g)].map(m => m[1]);
  assert.deepEqual(labels, ['0', '0.2', '0.4', '0.6', '0.8', '1']);
});

test('barsSvg names a row without a label by its key, never "undefined"', () => {
  const svg = barsSvg([{ key: 'k1', planned: 3, actual: 2 }, { key: 'k2', label: null, planned: null, actual: 1 }, { planned: 1, actual: 1 }]);
  assert.ok(!svg.includes('undefined'));
  assert.match(svg, /aria-label="k1: planned 3 km, actual 2 km"/);
  assert.match(svg, /<title>k2: no plan, actual 1 km<\/title>/);
  assertClean(svg);
});

test('barsSvg treats keys by their string form for the group and the svg alike', () => {
  const rows = [{ key: 1, label: 'A', planned: 5, actual: 4 }, { key: 2, label: 'B', planned: 6, actual: 6 }];
  for (const selected of [2, '2']) {
    const svg = barsSvg(rows, { selected });
    assert.match(svg, /class="chart chart--bars has-selection"/);
    assert.equal(count(svg, /aria-pressed="true"/g), 1);
    assert.match(svg, /<g class="bars is-selected" data-key="2"/);
  }
});

test('barsSvg marks the svg when a week is selected', () => {
  const rows = [{ key: 'a', label: 'A', planned: 5, actual: 4 }, { key: 'b', label: 'B', planned: 6, actual: 6 }];
  assert.match(barsSvg(rows, { selected: 'b' }), /class="chart chart--bars has-selection"/);
  assert.doesNotMatch(barsSvg(rows), /has-selection/);
  assert.doesNotMatch(barsSvg(rows, { selected: 'zz' }), /has-selection/);
});

// --- escaping of every caller-supplied value ---------------------------------

const BREAKOUT = '"><script>alert(1)</script>';      // closes the attribute and the tag
const HANDLER = '" onmouseover="alert(1)';            // stays inside the tag, adds an attribute

// The svg is inert when no raw <script survives, every tag is name="value" pairs
// only, and none of those names is an event handler.
function assertInert(svg) {
  assert.ok(!svg.includes('<script'), 'no raw <script');
  for (const tag of svg.match(/<[a-z][^>]*>/g)) {
    assert.match(tag, /^<[\w-]+(\s+[\w-]+="[^"]*")*\s*\/?>$/, `well-formed tag: ${tag}`);
    const names = [...tag.matchAll(/\s([\w-]+)="[^"]*"/g)].map(m => m[1]);
    assert.ok(names.every(n => !n.startsWith('on')), `no event-handler attribute in ${tag}`);
  }
}

test('barsSvg escapes row.key (data-key) and unit', () => {
  for (const payload of [BREAKOUT, HANDLER]) {
    const svg = barsSvg([{ key: payload, label: 'A', planned: 5, actual: 4 }], { selected: payload, unit: payload, label: payload });
    assertInert(svg);
    assert.match(svg, /data-key="&quot;/);
    assert.match(svg, /actual 4 &quot;/); // the unit, escaped, inside aria-label and title
  }
});

test('lineSvg escapes extra[].className', () => {
  for (const className of [BREAKOUT, HANDLER]) {
    const svg = lineSvg([{ x: 0, y: 1 }, { x: 1, y: 2 }], { extra: [{ points: [{ x: 0, y: 2 }, { x: 1, y: 1 }], className }] });
    assertInert(svg);
    assert.match(svg, /<path class="line &quot;/);
  }
});

test('stackedBarSvg turns the part key into a single safe class token', () => {
  for (const key of [BREAKOUT, HANDLER, 'two words']) {
    const svg = stackedBarSvg([{ key, label: BREAKOUT, share: 1 }], { label: BREAKOUT });
    assertInert(svg);
    assert.match(svg, /<rect class="zone zone--[\w-]+" /);
  }
});

test('lineSvg escapes yFormat output and x label text', () => {
  const svg = lineSvg([{ x: 0, y: 1 }, { x: 1, y: 2 }], { yFormat: () => BREAKOUT, xLabels: [{ x: 0, text: BREAKOUT }], label: HANDLER });
  assertInert(svg);
  assert.match(svg, />&quot;&gt;&lt;script&gt;/);
});

test('profileSvg, calendarSvg and the empty state escape their label', () => {
  assertInert(profileSvg([0, 1], [1, 2], { label: BREAKOUT }));
  assertInert(calendarSvg(new Map(), { end: '2026-10-13', weeks: 1, label: BREAKOUT }));
  assertInert(lineSvg([], { label: BREAKOUT }));
});
