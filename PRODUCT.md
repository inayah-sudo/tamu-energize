# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: Texas A&M students on the main campus in College Station.** They're between classes or studying in a specific building and need an energy drink. They want to know where the nearest or cheapest one is, what it costs, where exactly it sits inside the building, and whether that store or machine is open right now. They usually check on a phone while walking.

**Secondary: TAMU Datathon judges** for the "Build Your Own Dataset" challenge. They look at the data method, data quality and the dashboard. When the two audiences pull in different directions, design decisions favor students.

**Internal: the TAMU Energize team.** Team members confirm prices on site, review price reports that visitors send in, and publish corrections. They sign in with a shared team key.

## Product Purpose

An interactive map of the main campus showing where to buy energy drinks, what each brand costs (including $/oz), where it is inside each building, and whether it's open now.

It exists because this information isn't gathered anywhere else. Success means a student can go from "I need a drink" to the right place in a few seconds, and can trust the price they see.

The product stays live after the Datathon. The team will keep prices verified and the site running for students.

## Positioning

A dataset the team collected themselves, at the level of a single shelf or vending machine, and kept honest in public. Every price shows whether a team member saw it in person, with a timestamp. Students can flag wrong prices, and those reports feed a prioritized list the team checks on site. Every building's hours are worked out in campus time.

## Operating Context

- **Students:** usually on a phone, outdoors or in a hallway, often in a hurry. They use the open-now filter, the brand filter and "Near me". Late-night studying matters, because some hours run past midnight.
- **Team:** visits locations, photographs price tags (cropping out people), updates `data.js`, sets `verified: true` and `observed_at`, and commits.
- **Price reports:** go to a team-owned Google Sheet through a Google Apps Script web app (`server/Code.gs`). Team members open the Reports page, apply or dismiss each report, and download the updated `data.js`. The public sees a corrected price once that file is committed.
- **Judges:** read the dashboard, the README's data method and the CSV export.

## Capabilities and Constraints

- **Stack:** static HTML/CSS/JS with no build step and no dependencies to install. Leaflet loads from a CDN and the map uses OpenStreetMap tiles. Hosted on GitHub Pages. An existing codebase, so no stack decision was needed.
- **Features:**
  - campus map with a pin for each building, showing an open/closed dot and the cheapest drink there
  - building detail: hours (today highlighted), vendors and where they are inside, drinks sorted by price with $/oz, walking directions
  - brand filter and open-now filter, worked out in America/Chicago time, including hours past midnight
  - Compare prices table
  - Dashboard rebuilt from the team's Databricks export: counters, the Building & Venue Guide, average price by building, locations by venue type, and the Energy Drink Catalog
  - Report a price, plus a Reports page for team members only
  - Near me, which needs https or localhost
  - CSV export
- **Coverage:** seven buildings: MSC, Zachry, Evans, Commons, Pavilion, Polo Road Garage, and ILCB / Market at Lamar. Vendor types are vending, bookstore and market. Brands are Red Bull, Monster, Celsius, 5-hour Energy and Alani Nu.
- **Terminology:** "verified" means a team member saw the price in person. "Sample" or "unverified" labels a price nobody has confirmed. "Local mode" is when `reportsEndpoint` is empty and reports stay in that browser.
- **Known limits:**
  - prices are a snapshot, and vending machines may charge differently for card and cash
  - stock varies
  - hours change during breaks and finals
  - walking times use straight-line distance at about 3 mph
  - coverage is incomplete
  - the Pavilion's position is approximate
- **Open:** the reports endpoint isn't configured yet (`config.js` is empty). Placeholder location details ("fill in floor and wing") still need on-site checks.

## Brand Commitments

- **Name:** TAMU Energize. Subtitle in use: "Campus price index · College Station, TX".
- **Disclaimer to keep:** not affiliated with Texas A&M University or any brand shown. Map tiles and coordinates © OpenStreetMap contributors.
- **Voice:** plain and practical, honest about uncertainty. Unverified data is always labeled.
- **Reporter privacy:** reports ask people not to include names or personal details.

## Evidence on Hand

- `data.js`: buildings, vendors, hours and drinks, from the team's Databricks export (`campus_buildings`, `energy_drink_catalog`) dated 2026-11-07. Every price is currently `verified: false`.
- `aggie_energy_drinks.csv` (copy in `../data/`): 27 drink-price rows across 7 buildings, all unverified, and several location details still placeholders.
- The README's data-method section is a template. Sample sizes and visit times aren't filled in.
- There are no testimonials, usage numbers, partner endorsements or verified prices yet. Don't make any up.

## Product Principles

1. **Answer the walking question fast.** Where, how much, is it open: everything else comes second to getting a student to a drink.
2. **Never present a guess as a fact.** Verification status, timestamps and approximate positions stay visible wherever a value appears.
3. **Phones on campus are the default.** Design for one hand, glare and a short attention span. A big desktop screen is the bonus case.
4. **Keep the dataset alive.** Reporting a price should take seconds for visitors, and the team's job of checking and publishing should stay quick enough to actually happen after the Datathon.
5. **Stay static and free to host.** No build step and no paid backend beyond the team-owned Google Sheet.
