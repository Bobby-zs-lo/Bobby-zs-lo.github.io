// Taking a route out of the Routes view (views/routes.js): a GPX file, a Google Maps link, the
// Strava and Garmin import pages (they take the GPX), or, for a ride, Cake, Coffee & Cadence.
// On a phone the import pages are useless (Strava's opens its app, which can't import), so Strava
// and Garmin only download there, and Share hands the file to another app.
// The same for a generated variant, an edited one and a drawn one.
import { buildGpx, googleMapsUrl, cccUrl, gpxFilename } from '../geo.js';
import { formatDistance } from '../format.js';
import { PROFILES } from './routes-ui.js';
import { isDesk } from '../layout.js';

const BLOB_TTL_MS = 30000;       // revoking a download URL at once can cancel the download
const STRAVA_NEW_ROUTE = 'https://www.strava.com/routes/new';
const GARMIN_COURSES = 'https://connect.garmin.com/modern/courses';

// New tabs open synchronously in the click, or a popup blocker eats them. The Google Maps and CCC
// buttons only render when their URL could be built, so url is never null here.
const openTab = url => window.open(url, '_blank', 'noopener');

const GPX_TYPE = 'application/gpx+xml';

// share() must start inside the click (it needs the user's gesture), so it is called before any await.
// Cancelling the share sheet is an AbortError and means nothing; any other failure falls back to a download.
function shareFile(text, filename, title) {
  const file = new File([text], filename, { type: GPX_TYPE });
  navigator.share({ files: [file], title }).catch(e => { if (e && e.name !== 'AbortError') saveFile(text, filename, GPX_TYPE); });
}

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
 * kind: gpx | share | google | strava | garmin | ccc. c: { profile, route ({ points, elevations,
 * distanceKm }), start, targetKm, via (the points a planned route went through, or null) }.
 */
export function exportRoute(kind, c, date) {
  const { profile, route } = c;
  if (kind === 'google') { openTab(googleMapsUrl(route.points, PROFILES[profile].travel, { via: c.via })); return; }
  if (kind === 'ccc') { openTab(cccUrl(c.start, c.targetKm ?? route.distanceKm)); return; }
  const desk = isDesk();
  if (kind === 'strava' && desk) openTab(STRAVA_NEW_ROUTE);
  if (kind === 'garmin' && desk) openTab(GARMIN_COURSES);
  const title = `${PROFILES[profile].label} ${formatDistance(route.distanceKm)}`;
  const gpx = buildGpx({ name: title, points: route.points, elevations: route.elevations });
  const filename = routeFilename(c, date);
  if (kind === 'share') { shareFile(gpx, filename, title); return; }
  saveFile(gpx, filename, GPX_TYPE);
}
