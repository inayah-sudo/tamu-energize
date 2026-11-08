/* app.js - TAMU Energize. Reads window.CAMPUS_DATA (data.js). */
(function () {
  "use strict";

  const DATA = window.CAMPUS_DATA;
  const TZ = (DATA.meta && DATA.meta.timezone) || "America/Chicago";
  const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const WALK_M_PER_MIN = 80; // ~3 mph
  const PHONE = window.matchMedia("(max-width: 820px)");

  const state = {
    brand: null,        // selected brand filter, null = all
    openOnly: false,
    selected: null,     // building id shown in detail view
    tab: "places",
    you: null,          // {lat, lng} once located
    sortKey: "price",
    sortDir: 1,
    dash: false,        // dashboard view open?
    reports: false,     // price reports view open?
  };

  // ---------------------------------------------------------------- helpers
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => (typeof n === "number" ? "$" + n.toFixed(2) : "—");
  const perOz = (d) => (d.price && d.size_oz ? d.price / d.size_oz : null);
  /** Price pill: "$2.50" with the cents set slightly smaller. */
  function priceTag(n, size) {
    if (typeof n !== "number") return "—";
    const [d, c] = n.toFixed(2).split(".");
    return '<span class="price' + (size ? " price-" + size : "") + '" aria-label="$' + d + "." + c + '">$' + d +
      '<span class="cents">.' + c + "</span></span>";
  }
  const vendorLabel = (v) => v.label || v.name;
  const TYPE_LABEL = { vending: "Vending machine", bookstore: "Bookstore", market: "Campus market", store: "Store" };
  const typeLabel = (t) => TYPE_LABEL[t] || t;
  /** data-tip attribute holding tooltip HTML (parts must already be escaped). */
  const tipAttr = (html) => ' data-tip="' + esc(html) + '"';

  // ---------------------------------------------------------------- price reports: backend
  // Who sees what:
  //  * Everyone can SEND a report (the flag next to each price).
  //  * Only signed-in team members see reports, "reported" tags, counts and the Reports page.
  // Where reports live:
  //  * Server mode (config.js reportsEndpoint set): the team's Google Sheet via Apps Script
  //    (server/Code.gs). Reading/changing reports needs the team key, checked by the server.
  //  * Local mode (no endpoint): this browser only - for trying the app out. Without a server
  //    nothing can truly be private, so the sign-in there only hides the page.
  const CONFIG = window.APP_CONFIG || {};
  const ENDPOINT = String(CONFIG.reportsEndpoint || "").trim();
  const REMOTE = /^https:\/\//i.test(ENDPOINT);
  const KEYS = {
    reports: "aggieEnergyMap.reports.v1",   // local mode only
    outbox: "aggieEnergyMap.outbox.v1",     // server mode: reports waiting to be sent (offline)
    team: "aggieEnergyMap.team.v1",         // server mode: the team key; local mode: true
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
  store.del("aggieEnergyMap.priceUpdates.v1"); // older versions kept applied prices separately

  const asArray = (v) => (Array.isArray(v) ? v : []);
  let teamKey = store.get(KEYS.team, null);
  let reports = REMOTE ? [] : asArray(store.get(KEYS.reports, []));
  let outbox = REMOTE ? asArray(store.get(KEYS.outbox, [])) : [];
  const teamState = { loading: false, error: "", loadedAt: "" };
  const isTeam = () => !!teamKey;

  /** Stable id for one drink at one vendor, e.g. "msc-vend|Red Bull|8.4". */
  const drinkKey = (v, d) => v.id + "|" + d.brand + "|" + d.size_oz;
  const drinkIndex = {};
  DATA.buildings.forEach((b) => b.vendors.forEach((v) => v.drinks.forEach((d) => { drinkIndex[drinkKey(v, d)] = { b, v, d }; })));
  const findDrink = (key) => drinkIndex[key] || null;

  // data.js values as loaded, so confirmed prices can be layered on (and taken off) cleanly.
  const BASE = {};
  for (const [key, f] of Object.entries(drinkIndex)) BASE[key] = { price: f.d.price, verified: f.d.verified, observed_at: f.d.observed_at };

  /**
   * Prices the team has confirmed but not yet published in data.js: key -> {price, observed_at, previous}.
   * Shown in the app for signed-in team members only; the public always sees data.js.
   * Once the exported data.js is committed, data.js already matches and the entry disappears.
   * If data.js changed that price some other way since, data.js wins.
   */
  let updates = {};
  function deriveUpdates() {
    updates = {};
    for (const [key, f] of Object.entries(drinkIndex)) Object.assign(f.d, BASE[key]);
    if (!isTeam()) return;
    const latest = {};
    reports.forEach((r) => {
      if (r.status !== "confirmed" || typeof r.confirmed_price !== "number") return;
      if (!latest[r.key] || (r.resolved_at || "") > (latest[r.key].resolved_at || "")) latest[r.key] = r;
    });
    for (const [key, r] of Object.entries(latest)) {
      const f = findDrink(key), base = BASE[key];
      if (!f) continue;
      if (base.price === r.confirmed_price && base.verified) continue;            // already published
      if (base.price !== r.listed_price && base.price !== r.confirmed_price) continue; // data.js changed since
      updates[key] = { price: r.confirmed_price, observed_at: r.resolved_at, previous: base };
      Object.assign(f.d, { price: r.confirmed_price, verified: true, observed_at: r.resolved_at });
    }
  }

  const openReportsFor = (key) => (isTeam() ? reports.filter((r) => r.key === key && r.status === "open") : []);

  function saveLocal() {
    if (REMOTE) return;
    if (!store.set(KEYS.reports, reports)) toast("Couldn't save in this browser (private window?).");
  }

  /** POST to the Apps Script endpoint. text/plain body avoids a CORS preflight. */
  async function api(payload) {
    const res = await fetch(ENDPOINT, { method: "POST", body: JSON.stringify(payload), redirect: "follow" });
    let data;
    try { data = await res.json(); } catch (e) { throw new Error("bad_response"); }
    if (!data || !data.ok) throw new Error((data && data.error) || "server_error");
    return data;
  }
  const isNetworkError = (e) => e instanceof TypeError || e.message === "bad_response";

  /** Send one report. Returns "sent" | "queued" (offline, retried later) | "saved" (local mode). */
  async function sendReport(r) {
    if (!REMOTE) {
      reports.push(Object.assign({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), created_at: campusIso(), status: "open", resolved_at: "", confirmed_price: null }, r));
      saveLocal();
      return "saved";
    }
    try {
      await api({ action: "report", report: r });
      return "sent";
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      outbox.push(r);
      store.set(KEYS.outbox, outbox);
      return "queued";
    }
  }

  async function flushOutbox() {
    if (!REMOTE || !outbox.length) return;
    const pending = outbox;
    outbox = [];
    for (const r of pending) {
      try { await api({ action: "report", report: r }); } catch (e) { if (isNetworkError(e)) outbox.push(r); }
    }
    store.set(KEYS.outbox, outbox);
  }

  /** Team only: load every report (server) or this browser's reports (local). */
  async function refreshReports() {
    if (!isTeam()) return;
    if (!REMOTE) {
      reports = asArray(store.get(KEYS.reports, []));
      teamState.loadedAt = campusIso();
      deriveUpdates();
      return render();
    }
    teamState.loading = true;
    teamState.error = "";
    render();
    try {
      const data = await api({ action: "list", key: teamKey });
      reports = asArray(data.reports);
      teamState.loadedAt = campusIso();
    } catch (e) {
      if (e.message === "unauthorized") {
        signOut("The team key has changed. Please sign in again.");
        return;
      }
      teamState.error = "Couldn't reach the reports server. Showing the last loaded reports.";
    }
    teamState.loading = false;
    deriveUpdates();
    render();
  }

  /** Change the status of every matching report for one drink (team only). */
  async function setStatus(key, status, price) {
    const from = status === "open" ? "confirmed" : "open";
    const ids = reports.filter((r) => r.key === key && r.status === from).map((r) => r.id);
    if (!ids.length) return false;
    if (REMOTE) {
      try {
        await api({ action: "resolve", key: teamKey, ids, status, confirmed_price: price });
      } catch (e) {
        if (e.message === "unauthorized") signOut("The team key has changed. Please sign in again.");
        else toast("Couldn't save the change. Check your connection and try again.");
        return false;
      }
      await refreshReports();
      return true;
    }
    const now = campusIso();
    reports.forEach((r) => {
      if (ids.indexOf(r.id) < 0) return;
      r.status = status;
      r.resolved_at = status === "open" ? "" : now;
      r.confirmed_price = status === "confirmed" ? price : null;
    });
    saveLocal();
    deriveUpdates();
    render();
    return true;
  }

  function signOut(message) {
    teamKey = null;
    store.del(KEYS.team);
    if (REMOTE) reports = [];
    teamState.loadedAt = "";
    teamState.error = "";
    teamState.loading = false;
    deriveUpdates();
    openOverlay(null);
    toast(message || "Signed out of team view.");
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
  function reportedBadge(v, d) {
    const n = openReportsFor(drinkKey(v, d)).length;
    return n ? ' <span class="badge reported" title="' + n + ' open price report' + (n > 1 ? "s" : "") + '">reported</span>' : "";
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
  function fmtDist(m) {
    const mi = m / 1609.34;
    const walk = Math.max(1, Math.round(m / WALK_M_PER_MIN));
    return (mi < 0.1 ? Math.round(m * 3.281) + " ft" : mi.toFixed(2) + " mi") + " · ~" + walk + " min walk";
  }

  // ---------------------------------------------------------------- derived data
  /** Flat list of every drink with its building and vendor. */
  function allRows() {
    const rows = [];
    for (const b of DATA.buildings) {
      for (const v of b.vendors) {
        const st = statusOf(vendorHours(b, v));
        for (const d of v.drinks) rows.push({ b, v, d, open: st.open, statusText: st.text });
      }
    }
    return rows;
  }

  function brands() {
    const set = new Set();
    DATA.buildings.forEach((b) => b.vendors.forEach((v) => v.drinks.forEach((d) => set.add(d.brand))));
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  /** Summary of one building under the current filters. */
  function summary(b) {
    let cheapest = null, count = 0, anyOpen = false;
    for (const v of b.vendors) {
      const open = statusOf(vendorHours(b, v)).open;
      if (open) anyOpen = true;
      for (const d of v.drinks) {
        if (state.brand && d.brand !== state.brand) continue;
        if (state.openOnly && !open) continue;
        count++;
        if (!cheapest || d.price < cheapest.d.price) cheapest = { d, v };
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
  for (const b of DATA.buildings) {
    const m = L.marker([b.lat, b.lng], { icon: L.divIcon({ className: "pin-wrap", html: "", iconSize: [0, 0] }), title: b.name, keyboard: true });
    m.on("click", () => selectBuilding(b.id, false));
    m.addTo(map);
    markers[b.id] = m;
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

  const campusBounds = L.latLngBounds(DATA.buildings.map((b) => [b.lat, b.lng])).pad(0.05);
  function fitCampus() {
    map.invalidateSize();
    // Keep the pins clear of the floating header and side panel on wide screens.
    const pad = PHONE.matches
      ? { paddingTopLeft: [124, 40], paddingBottomRight: [96, 36] } // room for labels that hang beside their pin
      : { paddingTopLeft: [60, 60], paddingBottomRight: [60, 40] };
    map.fitBounds(campusBounds, Object.assign({ maxZoom: 17, animate: false }, pad));
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
    for (const b of DATA.buildings) {
      const s = summary(b);
      const cls = ["pin"];
      if (state.selected === b.id) cls.push("selected");
      if ((state.brand || state.openOnly) && !s.matches) cls.push("dim");
      if (b.coord_source !== "osm") cls.push("approx");
      if (b.label_dir && b.label_dir !== "top") cls.push("dir-" + b.label_dir);
      const stores = [...new Set(b.vendors.map(vendorLabel))].join(" · ");
      const html = '<div class="' + cls.join(" ") + '">' +
        '<div class="pin-row"><span class="dot ' + (s.anyOpen ? "open" : "closed") + '"></span>' +
        '<span class="pin-name">' + esc(b.short) + "</span>" +
        (s.cheapest ? '<span class="pin-price">' + money(s.cheapest.d.price) + "</span>" : "") + "</div>" +
        '<div class="pin-sub">' + esc(stores) + "</div></div>";
      markers[b.id].setIcon(L.divIcon({ className: "pin-wrap", html, iconSize: [0, 0] }));
      markers[b.id].setZIndexOffset(state.selected === b.id ? 1000 : 0);
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
  function renderPlaces() {
    const items = DATA.buildings.map((b) => ({ b, s: summary(b), dist: state.you ? distanceM(state.you, b) : null }));
    items.sort((x, y) => {
      if ((state.brand || state.openOnly) && x.s.matches !== y.s.matches) return x.s.matches ? -1 : 1;
      // A closed place can't sell you anything, however cheap: open places always come first.
      if (x.s.anyOpen !== y.s.anyOpen) return x.s.anyOpen ? -1 : 1;
      if (state.you) return x.dist - y.dist;
      const px = x.s.cheapest ? x.s.cheapest.d.price : Infinity;
      const py = y.s.cheapest ? y.s.cheapest.d.price : Infinity;
      return px - py || x.b.short.localeCompare(y.b.short);
    });

    const hint = "Open now first, then " + (state.you ? "nearest" :
      state.brand ? "cheapest " + esc(state.brand) : "cheapest drink");

    $("#placesView").innerHTML = '<p class="hint">' + items.length + " places · " + hint + "</p>" +
      items.map(({ b, s, dist }) => {
        const dim = (state.brand || state.openOnly) && !s.matches;
        const price = s.cheapest
          ? '<span class="price-big">' + priceTag(s.cheapest.d.price) + "</span>"
          : '<span class="none">' + (state.brand ? "No " + esc(state.brand) : "—") + "</span>";
        const cheapest = s.cheapest
          ? "Cheapest: " + esc(s.cheapest.d.brand) + " " + s.cheapest.d.size_oz + " oz · " + esc(vendorLabel(s.cheapest.v))
          : "";
        return '<button type="button" class="card' + (dim ? " dim" : "") + '" data-id="' + b.id + '">' +
          '<div class="card-top"><div><span class="title">' + esc(b.short) + '</span><span class="full">' + esc(b.name) + "</span></div>" + price + "</div>" +
          '<div class="stores">' + b.vendors.map((v) => esc(vendorLabel(v))).join(" · ") + "</div>" +
          (cheapest ? '<div class="cheap">' + cheapest + "</div>" : "") +
          '<div class="card-meta">' + statusPill(s.anyOpen ? { open: true, text: "Open now" } : { open: false, text: "Nothing open right now" }) +
          (dist != null ? '<span class="dist">' + fmtDist(dist) + "</span>" : "") + "</div>" +
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

  function renderDetail() {
    const b = DATA.buildings.find((x) => x.id === state.selected);
    if (!b) return;
    const allConfirmed = b.vendors.every((v) => v.drinks.every((d) => d.verified));
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
          '<td class="num">' + (d.verified
            ? '<span class="badge verified" title="' + esc(d.observed_at || "") + '">verified</span>'
            : "") + reportedBadge(v, d) + "</td>" + flagCell(v, d) + "</tr>";
      }).join("");
      return '<div class="vendor">' +
        '<div class="vendor-head"><h5>' + esc(v.name) + ' <span class="badge ' + esc(v.type) + '">' + esc(typeLabel(v.type)) + "</span></h5>" +
        statusPill(statusOf(vh)) + "</div>" +
        (publicLoc(v) ? '<div class="loc">' + esc(publicLoc(v)) + "</div>" : "") +
        (drinks.length
          ? '<table><thead><tr><th>Drink</th><th class="num">Size</th><th class="num">Price</th><th></th><th><span class="sr-only">Report</span></th></tr></thead><tbody>' + rows + "</tbody></table>"
          : '<div class="hint">No ' + esc(state.brand) + " here.</div>") +
        "<details><summary>" + (v.hours ? "Store hours" : "Hours: same as building") +
        (v.hours && v.hours_verified === false ? ' <span class="badge unverified">not verified</span>' : "") + "</summary>" + hoursTable(vh) + "</details>" +
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
      (allConfirmed ? "" : ' <span class="badge unverified" title="Not yet checked in person by the team. Tap the flag next to a price if it looks wrong.">prices not confirmed</span>') +
      "</div>" + vendorsHtml +
      '<div class="section-title">Building hours ' + (b.hours_verified ? '<span class="badge verified">verified</span>' : '<span class="badge unverified">not verified</span>') + "</div>" +
      hoursTable(b.hours) +
      "</div>";
    $("#backBtn").addEventListener("click", () => { state.selected = null; render(); });
  }

  function selectBuilding(id, pan) {
    state.selected = id;
    state.tab = "places";
    const b = DATA.buildings.find((x) => x.id === id);
    if (pan && b) map.flyTo([b.lat, b.lng], Math.max(map.getZoom(), 17), { duration: 0.6 });
    render();
    $("#detailView").scrollTop = 0;
    if (PHONE.matches) $("#detailView").scrollIntoView({ behavior: "smooth" });
  }

  // ---------------------------------------------------------------- panel: compare
  function renderCompare() {
    const rows = allRows().filter((r) => (!state.brand || r.d.brand === state.brand) && (!state.openOnly || r.open));
    const key = {
      brand: (r) => r.d.brand + r.d.product,
      size: (r) => r.d.size_oz,
      price: (r) => r.d.price,
      ppo: (r) => perOz(r.d) || Infinity,
      place: (r) => r.b.short + r.v.name,
      dist: (r) => (state.you ? distanceM(state.you, r.b) : 0),
    }[state.sortKey];
    rows.sort((a, b) => {
      const x = key(a), y = key(b);
      return (x < y ? -1 : x > y ? 1 : 0) * state.sortDir;
    });
    const head = (k, label, num) =>
      '<th class="' + (num ? "num" : "") + '"><button type="button" data-sort="' + k + '">' + label +
      (state.sortKey === k ? (state.sortDir === 1 ? " ↑" : " ↓") : "") + "</button></th>";

    $("#compareView").innerHTML =
      '<p class="hint">' + rows.length + " drinks · " +
      (rows.every((r) => !r.d.verified) ? "prices not confirmed in person yet · "
        : rows.some((r) => !r.d.verified) ? "unmarked prices not confirmed yet · " : "") +
      "tap a row to see it on the map · tap a column to sort</p>" +
      '<table class="compare"><thead><tr>' + head("brand", "Drink") + head("size", "oz", 1) + head("price", "Price", 1) +
      head("ppo", "$/oz", 1) + head("place", "Where") + (state.you ? head("dist", "Dist", 1) : "") + '<th><span class="sr-only">Report</span></th></tr></thead><tbody>' +
      rows.map((r) => {
        const ppo = perOz(r.d);
        return '<tr data-id="' + r.b.id + '"><td><b>' + esc(r.d.brand) + "</b>" +
          '<span class="sm">' + esc(r.d.product) + (r.d.verified ? ' · <span class="badge verified">confirmed</span>' : "") + reportedBadge(r.v, r.d) + "</span></td>" +
          '<td class="num">' + esc(r.d.size_oz) + "</td>" +
          '<td class="num"><b>' + money(r.d.price) + "</b></td>" +
          '<td class="num">' + (ppo ? ppo.toFixed(3) : "—") + "</td>" +
          "<td><b>" + esc(r.b.short) + '</b><span class="where"><span class="dot ' + (r.open ? "open" : "closed") + '"></span>' + esc(vendorLabel(r.v)) + "</span></td>" +
          (state.you ? '<td class="num">' + (distanceM(state.you, r.b) / 1609.34).toFixed(2) + " mi</td>" : "") +
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
    const rows = allRows();
    const ok = rows.filter((r) => r.d.verified).length;
    const pill = $("#verifiedCount");
    pill.textContent = ok ? ok + "/" + rows.length + " prices confirmed" : "Prices not yet confirmed";
    pill.classList.toggle("done", ok === rows.length);
    // Reports are team-only: hide the button, count and tags from the public.
    $("#reportsBtn").hidden = !isTeam();
    $("#teamLink").textContent = isTeam() ? "Team: open Reports" : "Team sign-in";
    const openN = isTeam() ? reports.filter((r) => r.status === "open").length : 0;
    const count = $("#reportsCount");
    count.textContent = openN;
    count.hidden = !openN;
    $("#reportsBtn").title = openN ? openN + " open price report" + (openN > 1 ? "s" : "") + " to investigate" : "Price reports to investigate";
    const { day, minute } = campusNow();
    $("#clock").textContent = DAY_NAMES[day].slice(0, 3) + " " + fmtMin(minute) + " campus time";
  }

  function exportCsv() {
    const cols = ["building_id", "building", "vendor", "vendor_type", "location_detail", "brand", "product",
      "size_oz", "price_usd", "price_per_oz", "verified", "observed_at", "lat", "lng"];
    const q = (v) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [cols.join(",")];
    for (const r of allRows()) {
      const ppo = perOz(r.d);
      lines.push([r.b.id, r.b.name, r.v.name, r.v.type, r.v.location_detail, r.d.brand, r.d.product,
        r.d.size_oz, r.d.price, ppo ? ppo.toFixed(4) : "", r.d.verified, r.d.observed_at, r.b.lat, r.b.lng].map(q).join(","));
    }
    downloadFile("aggie_energy_drinks.csv", lines.join("\n") + "\n", "text/csv");
  }

  function downloadFile(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------------------------------------------------------------- price reports: form
  const dlg = $("#reportDialog");
  let reportingKey = null;

  function openReport(key) {
    const f = findDrink(key);
    if (!f) return;
    reportingKey = key;
    const n = openReportsFor(key).length;
    $("#reportTarget").innerHTML =
      "<b>" + esc(f.d.brand) + " · " + esc(f.d.size_oz) + " oz</b><br>" + esc(f.v.name) + " · " + esc(f.b.name) +
      "<br>Listed price: <b>" + money(f.d.price) + "</b> " +
      (f.d.verified ? '<span class="badge verified">verified ' + esc(fmtStamp(f.d.observed_at)) + "</span>" : '<span class="badge unverified">unverified</span>') +
      (n ? '<span class="sm">' + n + " open report" + (n > 1 ? "s" : "") + " already filed for this drink</span>" : "");
    $("#rpPrice").value = "";
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
    if (!isFinite(price) || price < 0.25 || price > 20) {
      err.textContent = "Enter the price you saw, between $0.25 and $20.00.";
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
      listed_price: BASE[reportingKey].price, // the published (data.js) price
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
    toast(result === "queued"
      ? "You're offline. The report is saved and will be sent automatically."
      : "Thanks! Your report was sent to the team for review.");
    if (isTeam()) refreshReports();
  });

  // Flag buttons can sit inside clickable rows, so catch them first (capture phase).
  document.addEventListener("click", (e) => {
    const btn = e.target.closest && e.target.closest("[data-report]");
    if (!btn) return;
    e.stopPropagation();
    e.preventDefault();
    openReport(btn.getAttribute("data-report"));
  }, true);

  // ---------------------------------------------------------------- price reports: investigation
  const median = (arr) => {
    const s = arr.slice().sort((a, b) => a - b), n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  };
  const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "±") + "$" + Math.abs(n).toFixed(2);
  const signedPct = (n) => (n > 0 ? "+" : n < 0 ? "−" : "±") + Math.abs(n).toFixed(1) + "%";
  const PRIO_LABEL = { high: "High", medium: "Medium", low: "Low" };

  /**
   * One item per drink with open reports, ranked for investigation.
   * Priority: High = 3+ reports, or seen in person and off by 10%+;
   *           Medium = 2 reports, off by 5%+, or seen in person; otherwise Low.
   */
  function investigationItems() {
    const by = {};
    reports.filter((r) => r.status === "open").forEach((r) => (by[r.key] = by[r.key] || []).push(r));
    return Object.entries(by).map(([key, list]) => {
      const f = findDrink(key);
      if (!f) return null;
      const reported = median(list.map((r) => r.reported_price));
      const listed = f.d.price;
      const diff = reported - listed;
      const pct = listed ? (diff / listed) * 100 : 0;
      const inPerson = list.filter((r) => r.in_person).length;
      const latest = list.map((r) => r.created_at).sort().pop();
      const level = list.length >= 3 || (inPerson && Math.abs(pct) >= 10) ? "high"
        : list.length >= 2 || Math.abs(pct) >= 5 || inPerson ? "medium" : "low";
      const score = { high: 3, medium: 2, low: 1 }[level] * 1000 + list.length * 50 + Math.abs(pct);
      return { key, f, list, reported, listed, diff, pct, inPerson, latest, level, score };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
  }

  function appliedUpdates() {
    return Object.entries(updates).map(([key, u]) => ({ key, u, f: findDrink(key) }))
      .filter((x) => x.f).sort((a, b) => (b.u.observed_at || "").localeCompare(a.u.observed_at || ""));
  }

  async function applyUpdate(key, price) {
    const f = findDrink(key);
    if (!f || !isFinite(price) || price < 0.25 || price > 20) return toast("Enter a price between $0.25 and $20.00.");
    price = Math.round(price * 100) / 100;
    if (await setStatus(key, "confirmed", price)) {
      toast(f.d.brand + " at " + (f.b.code || f.b.short) + " confirmed at " + money(price) + ". Download data.js to publish it.");
    }
  }

  async function dismissReports(key) {
    if (await setStatus(key, "dismissed")) toast("Report dismissed. The listed price stays.");
  }

  /** Undo a confirmation: its reports go back to "To investigate". */
  async function revertUpdate(key) {
    if (await setStatus(key, "open")) toast("Moved back to To investigate. Price shown is the published one again.");
  }

  function renderReports() {
    const items = investigationItems();
    const applied = appliedUpdates();
    const open = reports.filter((r) => r.status === "open");
    const dismissed = reports.filter((r) => r.status === "dismissed").sort((a, b) => String(b.resolved_at).localeCompare(String(a.resolved_at)));
    const inPerson = open.filter((r) => r.in_person).length;

    $("#reportsSource").textContent = (REMOTE
      ? "Shared team reports from your reports server"
      : "Local mode: reports from this browser only (set reportsEndpoint in config.js to share them with the team)") +
      (teamState.loadedAt ? " · loaded " + fmtStamp(teamState.loadedAt) : "");
    const status = $("#reportsStatus");
    status.hidden = !(teamState.loading || teamState.error || outbox.length);
    status.textContent = teamState.loading ? "Loading reports…"
      : teamState.error ? teamState.error
      : outbox.length ? outbox.length + " report(s) from this device are waiting to be sent (offline)." : "";
    $("#refreshReportsBtn").disabled = teamState.loading;
    $("#dataJsBtn").disabled = !applied.length;
    $("#dataJsBtn").title = applied.length ? "Download data.js with the confirmed prices, then replace the file in the repo"
      : "Confirm at least one price first";
    $("#copyReportBtn").disabled = $("#mdReportBtn").disabled = !items.length && !applied.length;

    const kpi = (label, value, note) => '<div class="w w-3 kpi"><span class="kpi-label">' + label + '</span><span class="kpi-value">' + value +
      '</span><span class="kpi-note">' + note + "</span></div>";

    const rows = items.map((it) => {
      const { f } = it;
      const st = statusOf(vendorHours(f.b, f.v));
      const values = it.list.map((r) => money(r.reported_price)).join(", ");
      const notes = it.list.filter((r) => r.note).map((r) => "“" + esc(r.note) + "”").join("<br>");
      return "<tr>" +
        '<td><span class="prio ' + it.level + '">' + PRIO_LABEL[it.level] + "</span></td>" +
        "<td><b>" + esc(f.d.brand) + '</b><span class="sm">' + esc(f.d.size_oz) + " oz · " + esc(f.d.product) + "</span></td>" +
        '<td><b>' + esc(f.b.code || f.b.short) + "</b> · " + esc(vendorLabel(f.v)) + '<span class="sm">' + esc(f.v.location_detail) + "</span>" + statusPill(st) + "</td>" +
        '<td class="num">' + money(it.listed) + '<span class="sm">' + (f.d.verified ? "verified" : "unverified") + "</span></td>" +
        '<td class="num"><b>' + money(it.reported) + '</b><span class="sm">' + (it.list.length > 1 ? "median of " + values : "&nbsp;") + "</span></td>" +
        '<td class="num chg ' + (it.diff > 0 ? "up" : it.diff < 0 ? "down" : "") + '">' + signed(it.diff) + '<span class="sm">' + signedPct(it.pct) + "</span></td>" +
        "<td>" + it.list.length + " report" + (it.list.length > 1 ? "s" : "") + '<span class="sm">' + it.inPerson + " in person · " + esc(fmtStamp(it.latest)) + "</span></td>" +
        '<td class="notes">' + (notes || '<span class="sm">—</span>') + "</td>" +
        '<td><div class="resolve"><span class="money-input" title="Price confirmed on site"><span aria-hidden="true">$</span>' +
        '<input type="number" step="0.01" min="0.25" max="20" value="' + it.reported.toFixed(2) + '" data-confirm-input="' + esc(it.key) + '" aria-label="Confirmed price"></span>' +
        '<button type="button" class="btn btn-primary btn-sm" data-apply="' + esc(it.key) + '">Apply</button>' +
        '<button type="button" class="btn btn-sm" data-dismiss="' + esc(it.key) + '">Dismiss</button></div></td>' +
        "</tr>";
    }).join("");

    const appliedRows = applied.map(({ key, u, f }) => "<tr>" +
      "<td><b>" + esc(f.d.brand) + '</b><span class="sm">' + esc(f.d.size_oz) + " oz</span></td>" +
      "<td><b>" + esc(f.b.code || f.b.short) + "</b> · " + esc(vendorLabel(f.v)) + "</td>" +
      '<td class="num">' + money(u.previous.price) + " → <b>" + money(u.price) + "</b></td>" +
      '<td class="num chg ' + (u.price > u.previous.price ? "up" : u.price < u.previous.price ? "down" : "") + '">' + signed(u.price - u.previous.price) + "</td>" +
      "<td>" + esc(fmtStamp(u.observed_at)) + "</td>" +
      '<td class="num"><button type="button" class="btn btn-sm" data-revert="' + esc(key) + '" title="Undo the confirmation and investigate again">Undo</button></td></tr>').join("");

    $("#reportsBody").innerHTML =
      kpi("Open reports", open.length, open.length ? inPerson + " seen in person" : "Nothing waiting") +
      kpi("Drinks to check", items.length, items.filter((i) => i.level === "high").length + " high priority") +
      kpi("Confirmed updates", applied.length, applied.length ? "Waiting to be published" : "None yet") +
      kpi("Dismissed", dismissed.length, "Listed price kept") +

      '<div class="w w-12"><h3>To investigate</h3><p class="w-sub">Highest priority first. Check the price on site, adjust it if needed, then <b>Apply</b> to confirm it (the whole team sees it), or <b>Dismiss</b> if the listed price is right.</p>' +
      (items.length
        ? '<div class="table-wrap"><table><thead><tr><th>Priority</th><th>Drink</th><th>Where</th><th class="num">Listed</th><th class="num">Reported</th><th class="num">Change</th><th>Reports</th><th>Notes</th><th class="num">Resolve</th></tr></thead><tbody>' + rows + "</tbody></table></div>"
        : '<div class="empty"><b>No open reports</b>Use the flag next to any price on the map, in Compare prices or in the Dashboard catalog to report it.</div>') +
      "</div>" +

      '<div class="w w-12"><h3>Confirmed, not yet published</h3><p class="w-sub">Team members see these prices in the app already; the public still sees the published price. Use <b>Download updated data.js</b> and commit it to the repo to publish them for everyone.</p>' +
      (applied.length
        ? '<div class="table-wrap"><table><thead><tr><th>Drink</th><th>Where</th><th class="num">Price</th><th class="num">Change</th><th>Confirmed</th><th></th></tr></thead><tbody>' + appliedRows + "</tbody></table></div>"
        : '<div class="empty">No updates applied yet.</div>') +
      "</div>" +

      (dismissed.length
        ? '<div class="w w-12"><details><summary>Dismissed reports (' + dismissed.length + ")</summary>" +
          '<div class="table-wrap"><table><tbody>' + dismissed.map((r) => "<tr><td><b>" + esc(r.brand) + "</b> " + esc(r.size_oz) + " oz</td><td>" + esc(r.building) + " · " + esc(r.vendor) +
            '</td><td class="num">reported ' + money(r.reported_price) + " vs " + money(r.listed_price) + "</td><td>" + esc(fmtStamp(r.created_at)) + "</td></tr>").join("") +
          "</tbody></table></div></details></div>"
        : "");
  }

  $("#reportsBody").addEventListener("click", (e) => {
    const t = e.target.closest("[data-apply],[data-dismiss],[data-revert]");
    if (!t) return;
    if (t.dataset.apply) {
      const input = $('[data-confirm-input="' + CSS.escape(t.dataset.apply) + '"]');
      applyUpdate(t.dataset.apply, parseFloat(input && input.value));
    } else if (t.dataset.dismiss) dismissReports(t.dataset.dismiss);
    else if (t.dataset.revert) revertUpdate(t.dataset.revert);
  });

  /** Markdown investigation report: what to check, where, and what to change in data.js. */
  function buildReportMd() {
    const items = investigationItems();
    const applied = appliedUpdates();
    const open = reports.filter((r) => r.status === "open");
    const cell = (s) => String(s).replace(/\|/g, "\\|");
    const L = [];
    L.push("# Price Change Investigation Report", "");
    L.push("TAMU Energize · generated " + fmtStamp(campusIso()) + " (campus time, " + TZ + ")", "");
    L.push("**" + open.length + " open report" + (open.length === 1 ? "" : "s") + "** on **" + items.length + " drink" + (items.length === 1 ? "" : "s") +
      "** to check. **" + applied.length + " confirmed update" + (applied.length === 1 ? "" : "s") + "** ready to publish.", "");

    if (items.length) {
      L.push("## To investigate", "");
      L.push("| # | Priority | Drink | Where | Listed | Reported | Change | Reports |", "|---|---|---|---|---:|---:|---:|---|");
      items.forEach((it, i) => {
        const f = it.f;
        L.push("| " + (i + 1) + " | " + PRIO_LABEL[it.level] + " | " + cell(f.d.brand + " " + f.d.size_oz + " oz") + " | " +
          cell((f.b.code || f.b.short) + " · " + vendorLabel(f.v)) + " | " + money(it.listed) + " | " + money(it.reported) + " | " +
          signed(it.diff) + " (" + signedPct(it.pct) + ") | " + it.list.length + " (" + it.inPerson + " in person) |");
      });
      L.push("");
      items.forEach((it, i) => {
        const f = it.f;
        const vh = vendorHours(f.b, f.v);
        L.push("### " + (i + 1) + ". " + f.d.brand + " " + f.d.size_oz + " oz — " + (f.b.code || f.b.short) + " · " + f.v.name, "");
        L.push("- **Where:** " + f.v.location_detail + " (" + f.b.name + ")");
        L.push("- **Hours:** " + compressHours(vh).join("; ") + " — " + statusOf(vh).text + " as of this report");
        L.push("- **Listed:** " + money(it.listed) + (f.d.verified ? " (verified " + fmtStamp(f.d.observed_at) + ")" : " (unverified)"));
        L.push("- **Reported:** " + it.list.map((r) => money(r.reported_price) + (r.in_person ? " in person" : "") + ", " + fmtStamp(r.created_at)).join("; "));
        const notes = it.list.filter((r) => r.note).map((r) => "“" + r.note + "”");
        if (notes.length) L.push("- **Notes:** " + notes.join(" "));
        L.push("- **Priority:** " + PRIO_LABEL[it.level] + " · median change " + signed(it.diff) + " (" + signedPct(it.pct) + ")");
        L.push("- [ ] Checked on site — actual price: $______  by ______  at ______", "");
      });
    } else {
      L.push("No open reports.", "");
    }

    if (applied.length) {
      L.push("## Confirmed updates to publish", "");
      L.push("| Drink | Where | Old | New | Change | Confirmed |", "|---|---|---:|---:|---:|---|");
      applied.forEach(({ u, f }) => L.push("| " + cell(f.d.brand + " " + f.d.size_oz + " oz") + " | " + cell((f.b.code || f.b.short) + " · " + vendorLabel(f.v)) +
        " | " + money(u.previous.price) + " | " + money(u.price) + " | " + signed(u.price - u.previous.price) + " | " + fmtStamp(u.observed_at) + " |"));
      L.push("", "**To publish:** on the Reports page click *Download updated data.js*, replace `aggie-energy-map/data.js` in the repo with it, and commit. " +
        "Everyone using the app then sees the new prices.", "");
    }
    return L.join("\n");
  }

  $("#mdReportBtn").addEventListener("click", () => {
    downloadFile("price-investigation-" + campusIso().slice(0, 10) + ".md", buildReportMd() + "\n", "text/markdown");
  });
  $("#copyReportBtn").addEventListener("click", () => {
    const md = buildReportMd();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(md).then(() => toast("Report copied. Paste it into a GitHub issue or team chat."),
        () => downloadFile("price-investigation.md", md + "\n", "text/markdown"));
    } else downloadFile("price-investigation.md", md + "\n", "text/markdown");
  });

  /** data.js with confirmed prices applied, ready to commit. */
  function exportDataJs() {
    const copy = JSON.parse(JSON.stringify(DATA));
    copy.meta.last_updated = campusIso().slice(0, 10);
    const n = Object.keys(updates).length;
    const header = "/*\n * data.js - exported from TAMU Energize on " + campusIso() + " (campus time).\n" +
      " * Includes " + n + " confirmed price update" + (n === 1 ? "" : "s") + " from price reports.\n" +
      " * Field and hours formats: see README.md (Data dictionary).\n */\n";
    downloadFile("data.js", header + "window.CAMPUS_DATA = " + JSON.stringify(copy, null, 2) + ";\n", "text/javascript");
    toast("Downloaded data.js. Replace aggie-energy-map/data.js in the repo and commit.");
  }
  $("#dataJsBtn").addEventListener("click", exportDataJs);

  $("#exportBtn").addEventListener("click", exportCsv);
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
    const rows = allRows();
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
        (r.d.verified ? '<span class="badge verified">verified</span>' : '<span class="badge unverified">unverified</span>') + reportedBadge(r.v, r.d) +
        "</td>" + flagCell(r.v, r.d) + "</tr>").join("") +
      "</tbody></table></div>";
  }

  function renderDashboard() {
    const rows = allRows();
    const vendors = allVendors();
    const openVendors = vendors.filter((x) => x.st.open).length;
    const openBuildings = DATA.buildings.filter((b) => statusOf(b.hours).open).length;
    const brandList = brands();
    const verified = rows.filter((r) => r.d.verified).length;
    const cheapest = rows.slice().sort((a, b) => a.d.price - b.d.price)[0];

    $("#dashSource").textContent = "Source: " + (DATA.meta.source || "data.js") + " · " + verified + " of " + rows.length + " prices verified on site";

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
    if (name === "reports" && !isTeam()) return openTeamSignIn();
    state.dash = name === "dash";
    state.reports = name === "reports";
    hideTip();
    render();
    if (name) $(name === "dash" ? "#dashboard" : "#reportsView").scrollTop = 0;
  }
  const openDashboard = (on) => openOverlay(on ? "dash" : null);
  $("#dashBtn").addEventListener("click", () => openOverlay("dash"));
  $("#dashClose").addEventListener("click", () => openOverlay(null));
  $("#reportsBtn").addEventListener("click", () => { openOverlay("reports"); refreshReports(); });
  $("#reportsClose").addEventListener("click", () => openOverlay(null));
  $("#refreshReportsBtn").addEventListener("click", () => refreshReports());
  $("#signOutBtn").addEventListener("click", () => signOut());
  $("#teamLink").addEventListener("click", () => {
    if (isTeam()) { openOverlay("reports"); refreshReports(); } else openTeamSignIn();
  });

  // ---------------------------------------------------------------- team sign-in
  const teamDlg = $("#teamDialog");
  function openTeamSignIn() {
    $("#teamKeyInput").value = "";
    $("#teamError").hidden = true;
    const note = $("#teamModeNote");
    note.hidden = REMOTE;
    note.textContent = "Local mode: no reports server is set up yet (see server/README.md), so reports only exist on this device and any key opens the page here.";
    if (typeof teamDlg.showModal === "function") teamDlg.showModal(); else teamDlg.setAttribute("open", "");
    setTimeout(() => $("#teamKeyInput").focus(), 30);
  }
  const closeTeam = () => (typeof teamDlg.close === "function" ? teamDlg.close() : teamDlg.removeAttribute("open"));
  teamDlg.addEventListener("click", (e) => { if (e.target.closest("[data-close]") || e.target === teamDlg) closeTeam(); });

  $("#teamForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const key = $("#teamKeyInput").value.trim();
    const err = $("#teamError");
    if (!key) { err.textContent = "Enter the team key."; err.hidden = false; return; }
    if (REMOTE) {
      const btn = $("#teamSubmit");
      btn.disabled = true;
      btn.textContent = "Checking…";
      try {
        const data = await api({ action: "list", key });   // the server checks the key
        reports = asArray(data.reports);
        teamState.loadedAt = campusIso();
      } catch (ex) {
        err.textContent = ex.message === "unauthorized" ? "That team key isn't right."
          : ex.message === "server_not_configured" ? "The reports server has no TEAM_KEY set yet (see server/README.md)."
          : "Couldn't reach the reports server. Check your connection.";
        err.hidden = false;
        return;
      } finally {
        btn.disabled = false;
        btn.textContent = "Sign in";
      }
    }
    teamKey = REMOTE ? key : true;
    store.set(KEYS.team, teamKey);
    closeTeam();
    if (location.hash === "#team") history.replaceState(null, "", location.pathname + location.search);
    deriveUpdates();
    toast("Signed in. You can now see all price reports.");
    openOverlay("reports");
    if (!REMOTE) refreshReports();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || document.getElementById("reportDialog").open || teamDlg.open) return; // dialogs handle their own Esc
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
    if (state.reports) renderReports();
  }

  deriveUpdates();
  render();

  // Startup: send any reports queued while offline, load team reports, handle #team links.
  (async () => {
    await flushOutbox();
    if (isTeam()) await refreshReports();
    if (location.hash === "#team") {
      if (isTeam()) openOverlay("reports"); else openTeamSignIn();
    }
  })();
  window.addEventListener("online", () => { flushOutbox().then(() => isTeam() && refreshReports()); });
  // Keep open/closed status current without resetting an open detail view.
  setInterval(() => {
    renderHeader();
    renderMarkers();
    if (state.tab === "places" && !state.selected) renderPlaces();
    if (state.dash) renderDashboard();
  }, 60 * 1000);

  // Exposed for quick testing in the console.
  window.__energyMap = { statusOf, parseDay, campusNow, state, render, map, fitCampus, buildReportMd, openReport, isTeam, mode: REMOTE ? "server" : "local" };
})();
