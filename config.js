/*
 * config.js - app settings.
 *
 * reportsEndpoint: the Google Apps Script web app URL from server/README.md (ends in /exec).
 *   Set   -> reports go to your team's Google Sheet; only signed-in team members can see them.
 *   Empty -> "local mode" for testing: reports stay in this browser only.
 */
window.APP_CONFIG = {
  reportsEndpoint: "",
};
