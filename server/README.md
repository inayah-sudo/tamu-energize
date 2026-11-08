# Reports server setup (Google Sheet + Apps Script)

This sends every price report from the app to a **Google Sheet your team owns**.

- **Anyone** using the app can send a report. Each visitor also sees the reports they've made on the
  app's **My reports** page; that list is kept in their own browser.
- **Nobody can read reports back through the app.** The script only accepts new reports. Your team
  reviews them in the Sheet itself.

Without this server, reports still work: they're saved under My reports on that device, but nobody
else ever sees them.

Takes about 5 minutes. Do this with the Google account that should own the data.

## 1. Create the sheet and script

1. Create a new Google Sheet, e.g. **TAMU Energize – Reports**. Share it only with your team members.
2. In the sheet: **Extensions → Apps Script**.
3. Delete what's in `Code.gs`, paste in the contents of [`Code.gs`](Code.gs), and click **Save**.

## 2. Deploy it as a web app

1. **Deploy → New deployment** → type **Web app**.
2. **Execute as:** *Me*. **Who has access:** *Anyone*.
   - "Anyone" is needed so visitors can send reports. The script can only add rows; it can't show or change them.
3. Click **Deploy** and approve the permissions. The script only touches this one spreadsheet.
4. Copy the **Web app URL**. It ends in `/exec`.

## 3. Connect the app

Open `config.js` and paste the URL:

```js
window.APP_CONFIG = {
  reportsEndpoint: "https://script.google.com/macros/s/AKfy.../exec",
};
```

Commit and push. The URL is fine to make public, because it can only accept new reports.

## Working through reports

Each report is a row in the **Reports** tab: when it came in, which drink (`key` is
building-or-store id | brand | size), the listed price, the price the visitor saw, whether they saw it
in person, and their note. To publish a corrected on-campus price, update `data.js` (set the price,
`verified: true` and `observed_at`) and commit. Off-campus prices come from Snowflake, so fix those
at the source.

## Updating the script later

After editing `Code.gs`, use **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**. This keeps the same URL.

## Limits

- **Spam:** at most 60 reports are accepted per 10 minutes across the whole app. Notes are capped at
  200 characters, and nothing that would run as a spreadsheet formula is stored.
- **Older sheets:** the columns changed from the earlier team-review version (a `pack_count`
  column was added, and the review columns were removed). If you set up a sheet with that version,
  rename its **Reports** tab and the script will start a fresh one with the new columns.
