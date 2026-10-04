// Inline-SVG sparklines. buildSparkPath is pure (tested); sparklineSvg wraps it.
import { escapeHtml } from './markdown.js';

/**
 * values: array of numbers or null (gaps). Returns { d, points, min, max, last }.
 * Null values break the line into separate segments ("M" again after a gap).
 */
export function buildSparkPath(values, { width = 280, height = 56, pad = 4 } = {}) {
  const nums = values.filter(v => v != null && isFinite(v));
  if (!nums.length) return { d: '', points: [], min: null, max: null, last: null };
  let min = Math.min(...nums), max = Math.max(...nums);
  const span = max - min || 1;
  const n = values.length;
  const stepX = n > 1 ? (width - pad * 2) / (n - 1) : 0;
  const pts = [];
  let d = '', pen = false;
  values.forEach((v, i) => {
    if (v == null || !isFinite(v)) { pen = false; return; }
    const x = n > 1 ? pad + i * stepX : width / 2;
    const y = max === min ? height / 2 : pad + (1 - (v - min) / span) * (height - pad * 2);
    const xr = Math.round(x * 10) / 10, yr = Math.round(y * 10) / 10;
    pts.push({ x: xr, y: yr, v, i });
    d += `${pen ? 'L' : 'M'}${xr} ${yr}`;
    pen = true;
  });
  let last = null;
  for (let i = values.length - 1; i >= 0; i--) if (values[i] != null && isFinite(values[i])) { last = values[i]; break; }
  return { d, points: pts, min, max, last };
}

export function sparklineSvg(values, { label = '', width = 280, height = 48 } = {}) {
  const { d, points } = buildSparkPath(values, { width, height });
  if (!d) {
    return `<svg class="spark" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label)}: no data"><line x1="4" y1="${height / 2}" x2="${width - 4}" y2="${height / 2}" class="spark-empty"/></svg>`;
  }
  const lastPt = points[points.length - 1];
  // Lone points (between gaps) would be invisible as a path; draw them as dots.
  const lone = points.filter((p, k) => {
    const prev = points[k - 1], next = points[k + 1];
    return !(prev && prev.i === p.i - 1) && !(next && next.i === p.i + 1);
  });
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label)}">`
    + `<path d="${d}" class="spark-line" vector-effect="non-scaling-stroke"/>`
    + lone.map(p => `<circle cx="${p.x}" cy="${p.y}" r="2" class="spark-dot"/>`).join('')
    + `<circle cx="${lastPt.x}" cy="${lastPt.y}" r="3.5" class="spark-last"/>`
    + `</svg>`;
}
