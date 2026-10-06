// Map rendering shared by the Activity page and the Routes view. Leaflet is loaded on demand
// from cdnjs (with subresource integrity), so a page without a map never pays for it and an
// offline phone loses only the map, never the page. Every line, marker and hit area is drawn on
// one canvas renderer: ~300 route lines of ~200 points would be tens of thousands of SVG nodes.
//
// Contract used by views/activity.js, views/routes.js and views/tiles.js:
//   loadLeaflet() → Promise<L>; createMap(el, opts) → ctx { L, map, renderer, tiles };
//   cssVar, addLine, addLines, addStart, fit, destroy. Points are [lat, lng].

export const LEAFLET = {
  js: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  jsSri: 'sha512-puJW3E/qXDqYp9IfhAI54BJEaWIfloJ7JWs7OeD5i6ruC9JZL1gERT1wjtwXFlh7CjE7ZJ+/vcRZRkIYIb6p4g==',
  css: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  cssSri: 'sha512-h9FcoyWjHcOcmEVkxOfTLnmZFWIH0iZhZT1H2TbOq55xssQGEJHEaIm+PgoUaZbRvQTNTluNOEfb1ZRy6D3BOw==',
};

// OpenStreetMap's own tiles. CARTO's raster tiles (basemaps.cartocdn.com light_all / dark_all) were
// the first choice, but on 2026-10-06 every request returned a tile reading "API KEY REQUIRED".
// OSM's tile policy allows a small private app, if the request carries a Referer and the credit is
// shown. There is one tile set for both schemes: css/map.css themes it with a filter, which also
// follows a scheme change with no tile reload.
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const DARK_QUERY = '(prefers-color-scheme: dark)';
// index.html sends no Referer (<meta name="referrer" content="no-referrer">), which OSM answers with
// a 403 "Access blocked" tile. Tiles alone are sent the origin: it names the site, never the page.
const TILE_REFERRER = 'origin';
const TILE_MAX_ZOOM = 19;
const PLACEHOLDER_VIEW = { center: [0, 0], zoom: 0 };
const FIT_MAX_ZOOM = 17;          // a one-point or very short line would otherwise zoom to street level
const HIT_TOLERANCE_PX = 5;       // a 2 px canvas line is otherwise nearly impossible to hover
const HOVER_OPACITY = 0.9;
const START_RADIUS_PX = 6;
const START_WEIGHT_PX = 3;

// --- Leaflet loader --------------------------------------------------------

let leafletPromise = null;

function appendAsset(tag, attrs, onLoad, onError) {
  const node = document.createElement(tag);
  Object.assign(node, attrs, { crossOrigin: 'anonymous' });
  node.addEventListener('load', onLoad);
  node.addEventListener('error', onError);
  document.head.appendChild(node);
  return node;
}

/**
 * Leaflet, once. Resolves window.L after both the script and the stylesheet have loaded.
 * A failure (offline, blocked, integrity mismatch) removes the tags and clears the memo,
 * so the next call is a real retry rather than a replay of the old rejection.
 */
export function loadLeaflet() {
  if (leafletPromise) return leafletPromise;
  if (typeof window !== 'undefined' && window.L && window.L.map) {
    leafletPromise = Promise.resolve(window.L);
    return leafletPromise;
  }
  leafletPromise = new Promise((resolve, reject) => {
    const nodes = [];
    let waiting = 2, settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      nodes.forEach(n => n.remove());
      leafletPromise = null;
      reject(new Error('The map library could not be loaded.'));
    };
    const loaded = () => {
      if (settled || --waiting) return;
      if (!window.L) { fail(); return; }
      settled = true;
      resolve(window.L);
    };
    nodes.push(appendAsset('link', { rel: 'stylesheet', href: LEAFLET.css, integrity: LEAFLET.cssSri }, loaded, fail));
    nodes.push(appendAsset('script', { src: LEAFLET.js, integrity: LEAFLET.jsSri, async: true }, loaded, fail));
  });
  return leafletPromise;
}

// --- map -------------------------------------------------------------------

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * A map in `el`, which must already have a height. The caller sets the real view (fit or
 * ctx.map.setView); until then nothing is drawn and no tile is requested.
 * Follows the colour scheme live: the tiles through CSS, the lines and markers by re-resolving
 * their colours here (a canvas cannot read CSS variables).
 */
export async function createMap(el, { zoomControl = true, scrollWheelZoom = true, attribution = '' } = {}) {
  const L = await loadLeaflet();
  const renderer = L.canvas({ padding: 0.5, tolerance: HIT_TOLERANCE_PX });
  const map = L.map(el, { zoomControl, scrollWheelZoom, renderer, zoomSnap: 0.5 });
  map.attributionControl.setPrefix(false);

  // A map with no view is not "loaded", and Leaflet queues every layer added to it behind the first
  // view. With one canvas renderer shared by many lines that queue runs out of order and throws
  // (found with addLines + addLine + addStart before fit). So the map starts on a placeholder view,
  // and the tiles join only once a caller has moved it somewhere real.
  map.setView(PLACEHOLDER_VIEW.center, PLACEHOLDER_VIEW.zoom);
  const tiles = L.tileLayer(TILE_URL, {
    attribution: attribution ? `${ATTRIBUTION} · ${attribution}` : ATTRIBUTION,
    maxZoom: TILE_MAX_ZOOM,
    referrerPolicy: TILE_REFERRER,
  });
  map.on('moveend', () => { if (!map.hasLayer(tiles)) tiles.addTo(map); });

  const mq = matchMedia(DARK_QUERY);
  const ctx = { L, map, renderer, tiles, themed: [], scheme: { mq, onChange: null }, destroyed: false };
  ctx.scheme.onChange = () => ctx.themed.forEach(apply => apply());
  mq.addEventListener('change', ctx.scheme.onChange);
  return ctx;
}

/** Layers coloured from CSS variables are tracked so a scheme change can re-resolve them. */
function themed(ctx, layer, styleOf) {
  ctx.themed.push(() => layer.setStyle(styleOf()));
  return layer;
}

const toLine = (ctx, points, style) => ctx.L.polyline(points, {
  renderer: ctx.renderer, lineJoin: 'round', lineCap: 'round', ...style,
});

/**
 * One route line. Non-interactive unless it has a click handler or a tooltip, so a line
 * drawn over the map never swallows the map's own clicks.
 */
export function addLine(ctx, points, { color, weight = 3, opacity = 1, onClick, tooltip } = {}) {
  const interactive = !!(onClick || tooltip);
  const style = () => ({ color: color || cssVar('--accent'), weight, opacity });
  const line = toLine(ctx, points, { ...style(), interactive, bubblingMouseEvents: !interactive });
  if (onClick) line.on('click', onClick);
  if (tooltip) line.bindTooltip(tooltip, { sticky: true });
  line.addTo(ctx.map);
  return color ? line : themed(ctx, line, style);
}

/**
 * Many faint lines that light up under the pointer: lines [{ id, points }], onClick(id).
 * The hovered line is raised to the front so it is not hidden under its neighbours.
 */
export function addLines(ctx, lines, { color, weight = 2, opacity = 0.22, onClick } = {}) {
  const group = ctx.L.layerGroup();
  const base = () => ({ color: color || cssVar('--accent'), weight, opacity });
  for (const { id, points } of lines) {
    const line = toLine(ctx, points, { ...base(), interactive: true, bubblingMouseEvents: false });
    line.on('mouseover', () => { line.setStyle({ opacity: HOVER_OPACITY, weight: weight + 1 }); line.bringToFront(); });
    line.on('mouseout', () => line.setStyle({ opacity, weight }));
    if (onClick) line.on('click', () => onClick(id));
    group.addLayer(line);
  }
  if (!color) ctx.themed.push(() => { const style = base(); group.eachLayer(line => line.setStyle(style)); });
  return group.addTo(ctx.map);
}

/** The start of a route: a ring in the accent colour with a card-coloured centre. */
export function addStart(ctx, point) {
  const style = () => ({ fillColor: cssVar('--card'), color: cssVar('--accent') });
  const marker = ctx.L.circleMarker(point, {
    renderer: ctx.renderer, radius: START_RADIUS_PX, weight: START_WEIGHT_PX, fillOpacity: 1,
    interactive: false, ...style(),
  });
  marker.addTo(ctx.map);
  return themed(ctx, marker, style);
}

const isLatLng = p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/** Frame the points; accepts one array of points or an array of them (a list of routes). */
export function fit(ctx, points, { padding = 24 } = {}) {
  const flat = (points || []).flatMap(p => (isLatLng(p) ? [p] : Array.isArray(p) ? p.filter(isLatLng) : []));
  if (!flat.length) return;
  ctx.map.fitBounds(ctx.L.latLngBounds(flat), { padding: [padding, padding], maxZoom: FIT_MAX_ZOOM, animate: false });
}

/** Safe to call twice, or with null (a view that left before its map was ready). */
export function destroy(ctx) {
  if (!ctx || ctx.destroyed) return;
  ctx.destroyed = true;
  ctx.scheme.mq.removeEventListener('change', ctx.scheme.onChange);
  ctx.themed.length = 0;
  ctx.map.remove();
}
