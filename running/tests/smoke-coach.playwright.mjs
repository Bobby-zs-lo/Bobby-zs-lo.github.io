// The smoke test's steps for the Coach page: the thread with the coach (js/views/coach-thread.js),
// goals and notes (js/views/coach-goals.js) and the page that holds them (js/views/reviews.js).
// Not run on its own: smoke.playwright.mjs owns the browser, the static server and the mock API
// and calls coachSteps() with its helpers. Invented data only; the coach here is the canned one
// in tests/mock-coach.mjs, which answers on the first request after a message (the smoke test's
// mock reads for 0 ms), so no step waits out the app's eight seconds between polls.
import assert from 'node:assert/strict';
import { join } from 'node:path';

const LONG_RUN = 'w-2026-10-17-run';
const REVIEW = 'r-2026-10-13-a1';
const SEND = '#coach-form button[type=submit]';

const count = (page, selector) => page.locator(selector).count();
const posts = (log, path) => log.filter(l => l.method === 'POST' && l.path === path);
// What the page does by itself every few seconds while a reply is awaited, asked for now: the
// handler for a tab that becomes visible again polls at once.
const pollNow = page => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

async function say(page, text) {
  await page.fill('#coach-text', text);
  await page.click(SEND);
  await page.waitForSelector('.coach-wait--thinking');
}

export async function coachSteps({ step, newPage, go, overflow, SHOTS }) {
  const fits = async (page, what) => {
    const o = await overflow(page);
    assert.ok(o.scrollW <= o.W && o.bad.length === 0, `${what} overflows: ${JSON.stringify(o)}`);
  };
  const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });

  await step('phone (390 px) Coach: a message is sent, waited for and answered; the goal and the note it made show up', async () => {
    const { ctx, page, log, errors } = await newPage();
    await go(page, 'reviews');
    assert.equal(await page.textContent('#view h1'), 'Coach');
    assert.equal((await page.textContent('.tab[data-tab=reviews]')).trim(), 'Coach');
    assert.match(await page.textContent('.page-head .eyebrow'), /Berlin Marathon · 348 days to go/);
    assert.deepEqual([await count(page, '.msg'), await count(page, '.goal'), await count(page, '.note')], [2, 2, 2]);
    assert.match(await page.textContent('.msg--user .msg-about'), /The plan as a whole/);
    assert.match(await page.textContent('.msg--coach .out--note'), /Noted: “Long run on Saturdays”/);
    assert.equal(await count(page, '.coach-wait'), 0, 'nothing is waiting');

    // An empty message goes nowhere.
    await page.click(SEND);
    assert.match(await page.textContent('#coach-error'), /Write something first/);
    assert.equal(posts(log, '/api/coach/messages').length, 0);

    await say(page, 'A new goal: a half marathon in April. And never on Tuesday. Can this week be easier?');
    assert.deepEqual(posts(log, '/api/coach/messages')[0].body, { text: 'A new goal: a half marathon in April. And never on Tuesday. Can this week be easier?' });
    assert.equal(await page.inputValue('#coach-text'), '', 'the composer is empty again');
    assert.match(await page.textContent('.msg.is-pending .msg-state'), /Not answered yet/);
    assert.match(await page.textContent('.coach-wait'), /two to three minutes/);
    await fits(page, 'the thread while waiting');

    await pollNow(page);
    await page.waitForSelector('.msg--coach .out--goal');
    assert.match(await page.textContent('.toast--ok'), /The coach replied/);
    const reply = page.locator('.msg--coach').last();
    assert.match(await reply.locator('.out--applied').textContent(), /Done\s*Change Long run \(Sat 17 Oct\): 6 km\s*You asked for an easier week/);
    assert.match(await reply.locator('.out--goal').textContent(), /Goal added: Half marathon, target 1:45:00/);
    assert.match(await reply.locator('.out--note').textContent(), /Noted: “No runs on Tuesdays”/);
    assert.equal(await count(page, '.coach-wait'), 0, 'the wait is over');
    assert.equal(await count(page, '.msg.is-pending'), 0);
    assert.deepEqual([await count(page, '.msg'), await count(page, '.goal'), await count(page, '.note')], [4, 3, 3]);
    assert.match(await page.textContent('.goal-list'), /Half marathon[\s\S]*Sun 18 Apr 2027 · in 187 days · 21\.1 km · target 1:45:00/);
    await fits(page, 'the Coach page');
    await shot(page, 'phone-coach');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await step('phone (390 px) Coach: Comment on a review, and "Ask the coach" on a session, say what the message is about', async () => {
    const { ctx, page, log, errors } = await newPage();
    await go(page, 'reviews');
    await page.click(`[data-comment="review:${REVIEW}"]`);
    assert.match(await page.textContent('.coach-about'), /About\s*Review of 5–11 Oct/);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'coach-text', 'the cursor is in the composer');
    await page.click('[data-about-clear]');
    assert.equal(await count(page, '.coach-about'), 0);
    await page.click('.proposal [data-comment]');
    assert.match(await page.textContent('.coach-about'), /Proposal: /);

    // From a session: the address carries the reference once, and the composer is ready for it.
    await go(page, `workout/${LONG_RUN}`);
    await page.click('text=Ask the coach about this session');
    await page.waitForSelector('.coach-about');
    assert.match(await page.textContent('.coach-about'), /Long run, Sat 17 Oct/);
    assert.equal(await page.evaluate(() => location.hash), '#/reviews', 'a reload asks about nothing');
    await say(page, 'Can this one be shorter?');
    assert.deepEqual(posts(log, '/api/coach/messages')[0].body, { text: 'Can this one be shorter?', about: { type: 'workout', id: LONG_RUN } });
    assert.equal(await count(page, '.coach-about'), 0, 'the next message is about nothing in particular');
    const mine = page.locator('.msg--user').last();
    assert.equal(await mine.locator('.msg-about a').getAttribute('href'), `#/workout/${LONG_RUN}`);
    await pollNow(page);
    await page.waitForFunction(() => !document.querySelector('.coach-wait'));
    assert.match(await page.locator('.msg--coach').last().textContent(), /shorter this week/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await step('phone (390 px) Coach: his own goals and notes; a message nobody answers offers Try again', async () => {
    const { ctx, page, log, errors } = await newPage();
    await go(page, 'reviews');

    // A new goal: a wrong time is caught in the form, the right one is saved as seconds.
    await page.click('[data-goal-new]');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'g-title');
    await page.fill('#g-title', 'Halvmaraton');
    await page.selectOption('#g-kind', 'race');
    await page.fill('#g-date', '2027-04-18');
    await page.fill('#g-km', '21,1');
    // The phone shows a number pad for the time, which has no colon: digits alone must do.
    assert.equal(await page.getAttribute('#g-target', 'inputmode'), 'numeric');
    await page.type('#g-target', '175');
    assert.equal(await page.inputValue('#g-target'), '1:75');
    await page.click('.goal-form button[type=submit]');
    assert.match(await page.textContent('[data-goal-error]'), /Type the digits only/);
    assert.equal(await page.getAttribute('#g-target', 'aria-invalid'), 'true');
    assert.equal(posts(log, '/api/goals').length, 0);
    await fits(page, 'the goal form');
    await shot(page, 'phone-coach-goal-form');
    await page.fill('#g-target', '');
    await page.type('#g-target', '14500');
    assert.equal(await page.inputValue('#g-target'), '1:45:00', 'the colons filled themselves in');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    assert.equal(await page.inputValue('#g-target'), '1:45', 'and go again with the digits');
    await page.type('#g-target', '00');
    await page.click('.goal-form button[type=submit]');
    await page.waitForFunction(() => document.querySelectorAll('.goal').length === 3);
    assert.deepEqual(posts(log, '/api/goals')[0].body, { title: 'Halvmaraton', kind: 'race', date: '2027-04-18', distanceKm: 21.1, targetSeconds: 6300, note: null });
    assert.equal(await count(page, '.goal-form'), 0);
    await page.waitForFunction(() => document.activeElement.matches('[data-goal-new]'));

    // A dated goal with a distance changes what the plan should be: the card says so and offers the rebuild.
    assert.match(await page.textContent('.goal-stale'), /Your goals or your 5K time have changed since this plan was built/);
    assert.match(await page.locator('.goal', { hasText: '10 km under 50:00' }).locator('.goal-outlook').textContent(), /^Your 5K predicts \d+:\d\d\. The target needs a 5K near/);
    page.once('dialog', d => d.accept());
    await page.click('[data-plan-rebuild]');
    await page.waitForFunction(() => !document.querySelector('.goal-stale'));
    assert.equal(posts(log, '/api/plan/rebuild').length, 1);
    assert.match(await page.locator('.goal', { hasText: 'Halvmaraton' }).locator('.goal-outlook').textContent(), /Your 5K predicts 1:\d\d:\d\d\. The target needs a 5K near/);

    // The marathon gets a target time; its name and date are not for this form.
    await page.click('[data-goal-edit="main"]');
    assert.equal(await count(page, '#g-title'), 0);
    await page.type('#g-target', '34500');
    await page.click('.goal-form button[type=submit]');
    await page.waitForFunction(() => /target 3:45:00/.test(document.querySelector('.goal--main').textContent));
    // Opened again, the field holds the time in the form it is typed in.
    await page.click('[data-goal-edit="main"]');
    assert.equal(await page.inputValue('#g-target'), '3:45:00');
    await page.click('[data-goal-cancel]');
    await page.waitForFunction(() => document.activeElement.matches('[data-goal-edit="main"]'));
    assert.equal(await page.getAttribute('[data-goal-edit="main"]', 'aria-label'), 'Edit Berlin Marathon', 'the name holds the word on the button');
    assert.deepEqual(log.find(l => l.method === 'PUT' && l.path === '/api/goals/main').body, { targetSeconds: 13500, note: null });

    // A note of his own, added and taken away again.
    await page.fill('#note-text', 'Travelling 20–27 Oct');
    await page.click('.note-form button[type=submit]');
    await page.waitForFunction(() => document.querySelectorAll('.note').length === 3);
    assert.deepEqual(posts(log, '/api/coach/notes')[0].body, { text: 'Travelling 20–27 Oct' });
    assert.equal(await page.inputValue('#note-text'), '');
    await page.click('.note:last-child [data-note-remove]');
    await page.waitForFunction(() => document.querySelectorAll('.note').length === 2);
    await page.waitForFunction(() => document.activeElement.id === 'note-text');
    assert.ok(log.some(l => l.method === 'DELETE' && l.path.startsWith('/api/coach/notes/')));

    // The canned coach stays silent on the word: the wait gives way to Try again, and that gets an answer.
    await say(page, 'silence');
    // The wait line changes with this answer; the thread, the goals and the focus do not.
    await page.focus('[data-goal-edit="main"]');
    await page.evaluate(() => { document.querySelector('.msg').kept = true; document.querySelector('.goal').kept = true; });
    await pollNow(page);
    await page.waitForSelector('.coach-wait--stalled [data-retry]');
    assert.deepEqual(await page.evaluate(() => [document.querySelector('.msg').kept, document.querySelector('.goal').kept, document.activeElement.matches('[data-goal-edit="main"]')]),
      [true, true, true], 'an answer that changes nothing redraws nothing and leaves the focus where it was');
    assert.match(await page.textContent('.coach-wait'), /No reply yet/);
    await page.click('[data-retry]');
    await page.waitForSelector('.coach-wait--thinking');
    assert.equal(posts(log, '/api/coach/retry').length, 1);
    await page.waitForFunction(() => document.activeElement.id === 'coach-text'); // the button went with the wait
    await pollNow(page);
    await page.waitForFunction(() => !document.querySelector('.coach-wait'));
    assert.equal(await count(page, '.msg.is-pending'), 0);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await step('phone (390 px) Coach: a backend without the thread still shows proposals and reviews', async () => {
    const { ctx, page, errors } = await newPage();
    // GET /api/coach answers 404, as a backend deployed before v0.10.0 does. The handler stays for the
    // life of the page (see smoke-links: a handler taken away mid-request lets the request out).
    await page.route(/\/api\/coach$/, route => (route.request().method() === 'GET'
      ? route.fulfill({ status: 404, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not found' }) })
      : route.fallback()));
    await go(page, 'reviews');
    assert.equal(await page.textContent('#view h1'), 'Coach');
    assert.deepEqual([await count(page, '.proposal'), await count(page, '.review'), await count(page, '[data-undo]')], [1, 1, 1]);
    assert.deepEqual([await count(page, '.coach-thread'), await count(page, '.goal'), await count(page, '.note'), await count(page, '[data-comment]')], [0, 0, 0, 0],
      'no thread, and so nothing to comment to');
    await fits(page, 'the Coach page without a thread');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await step('desk (1440 px) Coach: the thread and reviews to the left, what needs him to the right; a narrower window keeps what he typed', async () => {
    const { ctx, page, errors } = await newPage({ desk: true });
    await go(page, 'reviews');
    const box = async selector => page.locator(selector).first().boundingBox();
    const [thread, reviews, proposals, goals] = [await box('.coach-thread'), await box('#r-reviews'), await box('#r-proposals'), await box('#r-goals')];
    assert.ok(proposals.x >= thread.x + thread.width, 'proposals sit beside the thread');
    assert.ok(Math.abs(goals.x - proposals.x) < 1 && Math.abs(reviews.x - thread.x) < 1, 'two columns');
    assert.ok(reviews.y > thread.y && goals.y > proposals.y);
    await fits(page, 'the desk Coach page');
    await shot(page, 'desk-coach');

    await page.fill('#coach-text', 'Half a thought');
    await page.click('[data-goal-new]');
    await page.fill('#g-title', 'Half a goal');
    await page.setViewportSize({ width: 800, height: 900 });
    await page.waitForFunction(() => !document.querySelector('.coach-cols'));
    assert.equal(await page.inputValue('#coach-text'), 'Half a thought');
    assert.equal(await page.inputValue('#g-title'), 'Half a goal');
    // One column, in the phone's order: what needs him first.
    const order = await page.$$eval('#view > *', els => els.map(e => e.id || e.className.split(' ').pop()));
    assert.deepEqual(order, ['r-head', 'r-proposals', 'coach-thread', 'r-goals', 'r-notes', 'r-reviews', 'r-changes']);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForSelector('.coach-cols .coach-thread');
    assert.equal(await page.inputValue('#g-title'), 'Half a goal');
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}
