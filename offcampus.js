/*
 * offcampus.js - off-campus energy drink prices and store hours for College Station.
 *
 * Written by scripts/snapshot_offcampus.py, which .github/workflows/offcampus-snapshot.yml runs on a
 * schedule. It calls the Snowflake procedures GET_ENERGY_DRINK_PRICES and GET_STORE_HOURS.
 * Don't edit by hand: the next snapshot replaces this file.
 *
 * Until the Snowflake secrets are set up (see README.md), this placeholder keeps the off-campus
 * view empty and says the prices aren't connected yet.
 */
window.OFFCAMPUS_DATA = {
  "meta": {
    "status": "not_connected",
    "generated_at": null,
    "source": "Snowflake: GET_ENERGY_DRINK_PRICES, GET_STORE_HOURS"
  },
  "stores": []
};
