# Jira OAuth Setup (Cloud)

This guide walks you through connecting TaskScope to your Jira Cloud instance via
OAuth 2.0 (3LO). After setup a one-click "Connect Jira" button at `/connect`
handles authorisation — no API tokens to hunt for.

> **Jira Server / Data Center?** OAuth is Cloud-only. Set `JIRA_BASE_URL` and
> `JIRA_API_TOKEN` in `.env` directly and skip this guide.

---

## 1. Create the OAuth 2.0 (3LO) app

1. Go to [developer.atlassian.com](https://developer.atlassian.com/console/myapps/)
   and sign in with the Atlassian account that owns the Jira site you want to connect.
2. Click **Create** and choose **OAuth 2.0 integration**.
3. Give it a name (e.g. "TaskScope") and accept the developer terms.

---

## 2. Add the Jira platform REST API and scopes

1. In your new app's sidebar, click **Permissions**.
2. Find **Jira platform REST API** and click **Add**.
3. Click **Edit scopes** next to it and enable these three classic scopes:
   - `read:jira-work` — read issue and project data
   - `read:jira-user` — read user profiles
   - `offline_access` — enables the refresh token so TaskScope stays connected
4. Save.

---

## 3. Set the callback URL

1. In the sidebar, click **Authorization**.
2. Under **OAuth 2.0 (3LO)**, click **Add your callback URL**.
3. Enter exactly:
   ```
   http://localhost:3000/api/auth/jira/callback
   ```
   (For production, enter your deployed URL instead.)
4. Save.

---

## 4. Copy credentials into `.env`

1. In the sidebar, click **Settings**.
2. Copy the **Client ID** and **Secret**.
3. Open `.env` in the project root (create it from `.env.example` if needed) and add:
   ```env
   JIRA_OAUTH_CLIENT_ID=<your client id>
   JIRA_OAUTH_CLIENT_SECRET=<your client secret>
   ```
   Leave `JIRA_OAUTH_REDIRECT_URI` blank to use the default `http://localhost:3000/api/auth/jira/callback`.

---

## 5. Authorize and connect

1. Start the dev server: `npm run dev` inside `web/`.
2. Open [http://localhost:3000/connect](http://localhost:3000/connect).
3. Click **Connect Jira**.
4. Atlassian's consent screen appears — select the site you want and approve.
5. You are redirected back to `/connect` showing your site name. Done.

The access token is stored in `data/jira-oauth.json` (project-contained, git-ignored).
It refreshes automatically whenever the ingest runs — refresh tokens rotate on each
use, so the file is always updated with the latest token pair.

---

## Dev-mode note

Your app works immediately for sites that the authorising Atlassian account has
access to. Atlassian review is only required before you distribute the app to other
users outside your organisation.

---

## Token lifecycle

| Thing | Value |
|---|---|
| Access token expiry | ~1 hour (`expires_in` from Atlassian) |
| Refresh token rotation | Yes — always store the new `refresh_token` returned on refresh |
| Refresh token inactivity expiry | 90 days (each use resets the timer) |
| Auto-refresh window | 5 minutes before expiry (handled by `src/ingest/oauth.ts`) |

If a refresh token expires (90 days of no use), re-visit `/connect` and click
**Connect Jira** again to re-authorise.
