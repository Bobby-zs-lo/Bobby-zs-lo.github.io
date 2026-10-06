// The Routes view's own map layers (views/routes.js): Auto's three variants and the ring at the
// start. An edited or drawn route, handles and all, is views/routes-edit.js's to draw.
import { addLine, addStart, cssVar, fit } from '../map.js';
import { formatDistance } from '../format.js';
import { LETTERS } from './routes-ui.js';

const FIT_PADDING_PX = 32;

/** getMap() → the map.js ctx, or null while the map is loading (every call is then a no-op). */
export function createAutoLayers(getMap) {
  let lines = [], ring = null, chosen = 0;

  // Colours are passed explicitly (map.js would otherwise re-theme the lines back to their first
  // style on a scheme change) and re-resolved by restyle() when the scheme flips. The other routes
  // are dotted: a thin solid grey line reads as one more road on the tiles.
  function restyle() {
    const quiet = { color: cssVar('--ink'), weight: 3.5, opacity: 0.55, dashArray: '1 7' };
    lines.forEach((line, i) => { if (i !== chosen) line.setStyle(quiet); });
    const on = lines[chosen];
    if (on) { on.setStyle({ color: cssVar('--accent'), weight: 5, opacity: 1, dashArray: null }); on.bringToFront(); }
    if (ring) ring.bringToFront();
  }

  return {
    restyle,
    /** variants: [{ points, distanceKm }], or [] to clear; onSelect(i) for a click on a line. */
    draw(variants, selected, onSelect) {
      const ctx = getMap();
      lines.forEach(line => line.remove());
      lines = !ctx ? [] : variants.map((v, i) => addLine(ctx, v.points, {
        color: cssVar('--ink-2'),
        tooltip: `${LETTERS[i]} · ${formatDistance(v.distanceKm)}`,
        onClick: () => onSelect(i), // interactive lines don't bubble, so the start stays put
      }));
      chosen = selected;
      restyle();
    },
    select(i) { chosen = i; restyle(); },
    fit(points) { const ctx = getMap(); if (ctx && points) fit(ctx, points, { padding: FIT_PADDING_PX }); },
    /** The ring at Auto's start; null takes it away. */
    start(point) {
      const ctx = getMap();
      if (!ctx || !point) { if (ring) ring.remove(); ring = null; return; }
      if (ring) ring.setLatLng(point);
      else ring = addStart(ctx, point);
      ring.bringToFront();
    },
  };
}
