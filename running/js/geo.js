// Pure geometry and export helpers: distance, sampling, GPX, and map-app deep links. Points are [lat, lng].

const EARTH_RADIUS_KM = 6371.0088; // IUGG mean radius; matches what route tools report
const MAX_GOOGLE_WAYPOINTS = 9; // Google Maps URLs ignore anything past 9 intermediate stops

const toRad = deg => deg * Math.PI / 180;
const coord = n => n.toFixed(5);
const latLng = ([lat, lng]) => `${coord(lat)},${coord(lng)}`;
const isLatLng = p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/** True when a planned route's own points can stand in for Google's waypoints. */
export const usableVia = via => Array.isArray(via) && via.length <= MAX_GOOGLE_WAYPOINTS && via.every(isLatLng);

export function haversineKm(a, b) {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function pathKm(points) {
  let km = 0;
  for (let i = 1; i < points.length; i++) km += haversineKm(points[i - 1], points[i]);
  return km;
}

// Distance from the start to each vertex: the x axis of an elevation profile.
export function cumulativeKm(points) {
  const out = points.length ? [0] : [];
  for (let i = 1; i < points.length; i++) out.push(out[i - 1] + haversineKm(points[i - 1], points[i]));
  return out;
}

// [[minLat, minLng], [maxLat, maxLng]] — the shape Leaflet's fitBounds takes.
export function bbox(points) {
  if (!points.length) return null;
  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
  for (const [lat, lng] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return [[minLat, minLng], [maxLat, maxLng]];
}

// Up to n vertices spread evenly by distance along the path (not by index, which would bunch
// up wherever the geometry is dense). Only interior vertices are returned — the ends are the
// origin/destination — and none twice, so sparse geometry yields fewer than n, never repeats.
export function samplePoints(points, n) {
  if (points.length < 3 || n < 1) return [];
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + haversineKm(points[i - 1], points[i]));
  const total = cum[cum.length - 1];
  const lastInterior = points.length - 2;
  const out = [];
  let j = 0, prev = -1;
  for (let k = 1; k <= n; k++) {
    const target = total * k / (n + 1);
    // Targets only grow, so the nearest vertex never moves backwards: one forward sweep.
    while (j < cum.length - 1 && Math.abs(cum[j + 1] - target) < Math.abs(cum[j] - target)) j++;
    const pick = Math.min(Math.max(j, 1), lastInterior);
    if (pick === prev) continue;
    out.push(points[pick]);
    prev = pick;
  }
  return out;
}

const XML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
// XML 1.0 forbids most C0 control characters (tab, LF, CR are fine); a stray one in a
// route name would make the whole GPX unparseable, so drop them before escaping.
const XML_INVALID_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;
const escapeXml = s => String(s).replace(XML_INVALID_CHARS, '').replace(/[&<>"']/g, c => XML_ENTITIES[c]);

// One decimal is plenty for elevation; String() drops the trailing ".0" ("7" not "7.0").
const eleXml = e => (Number.isFinite(e) ? `<ele>${Math.round(e * 10) / 10}</ele>` : '');

export function buildGpx({ name, points, elevations = [], time }) {
  // A nameless track imports badly in some apps, so fall back rather than emit <name></name>.
  const safeName = escapeXml(name ?? '') || 'Route';
  const timeXml = time ? `<time>${escapeXml(time)}</time>` : '';
  const trkpts = points.map(([lat, lng], i) => {
    const ele = eleXml(elevations?.[i]); // `= []` only covers undefined; callers may pass null
    const open = `<trkpt lat="${coord(lat)}" lon="${coord(lng)}"`;
    return ele ? `${open}>${ele}</trkpt>` : `${open}/>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Running" xmlns="http://www.topografix.com/GPX/1/1">',
    `<metadata><name>${safeName}</name>${timeXml}</metadata>`,
    `<trk><name>${safeName}</name><trkseg>`,
    ...trkpts,
    '</trkseg></trk>',
    '</gpx>',
    '',
  ].join('\n');
}

// null when there is no route to link to, so callers hide the button instead of opening a dead URL.
// `via`: the points a planned route was drawn through. Up to 9 of them are more faithful than
// samples of the line; more than Google takes, and the line is sampled after all.
export function googleMapsUrl(points, mode = 'walking', { via } = {}) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const params = new URLSearchParams({
    api: '1',
    origin: latLng(points[0]),
    destination: latLng(points[points.length - 1]),
  });
  const waypoints = usableVia(via) ? via : samplePoints(points, MAX_GOOGLE_WAYPOINTS);
  if (waypoints.length) params.set('waypoints', waypoints.map(latLng).join('|'));
  params.set('travelmode', mode);
  return `https://www.google.com/maps/dir/?${params}`;
}

// null on a non-finite distance or start so a NaN never reaches the URL as "NaN".
export function cccUrl(start, km) {
  const valid = Array.isArray(start) && Number.isFinite(start[0]) && Number.isFinite(start[1]) && Number.isFinite(km);
  if (!valid) return null;
  const params = new URLSearchParams({ start: latLng(start), km: String(Math.round(km)), mode: 'loop' });
  return `https://www.ccc-bike.com/app/?${params}`;
}

export function gpxFilename(kind, km, date) {
  return `${kind}-${Math.round(km)}km-${date}.gpx`;
}
