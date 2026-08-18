# Legegruppe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Danish-language web app at `bobbylo.dk/legegruppe` that collects parents' real capacity constraints via a questionnaire and generates playgroup compositions plus a host rota by week number.

**Architecture:** Static frontend in the existing GitHub Pages site repo, following the repo's zero-build convention (plain `<script>` tags, UMD-wrapped pure-logic modules, `node tests/*.test.mjs` for tests). All matching logic is pure functions with no DOM and no network, so both solvers run in the browser and in Node tests. Persistence is a Google Apps Script Web App writing to a private Google Sheet, mirroring the existing receipts app.

**Tech Stack:** Vanilla ES2020 JavaScript (no bundler, no npm, no framework), CSS custom properties inherited from the site's `style.css`, Node's built-in test assertions (`node:assert/strict`), Google Apps Script backend.

**Spec:** `docs/superpowers/specs/2026-08-17-legegruppe-design.md`

**Deviation from spec, agreed 2026-08-17:** the exact solver (B) is implemented as branch-and-bound with bitmask memoisation in pure JavaScript rather than GLPK-wasm. Reason: the repo has no build step, no npm and no bundler, and a vendored wasm blob would break that convention. The formulation is unchanged (set partitioning) and the result is still provably optimal for the given weights.

**Spec refinement, decided during planning:** soft objective S3 in the spec ("byrdespredning") splits into two enforcement points. Group formation scores *capacity adequacy* (does this group's combined declared host capacity cover the number of meetings?), because the exact solver requires per-group decomposable costs. Actual burden *spread* — never exceeding a family's declared capacity, and rotating evenly — is enforced as a hard rule inside `rota.js`. Together these deliver what the spec asked for.

---

## Working conventions

**Every JS file under `legegruppe/js/` that contains pure logic uses this wrapper**, matching `race/js/logic.js`:

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LG = Object.assign(root.LG || {}, { ModuleName: factory() });
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // ...
  return { /* exports */ };
});
```

In the browser everything hangs off a single global `LG`. In Node, `require('../js/model.js')` returns the module's exports directly.

**Every test file** is run with plain Node, no test runner:

```bash
node legegruppe/tests/model.test.mjs
```

A test file prints nothing on success and throws on failure. Add a final `console.log('ok - <name>')` line so a passing run is visible.

**Danish is the user-facing language.** All UI strings, all error messages shown to parents or admin. Code identifiers, comments and commit messages are English.

**Commit after every task.** Conventional commits: `feat:`, `test:`, `fix:`, `docs:`, `style:`.

---

## File structure

| Path | Responsibility |
|---|---|
| `legegruppe/js/model.js` | Data types, normalisation of raw questionnaire answers into derived fields, pair keys, seeded RNG |
| `legegruppe/js/constraints.js` | Hard requirements H1–H5, per-group feasibility, and an independent whole-solution verifier |
| `legegruppe/js/scoring.js` | Soft objectives S1–S5, weights, per-group and whole-solution scoring |
| `legegruppe/js/solvers/heuristic.js` | Solver A: greedy construction + simulated annealing |
| `legegruppe/js/solvers/exact.js` | Solver B: branch-and-bound set partitioning with bitmask memoisation |
| `legegruppe/js/solvers/rota.js` | Host/fetcher rotation across week numbers; shared by both solvers |
| `legegruppe/js/solvers/infeasibility.js` | Finds the minimal set of relaxations that would make an infeasible problem solvable |
| `legegruppe/js/solvers/index.js` | The `solve()` contract, solver selection, wiring of grouping + rota |
| `legegruppe/js/api.js` | Apps Script client: fetch, submit, retry, local draft queue |
| `legegruppe/js/ui/form.js` | Parent questionnaire behaviour |
| `legegruppe/js/ui/plan.js` | Published plan rendering |
| `legegruppe/js/ui/admin.js` | Admin console behaviour |
| `legegruppe/css/legegruppe.css` | Components, built on the site's existing tokens |
| `legegruppe/index.html` | Parent questionnaire page |
| `legegruppe/plan/index.html` | Published plan page |
| `legegruppe/admin/index.html` | Admin page |
| `legegruppe/apps-script/Code.gs` | Backend source, kept in the repo for version control |
| `legegruppe/SETUP.md` | Step-by-step backend setup, in the style of `Apps-Script-Setup.md` |
| `legegruppe/tests/*.test.mjs` | Unit and property tests |
| `legegruppe/tests/generate.mjs` | Synthetic class generator, including adversarial profiles |
| `legegruppe/tests/simulate.mjs` | The 1000-simulation acceptance run and its report |

---

## Task 1: Domain model and normalisation

**Files:**
- Create: `legegruppe/js/model.js`
- Test: `legegruppe/tests/model.test.mjs`

The questionnaire stores raw answers. Everything downstream needs derived, validated fields. This module is the single place that translates between the two, so no other module ever parses a raw answer.

- [ ] **Step 1: Write the failing test**

Create `legegruppe/tests/model.test.mjs`:

```js
/* Run: node legegruppe/tests/model.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../js/model.js');

// --- pairKey: order-independent, stable ---
assert.equal(M.pairKey('b', 'a'), 'a|b');
assert.equal(M.pairKey('a', 'b'), 'a|b');

// --- normaliseFamily: fills every derived field ---
const raw = {
  familyId: 'f1', classId: 'c1', parentName: 'Anne', contact: 'anne@example.dk',
  hostCapacity: '2', maxChildrenAtHome: '4', availableWeekdays: ['2', '4'],
  fetchCapacity: '3', meetingPlace: 'home', blackoutWeeks: '42, 43',
  note: 'Vi har hund', consentAt: '2026-08-01T10:00:00Z'
};
const f = M.normaliseFamily(raw);
assert.equal(f.hostCapacity, 2);
assert.equal(f.maxChildrenAtHome, 4);
assert.deepEqual(f.availableWeekdays, [2, 4]);
assert.equal(f.fetchCapacity, 3);
assert.equal(f.canHostOutdoor, false);
assert.equal(f.requiresChildrenBrought, false);
assert.deepEqual(f.blackoutWeeks, [42, 43]);

// --- meetingPlace variants ---
assert.equal(M.normaliseFamily({ ...raw, meetingPlace: 'outdoor' }).canHostOutdoor, true);
assert.equal(M.normaliseFamily({ ...raw, meetingPlace: 'both' }).canHostOutdoor, true);

// --- fetchCapacity 0 means children must be brought to us ---
assert.equal(M.normaliseFamily({ ...raw, fetchCapacity: '0' }).requiresChildrenBrought, true);

// --- missing / hostile input never throws, always yields a safe family ---
const empty = M.normaliseFamily({ familyId: 'f9', classId: 'c1' });
assert.equal(empty.hostCapacity, 0);
assert.equal(empty.maxChildrenAtHome, 0);
assert.deepEqual(empty.availableWeekdays, []);
assert.equal(empty.fetchCapacity, 0);
assert.equal(empty.hasResponded, false);
assert.equal(f.hasResponded, true);

// --- values are clamped, not trusted ---
const wild = M.normaliseFamily({ ...raw, hostCapacity: '99', maxChildrenAtHome: '-4',
  fetchCapacity: '12', availableWeekdays: ['0', '9', '3'] });
assert.equal(wild.hostCapacity, 3);
assert.equal(wild.maxChildrenAtHome, 0);
assert.equal(wild.fetchCapacity, 5);
assert.deepEqual(wild.availableWeekdays, [3]);

// --- buildProblem indexes families, children and history for fast lookup ---
const problem = M.buildProblem({
  classId: 'c1',
  children: [
    { childId: 'k1', familyId: 'f1', name: 'Alma' },
    { childId: 'k2', familyId: 'f2', name: 'Bo' }
  ],
  families: [raw, { familyId: 'f2', classId: 'c1', parentName: 'Bent', hostCapacity: '1',
    maxChildrenAtHome: '5', availableWeekdays: ['2'], fetchCapacity: '4' }],
  blockedPairs: [['k2', 'k1']],
  history: [{ childA: 'k1', childB: 'k2' }],
  groupSizeMin: 4, groupSizeMax: 5, weeks: [34, 35], meetingsPerGroup: 2
});
assert.equal(problem.familyOf('k1').parentName, 'Anne');
assert.equal(problem.isBlocked('k1', 'k2'), true);
assert.equal(problem.timesTogether('k1', 'k2'), 1);
assert.equal(problem.timesTogether('k1', 'nobody'), 0);
assert.equal(problem.children.length, 2);

// --- seeded RNG is deterministic and in range ---
const r1 = M.rng(42), r2 = M.rng(42);
const a = [r1(), r1(), r1()], b = [r2(), r2(), r2()];
assert.deepEqual(a, b);
assert.ok(a.every(v => v >= 0 && v < 1));
assert.notDeepEqual(a, [M.rng(43)(), M.rng(43)(), M.rng(43)()]);

console.log('ok - model');
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node legegruppe/tests/model.test.mjs
```

Expected: fails with `Cannot find module '../js/model.js'`.

- [ ] **Step 3: Write the implementation**

Create `legegruppe/js/model.js`:

```js
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node legegruppe/tests/model.test.mjs
```

Expected: `ok - model`

- [ ] **Step 5: Commit**

```bash
git add legegruppe/js/model.js legegruppe/tests/model.test.mjs
git commit -m "feat: legegruppe domain model and answer normalisation"
```

---

## Task 2: Hard requirements and the independent verifier

**Files:**
- Create: `legegruppe/js/constraints.js`
- Test: `legegruppe/tests/constraints.test.mjs`

Two things live here, and they must not share code. `groupFeasibility()` is what the solvers call to decide whether a candidate group is legal. `verifySolution()` is an independent audit that re-derives every violation from scratch, so a bug in the solver's own feasibility logic cannot hide behind itself. Every test in this repo runs solver output through the verifier, and the admin UI blocks publishing if it reports anything.

- [ ] **Step 1: Write the failing test**

Create `legegruppe/tests/constraints.test.mjs`:

```js
/* Run: node legegruppe/tests/constraints.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../js/model.js');
const C = require('../js/constraints.js');

/** One family per child, with overridable capacity fields. */
function makeProblem(specs, extra) {
  const children = specs.map((s, i) => ({ childId: 'k' + i, familyId: 'f' + i, name: 'B' + i }));
  const families = specs.map((s, i) => Object.assign({
    familyId: 'f' + i, classId: 'c1', parentName: 'P' + i, consentAt: '2026-08-01',
    hostCapacity: 2, maxChildrenAtHome: 5, availableWeekdays: [1, 2, 3, 4, 5], fetchCapacity: 4
  }, s));
  return M.buildProblem(Object.assign({
    classId: 'c1', children, families, groupSizeMin: 4, groupSizeMax: 5,
    weeks: [34, 35, 36, 37, 38, 39], meetingsPerGroup: 6
  }, extra || {}));
}

const ok4 = makeProblem([{}, {}, {}, {}]);
const all = ['k0', 'k1', 'k2', 'k3'];

// --- a well-resourced group of 4 passes everything ---
assert.deepEqual(C.groupFeasibility(all, ok4).violations, []);
assert.equal(C.groupFeasibility(all, ok4).ok, true);

// --- H1: blocked pairs ---
const blocked = makeProblem([{}, {}, {}, {}], { blockedPairs: [['k0', 'k2']] });
const h1 = C.groupFeasibility(all, blocked);
assert.equal(h1.ok, false);
assert.ok(h1.violations.some(v => v.code === 'H1'));

// --- H2: group size ---
assert.ok(C.groupFeasibility(['k0', 'k1', 'k2'], ok4).violations.some(v => v.code === 'H2'));
assert.ok(C.groupFeasibility(all, ok4).violations.every(v => v.code !== 'H2'));

// --- H3: somebody must be able to host, at home or outdoors ---
const noHost = makeProblem([
  { hostCapacity: 0 }, { hostCapacity: 0 }, { hostCapacity: 0 }, { hostCapacity: 0 }
]);
assert.ok(C.groupFeasibility(all, noHost).violations.some(v => v.code === 'H3'));

// a home too small for 3 guests does not count as a host …
const tooSmall = makeProblem([
  { maxChildrenAtHome: 2 }, { maxChildrenAtHome: 2 },
  { maxChildrenAtHome: 2 }, { maxChildrenAtHome: 2 }
]);
assert.ok(C.groupFeasibility(all, tooSmall).violations.some(v => v.code === 'H3'));

// … but the outdoor option rescues exactly that family
const outdoor = makeProblem([
  { maxChildrenAtHome: 2, meetingPlace: 'outdoor' }, { maxChildrenAtHome: 2 },
  { maxChildrenAtHome: 2 }, { maxChildrenAtHome: 2 }
]);
assert.ok(C.groupFeasibility(all, outdoor).violations.every(v => v.code !== 'H3'));

// --- H4: at least one weekday shared by a host and the fetchers ---
const noDay = makeProblem([
  { availableWeekdays: [1] }, { availableWeekdays: [2] },
  { availableWeekdays: [3] }, { availableWeekdays: [4] }
]);
assert.ok(C.groupFeasibility(all, noDay).violations.some(v => v.code === 'H4'));

// --- H5: fetch capacity must cover the children who need transport ---
const noFetch = makeProblem([
  { fetchCapacity: 0 }, { fetchCapacity: 0 }, { fetchCapacity: 0 }, { fetchCapacity: 0 }
]);
assert.ok(C.groupFeasibility(all, noFetch).violations.some(v => v.code === 'H5'));

// one strong fetcher covers the other three
const oneFetcher = makeProblem([
  { fetchCapacity: 4 }, { fetchCapacity: 0 }, { fetchCapacity: 0 }, { fetchCapacity: 0 }
]);
assert.ok(C.groupFeasibility(all, oneFetcher).violations.every(v => v.code !== 'H5'));

// --- every violation carries Danish, human-readable text ---
h1.violations.forEach(v => {
  assert.equal(typeof v.message, 'string');
  assert.ok(v.message.length > 10);
});

// --- verifySolution: independent audit of a whole solution ---
const six = makeProblem(new Array(8).fill({}));
const good = { groups: [
  { id: 'A', childIds: ['k0', 'k1', 'k2', 'k3'] },
  { id: 'B', childIds: ['k4', 'k5', 'k6', 'k7'] }
] };
assert.deepEqual(C.verifySolution(good, six), []);

// a child appearing twice is caught
const dup = { groups: [
  { id: 'A', childIds: ['k0', 'k1', 'k2', 'k3'] },
  { id: 'B', childIds: ['k0', 'k5', 'k6', 'k7'] }
] };
assert.ok(C.verifySolution(dup, six).some(v => v.code === 'COVER'));

// a child left out entirely is caught
const missing = { groups: [{ id: 'A', childIds: ['k0', 'k1', 'k2', 'k3'] }] };
assert.ok(C.verifySolution(missing, six).some(v => v.code === 'COVER'));

console.log('ok - constraints');
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node legegruppe/tests/constraints.test.mjs
```

Expected: fails with `Cannot find module '../js/constraints.js'`.

- [ ] **Step 3: Write the implementation**

Create `legegruppe/js/constraints.js`:

```js
/* Hard requirements H1–H5 plus an independent whole-solution verifier.
   Browser: window.LG.Constraints   Node: require('./constraints.js') */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LG = Object.assign(root.LG || {}, { Constraints: factory() });
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const v = (code, message) => ({ code, message });

  /** Families of the children in a group, in the same order. */
  function familiesOf(childIds, problem) {
    return childIds.map(id => problem.familyOf(id)).filter(Boolean);
  }

  /** Can this family host a group of `size` — at home, or outdoors? */
  function canHost(family, size) {
    if (family.hostCapacity <= 0) return false;
    if (family.canHostOutdoor) return true;
    return family.maxChildrenAtHome >= size - 1; // own child is already home
  }

  /** Weekdays on which `family` is available, as a Set. */
  function daysOf(family) {
    return new Set(family.availableWeekdays);
  }

  /**
   * Is there a weekday on which some host can host AND the remaining children
   * can be fetched by families available that same day? Returns the viable days.
   */
  function viableDays(childIds, problem) {
    const fams = familiesOf(childIds, problem);
    const size = childIds.length;
    const days = [];
    for (let d = 1; d <= 5; d++) {
      const availableThatDay = fams.filter(f => daysOf(f).has(d));
      const hosts = availableThatDay.filter(f => canHost(f, size));
      if (hosts.length === 0) continue;
      // The host covers its own child. Everyone else needs transport unless
      // their own family fetches them.
      const fetchSupply = availableThatDay.reduce((sum, f) => sum + f.fetchCapacity, 0);
      if (fetchSupply >= size - 1) days.push(d);
    }
    return days;
  }

  /** Check one candidate group against H1–H5. Pure; no side effects. */
  function groupFeasibility(childIds, problem) {
    const violations = [];
    const size = childIds.length;

    // H2 — size
    if (size < problem.groupSizeMin || size > problem.groupSizeMax) {
      violations.push(v('H2', 'Gruppen har ' + size + ' børn. Den skal have mellem ' +
        problem.groupSizeMin + ' og ' + problem.groupSizeMax + '.'));
    }

    // H1 — blocked pairs
    for (let i = 0; i < childIds.length; i++) {
      for (let j = i + 1; j < childIds.length; j++) {
        if (problem.isBlocked(childIds[i], childIds[j])) {
          const a = (problem.childById.get(childIds[i]) || {}).name || childIds[i];
          const b = (problem.childById.get(childIds[j]) || {}).name || childIds[j];
          violations.push(v('H1', a + ' og ' + b + ' må ikke være i samme gruppe.'));
        }
      }
    }

    const fams = familiesOf(childIds, problem);

    // H3 — at least one possible host
    const hosts = fams.filter(f => canHost(f, size));
    if (hosts.length === 0) {
      violations.push(v('H3', 'Ingen familie i gruppen kan afholde et møde — hverken hjemme eller ude.'));
    }

    // H5 — enough fetch capacity in the group at all
    const totalFetch = fams.reduce((sum, f) => sum + f.fetchCapacity, 0);
    if (totalFetch < size - 1) {
      violations.push(v('H5', 'Gruppen kan tilsammen hente ' + totalFetch + ' børn, men der skal hentes ' +
        (size - 1) + '.'));
    }

    // H4 — a weekday that works for a host and the fetchers at the same time
    const days = viableDays(childIds, problem);
    if (days.length === 0 && hosts.length > 0 && totalFetch >= size - 1) {
      violations.push(v('H4', 'Der er ingen hverdag hvor både en vært og nok hentere kan.'));
    }

    return { ok: violations.length === 0, violations, viableDays: days, possibleHosts: hosts.length };
  }

  /**
   * Independent audit of a complete solution. Deliberately re-derives everything
   * rather than trusting the solver, and additionally checks that every child is
   * covered exactly once.
   */
  function verifySolution(solution, problem) {
    const violations = [];
    const seen = new Map();

    (solution.groups || []).forEach(g => {
      (g.childIds || []).forEach(id => seen.set(id, (seen.get(id) || 0) + 1));
      groupFeasibility(g.childIds || [], problem).violations.forEach(x => {
        violations.push({ code: x.code, groupId: g.id, message: x.message });
      });
    });

    problem.children.forEach(c => {
      const n = seen.get(c.childId) || 0;
      if (n !== 1) {
        violations.push({
          code: 'COVER', groupId: null,
          message: (c.name || c.childId) + ' optræder i ' + n + ' grupper. Hvert barn skal være i præcis én.'
        });
      }
    });

    seen.forEach((_, id) => {
      if (!problem.childById.has(id)) {
        violations.push({ code: 'COVER', groupId: null, message: 'Ukendt barn i løsningen: ' + id });
      }
    });

    return violations;
  }

  return { groupFeasibility, verifySolution, canHost, viableDays };
});
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node legegruppe/tests/constraints.test.mjs
```

Expected: `ok - constraints`

- [ ] **Step 5: Commit**

```bash
git add legegruppe/js/constraints.js legegruppe/tests/constraints.test.mjs
git commit -m "feat: legegruppe hard constraints and independent verifier"
```

---

## Task 3: Soft objectives and scoring

**Files:**
- Create: `legegruppe/js/scoring.js`
- Test: `legegruppe/tests/scoring.test.mjs`

Every objective returns a number in `[0, 1]` where `1` is best, and every objective is computed **per group** from that group alone. That last property is not cosmetic — the exact solver in Task 5 depends on it. If a future objective needs to compare groups against each other, it cannot live here; it has to become a hard rule or move into the rota.

- [ ] **Step 1: Write the failing test**

Create `legegruppe/tests/scoring.test.mjs`:

```js
/* Run: node legegruppe/tests/scoring.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../js/model.js');
const S = require('../js/scoring.js');

function makeProblem(specs, extra) {
  const children = specs.map((s, i) => ({ childId: 'k' + i, familyId: 'f' + i, name: 'B' + i }));
  const families = specs.map((s, i) => Object.assign({
    familyId: 'f' + i, classId: 'c1', parentName: 'P' + i, consentAt: '2026-08-01',
    hostCapacity: 2, maxChildrenAtHome: 5, availableWeekdays: [1, 2, 3, 4, 5], fetchCapacity: 4
  }, s));
  return M.buildProblem(Object.assign({
    classId: 'c1', children, families, groupSizeMin: 4, groupSizeMax: 5,
    weeks: [34, 35, 36, 37, 38, 39], meetingsPerGroup: 6
  }, extra || {}));
}

const g = ['k0', 'k1', 'k2', 'k3'];

// --- S1 novelty: no shared history scores 1, all-shared scores 0 ---
const fresh = makeProblem(new Array(4).fill({}));
assert.equal(S.novelty(g, fresh), 1);

const allSeen = makeProblem(new Array(4).fill({}), {
  history: [
    { childA: 'k0', childB: 'k1' }, { childA: 'k0', childB: 'k2' }, { childA: 'k0', childB: 'k3' },
    { childA: 'k1', childB: 'k2' }, { childA: 'k1', childB: 'k3' }, { childA: 'k2', childB: 'k3' }
  ]
});
assert.ok(S.novelty(g, allSeen) < 0.4);

const someSeen = makeProblem(new Array(4).fill({}), {
  history: [{ childA: 'k0', childB: 'k1' }, { childA: 'k2', childB: 'k3' }]
});
const partial = S.novelty(g, someSeen);
assert.ok(partial > 0 && partial < 1, 'partial novelty should be strictly between 0 and 1');

// repeat encounters hurt more than a single one
const twice = makeProblem(new Array(4).fill({}), {
  history: [{ childA: 'k0', childB: 'k1' }, { childA: 'k0', childB: 'k1' }]
});
const once = makeProblem(new Array(4).fill({}), { history: [{ childA: 'k0', childB: 'k1' }] });
assert.ok(S.novelty(g, twice) < S.novelty(g, once));

// --- S2 robustness: more possible hosts and more shared days is better ---
const fragile = makeProblem([
  { hostCapacity: 1, availableWeekdays: [2] }, { hostCapacity: 0, availableWeekdays: [2] },
  { hostCapacity: 0, availableWeekdays: [2] }, { hostCapacity: 0, availableWeekdays: [2] }
]);
assert.ok(S.robustness(g, fragile) < S.robustness(g, fresh));
assert.ok(S.robustness(g, fresh) <= 1 && S.robustness(g, fragile) >= 0);

// --- S3 capacity adequacy: total declared host capacity vs meetings needed ---
const plenty = makeProblem(new Array(4).fill({ hostCapacity: 3 }));   // 12 >= 6
const scarce = makeProblem([{ hostCapacity: 1 }, { hostCapacity: 0 },
  { hostCapacity: 0 }, { hostCapacity: 0 }]);                          // 1 < 6
assert.equal(S.capacityAdequacy(g, plenty), 1);
assert.ok(S.capacityAdequacy(g, scarce) < 0.3);

// --- S4 weekday breadth ---
const oneDay = makeProblem(new Array(4).fill({ availableWeekdays: [3] }));
assert.ok(S.weekdayBreadth(g, oneDay) < S.weekdayBreadth(g, fresh));

// --- S5 capacity balance: closer to the class average is better ---
const mixed = makeProblem([
  { hostCapacity: 3 }, { hostCapacity: 3 }, { hostCapacity: 3 }, { hostCapacity: 3 },
  { hostCapacity: 0 }, { hostCapacity: 0 }, { hostCapacity: 0 }, { hostCapacity: 0 }
]);
const hoarding = S.capacityBalance(['k0', 'k1', 'k2', 'k3'], mixed);
const balanced = S.capacityBalance(['k0', 'k1', 'k4', 'k5'], mixed);
assert.ok(balanced > hoarding, 'a balanced group should score higher than one hoarding capacity');

// --- weights and aggregation ---
assert.equal(typeof S.DEFAULT_WEIGHTS.novelty, 'number');
const parts = S.scoreGroup(g, fresh, S.DEFAULT_WEIGHTS);
assert.ok(parts.total >= 0 && parts.total <= 1);
assert.equal(typeof parts.parts.novelty, 'number');

// zero weights must not divide by zero
const zeroed = S.scoreGroup(g, fresh, { novelty: 0, robustness: 0, capacityAdequacy: 0,
  weekdayBreadth: 0, capacityBalance: 0 });
assert.ok(Number.isFinite(zeroed.total));

// --- whole-solution score is the mean of its groups ---
const eight = makeProblem(new Array(8).fill({}));
const sol = { groups: [
  { id: 'A', childIds: ['k0', 'k1', 'k2', 'k3'] },
  { id: 'B', childIds: ['k4', 'k5', 'k6', 'k7'] }
] };
const total = S.scoreSolution(sol, eight, S.DEFAULT_WEIGHTS);
assert.ok(total.total > 0 && total.total <= 1);
assert.equal(total.perGroup.length, 2);

// --- cost is the exact complement, so the exact solver can minimise it ---
assert.ok(Math.abs(S.groupCost(g, fresh, S.DEFAULT_WEIGHTS) +
  S.scoreGroup(g, fresh, S.DEFAULT_WEIGHTS).total - 1) < 1e-12);

// --- explanations are Danish strings ---
const why = S.explainGroup(g, fresh, S.DEFAULT_WEIGHTS);
assert.ok(Array.isArray(why) && why.length > 0);
assert.ok(why.every(line => typeof line === 'string' && line.length > 5));

console.log('ok - scoring');
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node legegruppe/tests/scoring.test.mjs
```

Expected: fails with `Cannot find module '../js/scoring.js'`.

- [ ] **Step 3: Write the implementation**

Create `legegruppe/js/scoring.js`:

```js
/* Soft objectives S1-S5. Every objective is per-group and returns [0, 1], 1 = best.
   Browser: window.LG.Scoring   Node: require('./scoring.js') */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LG = Object.assign(root.LG || {}, { Scoring: factory() });
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_WEIGHTS = {
    novelty: 1.00,
    robustness: 0.70,
    capacityAdequacy: 0.70,
    weekdayBreadth: 0.40,
    capacityBalance: 0.40
  };

  const clamp01 = x => Math.min(1, Math.max(0, x));

  function familiesOf(childIds, problem) {
    return childIds.map(id => problem.familyOf(id)).filter(Boolean);
  }

  /** S1 - how many of this group's pairs are new? Repeat encounters decay geometrically. */
  function novelty(childIds, problem) {
    let pairs = 0, freshness = 0;
    for (let i = 0; i < childIds.length; i++) {
      for (let j = i + 1; j < childIds.length; j++) {
        pairs++;
        const times = problem.timesTogether(childIds[i], childIds[j]);
        freshness += times === 0 ? 1 : Math.pow(0.35, times);
      }
    }
    return pairs === 0 ? 1 : clamp01(freshness / pairs);
  }

  /** S2 - does the group survive one family dropping out? Hosts and days both count. */
  function robustness(childIds, problem) {
    const size = childIds.length;
    const fams = familiesOf(childIds, problem);
    let hosts = 0;
    fams.forEach(f => {
      if (f.hostCapacity > 0 && (f.canHostOutdoor || f.maxChildrenAtHome >= size - 1)) hosts++;
    });
    const dayCounts = [0, 0, 0, 0, 0, 0];
    fams.forEach(f => f.availableWeekdays.forEach(d => { dayCounts[d]++; }));
    const sharedDays = dayCounts.filter(n => n === fams.length).length;
    return clamp01(0.6 * Math.min(1, hosts / 3) + 0.4 * Math.min(1, sharedDays / 2));
  }

  /** S3 - does declared host capacity cover the round's meetings? */
  function capacityAdequacy(childIds, problem) {
    const supply = familiesOf(childIds, problem).reduce((s, f) => s + f.hostCapacity, 0);
    const needed = problem.meetingsPerGroup || 1;
    return clamp01(supply / needed);
  }

  /** S4 - how many weekdays does the whole group share? */
  function weekdayBreadth(childIds, problem) {
    const fams = familiesOf(childIds, problem);
    if (fams.length === 0) return 0;
    const counts = [0, 0, 0, 0, 0, 0];
    fams.forEach(f => f.availableWeekdays.forEach(d => { counts[d]++; }));
    const shared = counts.filter(n => n === fams.length).length;
    return clamp01(shared / 3);
  }

  /** Mean host capacity per child across the whole class. Cached on the problem. */
  function classTarget(problem) {
    if (problem._capTarget == null) {
      let sum = 0;
      problem.children.forEach(c => {
        const f = problem.familyOf(c.childId);
        sum += f ? f.hostCapacity : 0;
      });
      problem._capTarget = problem.children.length ? sum / problem.children.length : 0;
    }
    return problem._capTarget;
  }

  /** S5 - penalise groups whose capacity per child strays from the class average. */
  function capacityBalance(childIds, problem) {
    const target = classTarget(problem);
    if (target <= 0) return 1;
    const fams = familiesOf(childIds, problem);
    if (fams.length === 0) return 0;
    const mine = fams.reduce((s, f) => s + f.hostCapacity, 0) / fams.length;
    return clamp01(1 - Math.abs(mine - target) / target);
  }

  const OBJECTIVES = { novelty, robustness, capacityAdequacy, weekdayBreadth, capacityBalance };

  /** Weighted mean of all objectives -> { total, parts }. */
  function scoreGroup(childIds, problem, weights) {
    const w = weights || DEFAULT_WEIGHTS;
    const parts = {};
    let sum = 0, weightSum = 0;
    Object.keys(OBJECTIVES).forEach(name => {
      const value = OBJECTIVES[name](childIds, problem);
      parts[name] = value;
      const weight = typeof w[name] === 'number' ? w[name] : 0;
      sum += weight * value;
      weightSum += weight;
    });
    return { total: weightSum > 0 ? sum / weightSum : 0, parts };
  }

  /** What the exact solver minimises. Exact complement of scoreGroup().total. */
  function groupCost(childIds, problem, weights) {
    return 1 - scoreGroup(childIds, problem, weights).total;
  }

  function scoreSolution(solution, problem, weights) {
    const perGroup = (solution.groups || []).map(g => {
      const s = scoreGroup(g.childIds, problem, weights);
      return { id: g.id, total: s.total, parts: s.parts };
    });
    const total = perGroup.length
      ? perGroup.reduce((s, g) => s + g.total, 0) / perGroup.length
      : 0;
    return { total, perGroup };
  }

  const LABELS = {
    novelty: 'børnene har ikke leget sammen før',
    robustness: 'flere familier kan lægge hus til',
    capacityAdequacy: 'der er værter nok til alle møderne',
    weekdayBreadth: 'gruppen deler flere hverdage',
    capacityBalance: 'gruppen har en jævn fordeling af overskud'
  };

  /** Danish sentences describing why this group holds together, strongest first. */
  function explainGroup(childIds, problem, weights) {
    const scored = scoreGroup(childIds, problem, weights);
    const parts = scored.parts;
    const ranked = Object.keys(parts)
      .map(name => ({ name: name, value: parts[name] }))
      .sort((a, b) => b.value - a.value);
    const lines = [];
    ranked.slice(0, 2).filter(r => r.value >= 0.6)
      .forEach(r => lines.push('Stærk her: ' + LABELS[r.name] + '.'));
    ranked.slice(-1).filter(r => r.value < 0.4)
      .forEach(r => lines.push('Svag her: ' + LABELS[r.name] + '.'));
    if (lines.length === 0) lines.push('Gruppen er en jævn mellemvare på alle hensyn.');
    return lines;
  }

  return {
    DEFAULT_WEIGHTS: DEFAULT_WEIGHTS, OBJECTIVES: OBJECTIVES, LABELS: LABELS,
    novelty, robustness, capacityAdequacy, weekdayBreadth, capacityBalance,
    scoreGroup, groupCost, scoreSolution, explainGroup
  };
});
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node legegruppe/tests/scoring.test.mjs
```

Expected: `ok - scoring`

- [ ] **Step 5: Commit**

```bash
git add legegruppe/js/scoring.js legegruppe/tests/scoring.test.mjs
git commit -m "feat: legegruppe soft objectives and scoring"
```

---

## Task 4: Solver A — heuristic

**Files:**
- Create: `legegruppe/js/solvers/heuristic.js`
- Test: `legegruppe/tests/heuristic.test.mjs`

Greedy construction followed by simulated annealing. Feasibility is never traded away: a move that would break H1–H5 in either affected group is rejected outright, so every intermediate state is a valid solution and the search can be stopped at any moment.

- [ ] **Step 1: Write the failing test**

Create `legegruppe/tests/heuristic.test.mjs`:

```js
/* Run: node legegruppe/tests/heuristic.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../js/model.js');
const C = require('../js/constraints.js');
const S = require('../js/scoring.js');
const H = require('../js/solvers/heuristic.js');

function makeProblem(n, spec, extra) {
  const children = [], families = [];
  for (let i = 0; i < n; i++) {
    children.push({ childId: 'k' + i, familyId: 'f' + i, name: 'Barn' + i });
    families.push(Object.assign({
      familyId: 'f' + i, classId: 'c1', parentName: 'P' + i, consentAt: '2026-08-01',
      hostCapacity: 2, maxChildrenAtHome: 5, availableWeekdays: [1, 2, 3, 4, 5], fetchCapacity: 4
    }, typeof spec === 'function' ? spec(i) : (spec || {})));
  }
  return M.buildProblem(Object.assign({
    classId: 'c1', children, families, groupSizeMin: 4, groupSizeMax: 5,
    weeks: [34, 35, 36, 37, 38, 39], meetingsPerGroup: 6
  }, extra || {}));
}

// --- group size planning ---
assert.deepEqual(H.planGroupSizes(24, 4, 5), [5, 5, 5, 5, 4]);
assert.deepEqual(H.planGroupSizes(20, 4, 5), [5, 5, 5, 5]);
assert.deepEqual(H.planGroupSizes(8, 4, 5), [4, 4]);
assert.deepEqual(H.planGroupSizes(9, 4, 5), [5, 4]);
assert.equal(H.planGroupSizes(3, 4, 5), null);   // impossible
assert.equal(H.planGroupSizes(7, 4, 5), null);   // 7 cannot be split into 4s and 5s

// every plan sums to n and stays inside the bounds
for (let n = 8; n <= 40; n++) {
  const sizes = H.planGroupSizes(n, 4, 5);
  if (sizes === null) continue;
  assert.equal(sizes.reduce((a, b) => a + b, 0), n, 'sizes must sum to ' + n);
  assert.ok(sizes.every(s => s >= 4 && s <= 5));
}

// --- a comfortable class solves cleanly and passes the independent verifier ---
const easy = makeProblem(24);
const r = H.solve(easy, { seed: 1, timeBudgetMs: 300, weights: S.DEFAULT_WEIGHTS });
assert.equal(r.status, 'ok');
assert.equal(r.groups.length, 5);
assert.deepEqual(C.verifySolution(r, easy), []);
assert.equal(r.meta.solver, 'heuristic');
assert.ok(r.meta.runtimeMs >= 0);

// --- determinism: same seed, identical output ---
const a = H.solve(easy, { seed: 7, timeBudgetMs: 200, weights: S.DEFAULT_WEIGHTS });
const b = H.solve(easy, { seed: 7, timeBudgetMs: 200, weights: S.DEFAULT_WEIGHTS });
assert.deepEqual(a.groups.map(g => g.childIds), b.groups.map(g => g.childIds));

// --- annealing actually improves on the constructed start ---
assert.ok(r.score.total >= r.meta.initialScore - 1e-9,
  'final score must be at least as good as the starting one');

// --- blocked pairs are honoured, never merely penalised ---
const blocked = makeProblem(24, {}, { blockedPairs: [['k0', 'k1'], ['k2', 'k3'], ['k0', 'k5']] });
const rb = H.solve(blocked, { seed: 3, timeBudgetMs: 300, weights: S.DEFAULT_WEIGHTS });
assert.equal(rb.status, 'ok');
assert.deepEqual(C.verifySolution(rb, blocked), []);

// --- locks: a pinned child stays where the admin put it ---
const locked = H.solve(easy, {
  seed: 5, timeBudgetMs: 300, weights: S.DEFAULT_WEIGHTS,
  locks: [{ childId: 'k0', groupIndex: 2 }, { childId: 'k1', groupIndex: 2 }]
});
assert.equal(locked.status, 'ok');
assert.ok(locked.groups[2].childIds.includes('k0'));
assert.ok(locked.groups[2].childIds.includes('k1'));
assert.deepEqual(C.verifySolution(locked, easy), []);

// --- history is actually used: the previous round's groups get broken up ---
const history = [];
[[0, 1, 2, 3, 4], [5, 6, 7, 8, 9]].forEach(grp => {
  for (let i = 0; i < grp.length; i++)
    for (let j = i + 1; j < grp.length; j++)
      history.push({ childA: 'k' + grp[i], childB: 'k' + grp[j] });
});
const second = makeProblem(24, {}, { history });
const r2 = H.solve(second, { seed: 11, timeBudgetMs: 500, weights: S.DEFAULT_WEIGHTS });
const g0 = r2.groups.find(g => g.childIds.includes('k0'));
const repeats = ['k1', 'k2', 'k3', 'k4'].filter(id => g0.childIds.includes(id)).length;
assert.ok(repeats <= 1, 'should not simply rebuild last round: ' + repeats + ' repeats');

// --- an impossible class returns infeasible, not a broken solution ---
const hopeless = makeProblem(24, { hostCapacity: 0, fetchCapacity: 0, maxChildrenAtHome: 0 });
const rh = H.solve(hopeless, { seed: 1, timeBudgetMs: 200, weights: S.DEFAULT_WEIGHTS });
assert.equal(rh.status, 'infeasible');
assert.ok(Array.isArray(rh.blockers) && rh.blockers.length > 0);

// --- groups carry Danish explanations ---
r.groups.forEach(g => {
  assert.ok(Array.isArray(g.why) && g.why.length > 0);
  assert.equal(typeof g.id, 'string');
});

console.log('ok - heuristic');
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node legegruppe/tests/heuristic.test.mjs
```

Expected: fails with `Cannot find module '../js/solvers/heuristic.js'`.

- [ ] **Step 3: Write the implementation**

Create `legegruppe/js/solvers/heuristic.js`:

```js
/* Solver A - greedy construction plus simulated annealing.
   Browser: window.LG.Heuristic   Node: require('./heuristic.js') */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../model.js'), require('../constraints.js'), require('../scoring.js'));
  } else {
    root.LG = Object.assign(root.LG || {}, {
      Heuristic: factory(root.LG.Model, root.LG.Constraints, root.LG.Scoring)
    });
  }
})(typeof self !== 'undefined' ? self : this, function (Model, Constraints, Scoring) {
  'use strict';

  const GROUP_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  /**
   * Split `n` children into as-equal-as-possible groups within [min, max].
   * Returns sizes in descending order, or null when no split exists.
   */
  function planGroupSizes(n, min, max) {
    if (n < min) return null;
    for (let count = Math.ceil(n / max); count <= Math.floor(n / min); count++) {
      const base = Math.floor(n / count);
      const remainder = n % count;
      const sizes = [];
      for (let i = 0; i < count; i++) sizes.push(base + (i < remainder ? 1 : 0));
      if (sizes.every(s => s >= min && s <= max)) return sizes.sort((a, b) => b - a);
    }
    return null;
  }

  /** Fisher-Yates with a seeded generator, so shuffles are reproducible. */
  function shuffle(arr, rand) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  /** Greedy fill: place each child in the legal group where it scores best. */
  function construct(problem, sizes, lockMap, rand) {
    const groups = sizes.map(() => []);
    const placed = new Set();

    // Locked children first - the admin's decisions are not negotiable.
    Object.keys(lockMap).forEach(childId => {
      const idx = lockMap[childId];
      if (idx >= 0 && idx < groups.length && groups[idx].length < sizes[idx]) {
        groups[idx].push(childId);
        placed.add(childId);
      }
    });

    const remaining = shuffle(
      problem.children.map(c => c.childId).filter(id => !placed.has(id)), rand);

    for (const childId of remaining) {
      let bestIdx = -1, bestScore = -Infinity;
      for (let i = 0; i < groups.length; i++) {
        if (groups[i].length >= sizes[i]) continue;
        const candidate = groups[i].concat([childId]);
        // Reject only violations that a partial group can already prove.
        const check = Constraints.groupFeasibility(candidate, problem);
        if (check.violations.some(v => v.code === 'H1')) continue;
        const s = Scoring.scoreGroup(candidate, problem, problem._weights).total
          + 0.001 * rand();
        if (s > bestScore) { bestScore = s; bestIdx = i; }
      }
      if (bestIdx === -1) return null;
      groups[bestIdx].push(childId);
    }
    return groups;
  }

  const feasible = (childIds, problem) =>
    Constraints.groupFeasibility(childIds, problem).ok;

  function totalScore(groups, problem, weights) {
    let sum = 0;
    groups.forEach(g => { sum += Scoring.scoreGroup(g, problem, weights).total; });
    return groups.length ? sum / groups.length : 0;
  }

  /**
   * Simulated annealing over swaps and moves. Any state that would violate a hard
   * requirement is rejected, so the incumbent is always a valid solution.
   */
  function anneal(groups, sizes, problem, weights, rand, deadline, locked) {
    let current = groups.map(g => g.slice());
    let currentScore = totalScore(current, problem, weights);
    let best = current.map(g => g.slice());
    let bestScore = currentScore;

    let temperature = 0.15;
    let iterations = 0;

    while (Date.now() < deadline) {
      iterations++;
      if (iterations % 200 === 0) temperature *= 0.92;

      const gi = Math.floor(rand() * current.length);
      let gj = Math.floor(rand() * current.length);
      if (gi === gj) gj = (gj + 1) % current.length;
      if (current[gi].length === 0 || current[gj].length === 0) continue;

      const ii = Math.floor(rand() * current[gi].length);
      const ji = Math.floor(rand() * current[gj].length);
      const a = current[gi][ii], b = current[gj][ji];
      if (locked.has(a) || locked.has(b)) continue;

      const newI = current[gi].slice(); newI[ii] = b;
      const newJ = current[gj].slice(); newJ[ji] = a;
      if (!feasible(newI, problem) || !feasible(newJ, problem)) continue;

      const before = Scoring.scoreGroup(current[gi], problem, weights).total
        + Scoring.scoreGroup(current[gj], problem, weights).total;
      const after = Scoring.scoreGroup(newI, problem, weights).total
        + Scoring.scoreGroup(newJ, problem, weights).total;
      const delta = (after - before) / current.length;

      if (delta > 0 || rand() < Math.exp(delta / Math.max(temperature, 1e-6))) {
        current[gi] = newI; current[gj] = newJ;
        currentScore += delta;
        if (currentScore > bestScore) {
          bestScore = currentScore;
          best = current.map(g => g.slice());
        }
      }
    }
    return { groups: best, score: bestScore, iterations };
  }

  /** Why is this class unsolvable? Reported per child, deduplicated. */
  function findBlockers(problem) {
    const sizes = planGroupSizes(problem.children.length, problem.groupSizeMin, problem.groupSizeMax);
    if (sizes === null) {
      return [{ code: 'H2', message: 'Klassen har ' + problem.children.length +
        ' børn, som ikke kan deles op i grupper på ' + problem.groupSizeMin + '-' +
        problem.groupSizeMax + '.' }];
    }
    const seen = new Map();
    problem.families.forEach(f => {
      if (f.hostCapacity === 0 && !f.canHostOutdoor) {
        seen.set('H3', { code: 'H3', message: 'Der er for få familier der kan afholde et møde.' });
      }
    });
    const totalFetch = problem.families.reduce((s, f) => s + f.fetchCapacity, 0);
    if (totalFetch < problem.children.length) {
      seen.set('H5', { code: 'H5', message: 'Klassens samlede hentekapacitet er ' + totalFetch +
        ', men der er ' + problem.children.length + ' børn der skal transporteres.' });
    }
    const dayCoverage = [0, 0, 0, 0, 0, 0];
    problem.families.forEach(f => f.availableWeekdays.forEach(d => { dayCoverage[d]++; }));
    if (dayCoverage.every(n => n < problem.groupSizeMin)) {
      seen.set('H4', { code: 'H4', message: 'Ingen hverdag har nok familier til at fylde en gruppe.' });
    }
    if (seen.size === 0) {
      seen.set('UNKNOWN', { code: 'UNKNOWN',
        message: 'Der findes ingen gyldig opdeling med de nuværende svar. Prøv den eksakte løser for en præcis forklaring.' });
    }
    return Array.from(seen.values());
  }

  /** Solver A. Signature matches solvers/index.js. */
  function solve(problem, options) {
    const opts = options || {};
    const weights = opts.weights || Scoring.DEFAULT_WEIGHTS;
    problem._weights = weights;
    const started = Date.now();
    const budget = typeof opts.timeBudgetMs === 'number' ? opts.timeBudgetMs : 200;
    const rand = Model.rng(typeof opts.seed === 'number' ? opts.seed : 1);

    const sizes = planGroupSizes(problem.children.length, problem.groupSizeMin, problem.groupSizeMax);
    if (sizes === null) {
      return { status: 'infeasible', groups: [], score: null, explanation: [],
        blockers: findBlockers(problem), meta: { solver: 'heuristic', runtimeMs: Date.now() - started } };
    }

    const lockMap = {};
    (opts.locks || []).forEach(l => { lockMap[l.childId] = l.groupIndex; });
    const locked = new Set(Object.keys(lockMap));

    // Restart construction until every group is feasible or the budget runs out.
    let start = null;
    for (let attempt = 0; attempt < 60 && Date.now() - started < budget; attempt++) {
      const candidate = construct(problem, sizes, lockMap, rand);
      if (candidate && candidate.every(g => feasible(g, problem))) { start = candidate; break; }
    }
    if (!start) {
      return { status: 'infeasible', groups: [], score: null, explanation: [],
        blockers: findBlockers(problem),
        meta: { solver: 'heuristic', runtimeMs: Date.now() - started, seed: opts.seed } };
    }

    const initialScore = totalScore(start, problem, weights);
    const deadline = started + budget;
    const result = anneal(start, sizes, problem, weights, rand, deadline, locked);

    const groups = result.groups.map((childIds, i) => ({
      id: GROUP_LETTERS[i] || String(i + 1),
      childIds: childIds.slice(),
      why: Scoring.explainGroup(childIds, problem, weights)
    }));

    return {
      status: 'ok',
      groups: groups,
      score: Scoring.scoreSolution({ groups: groups }, problem, weights),
      explanation: groups.map(g => 'Gruppe ' + g.id + ': ' + g.why.join(' ')),
      blockers: [],
      meta: {
        solver: 'heuristic', runtimeMs: Date.now() - started, seed: opts.seed,
        iterations: result.iterations, initialScore: initialScore
      }
    };
  }

  return { solve, planGroupSizes, construct, findBlockers };
});
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node legegruppe/tests/heuristic.test.mjs
```

Expected: `ok - heuristic`

If the history test fails intermittently, raise `timeBudgetMs` in that assertion rather than weakening the assertion — the point of the test is that annealing has time to break up last round's groups.

- [ ] **Step 5: Commit**

```bash
git add legegruppe/js/solvers/heuristic.js legegruppe/tests/heuristic.test.mjs
git commit -m "feat: legegruppe heuristic solver with simulated annealing"
```

---

## Task 5: Solver B — exact branch-and-bound

**Files:**
- Create: `legegruppe/js/solvers/exact.js`
- Test: `legegruppe/tests/exact.test.mjs`

Set partitioning solved exactly. Enumerate every group of legal size that satisfies H1–H5, give each one a cost, then find the cheapest set of groups that covers each child exactly once. Branching on the lowest-indexed uncovered child removes all permutation symmetry, and memoising on the covered-set bitmask collapses the rest. A time budget is mandatory: if it expires, the solver returns its best proven-feasible answer and says clearly that optimality was not proven.

- [ ] **Step 1: Write the failing test**

Create `legegruppe/tests/exact.test.mjs`:

```js
/* Run: node legegruppe/tests/exact.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../js/model.js');
const C = require('../js/constraints.js');
const S = require('../js/scoring.js');
const H = require('../js/solvers/heuristic.js');
const E = require('../js/solvers/exact.js');

function makeProblem(n, spec, extra) {
  const children = [], families = [];
  for (let i = 0; i < n; i++) {
    children.push({ childId: 'k' + i, familyId: 'f' + i, name: 'Barn' + i });
    families.push(Object.assign({
      familyId: 'f' + i, classId: 'c1', parentName: 'P' + i, consentAt: '2026-08-01',
      hostCapacity: 2, maxChildrenAtHome: 5, availableWeekdays: [1, 2, 3, 4, 5], fetchCapacity: 4
    }, typeof spec === 'function' ? spec(i) : (spec || {})));
  }
  return M.buildProblem(Object.assign({
    classId: 'c1', children, families, groupSizeMin: 4, groupSizeMax: 5,
    weeks: [34, 35, 36, 37, 38, 39], meetingsPerGroup: 6
  }, extra || {}));
}

// --- enumeration only yields groups that pass every hard requirement ---
const small = makeProblem(8);
const cols = E.enumerateGroups(small, S.DEFAULT_WEIGHTS, 100000);
assert.ok(cols.groups.length > 0);
assert.equal(cols.truncated, false);
cols.groups.forEach(col => {
  assert.deepEqual(C.groupFeasibility(col.childIds, small).violations, []);
  assert.ok(col.cost >= 0 && col.cost <= 1);
});

// --- blocked pairs never appear in any column ---
const blocked = makeProblem(8, {}, { blockedPairs: [['k0', 'k1']] });
E.enumerateGroups(blocked, S.DEFAULT_WEIGHTS, 100000).groups.forEach(col => {
  assert.ok(!(col.childIds.includes('k0') && col.childIds.includes('k1')));
});

// --- small instance: the exact optimum, verified by exhaustive comparison ---
const r8 = E.solve(small, { seed: 1, timeBudgetMs: 5000, weights: S.DEFAULT_WEIGHTS });
assert.equal(r8.status, 'ok');
assert.equal(r8.groups.length, 2);
assert.deepEqual(C.verifySolution(r8, small), []);
assert.equal(r8.meta.solver, 'exact');
assert.equal(r8.meta.provenOptimal, true);

// --- the exact solver is never worse than the heuristic on the same weights ---
const mid = makeProblem(12, i => ({
  hostCapacity: i % 3, availableWeekdays: i % 2 ? [1, 2, 3] : [2, 3, 4], fetchCapacity: 2 + (i % 3)
}));
const exact = E.solve(mid, { seed: 1, timeBudgetMs: 10000, weights: S.DEFAULT_WEIGHTS });
const heur = H.solve(mid, { seed: 1, timeBudgetMs: 500, weights: S.DEFAULT_WEIGHTS });
if (exact.status === 'ok' && heur.status === 'ok') {
  assert.ok(exact.score.total >= heur.score.total - 1e-9,
    'exact must be at least as good as the heuristic');
}

// --- determinism ---
const x1 = E.solve(small, { seed: 4, timeBudgetMs: 5000, weights: S.DEFAULT_WEIGHTS });
const x2 = E.solve(small, { seed: 9, timeBudgetMs: 5000, weights: S.DEFAULT_WEIGHTS });
assert.deepEqual(x1.groups.map(g => g.childIds), x2.groups.map(g => g.childIds),
  'the exact optimum must not depend on the seed');

// --- a full 24-child class solves within the stated budget ---
const full = makeProblem(24, i => ({
  hostCapacity: [0, 1, 2, 3][i % 4],
  maxChildrenAtHome: [0, 3, 4, 5][i % 4],
  availableWeekdays: [[1, 2], [2, 3], [3, 4], [1, 3, 5]][i % 4],
  fetchCapacity: [0, 2, 3, 4][i % 4]
}));
const started = Date.now();
const r24 = E.solve(full, { seed: 1, timeBudgetMs: 20000, weights: S.DEFAULT_WEIGHTS });
assert.ok(Date.now() - started < 25000);
assert.ok(r24.status === 'ok' || r24.status === 'infeasible');
if (r24.status === 'ok') assert.deepEqual(C.verifySolution(r24, full), []);

// --- oversized classes refuse rather than freeze ---
const huge = makeProblem(40);
const rh = E.solve(huge, { seed: 1, timeBudgetMs: 1000, weights: S.DEFAULT_WEIGHTS });
assert.equal(rh.status, 'infeasible');
assert.ok(rh.blockers.some(b => b.code === 'TOO_LARGE'));
assert.ok(/heuristik/i.test(rh.blockers.map(b => b.message).join(' ')),
  'the message must point the admin at solver A');

// --- genuinely impossible classes are reported, not fudged ---
const hopeless = makeProblem(24, { hostCapacity: 0, fetchCapacity: 0, maxChildrenAtHome: 0 });
const rz = E.solve(hopeless, { seed: 1, timeBudgetMs: 2000, weights: S.DEFAULT_WEIGHTS });
assert.equal(rz.status, 'infeasible');
assert.ok(rz.blockers.length > 0);

// --- locks are respected ---
const rl = E.solve(small, {
  seed: 1, timeBudgetMs: 5000, weights: S.DEFAULT_WEIGHTS,
  locks: [{ childId: 'k0', groupIndex: 0 }, { childId: 'k7', groupIndex: 0 }]
});
assert.equal(rl.status, 'ok');
const together = rl.groups.find(g => g.childIds.includes('k0'));
assert.ok(together.childIds.includes('k7'), 'locked children must share a group');

console.log('ok - exact');
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node legegruppe/tests/exact.test.mjs
```

Expected: fails with `Cannot find module '../js/solvers/exact.js'`.

- [ ] **Step 3: Write the implementation**

Create `legegruppe/js/solvers/exact.js`:

```js
/* Solver B - exact set partitioning by branch-and-bound with bitmask memoisation.
   Browser: window.LG.Exact   Node: require('./exact.js') */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../constraints.js'), require('../scoring.js'));
  } else {
    root.LG = Object.assign(root.LG || {}, {
      Exact: factory(root.LG.Constraints, root.LG.Scoring)
    });
  }
})(typeof self !== 'undefined' ? self : this, function (Constraints, Scoring) {
  'use strict';

  const GROUP_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  // 30 keeps every bitmask inside the signed 32-bit range that `1 << i` produces,
  // and the column count manageable. Larger classes go to solver A.
  const MAX_CHILDREN = 30;
  const MAX_COLUMNS = 400000;  // hard ceiling on enumerated groups

  /**
   * Enumerate every group of legal size passing H1-H5, as { mask, childIds, cost }.
   * `cost` is 1 - groupScore, so the partition problem is a minimisation.
   */
  function enumerateGroups(problem, weights, columnLimit) {
    const ids = problem.children.map(c => c.childId);
    const n = ids.length;
    const limit = columnLimit || MAX_COLUMNS;
    const groups = [];
    let truncated = false;

    const combo = [];
    function recurse(start, size, target) {
      if (truncated) return;
      if (combo.length === target) {
        const childIds = combo.map(i => ids[i]);
        if (Constraints.groupFeasibility(childIds, problem).ok) {
          let mask = 0;
          combo.forEach(i => { mask |= (1 << i); });
          groups.push({
            mask: mask,
            childIds: childIds.slice(),
            lowest: combo[0],
            cost: Scoring.groupCost(childIds, problem, weights)
          });
          if (groups.length >= limit) truncated = true;
        }
        return;
      }
      for (let i = start; i < n; i++) {
        combo.push(i);
        recurse(i + 1, size, target);
        combo.pop();
        if (truncated) return;
      }
    }

    for (let size = problem.groupSizeMin; size <= problem.groupSizeMax; size++) {
      recurse(0, size, size);
    }
    return { groups: groups, truncated: truncated };
  }

  /** Groups indexed by the lowest child index they contain - the branching order. */
  function indexByLowest(columns, n) {
    const byLowest = [];
    for (let i = 0; i < n; i++) byLowest.push([]);
    columns.forEach(col => { byLowest[col.lowest].push(col); });
    // Cheapest first: a good incumbent early prunes hard.
    byLowest.forEach(list => list.sort((a, b) => a.cost - b.cost));
    return byLowest;
  }

  function solve(problem, options) {
    const opts = options || {};
    const weights = opts.weights || Scoring.DEFAULT_WEIGHTS;
    const started = Date.now();
    const budget = typeof opts.timeBudgetMs === 'number' ? opts.timeBudgetMs : 10000;
    const ids = problem.children.map(c => c.childId);
    const n = ids.length;

    const fail = blockers => ({
      status: 'infeasible', groups: [], score: null, explanation: [], blockers: blockers,
      meta: { solver: 'exact', runtimeMs: Date.now() - started, provenOptimal: false }
    });

    if (n > MAX_CHILDREN) {
      return fail([{ code: 'TOO_LARGE', message: 'Klassen har ' + n +
        ' børn. Den eksakte løser klarer op til ' + MAX_CHILDREN +
        '. Brug heuristikken (løser A) i stedet — den håndterer klasser af enhver størrelse.' }]);
    }

    const enumerated = enumerateGroups(problem, weights, MAX_COLUMNS);
    if (enumerated.truncated) {
      return fail([{ code: 'TOO_LARGE', message: 'Der er for mange mulige grupper til at ' +
        'gennemsøge dem alle. Brug heuristikken (løser A) i stedet.' }]);
    }
    if (enumerated.groups.length === 0) {
      return fail([{ code: 'H0', message: 'Der findes ikke en eneste lovlig gruppe med ' +
        'de nuværende svar. Mindst ét hårdt krav kan ikke opfyldes af nogen kombination af børn.' }]);
    }

    // Locks become an extra filter: locked children may only appear together.
    const lockGroups = {};
    (opts.locks || []).forEach(l => {
      lockGroups[l.groupIndex] = lockGroups[l.groupIndex] || [];
      lockGroups[l.groupIndex].push(l.childId);
    });
    const lockSets = Object.keys(lockGroups).map(k => lockGroups[k]);
    const columns = enumerated.groups.filter(col => lockSets.every(set => {
      const inside = set.filter(id => col.childIds.includes(id)).length;
      return inside === 0 || inside === set.length;
    }));
    if (columns.length === 0) {
      return fail([{ code: 'LOCK', message: 'De børn du har låst sammen kan ikke være i ' +
        'samme gruppe uden at bryde et hårdt krav.' }]);
    }

    const byLowest = indexByLowest(columns, n);
    const fullMask = (1 << n) - 1;   // safe: n <= MAX_CHILDREN (30)
    const memo = new Map();
    let expired = false;
    let checks = 0;

    /** Cheapest cover of the children not yet in `mask`, or null if none exists. */
    function best(mask) {
      if (mask === fullMask) return { cost: 0, chosen: [] };
      if (memo.has(mask)) return memo.get(mask);
      if ((++checks & 1023) === 0 && Date.now() - started > budget) { expired = true; return null; }
      if (expired) return null;

      let lowest = 0;
      while (lowest < n && (mask & (1 << lowest))) lowest++;

      let bestResult = null;
      const candidates = byLowest[lowest];
      for (let i = 0; i < candidates.length; i++) {
        const col = candidates[i];
        if (col.mask & mask) continue;
        if (bestResult && col.cost >= bestResult.cost) break; // sorted: nothing cheaper follows
        const rest = best(mask | col.mask);
        if (!rest) { if (expired) break; else continue; }
        const cost = col.cost + rest.cost;
        if (!bestResult || cost < bestResult.cost) {
          bestResult = { cost: cost, chosen: [col].concat(rest.chosen) };
        }
      }
      if (!expired) memo.set(mask, bestResult);
      return bestResult;
    }

    const result = best(0);

    if (!result) {
      if (expired) {
        return fail([{ code: 'TIMEOUT', message: 'Den eksakte løser nåede ikke frem inden for ' +
          'tidsgrænsen. Brug heuristikken (løser A), eller giv den eksakte mere tid.' }]);
      }
      return fail([{ code: 'PARTITION', message: 'Børnene kan ikke deles op i lovlige grupper. ' +
        'Der findes lovlige grupper, men ingen kombination dækker alle børn præcis én gang.' }]);
    }

    const groups = result.chosen.map((col, i) => ({
      id: GROUP_LETTERS[i] || String(i + 1),
      childIds: col.childIds.slice(),
      why: Scoring.explainGroup(col.childIds, problem, weights)
    }));

    return {
      status: 'ok',
      groups: groups,
      score: Scoring.scoreSolution({ groups: groups }, problem, weights),
      explanation: groups.map(g => 'Gruppe ' + g.id + ': ' + g.why.join(' ')),
      blockers: [],
      meta: {
        solver: 'exact', runtimeMs: Date.now() - started, provenOptimal: true,
        columns: columns.length, memoStates: memo.size
      }
    };
  }

  return { solve, enumerateGroups, MAX_CHILDREN: MAX_CHILDREN };
});
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node legegruppe/tests/exact.test.mjs
```

Expected: `ok - exact`

- [ ] **Step 5: Commit**

```bash
git add legegruppe/js/solvers/exact.js legegruppe/tests/exact.test.mjs
git commit -m "feat: legegruppe exact set-partitioning solver"
```

---

## Task 6: Host and fetcher rota

**Files:**
- Create: `legegruppe/js/solvers/rota.js`
- Test: `legegruppe/tests/rota.test.mjs`

Shared by both solvers. This is where the spec's burden-spreading requirement is actually enforced: a family is **never** scheduled to host more times than it said it could, and the rotation always picks whoever is furthest below their own declared share. When a meeting cannot be fully staffed with fetchers, it is not dropped — it is published with `transport: 'aftales'`, which is a legitimate outcome the parents settle between themselves.

- [ ] **Step 1: Write the failing test**

Create `legegruppe/tests/rota.test.mjs`:

```js
/* Run: node legegruppe/tests/rota.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../js/model.js');
const R = require('../js/solvers/rota.js');

function makeProblem(specs, extra) {
  const children = specs.map((s, i) => ({ childId: 'k' + i, familyId: 'f' + i, name: 'Barn' + i }));
  const families = specs.map((s, i) => Object.assign({
    familyId: 'f' + i, classId: 'c1', parentName: 'P' + i, consentAt: '2026-08-01',
    hostCapacity: 2, maxChildrenAtHome: 5, availableWeekdays: [1, 2, 3, 4, 5], fetchCapacity: 4
  }, s));
  return M.buildProblem(Object.assign({
    classId: 'c1', children, families, groupSizeMin: 4, groupSizeMax: 5,
    weeks: [34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45], meetingsPerGroup: 6
  }, extra || {}));
}

const four = ['k0', 'k1', 'k2', 'k3'];
const solution = { groups: [{ id: 'A', childIds: four }] };

// --- happy path ---
const p = makeProblem(new Array(4).fill({}));
const rota = R.buildRota(solution, p, { seed: 1 });
assert.equal(rota.groups.length, 1);
const meetings = rota.groups[0].meetings;
assert.equal(meetings.length, 6);
meetings.forEach(m => {
  assert.ok(p.weeks.includes(m.week));
  assert.ok(m.weekday >= 1 && m.weekday <= 5);
  assert.ok(['f0', 'f1', 'f2', 'f3'].includes(m.hostFamilyId));
  assert.ok(['hjemme', 'ude'].includes(m.place));
  assert.ok(Array.isArray(m.fetchers));
  assert.ok(['dækket', 'aftales'].includes(m.transport));
});

// --- weeks are strictly increasing and never repeat ---
const weeks = meetings.map(m => m.week);
assert.deepEqual(weeks, weeks.slice().sort((a, b) => a - b));
assert.equal(new Set(weeks).size, weeks.length);

// --- the host is always available on the chosen weekday ---
meetings.forEach(m => {
  const host = p.familyById(m.hostFamilyId);
  assert.ok(host.availableWeekdays.includes(m.weekday), 'host must be free that weekday');
});

// --- HARD RULE: nobody hosts more often than they said they could ---
const counts = {};
meetings.forEach(m => { counts[m.hostFamilyId] = (counts[m.hostFamilyId] || 0) + 1; });
Object.keys(counts).forEach(fid => {
  assert.ok(counts[fid] <= p.familyById(fid).hostCapacity,
    fid + ' hosted ' + counts[fid] + ' times but declared ' + p.familyById(fid).hostCapacity);
});

// --- the rotation is even: with identical families nobody hosts twice as often as another ---
const values = Object.keys(counts).map(k => counts[k]);
assert.ok(Math.max.apply(null, values) - Math.min.apply(null, values) <= 1,
  'hosting should be spread evenly among equal families');

// --- blackout weeks are respected for the family they belong to ---
const withHoliday = makeProblem([
  { blackoutWeeks: [34, 35, 36, 37, 38, 39, 40, 41] }, {}, {}, {}
]);
R.buildRota(solution, withHoliday, { seed: 2 }).groups[0].meetings.forEach(m => {
  if (m.hostFamilyId === 'f0') assert.ok(m.week > 41, 'f0 must not host during its holiday');
});

// --- a family that cannot host is never scheduled as host ---
const oneHost = makeProblem([
  { hostCapacity: 6 }, { hostCapacity: 0 }, { hostCapacity: 0 }, { hostCapacity: 0 }
]);
R.buildRota(solution, oneHost, { seed: 3 }).groups[0].meetings.forEach(m => {
  assert.equal(m.hostFamilyId, 'f0');
});

// --- outdoor-only hosts are marked as meeting outdoors ---
const outdoorHost = makeProblem([
  { hostCapacity: 6, maxChildrenAtHome: 1, meetingPlace: 'outdoor' },
  { hostCapacity: 0 }, { hostCapacity: 0 }, { hostCapacity: 0 }
]);
R.buildRota(solution, outdoorHost, { seed: 4 }).groups[0].meetings.forEach(m => {
  assert.equal(m.place, 'ude');
});

// --- too little capacity: fewer meetings, and a warning saying so ---
const thin = makeProblem([
  { hostCapacity: 1 }, { hostCapacity: 0 }, { hostCapacity: 0 }, { hostCapacity: 0 }
]);
const thinRota = R.buildRota(solution, thin, { seed: 5 });
assert.equal(thinRota.groups[0].meetings.length, 1);
assert.ok(thinRota.warnings.some(w => /1 af 6|kun 1/.test(w)),
  'must warn that the round is short of meetings: ' + JSON.stringify(thinRota.warnings));

// --- transport falls back to "aftales" rather than inventing a fetcher ---
const noFetch = makeProblem([
  { hostCapacity: 6, fetchCapacity: 0 }, { fetchCapacity: 0 },
  { fetchCapacity: 0 }, { fetchCapacity: 0 }
]);
R.buildRota(solution, noFetch, { seed: 6 }).groups[0].meetings.forEach(m => {
  assert.equal(m.transport, 'aftales');
  assert.ok(m.transportNote.length > 5);
});

// --- fetch duty rotates too, when several families can fetch ---
const spread = R.buildRota(solution, makeProblem(new Array(4).fill({})), { seed: 7 });
const fetchCounts = {};
spread.groups[0].meetings.forEach(m => m.fetchers.forEach(f => {
  fetchCounts[f] = (fetchCounts[f] || 0) + 1;
}));
assert.ok(Object.keys(fetchCounts).length > 1, 'fetch duty should not land on one family');

// --- determinism ---
const d1 = R.buildRota(solution, p, { seed: 42 });
const d2 = R.buildRota(solution, p, { seed: 42 });
assert.deepEqual(d1.groups[0].meetings, d2.groups[0].meetings);

console.log('ok - rota');
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node legegruppe/tests/rota.test.mjs
```

Expected: fails with `Cannot find module '../js/solvers/rota.js'`.

- [ ] **Step 3: Write the implementation**

Create `legegruppe/js/solvers/rota.js`:

```js
/* Host and fetcher rotation across week numbers. Shared by both solvers.
   Browser: window.LG.Rota   Node: require('./rota.js') */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../model.js'), require('../constraints.js'));
  } else {
    root.LG = Object.assign(root.LG || {}, {
      Rota: factory(root.LG.Model, root.LG.Constraints)
    });
  }
})(typeof self !== 'undefined' ? self : this, function (Model, Constraints) {
  'use strict';

  const DAY_NAMES = { 1: 'mandag', 2: 'tirsdag', 3: 'onsdag', 4: 'torsdag', 5: 'fredag' };

  /** Can this family host a group of `size`, at home or outdoors? */
  function canHost(family, size) {
    if (family.hostCapacity <= 0) return false;
    return family.canHostOutdoor || family.maxChildrenAtHome >= size - 1;
  }

  /** Pick `count` weeks spread as evenly as possible across the available weeks. */
  function spreadWeeks(weeks, count) {
    if (count >= weeks.length) return weeks.slice(0, count);
    const picked = [];
    const step = weeks.length / count;
    for (let i = 0; i < count; i++) picked.push(weeks[Math.floor(i * step)]);
    return picked;
  }

  /**
   * Build the meeting schedule for one group.
   * Returns { meetings, warnings }.
   */
  function buildGroupRota(group, problem, rand) {
    const size = group.childIds.length;
    const families = group.childIds.map(id => problem.familyOf(id)).filter(Boolean);
    const hosts = families.filter(f => canHost(f, size));
    const warnings = [];

    const capacity = hosts.reduce((s, f) => s + f.hostCapacity, 0);
    const wanted = problem.meetingsPerGroup;
    const planned = Math.min(wanted, capacity, problem.weeks.length);

    if (planned < wanted) {
      warnings.push('Gruppe ' + group.id + ' kan kun holde ' + planned + ' af ' + wanted +
        ' møder — familierne har tilsammen kapacitet til ' + capacity + '.');
    }
    if (planned === 0) return { meetings: [], warnings: warnings };

    const weeks = spreadWeeks(problem.weeks, planned);
    const hostCount = {};   // familyId -> times hosted so far
    const fetchCount = {};  // familyId -> times fetched so far
    hosts.forEach(f => { hostCount[f.familyId] = 0; });
    families.forEach(f => { fetchCount[f.familyId] = 0; });

    const meetings = [];

    weeks.forEach(week => {
      // Eligible hosts: capacity left, not on holiday this week.
      const eligible = hosts.filter(f =>
        hostCount[f.familyId] < f.hostCapacity && f.blackoutWeeks.indexOf(week) === -1);
      if (eligible.length === 0) {
        warnings.push('Ingen vært kunne findes til uge ' + week + ' i gruppe ' + group.id + '.');
        return;
      }

      // Furthest below their own declared share goes first. Ties broken deterministically.
      eligible.sort((a, b) => {
        const ra = hostCount[a.familyId] / a.hostCapacity;
        const rb = hostCount[b.familyId] / b.hostCapacity;
        if (ra !== rb) return ra - rb;
        return a.familyId < b.familyId ? -1 : 1;
      });
      const host = eligible[0];

      // The weekday must work for EVERY family in the group - a meeting needs all
      // the children present. Constraints.viableDays is the single source of truth
      // for that, so H4 and the published rota can never disagree.
      const days = Constraints.viableDays(group.childIds, problem)
        .filter(d => host.availableWeekdays.indexOf(d) !== -1);
      if (days.length === 0) {
        warnings.push('Ingen fælles hverdag for gruppe ' + group.id + ' i uge ' + week + '.');
        return;
      }
      const weekday = days[0];

      // Fetchers: available that weekday, capacity > 0, least-used first.
      const needed = size - 1;
      const pool = families.filter(f =>
        f.fetchCapacity > 0 && f.availableWeekdays.indexOf(weekday) !== -1);
      pool.sort((a, b) => {
        const d = fetchCount[a.familyId] - fetchCount[b.familyId];
        return d !== 0 ? d : (a.familyId < b.familyId ? -1 : 1);
      });

      const fetchers = [];
      let covered = 0;
      for (const f of pool) {
        if (covered >= needed) break;
        fetchers.push(f.familyId);
        covered += f.fetchCapacity;
      }

      const settled = covered >= needed;
      fetchers.forEach(id => { fetchCount[id] = (fetchCount[id] || 0) + 1; });
      hostCount[host.familyId]++;

      const atHome = host.maxChildrenAtHome >= size - 1;
      meetings.push({
        week: week,
        weekday: weekday,
        weekdayName: DAY_NAMES[weekday],
        hostFamilyId: host.familyId,
        place: atHome ? 'hjemme' : 'ude',
        fetchers: settled ? fetchers : [],
        transport: settled ? 'dækket' : 'aftales',
        transportNote: settled
          ? fetchers.map(id => (problem.familyById(id) || {}).parentName || id).join(' og ') +
            ' henter børnene fra skole.'
          : 'Ingen i gruppen kan hente den dag — aftal indbyrdes, eller mød på skolens legeplads.'
      });
    });

    return { meetings: meetings, warnings: warnings };
  }

  /** Build the rota for every group in a solution. */
  function buildRota(solution, problem, options) {
    const opts = options || {};
    const rand = Model.rng(typeof opts.seed === 'number' ? opts.seed : 1);
    const warnings = [];
    const groups = (solution.groups || []).map(g => {
      const built = buildGroupRota(g, problem, rand);
      built.warnings.forEach(w => warnings.push(w));
      return { id: g.id, childIds: g.childIds.slice(), meetings: built.meetings };
    });
    return { groups: groups, warnings: warnings };
  }

  return { buildRota, buildGroupRota, spreadWeeks, DAY_NAMES };
});
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node legegruppe/tests/rota.test.mjs
```

Expected: `ok - rota`

- [ ] **Step 5: Commit**

```bash
git add legegruppe/js/solvers/rota.js legegruppe/tests/rota.test.mjs
git commit -m "feat: legegruppe host and fetcher rota"
```

---

## Task 7: Infeasibility diagnosis

**Files:**
- Modify: `legegruppe/js/model.js` (add one line to `buildProblem`)
- Create: `legegruppe/js/solvers/infeasibility.js`
- Test: `legegruppe/tests/infeasibility.test.mjs`

When no valid solution exists, the admin must be told **which single constraint to relax** — that is the difference between a usable tool and a dead end. The method is to relax one requirement at a time, then pairs, and report the smallest relaxation that makes the problem solvable. H1 is never relaxed and never suggested: forbidden pairs are not a logistics parameter.

- [ ] **Step 1: Make the problem carry its own input**

`diagnose()` needs to rebuild a modified problem, and blocked pairs and history live in closures. Add one line to `buildProblem` in `legegruppe/js/model.js`, immediately after `classId:` in the returned object:

```js
      classId: String(input.classId || ''),
      _input: input,
```

Then add this assertion to the end of `legegruppe/tests/model.test.mjs`, before the final `console.log`:

```js
// --- the problem keeps its raw input so it can be rebuilt with relaxed rules ---
assert.equal(problem._input.classId, 'c1');
assert.equal(problem._input.blockedPairs.length, 1);
```

Run `node legegruppe/tests/model.test.mjs` — expected: `ok - model`.

- [ ] **Step 2: Write the failing test**

Create `legegruppe/tests/infeasibility.test.mjs`:

```js
/* Run: node legegruppe/tests/infeasibility.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../js/model.js');
const I = require('../js/solvers/infeasibility.js');

function makeProblem(n, spec, extra) {
  const children = [], families = [];
  for (let i = 0; i < n; i++) {
    children.push({ childId: 'k' + i, familyId: 'f' + i, name: 'Barn' + i });
    families.push(Object.assign({
      familyId: 'f' + i, classId: 'c1', parentName: 'P' + i, consentAt: '2026-08-01',
      hostCapacity: 2, maxChildrenAtHome: 5, availableWeekdays: [1, 2, 3, 4, 5], fetchCapacity: 4
    }, typeof spec === 'function' ? spec(i) : (spec || {})));
  }
  return M.buildProblem(Object.assign({
    classId: 'c1', children, families, groupSizeMin: 4, groupSizeMax: 5,
    weeks: [34, 35, 36, 37, 38, 39], meetingsPerGroup: 6
  }, extra || {}));
}

// --- a solvable class needs no relaxation ---
const fine = makeProblem(8);
const okDiag = I.diagnose(fine, { timeBudgetMs: 2000 });
assert.equal(okDiag.needsRelaxation, false);
assert.deepEqual(okDiag.relaxations, []);

// --- nobody can fetch: the fetch requirement is identified ---
const noFetch = makeProblem(8, { fetchCapacity: 0 });
const d1 = I.diagnose(noFetch, { timeBudgetMs: 3000 });
assert.equal(d1.needsRelaxation, true);
assert.ok(d1.relaxations.length > 0);
assert.ok(d1.relaxations.some(r => r.code === 'H5'), JSON.stringify(d1.relaxations));

// --- nobody has room at home, but going outdoors would fix it ---
const noRoom = makeProblem(8, { maxChildrenAtHome: 1 });
const d2 = I.diagnose(noRoom, { timeBudgetMs: 3000 });
assert.equal(d2.needsRelaxation, true);
assert.ok(d2.relaxations.some(r => r.code === 'H3'));

// --- everyone free on a different day ---
const noDay = makeProblem(8, i => ({ availableWeekdays: [(i % 5) + 1] }));
const d3 = I.diagnose(noDay, { timeBudgetMs: 3000 });
assert.equal(d3.needsRelaxation, true);
assert.ok(d3.relaxations.some(r => r.code === 'H4' || r.code === 'H5'));

// --- H1 is never suggested as something to relax ---
const blocked = makeProblem(8, {}, {
  blockedPairs: [['k0', 'k1'], ['k0', 'k2'], ['k0', 'k3'], ['k0', 'k4'],
    ['k0', 'k5'], ['k0', 'k6'], ['k0', 'k7']]
});
const d4 = I.diagnose(blocked, { timeBudgetMs: 3000 });
d4.relaxations.forEach(r => assert.notEqual(r.code, 'H1'));
assert.ok(d4.summary.length > 20);

// --- every relaxation comes with actionable Danish prose ---
[d1, d2, d3].forEach(d => {
  assert.ok(typeof d.summary === 'string' && d.summary.length > 20, d.summary);
  d.relaxations.forEach(r => {
    assert.ok(typeof r.message === 'string' && r.message.length > 15);
    assert.ok(typeof r.action === 'string' && r.action.length > 10);
  });
});

// --- the class size itself can be the problem ---
const seven = makeProblem(7);
const d5 = I.diagnose(seven, { timeBudgetMs: 2000 });
assert.equal(d5.needsRelaxation, true);
assert.ok(d5.relaxations.some(r => r.code === 'H2'));

console.log('ok - infeasibility');
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
node legegruppe/tests/infeasibility.test.mjs
```

Expected: fails with `Cannot find module '../js/solvers/infeasibility.js'`.

- [ ] **Step 4: Write the implementation**

Create `legegruppe/js/solvers/infeasibility.js`:

```js
/* Finds the smallest relaxation that would make an infeasible class solvable.
   Browser: window.LG.Infeasibility   Node: require('./infeasibility.js') */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../model.js'), require('./heuristic.js'));
  } else {
    root.LG = Object.assign(root.LG || {}, {
      Infeasibility: factory(root.LG.Model, root.LG.Heuristic)
    });
  }
})(typeof self !== 'undefined' ? self : this, function (Model, Heuristic) {
  'use strict';

  /**
   * Each relaxation rewrites the raw input. H1 is deliberately absent: forbidden
   * pairs are a social decision, not a logistics dial, and must never be suggested.
   */
  const RELAXATIONS = [
    {
      code: 'H3',
      message: 'Mindst én gruppe kan ikke mødes hjemme hos nogen.',
      action: 'Spørg om én familie kan tage gruppen med på legepladsen eller i parken i stedet.',
      apply: function (input) {
        return Object.assign({}, input, {
          families: input.families.map(f => Object.assign({}, f, {
            meetingPlace: 'both',
            hostCapacity: Math.max(1, parseInt(f.hostCapacity, 10) || 0)
          }))
        });
      }
    },
    {
      code: 'H5',
      message: 'Der er ikke nok hentekapacitet til at få børnene fra skole.',
      action: 'Spørg om én familie kan hente et barn mere, eller lad børnene blive på skolens legeplads til forældrene kommer.',
      apply: function (input) {
        return Object.assign({}, input, {
          families: input.families.map(f => Object.assign({}, f, { fetchCapacity: 5 }))
        });
      }
    },
    {
      code: 'H4',
      message: 'Familierne har ingen fælles hverdag.',
      action: 'Spørg om én familie kan tilføje en ekstra ugedag.',
      apply: function (input) {
        return Object.assign({}, input, {
          families: input.families.map(f => Object.assign({}, f, {
            availableWeekdays: [1, 2, 3, 4, 5]
          }))
        });
      }
    },
    {
      code: 'H2',
      message: 'Klassens størrelse går ikke op i grupper på ' +
        'den valgte størrelse.',
      action: 'Tillad grupper på 3 til 6 børn i stedet.',
      apply: function (input) {
        return Object.assign({}, input, { groupSizeMin: 3, groupSizeMax: 6 });
      }
    }
  ];

  /** Cheap feasibility probe: can the heuristic find any valid solution at all? */
  function solvable(input, budget) {
    const problem = Model.buildProblem(input);
    const result = Heuristic.solve(problem, { seed: 1, timeBudgetMs: budget });
    return result.status === 'ok';
  }

  /**
   * Try no relaxation, then each single one, then each pair. Returns the smallest
   * set that works, with Danish prose the admin can act on.
   */
  function diagnose(problem, options) {
    const opts = options || {};
    const total = typeof opts.timeBudgetMs === 'number' ? opts.timeBudgetMs : 4000;
    const input = problem._input;
    const probe = Math.max(60, Math.floor(total / (RELAXATIONS.length * 2 + 2)));

    if (solvable(input, probe)) {
      return { needsRelaxation: false, relaxations: [], summary: 'Klassen kan gå op som den er.' };
    }

    for (const r of RELAXATIONS) {
      if (solvable(r.apply(input), probe)) {
        return {
          needsRelaxation: true,
          relaxations: [{ code: r.code, message: r.message, action: r.action }],
          summary: r.message + ' ' + r.action
        };
      }
    }

    for (let i = 0; i < RELAXATIONS.length; i++) {
      for (let j = i + 1; j < RELAXATIONS.length; j++) {
        const combined = RELAXATIONS[j].apply(RELAXATIONS[i].apply(input));
        if (solvable(combined, probe)) {
          const pair = [RELAXATIONS[i], RELAXATIONS[j]];
          return {
            needsRelaxation: true,
            relaxations: pair.map(r => ({ code: r.code, message: r.message, action: r.action })),
            summary: 'Der skal to ting til: ' + pair.map(r => r.action).join(' Og: ')
          };
        }
      }
    }

    return {
      needsRelaxation: true,
      relaxations: RELAXATIONS.map(r => ({ code: r.code, message: r.message, action: r.action })),
      summary: 'Klassen kan ikke gå op, selv hvis alle logistiske krav lempes. ' +
        'Se om der er for mange forbudte par, eller om for få familier har svaret.'
    };
  }

  return { diagnose, RELAXATIONS };
});
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
node legegruppe/tests/infeasibility.test.mjs
```

Expected: `ok - infeasibility`

- [ ] **Step 6: Commit**

```bash
git add legegruppe/js/model.js legegruppe/js/solvers/infeasibility.js \
  legegruppe/tests/model.test.mjs legegruppe/tests/infeasibility.test.mjs
git commit -m "feat: legegruppe infeasibility diagnosis with actionable relaxations"
```

---

## Task 8: The solve() contract

**Files:**
- Create: `legegruppe/js/solvers/index.js`
- Test: `legegruppe/tests/solve.test.mjs`

One entry point that the UI calls. It picks a solver, runs grouping, builds the rota, runs the independent verifier over the result, and — critically — **refuses to return `status: 'ok'` if the verifier finds anything.** A solver bug must surface as a loud failure, never as a published plan.

- [ ] **Step 1: Write the failing test**

Create `legegruppe/tests/solve.test.mjs`:

```js
/* Run: node legegruppe/tests/solve.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../js/model.js');
const Solve = require('../js/solvers/index.js');

function makeProblem(n, spec, extra) {
  const children = [], families = [];
  for (let i = 0; i < n; i++) {
    children.push({ childId: 'k' + i, familyId: 'f' + i, name: 'Barn' + i });
    families.push(Object.assign({
      familyId: 'f' + i, classId: 'c1', parentName: 'P' + i, consentAt: '2026-08-01',
      hostCapacity: 2, maxChildrenAtHome: 5, availableWeekdays: [1, 2, 3, 4, 5], fetchCapacity: 4
    }, typeof spec === 'function' ? spec(i) : (spec || {})));
  }
  return M.buildProblem(Object.assign({
    classId: 'c1', children, families, groupSizeMin: 4, groupSizeMax: 5,
    weeks: [34, 35, 36, 37, 38, 39], meetingsPerGroup: 6
  }, extra || {}));
}

const p = makeProblem(24);

// --- both solvers satisfy the same contract ---
['heuristic', 'exact'].forEach(name => {
  const r = Solve.solve(p, { solver: name, seed: 1, timeBudgetMs: 4000 });
  assert.equal(r.status, 'ok', name + ' should solve a comfortable class');
  assert.equal(r.meta.solver, name);
  assert.ok(Array.isArray(r.groups) && r.groups.length > 0);
  assert.ok(r.rota && Array.isArray(r.rota.groups));
  assert.equal(r.rota.groups.length, r.groups.length);
  assert.deepEqual(r.verification, []);
  assert.ok(typeof r.score.total === 'number');
  assert.ok(Array.isArray(r.explanation));
  assert.ok(typeof r.meta.runtimeMs === 'number');
});

// --- unknown solver names fall back to the heuristic rather than throwing ---
const fallback = Solve.solve(p, { solver: 'nonsense', seed: 1, timeBudgetMs: 500 });
assert.equal(fallback.meta.solver, 'heuristic');

// --- infeasible classes come back with a diagnosis attached ---
const hopeless = makeProblem(24, { hostCapacity: 0, maxChildrenAtHome: 0, fetchCapacity: 0 });
const bad = Solve.solve(hopeless, { solver: 'heuristic', seed: 1, timeBudgetMs: 800 });
assert.equal(bad.status, 'infeasible');
assert.ok(bad.diagnosis && typeof bad.diagnosis.summary === 'string');
assert.ok(bad.diagnosis.summary.length > 20);
assert.equal(bad.rota, null);

// --- a solver that merely ran out of time must NOT be diagnosed as an
//     impossible class: that would tell the admin to loosen the wrong thing ---
const tooBig = makeProblem(40);
const refused = Solve.solve(tooBig, { solver: 'exact', seed: 1, timeBudgetMs: 500 });
assert.equal(refused.status, 'infeasible');
assert.equal(refused.diagnosis.needsRelaxation, false);
assert.ok(/heuristik/i.test(refused.diagnosis.summary), refused.diagnosis.summary);

// --- comparing the two solvers side by side ---
const cmp = Solve.compare(p, { seed: 1, timeBudgetMs: 4000 });
assert.ok(cmp.heuristic && cmp.exact);
assert.ok(typeof cmp.differentChildren === 'number');
assert.ok(cmp.differentChildren >= 0 && cmp.differentChildren <= p.children.length);
assert.ok(typeof cmp.summary === 'string' && cmp.summary.length > 10);

console.log('ok - solve');
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node legegruppe/tests/solve.test.mjs
```

Expected: fails with `Cannot find module '../js/solvers/index.js'`.

- [ ] **Step 3: Write the implementation**

Create `legegruppe/js/solvers/index.js`:

```js
/* The single entry point the UI calls. Grouping + rota + independent verification.
   Browser: window.LG.Solve   Node: require('./index.js') */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../constraints.js'), require('../scoring.js'),
      require('./heuristic.js'), require('./exact.js'), require('./rota.js'),
      require('./infeasibility.js'));
  } else {
    root.LG = Object.assign(root.LG || {}, {
      Solve: factory(root.LG.Constraints, root.LG.Scoring, root.LG.Heuristic,
        root.LG.Exact, root.LG.Rota, root.LG.Infeasibility)
    });
  }
})(typeof self !== 'undefined' ? self : this, function (
  Constraints, Scoring, Heuristic, Exact, Rota, Infeasibility) {
  'use strict';

  const SOLVERS = { heuristic: Heuristic, exact: Exact };

  /**
   * Run one solver end to end.
   * options: { solver, seed, timeBudgetMs, weights, locks }
   */
  function solve(problem, options) {
    const opts = options || {};
    const name = SOLVERS[opts.solver] ? opts.solver : 'heuristic';
    const started = Date.now();

    const grouping = SOLVERS[name].solve(problem, {
      seed: typeof opts.seed === 'number' ? opts.seed : 1,
      timeBudgetMs: opts.timeBudgetMs,
      weights: opts.weights || Scoring.DEFAULT_WEIGHTS,
      locks: opts.locks || []
    });

    if (grouping.status !== 'ok') {
      // A timeout or a size refusal is a statement about the *solver*, not about the
      // class. Diagnosing relaxations there would tell the admin to loosen constraints
      // that were never the problem, so pass the blocker through untouched.
      const solverLimited = (grouping.blockers || [])
        .some(b => b.code === 'TIMEOUT' || b.code === 'TOO_LARGE');
      return Object.assign({}, grouping, {
        rota: null,
        verification: null,
        diagnosis: solverLimited
          ? { needsRelaxation: false, relaxations: [],
              summary: grouping.blockers.map(b => b.message).join(' ') }
          : Infeasibility.diagnose(problem, { timeBudgetMs: 4000 }),
        meta: Object.assign({}, grouping.meta, { solver: name, runtimeMs: Date.now() - started })
      });
    }

    // Independent audit. A solver bug must never reach a published plan.
    const verification = Constraints.verifySolution(grouping, problem);
    if (verification.length > 0) {
      return {
        status: 'invalid',
        groups: grouping.groups,
        score: grouping.score,
        explanation: grouping.explanation,
        blockers: [],
        rota: null,
        verification: verification,
        diagnosis: null,
        meta: Object.assign({}, grouping.meta, { solver: name, runtimeMs: Date.now() - started })
      };
    }

    const rota = Rota.buildRota(grouping, problem, { seed: opts.seed });

    return {
      status: 'ok',
      groups: grouping.groups,
      score: grouping.score,
      explanation: grouping.explanation,
      blockers: [],
      rota: rota,
      verification: [],
      diagnosis: null,
      meta: Object.assign({}, grouping.meta, { solver: name, runtimeMs: Date.now() - started })
    };
  }

  /** How many children would end up with different groupmates under the other solver? */
  function countDifferences(a, b) {
    if (a.status !== 'ok' || b.status !== 'ok') return 0;
    const mates = solution => {
      const map = new Map();
      solution.groups.forEach(g => g.childIds.forEach(id => {
        map.set(id, g.childIds.filter(x => x !== id).sort().join(','));
      }));
      return map;
    };
    const ma = mates(a), mb = mates(b);
    let differ = 0;
    ma.forEach((value, id) => { if (mb.get(id) !== value) differ++; });
    return differ;
  }

  /** Run both solvers on the same problem and describe the difference. */
  function compare(problem, options) {
    const opts = options || {};
    const heuristic = solve(problem, Object.assign({}, opts, { solver: 'heuristic' }));
    const exact = solve(problem, Object.assign({}, opts, { solver: 'exact' }));
    const differentChildren = countDifferences(heuristic, exact);

    let summary;
    if (exact.status !== 'ok') {
      summary = 'Den eksakte løser kom ikke igennem. Brug heuristikkens forslag.';
    } else if (heuristic.status !== 'ok') {
      summary = 'Heuristikken fandt ingen løsning, men den eksakte gjorde. Brug den eksakte.';
    } else if (differentChildren === 0) {
      summary = 'De to løsere er nået frem til nøjagtig samme opdeling.';
    } else {
      const gap = ((exact.score.total - heuristic.score.total) * 100).toFixed(1);
      summary = differentChildren + ' børn får andre gruppekammerater. Den eksakte scorer ' +
        gap + ' procentpoint højere.';
    }
    return { heuristic, exact, differentChildren, summary };
  }

  return { solve, compare, SOLVERS };
});
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node legegruppe/tests/solve.test.mjs
```

Expected: `ok - solve`

- [ ] **Step 5: Commit**

```bash
git add legegruppe/js/solvers/index.js legegruppe/tests/solve.test.mjs
git commit -m "feat: legegruppe solve contract with verification gate and solver comparison"
```

---

## Task 9: Synthetic class generator

**Files:**
- Create: `legegruppe/tests/generate.mjs`
- Test: `legegruppe/tests/generate.test.mjs`

The 1000-simulation run needs classes that look like real Danish school classes, plus deliberately hostile ones. The generator is seeded so any failing simulation can be reproduced exactly from its seed alone — without that, a failure at simulation 743 is unreproducible and therefore undebuggable.

- [ ] **Step 1: Write the failing test**

Create `legegruppe/tests/generate.test.mjs`:

```js
/* Run: node legegruppe/tests/generate.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../js/model.js');
import { generateClass, PROFILES } from './generate.mjs';

// --- deterministic from the seed alone ---
const a = generateClass({ seed: 123, childCount: 24 });
const b = generateClass({ seed: 123, childCount: 24 });
assert.deepEqual(a, b);
assert.notDeepEqual(a, generateClass({ seed: 124, childCount: 24 }));

// --- shape ---
assert.equal(a.children.length, 24);
assert.equal(a.families.length, 24);
assert.equal(a.groupSizeMin, 4);
assert.equal(a.groupSizeMax, 5);
assert.ok(a.weeks.length >= 6);

// --- it builds into a valid problem ---
const p = M.buildProblem(a);
assert.equal(p.children.length, 24);
assert.ok(p.familyOf('k0'));

// --- every named profile produces a class ---
Object.keys(PROFILES).forEach(name => {
  const cls = generateClass({ seed: 7, childCount: 24, profile: name });
  assert.equal(cls.children.length, 24, name);
  assert.equal(cls.families.length, 24, name);
  cls.families.forEach(f => {
    assert.ok(f.hostCapacity >= 0 && f.hostCapacity <= 3, name);
    assert.ok(f.fetchCapacity >= 0 && f.fetchCapacity <= 5, name);
    assert.ok(Array.isArray(f.availableWeekdays), name);
  });
});

// --- the adversarial profiles really are adversarial ---
const thursday = generateClass({ seed: 1, childCount: 24, profile: 'onlyThursday' });
thursday.families.forEach(f => assert.deepEqual(f.availableWeekdays, [4]));

const noDrivers = generateClass({ seed: 1, childCount: 24, profile: 'noDrivers' });
const canFetch = noDrivers.families.filter(f => f.fetchCapacity > 0).length;
assert.ok(canFetch <= 2, 'noDrivers should leave at most two fetching families');

const noHosts = generateClass({ seed: 1, childCount: 24, profile: 'fewHosts' });
assert.ok(noHosts.families.filter(f => f.hostCapacity > 0).length <= 12);

// --- history can be seeded from previous rounds ---
const withHistory = generateClass({ seed: 5, childCount: 24, previousRounds: 2 });
assert.ok(withHistory.history.length > 0);
withHistory.history.forEach(h => {
  assert.ok(typeof h.childA === 'string' && typeof h.childB === 'string');
  assert.notEqual(h.childA, h.childB);
});

// --- blocked pairs can be injected ---
const withBlocks = generateClass({ seed: 5, childCount: 24, blockedPairCount: 3 });
assert.equal(withBlocks.blockedPairs.length, 3);
withBlocks.blockedPairs.forEach(pair => assert.notEqual(pair[0], pair[1]));

console.log('ok - generate');
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node legegruppe/tests/generate.test.mjs
```

Expected: fails with `Cannot find module './generate.mjs'`.

- [ ] **Step 3: Write the implementation**

Create `legegruppe/tests/generate.mjs`:

```js
/* Seeded synthetic class generator for the simulation harness. ESM. */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../js/model.js');

const NAMES = ['Alma', 'Bo', 'Carla', 'Dagmar', 'Emil', 'Freja', 'Gustav', 'Hannah',
  'Ida', 'Jonas', 'Karla', 'Lucas', 'Malou', 'Noah', 'Olivia', 'Pelle', 'Quinn',
  'Rosa', 'Storm', 'Tilde', 'Ursula', 'Villads', 'William', 'Xenia', 'Yrsa', 'Zakarias',
  'Astrid', 'Birk', 'Clara', 'Dicte', 'Elliot', 'Filippa', 'Gry', 'Halfdan', 'Iben',
  'Jens', 'Kaya', 'Liva', 'Merle', 'Nanna'];

const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];

/** Draw from a weighted distribution given as [[value, weight], ...]. */
function weighted(rand, pairs) {
  const total = pairs.reduce((s, p) => s + p[1], 0);
  let roll = rand() * total;
  for (const [value, weight] of pairs) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return pairs[pairs.length - 1][0];
}

/**
 * A random subset of the working week.
 * Deliberately generous: H4 requires a weekday shared by EVERY family in a group,
 * so if each of five families were free on only half the week, almost no group
 * could ever meet and the simulation would measure nothing but its own generator.
 * Real parents can usually do most weekdays; the hostile profiles below are where
 * scarcity is tested on purpose.
 */
function someWeekdays(rand, minDays) {
  const days = [1, 2, 3, 4, 5].filter(() => rand() < 0.8);
  while (days.length < (minDays || 1)) {
    const d = 1 + Math.floor(rand() * 5);
    if (days.indexOf(d) === -1) days.push(d);
  }
  return days.sort((a, b) => a - b);
}

/**
 * Named parent-population profiles. `realistic` is the default and is modelled on
 * a normal Danish class; the rest exist to prove the app degrades gracefully.
 */
export const PROFILES = {
  realistic: (rand) => ({
    hostCapacity: weighted(rand, [[0, 15], [1, 30], [2, 40], [3, 15]]),
    maxChildrenAtHome: weighted(rand, [[0, 8], [2, 12], [3, 25], [4, 35], [5, 20]]),
    availableWeekdays: someWeekdays(rand, 3),
    fetchCapacity: weighted(rand, [[0, 20], [1, 15], [2, 25], [3, 25], [4, 15]]),
    meetingPlace: weighted(rand, [['home', 70], ['both', 20], ['outdoor', 10]])
  }),
  generous: (rand) => ({
    hostCapacity: weighted(rand, [[2, 40], [3, 60]]),
    maxChildrenAtHome: weighted(rand, [[4, 40], [5, 60]]),
    availableWeekdays: someWeekdays(rand, 3),
    fetchCapacity: weighted(rand, [[3, 40], [4, 60]]),
    meetingPlace: 'both'
  }),
  strained: (rand) => ({
    hostCapacity: weighted(rand, [[0, 45], [1, 40], [2, 15]]),
    maxChildrenAtHome: weighted(rand, [[0, 30], [2, 30], [3, 25], [4, 15]]),
    availableWeekdays: someWeekdays(rand, 1),
    fetchCapacity: weighted(rand, [[0, 40], [1, 25], [2, 25], [3, 10]]),
    meetingPlace: weighted(rand, [['home', 60], ['both', 25], ['outdoor', 15]])
  }),
  onlyThursday: (rand) => ({
    hostCapacity: weighted(rand, [[1, 50], [2, 50]]),
    maxChildrenAtHome: 4,
    availableWeekdays: [4],
    fetchCapacity: weighted(rand, [[2, 50], [3, 50]]),
    meetingPlace: 'home'
  }),
  noDrivers: (rand, i) => ({
    hostCapacity: weighted(rand, [[1, 50], [2, 50]]),
    maxChildrenAtHome: 4,
    availableWeekdays: someWeekdays(rand, 2),
    fetchCapacity: i < 2 ? 4 : 0,
    meetingPlace: 'home'
  }),
  fewHosts: (rand, i) => ({
    hostCapacity: i < 6 ? 3 : 0,
    maxChildrenAtHome: i < 6 ? 5 : 0,
    availableWeekdays: someWeekdays(rand, 2),
    fetchCapacity: weighted(rand, [[2, 50], [3, 50]]),
    meetingPlace: 'home'
  })
};

/**
 * Generate a class. Returns a plain object ready for Model.buildProblem().
 * options: { seed, childCount, profile, previousRounds, blockedPairCount,
 *            weeks, meetingsPerGroup }
 */
export function generateClass(options) {
  const opts = options || {};
  const rand = M.rng(opts.seed || 1);
  const count = opts.childCount || 24;
  const profileName = opts.profile || 'realistic';
  const profile = PROFILES[profileName] || PROFILES.realistic;

  const children = [], families = [];
  for (let i = 0; i < count; i++) {
    const traits = profile(rand, i);
    children.push({
      childId: 'k' + i,
      familyId: 'f' + i,
      name: NAMES[i % NAMES.length] + (i >= NAMES.length ? ' ' + i : '')
    });
    families.push(Object.assign({
      familyId: 'f' + i,
      classId: 'sim',
      parentName: 'Forælder ' + i,
      contact: 'f' + i + '@example.dk',
      consentAt: '2026-08-01T09:00:00Z',
      blackoutWeeks: rand() < 0.25 ? [42, 43] : [],
      note: ''
    }, traits));
  }

  // History: simulate previous rounds by partitioning the class at random.
  const history = [];
  for (let round = 0; round < (opts.previousRounds || 0); round++) {
    const order = children.map(c => c.childId);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    for (let start = 0; start + 4 <= order.length; start += 4) {
      const group = order.slice(start, start + 4);
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++)
          history.push({ childA: group[i], childB: group[j] });
    }
  }

  const blockedPairs = [];
  const used = new Set();
  while (blockedPairs.length < (opts.blockedPairCount || 0)) {
    const a = pick(rand, children).childId;
    const b = pick(rand, children).childId;
    if (a === b) continue;
    const key = M.pairKey(a, b);
    if (used.has(key)) continue;
    used.add(key);
    blockedPairs.push([a, b]);
  }

  return {
    classId: 'sim',
    profile: profileName,
    seed: opts.seed || 1,
    children: children,
    families: families,
    blockedPairs: blockedPairs,
    history: history,
    groupSizeMin: 4,
    groupSizeMax: 5,
    weeks: opts.weeks || [34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45],
    meetingsPerGroup: opts.meetingsPerGroup || 6
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node legegruppe/tests/generate.test.mjs
```

Expected: `ok - generate`

- [ ] **Step 5: Commit**

```bash
git add legegruppe/tests/generate.mjs legegruppe/tests/generate.test.mjs
git commit -m "test: seeded synthetic class generator for legegruppe simulations"
```

---

## Task 10: The 1000-simulation acceptance run

**Files:**
- Create: `legegruppe/tests/simulate.mjs`
- Create: `legegruppe/tests/acceptance.test.mjs`

This is the gate the whole project is judged against. It runs 1000 synthetic 24-child classes through both solvers and enforces the thresholds from spec §14. It prints distributions, not just pass/fail, so the scoring weights can be calibrated against real numbers rather than intuition.

Note on runtime: the exact solver is the slow half. Run it on a stratified subsample (every 5th simulation, 200 runs) so the whole suite finishes in minutes rather than an hour, while the heuristic runs on all 1000. This is stated in the report so nobody mistakes the sample size.

- [ ] **Step 1: Write the failing acceptance test**

Create `legegruppe/tests/acceptance.test.mjs`:

```js
/* Run: node legegruppe/tests/acceptance.test.mjs
   The full gate. Slower than the unit tests - expect a few minutes. */
import assert from 'node:assert/strict';
import { runSimulations, THRESHOLDS } from './simulate.mjs';

const report = runSimulations({ count: 1000, childCount: 24, exactEvery: 5, quiet: false });

// --- the run itself ---
assert.equal(report.total, 1000);
assert.ok(report.exactRuns >= 190 && report.exactRuns <= 210);

// --- ZERO hard-constraint violations. Non-negotiable, both solvers. ---
assert.equal(report.hardViolations.heuristic, 0,
  'heuristic produced invalid solutions: ' + JSON.stringify(report.failures.slice(0, 3)));
assert.equal(report.hardViolations.exact, 0,
  'exact produced invalid solutions: ' + JSON.stringify(report.failures.slice(0, 3)));

// --- every run ends in a solution or an actionable explanation. Never neither. ---
assert.equal(report.unexplained, 0,
  'runs that neither solved nor explained themselves: ' + JSON.stringify(report.failures.slice(0, 3)));

// --- determinism ---
assert.equal(report.nondeterministic, 0, 'same seed must give the same answer');

// --- runtime ---
assert.ok(report.runtime.heuristic.median < THRESHOLDS.heuristicMedianMs,
  'heuristic median ' + report.runtime.heuristic.median + 'ms');
assert.ok(report.runtime.heuristic.p99 < THRESHOLDS.heuristicP99Ms,
  'heuristic p99 ' + report.runtime.heuristic.p99 + 'ms');
assert.ok(report.runtime.exact.median < THRESHOLDS.exactMedianMs,
  'exact median ' + report.runtime.exact.median + 'ms');

// --- the heuristic tracks the proven optimum closely ---
assert.ok(report.qualityWithin5pct >= THRESHOLDS.qualityWithin5pct,
  'heuristic was within 5% of optimum in only ' +
  (report.qualityWithin5pct * 100).toFixed(1) + '% of comparable runs');

// --- nobody is ever scheduled beyond their declared capacity ---
assert.equal(report.capacityBreaches, 0,
  'families scheduled to host more often than they said they could');

console.log(report.text);
console.log('ok - acceptance (1000 simulations)');
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node legegruppe/tests/acceptance.test.mjs
```

Expected: fails with `Cannot find module './simulate.mjs'`.

- [ ] **Step 3: Write the harness**

Create `legegruppe/tests/simulate.mjs`:

```js
/* The 1000-simulation acceptance harness. ESM.
   Standalone: node legegruppe/tests/simulate.mjs [count] */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../js/model.js');
const C = require('../js/constraints.js');
const Solve = require('../js/solvers/index.js');
import { generateClass, PROFILES } from './generate.mjs';

export const THRESHOLDS = {
  heuristicMedianMs: 500,
  heuristicP99Ms: 2000,
  exactMedianMs: 5000,
  qualityWithin5pct: 0.90
};

/** Profile mix: mostly realistic classes, with a steady diet of hostile ones. */
const MIX = [
  ['realistic', 60], ['strained', 15], ['generous', 10],
  ['onlyThursday', 5], ['noDrivers', 5], ['fewHosts', 5]
];

function profileFor(index) {
  const total = MIX.reduce((s, m) => s + m[1], 0);
  let slot = (index * 7919) % total;   // deterministic spread across the mix
  for (const [name, weight] of MIX) {
    slot -= weight;
    if (slot < 0) return name;
  }
  return 'realistic';
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

function stats(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return {
    n: sorted.length,
    median: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    p99: percentile(sorted, 0.99),
    max: sorted.length ? sorted[sorted.length - 1] : 0
  };
}

/** Did the rota schedule anybody beyond their own declared host capacity? */
function capacityBreaches(result, problem) {
  if (!result.rota) return 0;
  const counts = {};
  result.rota.groups.forEach(g => g.meetings.forEach(m => {
    counts[m.hostFamilyId] = (counts[m.hostFamilyId] || 0) + 1;
  }));
  let breaches = 0;
  Object.keys(counts).forEach(fid => {
    const family = problem.familyById(fid);
    if (family && counts[fid] > family.hostCapacity) breaches++;
  });
  return breaches;
}

/** A result is acceptable if it solved, or explained itself in actionable Danish. */
function isExplained(result) {
  if (result.status === 'ok') return true;
  if (result.status !== 'infeasible') return false;
  const d = result.diagnosis;
  return Boolean(d && typeof d.summary === 'string' && d.summary.length > 20);
}

export function runSimulations(options) {
  const opts = options || {};
  const count = opts.count || 1000;
  const childCount = opts.childCount || 24;
  const exactEvery = opts.exactEvery || 5;

  const report = {
    total: count, exactRuns: 0,
    solved: { heuristic: 0, exact: 0 },
    infeasible: { heuristic: 0, exact: 0 },
    hardViolations: { heuristic: 0, exact: 0 },
    unexplained: 0, nondeterministic: 0, capacityBreaches: 0, exactTimeouts: 0,
    runtime: { heuristic: [], exact: [] },
    scores: { heuristic: [], exact: [] },
    qualityGaps: [], qualityWithin5pct: 0,
    byProfile: {}, failures: [], text: ''
  };

  Object.keys(PROFILES).forEach(name => {
    report.byProfile[name] = { runs: 0, solved: 0, infeasible: 0 };
  });

  const note = (seed, profile, what) => {
    if (report.failures.length < 20) report.failures.push({ seed, profile, what });
  };

  for (let i = 0; i < count; i++) {
    const seed = 1000 + i;
    const profile = profileFor(i);
    const input = generateClass({
      seed: seed, childCount: childCount, profile: profile,
      previousRounds: i % 3, blockedPairCount: i % 4
    });
    const problem = M.buildProblem(input);
    const bucket = report.byProfile[profile];
    bucket.runs++;

    // --- solver A ---
    const h = Solve.solve(problem, { solver: 'heuristic', seed: 1, timeBudgetMs: 300 });
    report.runtime.heuristic.push(h.meta.runtimeMs);
    if (h.status === 'ok') {
      report.solved.heuristic++;
      bucket.solved++;
      report.scores.heuristic.push(h.score.total);
      const violations = C.verifySolution(h, problem);
      if (violations.length > 0) {
        report.hardViolations.heuristic++;
        note(seed, profile, 'heuristic violated: ' + violations[0].code);
      }
      const breaches = capacityBreaches(h, problem);
      if (breaches > 0) {
        report.capacityBreaches += breaches;
        note(seed, profile, 'rota exceeded declared host capacity');
      }
    } else {
      report.infeasible.heuristic++;
      bucket.infeasible++;
    }
    if (!isExplained(h)) {
      report.unexplained++;
      note(seed, profile, 'heuristic neither solved nor explained');
    }

    // --- determinism, checked on every tenth run ---
    if (i % 10 === 0) {
      const again = Solve.solve(problem, { solver: 'heuristic', seed: 1, timeBudgetMs: 300 });
      const same = JSON.stringify(again.groups.map(g => g.childIds)) ===
        JSON.stringify(h.groups.map(g => g.childIds));
      if (!same) {
        report.nondeterministic++;
        note(seed, profile, 'heuristic was not deterministic');
      }
    }

    // --- solver B, on a subsample ---
    if (i % exactEvery === 0) {
      report.exactRuns++;
      // 15s: the exact solver proves a 24-child class in ~4s median, but a hard
      // instance can take three or four times that. Timeouts are counted, not hidden.
      const e = Solve.solve(problem, { solver: 'exact', seed: 1, timeBudgetMs: 15000 });
      report.runtime.exact.push(e.meta.runtimeMs);
      if ((e.blockers || []).some(b => b.code === 'TIMEOUT')) report.exactTimeouts++;
      if (e.status === 'ok') {
        report.solved.exact++;
        report.scores.exact.push(e.score.total);
        const violations = C.verifySolution(e, problem);
        if (violations.length > 0) {
          report.hardViolations.exact++;
          note(seed, profile, 'exact violated: ' + violations[0].code);
        }
        if (h.status === 'ok' && e.score.total > 0) {
          const gap = (e.score.total - h.score.total) / e.score.total;
          report.qualityGaps.push(gap);
        }
      } else {
        report.infeasible.exact++;
      }
      if (!isExplained(e)) {
        report.unexplained++;
        note(seed, profile, 'exact neither solved nor explained');
      }
    }

    if (!opts.quiet && (i + 1) % 100 === 0) {
      process.stdout.write('  ' + (i + 1) + '/' + count + ' simulationer\n');
    }
  }

  report.runtime.heuristic = stats(report.runtime.heuristic);
  report.runtime.exact = stats(report.runtime.exact);
  const within = report.qualityGaps.filter(g => g <= 0.05).length;
  report.qualityWithin5pct = report.qualityGaps.length ? within / report.qualityGaps.length : 1;

  const meanScore = list => list.length
    ? (list.reduce((a, b) => a + b, 0) / list.length).toFixed(3) : 'n/a';

  const lines = [];
  lines.push('');
  lines.push('=== Legegruppe: ' + count + ' simulationer à ' + childCount + ' børn ===');
  lines.push('Løser A kørt på alle ' + count + '. Løser B kørt på hver ' + exactEvery +
    '. (' + report.exactRuns + ' kørsler).');
  lines.push('');
  lines.push('Løsninger fundet    A: ' + report.solved.heuristic + '/' + count +
    '   B: ' + report.solved.exact + '/' + report.exactRuns);
  lines.push('Uløselige           A: ' + report.infeasible.heuristic +
    '   B: ' + report.infeasible.exact);
  lines.push('Brud på hårde krav  A: ' + report.hardViolations.heuristic +
    '   B: ' + report.hardViolations.exact + '   (krav: 0)');
  lines.push('Uden forklaring     ' + report.unexplained + '   (krav: 0)');
  lines.push('Ikke-deterministisk ' + report.nondeterministic + '   (krav: 0)');
  lines.push('Kapacitetsbrud      ' + report.capacityBreaches + '   (krav: 0)');
  lines.push('B løb tør for tid   ' + report.exactTimeouts + '/' + report.exactRuns +
    '   (tilladt — rapporteres ærligt som timeout, ikke som uløselig klasse)');
  lines.push('');
  lines.push('Køretid A (ms)      median ' + report.runtime.heuristic.median +
    '  p90 ' + report.runtime.heuristic.p90 +
    '  p99 ' + report.runtime.heuristic.p99 +
    '  max ' + report.runtime.heuristic.max);
  lines.push('Køretid B (ms)      median ' + report.runtime.exact.median +
    '  p90 ' + report.runtime.exact.p90 +
    '  max ' + report.runtime.exact.max);
  lines.push('');
  lines.push('Score A (middel)    ' + meanScore(report.scores.heuristic));
  lines.push('Score B (middel)    ' + meanScore(report.scores.exact));
  lines.push('A inden for 5% af B ' + (report.qualityWithin5pct * 100).toFixed(1) +
    '%   (krav: ' + (THRESHOLDS.qualityWithin5pct * 100) + '%)');
  lines.push('');
  lines.push('Per profil:');
  Object.keys(report.byProfile).forEach(name => {
    const b = report.byProfile[name];
    if (b.runs === 0) return;
    lines.push('  ' + name.padEnd(14) + b.runs + ' kørsler, ' +
      b.solved + ' løst, ' + b.infeasible + ' uløselige');
  });
  if (report.failures.length) {
    lines.push('');
    lines.push('Første fejl (reproducér med seed):');
    report.failures.slice(0, 10).forEach(f =>
      lines.push('  seed ' + f.seed + ' [' + f.profile + '] ' + f.what));
  }
  lines.push('');
  report.text = lines.join('\n');
  return report;
}

// Standalone invocation prints the report and exits non-zero on any breach.
if (import.meta.url === 'file://' + process.argv[1].replace(/\\/g, '/')) {
  const count = parseInt(process.argv[2], 10) || 1000;
  const report = runSimulations({ count: count });
  console.log(report.text);
  const failed = report.hardViolations.heuristic + report.hardViolations.exact +
    report.unexplained + report.nondeterministic + report.capacityBreaches;
  process.exit(failed > 0 ? 1 : 0);
}
```

- [ ] **Step 4: Run a short version first**

```bash
node legegruppe/tests/simulate.mjs 50
```

Expected: a printed report with `Brud på hårde krav  A: 0   B: 0` and exit code 0. Fix any breach before continuing — a violation at 50 simulations is a real bug, not noise.

- [ ] **Step 5: Run the full acceptance gate**

```bash
node legegruppe/tests/acceptance.test.mjs
```

Expected: the full report followed by `ok - acceptance (1000 simulations)`.

If `qualityWithin5pct` falls short, tune the annealing schedule in `heuristic.js` (starting temperature `0.15`, decay `0.92` every 200 iterations) or raise the default `timeBudgetMs`. Do **not** relax the threshold in the test.

If `infeasible` counts are high for the `realistic` profile, that is a signal the generator is too harsh, not that the solver is broken — check a failing seed by hand with `generateClass({ seed, childCount: 24, profile: 'realistic' })` before changing solver code.

- [ ] **Step 6: Add a runner script for all tests**

Create `legegruppe/tests/run-all.sh`:

```bash
#!/usr/bin/env bash
# Run every legegruppe test. Usage: bash legegruppe/tests/run-all.sh [--full]
set -e
cd "$(dirname "$0")/../.."
for t in model constraints scoring heuristic exact rota infeasibility solve generate; do
  node "legegruppe/tests/$t.test.mjs"
done
if [ "$1" = "--full" ]; then
  node legegruppe/tests/acceptance.test.mjs
else
  node legegruppe/tests/simulate.mjs 50 > /dev/null && echo "ok - simulate (50, smoke)"
fi
echo "All legegruppe tests passed."
```

Run it:

```bash
bash legegruppe/tests/run-all.sh
```

Expected: nine `ok - …` lines, then `ok - simulate (50, smoke)` and `All legegruppe tests passed.`

- [ ] **Step 7: Commit**

```bash
git add legegruppe/tests/simulate.mjs legegruppe/tests/acceptance.test.mjs legegruppe/tests/run-all.sh
git commit -m "test: 1000-simulation acceptance gate for legegruppe solvers"
```

---

## Task 11: Apps Script backend

**Files:**
- Create: `legegruppe/apps-script/Code.gs`
- Create: `legegruppe/SETUP.md`

The backend lives in Google's editor but the source is version-controlled here, so it can be reviewed and restored. It follows the same shape as the existing `Apps-Script-Setup.md`: a single `doPost` with an action switch, a shared passphrase for admin actions, and per-family tokens for parents.

Security notes that must survive into the implementation: a parent token grants access to **exactly one** family row and nothing else; the admin passphrase is never sent from the parent pages; and `blocked_pairs` is only ever readable by an admin-authenticated call.

- [ ] **Step 1: Write the backend**

Create `legegruppe/apps-script/Code.gs`:

```javascript
// ==========================================
// Legegruppe backend. Deploy as a Web App:
//   Execute as: Me    Who has access: Anyone
// ==========================================
const SPREADSHEET_ID = "YOUR_SPREADSHEET_ID_HERE";
const ADMIN_PASSPHRASE = "YOUR_ADMIN_PASSPHRASE_HERE";
const CLASS_ID = "klasse-2b";   // one class for now; every row carries it

const SHEETS = {
  families: ["class_id", "family_id", "token", "parent_name", "contact",
    "host_capacity", "max_children_at_home", "available_weekdays", "fetch_capacity",
    "meeting_place", "blackout_weeks", "note", "consent_at", "updated_at"],
  children: ["class_id", "child_id", "family_id", "name"],
  rounds: ["class_id", "round_id", "status", "weeks", "meetings_per_group",
    "group_size_min", "group_size_max", "solver", "weights", "result_json",
    "created_at", "published_at"],
  pairs_history: ["class_id", "child_a", "child_b", "round_id"],
  blocked_pairs: ["class_id", "child_a", "child_b", "note"]
};

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sheet_(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(SHEETS[name]);
  }
  return sh;
}

/** All rows of a sheet for this class, as objects keyed by header. */
function rows_(name) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  const out = [];
  for (let r = 1; r < values.length; r++) {
    const obj = {};
    headers.forEach((h, c) => { obj[h] = values[r][c]; });
    if (String(obj.class_id) === CLASS_ID) { obj._row = r + 1; out.push(obj); }
  }
  return out;
}

function newToken_() {
  return Utilities.getUuid().replace(/-/g, "").slice(0, 20);
}

function isAdmin_(payload) {
  return payload && payload.passphrase === ADMIN_PASSPHRASE;
}

/** Everything a parent may see: no contacts of others until a round is published. */
function publicFamily_(row) {
  return {
    familyId: row.family_id, parentName: row.parent_name,
    hostCapacity: row.host_capacity, maxChildrenAtHome: row.max_children_at_home,
    availableWeekdays: String(row.available_weekdays || "").split(",").filter(String),
    fetchCapacity: row.fetch_capacity, meetingPlace: row.meeting_place,
    blackoutWeeks: String(row.blackout_weeks || ""), note: row.note,
    consentAt: row.consent_at, updatedAt: row.updated_at
  };
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = String(payload.action || "");

    // ---------- parent actions, authorised by token ----------
    if (action === "getFamily") {
      const match = rows_("families").filter(r => r.token === payload.token)[0];
      if (!match) return json_({ ok: false, error: "Ukendt link. Bed administratoren om et nyt." });
      const kids = rows_("children").filter(c => c.family_id === match.family_id)
        .map(c => ({ childId: c.child_id, name: c.name }));
      return json_({ ok: true, family: publicFamily_(match), children: kids });
    }

    if (action === "saveFamily") {
      const sh = sheet_("families");
      const match = rows_("families").filter(r => r.token === payload.token)[0];
      if (!match) return json_({ ok: false, error: "Ukendt link. Bed administratoren om et nyt." });
      const f = payload.family || {};
      const now = new Date().toISOString();
      const values = [CLASS_ID, match.family_id, match.token,
        f.parentName || match.parent_name, f.contact || match.contact,
        f.hostCapacity, f.maxChildrenAtHome,
        (f.availableWeekdays || []).join(","), f.fetchCapacity,
        f.meetingPlace, f.blackoutWeeks || "", f.note || "",
        match.consent_at || now, now];
      sh.getRange(match._row, 1, 1, values.length).setValues([values]);
      return json_({ ok: true, updatedAt: now });
    }

    if (action === "getPlan") {
      const match = rows_("families").filter(r => r.token === payload.token)[0];
      if (!match) return json_({ ok: false, error: "Ukendt link." });
      const published = rows_("rounds").filter(r => r.status === "published")
        .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)))[0];
      if (!published) return json_({ ok: true, round: null });
      // Contacts are shared only once a round is live, and only within the class.
      const contacts = {};
      rows_("families").forEach(r => { contacts[r.family_id] =
        { parentName: r.parent_name, contact: r.contact }; });
      return json_({
        ok: true, familyId: match.family_id,
        round: JSON.parse(published.result_json), contacts: contacts,
        children: rows_("children").map(c =>
          ({ childId: c.child_id, familyId: c.family_id, name: c.name }))
      });
    }

    // ---------- admin actions, authorised by passphrase ----------
    if (!isAdmin_(payload)) return json_({ ok: false, error: "Ikke autoriseret." });

    if (action === "adminSnapshot") {
      return json_({
        ok: true, classId: CLASS_ID,
        families: rows_("families").map(r => Object.assign(publicFamily_(r),
          { contact: r.contact, token: r.token })),
        children: rows_("children").map(c =>
          ({ childId: c.child_id, familyId: c.family_id, name: c.name })),
        blockedPairs: rows_("blocked_pairs").map(b => [b.child_a, b.child_b]),
        history: rows_("pairs_history").map(h =>
          ({ childA: h.child_a, childB: h.child_b, roundId: h.round_id })),
        rounds: rows_("rounds").map(r =>
          ({ roundId: r.round_id, status: r.status, publishedAt: r.published_at }))
      });
    }

    if (action === "addFamily") {
      const token = newToken_();
      const familyId = "f" + Date.now().toString(36);
      sheet_("families").appendRow([CLASS_ID, familyId, token,
        payload.parentName || "", payload.contact || "", 0, 0, "", 0, "home", "", "", "", ""]);
      (payload.childNames || []).forEach((name, i) => {
        sheet_("children").appendRow([CLASS_ID, familyId + "-c" + i, familyId, name]);
      });
      return json_({ ok: true, familyId: familyId, token: token });
    }

    if (action === "setBlockedPairs") {
      const sh = sheet_("blocked_pairs");
      const last = sh.getLastRow();
      if (last > 1) sh.deleteRows(2, last - 1);
      (payload.pairs || []).forEach(p =>
        sh.appendRow([CLASS_ID, p[0], p[1], p[2] || ""]));
      return json_({ ok: true, count: (payload.pairs || []).length });
    }

    if (action === "publishRound") {
      const roundId = "r" + Date.now().toString(36);
      const now = new Date().toISOString();
      sheet_("rounds").appendRow([CLASS_ID, roundId, "published",
        (payload.weeks || []).join(","), payload.meetingsPerGroup,
        payload.groupSizeMin, payload.groupSizeMax, payload.solver,
        JSON.stringify(payload.weights || {}), JSON.stringify(payload.result || {}),
        now, now]);
      // Freeze the pairings so the next round can mix afresh.
      const ph = sheet_("pairs_history");
      (payload.result.groups || []).forEach(g => {
        for (let i = 0; i < g.childIds.length; i++)
          for (let j = i + 1; j < g.childIds.length; j++)
            ph.appendRow([CLASS_ID, g.childIds[i], g.childIds[j], roundId]);
      });
      return json_({ ok: true, roundId: roundId });
    }

    if (action === "deleteAll") {
      if (payload.confirm !== "SLET ALT") {
        return json_({ ok: false, error: 'Skriv "SLET ALT" for at bekræfte.' });
      }
      Object.keys(SHEETS).forEach(name => {
        const sh = sheet_(name);
        const last = sh.getLastRow();
        if (last > 1) sh.deleteRows(2, last - 1);
      });
      return json_({ ok: true });
    }

    return json_({ ok: false, error: "Ukendt handling: " + action });
  } catch (err) {
    return json_({ ok: false, error: "Serverfejl: " + err.message });
  }
}

function doGet() {
  return ContentService.createTextOutput("Legegruppe backend kører.");
}
```

- [ ] **Step 2: Write the setup guide**

Create `legegruppe/SETUP.md` following the structure of the repo's existing `Apps-Script-Setup.md`. It must cover, in order:

1. Create a Google Sheet named "Legegruppe" and copy its ID from the URL.
2. Create an Apps Script project, paste `apps-script/Code.gs`, fill in `SPREADSHEET_ID`, `ADMIN_PASSPHRASE` and `CLASS_ID`.
3. Deploy → New deployment → Web app → Execute as **Me**, Who has access **Anyone**. Copy the `/exec` URL.
4. Paste that URL into `legegruppe/js/api.js` as `ENDPOINT`.
5. Run the `adminSnapshot` action once from the admin page to let the script create all five sheets with headers.
6. Add each family via the admin page; copy the generated parent links into Aula.
7. A warning that the passphrase lives in the Apps Script project, never in this repo, and must not be committed.

- [ ] **Step 3: Verify by hand**

Deploy, then from a terminal:

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"action":"adminSnapshot","passphrase":"YOUR_ADMIN_PASSPHRASE_HERE"}' \
  "https://script.google.com/macros/s/YOUR_DEPLOYMENT/exec"
```

Expected: `{"ok":true,"classId":"klasse-2b","families":[],...}` and five sheets created in the spreadsheet.

Then confirm that an unauthenticated call is rejected:

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"action":"adminSnapshot"}' \
  "https://script.google.com/macros/s/YOUR_DEPLOYMENT/exec"
```

Expected: `{"ok":false,"error":"Ikke autoriseret."}`

- [ ] **Step 4: Commit**

```bash
git add legegruppe/apps-script/Code.gs legegruppe/SETUP.md
git commit -m "feat: legegruppe Apps Script backend and setup guide"
```

---

## Task 12: API client

**Files:**
- Create: `legegruppe/js/api.js`
- Test: `legegruppe/tests/api.test.mjs`

Thin wrapper over `fetch` with two behaviours that matter: retry with backoff, and a local draft queue so a parent never loses two minutes of typing because Apps Script was briefly unreachable.

- [ ] **Step 1: Write the failing test**

Create `legegruppe/tests/api.test.mjs`:

```js
/* Run: node legegruppe/tests/api.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Api = require('../js/api.js');

/** In-memory stand-ins for fetch and localStorage. */
function fakeStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    _map: map
  };
}

// --- a successful call returns the parsed payload ---
let calls = 0;
const okClient = Api.createClient({
  endpoint: 'https://example.test/exec',
  storage: fakeStorage(),
  sleep: () => Promise.resolve(),
  fetchImpl: () => {
    calls++;
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, family: { familyId: 'f1' } }) });
  }
});
const result = await okClient.call('getFamily', { token: 't' });
assert.equal(result.family.familyId, 'f1');
assert.equal(calls, 1);

// --- transient failures are retried, then succeed ---
let attempts = 0;
const flaky = Api.createClient({
  endpoint: 'https://example.test/exec',
  storage: fakeStorage(),
  sleep: () => Promise.resolve(),
  fetchImpl: () => {
    attempts++;
    if (attempts < 3) return Promise.reject(new Error('network down'));
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, value: 42 }) });
  }
});
assert.equal((await flaky.call('getFamily', {})).value, 42);
assert.equal(attempts, 3);

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

// --- server-side {ok:false} becomes a rejection carrying the server's own text ---
const refuses = Api.createClient({
  endpoint: 'https://example.test/exec',
  storage: fakeStorage(),
  sleep: () => Promise.resolve(),
  fetchImpl: () => Promise.resolve({ ok: true,
    json: () => Promise.resolve({ ok: false, error: 'Ukendt link.' }) })
});
let refused = null;
try { await refuses.call('getFamily', {}); } catch (err) { refused = err; }
assert.equal(refused.message, 'Ukendt link.');

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

// --- a queued save is retried on demand and cleared once it lands ---
const queueStorage = fakeStorage();
let queueAttempts = 0;
const queued = Api.createClient({
  endpoint: 'https://example.test/exec', storage: queueStorage,
  sleep: () => Promise.resolve(),
  fetchImpl: () => {
    queueAttempts++;
    if (queueAttempts <= 3) return Promise.reject(new Error('offline'));
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
  }
});
try { await queued.saveFamily('t2', { hostCapacity: 1 }); } catch (err) { /* expected */ }
assert.deepEqual(queued.loadDraft('t2'), { hostCapacity: 1 }, 'a failed save must leave a draft');
await queued.flushDraft('t2');
assert.equal(queued.loadDraft('t2'), null, 'a successful flush clears the draft');

console.log('ok - api');
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node legegruppe/tests/api.test.mjs
```

Expected: fails with `Cannot find module '../js/api.js'`.

- [ ] **Step 3: Write the implementation**

Create `legegruppe/js/api.js`:

```js
/* Apps Script client: retry with backoff plus a local draft queue.
   Browser: window.LG.Api   Node: require('./api.js') */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LG = Object.assign(root.LG || {}, { Api: factory() });
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Filled in during setup, see legegruppe/SETUP.md step 4.
  const ENDPOINT = 'https://script.google.com/macros/s/REPLACE_ME/exec';

  const RETRIES = 3;
  const BASE_DELAY_MS = 400;
  const DRAFT_PREFIX = 'legegruppe.draft.';

  const NETWORK_MESSAGE =
    'Der er ingen forbindelse til serveren lige nu. Dine svar er gemt her på telefonen — prøv igen om lidt.';

  function createClient(config) {
    const cfg = config || {};
    const endpoint = cfg.endpoint || ENDPOINT;
    const doFetch = cfg.fetchImpl || (typeof fetch === 'function' ? fetch.bind(null) : null);
    const store = cfg.storage ||
      (typeof localStorage !== 'undefined' ? localStorage : null);
    const sleep = cfg.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));

    /** POST one action, retrying transient failures with exponential backoff. */
    async function call(action, payload) {
      if (!doFetch) throw new Error(NETWORK_MESSAGE);
      const body = JSON.stringify(Object.assign({ action: action }, payload || {}));
      let lastError = null;

      for (let attempt = 0; attempt < RETRIES; attempt++) {
        if (attempt > 0) await sleep(BASE_DELAY_MS * Math.pow(2, attempt - 1));
        try {
          // text/plain avoids a CORS preflight against Apps Script.
          const response = await doFetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: body
          });
          if (!response.ok) { lastError = new Error(NETWORK_MESSAGE); continue; }
          const data = await response.json();
          if (!data || data.ok !== true) {
            // A refusal from the server is final: retrying will not change it.
            throw new Error((data && data.error) || 'Serveren afviste anmodningen.');
          }
          return data;
        } catch (err) {
          if (err && err.message && !/forbindelse|netværk/i.test(err.message)
            && err.message !== NETWORK_MESSAGE && !/fetch|network|ECONN|offline|down/i.test(err.message)) {
            throw err; // a real server refusal, not a transport problem
          }
          lastError = err;
        }
      }
      throw new Error(NETWORK_MESSAGE);
    }

    function draftKey(token) { return DRAFT_PREFIX + token; }

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

    /** Save answers. On failure the draft is kept so nothing is lost. */
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
      publishRound: (passphrase, round) => call('publishRound',
        Object.assign({ passphrase: passphrase }, round)),
      deleteAll: (passphrase, confirm) => call('deleteAll', { passphrase, confirm })
    };
  }

  return { createClient, ENDPOINT, NETWORK_MESSAGE };
});
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node legegruppe/tests/api.test.mjs
```

Expected: `ok - api`

- [ ] **Step 5: Add it to the runner**

In `legegruppe/tests/run-all.sh`, add `api` to the loop list, after `generate`.

- [ ] **Step 6: Commit**

```bash
git add legegruppe/js/api.js legegruppe/tests/api.test.mjs legegruppe/tests/run-all.sh
git commit -m "feat: legegruppe API client with retry and local drafts"
```

---

## Task 13: Stylesheet

**Files:**
- Create: `legegruppe/css/legegruppe.css`

Inherits the site's tokens by importing `../../style.css`, then adds only what the app needs. Do not redefine `--paper`, `--ink`, `--accent` or the fonts — if the site's palette changes, this app must follow it automatically.

Mobile first: parents fill this in on a phone. Touch targets are at least 44 px. Focus states are visible, because the site already sets `:focus-visible` and this must not override it.

- [ ] **Step 1: Write the stylesheet**

Create `legegruppe/css/legegruppe.css`:

```css
/* Legegruppe — built on the site's design tokens. */
@import url('../../style.css');

:root {
  --lg-card-radius: 4px;
  --lg-field-gap: 20px;
  --lg-touch: 44px;
}

.lg-main { max-width: 720px; margin: 0 auto; padding: 32px var(--gutter) 96px; }
.lg-main--wide { max-width: 1080px; }

.lg-header { margin-bottom: 36px; }
.lg-header h1 { margin: 10px 0 12px; }
.lg-lede { font-size: 16px; color: var(--ink-2); max-width: 52ch; }

/* ── Form ──────────────────────────────────────────────────────────── */
.lg-field { margin-bottom: var(--lg-field-gap); padding-bottom: var(--lg-field-gap);
  border-bottom: 1px solid var(--rule); }
.lg-field:last-child { border-bottom: none; }
.lg-field > legend, .lg-label {
  font-family: 'Fraunces', Georgia, serif; font-size: 19px; font-weight: 500;
  line-height: 1.25; display: block; margin-bottom: 4px; color: var(--ink); }
.lg-help { font-size: 13px; color: var(--ink-3); margin-bottom: 12px; }
fieldset { border: none; padding: 0; margin: 0; }

/* Segmented choice — radios styled as pills */
.lg-choices { display: flex; flex-wrap: wrap; gap: 8px; }
.lg-choices input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.lg-choices label {
  min-height: var(--lg-touch); display: inline-flex; align-items: center;
  padding: 10px 18px; border: 1.5px solid var(--ink); border-radius: 999px;
  font-size: 14px; font-weight: 500; cursor: pointer; background: transparent;
  transition: background .2s ease, color .2s ease, border-color .2s ease; }
.lg-choices label:hover { border-color: var(--accent); color: var(--accent); }
.lg-choices input:checked + label { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.lg-choices input:focus-visible + label { outline: 2px solid var(--accent); outline-offset: 2px; }

input[type="text"], input[type="email"], textarea, select {
  width: 100%; min-height: var(--lg-touch); padding: 11px 14px;
  border: 1.5px solid var(--rule); border-radius: var(--lg-card-radius);
  background: var(--paper); color: var(--ink); font-family: inherit; font-size: 15px; }
input:focus, textarea:focus, select:focus { border-color: var(--accent); outline: none; }
textarea { min-height: 88px; resize: vertical; }

.lg-details { border-top: 1px solid var(--rule); padding-top: 20px; margin-top: 8px; }
.lg-details summary { cursor: pointer; font-size: 14px; font-weight: 600;
  min-height: var(--lg-touch); display: flex; align-items: center; }
.lg-details summary:hover { color: var(--accent); }

.lg-actions { position: sticky; bottom: 0; background: var(--paper);
  border-top: 1px solid var(--rule); padding: 16px 0; display: flex;
  gap: 12px; align-items: center; flex-wrap: wrap; }

/* ── Status messages ───────────────────────────────────────────────── */
.lg-status { padding: 14px 16px; border-radius: var(--lg-card-radius);
  border-left: 3px solid var(--ink-3); background: var(--paper-2);
  font-size: 14px; margin: 16px 0; }
.lg-status--error { border-left-color: var(--accent); }
.lg-status--ok { border-left-color: var(--ochre); }
.lg-status[hidden] { display: none; }

/* ── Group cards ───────────────────────────────────────────────────── */
.lg-groups { display: grid; gap: 20px; grid-template-columns: 1fr; }
@media (min-width: 720px) { .lg-groups { grid-template-columns: repeat(2, 1fr); } }

.lg-group { border: 1px solid var(--rule); border-radius: var(--lg-card-radius);
  padding: 22px; background: var(--paper); }
.lg-group--mine { border-color: var(--accent); border-width: 1.5px; }
.lg-group h3 { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 500; margin-bottom: 4px; }
.lg-group-tag { font-family: 'JetBrains Mono', monospace; font-size: 11px;
  letter-spacing: 2px; text-transform: uppercase; color: var(--accent); }
.lg-kids { display: flex; flex-wrap: wrap; gap: 6px; margin: 14px 0; }
.lg-kid { font-size: 13px; padding: 5px 12px; border-radius: 999px;
  background: var(--paper-2); border: 1px solid var(--rule); }
.lg-kid--mine { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.lg-why { font-size: 13px; color: var(--ink-3); font-style: italic; margin-top: 10px; }

/* ── Week timeline ─────────────────────────────────────────────────── */
.lg-weeks { list-style: none; margin: 16px 0 0; padding: 0; }
.lg-week { display: grid; grid-template-columns: 62px 1fr; gap: 14px;
  padding: 11px 0; border-top: 1px solid var(--rule); align-items: baseline; }
.lg-week-no { font-family: 'JetBrains Mono', monospace; font-size: 12px;
  letter-spacing: 1px; color: var(--ink-3); }
.lg-week--mine .lg-week-no { color: var(--accent); font-weight: 500; }
.lg-week-what { font-size: 14px; }
.lg-week-transport { font-size: 12.5px; color: var(--ink-3); display: block; margin-top: 2px; }
.lg-badge { font-family: 'JetBrains Mono', monospace; font-size: 10px;
  letter-spacing: 1px; text-transform: uppercase; padding: 2px 7px;
  border: 1px solid var(--rule); border-radius: 3px; margin-left: 6px; }
.lg-badge--aftales { border-color: var(--accent); color: var(--accent); }

/* ── Admin ─────────────────────────────────────────────────────────── */
.lg-admin-grid { display: grid; gap: 28px; grid-template-columns: 1fr; }
@media (min-width: 900px) { .lg-admin-grid { grid-template-columns: 300px 1fr; } }
.lg-panel { border: 1px solid var(--rule); border-radius: var(--lg-card-radius); padding: 20px; }
.lg-panel h2 { font-size: 20px; margin-bottom: 14px; }
.lg-slider { display: grid; grid-template-columns: 1fr 52px; gap: 10px;
  align-items: center; margin-bottom: 12px; font-size: 13px; }
.lg-slider output { font-family: 'JetBrains Mono', monospace; font-size: 12px; text-align: right; }
.lg-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.lg-table th, .lg-table td { text-align: left; padding: 9px 8px; border-bottom: 1px solid var(--rule); }
.lg-table th { font-family: 'JetBrains Mono', monospace; font-size: 10.5px;
  letter-spacing: 1.5px; text-transform: uppercase; color: var(--ink-3); font-weight: 500; }
.lg-scroll { overflow-x: auto; }

/* ── Print ─────────────────────────────────────────────────────────── */
@media print {
  .nav, .lg-actions, .lg-panel--controls, .lg-noprint { display: none !important; }
  .lg-main { max-width: none; padding: 0; }
  .lg-groups { grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .lg-group { break-inside: avoid; border: 1px solid #999; }
  a[href]::after { content: ''; }
}
```

- [ ] **Step 2: Verify visually**

```bash
cd "C:/Users/Bobby/OneDrive/Dokumenter/GitHub/Bobby-zs-lo.github.io" && python -m http.server 8000
```

There is nothing to look at yet — this step exists to confirm the `@import` resolves. Open `http://localhost:8000/legegruppe/css/legegruppe.css` and check the file loads and that the browser's network tab shows `style.css` fetched alongside it.

- [ ] **Step 3: Commit**

```bash
git add legegruppe/css/legegruppe.css
git commit -m "style: legegruppe stylesheet on the site design tokens"
```

---

## Task 14: Parent questionnaire

**Files:**
- Create: `legegruppe/index.html`
- Create: `legegruppe/js/ui/form.js`
- Test: `legegruppe/tests/form.test.mjs`

The form's pure logic — reading answers out of the DOM, validating them, and turning them into the shape `saveFamily` expects — lives in testable functions that take a plain object rather than touching the DOM directly. Only the thin wiring layer touches elements.

- [ ] **Step 1: Write the failing test**

Create `legegruppe/tests/form.test.mjs`:

```js
/* Run: node legegruppe/tests/form.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const F = require('../js/ui/form.js');

// --- validation: the four core questions are mandatory ---
const complete = {
  parentName: 'Anne', contact: 'anne@example.dk', hostCapacity: '1',
  maxChildrenAtHome: '4', availableWeekdays: ['2', '3'], fetchCapacity: '2',
  meetingPlace: 'home', blackoutWeeks: '', note: '', consent: true
};
assert.deepEqual(F.validate(complete), []);

assert.ok(F.validate({ ...complete, hostCapacity: '' })
  .some(e => e.field === 'hostCapacity'));
assert.ok(F.validate({ ...complete, availableWeekdays: [] })
  .some(e => e.field === 'availableWeekdays'));
assert.ok(F.validate({ ...complete, fetchCapacity: '' })
  .some(e => e.field === 'fetchCapacity'));
assert.ok(F.validate({ ...complete, consent: false })
  .some(e => e.field === 'consent'));
assert.ok(F.validate({ ...complete, contact: 'ikke-en-mail' })
  .some(e => e.field === 'contact'));
assert.ok(F.validate({ ...complete, contact: '12 34 56 78' }).length === 0,
  'a Danish phone number is a valid contact');

// --- every error message is Danish and names what to do ---
F.validate({ parentName: '', contact: '', hostCapacity: '', maxChildrenAtHome: '',
  availableWeekdays: [], fetchCapacity: '', consent: false })
  .forEach(e => {
    assert.ok(typeof e.message === 'string' && e.message.length > 10, JSON.stringify(e));
    assert.ok(typeof e.field === 'string');
  });

// --- a family that cannot host at all is still valid ---
assert.deepEqual(F.validate({ ...complete, hostCapacity: '0', maxChildrenAtHome: '0' }), []);

// --- blackout weeks accept loose input ---
assert.deepEqual(F.parseBlackout('42, 43 ; 7'), [7, 42, 43]);
assert.deepEqual(F.parseBlackout(''), []);
assert.deepEqual(F.parseBlackout('uge 42 og 43'), [42, 43]);

// --- toPayload produces exactly what saveFamily expects ---
const payload = F.toPayload(complete);
assert.equal(payload.hostCapacity, 1);
assert.deepEqual(payload.availableWeekdays, [2, 3]);
assert.equal(payload.fetchCapacity, 2);
assert.equal(payload.meetingPlace, 'home');
assert.deepEqual(payload.blackoutWeeks, []);
assert.equal(typeof payload.parentName, 'string');

// --- fromFamily restores a saved answer back into form values ---
const restored = F.fromFamily({
  parentName: 'Anne', contact: 'anne@example.dk', hostCapacity: 2,
  maxChildrenAtHome: 3, availableWeekdays: ['1', '5'], fetchCapacity: 0,
  meetingPlace: 'both', blackoutWeeks: '42,43', note: 'hund'
});
assert.equal(restored.hostCapacity, '2');
assert.deepEqual(restored.availableWeekdays, ['1', '5']);
assert.equal(restored.consent, true, 'an existing answer implies prior consent');
assert.equal(restored.blackoutWeeks, '42,43');

// --- round trip is lossless ---
assert.deepEqual(F.toPayload(F.fromFamily(F.toPayload(complete))).availableWeekdays, [2, 3]);

console.log('ok - form');
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node legegruppe/tests/form.test.mjs
```

Expected: fails with `Cannot find module '../js/ui/form.js'`.

- [ ] **Step 3: Write the form logic**

Create `legegruppe/js/ui/form.js`:

```js
/* Parent questionnaire: pure validation and mapping, plus thin DOM wiring.
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

    REQUIRED.forEach(pair => {
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

  /** "uge 42 og 43" → [42, 43]. Tolerant on purpose. */
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

  /** Stored family → form values, for the "update my answers" case. */
  function fromFamily(family) {
    const f = family || {};
    return {
      parentName: String(f.parentName || ''),
      contact: String(f.contact || ''),
      hostCapacity: String(f.hostCapacity == null ? '' : f.hostCapacity),
      maxChildrenAtHome: String(f.maxChildrenAtHome == null ? '' : f.maxChildrenAtHome),
      availableWeekdays: (f.availableWeekdays || []).map(String),
      fetchCapacity: String(f.fetchCapacity == null ? '' : f.fetchCapacity),
      meetingPlace: f.meetingPlace || 'home',
      blackoutWeeks: Array.isArray(f.blackoutWeeks)
        ? f.blackoutWeeks.join(',') : String(f.blackoutWeeks || ''),
      note: String(f.note || ''),
      consent: true
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
    Object.keys(values).forEach(name => {
      const value = values[name];
      const fields = formEl.querySelectorAll('[name="' + name + '"]');
      fields.forEach(el => {
        if (el.type === 'checkbox') {
          el.checked = Array.isArray(value) ? value.indexOf(el.value) !== -1 : Boolean(value);
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node legegruppe/tests/form.test.mjs
```

Expected: `ok - form`

- [ ] **Step 5: Build the page**

Create `legegruppe/index.html`. Requirements, all mandatory:

- `<html lang="da">`, `<meta name="robots" content="noindex, nofollow">`, viewport meta.
- The site's nav markup copied from `index.html` so the app does not feel detached, with `Legegruppe` marked `aria-current="page"`.
- `<form id="lg-form">` containing, in this order and with these `name` attributes:
  - `parentName` (text), `contact` (text)
  - `hostCapacity` — four radios (`0`, `1`, `2`, `3`) in a `<fieldset class="lg-field">` with `<legend>Hvor mange gange i en periode kan I lægge hus til?</legend>` and a `.lg-help` explaining that a period is roughly four months and that zero is a perfectly normal answer
  - `maxChildrenAtHome` — radios `0`, `2`, `3`, `4`, `5`
  - `availableWeekdays` — five checkboxes, values `1`–`5`, labelled Mandag…Fredag
  - `fetchCapacity` — radios `0`, `2`, `3`, `4`, with `0` labelled "Vi kan ikke hente — børnene skal bringes til os"
  - `<details class="lg-details">` wrapping `meetingPlace` (radios `home`, `outdoor`, `both`), `blackoutWeeks` (text), `note` (textarea)
  - `consent` checkbox with one sentence naming what is stored and for how long
- A `div#lg-status.lg-status[hidden]` for messages, placed **above** the submit button so errors are seen.
- A sticky `.lg-actions` bar with a `Gem svar` primary button.
- Script tags in order: `js/api.js`, `js/ui/form.js`, then an inline module that:
  1. reads `?f=<token>` from the URL; without a token, shows "Du mangler dit personlige link — spørg administratoren" and disables the form
  2. restores any local draft first, then overwrites with the server's stored answers via `getFamily`
  3. on submit: `validate()`, and on errors focuses the first offending field and renders every message in `#lg-status`
  4. on success: swaps the form for a receipt showing the personal link with a copy button
  5. calls `flushDraft(token)` on load, so a save that failed on the bus goes through when the parent reopens the page

- [ ] **Step 6: Verify by hand**

```bash
cd "C:/Users/Bobby/OneDrive/Dokumenter/GitHub/Bobby-zs-lo.github.io" && python -m http.server 8000
```

Open `http://localhost:8000/legegruppe/?f=test`. Check, at 375 px width:

- every radio and checkbox is at least 44 px tall and tappable
- submitting an empty form shows Danish errors and moves focus to the first bad field
- the page is fully operable by keyboard alone, with visible focus rings
- with the backend unreachable, filling in the form and submitting still keeps the answers after a reload (the draft path)

- [ ] **Step 7: Commit**

```bash
git add legegruppe/index.html legegruppe/js/ui/form.js legegruppe/tests/form.test.mjs
git commit -m "feat: legegruppe parent questionnaire"
```

---

## Task 15: Published plan

**Files:**
- Create: `legegruppe/plan/index.html`
- Create: `legegruppe/js/ui/plan.js`
- Test: `legegruppe/tests/plan.test.mjs`

Everything that turns a solved round into Danish prose lives in pure functions, including the plain-text export for Aula. The page itself only places strings into elements.

- [ ] **Step 1: Write the failing test**

Create `legegruppe/tests/plan.test.mjs`:

```js
/* Run: node legegruppe/tests/plan.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const P = require('../js/ui/plan.js');

const children = [
  { childId: 'k0', familyId: 'f0', name: 'Alma' },
  { childId: 'k1', familyId: 'f1', name: 'Bo' },
  { childId: 'k2', familyId: 'f2', name: 'Carla' },
  { childId: 'k3', familyId: 'f3', name: 'Dagmar' }
];
const contacts = {
  f0: { parentName: 'Anne', contact: 'anne@example.dk' },
  f1: { parentName: 'Bent', contact: '12345678' },
  f2: { parentName: 'Cecilie', contact: 'c@example.dk' },
  f3: { parentName: 'David', contact: 'd@example.dk' }
};
const round = {
  groups: [{ id: 'A', childIds: ['k0', 'k1', 'k2', 'k3'], why: ['Stærk her: børnene har ikke leget sammen før.'] }],
  rota: { groups: [{ id: 'A', childIds: ['k0', 'k1', 'k2', 'k3'], meetings: [
    { week: 34, weekday: 2, weekdayName: 'tirsdag', hostFamilyId: 'f0', place: 'hjemme',
      fetchers: ['f1'], transport: 'dækket', transportNote: 'Bent henter børnene fra skole.' },
    { week: 37, weekday: 4, weekdayName: 'torsdag', hostFamilyId: 'f2', place: 'ude',
      fetchers: [], transport: 'aftales', transportNote: 'Ingen i gruppen kan hente den dag — aftal indbyrdes.' }
  ] }] }
};
const ctx = { round, children, contacts };

// --- finding my own group ---
assert.equal(P.groupForFamily(ctx, 'f1').id, 'A');
assert.equal(P.groupForFamily(ctx, 'f9'), null);

// --- child names ---
assert.deepEqual(P.childNames(ctx, ['k0', 'k2']), ['Alma', 'Carla']);
assert.deepEqual(P.childNames(ctx, ['ukendt']), ['ukendt']);

// --- one meeting as a Danish sentence ---
const first = P.describeMeeting(ctx, round.rota.groups[0].meetings[0]);
assert.ok(/uge 34/i.test(first.when), first.when);
assert.ok(/tirsdag/i.test(first.when));
assert.ok(/Anne/.test(first.host));
assert.ok(/hjemme/i.test(first.host));
assert.ok(/Bent/.test(first.transport));

const second = P.describeMeeting(ctx, round.rota.groups[0].meetings[1]);
assert.ok(/ude|legeplads|park/i.test(second.host), second.host);
assert.equal(second.needsAgreement, true);
assert.equal(first.needsAgreement, false);

// --- which meetings am I hosting? ---
assert.deepEqual(P.myHostWeeks(ctx, 'f0'), [34]);
assert.deepEqual(P.myHostWeeks(ctx, 'f2'), [37]);
assert.deepEqual(P.myHostWeeks(ctx, 'f1'), []);

// --- plain text export for Aula ---
const text = P.toPlainText(ctx);
assert.ok(text.includes('Gruppe A'));
assert.ok(text.includes('Alma'));
assert.ok(text.includes('Uge 34'));
assert.ok(text.includes('Anne'));
assert.ok(text.split('\n').length > 5);
// no HTML leaks into a message meant for a plain textarea
assert.ok(!/[<>]/.test(text), 'plain text must not contain markup');

// --- an empty round degrades gracefully instead of throwing ---
assert.equal(P.toPlainText({ round: null, children, contacts }),
  'Der er ingen offentliggjort plan endnu.');
assert.equal(P.groupForFamily({ round: null, children, contacts }, 'f0'), null);

console.log('ok - plan');
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node legegruppe/tests/plan.test.mjs
```

Expected: fails with `Cannot find module '../js/ui/plan.js'`.

- [ ] **Step 3: Write the implementation**

Create `legegruppe/js/ui/plan.js`:

```js
/* Turns a solved round into Danish prose. Pure - the page only places the strings.
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
      g.childIds.some(id => (index.get(id) || {}).familyId === familyId))[0];
    return found || null;
  }

  function rotaFor(ctx, groupId) {
    if (!ctx.round || !ctx.round.rota) return null;
    return ctx.round.rota.groups.filter(g => g.id === groupId)[0] || null;
  }

  /** One meeting as three short Danish strings the page can place directly. */
  function describeMeeting(ctx, meeting) {
    const host = parentName(ctx, meeting.hostFamilyId);
    const where = meeting.place === 'ude'
      ? 'ude — legeplads eller park, ' + host + ' er med'
      : 'hjemme hos ' + host;
    return {
      when: 'Uge ' + meeting.week + ', ' + meeting.weekdayName,
      host: where,
      transport: meeting.transport === 'dækket'
        ? meeting.fetchers.map(f => parentName(ctx, f)).join(' og ') + ' henter børnene fra skole'
        : 'Transport aftales indbyrdes, eller børnene mødes på skolens legeplads',
      needsAgreement: meeting.transport !== 'dækket',
      week: meeting.week
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node legegruppe/tests/plan.test.mjs
```

Expected: `ok - plan`

- [ ] **Step 5: Build the page**

Create `legegruppe/plan/index.html`. Requirements:

- Same head conventions as Task 14 (`lang="da"`, `noindex`, viewport), stylesheet at `../css/legegruppe.css`, scripts at `../js/…`.
- Reads `?f=<token>`, calls `getPlan`, and renders in this order:
  1. **Din gruppe** — a `.lg-group.lg-group--mine` card. The family's own child gets `.lg-kid--mine`. Below it a `.lg-weeks` list of that group's meetings, with `.lg-week--mine` on the weeks this family hosts and a `.lg-badge--aftales` badge where transport still needs agreeing.
  2. **Kontakter** — the other parents in the group, name and contact, as `mailto:`/`tel:` links.
  3. **Hele klassen** — a `<details>` containing every group as `.lg-group` cards in a `.lg-groups` grid.
  4. A `.lg-noprint` row with two buttons: `Print` (calls `window.print()`) and `Kopiér som tekst` (writes `Plan.toPlainText(ctx)` to the clipboard and confirms in `#lg-status`).
- Without a published round, show `Plan.NO_PLAN` and nothing else — no empty scaffolding.
- Without a valid token, show the same "du mangler dit personlige link" message as the form.

- [ ] **Step 6: Verify by hand**

Serve locally and open the plan with a real token after publishing a round in Task 16. Check specifically:

- printing produces a clean two-column A4 with no nav and no buttons
- the copy button yields text that pastes into Aula without stray characters
- at 375 px nothing overflows horizontally

- [ ] **Step 7: Commit**

```bash
git add legegruppe/plan/index.html legegruppe/js/ui/plan.js legegruppe/tests/plan.test.mjs
git commit -m "feat: legegruppe published plan view"
```

---

## Task 16: Admin console

**Files:**
- Create: `legegruppe/admin/index.html`
- Create: `legegruppe/js/ui/admin.js`
- Test: `legegruppe/tests/admin.test.mjs`

The admin's judgement outranks the algorithm. Manual moves are always allowed; if one breaks a hard requirement the page says so plainly and blocks publishing, but it never silently reverts the move.

- [ ] **Step 1: Write the failing test**

Create `legegruppe/tests/admin.test.mjs`:

```js
/* Run: node legegruppe/tests/admin.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const A = require('../js/ui/admin.js');

const snapshot = {
  classId: 'c1',
  families: [
    { familyId: 'f0', parentName: 'Anne', consentAt: '2026-08-01', updatedAt: '2026-08-01' },
    { familyId: 'f1', parentName: 'Bent', consentAt: null, updatedAt: null },
    { familyId: 'f2', parentName: 'Cecilie', consentAt: '2026-08-03', updatedAt: '2026-08-03' }
  ],
  children: [
    { childId: 'k0', familyId: 'f0', name: 'Alma' },
    { childId: 'k1', familyId: 'f1', name: 'Bo' },
    { childId: 'k2', familyId: 'f2', name: 'Carla' }
  ]
};

// --- who has not answered ---
const missing = A.missingResponses(snapshot);
assert.equal(missing.length, 1);
assert.equal(missing[0].parentName, 'Bent');

// --- reminder text names them and is ready to paste ---
const reminder = A.reminderText(snapshot);
assert.ok(reminder.includes('Bent'));
assert.ok(!reminder.includes('Anne'), 'do not nag people who already answered');
assert.ok(reminder.length > 40);
assert.ok(!/[<>]/.test(reminder));

// --- families who changed their answers after the round was published ---
const afterPublish = {
  ...snapshot,
  families: [
    { familyId: 'f0', parentName: 'Anne', consentAt: '2026-08-01', updatedAt: '2026-08-20T10:00:00Z' },
    { familyId: 'f2', parentName: 'Cecilie', consentAt: '2026-08-03', updatedAt: '2026-08-03T10:00:00Z' }
  ],
  rounds: [{ roundId: 'r1', status: 'published', publishedAt: '2026-08-10T12:00:00Z' }]
};
const changed = A.changedSincePublish(afterPublish);
assert.equal(changed.length, 1);
assert.equal(changed[0].parentName, 'Anne');
// no published round yet means nothing to flag
assert.deepEqual(A.changedSincePublish({ ...afterPublish, rounds: [] }), []);

// --- everyone answered: no reminder needed ---
const done = { ...snapshot, families: snapshot.families.map(f =>
  ({ ...f, consentAt: '2026-08-01' })) };
assert.equal(A.missingResponses(done).length, 0);
assert.ok(/alle har svaret/i.test(A.reminderText(done)));

// --- week ranges ---
assert.deepEqual(A.weekRange(34, 39), [34, 35, 36, 37, 38, 39]);
assert.deepEqual(A.weekRange(51, 3), [51, 52, 53, 1, 2, 3], 'must wrap across new year');
assert.deepEqual(A.weekRange(34, 34), [34]);

// --- moving a child between groups ---
const groups = [
  { id: 'A', childIds: ['k0', 'k1'] },
  { id: 'B', childIds: ['k2'] }
];
const moved = A.moveChild(groups, 'k1', 1);
assert.deepEqual(moved[0].childIds, ['k0']);
assert.deepEqual(moved[1].childIds, ['k2', 'k1']);
assert.deepEqual(groups[0].childIds, ['k0', 'k1'], 'the original must not be mutated');

// moving to the group it is already in changes nothing
assert.deepEqual(A.moveChild(groups, 'k0', 0), groups);

// --- locks derived from the current arrangement ---
const locks = A.locksFrom([{ id: 'A', childIds: ['k0'] }, { id: 'B', childIds: ['k1', 'k2'] }],
  ['k1']);
assert.deepEqual(locks, [{ childId: 'k1', groupIndex: 1 }]);

// --- weights read from slider values ---
const weights = A.readWeights({ novelty: '1', robustness: '0.5', capacityAdequacy: '0.7',
  weekdayBreadth: '0.4', capacityBalance: '0' });
assert.equal(weights.novelty, 1);
assert.equal(weights.capacityBalance, 0);

// --- the publish payload carries everything the backend stores ---
const payload = A.publishPayload({
  result: { groups: [{ id: 'A', childIds: ['k0'] }], rota: { groups: [] },
    score: { total: 0.8 }, meta: { solver: 'exact' } },
  weeks: [34, 35], meetingsPerGroup: 6, groupSizeMin: 4, groupSizeMax: 5,
  solver: 'exact', weights: weights
});
assert.equal(payload.solver, 'exact');
assert.deepEqual(payload.weeks, [34, 35]);
assert.equal(payload.result.groups.length, 1);
assert.equal(payload.weights.novelty, 1);

// --- publishing is blocked while verification fails ---
assert.equal(A.canPublish({ status: 'ok', verification: [] }), true);
assert.equal(A.canPublish({ status: 'ok', verification: [{ code: 'H1' }] }), false);
assert.equal(A.canPublish({ status: 'infeasible', verification: null }), false);
assert.equal(A.canPublish(null), false);

// --- the reason for blocking is stated in Danish ---
const reason = A.publishBlockReason({ status: 'ok',
  verification: [{ code: 'H1', groupId: 'A', message: 'Alma og Bo må ikke være i samme gruppe.' }] });
assert.ok(reason.includes('Alma'));
assert.ok(reason.length > 20);

console.log('ok - admin');
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node legegruppe/tests/admin.test.mjs
```

Expected: fails with `Cannot find module '../js/ui/admin.js'`.

- [ ] **Step 3: Write the implementation**

Create `legegruppe/js/ui/admin.js`:

```js
/* Admin console logic. Pure - the page wires these to elements.
   Browser: window.LG.Admin   Node: require('./admin.js') */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LG = Object.assign(root.LG || {}, { Admin: factory() });
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Families that have not filled in the questionnaire yet. */
  function missingResponses(snapshot) {
    return (snapshot.families || []).filter(f => !f.consentAt && !f.updatedAt);
  }

  /**
   * Families who changed their answers after the current round went live.
   * The plan is never rebuilt automatically - the admin decides. Spec section 10.
   */
  function changedSincePublish(snapshot) {
    const published = (snapshot.rounds || [])
      .filter(r => r.status === 'published' && r.publishedAt)
      .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))[0];
    if (!published) return [];
    return (snapshot.families || []).filter(f =>
      f.updatedAt && String(f.updatedAt) > String(published.publishedAt));
  }

  /** Ready-to-paste reminder for Aula. Names only those who still owe an answer. */
  function reminderText(snapshot) {
    const missing = missingResponses(snapshot);
    if (missing.length === 0) {
      return 'Alle har svaret. Så er vi klar til at danne legegrupperne.';
    }
    const names = missing.map(f => f.parentName || 'en familie');
    const who = names.length === 1
      ? names[0]
      : names.slice(0, -1).join(', ') + ' og ' + names[names.length - 1];
    return 'Hej alle. Vi mangler stadig svar fra ' + who + ' til legegrupperne. ' +
      'Det tager under to minutter, og I har fået jeres personlige link tidligere. ' +
      'Skriv til mig hvis I har mistet det, så sender jeg et nyt.';
  }

  /** Inclusive week range that wraps across the new year. */
  function weekRange(from, to) {
    const weeks = [];
    let week = from;
    for (let guard = 0; guard < 60; guard++) {
      weeks.push(week);
      if (week === to) break;
      week = week >= 53 ? 1 : week + 1;
    }
    return weeks;
  }

  /** Move a child to another group. Returns new arrays; never mutates. */
  function moveChild(groups, childId, targetIndex) {
    const currentIndex = groups.findIndex(g => g.childIds.indexOf(childId) !== -1);
    if (currentIndex === -1 || currentIndex === targetIndex) return groups;
    return groups.map((g, i) => {
      if (i === currentIndex) {
        return Object.assign({}, g, { childIds: g.childIds.filter(id => id !== childId) });
      }
      if (i === targetIndex) {
        return Object.assign({}, g, { childIds: g.childIds.concat([childId]) });
      }
      return g;
    });
  }

  /** Pin the listed children to wherever they currently sit. */
  function locksFrom(groups, lockedChildIds) {
    return (lockedChildIds || []).map(childId => ({
      childId: childId,
      groupIndex: groups.findIndex(g => g.childIds.indexOf(childId) !== -1)
    })).filter(l => l.groupIndex !== -1);
  }

  /** Slider strings → numeric weights. */
  function readWeights(values) {
    const weights = {};
    Object.keys(values || {}).forEach(name => {
      const n = parseFloat(values[name]);
      weights[name] = Number.isFinite(n) ? n : 0;
    });
    return weights;
  }

  function publishPayload(state) {
    return {
      result: state.result,
      weeks: state.weeks,
      meetingsPerGroup: state.meetingsPerGroup,
      groupSizeMin: state.groupSizeMin,
      groupSizeMax: state.groupSizeMax,
      solver: state.solver,
      weights: state.weights
    };
  }

  /** Publishing requires a solved round that the verifier signed off on. */
  function canPublish(result) {
    if (!result) return false;
    if (result.status !== 'ok') return false;
    return Array.isArray(result.verification) && result.verification.length === 0;
  }

  function publishBlockReason(result) {
    if (!result) return 'Kør en runde først.';
    if (result.status === 'infeasible') {
      return (result.diagnosis && result.diagnosis.summary) ||
        'Der findes ingen gyldig opdeling med de nuværende svar.';
    }
    if (result.verification && result.verification.length) {
      return 'Planen bryder et hårdt krav og kan ikke udgives: ' +
        result.verification.map(v => v.message).join(' ');
    }
    return 'Planen er ikke klar til udgivelse.';
  }

  return { missingResponses, changedSincePublish, reminderText, weekRange, moveChild, locksFrom,
    readWeights, publishPayload, canPublish, publishBlockReason };
});
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node legegruppe/tests/admin.test.mjs
```

Expected: `ok - admin`

- [ ] **Step 5: Build the page**

Create `legegruppe/admin/index.html`. Requirements:

- Passphrase prompt first; the passphrase is held in a JavaScript variable for the session only and **never** written to `localStorage`.
- Script tags in dependency order: `../js/model.js`, `../js/constraints.js`, `../js/scoring.js`, `../js/solvers/heuristic.js`, `../js/solvers/exact.js`, `../js/solvers/rota.js`, `../js/solvers/infeasibility.js`, `../js/solvers/index.js`, `../js/api.js`, `../js/ui/plan.js`, `../js/ui/admin.js`.
- Layout is `.lg-admin-grid`: controls in the left `.lg-panel.lg-panel--controls`, results on the right.
- **Status panel** — a `.lg-table` of families with a column showing answered/missing, plus a "Kopiér rykker" button using `Admin.reminderText`. Above the table, when `Admin.changedSincePublish` returns anything, a `.lg-status` notice naming those families: *"Anne har ændret sine svar efter planen blev udgivet. Planen er ikke ændret automatisk — kør en ny runde hvis det skal med."*
- **Forbidden pairs panel** — two `<select>`s of children and an "Tilføj" button, listing current pairs with a remove action, saved via `setBlockedPairs`. A one-line note that this list is never shown to parents.
- **Round setup** — week from/to (`Admin.weekRange`), meetings per group, group size min/max, five weight sliders bound to `Scoring.DEFAULT_WEIGHTS`, and a solver radio: `Heuristik (hurtig)` / `Eksakt (bevist optimal)` / `Kør begge og sammenlign`.
- **Run** — calls `LG.Solve.solve` or `LG.Solve.compare` in a `setTimeout(…, 0)` so the button can show "Regner…" first. Renders group cards, each meeting, the score breakdown, `meta.runtimeMs`, and for the comparison mode `compare().summary`.
- **Adjust** — each group card lists its children with a `<select>` of group letters to move them, and a lock checkbox. Changing a group re-runs verification immediately and shows `Admin.publishBlockReason` if it now fails. `Kør igen med mine låse` re-solves with `Admin.locksFrom`.
- **Publish** — disabled unless `Admin.canPublish`; when disabled, the reason is displayed next to the button. On success, show the parent plan link.
- **Delete everything** — a clearly separated destructive action requiring the literal text `SLET ALT` typed into a field.

- [ ] **Step 6: Verify end to end**

Serve locally, log in, add four to six test families via the admin page, open each parent link and fill in the questionnaire, then run a round with each solver. Confirm:

- the comparison mode shows both results and a difference count
- moving a child into a group with a forbidden pair blocks publishing and states which two children
- publishing writes the round, and the parent plan link then shows the right group
- a second round proposes materially different groups, because history was written

- [ ] **Step 7: Commit**

```bash
git add legegruppe/admin/index.html legegruppe/js/ui/admin.js legegruppe/tests/admin.test.mjs
git commit -m "feat: legegruppe admin console"
```

---

## Task 17: Integration, privacy and polish

**Files:**
- Modify: `legegruppe/tests/run-all.sh`
- Modify: `robots.txt`
- Modify: `apps.html`
- Create: `legegruppe/README.md`

- [ ] **Step 1: Complete the test runner**

Update the loop in `legegruppe/tests/run-all.sh` so it reads:

```bash
for t in model constraints scoring heuristic exact rota infeasibility solve generate api form plan admin; do
```

Run it:

```bash
bash legegruppe/tests/run-all.sh
```

Expected: thirteen `ok - …` lines, then the smoke simulation and `All legegruppe tests passed.`

- [ ] **Step 2: Keep the app out of search results**

Append to `robots.txt`:

```
Disallow: /legegruppe/
```

Confirm every one of the three pages also carries `<meta name="robots" content="noindex, nofollow">`:

```bash
grep -l "noindex" legegruppe/index.html legegruppe/plan/index.html legegruppe/admin/index.html
```

Expected: all three paths listed.

- [ ] **Step 3: Confirm no secrets are committed**

```bash
grep -rn "script.google.com/macros/s/" legegruppe/ | grep -v "REPLACE_ME"
grep -rniE "passphrase *= *[\"'][^\"']{3,}" legegruppe/ | grep -viE "YOUR_|REPLACE_ME"
```

Expected: no output from either command. If the deployment URL must be present for the app to work, it belongs in `js/api.js` as the only place — it is a capability URL, not a secret, but the admin passphrase must never appear in this repo.

- [ ] **Step 4: Link it from the apps page**

Add an entry to `apps.html` following the existing card markup for `timer/` and `race/`. Title `Legegruppe`, one sentence: "Danner legegrupper i en skoleklasse ud fra hvad forældrene faktisk kan overkomme." Link to `/legegruppe/`.

- [ ] **Step 5: Write the README**

Create `legegruppe/README.md` covering: what the app does, the two solvers and when to pick which, how to run the tests (`bash legegruppe/tests/run-all.sh`, and `--full` for the 1000-simulation gate), where the backend lives (`SETUP.md`), what data is stored and what is not, and how to delete everything at the end of the school year.

- [ ] **Step 6: Accessibility and responsive check**

With the site served locally, for each of the three pages:

```bash
cd "C:/Users/Bobby/OneDrive/Dokumenter/GitHub/Bobby-zs-lo.github.io" && python -m http.server 8000
```

Check at 320, 375, 768, 1024 and 1440 px:

- no horizontal scrolling on the body; wide tables scroll inside `.lg-scroll`
- every interactive element is reachable by Tab, in a sensible order, with a visible focus ring
- form fields are associated with labels (`for`/`id`), and error messages are announced via `aria-live="polite"` on `#lg-status`
- `prefers-reduced-motion` is honoured — the site's base stylesheet already handles this, so simply confirm no new animation was added that bypasses it

- [ ] **Step 7: Run the full gate one final time**

```bash
bash legegruppe/tests/run-all.sh --full
```

Expected: all unit tests pass, then the 1000-simulation report with zero hard violations, zero unexplained runs, zero non-determinism and zero capacity breaches.

- [ ] **Step 8: Commit**

```bash
git add legegruppe/README.md legegruppe/tests/run-all.sh robots.txt apps.html
git commit -m "docs: legegruppe readme, robots and apps entry"
```

---

## Definition of done

- [ ] `bash legegruppe/tests/run-all.sh --full` passes, including the 1000-simulation gate with all thresholds met
- [ ] A parent can fill in the questionnaire on a phone in under two minutes, and reopen their link to change their answers
- [ ] The admin can run both solvers, compare them, move a child by hand, lock it, re-run, and publish
- [ ] Publishing is impossible while the independent verifier reports anything
- [ ] An infeasible class produces a specific, actionable Danish sentence naming what to relax — and never suggests relaxing a forbidden pair
- [ ] `/legegruppe/` is `noindex` in both `robots.txt` and the page meta
- [ ] No passphrase is present anywhere in the repository
