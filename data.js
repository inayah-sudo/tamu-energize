/*
 * data.js - the dataset that powers the map and the dashboard.
 *
 * Source: the team's Databricks dashboard export
 *   "Aggie Map_ Campus Buildings & Energy Drinks 2026-11-07 18_26_45.lvdash.json"
 *   (datasets campus_buildings + energy_drink_catalog), converted to this format.
 *
 * verified: false  = not yet confirmed in person. When a team member checks a price
 * on site, set verified: true and observed_at (ISO local time, e.g. "2026-11-07T14:20").
 *
 * Hours format, per day (mon..sun):
 *   "07:00-22:00"              one window
 *   "07:00-11:00,12:00-20:00"  several windows
 *   "07:00-02:00"              past midnight (closes 2 AM the next day)
 *   "24h"                      open all day
 *   "closed"
 * A vendor with  hours: null  uses its building's hours ("Building hours" in the dashboard).
 * Vendor  label  is the short store name shown under the building on the map.
 * Vendor  type   is vending | bookstore | market  (dashboard venue_type).
 *
 * Coordinates: coord_source "osm" = from OpenStreetMap.
 * label_dir: which side of the point the map label sits on (top | bottom | left | right),
 * so labels of nearby buildings don't cover each other.
 */
window.CAMPUS_DATA = {
  meta: {
    title: "TAMU Energize",
    timezone: "America/Chicago",
    dataset_version: "1.0",
    last_updated: "2026-11-07",
    source: "Team dashboard export, 2026-11-07 18:26",
  },

  buildings: [
    {
      id: "zach", code: "ZACH",
      name: "Zachry Engineering Education Complex",
      short: "Zachry",
      lat: 30.62138, lng: -96.34020, coord_source: "osm", label_dir: "left",
      description: "Engineering building on Spence St. Vending machines only.",
      hours: { mon: "07:00-02:00", tue: "07:00-02:00", wed: "07:00-02:00", thu: "07:00-02:00", fri: "07:00-00:00", sat: "09:00-00:00", sun: "07:00-02:00" },
      hours_verified: false,
      vendors: [
        {
          id: "zach-vend", name: "Zachry vending machines", label: "Vending", type: "vending",
          accepts_dining_dollars: false,
          location_detail: "Vending machines in Zachry (fill in floor and wing).",
          hours: null,
          drinks: [
            { brand: "Red Bull",      product: "Red Bull",            size_oz: 8.4,  price: 2.75, verified: false, observed_at: null },
            { brand: "Monster",       product: "Monster Energy",      size_oz: 16,   price: 2.50, verified: false, observed_at: null },
            { brand: "5-hour Energy", product: "5-hour Energy shot",  size_oz: 1.93, price: 3.00, verified: false, observed_at: null },
            { brand: "Celsius", product: "Celsius", size_oz: 12, price: 3.50, verified: true, observed_at: "2026-11-07T22:30" },
            { brand: "Rockstar", product: "Rockstar Energy", size_oz: 16, price: 3.25, verified: true, observed_at: "2026-11-07T22:30" },
            { brand: "Bang", product: "Bang Energy", size_oz: 16, price: 3.50, verified: true, observed_at: "2026-11-07T22:30" },
          ],
        },
      ],
    },

    {
      id: "msc", code: "MSC",
      name: "Memorial Student Center",
      short: "MSC",
      lat: 30.61223, lng: -96.34122, coord_source: "osm", label_dir: "bottom",
      description: "Student union. Barnes & Noble bookstore plus vending machines.",
      hours: { mon: "07:00-00:00", tue: "07:00-00:00", wed: "07:00-00:00", thu: "07:00-00:00", fri: "07:00-00:00", sat: "07:00-00:00", sun: "10:00-00:00" },
      hours_verified: false,
      vendors: [
        {
          id: "msc-bn", name: "Barnes & Noble (MSC)", label: "Barnes & Noble", type: "bookstore",
          accepts_dining_dollars: false,
          location_detail: "Bookstore inside the MSC (fill in where the drink cooler is).",
          hours: { mon: "08:00-19:00", tue: "08:00-19:00", wed: "08:00-19:00", thu: "08:00-19:00", fri: "08:00-19:00", sat: "10:00-17:00", sun: "10:00-15:00" },
          hours_verified: false,
          drinks: [
            { brand: "Red Bull", product: "Red Bull", size_oz: 8.4, price: 2.99, verified: false, observed_at: null },
            { brand: "Celsius", product: "Celsius", size_oz: 12, price: 3.50, verified: true, observed_at: "2026-11-07T16:00" },
            { brand: "Rockstar", product: "Rockstar Energy", size_oz: 16, price: 3.50, verified: true, observed_at: "2026-11-07T16:00" },
            { brand: "Bang", product: "Bang Energy", size_oz: 16, price: 3.50, verified: true, observed_at: "2026-11-07T16:00" },
          ],
        },
        {
          id: "msc-vend", name: "MSC vending machines", label: "Vending", type: "vending",
          accepts_dining_dollars: false,
          location_detail: "Vending machines in the MSC (fill in exact spot).",
          hours: null,
          drinks: [
            { brand: "Red Bull",      product: "Red Bull",           size_oz: 8.4,  price: 2.75, verified: false, observed_at: null },
            { brand: "Monster",       product: "Monster Energy",     size_oz: 16,   price: 2.50, verified: false, observed_at: null },
            { brand: "5-hour Energy", product: "5-hour Energy shot", size_oz: 1.93, price: 3.00, verified: false, observed_at: null },
            { brand: "Celsius", product: "Celsius", size_oz: 12, price: 3.50, verified: true, observed_at: "2026-11-07T16:00" },
            { brand: "Rockstar", product: "Rockstar Energy", size_oz: 16, price: 3.25, verified: true, observed_at: "2026-11-07T16:00" },
            { brand: "Bang", product: "Bang Energy", size_oz: 16, price: 3.50, verified: true, observed_at: "2026-11-07T16:00" },
          ],
        },
      ],
    },

    {
      id: "evans", code: "EVANS",
      name: "Sterling C. Evans Library",
      short: "Evans",
      lat: 30.61682, lng: -96.33920, coord_source: "osm", label_dir: "top",
      description: "Main library. Vending machines only.",
      hours: { mon: "07:00-00:00", tue: "07:00-00:00", wed: "07:00-00:00", thu: "07:00-00:00", fri: "07:00-19:00", sat: "09:00-19:00", sun: "09:00-00:00" },
      hours_verified: false,
      vendors: [
        {
          id: "evans-vend", name: "Evans vending machines", label: "Vending", type: "vending",
          accepts_dining_dollars: false,
          location_detail: "Vending machines in Evans (fill in floor / area).",
          hours: null,
          drinks: [
            { brand: "Red Bull",      product: "Red Bull",           size_oz: 8.4,  price: 2.75, verified: false, observed_at: null },
            { brand: "Monster",       product: "Monster Energy",     size_oz: 16,   price: 2.50, verified: false, observed_at: null },
            { brand: "5-hour Energy", product: "5-hour Energy shot", size_oz: 1.93, price: 3.00, verified: false, observed_at: null },
            { brand: "Celsius", product: "Celsius", size_oz: 12, price: 3.50, verified: true, observed_at: "2026-11-08T09:00" },
            { brand: "Rockstar", product: "Rockstar Energy", size_oz: 16, price: 3.25, verified: true, observed_at: "2026-11-08T09:00" },
            { brand: "Bang", product: "Bang Energy", size_oz: 16, price: 3.50, verified: true, observed_at: "2026-11-08T09:00" },
          ],
        },
      ],
    },

    {
      id: "commons", code: "COMMONS",
      name: "The Commons",
      short: "Commons",
      lat: 30.61532, lng: -96.33601, coord_source: "osm", label_dir: "bottom",
      description: "Residence-hall hub with an Aggie Express convenience store.",
      hours: { mon: "07:00-23:00", tue: "07:00-23:00", wed: "07:00-23:00", thu: "07:00-23:00", fri: "07:00-23:00", sat: "07:00-23:00", sun: "07:00-23:00" },
      hours_verified: false,
      vendors: [
        {
          id: "commons-ae", name: "Aggie Express (Commons)", label: "Aggie Express", type: "market",
          accepts_dining_dollars: true,
          location_detail: "Aggie Express convenience store inside the Commons.",
          // Sunday: the dashboard says 10 PM; set to 11 PM per the team's "11 PM on weekends" update.
          hours: { mon: "07:00-00:00", tue: "07:00-00:00", wed: "07:00-00:00", thu: "07:00-00:00", fri: "07:00-23:00", sat: "09:00-23:00", sun: "09:00-23:00" },
          hours_verified: false,
          drinks: [
            { brand: "Red Bull", product: "Red Bull", size_oz: 12, price: 3.75, verified: true, observed_at: "2026-11-07T22:00" },
            { brand: "Monster",       product: "Monster Energy",     size_oz: 16,   price: 2.99, verified: false, observed_at: null },
            { brand: "Celsius", product: "Celsius", size_oz: 12, price: 3.50, verified: true, observed_at: "2026-11-07T22:00" },
            { brand: "5-hour Energy", product: "5-hour Energy shot", size_oz: 1.93, price: 3.25, verified: false, observed_at: null },
            { brand: "Bang", product: "Bang Energy", size_oz: 16, price: 3.50, verified: true, observed_at: "2026-11-07T22:00" },
            { brand: "Rockstar", product: "Rockstar Energy", size_oz: 16, price: 3.50, verified: true, observed_at: "2026-11-07T22:00" },
            { brand: "Alani Nu", product: "Alani Nu", size_oz: 12, price: 3.50, verified: true, observed_at: "2026-11-07T22:00" },
          ],
        },
      ],
    },

    {
      id: "pav", code: "PAV",
      name: "The Pavilion",
      short: "Pav",
      // Position read off the "Pavilion" building label on the OpenStreetMap map (east of Evans).
      lat: 30.61681, lng: -96.33804, coord_source: "osm", label_dir: "right",
      description: "Aggie Express convenience store.",
      // Dashboard: "Sat: Closed (12:00 PM - 6:00 PM standard)".
      hours: { mon: "07:30-22:00", tue: "07:30-22:00", wed: "07:30-22:00", thu: "07:30-22:00", fri: "07:30-17:00", sat: "12:00-18:00", sun: "14:00-22:00" },
      hours_verified: false,
      vendors: [
        {
          id: "pav-ae", name: "Aggie Express (Pav)", label: "Aggie Express", type: "market",
          accepts_dining_dollars: true,
          location_detail: "Aggie Express convenience store inside the Pavilion.",
          // Dashboard gives one window, 7:30 AM - 7 PM. Copied as-is for every day,
          // so check Saturday (building closed) and Sunday (building opens 2 PM).
          hours: { mon: "07:30-19:00", tue: "07:30-19:00", wed: "07:30-19:00", thu: "07:30-19:00", fri: "07:30-19:00", sat: "12:00-18:00", sun: "07:30-19:00" },
          hours_verified: false,
          drinks: [
            { brand: "Red Bull", product: "Red Bull", size_oz: 12, price: 3.75, verified: true, observed_at: "2026-11-07T17:30" },
            { brand: "Monster",       product: "Monster Energy",     size_oz: 16,   price: 2.99, verified: false, observed_at: null },
            { brand: "Celsius", product: "Celsius", size_oz: 12, price: 3.50, verified: true, observed_at: "2026-11-07T17:30" },
            { brand: "5-hour Energy", product: "5-hour Energy shot", size_oz: 1.93, price: 3.25, verified: false, observed_at: null },
            { brand: "Bang", product: "Bang Energy", size_oz: 16, price: 3.50, verified: true, observed_at: "2026-11-07T17:30" },
            { brand: "Rockstar", product: "Rockstar Energy", size_oz: 16, price: 3.50, verified: true, observed_at: "2026-11-07T17:30" },
            { brand: "Alani Nu", product: "Alani Nu", size_oz: 12, price: 3.50, verified: true, observed_at: "2026-11-07T17:30" },
          ],
        },
      ],
    },

    {
      id: "polo", code: "POLO",
      name: "Polo Road Garage",
      short: "Polo",
      lat: 30.62282, lng: -96.33803, coord_source: "osm", label_dir: "right",
      description: "Parking garage on Polo Rd with a Market convenience store.",
      hours: { mon: "24h", tue: "24h", wed: "24h", thu: "24h", fri: "24h", sat: "24h", sun: "24h" },
      hours_verified: false,
      vendors: [
        {
          id: "polo-market", name: "Market at Polo Garage", label: "Market", type: "market",
          accepts_dining_dollars: true,
          location_detail: "Market inside the Polo Road Garage.",
          hours: { mon: "08:00-20:00", tue: "08:00-20:00", wed: "08:00-20:00", thu: "08:00-20:00", fri: "08:00-20:00", sat: "closed", sun: "closed" },
          hours_verified: false,
          drinks: [
            { brand: "Red Bull", product: "Red Bull",       size_oz: 12, price: 3.29, verified: false, observed_at: null, source: "Team check against online sources and prior knowledge; not observed in person" },
            { brand: "Monster",  product: "Monster Energy", size_oz: 16, price: 2.99, verified: false, observed_at: null, source: "Team check against online sources and prior knowledge; not observed in person" },
            { brand: "Celsius", product: "Celsius", size_oz: 12, price: 3.50, verified: false, observed_at: null, source: "Team check against online sources and prior knowledge; not observed in person" },
            { brand: "Alani Nu", product: "Alani Nu",       size_oz: 12, price: 2.99, verified: false, observed_at: null, source: "Team check against online sources and prior knowledge; not observed in person" },
            { brand: "Rockstar", product: "Rockstar Energy", size_oz: 16, price: 3.50, verified: false, observed_at: null, source: "Team check against online sources and prior knowledge; not observed in person" },
            { brand: "Bang", product: "Bang Energy", size_oz: 16, price: 3.50, verified: false, observed_at: null, source: "Team check against online sources and prior knowledge; not observed in person" },
          ],
        },
      ],
    },

    {
      id: "ilcb", code: "ILCB",
      // The dashboard names ILCB "Interdisciplinary Life Sciences Building" (that is ILSB).
      // ILCB at this position is the Innovative Learning Classroom Building per OpenStreetMap.
      name: "Innovative Learning Classroom Building",
      short: "ILCB",
      lat: 30.61195, lng: -96.34443, coord_source: "osm", label_dir: "left",
      description: "Classroom building by Lamar St. Served by the Market at Lamar.",
      hours: { mon: "07:00-20:00", tue: "07:00-20:00", wed: "07:00-20:00", thu: "07:00-20:00", fri: "07:00-20:00", sat: "07:00-20:00", sun: "07:00-20:00" },
      hours_verified: false,
      vendors: [
        {
          id: "ilcb-market", name: "Market at Lamar", label: "Market at Lamar", type: "market",
          accepts_dining_dollars: true,
          location_detail: "Market at Lamar, by the ILCB.",
          hours: { mon: "08:00-18:00", tue: "08:00-18:00", wed: "08:00-18:00", thu: "08:00-18:00", fri: "08:00-15:00", sat: "closed", sun: "closed" },
          hours_verified: false,
          drinks: [
            { brand: "Red Bull", product: "Red Bull",       size_oz: 12, price: 3.29, verified: false, observed_at: null, source: "Team check against online sources and prior knowledge; not observed in person" },
            { brand: "Monster",  product: "Monster Energy", size_oz: 16, price: 2.99, verified: false, observed_at: null, source: "Team check against online sources and prior knowledge; not observed in person" },
            { brand: "Celsius", product: "Celsius", size_oz: 12, price: 3.50, verified: false, observed_at: null, source: "Team check against online sources and prior knowledge; not observed in person" },
            { brand: "Alani Nu", product: "Alani Nu",       size_oz: 12, price: 2.99, verified: false, observed_at: null, source: "Team check against online sources and prior knowledge; not observed in person" },
            { brand: "Rockstar", product: "Rockstar Energy", size_oz: 16, price: 3.50, verified: false, observed_at: null, source: "Team check against online sources and prior knowledge; not observed in person" },
            { brand: "Bang", product: "Bang Energy", size_oz: 16, price: 3.50, verified: false, observed_at: null, source: "Team check against online sources and prior knowledge; not observed in person" },
          ],
        },
      ],
    },
  ],
};
