/*
 * offcampus.js - off-campus energy drink prices and store hours for College Station.
 * Written by scripts/snapshot_offcampus.py from Snowflake. Don't edit by hand.
 */
window.OFFCAMPUS_DATA = {
 "meta": {
  "status": "ok",
  "generated_at": "2026-11-08T08:24:24+00:00",
  "source": "Snowflake: ENERGY_DB.PRICING.GET_ENERGY_DRINK_PRICES, ENERGY_DB.PRICING.GET_STORE_HOURS",
  "store_count": 5,
  "product_count": 14
 },
 "stores": [
  {
   "name": "SAMPLE Convenience A",
   "store_type": "convenience",
   "address": "TEST ADDRESS 3, College Station, TX",
   "hours": {
    "mon": "24h",
    "tue": "24h",
    "wed": "24h",
    "thu": "24h",
    "fri": "24h",
    "sat": "24h",
    "sun": "24h"
   },
   "hours_text": "",
   "lat": null,
   "lng": null,
   "products": [
    {
     "brand": "Bang",
     "product": "Bang Blue Razz",
     "size_oz": 16.0,
     "pack_count": 1,
     "price": 2.99,
     "last_updated": "2026-11-08T00:10:37.278000"
    },
    {
     "brand": "Monster",
     "product": "Monster Energy Original",
     "size_oz": 16.0,
     "pack_count": 1,
     "price": 3.29,
     "last_updated": "2026-11-08T00:10:37.278000"
    },
    {
     "brand": "Red Bull",
     "product": "Red Bull Original",
     "size_oz": 8.4,
     "pack_count": 1,
     "price": 3.49,
     "last_updated": "2026-11-08T00:10:37.278000"
    }
   ],
   "membership_required": false,
   "id": "sample-convenience-a"
  },
  {
   "name": "SAMPLE Convenience B",
   "store_type": "convenience",
   "address": "TEST ADDRESS 4, College Station, TX",
   "hours": null,
   "hours_text": "Daily 5:00-24:00",
   "lat": null,
   "lng": null,
   "products": [
    {
     "brand": "Celsius",
     "product": "Celsius Kiwi Guava",
     "size_oz": 12.0,
     "pack_count": 1,
     "price": 2.79,
     "last_updated": "2026-11-08T00:10:37.278000"
    },
    {
     "brand": "Ghost",
     "product": "Ghost Sour Patch Kids",
     "size_oz": 16.0,
     "pack_count": 1,
     "price": 3.19,
     "last_updated": "2026-11-08T00:10:37.278000"
    }
   ],
   "membership_required": false,
   "id": "sample-convenience-b"
  },
  {
   "name": "SAMPLE Grocery A",
   "store_type": "grocery",
   "address": "TEST ADDRESS 1, College Station, TX",
   "hours": null,
   "hours_text": "Daily 6:00-23:00",
   "lat": null,
   "lng": null,
   "products": [
    {
     "brand": "Celsius",
     "product": "Celsius Sparkling Orange",
     "size_oz": 12.0,
     "pack_count": 12,
     "price": 22.99,
     "last_updated": "2026-11-08T00:10:37.278000"
    },
    {
     "brand": "Monster",
     "product": "Monster Energy Original",
     "size_oz": 16.0,
     "pack_count": 1,
     "price": 2.5,
     "last_updated": "2026-11-08T00:10:37.278000"
    },
    {
     "brand": "Red Bull",
     "product": "Red Bull Original",
     "size_oz": 8.4,
     "pack_count": 1,
     "price": 2.98,
     "last_updated": "2026-11-08T00:10:37.278000"
    }
   ],
   "membership_required": false,
   "id": "sample-grocery-a"
  },
  {
   "name": "SAMPLE Grocery B",
   "store_type": "grocery",
   "address": "TEST ADDRESS 2, College Station, TX",
   "hours": null,
   "hours_text": "Daily 7:00-22:00",
   "lat": null,
   "lng": null,
   "products": [
    {
     "brand": "Alani Nu",
     "product": "Alani Nu Cosmic Stardust",
     "size_oz": 12.0,
     "pack_count": 1,
     "price": 2.49,
     "last_updated": "2026-11-08T00:10:37.278000"
    },
    {
     "brand": "Monster",
     "product": "Monster Zero Ultra",
     "size_oz": 16.0,
     "pack_count": 4,
     "price": 8.98,
     "last_updated": "2026-11-08T00:10:37.278000"
    },
    {
     "brand": "Red Bull",
     "product": "Red Bull Original",
     "size_oz": 12.0,
     "pack_count": 4,
     "price": 9.48,
     "last_updated": "2026-11-08T00:10:37.278000"
    }
   ],
   "membership_required": false,
   "id": "sample-grocery-b"
  },
  {
   "name": "SAMPLE Wholesale Club",
   "store_type": "wholesale",
   "address": "TEST ADDRESS 5, Bryan/College Station, TX",
   "hours": null,
   "hours_text": "Mon-Fri 10:00-20:30; Sat 9:30-18:00; Sun 10:00-18:00",
   "lat": null,
   "lng": null,
   "products": [
    {
     "brand": "Celsius",
     "product": "Celsius Variety Pack",
     "size_oz": 12.0,
     "pack_count": 18,
     "price": 21.99,
     "last_updated": "2026-11-08T00:10:37.278000"
    },
    {
     "brand": "Monster",
     "product": "Monster Energy Original",
     "size_oz": 16.0,
     "pack_count": 24,
     "price": 39.99,
     "last_updated": "2026-11-08T00:10:37.278000"
    },
    {
     "brand": "Red Bull",
     "product": "Red Bull Original",
     "size_oz": 8.4,
     "pack_count": 24,
     "price": 36.99,
     "last_updated": "2026-11-08T00:10:37.278000"
    }
   ],
   "membership_required": true,
   "id": "sample-wholesale-club"
  }
 ]
};
