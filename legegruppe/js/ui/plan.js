/* Turns a solved round into Danish prose and real dates. Pure — the page only
   places the strings.
   Browser: window.LG.Plan   Node: require('./plan.js') */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LG = Object.assign(root.LG || {}, { Plan: factory() });
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const NO_PLAN = 'Der er ingen offentliggjort plan endnu.';
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun',
                  'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const DAY_NAMES = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag'];

  // ── dates ──────────────────────────────────────────────────────────
  // Parents do not think in week numbers. The plan is built on them because that
  // is how a term is planned, but "uge 34" means nothing standing in a kitchen in
  // August, so every meeting also carries the actual date.

  /** Monday of an ISO week. ISO week 1 is the week containing 4 January. */
  function mondayOfIsoWeek(week, year) {
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dow = jan4.getUTCDay() || 7;
    const firstMonday = new Date(jan4.getTime());
    firstMonday.setUTCDate(jan4.getUTCDate() - dow + 1);
    const d = new Date(firstMonday.getTime());
    d.setUTCDate(firstMonday.getUTCDate() + (week - 1) * 7);
    return d;
  }

  /** ISO week number of a date. */
  function isoWeekOf(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dow = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dow);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }

  /**
   * The date a meeting falls on.
   *
   * A week number carries no year, so one has to be chosen. The first attempt used
   * "any week below this one belongs to next year", which broke as soon as a
   * meeting slipped into the past: week 34 seen from September was pushed twelve
   * months forward and came back as the NEXT meeting. Picking the year whose date
   * lands nearest to today is right in both directions.
   */
  function meetingDate(week, weekday, reference) {
    const ref = reference || new Date();
    const refTime = Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate());
    let best = null;
    [-1, 0, 1].forEach(function (offset) {
      const d = mondayOfIsoWeek(week, ref.getFullYear() + offset);
      d.setUTCDate(d.getUTCDate() + (weekday - 1));
      const distance = Math.abs(d.getTime() - refTime);
      if (!best || distance < best.distance) best = { date: d, distance: distance };
    });
    return best.date;
  }

  /**
   * Dates for a whole run of meetings. Week numbers only climb inside a round, so
   * one that drops has crossed New Year - that is how a term running from week 46
   * into week 6 stays in order.
   */
  function withDates(meetings, reference) {
    if (!meetings || !meetings.length) return [];
    const first = meetingDate(meetings[0].week, meetings[0].weekday, reference);
    let year = first.getUTCFullYear();
    let previousWeek = meetings[0].week;
    return meetings.map(function (m, i) {
      if (i > 0 && m.week < previousWeek) year++;
      previousWeek = m.week;
      const d = mondayOfIsoWeek(m.week, year);
      d.setUTCDate(d.getUTCDate() + (m.weekday - 1));
      return { meeting: m, date: d };
    });
  }

  /** "17. aug" */
  function formatDate(date) {
    return date.getUTCDate() + '. ' + MONTHS[date.getUTCMonth()];
  }

  /** Has this meeting already happened? Compared by day, not by hour. */
  function isPast(date, reference) {
    const ref = reference || new Date();
    const today = Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate());
    return date.getTime() < today;
  }

  // ── lookups ────────────────────────────────────────────────────────
  function childIndex(ctx) {
    if (!ctx._byId) ctx._byId = new Map((ctx.children || []).map(c => [c.childId, c]));
    return ctx._byId;
  }

  function childNames(ctx, ids) {
    const index = childIndex(ctx);
    return (ids || []).map(id => (index.get(id) || {}).name || id);
  }

  function parentName(ctx, familyId) {
    return ((ctx.contacts || {})[familyId] || {}).parentName || 'en forælder';
  }

  /** The group containing this family's child, or null. */
  function groupForFamily(ctx, familyId) {
    if (!ctx.round || !ctx.round.groups) return null;
    const index = childIndex(ctx);
    const found = ctx.round.groups.filter(g =>
      (g.childIds || []).some(id => (index.get(id) || {}).familyId === familyId))[0];
    return found || null;
  }

  function rotaFor(ctx, groupId) {
    if (!ctx.round || !ctx.round.rota) return null;
    return ctx.round.rota.groups.filter(g => g.id === groupId)[0] || null;
  }

  // ── meetings ───────────────────────────────────────────────────────

  /** One meeting as the strings and flags a page needs, dates included. */
  function describeMeeting(ctx, meeting, myFamilyId, reference, knownDate) {
    const host = parentName(ctx, meeting.hostFamilyId);
    const date = knownDate || meetingDate(meeting.week, meeting.weekday, reference);
    const outdoors = meeting.place === 'ude';
    return {
      week: meeting.week,
      date: date,
      dateText: formatDate(date),
      weekday: meeting.weekdayName,
      when: 'Uge ' + meeting.week + ', ' + meeting.weekdayName,
      whenFull: meeting.weekdayName + ' ' + formatDate(date),
      host: outdoors
        ? 'ude — legeplads eller park, ' + host + ' er med'
        : 'hjemme hos ' + host,
      hostName: host,
      outdoors: outdoors,
      transport: meeting.transport === 'dækket'
        ? meeting.fetchers.map(f => parentName(ctx, f)).join(' og ') +
          ' henter børnene fra skole'
        : 'Transport aftales indbyrdes, eller børnene mødes på skolens legeplads',
      needsAgreement: meeting.transport !== 'dækket',
      isMine: Boolean(myFamilyId) && meeting.hostFamilyId === myFamilyId,
      isPast: isPast(date, reference),
      hostFamilyId: meeting.hostFamilyId
    };
  }

  /** Every meeting in this family's own group, in order, already described. */
  function myMeetings(ctx, familyId, reference) {
    const group = groupForFamily(ctx, familyId);
    if (!group) return [];
    const rota = rotaFor(ctx, group.id);
    if (!rota) return [];
    return withDates(rota.meetings, reference)
      .map(x => describeMeeting(ctx, x.meeting, familyId, reference, x.date));
  }

  /** The next meeting that has not happened yet — the thing people open this for. */
  function nextMeeting(ctx, familyId, reference) {
    return myMeetings(ctx, familyId, reference).filter(m => !m.isPast)[0] || null;
  }

  /** Which weeks is this family hosting, across the whole round? */
  function myHostWeeks(ctx, familyId) {
    if (!ctx.round || !ctx.round.rota) return [];
    const weeks = [];
    ctx.round.rota.groups.forEach(g => g.meetings.forEach(m => {
      if (m.hostFamilyId === familyId) weeks.push(m.week);
    }));
    return weeks.sort((a, b) => a - b);
  }

  /** A sentence about this family's own hosting duty, for the top of the page. */
  function hostingSummary(ctx, familyId, reference) {
    const mine = myMeetings(ctx, familyId, reference).filter(m => m.isMine);
    if (mine.length === 0) {
      return 'I er ikke sat på som vært denne gang. Andre i gruppen lægger hus til.';
    }
    const upcoming = mine.filter(m => !m.isPast);
    const parts = (upcoming.length ? upcoming : mine)
      .map(m => 'uge ' + m.week + ' (' + m.weekday + ' ' + m.dateText + ')');
    const when = parts.length === 1
      ? parts[0]
      : parts.slice(0, -1).join(', ') + ' og ' + parts[parts.length - 1];
    if (upcoming.length === 0) return 'I har lagt hus til ' + when + '. Ikke flere gange i denne runde.';
    return 'I lægger hus til ' + when + '.';
  }

  /** The whole plan as plain text, ready to paste into Aula. No markup. */
  function toPlainText(ctx, reference) {
    if (!ctx.round || !ctx.round.groups || ctx.round.groups.length === 0) return NO_PLAN;
    const lines = ['LEGEGRUPPER', ''];
    ctx.round.groups.forEach(group => {
      lines.push('Gruppe ' + group.id + ': ' + childNames(ctx, group.childIds).join(', '));
      const rota = rotaFor(ctx, group.id);
      if (rota) {
        withDates(rota.meetings, reference).forEach(x => {
          const d = describeMeeting(ctx, x.meeting, null, reference, x.date);
          lines.push('  Uge ' + d.week + ', ' + d.weekday + ' ' + d.dateText + ' - ' + d.host);
          lines.push('    ' + d.transport);
        });
      }
      lines.push('');
    });
    lines.push('Spørgsmål? Skriv i klassens gruppe.');
    return lines.join('\n');
  }

  return {
    groupForFamily, rotaFor, describeMeeting, myMeetings, nextMeeting,
    myHostWeeks, hostingSummary, toPlainText, childNames, parentName,
    mondayOfIsoWeek, isoWeekOf, meetingDate, withDates, formatDate, isPast,
    NO_PLAN, DAY_NAMES
  };
});
