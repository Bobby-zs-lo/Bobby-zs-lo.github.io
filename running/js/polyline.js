// Google encoded-polyline codec for route geometry. Points are [lat, lng].

// Arithmetic rather than bit operators so precision 7 (1.8e9 * 2) cannot overflow 32 bits.
function encodeValue(n) {
  let v = n < 0 ? -2 * n - 1 : 2 * n; // zigzag
  let out = '';
  while (v >= 32) {
    out += String.fromCharCode(((v % 32) | 32) + 63);
    v = Math.floor(v / 32);
  }
  return out + String.fromCharCode(v + 63);
}

// Reads one zigzag-delta number starting at i. Returns null when the input ends, goes out
// of range, or encodes more than a safe integer mid-number, so a malformed tail can be
// dropped instead of thrown on (or silently turned into a rounded-off coordinate).
function readValue(str, i) {
  let result = 0, scale = 1;
  for (; i < str.length; i++) {
    const chunk = str.charCodeAt(i) - 63;
    if (chunk < 0 || chunk > 63) return null;
    result += (chunk & 31) * scale;
    if (!Number.isSafeInteger(result)) return null;
    scale *= 32;
    if (chunk < 32) {
      const value = result % 2 ? -(result + 1) / 2 : result / 2;
      return { value, next: i + 1 };
    }
  }
  return null;
}

export function decodePolyline(str, precision = 5) {
  if (typeof str !== 'string' || !str) return [];
  const factor = 10 ** precision;
  const points = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    const dLat = readValue(str, i);
    if (!dLat) break;
    const dLng = readValue(str, dLat.next);
    if (!dLng) break;
    lat += dLat.value;
    lng += dLng.value;
    i = dLng.next;
    // Dividing the integer sum once (not accumulating floats) keeps the result exact.
    points.push([lat / factor, lng / factor]);
  }
  return points;
}

const isPoint = p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);

// Malformed points are skipped rather than thrown on: one bad vertex from an upstream
// route shouldn't lose the whole line. Deltas are taken against the last point emitted.
export function encodePolyline(points, precision = 5) {
  if (!Array.isArray(points)) return '';
  const factor = 10 ** precision;
  let out = '', prevLat = 0, prevLng = 0;
  for (const p of points) {
    if (!isPoint(p)) continue;
    const [lat, lng] = p;
    const iLat = Math.round(lat * factor), iLng = Math.round(lng * factor);
    out += encodeValue(iLat - prevLat) + encodeValue(iLng - prevLng);
    prevLat = iLat;
    prevLng = iLng;
  }
  return out;
}
