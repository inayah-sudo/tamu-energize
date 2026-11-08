/**
 * TAMU Energize - price reports backend (Google Apps Script, bound to a Google Sheet).
 *
 * Anyone using the app can SEND a report (action "report"). That is the only thing this script does:
 * nothing can read reports back through it. The team reads and works through them in the Sheet.
 *
 * Setup: see server/README.md.
 */

const SHEET_NAME = "Reports";
const HEADERS = [
  "id", "created_at", "key", "building", "vendor", "brand", "size_oz", "pack_count",
  "listed_price", "reported_price", "in_person", "note",
];
const TZ = "America/Chicago";
const MAX_REPORTS_PER_10_MIN = 60;     // simple spam brake for the whole app

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
  // building/store id | brand | size, e.g. "msc-vend|Red Bull|8.4" or "oc-h-e-b|Monster|4x16"
  if (!/^[a-z0-9-]+\|[^|]{1,40}\|(\d{1,3}x)?[0-9.]{1,6}$/i.test(key)) throw new Error("bad_key");
  const reported = num_(r.reported_price);
  const listed = r.listed_price == null ? 0 : num_(r.listed_price);   // null when the store has no price
  if (!(reported >= 0.25 && reported <= 150) || !(listed >= 0 && listed <= 150)) throw new Error("bad_price");

  rateLimit_();
  const row = {
    id: Utilities.getUuid(),
    created_at: now_(),
    key: key,
    building: str_(r.building, 40),
    vendor: str_(r.vendor, 80),
    brand: str_(r.brand, 40),
    size_oz: num_(r.size_oz) || "",
    pack_count: Math.max(1, Math.round(num_(r.pack_count) || 1)),
    listed_price: r.listed_price == null ? "" : listed,
    reported_price: Math.round(reported * 100) / 100,
    in_person: r.in_person === true,
    note: str_(r.note, 200),
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

// ---------------------------------------------------------------- helpers

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

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
