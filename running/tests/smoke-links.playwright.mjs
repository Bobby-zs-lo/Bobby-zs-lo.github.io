// The smoke test's steps for choosing which recorded sessions count for a workout: the editor on
// the session page (js/views/workout-links.js, PUT /api/workouts/:id/links) and the ways into it.
// Not run on its own: smoke.playwright.mjs owns the browser, the static server and the mock API,
// and calls linkSteps() with its helpers, so `node running/tests/smoke.playwright.mjs` still runs
// everything. Invented fixtures only, as there.
//
// A step that stands in front of the mock with page.route() never takes its handler away again
// (no page.unroute): Playwright lets a request that is in flight when its handler is removed out
// to the network, which here is the live API. A handler that is done steps aside with
// route.fallback() instead, and the mock answers.
import assert from 'node:assert/strict';
import { join } from 'node:path';

const RUN = 'w-2026-10-13-run', CORE = 'w-2026-10-13-strength', LONG_RUN = 'w-2026-10-17-run';
const NOTHING_RECORDED = 'w-2026-10-20-run', REST_DAY = 'w-2026-10-15-rest';
const MORNING = '15800000002', WARM_UP = '15800000004';
const EDITOR = '[data-link-form]';
const SAVE = `${EDITOR} button[type=submit]`;
const OPENER = '[data-link-open]';
const HEALTH_RUN = 'Health Connect Run 7.2 km · 47 min · 08:10';
const REFUSAL = "A Strava activity in the list isn't from 2026-10-13"; // the backend's words for an id of another day

const box = id => `input[name=session][value="activity:${id}"]`;
const oneLine = els => els.map(e => e.textContent.trim().replace(/\s+/g, ' '));
const hash = page => page.evaluate(() => location.hash);
const names = page => page.$$eval('.actual-rows .activity-name', oneLine);
const ticks = async page => [await page.isChecked(box(WARM_UP)), await page.isChecked(box(MORNING))];
const editorOpen = page => page.waitForSelector(`${EDITOR}:not([hidden])`);
const focusInEditor = page => page.waitForFunction(() => document.activeElement && document.activeElement.name === 'session');
// A save redraws the page in place and hands focus back to the button that opened the editor.
const saved = page => page.waitForFunction(() => document.activeElement.matches('[data-link-open]') && document.querySelector('[data-link-form]').hidden);
const puts = log => log.filter(l => l.method === 'PUT');

export async function linkSteps({ step, newPage, go, overflow, APP, SHOTS }) {
  const fits = async (page, what) => {
    const o = await overflow(page);
    assert.ok(o.scrollW <= o.W && o.bad.length === 0, `${what} overflows: ${JSON.stringify(o)}`);
  };
  const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });

  await step('phone (390 px): choose which recorded session counts for a workout; the status and Today follow', async () => {
    const { ctx, page, log, errors } = await newPage();
    await go(page, `workout/${RUN}`);
    assert.deepEqual(await names(page), ['Morning Run'], 'the fixture matched the session, not the warm-up before it');
    assert.match(await page.textContent('.kv .chip'), /Done/);

    // Change: every session of the day, the matched one ticked, the Health Connect copy of it not tickable.
    await page.click(OPENER);
    await editorOpen(page);
    assert.equal(await page.locator('input[name=session]').count(), 4);
    assert.deepEqual(await ticks(page), [false, true]);
    assert.match(await page.textContent('.link-opt:has(input:disabled)'), /Health Connect[\s\S]*Same as the Strava activity/);
    assert.equal(await page.evaluate(() => document.activeElement.name), 'session', 'focus moved into the editor');
    await page.locator('[data-actual]').scrollIntoViewIfNeeded();
    await fits(page, 'the link editor');
    await shot(page, 'phone-links-editor');

    await page.uncheck(box(MORNING));
    await page.check(box(WARM_UP));
    await page.click(SAVE);
    await page.waitForSelector('.toast--ok');
    assert.match(await page.textContent('.toast--ok'), /Sessions updated/);
    const [put] = puts(log);
    assert.equal(put.path, `/api/workouts/${RUN}/links`);
    assert.deepEqual(put.body, { activityIds: [WARM_UP], healthIds: [] }, 'the copy still carries a link in the fixture, and is left out');
    // The page redraws in place: the warm-up is what was done, 1.2 km of 5 is Partial, focus is back on Change.
    await saved(page);
    assert.deepEqual(await names(page), ['Warm-up jog']);
    assert.match(await page.textContent('[data-actual] .help'), /3\.8 km short of the plan\./);
    assert.match(await page.textContent('.kv .chip'), /Partial/);
    await fits(page, 'the session page');
    await shot(page, 'phone-links-saved');

    // Today shows the same: the warm-up on the card with a way to change it, the run under "Also today".
    await page.goto(`${APP}#/today`);
    await page.waitForSelector('.workout-title');
    const card = page.locator('.workout', { hasText: 'Easy run' });
    assert.match(await card.locator('.chip').textContent(), /Partial/);
    assert.deepEqual(await card.locator('.matched .activity-name').allTextContents(), ['Warm-up jog']);
    assert.equal(await card.locator('.matched-head a').getAttribute('href'), `#/workout/${RUN}?link=1`);
    assert.match(await page.locator('.card', { hasText: 'Also today' }).textContent(), /Morning Run[\s\S]*Commute to Rigshospitalet/);
    await fits(page, 'Today');
    await shot(page, 'phone-links-today');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await step('phone (390 px): ?link=1 opens the editor; Escape and Cancel put the ticks back; a refused save says why and keeps them', async () => {
    const { ctx, page, log, errors } = await newPage();
    await go(page, `workout/${RUN}?link=1`);
    await editorOpen(page);
    await focusInEditor(page); // taken back from the app shell, which focuses the view after a render
    assert.equal(await hash(page), `#/workout/${RUN}?link=1`, 'the address asks for the editor while it is open');
    assert.equal(await page.isVisible('[data-actual-view]'), false, 'the linked rows give way to the editor');

    // Escape: closed, focus on Change, and the address no longer asks, so a reload opens nothing.
    await page.check(box(WARM_UP));
    await page.keyboard.press('Escape');
    assert.equal(await page.isVisible(EDITOR), false);
    assert.equal(await page.evaluate(() => document.activeElement.matches('[data-link-open]')), true);
    assert.equal(await hash(page), `#/workout/${RUN}`);
    await page.reload();
    await page.waitForSelector('[data-actual]');
    assert.equal(await page.isVisible(EDITOR), false);
    await page.click(OPENER);
    await editorOpen(page);
    assert.deepEqual(await ticks(page), [false, true], 'Escape put the ticks back');
    // Cancel does the same.
    await page.check(box(WARM_UP));
    await page.uncheck(box(MORNING));
    await page.click('[data-link-cancel]');
    assert.equal(await page.isVisible(EDITOR), false);
    await page.click(OPENER);
    await editorOpen(page);
    assert.deepEqual(await ticks(page), [false, true], 'Cancel put the ticks back');

    // The server refuses: its words are shown and focused, the editor stays open with the ticks, nothing is toasted.
    let refusing = true;
    await page.route(url => url.pathname.endsWith('/links'), route => (refusing && route.request().method() === 'PUT'
      ? route.fulfill({ status: 400, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: JSON.stringify({ error: REFUSAL }) })
      : route.fallback()));
    await page.check(box(WARM_UP));
    await page.click(SAVE);
    await page.waitForFunction(() => document.activeElement.matches('[data-link-error]'));
    assert.equal(await page.textContent('[data-link-error]'), REFUSAL);
    assert.equal(await page.getAttribute('[data-link-error]', 'role'), 'alert');
    assert.equal(await page.isVisible(EDITOR), true);
    assert.deepEqual(await ticks(page), [true, true], 'the ticks are kept');
    assert.deepEqual([await page.isEnabled(SAVE), await page.textContent(SAVE), await page.isEnabled('[data-link-cancel]')], [true, 'Save', true]);
    assert.equal(await page.locator('.toast').count(), 0);
    assert.deepEqual(puts(log), [], 'the refusal was this test’s; the mock saw nothing');
    await page.locator('[data-link-error]').scrollIntoViewIfNeeded();
    await fits(page, 'the refused save');
    await shot(page, 'phone-links-refused');
    // The same save, let through to the mock, goes in: both runs count together.
    refusing = false;
    await page.click(SAVE);
    await saved(page);
    assert.deepEqual(puts(log).map(l => l.body), [{ activityIds: [WARM_UP, MORNING], healthIds: [] }]);
    assert.deepEqual(await names(page), ['Warm-up jog', 'Morning Run']);
    assert.match(await page.textContent('[data-actual] .help'), /6\.4 km together\. 1\.4 km more than planned\./);

    // ?link=1 where there is nothing to choose (no session recorded; a rest day): no card, and the address drops it.
    for (const id of [NOTHING_RECORDED, REST_DAY]) {
      await page.goto(`${APP}#/workout/${id}?link=1`);
      await page.waitForFunction(h => location.hash === h, `#/workout/${id}`);
      assert.equal(await page.locator('[data-actual]').count(), 0, id);
    }
    // … and it is dropped when a status is marked while the editor is open: the redraw has no editor.
    await page.goto(`${APP}#/workout/${RUN}?link=1`);
    await editorOpen(page);
    await page.click('#workout-actions [data-action=undo_status]');
    await page.waitForFunction(h => location.hash === h && document.querySelector('[data-link-form]') && document.querySelector('[data-link-form]').hidden, `#/workout/${RUN}`);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await step('phone (390 px): a Health Connect session alone can count; Today and the Activity page lead to the editor', async () => {
    const { ctx, page, log, errors } = await newPage();
    // Saturday: one Health Connect run, nothing on Strava, nothing linked.
    await go(page, `workout/${LONG_RUN}`);
    assert.match(await page.textContent('[data-actual]'), /Nothing linked to this session yet\./);
    assert.equal(await page.textContent(OPENER), 'Link a recorded session');
    await page.click(OPENER);
    await editorOpen(page);
    assert.deepEqual(await page.$$eval('.link-opt', oneLine), [HEALTH_RUN]);
    await page.check('input[name=session]');
    await page.click(SAVE);
    await saved(page);
    const [put] = puts(log);
    assert.equal(put.path, `/api/workouts/${LONG_RUN}/links`);
    assert.deepEqual(put.body.activityIds, []);
    assert.equal(put.body.healthIds.length, 1);
    assert.match(put.body.healthIds[0], /^[0-9a-f]{64}$/);
    assert.deepEqual(await page.$$eval('.actual-rows .activity', oneLine), [HEALTH_RUN]);
    assert.match(await page.textContent('[data-actual] .help'), /0\.2 km more than planned\./);
    assert.match(await page.textContent('.kv .chip'), /Done/);
    await page.locator('[data-actual]').scrollIntoViewIfNeeded();
    await fits(page, 'the Health Connect row');
    await shot(page, 'phone-links-health');
    // The week lists it under its day, as Today would.
    await page.goto(`${APP}#/week`);
    await page.waitForSelector('.day');
    assert.deepEqual(await page.locator('.day', { hasText: 'Long run' }).locator('.activity--health').evaluateAll(oneLine), [HEALTH_RUN]);
    await fits(page, 'the week');

    // Today: Change on the card opens the editor of that session.
    await page.goto(`${APP}#/today`);
    await page.waitForSelector('.workout-title');
    await page.locator('.workout', { hasText: 'Easy run' }).locator('.matched-head a').click();
    await editorOpen(page);
    await focusInEditor(page);
    assert.equal(await hash(page), `#/workout/${RUN}?link=1`);
    assert.deepEqual(await ticks(page), [false, true]);
    // Activity, matched: Change beside the session it counts for.
    await page.goto(`${APP}#/activity/${MORNING}`);
    await page.click('.act-match .section-head a');
    await editorOpen(page);
    assert.equal(await hash(page), `#/workout/${RUN}?link=1`);
    // Activity, not matched: one offer for each session planned that day, rest days aside.
    await page.goto(`${APP}#/activity/${WARM_UP}`);
    await page.waitForSelector('[data-link-offers] a');
    assert.deepEqual(await page.$$eval('[data-link-offers] a', els => els.map(a => [a.textContent, a.getAttribute('href')])), [
      ['Link it to Easy run →', `#/workout/${RUN}?link=1`], ['Link it to Core & mobility →', `#/workout/${CORE}?link=1`],
    ]);
    await page.locator('.act-match').scrollIntoViewIfNeeded();
    await fits(page, 'the activity page');
    await shot(page, 'phone-links-activity');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await step('desk (1440 px): an activity page does not wait for the plan; its offer opens the editor, worked from the keyboard', async () => {
    const { ctx, page, log, errors } = await newPage({ desk: true });
    // Hold the plan back: the handler waits, then steps aside for the mock (and is never removed;
    // see the top). The page must stand without the plan, and take the offer when it comes.
    const isPlan = url => url.pathname.endsWith('/api/plan');
    let release;
    const released = new Promise(resolve => { release = resolve; });
    await page.route(isPlan, async route => {
      if (route.request().method() === 'GET') await released;
      return route.fallback();
    });
    const asked = page.waitForRequest(r => r.method() === 'GET' && isPlan(new URL(r.url())));
    await go(page, `activity/${WARM_UP}`);
    assert.match(await page.textContent('.act-match'), /Not matched to a planned session/);
    await asked;
    assert.equal(await page.locator('[data-link-offers] a').count(), 0, 'no offer before the plan is here');
    release();
    await page.waitForSelector('[data-link-offers] a');

    await page.click('[data-link-offers] a');
    await editorOpen(page);
    await focusInEditor(page);
    assert.equal(await hash(page), `#/workout/${RUN}?link=1`);
    // Desk: the card sits in the reading column, right of the rail.
    assert.equal(await page.getAttribute('html', 'data-layout'), 'desk');
    const rail = await page.locator('nav.tabs').boundingBox();
    const card = await page.locator('[data-actual]').boundingBox();
    assert.ok(rail.x + rail.width <= card.x && card.width <= 760, `the editor in the reading column: ${JSON.stringify({ rail, card })}`);
    await fits(page, 'the link editor (desk)');
    await shot(page, 'desk-links-editor');
    // Focus is on the first box, the warm-up: Space ticks it, Enter saves the form.
    assert.equal(await page.evaluate(() => document.activeElement.value), `activity:${WARM_UP}`);
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await saved(page);
    assert.deepEqual(puts(log).map(l => l.body), [{ activityIds: [WARM_UP, MORNING], healthIds: [] }]);
    assert.deepEqual(await names(page), ['Warm-up jog', 'Morning Run']);
    assert.equal(await hash(page), `#/workout/${RUN}`);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}
