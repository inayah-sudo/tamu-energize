#!/usr/bin/env node
/*
 * Writes the dataset files judges can download from the repo:
 *   data/energy_drink_prices.csv     every price in the app, with where it came from
 *   data/field_collection_sheet.csv  a checklist for recording prices in person
 *
 * Usage: node scripts/export_dataset.js   (the snapshot workflow runs this too)
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const sandbox = { window: {} };
vm.createContext(sandbox);
for (const file of ["data.js", "offcampus.js"]) vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), sandbox);
const CAMPUS = sandbox.window.CAMPUS_DATA;
const OFF = sandbox.window.OFFCAMPUS_DATA;

const cell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const csv = (cols, rows) => [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n") + "\n";
const money = (n, digits) => (typeof n === "number" && isFinite(n) ? n.toFixed(digits) : "");

const rows = [];
for (const b of CAMPUS.buildings) {
  for (const v of b.vendors) {
    for (const d of v.drinks) {
      rows.push({
        scope: "on_campus", place: b.name, vendor: v.name, vendor_type: v.type, where: v.location_detail,
        brand: d.brand, product: d.product, size_oz: d.size_oz, pack_count: 1, price: d.price,
        source: d.verified ? "Team observed in person" : d.source || "Team Databricks export, not yet checked in person",
        verified_in_person: !!d.verified, observed_at: d.observed_at || "", lat: b.lat, lng: b.lng, accepts_dining_dollars: v.accepts_dining_dollars,
      });
    }
  }
}
for (const s of OFF.stores) {
  for (const p of s.products) {
    rows.push({
      scope: "off_campus", place: s.name, vendor: s.name, vendor_type: s.store_type, where: s.address,
      brand: p.brand, product: p.product, size_oz: p.size_oz, pack_count: p.pack_count, price: p.price,
      source: s.price_source || "Snowflake", verified_in_person: false, observed_at: p.last_updated || "", lat: s.lat, lng: s.lng, accepts_dining_dollars: s.accepts_dining_dollars,
    });
  }
}

const dataset = rows.map((r) => Object.assign({}, r, {
  price_usd: money(r.price, 2),
  price_per_can: money(r.price / r.pack_count, 2),
  price_per_oz: r.size_oz ? money(r.price / (r.size_oz * r.pack_count), 3) : "",
}));
const sheet = rows.map((r) => Object.assign({}, r, { listed_price: money(r.price, 2), accepts_dining_dollars: "" }));

fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "data", "energy_drink_prices.csv"), csv(
  ["scope", "place", "vendor", "vendor_type", "where", "brand", "product", "size_oz", "pack_count", "price_usd",
    "price_per_can", "price_per_oz", "accepts_dining_dollars", "source", "verified_in_person", "observed_at", "lat", "lng"], dataset));
fs.writeFileSync(path.join(ROOT, "data", "field_collection_sheet.csv"), csv(
  ["scope", "place", "vendor", "machine_or_spot", "where", "brand", "product", "size_oz", "pack_count", "listed_price",
    "observed_price", "observed_size_oz", "in_stock", "accepts_dining_dollars", "observed_date", "observed_time", "collector_role", "photo_file", "notes"], sheet));
console.log("Wrote " + dataset.length + " rows to data/energy_drink_prices.csv and data/field_collection_sheet.csv");
