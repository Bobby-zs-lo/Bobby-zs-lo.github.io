// Seeded randomness and invented route geometry for the synthetic fixtures.
//
// Everything here is made up. The app shows Strava data, and Strava's API policy
// forbids that data reaching an AI, so any Claude session working on the front end
// must use these fixtures instead of the live API. Nothing below is derived from a
// real activity: loops are random polygons around a fictional centre.
//
// Used by synthetic.mjs (history, routes) and build-fixtures.mjs. Pure functions,
// except the random source, which is a closure over its own seed.
import { encodePolyline } from '../../js/polyline.js';

export const CENTRE = [55.7, 12.55]; // fictional [lat, lng]
const KM_PER_DEG = 111.195; // 2π·6371.0088 / 360: matches js/geo.js haversine
const COS_CENTRE_LAT = Math.cos((CENTRE[0] * Math.PI) / 180);
const START_RADIUS_KM = 1.5;
const POINT_SPACING_KM = 0.1;

/** mulberry32: tiny, fast, and identical on every machine, so fixtures stay byte-stable. */
export function makeRandom(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const range = (lo, hi) => lo + (hi - lo) * next();
  return {
    next,
    range,
    int: (lo, hi) => Math.floor(range(lo, hi + 1)),
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
    /** Roughly normal (sum of three uniforms), mean 0, sd ≈ 1. */
    normal: () => (next() + next() + next() - 1.5) * 2,
  };
}

export const round = (x, digits) => Math.round(x * 10 ** digits) / 10 ** digits;

const toLatLng = ([x, y]) => [CENTRE[0] + y / KM_PER_DEG, CENTRE[1] + x / (KM_PER_DEG * COS_CENTRE_LAT)];
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const pathLength = (pts) => pts.reduce((sum, p, i) => (i ? sum + dist(pts[i - 1], p) : 0), 0);

/** Closed uniform Catmull-Rom through `pts`: smooth, and it passes through every vertex. */
function closedSpline(pts, perSegment = 24) {
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let k = 0; k < perSegment; k++) {
      const t = k / perSegment, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((d) => 0.5 * (2 * p1[d] + (p2[d] - p0[d]) * t
        + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (3 * p1[d] - p0[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  return out;
}

/** A point every ~`step` km along a closed ring; the last point repeats the first, so the loop is closed. */
function resampleClosed(ring, step) {
  const closed = [...ring, ring[0]];
  const cum = [0];
  for (let i = 1; i < closed.length; i++) cum.push(cum[i - 1] + dist(closed[i - 1], closed[i]));
  const total = cum[cum.length - 1];
  const n = Math.max(8, Math.round(total / step));
  const out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (total * k) / n;
    while (cum[j + 1] < s) j++;
    const f = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    out.push([closed[j][0] + f * (closed[j + 1][0] - closed[j][0]), closed[j][1] + f * (closed[j + 1][1] - closed[j][1])]);
  }
  out.push(out[0]);
  return out;
}

/**
 * One base loop per nominal distance. Each has its own start within 1.5 km of the centre, 8–16
 * jittered vertices (radius ±25 %) and a heading: the loop lies on the far side of the start from
 * `heading`, so big loops lean west/south-west instead of out over the sea.
 */
export function makeBaseLoops(rng, nominalKms, { startAtCentre = false } = {}) {
  return nominalKms.map((nominalKm) => {
    const n = rng.int(8, 16);
    const angles = Array.from({ length: n }, (_, i) => (i === 0 ? 0 : ((2 * Math.PI * i) / n) + rng.range(-0.15, 0.15) * ((2 * Math.PI) / n)));
    const radii = angles.map(() => 1 + rng.range(-0.25, 0.25));
    const r = START_RADIUS_KM * Math.sqrt(rng.next());
    const theta = rng.range(0, 2 * Math.PI);
    const heading = rng.range((150 * Math.PI) / 180, (300 * Math.PI) / 180);
    return {
      nominalKm, angles, radii, heading,
      start: startAtCentre ? [0, 0] : [r * Math.cos(theta), r * Math.sin(theta)],
      clockwise: rng.chance(0.5),
    };
  });
}

/** The loop whose nominal length is closest to `distanceKm` (70 %) or the next closest (30 %): popular routes. */
export function pickLoop(loops, distanceKm, rng) {
  const ranked = [...loops].sort((a, b) => Math.abs(Math.log(a.nominalKm / distanceKm)) - Math.abs(Math.log(b.nominalKm / distanceKm)));
  return rng.chance(0.7) ? ranked[0] : ranked[1];
}

/**
 * One run of a base loop as [lat, lng] points about `distanceKm` round (±1.5 %), a point every ~100 m,
 * first point === last point. `jitter` adds the small per-run wobble that makes repeat runs differ.
 */
export function renderLoop(loop, distanceKm, rng, { jitter = true, reverse = false } = {}) {
  const wobble = (amount) => (jitter ? rng.range(-amount, amount) : 0);
  const sign = loop.clockwise !== reverse ? -1 : 1;
  const phase = loop.heading + Math.PI; // vertex 0 sits opposite the heading, i.e. on the start
  const verts = loop.angles.map((theta, i) => {
    const r = loop.radii[i] * (1 + wobble(0.04));
    const a = phase + sign * theta + (i ? wobble(0.02) : 0);
    return [r * Math.cos(a), r * Math.sin(a)];
  });
  const ring = closedSpline(verts);
  const scale = (distanceKm * (1 + wobble(0.015))) / pathLength([...ring, ring[0]]);
  const start = [loop.start[0] + (jitter ? rng.normal() * 0.015 : 0), loop.start[1] + (jitter ? rng.normal() * 0.015 : 0)];
  const placed = ring.map(([x, y]) => [start[0] + (x - verts[0][0]) * scale, start[1] + (y - verts[0][1]) * scale]);
  return resampleClosed(placed, POINT_SPACING_KM).map(toLatLng);
}

export const encodeLoop = (points) => encodePolyline(points);
export const startOf = (points) => [round(points[0][0], 5), round(points[0][1], 5)];
