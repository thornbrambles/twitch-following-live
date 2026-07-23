# Twitch Following Live

A small static site that lets you log in with Twitch and see which of the
channels you follow are currently live.

Because this is hosted on GitHub Pages there's no backend — login uses
Twitch's [Implicit Grant Flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#implicit-grant-flow),
which returns an access token directly to the browser. The token only ever
lives in `sessionStorage` in your browser and is never sent anywhere except
Twitch's own API.

## 1. Register a Twitch application

1. Go to the [Twitch Developer Console](https://dev.twitch.tv/console/apps) and click **Register Your Application**.
2. Name it anything you like.
3. Set **OAuth Redirect URLs** to the exact URL the app will be served from:
   - Local dev: `http://localhost:5173/`
   - GitHub Pages: `https://<your-username>.github.io/twitch-following-live/`

   You can add both — Twitch allows multiple redirect URLs on one app.
4. Set **Category** to something like "Application Integration".
5. Save, then copy the generated **Client ID** (you do not need the client secret — this app never uses it).

## 2. Configure the Client ID

You can provide the Client ID in either of two ways:

- **At runtime**: just open the app — if no Client ID is configured yet, it'll
  show a form to paste one in. It's saved to `localStorage` in your browser.
- **At build time**: copy `.env.example` to `.env` and set `VITE_TWITCH_CLIENT_ID`.
  This is what the GitHub Actions deploy workflow uses (see below).

The Client ID is not a secret — it's meant to be public in client-side apps —
so either approach is fine.

## 3. Run locally

```bash
npm install
npm run dev
```

Open the printed `localhost` URL and make sure it matches a redirect URL you
registered with Twitch in step 1.

## 4. Deploy to GitHub Pages

1. Push this repo to GitHub.
2. In the repo's **Settings → Pages**, set **Source** to "GitHub Actions".
3. In **Settings → Secrets and variables → Actions → Variables**, add a
   repository variable named `TWITCH_CLIENT_ID` with your Client ID.
4. Push to `main` (or run the "Deploy to GitHub Pages" workflow manually) —
   `.github/workflows/deploy.yml` builds the site and publishes it to Pages.
5. Make sure the Pages URL GitHub gives you exactly matches a redirect URL
   registered on your Twitch application.

## How it works

- **Login**: redirects to Twitch's OAuth authorize endpoint with
  `response_type=token` and scope `user:read:follows`. Twitch redirects back
  with the access token in the URL fragment, which is parsed client-side and
  never sent to a server.
- **Followed channels**: `GET /helix/channels/followed` (paginated).
- **Live status**: `GET /helix/streams`, batched in groups of up to 100
  broadcaster IDs, to find which followed channels are currently live.

Access tokens from the implicit flow don't refresh — when yours expires
you'll just be prompted to log in again.
