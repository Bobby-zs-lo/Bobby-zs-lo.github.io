// ==========================================
// Legegruppe backend.
// Deploy as a Web App:  Execute as: Me   Who has access: Anyone
//
// Security model:
//   - Parents authenticate with a per-family random token in their URL. A token
//     unlocks exactly one family row and nothing else.
//   - Admin authenticates with a shared passphrase, checked on every admin action.
//   - blocked_pairs is admin-only, always. It records conflicts between children
//     and must never be visible to parents, directly or by inference.
//
// The passphrase lives here in the Apps Script project only. It is never committed
// to the website's repository.
// ==========================================
const SPREADSHEET_ID = "YOUR_SPREADSHEET_ID_HERE";
const ADMIN_PASSPHRASE = "YOUR_ADMIN_PASSPHRASE_HERE";
const CLASS_ID = "klasse-2b";   // one class for now; every row still carries it

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

const UNKNOWN_LINK = { ok: false, error: "Ukendt link. Bed administratoren om et nyt." };

// ---------- plumbing ----------

function json_(obj) {
  // Apps Script's ContentService cannot set custom response headers. An anonymous
  // web app deployment already answers with Access-Control-Allow-Origin: *, which
  // is what lets the site POST to it. The header object in the older receipts
  // script is inert, so it is not copied here as decoration.
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

// One read per sheet per request. Several actions ask for the same sheet three or
// four times, and each read is a full round trip to the spreadsheet service.
let CACHE_ = {};

function rows_(name) {
  if (CACHE_[name]) return CACHE_[name];
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) { CACHE_[name] = []; return CACHE_[name]; }
  const headers = values[0];
  const out = [];
  for (let r = 1; r < values.length; r++) {
    const obj = {};
    headers.forEach(function (h, c) { obj[h] = values[r][c]; });
    if (String(obj.class_id) === CLASS_ID) { obj._row = r + 1; out.push(obj); }
  }
  CACHE_[name] = out;
  return out;
}

function clearRows_(name) {
  const sh = sheet_(name);
  const last = sh.getLastRow();
  // Row 1 is the header. getLastRow() is 0 on a sheet with nothing at all, so both
  // the empty case and the header-only case must leave the sheet untouched.
  if (last > 1) sh.deleteRows(2, last - 1);
  delete CACHE_[name];
}

function newToken_() {
  return Utilities.getUuid().replace(/-/g, "").slice(0, 20);
}

function isAdmin_(payload) {
  return Boolean(payload) && payload.passphrase === ADMIN_PASSPHRASE;
}

// ---------- validation ----------
// The browser normalises answers before sending them, but a hand-written POST can
// put anything in these cells and the sheet feeds straight into the solver. Clamp
// everything here too: the frontend is a convenience, not a security boundary.

function int_(value, lo, hi) {
  const n = parseInt(value, 10);
  if (!isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function text_(value, maxLength) {
  return String(value == null ? "" : value).slice(0, maxLength);
}

function weekdays_(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  const seen = {};
  const out = [];
  list.forEach(function (d) {
    const n = parseInt(d, 10);
    if (n >= 1 && n <= 5 && !seen[n]) { seen[n] = true; out.push(n); }
  });
  return out.sort().join(",");
}

function weeks_(value) {
  const found = String(value == null ? "" : value).match(/\d+/g) || [];
  const seen = {};
  const out = [];
  found.forEach(function (w) {
    const n = parseInt(w, 10);
    if (n >= 1 && n <= 53 && !seen[n]) { seen[n] = true; out.push(n); }
  });
  return out.sort(function (a, b) { return a - b; }).join(",");
}

const MEETING_PLACES = { home: true, outdoor: true, both: true };

function meetingPlace_(value) {
  return MEETING_PLACES[String(value)] ? String(value) : "home";
}

// ---------- shaping ----------

/** A family's own answers, in the shape the questionnaire expects back. */
function ownFamily_(row) {
  return {
    familyId: row.family_id,
    parentName: row.parent_name,
    contact: row.contact,
    hostCapacity: row.host_capacity,
    maxChildrenAtHome: row.max_children_at_home,
    availableWeekdays: String(row.available_weekdays || "").split(",").filter(String),
    fetchCapacity: row.fetch_capacity,
    meetingPlace: row.meeting_place,
    blackoutWeeks: String(row.blackout_weeks || ""),
    note: row.note,
    consentAt: row.consent_at,
    updatedAt: row.updated_at
  };
}

function findByToken_(token) {
  const wanted = String(token || "");
  if (wanted.length < 10) return null;   // no plausible token, no lookup
  const all = rows_("families");
  for (let i = 0; i < all.length; i++) {
    if (String(all[i].token) === wanted) return all[i];
  }
  return null;
}

// ---------- parent actions ----------

function getFamily_(match) {
  const kids = rows_("children").filter(function (c) {
    return c.family_id === match.family_id;
  }).map(function (c) { return { childId: c.child_id, name: c.name }; });
  return json_({ ok: true, family: ownFamily_(match), children: kids });
}

function saveFamily_(match, f) {
  // Two parents saving at the same moment would otherwise both read, then both
  // write, and the second would overwrite the first. The window is small, but the
  // consequence is a family's answers silently vanishing.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return json_({ ok: false, error: "Serveren er optaget lige nu. Prøv igen om et øjeblik." });
  }
  try {
    const now = new Date().toISOString();
    const values = [CLASS_ID, match.family_id, match.token,
      text_(f.parentName || match.parent_name, 80),
      text_(f.contact || match.contact, 120),
      int_(f.hostCapacity, 0, 3),
      int_(f.maxChildrenAtHome, 0, 8),
      weekdays_(f.availableWeekdays),
      int_(f.fetchCapacity, 0, 5),
      meetingPlace_(f.meetingPlace),
      weeks_(f.blackoutWeeks),
      text_(f.note, 500),
      match.consent_at || now,
      now];
    sheet_("families").getRange(match._row, 1, 1, values.length).setValues([values]);
    return json_({ ok: true, updatedAt: now });
  } finally {
    lock.releaseLock();
  }
}

function getPlan_(match) {
  const published = rows_("rounds").filter(function (r) {
    return r.status === "published";
  }).sort(function (a, b) {
    return String(b.published_at).localeCompare(String(a.published_at));
  })[0];

  if (!published) return json_({ ok: true, round: null });

  let round;
  try {
    round = JSON.parse(published.result_json);
  } catch (err) {
    console.error("legegruppe: round " + published.round_id + " has unreadable JSON");
    return json_({ ok: false, error: "Den offentliggjorte plan kunne ikke læses. " +
      "Sig til administratoren, så udgives den igen." });
  }

  const children = rows_("children").map(function (c) {
    return { childId: c.child_id, familyId: c.family_id, name: c.name };
  });

  // Contact details go only to the families a parent is actually scheduled to meet.
  // Handing the whole class's phone numbers to anyone holding any valid link is
  // more than this page needs in order to work.
  const familyOfChild = {};
  children.forEach(function (c) { familyOfChild[c.childId] = c.familyId; });

  const myGroup = (round.groups || []).filter(function (g) {
    return (g.childIds || []).some(function (id) {
      return familyOfChild[id] === match.family_id;
    });
  })[0];

  const allowed = {};
  if (myGroup) {
    myGroup.childIds.forEach(function (id) { allowed[familyOfChild[id]] = true; });
  }

  const contacts = {};
  rows_("families").forEach(function (r) {
    // Named either way, so the whole class plan stays readable — but only the
    // parent's own group is reachable.
    contacts[r.family_id] = allowed[r.family_id]
      ? { parentName: r.parent_name, contact: r.contact }
      : { parentName: r.parent_name };
  });

  return json_({
    ok: true,
    familyId: match.family_id,
    round: round,
    contacts: contacts,
    children: children
  });
}

// ---------- admin actions ----------

function adminSnapshot_() {
  return json_({
    ok: true,
    classId: CLASS_ID,
    families: rows_("families").map(function (r) {
      const own = ownFamily_(r);
      own.token = r.token;
      return own;
    }),
    children: rows_("children").map(function (c) {
      return { childId: c.child_id, familyId: c.family_id, name: c.name };
    }),
    blockedPairs: rows_("blocked_pairs").map(function (b) {
      return [b.child_a, b.child_b];
    }),
    history: rows_("pairs_history").map(function (h) {
      return { childA: h.child_a, childB: h.child_b, roundId: h.round_id };
    }),
    rounds: rows_("rounds").map(function (r) {
      return { roundId: r.round_id, status: r.status, publishedAt: r.published_at };
    })
  });
}

function addFamily_(payload) {
  const token = newToken_();
  const familyId = "f" + Date.now().toString(36);
  sheet_("families").appendRow([CLASS_ID, familyId, token,
    text_(payload.parentName, 80), text_(payload.contact, 120),
    0, 0, "", 0, "home", "", "", "", ""]);
  const names = Array.isArray(payload.childNames) ? payload.childNames : [];
  names.slice(0, 5).forEach(function (name, i) {
    sheet_("children").appendRow([CLASS_ID, familyId + "-c" + i, familyId, text_(name, 60)]);
  });
  return json_({ ok: true, familyId: familyId, token: token });
}

function setBlockedPairs_(payload) {
  const pairs = Array.isArray(payload.pairs) ? payload.pairs : [];
  clearRows_("blocked_pairs");
  const sh = sheet_("blocked_pairs");
  let written = 0;
  pairs.forEach(function (p) {
    if (!Array.isArray(p) || p.length < 2) return;
    sh.appendRow([CLASS_ID, text_(p[0], 40), text_(p[1], 40), text_(p[2], 200)]);
    written++;
  });
  return json_({ ok: true, count: written });
}

function publishRound_(payload) {
  const result = payload.result;
  if (!result || !Array.isArray(result.groups) || result.groups.length === 0) {
    return json_({ ok: false, error: "Der er ingen runde at udgive." });
  }
  for (let i = 0; i < result.groups.length; i++) {
    if (!Array.isArray(result.groups[i].childIds)) {
      return json_({ ok: false, error: "Runden har en gruppe uden børn og kan ikke udgives." });
    }
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return json_({ ok: false, error: "Serveren er optaget lige nu. Prøv igen om et øjeblik." });
  }
  try {
    const roundId = "r" + Date.now().toString(36);
    const now = new Date().toISOString();
    sheet_("rounds").appendRow([CLASS_ID, roundId, "published",
      weeks_(payload.weeks), int_(payload.meetingsPerGroup, 1, 24),
      int_(payload.groupSizeMin, 2, 8), int_(payload.groupSizeMax, 2, 8),
      text_(payload.solver, 20), JSON.stringify(payload.weights || {}),
      JSON.stringify(result), now, now]);

    // Freeze who met whom, so the next round can deliberately mix afresh.
    const historyRows = [];
    result.groups.forEach(function (g) {
      for (let i = 0; i < g.childIds.length; i++) {
        for (let j = i + 1; j < g.childIds.length; j++) {
          historyRows.push([CLASS_ID, g.childIds[i], g.childIds[j], roundId]);
        }
      }
    });
    if (historyRows.length) {
      // One write instead of one per pair; a class of 24 produces about 50 rows.
      const ph = sheet_("pairs_history");
      ph.getRange(ph.getLastRow() + 1, 1, historyRows.length, 4).setValues(historyRows);
    }
    return json_({ ok: true, roundId: roundId, pairsRecorded: historyRows.length });
  } finally {
    lock.releaseLock();
  }
}

function deleteAll_(payload) {
  if (payload.confirm !== "SLET ALT") {
    return json_({ ok: false, error: 'Skriv "SLET ALT" for at bekræfte.' });
  }
  Object.keys(SHEETS).forEach(function (name) { clearRows_(name); });
  return json_({ ok: true });
}

// ---------- entry point ----------

function doPost(e) {
  CACHE_ = {};
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (parseError) {
    return json_({ ok: false, error: "Kunne ikke læse anmodningen." });
  }

  try {
    const action = String(payload.action || "");

    // Parent actions, authorised by token.
    if (action === "getFamily" || action === "saveFamily" || action === "getPlan") {
      const match = findByToken_(payload.token);
      if (!match) return json_(UNKNOWN_LINK);
      if (action === "getFamily") return getFamily_(match);
      if (action === "saveFamily") return saveFamily_(match, payload.family || {});
      return getPlan_(match);
    }

    // Everything below is admin-only.
    if (!isAdmin_(payload)) return json_({ ok: false, error: "Ikke autoriseret." });

    if (action === "adminSnapshot") return adminSnapshot_();
    if (action === "addFamily") return addFamily_(payload);
    if (action === "setBlockedPairs") return setBlockedPairs_(payload);
    if (action === "publishRound") return publishRound_(payload);
    if (action === "deleteAll") return deleteAll_(payload);

    return json_({ ok: false, error: "Ukendt handling: " + action });
  } catch (err) {
    // The caller gets something they can act on; the detail goes to the execution
    // log, where the owner can read it without exposing internals to the internet.
    console.error("legegruppe " + (payload && payload.action) + ": " + err.stack);
    return json_({ ok: false, error: "Der gik noget galt på serveren. Prøv igen, " +
      "og sig til hvis det bliver ved." });
  }
}

function doGet() {
  return ContentService.createTextOutput("Legegruppe backend kører.");
}
