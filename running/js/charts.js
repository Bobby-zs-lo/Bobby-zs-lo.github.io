// Inline-SVG chart builders for the desk view: pure functions, each returning an
// SVG string. No colours or inline styles are written here, only class names, so
// the stylesheet owns the look (and light/dark theming). Every label goes through
// escapeHtml; every number is rounded to one decimal so the markup stays small
// and never contains NaN. text-anchor is a layout attribute rather than styling:
// it has to travel with the coordinates, because .axis labels are anchored
// differently in different charts (y labels "end", x labels "middle").
import { escapeHtml } from './markdown.js';
import { parseDate, toISODate, addDays, mondayOf, formatDate } from './format.js';

const rnd = n => (Number.isFinite(n) ? Math.round(n * 10) / 10 : 0);
const num = n => String(rnd(n));
const isNum = n => Number.isFinite(n); // false for null/undefined, unlike isFinite()

function extent(values) {
  let lo = Infinity, hi = -Infinity;
  for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return [lo, hi];
}

// Linear map [lo, hi] -> [a, b]; a degenerate domain maps everything to the middle.
function scale(lo, hi, a, b) {
  return hi === lo ? () => (a + b) / 2 : v => a + ((v - lo) / (hi - lo)) * (b - a);
}

function open(name, width, height, label, role = 'img') {
  return `<svg class="chart chart--${name}" viewBox="0 0 ${num(width)} ${num(height)}" role="${role}" aria-label="${escapeHtml(label)}">`;
}

function emptySvg(width, height, label) {
  const text = label ? `${label}: no data` : 'No data';
  return `<svg class="chart chart-empty" viewBox="0 0 ${num(width)} ${num(height)}" role="img" aria-label="${escapeHtml(text)}">`
    + `<text class="axis" x="${num(width / 2)}" y="${num(height / 2 + 3)}" text-anchor="middle">No data</text></svg>`;
}

const yLabel = (x, y, text) => `<text class="axis" x="${num(x)}" y="${num(y + 3)}" text-anchor="end">${escapeHtml(text)}</text>`;

// --- niceTicks ---------------------------------------------------------------

const NICE_STEPS = [1, 2, 2.5, 5, 10];
const MIN_STEP = 0.1; // labels print one decimal, so no tick may need a finer step
const MAX_TICKS = 100; // a guard, never reached for count <= ~10

const isTenths = s => Math.abs(s * 10 - Math.round(s * 10)) < 1e-9;

/**
 * [0, step, 2·step, …] up to the first tick >= max, with a round step near max / count.
 * Only steps that are multiples of 0.1 qualify (which drops 0.25), so every tick
 * survives the one-decimal rounding of the labels unchanged.
 */
export function niceTicks(max, count = 4) {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const candidates = NICE_STEPS.map(s => s * magnitude).filter(isTenths);
  // Nearest in log space, so 9.25 -> 10 and 1.75 -> 2 rather than always rounding up.
  const step = candidates.length
    ? candidates.reduce((best, s) => (Math.abs(Math.log(s / raw)) < Math.abs(Math.log(best / raw)) ? s : best))
    : MIN_STEP;
  const ticks = [0];
  // toPrecision strips dust like 0.30000000000000004 so labels and the >= test stay exact.
  while (ticks[ticks.length - 1] < max && ticks.length < MAX_TICKS) ticks.push(Number((ticks.length * step).toPrecision(12)));
  return ticks;
}

// --- barsSvg -----------------------------------------------------------------

const BARS_PAD = { left: 32, right: 4, top: 8, bottom: 18 };
const MAX_X_LABELS = 13;
const MAX_BAR_WIDTH = 24;

// Indices to label on the x axis: evenly spaced, counted back from the last row
// so the newest week is always named.
function labelIndices(n) {
  const step = Math.max(1, Math.ceil((n - 1) / (MAX_X_LABELS - 1)));
  const out = [];
  for (let i = n - 1; i >= 0; i -= step) out.unshift(i);
  return out;
}

/** Planned vs actual bars per row; each row is a focusable, pressable group. */
export function barsSvg(rows, { width = 720, height = 200, selected = null, label = 'Weekly volume', unit = 'km' } = {}) {
  if (!rows || !rows.length) return emptySvg(width, height, label);
  const { left, right, top, bottom } = BARS_PAD;
  const plotW = width - left - right, plotH = height - top - bottom, base = top + plotH;
  const pos = v => (isNum(v) && v > 0 ? v : 0);
  const ticks = niceTicks(Math.max(...rows.map(row => Math.max(pos(row.planned), pos(row.actual)))));
  const ceiling = ticks[ticks.length - 1];
  const yOf = v => base - (v / ceiling) * plotH;
  const slot = plotW / rows.length;
  const barW = Math.min(MAX_BAR_WIDTH, slot * 0.38);
  // Keys compare by string form (a numeric key and a '2' from a URL must agree), and
  // one helper serves both the row and the svg so they can never disagree.
  const isSel = row => selected != null && String(row.key) === String(selected);
  // A row with no label is named by its key rather than printing "undefined".
  const nameOf = row => String(row.label ?? row.key ?? '');

  const grid = ticks.map(t => `<line class="grid" x1="${num(left)}" y1="${num(yOf(t))}" x2="${num(width - right)}" y2="${num(yOf(t))}"/>`
    + yLabel(left - 4, yOf(t), num(t))).join('');

  const bar = (kind, x, v) => `<rect class="bar bar--${kind}" x="${num(x)}" y="${num(yOf(v))}" width="${num(barW)}" height="${num(base - yOf(v))}"/>`;
  const groups = rows.map((row, i) => {
    const cx = left + slot * (i + 0.5);
    const hasPlan = isNum(row.planned);
    const plan = hasPlan ? `planned ${num(row.planned)} ${unit}` : 'no plan';
    const text = escapeHtml(`${nameOf(row)}: ${plan}, actual ${num(pos(row.actual))} ${unit}`);
    const picked = isSel(row);
    return `<g class="bars${picked ? ' is-selected' : ''}" data-key="${escapeHtml(row.key)}" role="button" tabindex="0" aria-pressed="${picked}" aria-label="${text}">`
      + `<title>${text}</title>`
      + (hasPlan ? bar('planned', cx - barW - 0.5, pos(row.planned)) : '')
      + bar('actual', cx + 0.5, pos(row.actual))
      + '</g>';
  }).join('');

  const xLabels = labelIndices(rows.length).map(i =>
    `<text class="axis axis--x" x="${num(left + slot * (i + 0.5))}" y="${num(height - 4)}" text-anchor="middle">${escapeHtml(nameOf(rows[i]))}</text>`).join('');

  // role="group": the children are the interactive parts, the chart itself is not an image.
  // 'has-selection' lets CSS dim the other weeks while one is picked.
  const name = rows.some(isSel) ? 'bars has-selection' : 'bars';
  return open(name, width, height, label, 'group') + grid + groups + xLabels + '</svg>';
}

// --- stackedBarSvg -----------------------------------------------------------

const safeClass = key => String(key).replace(/[^\w-]/g, '-');

/**
 * One horizontal bar split into shares (each 0..1, summing to <= 1). Each part is a
 * `zone zone--<key>` rect (not "seg", which running.css already uses for the check-in's
 * segmented control).
 */
export function stackedBarSvg(parts, { width = 320, height = 18, label = 'Share' } = {}) {
  const shown = (parts || []).filter(p => p.share > 0);
  if (!shown.length) return emptySvg(width, height, label);
  let x = 0;
  const rects = shown.map(p => {
    const w = Math.min(p.share, 1) * width;
    const rect = `<rect class="zone zone--${safeClass(p.key)}" x="${num(x)}" y="0" width="${num(w)}" height="${num(height)}">`
      + `<title>${escapeHtml(p.label)} ${Math.round(p.share * 100)} %</title></rect>`;
    x += w;
    return rect;
  });
  return open('stacked', width, height, label) + rects.join('') + '</svg>';
}

// --- lineSvg -----------------------------------------------------------------

const valid = p => !!p && isNum(p.x) && isNum(p.y);
const Y_HEADROOM = 0.05; // headroom so the line never touches the plot edge

// A null/NaN y ends the current run, so the next valid point starts a new "M" (a gap,
// not a bridge). A run of one point becomes "M x y h0": a bare "M" paints nothing,
// while a zero-length segment shows as a dot under a round line-cap.
function pathD(points, sx, sy) {
  const runs = [[]];
  for (const p of points) {
    if (valid(p)) runs[runs.length - 1].push(`${num(sx(p.x))} ${num(sy(p.y))}`);
    else if (runs[runs.length - 1].length) runs.push([]);
  }
  return runs.filter(run => run.length)
    .map(([first, ...rest]) => (rest.length ? `M${first}${rest.map(c => `L${c}`).join('')}` : `M${first}h0`))
    .join('');
}

/**
 * points: [{ x, y|null }]. `extra` series share the scales (and so widen them).
 * invert puts low values at the top, which is what a pace axis wants.
 */
export function lineSvg(points, { width = 320, height = 120, invert = false, yFormat = v => String(rnd(v)), xLabels = [], label = '', extra = [] } = {}) {
  const series = [points || [], ...extra.map(e => e.points || [])];
  if (!series[0].some(valid)) return emptySvg(width, height, label);
  const all = series.flat().filter(valid);
  const [xMin, xMax] = extent(all.map(p => p.x));
  const [yMin, yMax] = extent(all.map(p => p.y));
  const pad = (yMax - yMin) * Y_HEADROOM;
  const left = 36, right = xLabels.length ? 14 : 6, top = 6, bottom = xLabels.length ? 18 : 6;
  const sx = scale(xMin, xMax, left, width - right);
  const sy = invert ? scale(yMin - pad, yMax + pad, top, height - bottom) : scale(yMin - pad, yMax + pad, height - bottom, top);

  const ticks = yMin === yMax ? [yMin] : [yMin, (yMin + yMax) / 2, yMax];
  const yTicks = ticks.map(v => yLabel(left - 4, sy(v), String(yFormat(v)))).join('');
  const xTicks = xLabels.filter(l => isNum(l.x)).map(l =>
    `<text class="axis axis--x" x="${num(sx(l.x))}" y="${num(height - 4)}" text-anchor="middle">${escapeHtml(l.text)}</text>`).join('');
  const paths = [`<path class="line" d="${pathD(series[0], sx, sy)}"/>`]
    .concat(extra.map(e => ({ d: pathD(e.points || [], sx, sy), cls: e.className }))
      .filter(e => e.d)
      .map(e => `<path class="line ${escapeHtml(e.cls)}" d="${e.d}"/>`));
  return open('line', width, height, label || 'Line chart') + yTicks + xTicks + paths.join('') + '</svg>';
}

// --- calendarSvg -------------------------------------------------------------

const LEVEL_FLOORS_KM = [5, 10, 16]; // 0 | <5 | <10 | <16 | >=16 -> levels 0..4
export const CALENDAR_TOP = 14;      // room above the grid for month labels; Overview's weekday labels align to it
const MIN_MONTH_LABEL_COLS = 3;      // closer labels would overlap, so the earlier one is dropped

const levelOf = km => (km > 0 ? 1 + LEVEL_FLOORS_KM.filter(floor => km >= floor).length : 0);

// parseDate only checks the shape, so '2026-02-30' would roll over to March:
// a day is real only if it survives the round trip.
const isRealDay = s => { const d = parseDate(s); return !!d && toISODate(d) === s; };

/**
 * GitHub-style heat map: columns are Mon-Sun weeks ending with the week of `end`
 * (a 'YYYY-MM-DD' string). Days are walked as ISO strings through format.js, so no
 * time zone or clock is involved; a missing or invalid `end` gives the empty state.
 */
export function calendarSvg(kmByDate, { end, weeks = 53, label = 'Daily distance', cell = 11, gap = 2 } = {}) {
  const cols = Math.max(1, Math.floor(weeks) || 1);
  const stride = cell + gap;
  const width = cols * stride - gap, height = CALENDAR_TOP + 7 * stride - gap;
  if (!isRealDay(end)) return emptySvg(width, height, label);

  const start = addDays(mondayOf(end), -(cols - 1) * 7);
  const rects = [], monthStarts = [];
  let prevMonth = '';
  for (let c = 0; c < cols; c++) {
    const monday = addDays(start, c * 7);
    const month = monday.slice(5, 7);
    if (month !== prevMonth) monthStarts.push({ c, name: formatDate(monday).split(' ')[2] }); // 'Mon 5 Oct' -> 'Oct'
    prevMonth = month;
    for (let r = 0; r < 7; r++) {
      const iso = addDays(monday, r);
      if (iso > end) break; // ISO dates sort as strings; the rest of the column lies in the future
      const raw = Number(kmByDate && kmByDate.get(iso));
      const km = raw > 0 ? raw : 0;
      rects.push(`<rect class="cal cal--${levelOf(km)}" data-date="${iso}" x="${num(c * stride)}" y="${num(CALENDAR_TOP + r * stride)}" width="${num(cell)}" height="${num(cell)}" rx="2">`
        + `<title>${formatDate(iso)} · ${num(km)} km</title></rect>`);
    }
  }
  const months = monthStarts
    .filter((m, i) => i === monthStarts.length - 1 || monthStarts[i + 1].c - m.c >= MIN_MONTH_LABEL_COLS)
    .map(m => `<text class="axis" x="${num(m.c * stride)}" y="9">${m.name}</text>`);
  return open('calendar', width, height, label) + months.join('') + rects.join('') + '</svg>';
}

// --- profileSvg --------------------------------------------------------------

const PROFILE_PAD = { left: 34, right: 4, top: 6, bottom: 4 };
const PROFILE_HEADROOM = 0.1; // keeps the lowest point off the baseline so the area has body there

/** Elevation area chart; samples where either value is not finite are skipped. */
export function profileSvg(distKm, elevM, { width = 320, height = 80, label = 'Elevation' } = {}) {
  const pts = [];
  for (let i = 0; i < Math.min((distKm || []).length, (elevM || []).length); i++) {
    if (isNum(distKm[i]) && isNum(elevM[i])) pts.push({ x: distKm[i], y: elevM[i] });
  }
  if (!pts.length) return emptySvg(width, height, label);
  const { left, right, top, bottom } = PROFILE_PAD;
  const [xMin, xMax] = extent(pts.map(p => p.x));
  const [yMin, yMax] = extent(pts.map(p => p.y));
  const room = ((yMax - yMin) || 10) * PROFILE_HEADROOM;
  const sx = scale(xMin, xMax, left, width - right);
  const sy = scale(yMin - room, yMax + room, height - bottom, top);
  const base = num(height - bottom);

  const first = num(sx(pts[0].x)), lastX = num(sx(pts[pts.length - 1].x));
  const d = `M${first} ${base}` + pts.map(p => `L${num(sx(p.x))} ${num(sy(p.y))}`).join('') + `L${lastX} ${base}Z`;
  const marks = (yMin === yMax ? [yMin] : [yMax, yMin]).map(v => yLabel(left - 4, sy(v), `${num(v)} m`)).join('');
  return open('profile', width, height, label) + `<path class="profile" d="${d}"/>` + marks + '</svg>';
}
