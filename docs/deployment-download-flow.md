# HabitGlo Website Download Flow

This repo now supports a static deployment flow:

1. `landing.html` pricing buttons
2. `/checkout/monthly.html` or `/checkout/lifetime.html`
3. `/download/windows.html`
4. installer URL or release page

## 1) Configure checkout and download values

Edit `public/download/config.js` before each deployment.

Required fields:

- `paddle.environment` (`sandbox` or `production`)
- `paddle.clientToken`
- `paddle.prices.monthly`
- `paddle.prices.lifetime`
- `download.windows.directUrl` (preferred)

Optional but recommended:

- `download.windows.version`
- `download.windows.fileName`
- `download.windows.sha256`
- `download.windows.releasePageUrl`

## 2) Paddle setup

Set your Paddle values in:

- `paddle.environment`
- `paddle.clientToken`
- `paddle.prices.monthly`
- `paddle.prices.lifetime`

The checkout pages open Paddle directly:

- `/checkout/monthly.html`
- `/checkout/lifetime.html`

Required query params for account-linked checkout:

- `uid` (or `user_id` / `supabase_user_id`): Supabase user UUID
- `email`: recommended, prefill checkout email
- `source`: stored as checkout source metadata

Example:

- `/checkout/monthly.html?uid=<SUPABASE-USER-UUID>&email=user@example.com&source=app`

If `uid` is missing or invalid, checkout is blocked on static pages.

## 3) Release process

For every desktop release:

1. Build and sign installer (`.exe` or `.msi`).
2. Upload installer to GitHub Releases or your object storage.
3. Copy the installer URL to `download.windows.directUrl`.
4. Update `download.windows.version`, `fileName`, and `sha256`.
5. Deploy website.

### Windows code-signing (required to avoid "Unknown publisher")

This repo is wired to sign Windows bundles through Tauri:

- Config: `src-tauri/tauri.conf.json` -> `tauri.bundle.windows.signCommand`
- Script: `src-tauri/scripts/sign-windows.ps1`

Set these environment variables on the Windows build machine before `npm run tauri:build`:

- `HABITGLO_CERT_THUMBPRINT` (required): SHA1 thumbprint of installed code-signing cert.
- `HABITGLO_TIMESTAMP_URL` (optional): default `http://timestamp.digicert.com`.
- `HABITGLO_SIGN_APP_NAME` (optional): default `HabitGlo`.
- `HABITGLO_TIMESTAMP_RFC3161` (optional): default `true`.
- `HABITGLO_SIGNTOOL_PATH` (optional): full path to `signtool.exe` if not on PATH.

PowerShell example:

```powershell
$env:HABITGLO_CERT_THUMBPRINT = "YOUR_CERT_SHA1_THUMBPRINT"
$env:HABITGLO_TIMESTAMP_URL = "http://timestamp.digicert.com"
npm run tauri:build
```

Verify installer signature after build:

```powershell
Get-AuthenticodeSignature .\src-tauri\target\release\bundle\msi\HabitGlo_0.1.0_x64_en-US.msi | Format-List
```

Note: SmartScreen reputation can still take time on new certs (especially OV certs). EV certs usually establish trust faster.

## 4) Important limitation (static-only flow)

This is a static website flow. It does not verify payment on the download page.
Account mapping for checkout relies on URL metadata (`uid`) provided by an authenticated flow.

If you need strict paid-only download access:

1. Add a backend endpoint.
2. Verify checkout session or webhook event server-side.
3. Return a short-lived signed download URL.
