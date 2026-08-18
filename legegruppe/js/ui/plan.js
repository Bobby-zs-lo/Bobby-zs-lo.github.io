/* Turns a solved round into Danish prose. Pure — the page only places the strings.
   Browser: window.LG.Plan   Node: require('./plan.js') */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LG = Object.assign(root.LG || {}, { Plan: factory() });
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const NO_PLAN = 'Der er ingen offentliggjort plan endnu.';

  function childIndex(ctx) {
    if (!ctx._byId) {
      ctx._byId = new Map((ctx.children || []).map(c => [c.childId, c]));
    }
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

  /** One meeting as short Danish strings the page can place directly. */
  function describeMeeting(ctx, meeting) {
    const host = parentName(ctx, meeting.hostFamilyId);
    const where = meeting.place === 'ude'
      ? 'ude — legeplads eller park, ' + host + ' er med'
      : 'hjemme hos ' + host;
    return {
      when: 'Uge ' + meeting.week + ', ' + meeting.weekdayName,
      host: where,
      transport: meeting.transport === 'dækket'
        ? meeting.fetchers.map(f => parentName(ctx, f)).join(' og ') +
          ' henter børnene fra skole'
        : 'Transport aftales indbyrdes, eller børnene mødes på skolens legeplads',
      needsAgreement: meeting.transport !== 'dækket',
      week: meeting.week,
      hostFamilyId: meeting.hostFamilyId
    };
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

  /** The whole plan as plain text, ready to paste into Aula. No markup. */
  function toPlainText(ctx) {
    if (!ctx.round || !ctx.round.groups || ctx.round.groups.length === 0) return NO_PLAN;
    const lines = ['LEGEGRUPPER', ''];
    ctx.round.groups.forEach(group => {
      lines.push('Gruppe ' + group.id + ': ' + childNames(ctx, group.childIds).join(', '));
      const rota = rotaFor(ctx, group.id);
      if (rota) {
        rota.meetings.forEach(m => {
          const d = describeMeeting(ctx, m);
          lines.push('  ' + d.when + ' - ' + d.host);
          lines.push('    ' + d.transport);
        });
      }
      lines.push('');
    });
    lines.push('Spørgsmål? Skriv i klassens gruppe.');
    return lines.join('\n');
  }

  return { groupForFamily, rotaFor, describeMeeting, myHostWeeks, toPlainText,
    childNames, parentName, NO_PLAN };
});
