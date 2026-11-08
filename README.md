# TAMU Energize

An interactive map of Texas A&M's main campus showing where to buy energy drinks, what each
brand costs, where exactly it is inside the building, and whether it's open right now.

Built for the TAMU Datathon **Build Your Own Dataset** challenge.

> **Data source:** `data.js` holds the team's dataset from the Databricks dashboard export
> (`campus_buildings` and `energy_drink_catalog`, 2026-11-07).
>
> Each price stays marked `verified: false` until a team member confirms it on site.
> The app marks unconfirmed prices once per building ("prices not confirmed") and tags each confirmed
> price individually (see *Collecting the data*). Team notes in `location_detail` written as
> "(fill in …)", "(todo …)" or "(tbd …)" are hidden from visitors but kept in the CSV and Reports page.

## Features

- Campus map (OpenStreetMap) with labelled pins for MSC, Zachry, Evans, Commons, Pav, Polo and ILCB.
  Each pin shows an open/closed dot and the cheapest drink there.
- Click a building to see:
  - building hours and each store or machine's hours, with today's row highlighted
  - every vendor and where it is inside the building
  - the drinks, sorted by price, with $/oz
  - walking directions
- Brand filter (Celsius, Monster, Red Bull, …). The map and list then show the cheapest price for that brand.
- "Open now only" filter, worked out in campus time (America/Chicago), including hours past midnight.
- **Compare prices** tab: every drink on campus in one sortable table (price, $/oz, size, place).
- **Dashboard** (header button): the team's Databricks dashboard rebuilt inside the app, computed live from `data.js`. It has:
  - counters for buildings, locations, brands and drink options, with how many are open now
  - the Building & Venue Guide
  - average price by building
  - locations by venue type
  - a sortable Energy Drink Catalog

  Click any row or bar to jump to that building on the map.
- **Report a price** (flag next to every price): anyone can report a price that looks wrong.
  - **Reporting:** they enter the price they saw, whether they saw it in person, and an optional note.
  - **Reports page:** turns the reports into an investigation list.
    - One row per drink, ranked by priority.
    - Each row shows where to check, the hours, the listed vs reported price (median of all reports), and the change in $ and %.
  - **Apply:** after checking on site, a team member clicks Apply. The new price shows everywhere in the app, marked verified with a timestamp.
  - **Dismiss:** keeps the listed price instead.
  - **Copy report** / **Download report (.md)** produce a write-up you can paste into a GitHub issue or team chat.
  - **Download updated data.js** exports the confirmed prices, ready to commit.
  - **Who sees reports:** visitors can only *send* reports. The Reports page, "reported" tags and counts are for signed-in team members only (**Team sign-in** at the bottom of the side panel, or `#team` in the URL).
  - **Where reports live:** in a Google Sheet your team owns, through a small Google Apps Script. Setup takes about 5 minutes: see [`server/README.md`](server/README.md), then paste the web app URL into `config.js`.
    - The server checks the team key before it shows or changes any report, so all team members see the same reports.
    - Reports filed while offline are queued and sent automatically when the device reconnects.
    - Without `config.js` set, the app runs in *local mode* (reports stay in that browser), which is only meant for trying it out.
  - **Publishing:** confirmed prices appear for team members straight away. The public sees them once the exported `data.js` is committed.
  - **Priority rules:**
    - **High:** 3+ reports, or seen in person and off by 10% or more.
    - **Medium:** 2 reports, off by 5% or more, or seen in person.
    - **Low:** anything else.
- **Near me**: uses your location to sort places by distance and estimate walking time.
- **Export CSV**: downloads the full dataset as `aggie_energy_drinks.csv`.
- Right-click (or long-press on a phone) the map to read coordinates for fixing a building's position.

## Run it

No build step and no dependencies to install. Leaflet loads from a CDN.

- **Quickest:** open `index.html` in a browser.
- **"Near me" needs a server**, because browsers only allow location on `https` or `localhost`:

```bash
cd aggie-energy-map
python -m http.server 8000
```

Then open http://localhost:8000.

To host it free, push the folder to GitHub and turn on **GitHub Pages**
(Settings → Pages → deploy from the main branch).

## Files

| File | What it is |
|---|---|
| `index.html` | Page layout |
| `styles.css` | Styling (maroon theme, responsive down to phone width) |
| `app.js` | Map, filters, open/closed logic, compare table, CSV export |
| `data.js` | **The dataset**: buildings, vendors, hours, drinks, prices |
| `config.js` | Reports server URL (`reportsEndpoint`) |
| `server/Code.gs` | Google Apps Script backend for team-only price reports |
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

## Collecting the data (methodology template — fill in)

1. **Where/when:** list each location visited and the date and time window, e.g. "MSC B&N, Sat Nov 7, 2:10–2:25 PM".
2. **How:** one team member records each energy drink on the shelf or in the machine.
   - Note brand, product, size and the posted price.
   - Note the spot inside the building.
   - Take a photo of the price tag or machine label as evidence, cropping out people.
3. **Hours:** copy from the posted sign at the door, or note where else they came from.
4. **Entry:** update `data.js`, then set `verified: true` and `observed_at`.
   - The header counter shows how many prices are verified.
   - Use **Export CSV** to save the dataset file for the repo.
5. **Sample size:** _N_ locations, _N_ vendors, _N_ drink price observations.

## Limitations

- **Prices are a snapshot.** They change, and vending machines may charge differently for card and cash.
- **Stock varies:** a drink listed here may be sold out.
- **Hours change** during breaks, holidays and finals.
- **The Pavilion's map position was read off the OpenStreetMap map label**, because the building can't be looked up by name. Confirm it on site.
- **Walking times** are straight-line distance at about 3 mph, not actual routes.
- **Not complete:** only the buildings listed are covered, and other campus locations also sell energy drinks.

## Credits

Map tiles and building coordinates © OpenStreetMap contributors. Map library: Leaflet.
Not affiliated with Texas A&M University or any brand shown.
