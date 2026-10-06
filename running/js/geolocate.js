// The device's location, for the route start: the Routes view and the Settings card both ask
// for it, so the one lookup and its error messages live here rather than in either view.

const GEO_OPTIONS = { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 };
// GeolocationPositionError codes: 1 denied, 2 unavailable, 3 timeout.
const GEO_ERRORS = {
  1: 'Location access is blocked for this site. Allow it in the browser’s site settings.',
  2: 'Your location isn’t available right now.',
  3: 'Finding your location took too long. Try again.',
};

/** The device's position as [lat, lng]; rejects with a message fit to show as is. */
export function currentPosition() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('This browser can’t share a location.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      p => resolve([p.coords.latitude, p.coords.longitude]),
      e => reject(new Error(GEO_ERRORS[e && e.code] || 'Couldn’t find your location.')),
      GEO_OPTIONS);
  });
}

/** [55.68, 12.57] → '55.68000, 12.57000': five decimals is about a metre, as the API stores it. */
export const formatLatLng = ([lat, lng]) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
