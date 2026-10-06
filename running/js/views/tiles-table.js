// Overview tiles, part three: the activities table. Sorted by a header button (aria-sort says
// which), filtered by the period and sport or by the picked week, and capped at a page of rows
// until "Show all" is pressed, so 'all' with a thousand activities still paints at once.
import { html } from '../dom.js';
import { formatDate, formatMmSs, formatNumber, formatPace, sportFamily } from '../format.js';
import { head, empty, failed, shortDate, km } from './tiles.js';

export const TABLE_PAGE = 50;

const TYPE_NAMES = { run: 'Run', ride: 'Ride', strength: 'Strength', other: 'Other' };
const isRun = a => sportFamily(a.sportType) === 'run';
// Seconds per km for runs and rides alike, so one column sorts a mixed list sensibly.
const secPerKm = a => (a.avgPaceSecPerKm > 0 ? a.avgPaceSecPerKm
  : a.distanceKm > 0 && a.movingMin > 0 ? (a.movingMin * 60) / a.distanceKm : null);
const typeOf = a => TYPE_NAMES[sportFamily(a.sportType)] || a.sportType || '';

function paceCell(a) {
  const sec = secPerKm(a);
  if (sec == null) return '–';
  if (isRun(a)) return `${formatPace(sec)} /km`;
  return `${formatNumber(3600 / sec, 1)} km/h`;
}

// key, header, numeric?, sort value, cell. Text columns sort A→Z first, the rest high→low.
const COLUMNS = [
  { key: 'date', label: 'Date', sort: a => a.startUtc || a.date },
  { key: 'type', label: 'Type', text: true, sort: typeOf },
  { key: 'name', label: 'Name', text: true, sort: a => String(a.name || '').toLowerCase() },
  { key: 'km', label: 'Km', num: true, sort: a => a.distanceKm, cell: a => km(a.distanceKm) },
  { key: 'time', label: 'Time', num: true, sort: a => a.movingMin, cell: a => (a.movingMin ? formatMmSs(a.movingMin * 60) : '–') },
  { key: 'pace', label: 'Pace / speed', num: true, sort: secPerKm, cell: paceCell, firstDir: 'asc' },
  { key: 'hr', label: 'HR', num: true, sort: a => a.avgHr, cell: a => (a.avgHr ? Math.round(a.avgHr) : '–') },
  { key: 'elev', label: 'Elev', num: true, sort: a => a.elevM, cell: a => (a.elevM != null ? `${formatNumber(a.elevM, 0)} m` : '–') },
  { key: 'session', label: 'Session', text: true },
];
const COLUMN = Object.fromEntries(COLUMNS.map(c => [c.key, c]));

/** The direction a column starts in when it is first clicked. */
export const firstDirection = key => (COLUMN[key]?.firstDir || (COLUMN[key]?.text ? 'asc' : 'desc'));
export const isSortKey = key => Object.hasOwn(COLUMN, key);

/** Sorted copy; missing values always go last, whichever way the column runs. */
export function sortActivities(acts, { key, dir }, sessions) {
  const col = COLUMN[key] || COLUMN.date;
  const valueOf = key === 'session' ? a => String(sessions.get(a.workoutId)?.title || '').toLowerCase() || null : col.sort;
  const sign = dir === 'asc' ? 1 : -1;
  return acts.map(a => ({ a, v: valueOf(a) })).sort((x, y) => {
    const xm = x.v == null || x.v === '', ym = y.v == null || y.v === '';
    if (xm || ym) return xm === ym ? 0 : xm ? 1 : -1;
    return (x.v < y.v ? -1 : x.v > y.v ? 1 : 0) * sign;
  }).map(r => r.a);
}

function headerCell(col, sort) {
  const active = sort.key === col.key;
  const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : null;
  const arrow = active ? (sort.dir === 'asc' ? '↑' : '↓') : '';
  return html`<th scope="col" class="${col.num ? 'is-num' : ''}"${ariaSort ? html` aria-sort="${ariaSort}"` : ''}>
    <button type="button" class="ov-sort${active ? ' is-active' : ''}" data-sort="${col.key}">${col.label}<span class="ov-sort-arrow" aria-hidden="true">${arrow}</span></button>
  </th>`;
}

function row(a, m, sameYear) {
  const href = `#/activity/${encodeURIComponent(a.id)}`;
  const session = m.sessions.get(a.workoutId);
  const date = formatDate(a.date, { year: !sameYear(a.date) });
  return html`<tr data-href="${href}" class="ov-row ov-row--${sportFamily(a.sportType)}">
    <td class="ov-td-date">${date}</td>
    <td class="ov-td-type"><span class="ov-type">${typeOf(a)}</span></td>
    <th scope="row" class="ov-td-name"><a href="${href}">${a.name || typeOf(a)}</a>${a.commute ? html` <span class="tag">Commute</span>` : ''}</th>
    ${COLUMNS.filter(c => c.num).map(c => html`<td class="is-num">${c.cell(a)}</td>`)}
    <td class="ov-td-session">${session ? session.title : html`<span class="muted">–</span>`}</td>
  </tr>`;
}

export function tableTile(m, id, view) {
  const label = 'Activities';
  if (m.errors.acts) return html`${head(id, label)}${failed('activities', m.errors.acts)}`;
  const scope = m.sel ? `Week of ${shortDate(m.sel)}` : 'In the period';
  const acts = m.scoped;
  const n = acts.length;
  if (!n) return html`${head(id, label, scope)}${empty(m.sel ? 'Nothing recorded that week.' : 'No activities in this period.')}`;
  const sorted = sortActivities(acts, view.sort, m.sessions);
  const shown = view.all ? sorted : sorted.slice(0, TABLE_PAGE);
  const year = m.today.slice(0, 4);
  const sameYear = d => d.slice(0, 4) === year;
  return html`${head(id, label, `${scope} · ${n} ${n === 1 ? 'activity' : 'activities'}`)}
    <div class="ov-table-wrap">
      <table class="ov-table">
        <caption class="sr-only">Activities, ${scope.toLowerCase()}. Choose a column heading to sort.</caption>
        <thead><tr>${COLUMNS.map(c => headerCell(c, view.sort))}</tr></thead>
        <tbody>${shown.map(a => row(a, m, sameYear))}</tbody>
      </table>
    </div>
    ${shown.length < n ? html`<div class="ov-more"><button type="button" class="btn btn--sm btn--quiet" data-show-all>Show all ${n}</button>
      <span class="ov-hint">Showing the first ${shown.length}.</span></div>` : ''}`;
}
