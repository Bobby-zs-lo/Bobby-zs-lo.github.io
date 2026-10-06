// The mock's POST /api/routes/plan (tests/mock-api.mjs): a route through the points in order,
// made up here rather than asked of OpenRouteService. Each leg is cut into ~50 m steps with a
// little sideways wobble, so the line reads as a path rather than a ruler, and it passes exactly
// through every point it was given, which is what the editor's way points rely on.
//
// Contract (the backend's): body { points: [[lat, lng], …] (2–30), profile: run | trail | ride,
// loop?: boolean } → { profile, loop, route: { distanceKm, ascentM, descentM, polyline, elevations,
// surface, wayPoints } }. wayPoints[k] is the line index of point k, plus the first point again
// on a loop. A point in the sea off the fictional centre answers 502 the way OpenRouteService does
// for one too far from any road, so that error can be tried by hand and in the smoke test.
import { haversineKm } from '../js/geo.js';
import { encodePolyline } from '../js/polyline.js';

const PROFILES = ['run', 'trail', 'ride'];
const MAX_POINTS = 30;
const STEP_KM = 0.05;
const WOBBLE_M = 45;             // the most a leg strays sideways…
const WOBBLE_SHARE = 0.08;       // …and never more than this share of a short leg's length
const M_PER_DEG = 111195;
const SURFACE = { paved: 0.8, unpaved: 0.2, unknown: 0 };
// The Øresund east of the fictional centre (55.70, 12.55): open water on the real map tiles.
const SEA = { centre: [55.7, 12.66], radiusKm: 2.5 };

const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
const isLatLng = (p) => Array.isArray(p) && p.length === 2 && p.every((x) => typeof x === 'number' && Number.isFinite(x))
  && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;

function parsePlanRequest(b, fail) {
  if (!b || typeof b !== 'object') fail(400, 'Body must be a JSON object');
  const { points, profile, loop } = b;
  if (!Array.isArray(points) || points.length < 2 || points.length > MAX_POINTS || !points.every(isLatLng)) {
    fail(400, `points must be 2–${MAX_POINTS} [lat, lng] pairs`);
  }
  if (typeof profile !== 'string' || !PROFILES.includes(profile)) fail(400, 'profile must be run, trail or ride');
  if (loop !== undefined && typeof loop !== 'boolean') fail(400, 'loop must be true or false');
  return { points, profile, loop: loop === true };
}

/** The leg from a to b without a, in ~50 m steps; the wobble is zero at both ends. */
function legPoints(a, b, phase) {
  const km = haversineKm(a, b);
  const steps = Math.max(1, Math.round(km / STEP_KM));
  const kx = M_PER_DEG * Math.cos((a[0] * Math.PI) / 180);
  const east = (b[1] - a[1]) * kx, north = (b[0] - a[0]) * M_PER_DEG;
  const len = Math.hypot(east, north) || 1;
  const [px, py] = [-north / len, east / len]; // unit vector to the left of the leg
  const amp = Math.min(WOBBLE_M, km * 1000 * WOBBLE_SHARE);
  const out = [];
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const w = amp * Math.sin(Math.PI * t) * (0.7 * Math.sin(3 * Math.PI * t + phase) + 0.3 * Math.sin(7 * Math.PI * t + 2 * phase));
    out.push([a[0] + (b[0] - a[0]) * t + (w * py) / M_PER_DEG, a[1] + (b[1] - a[1]) * t + (w * px) / kx]);
  }
  return out;
}

// Gentle hills on a 2–3 km wavelength: a function of place, so a re-planned stretch keeps its heights.
const elevationAt = ([lat, lng]) => round(Math.max(0, 18 + 8 * Math.sin(lat * 350) + 6 * Math.cos(lng * 130)), 1);

function climb(elevations) {
  let up = 0, down = 0;
  for (let i = 1; i < elevations.length; i++) {
    const d = elevations[i] - elevations[i - 1];
    if (d > 0) up += d; else down -= d;
  }
  return { ascentM: Math.round(up), descentM: Math.round(down) };
}

/** Answer a plan request, or throw through fail(status, message) as the backend would. */
export function planRoute(body, fail) {
  const { points, profile, loop } = parsePlanRequest(body, fail);
  points.forEach((p, i) => {
    if (haversineKm(p, SEA.centre) <= SEA.radiusKm) fail(502, `Could not find routable point within a radius of 1000.0 meters of specified coordinate ${i}`);
  });
  const stops = loop ? [...points, points[0]] : points;
  const line = [stops[0]];
  const wayPoints = [0];
  for (let k = 1; k < stops.length; k++) {
    line.push(...legPoints(stops[k - 1], stops[k], k * 1.7));
    wayPoints.push(line.length - 1);
  }
  let km = 0;
  for (let i = 1; i < line.length; i++) km += haversineKm(line[i - 1], line[i]);
  const elevations = line.map(elevationAt);
  return {
    profile, loop,
    route: { distanceKm: round(km, 2), ...climb(elevations), polyline: encodePolyline(line), elevations, surface: { ...SURFACE }, wayPoints },
  };
}
