/* Apps Script client: retry with backoff plus a local draft queue.
   Browser: window.LG.Api   Node: require('./api.js') */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LG = Object.assign(root.LG || {}, { Api: factory() });
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Filled in during setup — see legegruppe/SETUP.md, step 4.
  const ENDPOINT = 'https://script.google.com/macros/s/REPLACE_ME/exec';

  const RETRIES = 3;
  const BASE_DELAY_MS = 400;
  const DRAFT_PREFIX = 'legegruppe.draft.';

  const NETWORK_MESSAGE =
    'Der er ingen forbindelse til serveren lige nu. Dine svar er gemt her på telefonen — prøv igen om lidt.';

  /**
   * Two failures look identical to a caller but must be handled oppositely:
   * a transport failure is worth retrying, a refusal from the server is not.
   * Retrying "Ukendt link." three times helps nobody and delays the message.
   * The distinction is carried on the error object, never sniffed from its text.
   */
  function refusal(message) {
    const err = new Error(message);
    err.isRefusal = true;
    return err;
  }

  function createClient(config) {
    const cfg = config || {};
    const endpoint = cfg.endpoint || ENDPOINT;
    const doFetch = cfg.fetchImpl || (typeof fetch === 'function' ? fetch.bind(null) : null);
    const store = cfg.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const sleep = cfg.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));

    /** POST one action, retrying transport failures with exponential backoff. */
    async function call(action, payload) {
      if (!doFetch) throw new Error(NETWORK_MESSAGE);
      const body = JSON.stringify(Object.assign({ action: action }, payload || {}));

      for (let attempt = 0; attempt < RETRIES; attempt++) {
        if (attempt > 0) await sleep(BASE_DELAY_MS * Math.pow(2, attempt - 1));
        try {
          // text/plain avoids a CORS preflight, which Apps Script does not answer.
          const response = await doFetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: body
          });
          if (!response.ok) continue;   // transport-level failure: worth another go
          const data = await response.json();
          if (!data || data.ok !== true) {
            throw refusal((data && data.error) || 'Serveren afviste anmodningen.');
          }
          return data;
        } catch (err) {
          if (err && err.isRefusal) throw err;   // the server meant it; stop asking
          // Anything else is transport trouble — fall through and retry.
        }
      }
      throw new Error(NETWORK_MESSAGE);
    }

    const draftKey = token => DRAFT_PREFIX + token;

    function saveDraft(token, family) {
      if (!store) return;
      store.setItem(draftKey(token), JSON.stringify(family));
    }

    function loadDraft(token) {
      if (!store) return null;
      const raw = store.getItem(draftKey(token));
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (err) { return null; }
    }

    function clearDraft(token) {
      if (store) store.removeItem(draftKey(token));
    }

    /**
     * Save answers. The draft is written BEFORE the request and only cleared once
     * the server has confirmed, so a parent who fills the form in on the bus does
     * not lose two minutes of work to a dropped signal.
     */
    async function saveFamily(token, family) {
      saveDraft(token, family);
      const result = await call('saveFamily', { token: token, family: family });
      clearDraft(token);
      return result;
    }

    /** Retry a save that failed earlier. No-op when there is no draft. */
    async function flushDraft(token) {
      const draft = loadDraft(token);
      if (!draft) return null;
      const result = await call('saveFamily', { token: token, family: draft });
      clearDraft(token);
      return result;
    }

    return {
      call, saveFamily, saveDraft, loadDraft, clearDraft, flushDraft,
      getFamily: token => call('getFamily', { token: token }),
      getPlan: token => call('getPlan', { token: token }),
      adminSnapshot: passphrase => call('adminSnapshot', { passphrase: passphrase }),
      addFamily: (passphrase, parentName, contact, childNames) =>
        call('addFamily', { passphrase, parentName, contact, childNames }),
      setBlockedPairs: (passphrase, pairs) => call('setBlockedPairs', { passphrase, pairs }),
      publishRound: (passphrase, round) =>
        call('publishRound', Object.assign({ passphrase: passphrase }, round)),
      deleteAll: (passphrase, confirm) => call('deleteAll', { passphrase, confirm })
    };
  }

  return { createClient, ENDPOINT, NETWORK_MESSAGE };
});
