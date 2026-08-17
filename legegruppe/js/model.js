/* Domain model for legegruppe. Pure — no DOM, no network.
   Browser: window.LG.Model   Node: require('./model.js') */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LG = Object.assign(root.LG || {}, { Model: factory() });
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WEEKDAYS = [1, 2, 3, 4, 5]; // 1 = mandag … 5 = fredag

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /** Parse to a non-negative integer, clamped. Anything unparseable becomes `lo`. */
  function int(value, lo, hi) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? clamp(n, lo, hi) : lo;
  }

  /** Stable, order-independent key for a pair of children. */
  function pairKey(a, b) {
    return a < b ? a + '|' + b : b + '|' + a;
  }

  /** Parse "42, 43" or [42, 43] into a sorted array of valid ISO week numbers. */
  function parseWeeks(value) {
    const parts = Array.isArray(value)
      ? value
      : String(value == null ? '' : value).split(/[,\s;]+/);
    const weeks = parts
      .map(p => parseInt(p, 10))
      .filter(n => Number.isFinite(n) && n >= 1 && n <= 53);
    return Array.from(new Set(weeks)).sort((x, y) => x - y);
  }

  /** Raw questionnaire answers → validated family with derived fields. Never throws. */
  function normaliseFamily(raw) {
    const r = raw || {};
    const place = String(r.meetingPlace || 'home');
    const weekdays = (Array.isArray(r.availableWeekdays) ? r.availableWeekdays : [])
      .map(d => parseInt(d, 10))
      .filter(d => WEEKDAYS.indexOf(d) !== -1);
    const fetchCapacity = int(r.fetchCapacity, 0, 5);

    return {
      familyId: String(r.familyId || ''),
      classId: String(r.classId || ''),
      token: String(r.token || ''),
      parentName: String(r.parentName || ''),
      contact: String(r.contact || ''),
      hostCapacity: int(r.hostCapacity, 0, 3),
      maxChildrenAtHome: int(r.maxChildrenAtHome, 0, 8),
      availableWeekdays: Array.from(new Set(weekdays)).sort((x, y) => x - y),
      fetchCapacity: fetchCapacity,
      canHostOutdoor: place === 'outdoor' || place === 'both',
      meetingPlace: place,
      requiresChildrenBrought: fetchCapacity === 0,
      blackoutWeeks: parseWeeks(r.blackoutWeeks),
      note: String(r.note || ''),
      consentAt: r.consentAt || null,
      updatedAt: r.updatedAt || null,
      hasResponded: Boolean(r.consentAt || r.updatedAt)
    };
  }

  /**
   * Assemble a problem instance with indexed lookups.
   * `history` is a flat list of {childA, childB} rows, one per shared round.
   */
  function buildProblem(input) {
    const families = (input.families || []).map(normaliseFamily);
    const byFamilyId = new Map(families.map(f => [f.familyId, f]));
    const children = (input.children || []).map(c => ({
      childId: String(c.childId),
      familyId: String(c.familyId),
      name: String(c.name || '')
    }));
    const childById = new Map(children.map(c => [c.childId, c]));

    const blocked = new Set();
    (input.blockedPairs || []).forEach(p => blocked.add(pairKey(String(p[0]), String(p[1]))));

    const history = new Map();
    (input.history || []).forEach(h => {
      const k = pairKey(String(h.childA), String(h.childB));
      history.set(k, (history.get(k) || 0) + 1);
    });

    return {
      classId: String(input.classId || ''),
      _input: input,
      children: children,
      families: families,
      groupSizeMin: int(input.groupSizeMin, 2, 8) || 4,
      groupSizeMax: int(input.groupSizeMax, 2, 8) || 5,
      weeks: parseWeeks(input.weeks),
      meetingsPerGroup: int(input.meetingsPerGroup, 1, 24) || 6,
      childById: childById,
      familyOf: childId => byFamilyId.get((childById.get(childId) || {}).familyId) || null,
      familyById: id => byFamilyId.get(id) || null,
      isBlocked: (a, b) => blocked.has(pairKey(a, b)),
      timesTogether: (a, b) => history.get(pairKey(a, b)) || 0
    };
  }

  /** mulberry32 — small, fast, seedable. Same seed always yields the same stream. */
  function rng(seed) {
    let t = (seed >>> 0) || 1;
    return function () {
      t += 0x6D2B79F5;
      let x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  return { WEEKDAYS, pairKey, parseWeeks, normaliseFamily, buildProblem, rng, clamp };
});
