/* Run: node legegruppe/tests/api.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Api = require('../js/api.js');

/** In-memory stand-in for localStorage. */
function fakeStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    _map: map
  };
}

const jsonOk = body => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

// --- a successful call returns the parsed payload, without retrying ---
let calls = 0;
const okClient = Api.createClient({
  endpoint: 'https://example.test/exec',
  storage: fakeStorage(),
  sleep: () => Promise.resolve(),
  fetchImpl: () => { calls++; return jsonOk({ ok: true, family: { familyId: 'f1' } }); }
});
const result = await okClient.call('getFamily', { token: 'tok1234567890' });
assert.equal(result.family.familyId, 'f1');
assert.equal(calls, 1);

// --- the request body carries the action and the payload ---
let sentBody = null, sentOpts = null, sentUrl = null;
const spy = Api.createClient({
  endpoint: 'https://example.test/exec',
  storage: fakeStorage(),
  sleep: () => Promise.resolve(),
  fetchImpl: (url, opts) => {
    sentUrl = url; sentOpts = opts; sentBody = JSON.parse(opts.body);
    return jsonOk({ ok: true });
  }
});
await spy.call('getPlan', { token: 'abc' });
assert.equal(sentUrl, 'https://example.test/exec');
assert.equal(sentOpts.method, 'POST');
assert.equal(sentBody.action, 'getPlan');
assert.equal(sentBody.token, 'abc');
// text/plain keeps the browser from sending a CORS preflight, which Apps Script
// does not answer — get this wrong and every request fails in the browser only.
assert.ok(/^text\/plain/.test(sentOpts.headers['Content-Type']),
  'wrong content type: ' + sentOpts.headers['Content-Type']);

// --- transient failures are retried, then succeed ---
let attempts = 0;
const flaky = Api.createClient({
  endpoint: 'https://example.test/exec',
  storage: fakeStorage(),
  sleep: () => Promise.resolve(),
  fetchImpl: () => {
    attempts++;
    if (attempts < 3) return Promise.reject(new Error('network down'));
    return jsonOk({ ok: true, value: 42 });
  }
});
assert.equal((await flaky.call('getFamily', {})).value, 42);
assert.equal(attempts, 3);

// --- an HTTP-level failure is also treated as transient ---
let httpTries = 0;
const flakyHttp = Api.createClient({
  endpoint: 'https://example.test/exec',
  storage: fakeStorage(),
  sleep: () => Promise.resolve(),
  fetchImpl: () => {
    httpTries++;
    if (httpTries < 2) return Promise.resolve({ ok: false, status: 503 });
    return jsonOk({ ok: true, value: 7 });
  }
});
assert.equal((await flakyHttp.call('getFamily', {})).value, 7);
assert.equal(httpTries, 2);

// --- persistent failure rejects with a Danish message, not a raw stack ---
const dead = Api.createClient({
  endpoint: 'https://example.test/exec',
  storage: fakeStorage(),
  sleep: () => Promise.resolve(),
  fetchImpl: () => Promise.reject(new Error('ECONNREFUSED'))
});
let caught = null;
try { await dead.call('getFamily', {}); } catch (err) { caught = err; }
assert.ok(caught, 'must reject');
assert.ok(/forbindelse|netværk|prøv/i.test(caught.message), caught.message);

// --- a refusal from the server carries the server's own words and is NOT retried ---
let refusalTries = 0;
const refuses = Api.createClient({
  endpoint: 'https://example.test/exec',
  storage: fakeStorage(),
  sleep: () => Promise.resolve(),
  fetchImpl: () => { refusalTries++; return jsonOk({ ok: false, error: 'Ukendt link.' }); }
});
let refused = null;
try { await refuses.call('getFamily', {}); } catch (err) { refused = err; }
assert.equal(refused.message, 'Ukendt link.');
assert.equal(refusalTries, 1, 'a refusal is final — retrying it only delays the message');

// --- drafts survive a failed save and are restored ---
const storage = fakeStorage();
const draftClient = Api.createClient({
  endpoint: 'https://example.test/exec', storage: storage,
  sleep: () => Promise.resolve(),
  fetchImpl: () => Promise.reject(new Error('offline'))
});
draftClient.saveDraft('t1', { hostCapacity: 2 });
assert.deepEqual(draftClient.loadDraft('t1'), { hostCapacity: 2 });
assert.equal(draftClient.loadDraft('other'), null);
draftClient.clearDraft('t1');
assert.equal(draftClient.loadDraft('t1'), null);

// --- corrupt draft data degrades to "no draft" rather than throwing ---
storage.setItem('legegruppe.draft.broken', 'not json at all');
assert.equal(draftClient.loadDraft('broken'), null);

// --- a queued save is retried on demand and cleared once it lands ---
const queueStorage = fakeStorage();
let queueAttempts = 0;
const queued = Api.createClient({
  endpoint: 'https://example.test/exec', storage: queueStorage,
  sleep: () => Promise.resolve(),
  fetchImpl: () => {
    queueAttempts++;
    if (queueAttempts <= 3) return Promise.reject(new Error('offline'));
    return jsonOk({ ok: true });
  }
});
try { await queued.saveFamily('t2', { hostCapacity: 1 }); } catch (err) { /* expected */ }
assert.deepEqual(queued.loadDraft('t2'), { hostCapacity: 1 }, 'a failed save must leave a draft');
await queued.flushDraft('t2');
assert.equal(queued.loadDraft('t2'), null, 'a successful flush clears the draft');

// --- flushing with nothing queued is a no-op, not an error ---
assert.equal(await queued.flushDraft('never-saved'), null);

// --- the endpoint placeholder must still be a placeholder in the repo ---
assert.ok(/REPLACE_ME/.test(Api.ENDPOINT),
  'a real deployment URL must not be committed to the repository');

console.log('ok - api');
