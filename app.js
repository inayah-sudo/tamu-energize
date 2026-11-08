/* app.js - TAMU Energize. Reads window.CAMPUS_DATA (data.js). */
(function () {
  "use strict";

  const DATA = window.CAMPUS_DATA;
  const TZ = (DATA.meta && DATA.meta.timezone) || "America/Chicago";
  const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const WALK_M_PER_MIN = 80; // ~3 mph
  const PHONE = window.matchMedia("(max-width: 820px)");

  // ---------------------------------------------------------------- off-campus stores
  // offcampus.js is a snapshot of the Snowflake procedures GET_ENERGY_DRINK_PRICES and
  // GET_STORE_HOURS, refreshed by .github/workflows/offcampus-snapshot.yml. Each store becomes the
  // same shape as a campus building (with the store itself as its one vendor), so the map, list,
  // detail and compare views work for both.
  const OFF = window.OFFCAMPUS_DATA || { meta: { status: "missing" }, stores: [] };
  const STALE_DAYS = 14; // older prices are labelled "may be out of date"
  const WHOLESALE_RE = /costco|sam'?s club|bj'?s wholesale/i;
  const numOrNull = (v) => (v === null || v === undefined || v === "" || !isFinite(+v) ? null : +v);
  const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "store";
  const TOWN = (Array.isArray(OFF.stores) ? OFF.stores : []).filter((s) => s && s.name).map((s, i) => {
    const id = "oc-" + slug(s.id || s.name) + (s.id ? "" : "-" + i);
    const rawType = String(s.store_type || "").toLowerCase();
    const wholesale = rawType === "wholesale" || WHOLESALE_RE.test(s.name);
    const type = wholesale ? "wholesale" : rawType === "grocery" || rawType === "convenience" ? rawType : "store";
    const drinks = (Array.isArray(s.products) ? s.products : []).filter((p) => p && p.brand).map((p) => ({
      brand: String(p.brand), product: String(p.product || p.brand),
      size_oz: numOrNull(p.size_oz), pack_count: Math.max(1, parseInt(p.pack_count, 10) || 1),
      price: numOrNull(p.price), verified: false, observed_at: String(p.last_updated || ""),
    }));
    return {
      id, name: String(s.name), short: String(s.name), pinLabel: String(s.short || s.name), priceSource: String(s.price_source || ""), diningDollars: s.accepts_dining_dollars, offcampus: true, wholesale,
      membership: s.membership_required == null ? wholesale : !!s.membership_required,
      address: String(s.address || ""), description: String(s.address || ""),
      lat: numOrNull(s.lat), lng: numOrNull(s.lng), coord_source: "osm",
      hours: s.hours && typeof s.hours === "object" ? s.hours : null, hours_text: String(s.hours_text || ""),
      vendors: [{ id, name: String(s.name), type, hours: null, location_detail: "", drinks }],
    };
  });
  const ALL_PLACES = DATA.buildings.concat(TOWN);
  const placeById = (id) => ALL_PLACES.find((b) => b.id === id) || null;
  const hasCoords = (b) => b.lat != null && b.lng != null;

  const state = {
    brand: null,        // selected brand filter, null = all
    openOnly: false,
    selected: null,     // building id shown in detail view
    tab: "places",
    you: null,          // {lat, lng} once located
    sortKey: "price",
    sortDir: 1,
    scope: "campus",    // "campus" buildings or "town" (off-campus stores)
    dash: false,        // dashboard view open?
    reports: false,     // My reports view open?
  };
  const places = () => (state.scope === "town" ? TOWN : DATA.buildings);

  // ---------------------------------------------------------------- helpers
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => (typeof n === "number" ? "$" + n.toFixed(2) : "—");
  /** Price per fluid ounce: price / total ounces (multipacks: count x ounces per can). */
  const perOz = (d) => (d.price != null && d.size_oz ? d.price / (d.size_oz * (d.pack_count || 1)) : null);
  /** Price of one can: the shelf price, or for a multipack the pack price / number of cans. */
  const perCan = (d) => (d.price != null ? d.price / (d.pack_count || 1) : null);
  const sizeLabel = (d) => ((d.pack_count || 1) > 1 ? d.pack_count + " × " : "") + (d.size_oz != null ? d.size_oz + " oz" : "size unknown");
  const parseWhen = (iso) => Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T12:00:00" : String(iso).replace(" ", "T"));
  /** "2026-11-07..." -> "Nov 7" (with the year when it isn't this year). */
  function fmtUpdated(iso) {
    const t = parseWhen(iso);
    if (!iso || isNaN(t)) return iso ? String(iso) : "date unknown";
    const d = new Date(t);
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: sameYear ? undefined : "numeric", timeZone: TZ });
  }
  const isStale = (iso) => { const t = parseWhen(iso); return !isNaN(t) && Date.now() - t > STALE_DAYS * 864e5; };
  /** Dining Dollars tag; shows nothing until the team has recorded it for that vendor. */
  function ddBadge(accepts) {
    if (accepts === true) return ' <span class="badge verified">Takes Dining Dollars</span>';
    if (accepts === false) return ' <span class="badge">No Dining Dollars</span>';
    return "";
  }

  /** Off-campus value pill: price per can, e.g. "$2.08/can". */
  function valueTag(d) {
    const p = perCan(d);
    return p == null ? "—" : '<span class="price price-can" aria-label="$' + p.toFixed(2) + ' per can">$' + p.toFixed(2) + '<span class="cents">/can</span></span>';
  }
  /** Price pill: "$2.50" with the cents set slightly smaller. */
  function priceTag(n, size) {
    if (typeof n !== "number") return "—";
    const [d, c] = n.toFixed(2).split(".");
    return '<span class="price' + (size ? " price-" + size : "") + '" aria-label="$' + d + "." + c + '">$' + d +
      '<span class="cents">.' + c + "</span></span>";
  }
  const vendorLabel = (v) => v.label || v.name;
  const TYPE_LABEL = {
    vending: "Vending machine", bookstore: "Bookstore", market: "Campus market", store: "Store",
    grocery: "Grocery store", convenience: "Convenience store", wholesale: "Wholesale club",
  };
  const typeLabel = (t) => TYPE_LABEL[t] || t;
  /** data-tip attribute holding tooltip HTML (parts must already be escaped). */
  const tipAttr = (html) => ' data-tip="' + esc(html) + '"';

  // ---------------------------------------------------------------- price reports
  // Anyone can report a price that looks wrong (the flag next to each price).
  //  * Every report is kept in this browser, so people can look back at their own (My reports).
  //  * When config.js has a reportsEndpoint, the report also goes to the team's Google Sheet through
  //    Apps Script (server/Code.gs). The app never reads reports back; the team reads the Sheet.
  const CONFIG = window.APP_CONFIG || {};
  const ENDPOINT = String(CONFIG.reportsEndpoint || "").trim();
  const REMOTE = /^https:\/\//i.test(ENDPOINT);
  const KEYS = {
    mine: "tamuEnergize.myReports.v1",    // reports made in this browser
    outbox: "aggieEnergyMap.outbox.v1",   // reports waiting to be sent (offline)
  };
  const store = {
    get(k, fallback) {
      try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
    },
    set(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
    },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  const asArray = (v) => (Array.isArray(v) ? v : []);

  // Older versions kept test reports and a team key here: keep the reports, drop the rest.
  (function migrateOldStorage() {
    const old = asArray(store.get("aggieEnergyMap.reports.v1", []));
    if (old.length) {
      const list = asArray(store.get(KEYS.mine, []));
      old.forEach((r) => list.push(Object.assign({}, r, { delivery: "saved" })));
      store.set(KEYS.mine, list);
    }
    ["aggieEnergyMap.reports.v1", "aggieEnergyMap.team.v1", "aggieEnergyMap.priceUpdates.v1"].forEach((k) => store.del(k));
  })();

  let mine = asArray(store.get(KEYS.mine, []));
  let outbox = asArray(store.get(KEYS.outbox, []));
  function saveMine() {
    if (!store.set(KEYS.mine, mine)) toast("Couldn't save in this browser (private window?).");
  }

  /** Stable id for one drink at one vendor, e.g. "msc-vend|Red Bull|8.4" or "oc-heb|Monster|12x16". */
  const drinkKey = (v, d) => v.id + "|" + (v.id.indexOf("oc-") === 0 ? d.product : d.brand) + "|" + ((d.pack_count || 1) > 1 ? d.pack_count + "x" : "") + d.size_oz;
  const drinkIndex = {};
  ALL_PLACES.forEach((b) => b.vendors.forEach((v) => v.drinks.forEach((d) => { drinkIndex[drinkKey(v, d)] = { b, v, d }; })));
  const findDrink = (key) => drinkIndex[key] || null;
  const myReportsFor = (key) => mine.filter((r) => r.key === key);

  /** POST to the Apps Script endpoint. text/plain body avoids a CORS preflight. */
  async function api(payload) {
    const res = await fetch(ENDPOINT, { method: "POST", body: JSON.stringify(payload), redirect: "follow" });
    let data;
    try { data = await res.json(); } catch (e) { throw new Error("bad_response"); }
    if (!data || !data.ok) throw new Error((data && data.error) || "server_error");
    return data;
  }
  const isNetworkError = (e) => e instanceof TypeError || e.message === "bad_response";

  /** Keep a report in My reports and, with a server, send it. Returns "sent" | "queued" (offline) | "saved". */
  async function sendReport(r) {
    const entry = Object.assign({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), created_at: campusIso(), delivery: "saved" }, r);
    if (REMOTE) {
      try {
        await api({ action: "report", report: r });
        entry.delivery = "sent";
      } catch (e) {
        if (!isNetworkError(e)) throw e;
        entry.delivery = "queued";
        outbox.push(Object.assign({ local_id: entry.id }, r));
        store.set(KEYS.outbox, outbox);
      }
    }
    mine.push(entry);
    saveMine();
    return entry.delivery;
  }

  async function flushOutbox() {
    if (!REMOTE || !outbox.length) return;
    const pending = outbox;
    outbox = [];
    for (const item of pending) {
      const report = Object.assign({}, item);
      delete report.local_id;
      try {
        await api({ action: "report", report });
        const m = mine.find((x) => x.id === item.local_id);
        if (m) m.delivery = "sent";
      } catch (e) { if (isNetworkError(e)) outbox.push(item); }
    }
    store.set(KEYS.outbox, outbox);
    saveMine();
    render();
  }

  /** Current campus time as "YYYY-MM-DDTHH:mm". */
  function campusIso(date) {
    const p = {};
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(date || new Date()).forEach((x) => { p[x.type] = x.value; });
    return p.year + "-" + p.month + "-" + p.day + "T" + (p.hour === "24" ? "00" : p.hour) + ":" + p.minute;
  }
  /** "2026-11-07T19:12" -> "Nov 7, 7:12 PM" */
  function fmtStamp(iso) {
    if (!iso) return "—";
    const [d, t] = iso.split("T");
    const [, m, day] = d.split("-").map(Number);
    const [hh, mm] = (t || "00:00").split(":").map(Number);
    return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1] + " " + day + ", " + fmtMin(hh * 60 + mm);
  }

  const FLAG_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M5 21V4m0 0h11l-2 4 2 4H5"/></svg>';
  /** Table cell with the "report incorrect price" flag button for one drink. */
  function flagCell(v, d) {
    return '<td class="act"><button type="button" class="flag-btn" data-report="' + esc(drinkKey(v, d)) +
      '" title="Report incorrect price" aria-label="Report incorrect price for ' + esc(d.brand + " " + d.size_oz + " oz at " + v.name) + '">' +
      FLAG_SVG + "</button></td>";
  }
  /** "you reported" tag on drinks this browser has reported. */
  function reportedBadge(v, d) {
    const list = myReportsFor(drinkKey(v, d));
    if (!list.length) return "";
    const last = list[list.length - 1];
    return ' <span class="badge reported" title="You reported ' + money(last.reported_price) + " on " + esc(fmtStamp(last.created_at)) + '">you reported</span>';
  }

  let toastTimer;
  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
  }

  /** Current day index (0 = Monday) and minute-of-day in the campus time zone. */
  function campusNow() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t).value;
    const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday"));
    const hour = parseInt(get("hour"), 10) % 24;
    return { day, minute: hour * 60 + parseInt(get("minute"), 10) };
  }

  const toMin = (hhmm) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + (m || 0);
  };

  /** "07:00-22:00,23:00-02:00" -> [[420,1320],[1380,1560]] (end may pass 1440 = next day). */
  function parseDay(spec) {
    if (!spec || spec === "closed") return [];
    if (spec === "24h") return [[0, 1440]];
    return spec.split(",").map((w) => {
      const [a, b] = w.trim().split("-");
      const s = toMin(a);
      let e = toMin(b);
      if (e <= s) e += 1440;
      return [s, e];
    });
  }

  function fmtMin(m) {
    m = ((m % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60), mm = m % 60;
    if (h === 0 && mm === 0) return "midnight";
    if (h === 12 && mm === 0) return "noon";
    const ap = h < 12 ? "AM" : "PM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + (mm ? ":" + String(mm).padStart(2, "0") : "") + " " + ap;
  }

  function fmtDaySpec(spec) {
    if (!spec || spec === "closed") return "Closed";
    if (spec === "24h") return "Open 24 hours";
    return parseDay(spec).map(([s, e]) => fmtMin(s) + " – " + fmtMin(e)).join(", ");
  }

  /** Open/closed status for an hours object at the current campus time. */
  function statusOf(hours) {
    if (!hours) return { open: false, text: "Hours unknown" };
    const { day, minute } = campusNow();
    const today = parseDay(hours[DAYS[day]]);
    const yesterday = parseDay(hours[DAYS[(day + 6) % 7]]);

    // Still in a window that started yesterday and runs past midnight?
    for (const [, e] of yesterday) {
      if (e > 1440 && minute < e - 1440) return { open: true, text: "Open · closes " + fmtMin(e) };
    }
    for (const [s, e] of today) {
      if (minute >= s && minute < e) {
        if (s === 0 && e === 1440) return { open: true, text: "Open 24 hours" };
        return { open: true, text: "Open · closes " + fmtMin(e) };
      }
    }
    // Closed: find the next opening in the coming week.
    for (let k = 0; k < 8; k++) {
      const d = (day + k) % 7;
      for (const [s] of parseDay(hours[DAYS[d]])) {
        if (k === 0 && s <= minute) continue;
        const when = k === 0 ? "" : k === 1 ? " tomorrow" : " " + DAY_NAMES[d].slice(0, 3);
        return { open: false, text: "Closed · opens " + fmtMin(s) + when };
      }
    }
    return { open: false, text: "Closed" };
  }

  const vendorHours = (b, v) => v.hours || b.hours;

  const statusPill = (st, prefix) =>
    '<span class="status ' + (st.open ? "open" : "closed") + '"><span class="dot ' + (st.open ? "open" : "closed") + '"></span>' +
    (prefix ? esc(prefix) + " · " : "") + esc(st.text) + "</span>";

  function distanceM(a, b) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const x = Math.sin(dLat / 2) ** 2 +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function fmtDist(m, byCar) {
    const mi = m / 1609.34;
    if (byCar) return mi.toFixed(1) + " mi away";
    const walk = Math.max(1, Math.round(m / WALK_M_PER_MIN));
    return (mi < 0.1 ? Math.round(m * 3.281) + " ft" : mi.toFixed(2) + " mi") + " · ~" + walk + " min walk";
  }

  // ---------------------------------------------------------------- derived data
  /** Flat list of every drink with its place and vendor (defaults to the current scope). */
  function allRows(list) {
    const rows = [];
    for (const b of list || places()) {
      for (const v of b.vendors) {
        const st = statusOf(vendorHours(b, v));
        for (const d of v.drinks) rows.push({ b, v, d, open: st.open, statusText: st.text });
      }
    }
    return rows;
  }

  function brands() {
    const set = new Set();
    places().forEach((b) => b.vendors.forEach((v) => v.drinks.forEach((d) => set.add(d.brand))));
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  /**
   * Summary of one place under the current filters. On campus the headline drink is the cheapest;
   * off campus, where multipacks are common, it is the lowest price per can.
   */
  function summary(b) {
    let cheapest = null, count = 0, anyOpen = false;
    const town = !!b.offcampus;
    for (const v of b.vendors) {
      const open = statusOf(vendorHours(b, v)).open;
      if (open) anyOpen = true;
      for (const d of v.drinks) {
        if (state.brand && d.brand !== state.brand) continue;
        if (state.openOnly && !open) continue;
        if (d.price == null) continue;
        count++;
        const better = !cheapest || (town ? perCan(d) < perCan(cheapest.d) : d.price < cheapest.d.price);
        if (better) cheapest = { d, v };
      }
    }
    return { cheapest, count, anyOpen, matches: count > 0 };
  }

  // ---------------------------------------------------------------- map
  const map = L.map("map", { zoomControl: false, attributionControl: false, zoomSnap: 0.25 }).setView([30.6170, -96.3405], 16);
  L.control.zoom({ position: "bottomleft" }).addTo(map);
  L.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);
  // Standard OpenStreetMap tiles (no API key). styles.css mutes their colours for a cleaner look.
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const markers = {};
  for (const b of ALL_PLACES) {
    if (!hasCoords(b)) continue; // off-campus stores the snapshot couldn't place stay list-only
    const m = L.marker([b.lat, b.lng], { icon: L.divIcon({ className: "pin-wrap", html: "", iconSize: [0, 0] }), title: b.name, keyboard: true });
    m.on("click", () => selectBuilding(b.id, false));
    markers[b.id] = m; // added to the map by renderMarkers when its scope is showing
  }

  function syncZoomClass() {
    const z = map.getZoom(), el = map.getContainer();
    el.classList.toggle("zoomed-out", z < 15.5);
    el.classList.toggle("zoomed-in", z >= 17);
  }
  map.on("zoomend", syncZoomClass);
  syncZoomClass();

  // The map is always draggable and zoomable. On narrow layouts it only takes part of the screen,
  // so the page still scrolls from the header and the list below it.

  /** Bounds of the pins in the current scope (campus when there's nothing off campus to show). */
  function scopeBounds() {
    let pts = places().filter(hasCoords).map((b) => [b.lat, b.lng]);
    if (!pts.length) pts = DATA.buildings.map((b) => [b.lat, b.lng]);
    return L.latLngBounds(pts).pad(0.05);
  }
  function fitCampus() {
    map.invalidateSize();
    // Keep the pins clear of the floating header and side panel on wide screens.
    const pad = PHONE.matches
      ? { paddingTopLeft: [124, 40], paddingBottomRight: [96, 36] } // room for labels that hang beside their pin
      : { paddingTopLeft: [state.scope === "town" ? 100 : 60, 60], paddingBottomRight: [state.scope === "town" ? 100 : 60, 40] };
    map.fitBounds(scopeBounds(), Object.assign({ maxZoom: 17, animate: false }, pad));
    syncZoomClass();
  }
  // The container may not have its final size yet (styles still loading), so fit once it does.
  if (document.readyState === "complete") setTimeout(fitCampus, 0);
  else window.addEventListener("load", fitCampus);
  // The map's box keeps settling as fonts and the layout load. Re-fit whenever it changes size,
  // until the person moves the map themselves.
  let mapTouched = false;
  ["mousedown", "touchstart", "wheel", "keydown"].forEach((ev) =>
    map.getContainer().addEventListener(ev, () => { mapTouched = true; }, { passive: true }));
  if (window.ResizeObserver) {
    new ResizeObserver(() => {
      map.invalidateSize();
      if (!mapTouched && !state.selected) fitCampus();
    }).observe(map.getContainer());
  }

  function renderMarkers() {
    const town = state.scope === "town";
    for (const b of ALL_PLACES) {
      const m = markers[b.id];
      if (!m) continue;
      if (!!b.offcampus !== town) { if (map.hasLayer(m)) m.remove(); continue; }
      if (!map.hasLayer(m)) m.addTo(map);
      const s = summary(b);
      const cls = ["pin"];
      if (state.selected === b.id) cls.push("selected");
      if ((state.brand || state.openOnly) && !s.matches) cls.push("dim");
      if (b.coord_source !== "osm") cls.push("approx");
      if (b.label_dir && b.label_dir !== "top") cls.push("dir-" + b.label_dir);
      const sub = b.offcampus ? typeLabel(b.vendors[0].type) : [...new Set(b.vendors.map(vendorLabel))].join(" · ");
      const price = s.cheapest ? money(b.offcampus ? perCan(s.cheapest.d) : s.cheapest.d.price) : "";
      const html = '<div class="' + cls.join(" ") + '">' +
        '<div class="pin-row"><span class="dot ' + (s.anyOpen ? "open" : "closed") + '"></span>' +
        '<span class="pin-name">' + esc(b.pinLabel || b.short) + "</span>" +
        (price ? '<span class="pin-price">' + price + "</span>" : "") + "</div>" +
        '<div class="pin-sub">' + esc(sub) + "</div></div>";
      m.setIcon(L.divIcon({ className: "pin-wrap", html, iconSize: [0, 0] }));
      m.setZIndexOffset(state.selected === b.id ? 1000 : 0);
    }
  }

  // Right-click / long-press anywhere to read coordinates (for fixing data.js).
  map.on("contextmenu", (e) => {
    const txt = "lat: " + e.latlng.lat.toFixed(5) + ", lng: " + e.latlng.lng.toFixed(5);
    L.popup().setLatLng(e.latlng)
      .setContent('<div class="coord-pop">Coordinates for data.js<br><code>' + txt + "</code></div>")
      .openOn(map);
  });

  let youMarker = null;
  function locate() {
    if (!navigator.geolocation) return alert("Location isn't available in this browser.");
    const label = $("#locateBtn span");
    label.textContent = "Locating…";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.you = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (youMarker) youMarker.remove();
        youMarker = L.marker([state.you.lat, state.you.lng], {
          icon: L.divIcon({ className: "", html: '<div class="you-dot"></div>', iconSize: [16, 16] }),
          title: "You are here",
        }).addTo(map);
        label.textContent = "Near me";
        render();
      },
      (err) => {
        label.textContent = "Near me";
        alert("Couldn't get your location: " + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // ---------------------------------------------------------------- panel: filters
  function renderChips() {
    const box = $("#brandChips");
    const scroll = box.scrollLeft; // keep the row where the user left it
    const list = [null, ...brands()];
    box.innerHTML = list.map((br) =>
      '<button type="button" class="chip' + (state.brand === br ? " active" : "") + '" data-brand="' + esc(br || "") + '">' +
      esc(br || "All brands") + "</button>").join("");
    box.scrollLeft = scroll;
  }
  $("#brandChips").addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    state.brand = btn.dataset.brand || null;
    render();
  });
  $("#openNow").addEventListener("change", (e) => { state.openOnly = e.target.checked; render(); });

  // ---------------------------------------------------------------- panel: places list
  const NOT_CONNECTED = '<div class="empty"><b>Off-campus prices aren\'t connected yet</b>Grocery, convenience and wholesale stores around College Station show up here once the Snowflake price snapshot has run.</div>';

  function renderPlaces() {
    const town = state.scope === "town";
    const list = places();
    if (!list.length) {
      $("#placesView").innerHTML = town ? NOT_CONNECTED : '<div class="empty"><b>No places yet</b></div>';
      return;
    }
    const items = list.map((b) => ({ b, s: summary(b), dist: state.you && hasCoords(b) ? distanceM(state.you, b) : null }));
    const val = (s) => (s.cheapest ? (town ? perCan(s.cheapest.d) : s.cheapest.d.price) : Infinity);
    const far = (d) => (d == null ? Infinity : d);
    items.sort((x, y) => {
      if ((state.brand || state.openOnly) && x.s.matches !== y.s.matches) return x.s.matches ? -1 : 1;
      // A closed place can't sell you anything, however cheap: open places always come first.
      if (x.s.anyOpen !== y.s.anyOpen) return x.s.anyOpen ? -1 : 1;
      if (state.you) return far(x.dist) - far(y.dist);
      return val(x.s) - val(y.s) || x.b.short.localeCompare(y.b.short);
    });

    const hint = "Open now first, then " + (state.you ? "nearest" :
      town ? "lowest price per can" + (state.brand ? " for " + esc(state.brand) : "") :
      state.brand ? "cheapest " + esc(state.brand) : "cheapest drink");

    $("#placesView").innerHTML = '<p class="hint">' + items.length + (town ? " stores" : " places") + " · " + hint + "</p>" +
      items.map(({ b, s, dist }) => {
        const dim = (state.brand || state.openOnly) && !s.matches;
        const c = s.cheapest;
        const price = c
          ? '<span class="price-big">' + (town ? valueTag(c.d) : priceTag(c.d.price)) + "</span>"
          : '<span class="none">' + (state.brand ? "No " + esc(state.brand) : town ? "No prices" : "—") + "</span>";
        const line = !c ? ""
          : town ? "Cheapest can: " + esc(c.d.brand) + " " + esc(sizeLabel(c.d)) + ((c.d.pack_count || 1) > 1 ? " · " + money(c.d.price) + " pack" : "")
          : "Cheapest: " + esc(c.d.brand) + " " + c.d.size_oz + " oz · " + esc(vendorLabel(c.v));
        const sub = town ? esc(b.address || "Address not listed") : b.vendors.map((v) => esc(vendorLabel(v))).join(" · ");
        const full = town ? esc(typeLabel(b.vendors[0].type)) : esc(b.name);
        const closedText = town ? (b.hours ? "Closed now" : "Hours unknown") : "Nothing open right now";
        return '<button type="button" class="card' + (dim ? " dim" : "") + '" data-id="' + b.id + '">' +
          '<div class="card-top"><div><span class="title">' + esc(b.short) + '</span><span class="full">' + full + "</span></div>" + price + "</div>" +
          '<div class="stores">' + sub + "</div>" +
          (line ? '<div class="cheap">' + line + "</div>" : "") +
          '<div class="card-meta">' + statusPill(s.anyOpen ? { open: true, text: "Open now" } : { open: false, text: closedText }) +
          (town && b.wholesale ? '<span class="badge">' + (b.membership ? "Membership required" : "Wholesale") + "</span>" : "") +
          (town && !hasCoords(b) ? '<span class="badge">Not on map</span>' : "") +
          (dist != null ? '<span class="dist">' + fmtDist(dist, town) + "</span>" : "") + "</div>" +
          "</button>";
      }).join("");
  }
  $("#placesView").addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (card) selectBuilding(card.dataset.id, true);
  });

  // ---------------------------------------------------------------- panel: detail
  function hoursTable(hours) {
    const { day } = campusNow();
    return '<table class="hours"><tbody>' + DAYS.map((d, i) =>
      '<tr class="' + (i === day ? "today" : "") + '"><td>' + DAY_NAMES[i] + (i === day ? " (today)" : "") +
      '</td><td class="num">' + esc(fmtDaySpec(hours[d])) + "</td></tr>").join("") +
      "</tbody></table>";
  }

  // Team to-do notes in data.js, e.g. "(fill in floor and wing)", stay in the data, the CSV
  // and the team's Reports page, but are never shown to visitors.
  function publicLoc(v) {
    return String(v.location_detail || "").replace(/\s*\((?:fill in|todo|tbd)[^)]*\)/gi, "").trim();
  }

  const BACK_BTN = '<button type="button" class="back" id="backBtn"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M15 6l-6 6 6 6"/></svg>All places</button>';

  /** Detail view for an off-campus store: one shelf, ranked by price per can. */
  function renderTownDetail(b) {
    const v = b.vendors[0];
    const dir = "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=" +
      (hasCoords(b) ? b.lat + "," + b.lng : encodeURIComponent(b.name + " " + b.address));
    const canOf = (d) => (perCan(d) == null ? Infinity : perCan(d));
    const drinks = v.drinks.filter((d) => !state.brand || d.brand === state.brand).slice().sort((a, c) => canOf(a) - canOf(c));
    const best = drinks.find((d) => perCan(d) != null);
    const updated = (d) => !d.observed_at ? '<span class="badge unverified">date unknown</span>'
      : isStale(d.observed_at) ? '<span class="badge unverified" title="Last updated more than ' + STALE_DAYS + ' days ago">' + esc(fmtUpdated(d.observed_at)) + " · may be out of date</span>"
      : '<span class="badge verified" title="When this price was last updated">' + esc(fmtUpdated(d.observed_at)) + "</span>";
    const rows = drinks.map((d) => '<tr class="' + (d === best ? "best" : "") + '"><td><b>' + esc(d.brand) + '</b><span class="sm">' + esc(d.product) + "</span></td>" +
      '<td class="num">' + esc(sizeLabel(d)) + "</td>" +
      '<td class="num">' + (d.price != null ? priceTag(d.price, "sm") + ((d.pack_count || 1) > 1 ? '<span class="sm">' + money(perCan(d)) + "/can</span>" : "") : '<span class="sm">Price unavailable</span>') + "</td>" +
      '<td class="num">' + updated(d) + reportedBadge(v, d) + "</td>" + flagCell(v, d) + "</tr>").join("");

    $("#detailView").innerHTML = '<div class="detail">' + BACK_BTN +
      "<h2>" + esc(b.name) + "</h2>" +
      '<p class="desc">' + esc(b.address || "Address not listed") + "</p>" +
      '<div class="detail-actions"><span class="badge">' + esc(typeLabel(v.type)) + "</span>" + ddBadge(b.diningDollars) +
      (b.hours ? statusPill(statusOf(b.hours), "Store") : '<span class="status closed"><span class="dot closed"></span>Hours unknown</span>') +
      '<a class="link-btn" href="' + dir + '" target="_blank" rel="noopener">Directions</a>' +
      (state.you && hasCoords(b) ? '<span class="dist">' + fmtDist(distanceM(state.you, b), true) + "</span>" : "") + "</div>" +
      (b.wholesale ? '<div class="note"><b>Wholesale club.</b> ' + (b.membership ? "You need a membership to buy here. " : "") + "Most prices are for multipacks, so compare them by price per can.</div>" : "") +
      (!hasCoords(b) ? '<div class="note">This store couldn\'t be placed on the map from its address.</div>' : "") +
      '<div class="section-title">Energy drinks' + (state.brand ? " · " + esc(state.brand) : "") +
      "</div>" +
      (drinks.length
        ? '<div class="vendor"><table><thead><tr><th>Drink</th><th class="num">Size</th><th class="num">Price</th><th class="num">Updated</th><th><span class="sr-only">Report</span></th></tr></thead><tbody>' + rows + "</tbody></table></div>"
        : '<div class="hint">' + (state.brand ? "No " + esc(state.brand) + " here." : "No energy drink prices for this store yet.") + "</div>") +
      '<div class="section-title">Store hours</div>' +
      (b.hours ? hoursTable(b.hours) : '<p class="desc">' + (b.hours_text ? esc(b.hours_text) : "Hours aren't available for this store yet.") + "</p>") +
      "</div>";
    $("#backBtn").addEventListener("click", () => { state.selected = null; render(); });
  }

  function renderDetail() {
    const b = placeById(state.selected);
    if (!b) return;
    if (b.offcampus) return renderTownDetail(b);
    const dir = "https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=" + b.lat + "," + b.lng;

    const vendorsHtml = b.vendors.map((v) => {
      const vh = vendorHours(b, v);
      const drinks = v.drinks
        .filter((d) => !state.brand || d.brand === state.brand)
        .slice().sort((a, c) => a.price - c.price);
      const minPrice = drinks.length ? drinks[0].price : null;
      const rows = drinks.map((d) => {
        const ppo = perOz(d);
        return '<tr class="' + (d.price === minPrice ? "best" : "") + '"><td><b>' + esc(d.brand) + '</b><span class="sm">' + esc(d.product) + "</span></td>" +
          '<td class="num">' + esc(d.size_oz) + " oz</td>" +
          '<td class="num">' + priceTag(d.price, "sm") + '<span class="sm">' + (ppo ? "$" + ppo.toFixed(3) + "/oz" : "") + "</span></td>" +
          '<td class="num">' + reportedBadge(v, d) + "</td>" + flagCell(v, d) + "</tr>";
      }).join("");
      return '<div class="vendor">' +
        '<div class="vendor-head"><h5>' + esc(v.name) + ' <span class="badge ' + esc(v.type) + '">' + esc(typeLabel(v.type)) + "</span>" + ddBadge(v.accepts_dining_dollars) + "</h5>" +
        statusPill(statusOf(vh)) + "</div>" +
        (publicLoc(v) ? '<div class="loc">' + esc(publicLoc(v)) + "</div>" : "") +
        (drinks.length
          ? '<table><thead><tr><th>Drink</th><th class="num">Size</th><th class="num">Price</th><th></th><th><span class="sr-only">Report</span></th></tr></thead><tbody>' + rows + "</tbody></table>"
          : '<div class="hint">No ' + esc(state.brand) + " here.</div>") +
        "<details><summary>" + (v.hours ? "Store hours" : "Hours: same as building") +
        "</summary>" + hoursTable(vh) + "</details>" +
        "</div>";
    }).join("");

    $("#detailView").innerHTML = '<div class="detail">' +
      '<button type="button" class="back" id="backBtn"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M15 6l-6 6 6 6"/></svg>All places</button>' +
      "<h2>" + esc(b.name) + "</h2>" +
      '<p class="desc">' + esc(b.description) + "</p>" +
      '<div class="detail-actions">' + statusPill(statusOf(b.hours), "Building") +
      '<a class="link-btn" href="' + dir + '" target="_blank" rel="noopener">Walking directions</a>' +
      (state.you ? '<span class="dist">' + fmtDist(distanceM(state.you, b)) + "</span>" : "") + "</div>" +
      (b.coord_source !== "osm" ? '<div class="note">Map position is approximate. Right-click (or long-press) the map at the right spot to get coordinates for data.js.</div>' : "") +
      '<div class="section-title">Energy drinks' + (state.brand ? " · " + esc(state.brand) : "") +
      "</div>" + vendorsHtml +
      '<div class="section-title">Building hours</div>' +
      hoursTable(b.hours) +
      "</div>";
    $("#backBtn").addEventListener("click", () => { state.selected = null; render(); });
  }

  function selectBuilding(id, pan) {
    const b = placeById(id);
    if (!b) return;
    const scope = b.offcampus ? "town" : "campus";
    const switched = scope !== state.scope;
    if (switched) setScope(scope, true);
    state.selected = id;
    state.tab = "places";
    render();
    if (pan && hasCoords(b)) map.flyTo([b.lat, b.lng], Math.max(map.getZoom(), 17), { duration: 0.6 });
    else if (switched) fitCampus();
    $("#detailView").scrollTop = 0;
    if (PHONE.matches) $("#detailView").scrollIntoView({ behavior: "smooth" });
  }

  // ---------------------------------------------------------------- panel: compare
  function renderCompare() {
    const town = state.scope === "town";
    const rows = allRows().filter((r) => (!state.brand || r.d.brand === state.brand) && (!state.openOnly || r.open));
    if (!rows.length) {
      $("#compareView").innerHTML = town && !TOWN.length ? NOT_CONNECTED
        : '<div class="empty"><b>Nothing matches</b>Try another brand, or turn off Open now.</div>';
      return;
    }
    const big = (x) => (x == null ? Infinity : x);
    const key = {
      brand: (r) => r.d.brand + r.d.product,
      size: (r) => (r.d.size_oz || 0) * (r.d.pack_count || 1),
      price: (r) => big(r.d.price),
      ppo: (r) => big(perOz(r.d)),
      can: (r) => big(perCan(r.d)),
      place: (r) => r.b.short + r.v.name,
      dist: (r) => (state.you && hasCoords(r.b) ? distanceM(state.you, r.b) : Infinity),
    }[state.sortKey];
    rows.sort((a, b) => {
      const x = key(a), y = key(b);
      return (x < y ? -1 : x > y ? 1 : 0) * state.sortDir;
    });
    const head = (k, label, num) =>
      '<th class="' + (num ? "num" : "") + '"><button type="button" data-sort="' + k + '">' + label +
      (state.sortKey === k ? (state.sortDir === 1 ? " ↑" : " ↓") : "") + "</button></th>";
    const note = town ? "prices from each store's latest data" : "";

    $("#compareView").innerHTML =
      '<p class="hint">' + rows.length + " drinks · " + (note ? note + " · " : "") + "tap a row to see it on the map · tap a column to sort</p>" +
      '<table class="compare"><thead><tr>' + head("brand", "Drink") + head("size", "oz", 1) + head("price", "Price", 1) +
      (town ? head("can", "$/can", 1) : head("ppo", "$/oz", 1)) + head("place", "Where") + (state.you ? head("dist", "Dist", 1) : "") + '<th><span class="sr-only">Report</span></th></tr></thead><tbody>' +
      rows.map((r) => {
        const ppo = perOz(r.d);
        const tag = town
          ? (r.d.observed_at && isStale(r.d.observed_at) ? ' · <span class="badge unverified">may be out of date</span>' : "")
          : "";
        return '<tr data-id="' + r.b.id + '"><td><b>' + esc(r.d.brand) + "</b>" +
          '<span class="sm">' + esc(r.d.product) + tag + reportedBadge(r.v, r.d) + "</span></td>" +
          '<td class="num">' + ((r.d.pack_count || 1) > 1 ? r.d.pack_count + "×" : "") + esc(r.d.size_oz == null ? "?" : r.d.size_oz) + "</td>" +
          '<td class="num"><b>' + money(r.d.price) + "</b></td>" +
          '<td class="num">' + (town ? (perCan(r.d) != null ? perCan(r.d).toFixed(2) : "—") : ppo != null ? ppo.toFixed(3) : "—") + "</td>" +
          "<td><b>" + esc(r.b.short) + '</b><span class="where"><span class="dot ' + (r.open ? "open" : "closed") + '"></span>' + esc(town ? typeLabel(r.v.type) : vendorLabel(r.v)) + "</span></td>" +
          (state.you ? '<td class="num">' + (hasCoords(r.b) ? (distanceM(state.you, r.b) / 1609.34).toFixed(2) + " mi" : "—") + "</td>" : "") +
          flagCell(r.v, r.d) + "</tr>";
      }).join("") + "</tbody></table>";
  }
  $("#compareView").addEventListener("click", (e) => {
    const sortBtn = e.target.closest("[data-sort]");
    if (sortBtn) {
      const k = sortBtn.dataset.sort;
      state.sortDir = state.sortKey === k ? -state.sortDir : 1;
      state.sortKey = k;
      return renderCompare();
    }
    const tr = e.target.closest("tr[data-id]");
    if (tr) selectBuilding(tr.dataset.id, true);
  });

  // ---------------------------------------------------------------- tabs, header, export
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
    state.tab = t.dataset.tab;
    if (state.tab === "compare") state.selected = null;
    render();
  }));

  function renderHeader() {
    const pill = $("#verifiedCount");
    pill.hidden = state.scope !== "town"; // only the off-campus sync date is shown here
    if (state.scope === "town") {
      const ok = OFF.meta && OFF.meta.status === "ok" && TOWN.length > 0;
      pill.textContent = ok ? "Prices synced " + fmtUpdated(OFF.meta.generated_at) : "Off-campus prices not connected";
      pill.title = ok ? "When the off-campus prices were last pulled from the data source" : "The Snowflake price snapshot hasn't run yet";
      pill.classList.toggle("done", !!ok);
    } else {
      pill.textContent = "";
    }
    document.querySelectorAll("[data-scope]").forEach((b) => {
      const on = b.dataset.scope === state.scope;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on);
    });
    $(".scope").dataset.active = state.scope;
    const n = mine.length;
    const count = $("#reportsCount");
    count.textContent = n;
    count.hidden = !n;
    $("#reportsBtn").title = n ? n + " price report" + (n > 1 ? "s" : "") + " you've sent" : "Price reports you've sent";
    const { day, minute } = campusNow();
    $("#clock").textContent = DAY_NAMES[day].slice(0, 3) + " " + fmtMin(minute) + " campus time";
  }

  /** Switch between campus buildings and off-campus stores. */
  function setScope(scope, quiet) {
    if (scope === state.scope) return;
    state.scope = scope;
    state.selected = null;
    state.sortKey = scope === "town" ? "can" : "price";
    state.sortDir = 1;
    if (state.brand && brands().indexOf(state.brand) < 0) state.brand = null;
    mapTouched = false;
    if (quiet) return;
    render();
    fitCampus();
  }
  document.querySelectorAll("[data-scope]").forEach((btn) => btn.addEventListener("click", () => setScope(btn.dataset.scope)));

  // ---------------------------------------------------------------- price reports: form
  const dlg = $("#reportDialog");
  let reportingKey = null;

  /** Highest believable price: single cans stay under $20, multipacks and wholesale can run higher. */
  const maxPrice = (f) => ((f.d.pack_count || 1) > 1 || f.b.offcampus ? 150 : 20);

  function openReport(key) {
    const f = findDrink(key);
    if (!f) return;
    reportingKey = key;
    const prev = myReportsFor(key);
    const last = prev[prev.length - 1];
    $("#reportTarget").innerHTML =
      "<b>" + esc(f.b.offcampus ? f.d.product : f.d.brand) + " · " + esc(sizeLabel(f.d)) + "</b><br>" +
      esc(f.b.offcampus ? f.b.name + (f.b.address ? " · " + f.b.address : "") : f.v.name + " · " + f.b.name) +
      "<br>Listed price: <b>" + money(f.d.price) + "</b> " +
      (f.b.offcampus
        ? '<span class="badge ' + (f.d.observed_at && !isStale(f.d.observed_at) ? "verified" : "unverified") + '">updated ' + esc(fmtUpdated(f.d.observed_at)) + "</span>"
        : "") +
      (last ? '<span class="sm">You reported this drink' + (prev.length > 1 ? " " + prev.length + " times, most recently" : "") +
        " at " + money(last.reported_price) + " on " + esc(fmtStamp(last.created_at)) + "</span>" : "");
    $("#rpPrice").value = "";
    $("#rpPrice").max = String(maxPrice(f));
    $("#rpNote").value = "";
    $("#rpInPerson").checked = true;
    $("#rpError").hidden = true;
    hideTip();
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
    setTimeout(() => $("#rpPrice").focus(), 30);
  }
  const closeReport = () => (typeof dlg.close === "function" ? dlg.close() : dlg.removeAttribute("open"));
  dlg.addEventListener("click", (e) => { if (e.target.closest("[data-close]") || e.target === dlg) closeReport(); });

  $("#reportForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = findDrink(reportingKey);
    if (!f) return closeReport();
    const err = $("#rpError");
    const price = parseFloat($("#rpPrice").value);
    const max = maxPrice(f);
    if (!isFinite(price) || price < 0.25 || price > max) {
      err.textContent = "Enter the price you saw, between $0.25 and $" + max.toFixed(2) + ".";
      err.hidden = false;
      $("#rpPrice").focus();
      return;
    }
    const submit = $("#reportForm button[type=submit]");
    submit.disabled = true;
    submit.textContent = "Sending…";
    const report = {
      key: reportingKey,
      building: f.b.code || f.b.short,
      vendor: f.v.name,
      brand: f.d.brand,
      size_oz: f.d.size_oz,
      pack_count: f.d.pack_count || 1,
      listed_price: f.d.price,
      reported_price: Math.round(price * 100) / 100,
      in_person: $("#rpInPerson").checked,
      note: $("#rpNote").value.trim().slice(0, 200),
    };
    let result;
    try {
      result = await sendReport(report);
    } catch (ex) {
      err.textContent = ex.message === "rate_limited"
        ? "Lots of reports right now. Please try again in a few minutes."
        : "Couldn't send the report. Please try again.";
      err.hidden = false;
      return;
    } finally {
      submit.disabled = false;
      submit.textContent = "Send report";
    }
    closeReport();
    toast(result === "queued" ? "You're offline. The report is saved and will be sent automatically."
      : result === "sent" ? "Thanks! Your report was sent. You can find it under My reports."
      : "Thanks! Your report is saved under My reports.");
    render();
  });

  // Flag buttons can sit inside clickable rows, so catch them first (capture phase).
  document.addEventListener("click", (e) => {
    const btn = e.target.closest && e.target.closest("[data-report]");
    if (!btn) return;
    e.stopPropagation();
    e.preventDefault();
    openReport(btn.getAttribute("data-report"));
  }, true);

  // ---------------------------------------------------------------- my reports
  const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "±") + "$" + Math.abs(n).toFixed(2);
  const DELIVERY = { sent: ["Sent", "verified"], queued: ["Waiting to send", "unverified"], saved: ["Saved on this device", ""] };

  function renderMyReports() {
    $("#reportsSource").textContent = REMOTE
      ? "Reports you've sent from this browser. Each one also went to the TAMU Energize team. This list is saved only in this browser."
      : "Reports you've made in this browser. They're saved only on this device.";
    const queued = mine.filter((r) => r.delivery === "queued").length;
    const status = $("#reportsStatus");
    status.hidden = !queued;
    status.textContent = queued ? queued + (queued > 1 ? " reports are" : " report is") + " waiting to send. They'll go automatically when you're back online." : "";
    const list = mine.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const rows = list.map((r) => {
      const f = findDrink(r.key);
      const where = f ? (f.b.offcampus ? f.b.name : (f.b.code || f.b.short) + " · " + vendorLabel(f.v)) : [r.building, r.vendor].filter(Boolean).join(" · ");
      const diff = typeof r.listed_price === "number" && typeof r.reported_price === "number" ? r.reported_price - r.listed_price : null;
      const dl = DELIVERY[r.delivery] || DELIVERY.saved;
      const size = ((r.pack_count || 1) > 1 ? r.pack_count + " × " : "") + r.size_oz + " oz";
      return "<tr" + (f ? ' data-id="' + esc(f.b.id) + '"' : "") + "><td><b>" + esc(r.brand) + '</b><span class="sm">' + esc(size) + "</span></td>" +
        "<td>" + esc(where) + "</td>" +
        '<td class="num">' + money(r.listed_price) + "</td>" +
        '<td class="num"><b>' + money(r.reported_price) + "</b></td>" +
        '<td class="num chg ' + (diff > 0 ? "up" : diff < 0 ? "down" : "") + '">' + (diff == null ? "—" : signed(diff)) + "</td>" +
        "<td>" + esc(fmtStamp(r.created_at)) + '<span class="sm">' + (r.in_person ? "Seen in person" : "Not seen in person") + "</span></td>" +
        '<td class="notes">' + (r.note ? esc(r.note) : '<span class="sm">—</span>') + "</td>" +
        '<td><span class="badge ' + dl[1] + '">' + dl[0] + "</span></td>" +
        '<td class="num"><button type="button" class="btn btn-sm" data-forget="' + esc(r.id) + '">Remove</button></td></tr>';
    }).join("");
    $("#reportsBody").innerHTML = '<div class="w w-12">' + (list.length
      ? '<div class="table-wrap"><table><thead><tr><th>Drink</th><th>Where</th><th class="num">Listed</th><th class="num">You saw</th><th class="num">Change</th><th>When</th><th>Note</th><th>Status</th><th><span class="sr-only">Remove</span></th></tr></thead><tbody>' + rows + "</tbody></table></div>"
      : '<div class="empty"><b>No reports yet</b>See a price that looks wrong? Tap the flag next to it on the map, in Compare prices or in the Dashboard catalog.</div>') + "</div>";
  }

  $("#reportsBody").addEventListener("click", (e) => {
    const t = e.target.closest("[data-forget]");
    if (t) {
      const id = t.dataset.forget;
      const r = mine.find((x) => x.id === id);
      mine = mine.filter((x) => x.id !== id);
      outbox = outbox.filter((x) => x.local_id !== id); // a removed report that hasn't gone out yet won't be sent
      store.set(KEYS.outbox, outbox);
      saveMine();
      render();
      toast(r && r.delivery === "sent" ? "Removed from My reports. The team still has the copy you sent." : "Removed from My reports.");
      return;
    }
    const row = e.target.closest("tr[data-id]");
    if (row) { openOverlay(null); selectBuilding(row.dataset.id, true); }
  });

  $("#locateBtn").addEventListener("click", locate);

  // ---------------------------------------------------------------- dashboard
  // Rebuilds the team's Databricks dashboard (lvdash.json) from the same data the map uses:
  // 4 counters, Building & Venue Guide, Locations by Venue Type, Average Price by Building,
  // Energy Drink Catalog. Everything is computed live, so it stays in sync with data.js.

  /** {mon:"07:00-02:00",...} -> ["Mon–Thu: 7 AM – 2 AM", "Fri: ..."] (consecutive equal days merged). */
  function compressHours(hours) {
    if (!hours) return ["—"];
    const short = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const groups = [];
    DAYS.forEach((d, i) => {
      const spec = hours[d] || "closed";
      const last = groups[groups.length - 1];
      if (last && last.spec === spec) last.end = i;
      else groups.push({ spec, start: i, end: i });
    });
    if (groups.length === 1) return ["Daily: " + fmtDaySpec(groups[0].spec)];
    return groups.map((g) => (g.start === g.end ? short[g.start] : short[g.start] + "–" + short[g.end]) + ": " + fmtDaySpec(g.spec));
  }

  const dashSort = { key: "code", dir: 1 };

  function allVendors() {
    const out = [];
    DATA.buildings.forEach((b) => b.vendors.forEach((v) => out.push({ b, v, st: statusOf(vendorHours(b, v)) })));
    return out;
  }

  /** Vertical bar chart (single series, so one colour and no legend). Bars start at $0. */
  function avgPriceChart() {
    const stats = DATA.buildings.map((b) => {
      const prices = b.vendors.flatMap((v) => v.drinks.map((d) => d.price));
      const avg = prices.reduce((a, c) => a + c, 0) / prices.length;
      return { b, avg, n: prices.length, min: Math.min(...prices), max: Math.max(...prices) };
    }).filter((s) => s.n).sort((x, y) => y.avg - x.avg);

    const W = 560, H = 250, ml = 38, mr = 6, mt = 22, mb = 30;
    const iw = W - ml - mr, ih = H - mt - mb;
    const top = Math.max(1, Math.ceil(Math.max(...stats.map((s) => s.avg))));
    const y = (v) => mt + ih - (v / top) * ih;
    const band = iw / stats.length;
    const bw = Math.min(30, band * 0.5);
    const r = 6; // rounded bar tops

    let grid = "";
    for (let v = 0; v <= top; v++) {
      grid += '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>';
    }
    let axis = "";
    for (let v = 0; v <= top; v++) axis += '<text x="' + (ml - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">$' + v + "</text>";

    const cols = stats.map((s, i) => {
      const x = ml + band * i + (band - bw) / 2;
      const yt = y(s.avg), yb = y(0);
      const h = yb - yt;
      const rr = Math.min(r, h);
      const path = "M" + x + "," + yb + " V" + (yt + rr) + " Q" + x + "," + yt + " " + (x + rr) + "," + yt +
        " H" + (x + bw - rr) + " Q" + (x + bw) + "," + yt + " " + (x + bw) + "," + (yt + rr) + " V" + yb + " Z";
      const tip = "<b>" + esc(s.b.name) + "</b><br>Average " + money(s.avg) + " across " + s.n + " drinks<br>Range " +
        money(s.min) + " – " + money(s.max) + "<br><i>Click to open on the map</i>";
      return '<g class="col" data-id="' + s.b.id + '"' + tipAttr(tip) + ">" +
        '<path class="bar" d="' + path + '"/>' +
        '<text class="val" x="' + (x + bw / 2) + '" y="' + (yt - 6) + '" text-anchor="middle">' + money(s.avg) + "</text>" +
        '<text class="cat" x="' + (x + bw / 2) + '" y="' + (H - 10) + '" text-anchor="middle">' + esc(s.b.code || s.b.short) + "</text>" +
        '<rect class="hit" x="' + (ml + band * i) + '" y="' + mt + '" width="' + band + '" height="' + (ih + mb) + '"/>' +
        "</g>";
    }).join("");

    return '<div class="chart"><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Average energy drink price by building">' +
      '<g class="grid">' + grid + '</g><g class="axis">' + axis + "</g>" + cols + "</svg></div>";
  }

  /** Horizontal bars: number of locations per venue type (replaces the dashboard's pie). */
  function venueTypeBars(vendors) {
    const byType = {};
    vendors.forEach(({ b, v }) => (byType[v.type] = byType[v.type] || []).push(b.short + " " + vendorLabel(v)));
    const types = Object.entries(byType).sort((a, c) => c[1].length - a[1].length);
    const max = Math.max(...types.map((t) => t[1].length));
    return '<div class="hbars">' + types.map(([t, list]) =>
      '<div class="hbar"' + tipAttr("<b>" + esc(typeLabel(t)) + "</b>: " + list.length + " of " + vendors.length + "<br>" + esc(list.join(", "))) + ">" +
      '<span class="hbar-label">' + esc(typeLabel(t)) + "</span>" +
      '<span class="hbar-track"><span class="hbar-fill" style="display:block;width:' + (list.length / max) * 100 + '%"></span></span>' +
      '<span class="hbar-val">' + list.length + "</span>" +
      '<span class="hbar-list">' + esc(list.join(" · ")) + "</span></div>").join("") + "</div>";
  }

  function catalogTable() {
    const rows = allRows(DATA.buildings);
    const key = {
      code: (r) => (r.b.code || r.b.short) + String(r.d.price.toFixed(2)).padStart(6, "0"),
      venue: (r) => vendorLabel(r.v),
      brand: (r) => r.d.brand,
      size: (r) => r.d.size_oz,
      price: (r) => r.d.price,
      ppo: (r) => perOz(r.d) || Infinity,
    }[dashSort.key];
    rows.sort((a, b) => {
      const x = key(a), z = key(b);
      return (x < z ? -1 : x > z ? 1 : 0) * dashSort.dir;
    });
    const head = (k, label, num) => '<th class="' + (num ? "num" : "") + '"><button type="button" data-dsort="' + k + '">' + label +
      (dashSort.key === k ? (dashSort.dir === 1 ? " ↑" : " ↓") : "") + "</button></th>";
    return '<div class="table-wrap"><table><thead><tr>' + head("code", "Building") + head("venue", "Venue") + head("brand", "Brand") +
      head("size", "Size", 1) + head("price", "Price", 1) + head("ppo", "$/oz", 1) + '<th></th><th><span class="sr-only">Report</span></th></tr></thead><tbody>' +
      rows.map((r) => '<tr data-id="' + r.b.id + '"><td class="code">' + esc(r.b.code || r.b.short) + "</td><td>" + esc(vendorLabel(r.v)) +
        "</td><td><b>" + esc(r.d.brand) + '</b></td><td class="num">' + r.d.size_oz + ' oz</td><td class="num"><b>' + money(r.d.price) +
        '</b></td><td class="num">$' + (perOz(r.d) || 0).toFixed(2) + '</td><td class="num">' +
        reportedBadge(r.v, r.d) +
        "</td>" + flagCell(r.v, r.d) + "</tr>").join("") +
      "</tbody></table></div>";
  }

  function renderDashboard() {
    const rows = allRows(DATA.buildings);
    const vendors = allVendors();
    const openVendors = vendors.filter((x) => x.st.open).length;
    const openBuildings = DATA.buildings.filter((b) => statusOf(b.hours).open).length;
    const brandList = brands();
    const cheapest = rows.slice().sort((a, b) => a.d.price - b.d.price)[0];

    $("#dashSource").textContent = "Source: " + (DATA.meta.source || "data.js");

    const kpi = (label, value, note) => '<div class="w w-3 kpi"><span class="kpi-label">' + label + '</span><span class="kpi-value">' + value +
      '</span><span class="kpi-note">' + note + "</span></div>";

    const guide = vendors.map(({ b, v, st }) => '<tr data-id="' + b.id + '"><td class="code">' + esc(b.code || b.short) + "</td><td>" + esc(b.name) +
      '</td><td class="hours-cell">' + compressHours(b.hours).map(esc).join("<br>") + "</td><td><b>" + esc(vendorLabel(v)) +
      '</b></td><td><span class="badge ' + esc(v.type) + '">' + esc(typeLabel(v.type)) + '</span></td><td class="hours-cell">' +
      (v.hours ? compressHours(v.hours).map(esc).join("<br>") : '<span class="sm">Building hours</span>') + "</td><td>" + statusPill(st) + "</td></tr>").join("");

    $("#dashBody").innerHTML =
      kpi("Buildings mapped", DATA.buildings.length, '<span class="dot open"></span>' + openBuildings + " open right now") +
      kpi("Campus locations", vendors.length, '<span class="dot open"></span>' + openVendors + " selling drinks right now") +
      kpi("Energy drink brands", brandList.length, esc(brandList.join(" · "))) +
      kpi("Drink options", rows.length, "Cheapest: " + esc(cheapest.d.brand) + " " + money(cheapest.d.price) + " at " + esc(cheapest.b.short)) +

      '<div class="w w-12"><h3>Building and venue guide</h3><p class="w-sub">Every place to buy an energy drink, with its hours. Click a row to open it on the map.</p>' +
      '<div class="table-wrap"><table><thead><tr><th>Code</th><th>Building</th><th>Building hours</th><th>Venue</th><th>Type</th><th>Venue hours</th><th>Now</th></tr></thead><tbody>' +
      guide + "</tbody></table></div></div>" +

      '<div class="w w-7"><h3>Average energy drink price by building</h3><p class="w-sub">Mean shelf price of every drink listed there. Hover for the range, click to open on the map.</p>' +
      avgPriceChart() + "</div>" +

      '<div class="w w-5"><h3>Locations by venue type</h3><p class="w-sub">Number of places selling energy drinks, by kind of venue.</p>' +
      venueTypeBars(vendors) + "</div>" +

      '<div class="w w-12"><h3>Energy drink catalog</h3><p class="w-sub">' + rows.length + " drinks. Click a column to sort, a row to open it on the map.</p>" +
      catalogTable() + "</div>";
  }

  /** Show one full-screen overlay ("dash" | "reports") or none (null). */
  function openOverlay(name) {
    state.dash = name === "dash";
    state.reports = name === "reports";
    hideTip();
    render();
    if (name) $(name === "dash" ? "#dashboard" : "#reportsView").scrollTop = 0;
  }
  const openDashboard = (on) => openOverlay(on ? "dash" : null);
  $("#dashBtn").addEventListener("click", () => openOverlay("dash"));
  $("#dashClose").addEventListener("click", () => openOverlay(null));
  $("#reportsBtn").addEventListener("click", () => openOverlay("reports"));
  $("#myReportsLink").addEventListener("click", () => openOverlay("reports"));
  $("#reportsClose").addEventListener("click", () => openOverlay(null));

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || dlg.open) return; // the report dialog handles its own Esc
    if (state.dash || state.reports) openOverlay(null);
  });

  $("#dashBody").addEventListener("click", (e) => {
    const sortBtn = e.target.closest("[data-dsort]");
    if (sortBtn) {
      const k = sortBtn.dataset.dsort;
      dashSort.dir = dashSort.key === k ? -dashSort.dir : 1;
      dashSort.key = k;
      return renderDashboard();
    }
    const target = e.target.closest("[data-id]");
    if (target) {
      openDashboard(false);
      selectBuilding(target.dataset.id, true);
    }
  });

  // Tooltip for anything with data-tip (dashboard charts).
  const tip = $("#tip");
  function hideTip() { tip.hidden = true; }
  document.addEventListener("mousemove", (e) => {
    const el = e.target.closest && e.target.closest("[data-tip]");
    if (!el) return hideTip();
    tip.innerHTML = el.getAttribute("data-tip");
    tip.hidden = false;
    const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - pad;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  });

  // ---------------------------------------------------------------- render
  function render() {
    document.querySelectorAll(".tab").forEach((t) => {
      const on = t.dataset.tab === state.tab;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on);
    });
    $(".tabs").dataset.active = state.tab;
    renderHeader();
    renderChips();
    renderMarkers();
    const showDetail = state.tab === "places" && state.selected;
    $("#placesView").classList.toggle("hidden", state.tab !== "places" || !!state.selected);
    $("#detailView").classList.toggle("hidden", !showDetail);
    $("#compareView").classList.toggle("hidden", state.tab !== "compare");
    if (state.tab === "compare") renderCompare();
    else if (state.selected) renderDetail();
    else renderPlaces();
    $("#dashboard").classList.toggle("hidden", !state.dash);
    $("#dashBtn").setAttribute("aria-pressed", !!state.dash);
    if (state.dash) renderDashboard();
    $("#reportsView").classList.toggle("hidden", !state.reports);
    $("#reportsBtn").setAttribute("aria-pressed", !!state.reports);
    if (state.reports) renderMyReports();
  }

  render();

  // Send any reports that were queued while offline.
  flushOutbox();
  window.addEventListener("online", () => { flushOutbox(); });
  // Keep open/closed status current without resetting an open detail view.
  setInterval(() => {
    renderHeader();
    renderMarkers();
    if (state.tab === "places" && !state.selected) renderPlaces();
    if (state.dash) renderDashboard();
  }, 60 * 1000);

  // Exposed for quick testing in the console.
  window.__energyMap = { statusOf, parseDay, campusNow, state, render, map, fitCampus, openReport, setScope, TOWN, mode: REMOTE ? "server" : "local" };
})();
