/**
 * TAMU Energize - price reports backend (Google Apps Script, bound to a Google Sheet).
 *
 * Anyone using the app can SEND a report (action "report").
 * Only requests carrying the team key can READ reports ("list") or CHANGE them ("resolve").
 * The team key lives in Script Properties (TEAM_KEY), never in the app's code.
 *
 * Setup: see server/README.md.
 */

const SHEET_NAME = "Reports";
const HEADERS = [
  "id", "created_at", "key", "building", "vendor", "brand", "size_oz",
  "listed_price", "reported_price", "in_person", "note",
  "status", "resolved_at", "confirmed_price",
];
const TZ = "America/Chicago";
const MAX_REPORTS_PER_10_MIN = 60;     // simple spam brake for the whole app
const STATUSES = ["open", "confirmed", "dismissed"];

function doGet() {
  return json_({ ok: true, service: "aggie-energy-map-reports" });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: "bad_request" });
  }
  try {
    switch (body.action) {
      case "report":
        return json_(addReport_(body.report));
      case "list":
        requireTeam_(body.key);
        return json_({ ok: true, reports: listReports_() });
      case "resolve":
        requireTeam_(body.key);
        return json_(resolve_(body));
      default:
        return json_({ ok: false, error: "unknown_action" });
    }
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

// ---------------------------------------------------------------- actions

function addReport_(r) {
  if (!r || typeof r !== "object") throw new Error("bad_request");
  const key = str_(r.key, 120);
  if (!/^[a-z0-9-]+\|[^|]{1,40}\|[0-9.]{1,6}$/i.test(key)) throw new Error("bad_key");
  const reported = num_(r.reported_price);
  const listed = num_(r.listed_price);
  if (!(reported >= 0.25 && reported <= 20) || !(listed >= 0 && listed <= 20)) throw new Error("bad_price");

  rateLimit_();
  const row = {
    id: Utilities.getUuid(),
    created_at: now_(),
    key: key,
    building: str_(r.building, 40),
    vendor: str_(r.vendor, 80),
    brand: str_(r.brand, 40),
    size_oz: num_(r.size_oz) || "",
    listed_price: listed,
    reported_price: Math.round(reported * 100) / 100,
    in_person: r.in_person === true,
    note: str_(r.note, 200),
    status: "open",
    resolved_at: "",
    confirmed_price: "",
  };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sheet_().appendRow(HEADERS.map(function (h) { return cell_(row[h]); }));
  } finally {
    lock.releaseLock();
  }
  return { ok: true, id: row.id };
}

function listReports_() {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  return values.map(function (v) {
    const o = {};
    HEADERS.forEach(function (h, i) { o[h] = v[i]; });
    o.size_oz = Number(o.size_oz);
    o.listed_price = Number(o.listed_price);
    o.reported_price = Number(o.reported_price);
    o.in_person = o.in_person === true || o.in_person === "TRUE";
    o.confirmed_price = o.confirmed_price === "" ? null : Number(o.confirmed_price);
    o.created_at = asText_(o.created_at);
    o.resolved_at = asText_(o.resolved_at);
    return o;
  });
}

function resolve_(body) {
  const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 200) : [];
  const status = String(body.status);
  if (!ids.length || STATUSES.indexOf(status) < 0) throw new Error("bad_request");
  let price = "";
  if (status === "confirmed") {
    price = num_(body.confirmed_price);
    if (!(price >= 0.25 && price <= 20)) throw new Error("bad_price");
    price = Math.round(price * 100) / 100;
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_();
    const last = sh.getLastRow();
    if (last < 2) return { ok: true, updated: 0 };
    const idCol = sh.getRange(2, 1, last - 1, 1).getValues();
    const col = function (h) { return HEADERS.indexOf(h) + 1; };
    const stamp = status === "open" ? "" : now_();
    let updated = 0;
    idCol.forEach(function (v, i) {
      if (ids.indexOf(String(v[0])) < 0) return;
      const row = i + 2;
      sh.getRange(row, col("status")).setValue(status);
      sh.getRange(row, col("resolved_at")).setValue(stamp);
      sh.getRange(row, col("confirmed_price")).setValue(status === "confirmed" ? price : "");
      updated++;
    });
    return { ok: true, updated: updated };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------- helpers

function requireTeam_(key) {
  const expected = PropertiesService.getScriptProperties().getProperty("TEAM_KEY");
  if (!expected) throw new Error("server_not_configured");
  if (typeof key !== "string" || key.length === 0 || key !== expected) throw new Error("unauthorized");
}

function rateLimit_() {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get("recent_reports") || 0);
  if (n >= MAX_REPORTS_PER_10_MIN) throw new Error("rate_limited");
  cache.put("recent_reports", String(n + 1), 600);
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function now_() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm");
}

function str_(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
}

function num_(v) {
  const n = Number(v);
  return isFinite(n) ? n : NaN;
}

/** Stop text that starts with = + - @ being run as a spreadsheet formula. */
function cell_(v) {
  return typeof v === "string" && /^[=+\-@]/.test(v) ? "'" + v : v;
}

function asText_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm");
  return v == null ? "" : String(v);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
