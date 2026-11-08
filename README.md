# TAMU Energize

An interactive map of energy drink prices in College Station. **On campus** it shows where to buy
energy drinks at Texas A&M, what each brand costs, where exactly it is inside the building, and
whether it's open right now. **Off campus** it shows grocery, convenience and wholesale stores around
town, ranked by lowest price per can.

Live site: https://inayah-sudo.github.io/tamu-energize/

Built for the TAMU Datathon **Build Your Own Dataset** challenge.

> **Data sources**
> - **On campus:** `data.js` holds the team's dataset from the Databricks dashboard export
>   (`campus_buildings` and `energy_drink_catalog`, 2026-11-07). Each price stays marked
>   `verified: false` until a team member confirms it on site; the published dataset records which prices
>   were seen in person. Team notes in `location_detail` written as "(fill in …)",
>   "(todo …)" or "(tbd …)" are hidden from visitors.
> - **Off campus:** `offcampus.js` combines a scheduled snapshot of two Snowflake procedures,
>   `GET_ENERGY_DRINK_PRICES` and `GET_STORE_HOURS`, with the stores in `scripts/manual_stores.json`.
>   Those prices currently come from online listings and are labelled that way in the dataset.

## Features

- **On campus / Off campus** switch at the top. Everything below follows it: map, list, filters and compare table.
- Map (OpenStreetMap) with a labelled pin per place. Each pin shows an open/closed dot and the
  cheapest drink there (on campus) or the lowest price per can (off campus).
- Click a place to see:
  - its hours, with today's row highlighted
  - on campus: every vendor and where it is inside the building, with walking directions
  - off campus: the address, store type, driving directions, and every drink ranked by price per can,
    with when each price was last updated
  - the drinks, with $/oz on campus and price per can off campus (multipacks: pack price / number of cans).
- **Wholesale clubs** (Costco, Sam's Club, …) are labelled, with a note that a membership is required.
- Off-campus prices older than 14 days are marked "may be out of date"; a store with no price says so
  instead of guessing.
- Brand filter (Celsius, Monster, Red Bull, …) and an "Open now" filter, worked out in campus time
  (America/Chicago), including hours past midnight.
- **Compare prices** tab: every drink in one sortable table (price, $/oz or $/can, size, place).
- **Dashboard** (header button): the team's Databricks dashboard for the on-campus data, rebuilt inside
  the app and computed live from `data.js`. Click any row or bar to jump to that building on the map.
- **Report a price** (flag next to every price): anyone can report a price that looks wrong.
  - They enter the price they saw, whether they saw it in person, and an optional note.
  - **My reports** (header button, or the link at the bottom of the side panel) lists the reports made
    in that browser, with whether each was sent. Drinks you've reported get a "you reported" tag.
    The list is kept in the browser's storage, so it's per device.
  - If `config.js` has a `reportsEndpoint`, each report is also sent to a Google Sheet your team owns
    (see [`server/README.md`](server/README.md)). Reports filed while offline are queued and sent
    when the device reconnects. The team reviews reports in the Sheet; nobody can read them through the app.
- **Near me**: uses your location to sort places by distance (walking time on campus, miles off campus).
- Right-click (or long-press on a phone) the map to read coordinates for fixing a building's position.

## Run it

No build step and no dependencies to install. Leaflet loads from a CDN.

- **Quickest:** open `index.html` in a browser.
- **"Near me" needs a server**, because browsers only allow location on `https` or `localhost`:

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

The site is hosted free on **GitHub Pages** from the `main` branch.

## Off-campus prices (Snowflake)

The two procedures from `ENERGY_DRINK_PRICE_AGENT.agent.yaml` run inside a Snowflake warehouse, and
calling them needs a Snowflake login. A public static site can't hold a secret, so the site never calls
Snowflake itself. Instead:

1. `.github/workflows/offcampus-snapshot.yml` runs every 6 hours (and on demand from the **Actions** tab).
2. It runs `scripts/snapshot_offcampus.py`, which calls
   `GET_ENERGY_DRINK_PRICES('ALL', <store type>)` for `GROCERY`, `CONVENIENCE` and `WHOLESALE`, and `GET_STORE_HOURS()`.
3. The script joins prices to stores by store name and converts hours into the app's format. It also
   looks up new store addresses on OpenStreetMap once, caching them in `scripts/store_coords.json`,
   where you can fix a wrong pin by hand.
4. If anything changed, the workflow commits `offcampus.js`, and GitHub Pages republishes the site.

**Setup** (repo → Settings → Secrets and variables → Actions):

| Name | Kind | What |
|---|---|---|
| `SNOWFLAKE_ACCOUNT` | secret | Account identifier, e.g. `myorg-myaccount` |
| `SNOWFLAKE_USER` | secret | A user that can run both procedures (a dedicated service user is best) |
| `SNOWFLAKE_WAREHOUSE` | secret | The warehouse from the agent file (`<WAREHOUSE>`) |
| `SNOWFLAKE_PRIVATE_KEY` | secret | Key-pair login: the PEM private key (recommended) |
| `SNOWFLAKE_PRIVATE_KEY_PASSPHRASE` | secret | Only if that key is encrypted |
| `SNOWFLAKE_PASSWORD` | secret | Instead of a key: a password or programmatic access token |
| `SNOWFLAKE_ROLE` | secret | Optional role to use |
| `PRICES_PROCEDURE` | variable | Defaults to `MY_DB.PUBLIC.GET_ENERGY_DRINK_PRICES` |
| `HOURS_PROCEDURE` | variable | Defaults to `MY_DB.PUBLIC.GET_STORE_HOURS` |

Then open **Actions → Off-campus price snapshot → Run workflow**. Until the secrets exist, the job
finishes with a notice and the site says off-campus prices aren't connected yet.

**What the procedures should return.** Column names are matched case-insensitively.
- Prices: `store`, `brand`, `product`, `size_oz`, `pack_count`, `price`, `last_updated`
  (`price_per_oz` isn't used).
- Hours: `store`, `address`, plus hours as either a column per day (`monday` … `sunday`, e.g.
  `7:00 AM - 10:00 PM`, `Closed`, `Open 24 hours`), one row per store and `day` with
  `open_time`/`close_time`, or a single `hours` value. Optional `store_type`, `lat`/`lng`.
  Hours the script can't read are shown as text, without an open/closed status.

## Files

| File | What it is |
|---|---|
| `index.html` | Page layout |
| `styles.css` | Styling (maroon and teal, responsive down to phone width) |
| `app.js` | Map, filters, open/closed logic, compare table, price reports |
| `data.js` | **On-campus dataset**: buildings, vendors, hours, drinks, prices |
| `offcampus.js` | **Off-campus dataset**: Snowflake snapshot (generated, don't edit) |
| `data/` | **The published dataset** (CSV) and the in-person collection sheet |
| `METHODOLOGY.md` | How the data was collected, fields, processing and limitations |
| `scripts/manual_stores.json` | Off-campus stores added by hand |
| `scripts/export_dataset.js` | Builds the CSV files in `data/` |
| `config.js` | Reports server URL (`reportsEndpoint`) |
| `scripts/snapshot_offcampus.py` | Pulls the off-campus data from Snowflake |
| `.github/workflows/offcampus-snapshot.yml` | Runs that script every 6 hours |
| `server/Code.gs` | Google Apps Script that saves price reports to a Google Sheet |
| `server/README.md` | 5-minute setup for the reports server |

## Data dictionary (`data.js`)

**Building**

| Field | Meaning |
|---|---|
| `id`, `name`, `short` | Identifier, full name, label on the map |
| `lat`, `lng` | Position (WGS84) |
| `coord_source` | `osm` = from OpenStreetMap; `approximate` = best guess, needs checking |
| `hours` | Building hours per day, `mon`…`sun` (format below) |
| `hours_verified` | `true` once confirmed on site or from an official posting |
| `vendors` | Stores / machines in the building |

**Vendor**

| Field | Meaning |
|---|---|
| `name`, `type` | e.g. "Aggie Express (Commons)"; `store`, `vending`, or `market` |
| `location_detail` | Where inside the building (floor, wing, near which entrance) |
| `hours` | Vendor hours, or `null` = same as the building |
| `accepts_dining_dollars` | `true` or `false` once recorded in person; leave out until then |

**Drink** (one row per product per vendor)

| Field | Meaning |
|---|---|
| `brand`, `product` | e.g. `Celsius`, `Celsius Original` |
| `size_oz` | Can size in fluid ounces |
| `price` | Shelf/machine price in USD, before tax |
| `verified` | `true` only if a team member saw this price in person |
| `observed_at` | When it was seen, ISO local time, e.g. `2026-11-07T14:20` |

**Hours format:**
- `"07:00-22:00"` is one window, and `"07:00-11:00,12:00-20:00"` is several.
- `"22:00-02:00"` runs past midnight.
- `"24h"` is open all day, and `"closed"` is closed.

## Collecting the data

How the data was gathered, its fields, processing, assumptions and limits are in
[METHODOLOGY.md](METHODOLOGY.md). The dataset itself is in [`data/`](data/).

## Limitations

- **Prices are a snapshot.** They change, and vending machines may charge differently for card and cash.
- **Stock varies:** a drink listed here may be sold out.
- **Hours change** during breaks, holidays and finals.
- **The Pavilion's map position was read off the OpenStreetMap map label**, because the building can't be looked up by name. Confirm it on site.
- **Walking times** are straight-line distance at about 3 mph, not actual routes.
- **Not complete:** only the buildings listed are covered, and other campus locations also sell energy drinks.
- **Off-campus prices are only as fresh as the data source.** The site shows each price's last-updated date and the snapshot time; it doesn't check shelves itself.
- **My reports are per browser.** Clearing site data or switching devices starts a fresh list.

## Credits

Map tiles, building coordinates and store address lookups © OpenStreetMap contributors. Map library: Leaflet.
Not affiliated with Texas A&M University or any brand shown.
