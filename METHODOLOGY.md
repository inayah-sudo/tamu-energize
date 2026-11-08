# Data collection methodology

How the TAMU Energize dataset was gathered, for the TAMU Datathon **Build Your Own Dataset** challenge.

> **Status: in-person collection is planned and not done yet.** The team will physically visit every
> location and vending machine and record prices and Dining Dollars acceptance. Until then, every price
> in the app comes from the team's earlier Databricks export or from online listings, and nothing here
> should be read as observed in person. Blanks marked **`TO FILL IN`** are completed after the visits.

## Dataset

| File | What it is |
|---|---|
| [`data/energy_drink_prices.csv`](data/energy_drink_prices.csv) | Every price in the app, one row per product per seller, with its source |
| [`data/field_collection_sheet.csv`](data/field_collection_sheet.csv) | Checklist for recording prices in person |
| [`data.js`](data.js) | On-campus data the app reads |
| [`offcampus.js`](offcampus.js) | Off-campus data the app reads |

Current contents: **48 on-campus prices** at 8 vendors in 7 buildings, and **27 off-campus prices** at 4 stores.

## Collection status

| Data | Source | Collected in person? |
|---|---|---|
| On-campus prices supplied by the team on 2026-11-08 (28: Celsius, Rockstar, Bang, Alani Nu, and Red Bull at Aggie Express) | Team | **Not yet confirmed as seen in person** |
| Dining Dollars acceptance at all 8 on-campus vendors | Team, 2026-11-08 | **Not yet confirmed as seen in person** |
| Other on-campus prices (20) | Team's Databricks dashboard export, 2026-11-07 | **No, not yet checked** |
| On-campus building and vendor hours | Same export; marked `hours_verified` where confirmed | Not yet checked |
| CVS and Brookshire Brothers prices | Online listings | No |
| H-E-B and Walmart prices | Online listings (retailer pages and Google Shopping) | No |
| Store hours and addresses | Store websites and listings; CVS hours supplied by a team member | No |
| Map positions | OpenStreetMap | Not applicable |

Under the challenge rules, public data and web sources may only *supplement* the dataset. The team's
in-person observations must be the main dataset.

## Field collection

**Location and context:** every on-campus building and vending machine, and every off-campus store, in the
dataset. `TO FILL IN` (the final list visited, including any added on site)

**When:** `TO FILL IN` (date and time window for each location, during the event)

**Who:** `TO FILL IN` (roles only, e.g. "Collector A". Do not publish names.)

**Sample size:** `TO FILL IN` locations, `TO FILL IN` vendors, `TO FILL IN` price observations

**Method**

1. Print or open `data/field_collection_sheet.csv`. It has one row per product already listed.
2. Visit each location and each vending machine in person. Record what is on the shelf or in the machine:
   `observed_price` (posted price before tax), `observed_size_oz`, `in_stock`, `accepts_dining_dollars`
   (yes or no), `observed_date`, `observed_time` and `collector_role`. Use `machine_or_spot` to tell
   machines in the same building apart. Add a new row for any product that isn't listed.
3. Take a photo of the price tag or machine label as evidence and name it in `photo_file`.
4. Follow store rules. Ask staff if photos aren't allowed, and record the price by hand instead. Keep people,
   faces, name badges and payment screens out of photos. Don't enter restricted areas.
5. Copy posted hours from the sign at the door.

**Entering the data:** for on-campus rows, update `price`, set `verified: true` and set `observed_at` in
`data.js`, and set `accepts_dining_dollars: true` or `false` on the vendor. For off-campus rows, update `scripts/manual_stores.json`, set `accepts_dining_dollars` on the store, and change its
`price_source` to `Team observed in person`. Then run `node scripts/export_dataset.js`.

## Fields (`data/energy_drink_prices.csv`)

| Field | Meaning |
|---|---|
| `scope` | `on_campus` or `off_campus` |
| `place`, `vendor`, `vendor_type` | Building or store, the seller inside it, and its type |
| `where` | Spot inside the building (on campus) or street address (off campus) |
| `brand`, `product` | Brand and product name |
| `size_oz`, `pack_count` | Fluid ounces per can, and cans sold together |
| `price_usd` | Listed price before tax, for the whole pack |
| `price_per_can` | `price_usd / pack_count` |
| `price_per_oz` | `price_usd / (size_oz × pack_count)` |
| `accepts_dining_dollars` | `true` or `false` once recorded in person; blank until then |
| `source` | Where the price came from |
| `verified_in_person` | `true` only if a team member saw the price in person |
| `observed_at` | When it was seen or last updated |
| `lat`, `lng` | Position (WGS84) |

## Processing

- `scripts/snapshot_offcampus.py` runs the Snowflake procedures every 6 hours, merges in
  `scripts/manual_stores.json`, and writes `offcampus.js`.
- Sample and test rows in Snowflake (store names starting with `SAMPLE`, addresses containing
  `TEST ADDRESS`) are excluded, as are stores with no map position.
- `scripts/export_dataset.js` builds the CSV files from the data the app uses.
- Open/closed status is worked out in the browser in America/Chicago time.

## Assumptions and limitations

- **Can sizes for CVS and Brookshire Brothers were assumed**, because only prices were available:
  16 oz for C4, Ghost, Bang and Monster, 12 oz for Alani Nu and Celsius, and 8.4 oz for Red Bull.
- **H-E-B prices** are filed under the Texas Ave store, but only the Red Bull 12-pack was tied to that store.
  The H-E-B Quench Plus $1.00 price is a 5-for-$5 deal.
- **Walmart prices** are approximate online prices and may differ at the Brothers Blvd store. Celsius was
  listed at $16.12 to $19.98; the higher price is used.
- Off-campus coverage is four stores, chosen by the team, so it is not a full survey of College Station.
- Prices are a snapshot. They change, stock varies, vending machines may charge differently for card and
  cash, and hours change during breaks and finals.
- The Pavilion's map position was read off the OpenStreetMap label.

## Privacy

The dataset contains prices and business locations only. It holds no information about people. Reports
sent through the app ask visitors not to include names or personal details.
