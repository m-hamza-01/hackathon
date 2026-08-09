# GitHub App Setup

TaskScope uses a GitHub App for private repo access. An org admin installs the App once, selects the repos to expose, and TaskScope can then ingest PRs without long-lived personal tokens.

---

## Step 1 — Create the GitHub App

1. Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**
   (or https://github.com/settings/apps/new for your personal account; for an org go to your org's Settings page instead).

2. Fill in the required fields:

   | Field | Value |
   |---|---|
   | **GitHub App name** | `TaskScope` (or any name; must be unique on GitHub) |
   | **Homepage URL** | `http://localhost:3000` (or your production URL) |
   | **Setup URL** | `http://localhost:3000/api/auth/github/setup` |
   | **Redirect on update** | Check this box so re-installs (adding/removing repos) also call the Setup URL |
   | **Webhook** | Uncheck **Active** — TaskScope does not use webhooks |

3. Under **Repository permissions**, set:
   - **Metadata**: Read-only (mandatory — GitHub requires it for all Apps)
   - **Pull requests**: Read-only (required for PR ingest)
   - **Contents**: Read-only (optional — needed only if you want to read file contents or commit messages beyond PR data)

4. Under **Where can this GitHub App be installed?**, choose **Any account** unless you want to restrict it to your own org.

5. Click **Create GitHub App**.

---

## Step 2 — Note your App ID and slug

After creation you land on the App's settings page:

- **App ID** — shown near the top (a numeric value like `12345`). Copy it.
- **App slug** — visible in the page URL: `github.com/settings/apps/<slug>`. Copy it.

---

## Step 3 — Generate and download the private key

1. On the App settings page scroll down to **Private keys**.
2. Click **Generate a private key**. A `.pem` file downloads automatically.
3. Move it into the project's `data/` directory:

   ```sh
   mv ~/Downloads/taskscope.*.private-key.pem data/github-app.pem
   ```

   The file stays local — never commit it. It is already in `.gitignore` via the `data/` exclusion.

---

## Step 4 — Set environment variables

Open `.env` (copy from `.env.example` if you haven't already) and set:

```
GITHUB_APP_ID=12345
GITHUB_APP_SLUG=taskscope
GITHUB_APP_PRIVATE_KEY_PATH=data/github-app.pem
```

Restart the Next.js server after editing `.env`.

---

## Step 5 — Install the App on your org / repos

1. Visit `https://github.com/apps/<your-slug>/installations/new`.
2. Select the org or user account.
3. Choose **Only select repositories** and tick the repos TaskScope should access.
4. Click **Install**.

GitHub redirects to `http://localhost:3000/api/auth/github/setup?installation_id=<id>`.
The setup route verifies the installation against the GitHub API, lists the accessible repos, and writes `data/github-app.json`. You are then redirected to `/connect?github=ok`.

---

## Step 6 — Verify

Open `http://localhost:3000/connect`. The GitHub panel should show:

- **Connected** (green dot)
- The org/user account name
- The list of repos the App can access

---

## Security notes

- **No tokens stored on disk.** `data/github-app.json` holds only the installation ID, account name, and repo list. Installation access tokens are minted on demand and held only in memory (cached for up to 55 minutes, refreshed 5 minutes before expiry).
- **The PEM file never leaves the server.** The API endpoints return only the install metadata and a boolean `appConfigured` flag — never the key or any token.
- **Spoofed installation_id values are rejected.** The setup callback immediately verifies the provided ID against the GitHub API using the app JWT before accepting it.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `/connect` shows "App not configured" | `GITHUB_APP_ID` is missing or the PEM file path is wrong |
| Setup callback redirects to `?github=error&reason=pem_not_found` | The PEM file doesn't exist at `GITHUB_APP_PRIVATE_KEY_PATH` |
| Setup callback redirects to `?github=error&reason=installation_not_found` | The installation ID doesn't match this App — wrong App ID in `.env` |
| `getInstallationToken()` returns null in PR ingest | Check that `data/github-app.json` exists and `GITHUB_APP_PRIVATE_KEY_PATH` is readable |
