// Taking a route out of the Routes view (views/routes.js): a GPX file, a Google Maps link, the
// Strava and Garmin import pages (they take the GPX), or, for a ride, Cake, Coffee & Cadence.
// The same for a generated variant, an edited one and a drawn one.
import { buildGpx, googleMapsUrl, cccUrl, gpxFilename } from '../geo.js';
import { formatDistance } from '../format.js';
import { PROFILES } from './routes-ui.js';

const BLOB_TTL_MS = 30000;       // revoking a download URL at once can cancel the download
const STRAVA_NEW_ROUTE = 'https://www.strava.com/routes/new';
const GARMIN_COURSES = 'https://connect.garmin.com/modern/courses';

// New tabs open synchronously in the click, or a popup blocker eats them. The Google Maps and CCC
// buttons only render when their URL could be built, so url is never null here.
const openTab = url => window.open(url, '_blank', 'noopener');

function saveFile(text, filename, type) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type })), download: filename, hidden: true });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), BLOB_TTL_MS);
}

/** The file name the GPX download will have, shown under its button. */
export const routeFilename = (c, date) => gpxFilename(c.profile, c.route.distanceKm, date);

/**
 * kind: gpx | google | strava | garmin | ccc. c: { profile, route ({ points, elevations,
 * distanceKm }), start, targetKm, via (the points a planned route went through, or null) }.
 */
export function exportRoute(kind, c, date) {
  const { profile, route } = c;
  if (kind === 'google') { openTab(googleMapsUrl(route.points, PROFILES[profile].travel, { via: c.via })); return; }
  if (kind === 'ccc') { openTab(cccUrl(c.start, c.targetKm ?? route.distanceKm)); return; }
  if (kind === 'strava') openTab(STRAVA_NEW_ROUTE);
  if (kind === 'garmin') openTab(GARMIN_COURSES);
  const gpx = buildGpx({ name: `${PROFILES[profile].label} ${formatDistance(route.distanceKm)}`, points: route.points, elevations: route.elevations });
  saveFile(gpx, routeFilename(c, date), 'application/gpx+xml');
}
