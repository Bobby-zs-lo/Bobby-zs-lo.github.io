// Map rendering shared by the Activity page, the Routes view and Overview's map tiles. Leaflet
// is loaded on demand from cdnjs (with subresource integrity), so a page without a map never
// pays for it and an offline phone loses only the map, never the page. Every line, marker and
// hit area is drawn on one canvas renderer: a heatmap of every route, each of ~200 points, would
// be tens of thousands of SVG nodes.
//
// Contract used by views/activity.js, views/routes.js, views/routes-edit.js and views/tiles-map.js:
//   loadLeaflet() → Promise<L>; createMap(el, opts) → ctx { L, map, renderer, tiles };
//   cssVar, addLine, addLines, addStart, addHandle, updateHandle, fit, destroy. Points are [lat, lng].

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
// A new tab, so following the credit never drops the page (or an installed app) for OSM's site.
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
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
const HANDLE_PX = 36;             // a handle's hit area; the dot drawn inside it is smaller (css/map.css)
const HANDLE_KINDS = ['start', 'via', 'end'];
const START_HANDLE_Z = 1000;      // the start stays on top of a point dropped onto it

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

const hasLeafletCss = () => typeof document !== 'undefined'
  && [...document.querySelectorAll('link[rel="stylesheet"]')].some(link => link.href === LEAFLET.css);

/**
 * Leaflet, once. Resolves window.L after both the script and the stylesheet have loaded.
 * A failure (offline, blocked, integrity mismatch) removes the tags and clears the memo,
 * so the next call is a real retry rather than a replay of the old rejection.
 * A Leaflet already on the page is reused only with its stylesheet: without it the tiles and
 * controls land in a heap, so a missing link (removed, or a script that came some other way)
 * is added again and waited for.
 */
export function loadLeaflet() {
  if (leafletPromise) return leafletPromise;
  const needJs = !(typeof window !== 'undefined' && window.L && window.L.map);
  const needCss = !hasLeafletCss();
  if (!needJs && !needCss) {
    leafletPromise = Promise.resolve(window.L);
    return leafletPromise;
  }
  leafletPromise = new Promise((resolve, reject) => {
    const nodes = [];
    let waiting = Number(needJs) + Number(needCss), settled = false;
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
    if (needCss) nodes.push(appendAsset('link', { rel: 'stylesheet', href: LEAFLET.css, integrity: LEAFLET.cssSri }, loaded, fail));
    if (needJs) nodes.push(appendAsset('script', { src: LEAFLET.js, integrity: LEAFLET.jsSri, async: true }, loaded, fail));
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

/**
 * Layers coloured from CSS variables are tracked so a scheme change can re-resolve them, and
 * dropped again when the layer leaves the map. Overview swaps its heat and pick layers on every
 * filter click; kept, each old closure (and the lines it holds) would live as long as the map.
 */
function themed(ctx, layer, recolour) {
  ctx.themed = [...ctx.themed, recolour];
  layer.once('remove', () => { ctx.themed = ctx.themed.filter(f => f !== recolour); });
  return layer;
}

// A tooltip string is parsed as HTML; an element's text never is.
function textContent(text) {
  const span = document.createElement('span');
  span.textContent = String(text);
  return span;
}

const toLine = (ctx, points, style) => ctx.L.polyline(points, {
  renderer: ctx.renderer, lineJoin: 'round', lineCap: 'round', ...style,
});

/**
 * One route line. Non-interactive unless it has a click handler or a tooltip, or asks to be
 * (the route editor grabs its line), so a line drawn over the map never swallows the map's own
 * clicks. `tooltip` is plain text: it is set as text, so markup in it shows as written.
 */
export function addLine(ctx, points, { color, weight = 3, opacity = 1, onClick, tooltip, interactive: grab = false } = {}) {
  const interactive = !!(grab || onClick || tooltip);
  const style = () => ({ color: color || cssVar('--accent'), weight, opacity });
  const line = toLine(ctx, points, { ...style(), interactive, bubblingMouseEvents: !interactive });
  if (onClick) line.on('click', onClick);
  if (tooltip) line.bindTooltip(textContent(tooltip), { sticky: true });
  line.addTo(ctx.map);
  return color ? line : themed(ctx, line, () => line.setStyle(style()));
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
  group.addTo(ctx.map);
  return color ? group : themed(ctx, group, () => { const style = base(); group.eachLayer(line => line.setStyle(style)); });
}

/** The start of a route: a ring in the accent colour with a card-coloured centre. */
export function addStart(ctx, point) {
  const style = () => ({ fillColor: cssVar('--card'), color: cssVar('--accent') });
  const marker = ctx.L.circleMarker(point, {
    renderer: ctx.renderer, radius: START_RADIUS_PX, weight: START_WEIGHT_PX, fillOpacity: 1,
    interactive: false, ...style(),
  });
  marker.addTo(ctx.map);
  return themed(ctx, marker, () => marker.setStyle(style()));
}

/**
 * A point a route is planned through, to drag, click or move from the keyboard. A Leaflet marker
 * with a divIcon, because a canvas circle cannot be dragged; css/map.css draws it, so it follows
 * the colour scheme with no re-colouring. Leaflet makes it a focusable role="button"; `label` is
 * its accessible name. onDragStart(); onDrag([lat, lng]) on the way, for a preview; onDragEnd([lat, lng]);
 * onClick() (a press with no drag);
 * onKey(event) returns true for a key it used, which then goes no further: an arrow would also pan
 * the map. The key listener is taken off with the marker, like the other layers' bookkeeping.
 */
export function addHandle(ctx, point, { label = '', kind = 'via', onDragStart, onDrag, onDragEnd, onClick, onKey } = {}) {
  const icon = ctx.L.divIcon({ className: `map-handle map-handle--${kind}`, html: '<span class="map-handle-dot"></span>', iconSize: [HANDLE_PX, HANDLE_PX] });
  const marker = ctx.L.marker(point, {
    icon, draggable: true, keyboard: true, autoPan: true, zIndexOffset: kind === 'start' ? START_HANDLE_Z : 0,
  });
  const at = () => { const { lat, lng } = marker.getLatLng(); return [lat, lng]; };
  if (onDragStart) marker.on('dragstart', () => onDragStart());
  if (onDrag) marker.on('drag', () => onDrag(at()));
  if (onDragEnd) marker.on('dragend', () => onDragEnd(at()));
  if (onClick) marker.on('click', () => onClick());
  marker.addTo(ctx.map);
  const el = marker.getElement();
  el.setAttribute('aria-label', label);
  const keydown = e => {
    if (!onKey || !onKey(e)) return;
    e.preventDefault();
    e.stopPropagation();
  };
  el.addEventListener('keydown', keydown);
  marker.once('remove', () => el.removeEventListener('keydown', keydown));
  return marker;
}

/** A handle's name and kind changed (points before it were added or removed): same marker, so focus stays. */
export function updateHandle(marker, { label, kind } = {}) {
  const el = marker.getElement();
  if (!el) return marker;
  if (label != null) el.setAttribute('aria-label', label);
  if (kind) HANDLE_KINDS.forEach(k => el.classList.toggle(`map-handle--${k}`, k === kind));
  return marker;
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
  ctx.themed = [];
  ctx.map.remove();
}
