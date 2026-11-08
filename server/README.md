# Reports server setup (Google Sheet + Apps Script)

This makes price reports **private to your team** and **shared between team members**.

- **Anyone** using the app can send a report. Visitors can't see any reports, not even their own.
- **Team members** sign in once per device with the team key. They then all see the same reports in the app's Reports page.
- **Reports live in a Google Sheet** you own. Share it only with your team, and you can open it directly too.

Takes about 5 minutes. Do this with the Google account that should own the data.

## 1. Create the sheet and script

1. Create a new Google Sheet, e.g. **TAMU Energize – Reports**. Share it only with your team members.
2. In the sheet: **Extensions → Apps Script**.
3. Delete what's in `Code.gs`, paste in the contents of [`Code.gs`](Code.gs), and click **Save**.

## 2. Set the team key

1. In Apps Script: **Project Settings** (gear icon) → **Script Properties** → **Add script property**.
2. Property: `TEAM_KEY`. Value: a long passphrase only your team knows, e.g. four random words.
3. Save. Share the key with your team privately (not in the repo, not in the README).

To revoke access later, change the value. Everyone then has to sign in again with the new key.

## 3. Deploy it as a web app

1. **Deploy → New deployment** → type **Web app**.
2. **Execute as:** *Me*. **Who has access:** *Anyone*.
   - "Anyone" is needed so visitors can send reports.
   - Reading or changing reports still requires the team key, which the script checks on every request.
3. Click **Deploy** and approve the permissions. The script only touches this one spreadsheet.
4. Copy the **Web app URL**. It ends in `/exec`.

## 4. Connect the app

Open `aggie-energy-map/config.js` and paste the URL:

```js
window.APP_CONFIG = {
  reportsEndpoint: "https://script.google.com/macros/s/AKfy.../exec",
};
```

Commit and push. The URL is fine to make public, because it can only accept reports without the key.

## 5. Sign in as a team member

On each team device:
1. Open the app and tap **Team sign-in** at the bottom of the side panel, or add `#team` to the URL.
2. Enter the team key.

The **Reports** button then appears with everyone's reports.

## Updating the script later

After editing `Code.gs`, use **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**. This keeps the same URL.

## Limits

- **Spam:** at most 60 reports are accepted per 10 minutes across the whole app. Notes are capped at 200 characters, and nothing that would run as a spreadsheet formula is stored.
- **Shared key:** the team key is one shared passphrase, not individual logins. Anyone who has it can review reports, so change it if it leaks.
- **Key on devices:** a signed-in device keeps the key in that browser's storage until someone clicks **Sign out** on the Reports page.
