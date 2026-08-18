/* Parent questionnaire: pure validation and mapping, plus thin DOM helpers.
   Browser: window.LG.Form   Node: require('./form.js') */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LG = Object.assign(root.LG || {}, { Form: factory() });
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const REQUIRED = [
    ['parentName', 'Skriv dit navn, så de andre forældre ved hvem de skriver til.'],
    ['contact', 'Skriv en mail eller et mobilnummer, så vi kan få fat i jer.'],
    ['hostCapacity', 'Vælg hvor mange gange I kan lægge hus til. Nul er et helt gyldigt svar.'],
    ['maxChildrenAtHome', 'Vælg hvor mange børn I kan have hjemme.'],
    ['fetchCapacity', 'Vælg hvor mange børn I kan hente fra skole.']
  ];

  const looksLikeEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
  const looksLikePhone = s => /^\+?[\d\s]{8,15}$/.test(s);

  /** Returns [] when the answers are good enough to save. */
  function validate(values) {
    const v = values || {};
    const errors = [];

    REQUIRED.forEach(function (pair) {
      const value = v[pair[0]];
      if (value === '' || value === null || value === undefined) {
        errors.push({ field: pair[0], message: pair[1] });
      }
    });

    if (!Array.isArray(v.availableWeekdays) || v.availableWeekdays.length === 0) {
      errors.push({ field: 'availableWeekdays',
        message: 'Vælg mindst én hverdag der kan passe jer.' });
    }

    const contact = String(v.contact || '').trim();
    if (contact && !looksLikeEmail(contact) && !looksLikePhone(contact)) {
      errors.push({ field: 'contact',
        message: 'Det ligner hverken en mailadresse eller et telefonnummer.' });
    }

    if (!v.consent) {
      errors.push({ field: 'consent',
        message: 'Sæt flueben i samtykket, så vi må gemme jeres svar.' });
    }

    return errors;
  }

  /** "uge 42 og 43" → [42, 43]. Tolerant on purpose: people write what they write. */
  function parseBlackout(text) {
    const found = String(text == null ? '' : text).match(/\d+/g) || [];
    const weeks = found.map(Number).filter(n => n >= 1 && n <= 53);
    return Array.from(new Set(weeks)).sort((a, b) => a - b);
  }

  /** Form values → the shape the backend stores. */
  function toPayload(values) {
    const v = values || {};
    return {
      parentName: String(v.parentName || '').trim(),
      contact: String(v.contact || '').trim(),
      hostCapacity: parseInt(v.hostCapacity, 10) || 0,
      maxChildrenAtHome: parseInt(v.maxChildrenAtHome, 10) || 0,
      availableWeekdays: (v.availableWeekdays || []).map(Number).sort((a, b) => a - b),
      fetchCapacity: parseInt(v.fetchCapacity, 10) || 0,
      meetingPlace: v.meetingPlace || 'home',
      blackoutWeeks: parseBlackout(v.blackoutWeeks),
      note: String(v.note || '').trim()
    };
  }

  /**
   * Stored family → form values, for the "update my answers" case.
   *
   * A family that has never answered comes back from the backend with zeroes in
   * every capacity field. Feeding those straight into the form pre-selected
   * "Ingen gange" and "Vi kan ikke have besøg" — the app answering on the parent's
   * behalf that they can do nothing, before they had read the question. Anyone who
   * just pressed save would have submitted that. So an unanswered family yields an
   * empty form, and validation then requires a real choice.
   */
  function fromFamily(family) {
    const f = family || {};
    const answered = Boolean(f.consentAt || f.updatedAt);
    const capacity = value => (answered && value != null && value !== '')
      ? String(value) : '';
    return {
      parentName: String(f.parentName || ''),
      contact: String(f.contact || ''),
      hostCapacity: capacity(f.hostCapacity),
      maxChildrenAtHome: capacity(f.maxChildrenAtHome),
      availableWeekdays: answered ? (f.availableWeekdays || []).map(String) : [],
      fetchCapacity: capacity(f.fetchCapacity),
      meetingPlace: f.meetingPlace || 'home',
      blackoutWeeks: Array.isArray(f.blackoutWeeks)
        ? f.blackoutWeeks.join(',') : String(f.blackoutWeeks || ''),
      note: String(f.note || ''),
      // Consent is only implied by an answer that actually exists.
      consent: answered
    };
  }

  /** Read every answer out of a <form>. Browser only. */
  function readForm(formEl) {
    const data = new FormData(formEl);
    return {
      parentName: data.get('parentName') || '',
      contact: data.get('contact') || '',
      hostCapacity: data.get('hostCapacity') || '',
      maxChildrenAtHome: data.get('maxChildrenAtHome') || '',
      availableWeekdays: data.getAll('availableWeekdays'),
      fetchCapacity: data.get('fetchCapacity') || '',
      meetingPlace: data.get('meetingPlace') || 'home',
      blackoutWeeks: data.get('blackoutWeeks') || '',
      note: data.get('note') || '',
      consent: Boolean(data.get('consent'))
    };
  }

  /** Push saved values back into the DOM. Browser only. */
  function writeForm(formEl, values) {
    Object.keys(values).forEach(function (name) {
      const value = values[name];
      const fields = formEl.querySelectorAll('[name="' + name + '"]');
      Array.prototype.forEach.call(fields, function (el) {
        if (el.type === 'checkbox') {
          el.checked = Array.isArray(value)
            ? value.indexOf(el.value) !== -1
            : Boolean(value);
        } else if (el.type === 'radio') {
          el.checked = String(value) === el.value;
        } else {
          el.value = value;
        }
      });
    });
  }

  return { validate, parseBlackout, toPayload, fromFamily, readForm, writeForm };
});
