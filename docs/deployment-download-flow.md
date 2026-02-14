# HabitGlo Website Download Flow

This repo now supports a static deployment flow:

1. `landing.html` pricing buttons
2. `/checkout/monthly.html` or `/checkout/lifetime.html`
3. `/download/windows.html`
4. installer URL or release page

## 1) Configure checkout and download URLs

Edit `public/download/config.js` before each deployment.

Required fields:

- `checkout.monthlyUrl`
- `checkout.lifetimeUrl`
- `download.windows.directUrl` (preferred)

Optional but recommended:

- `download.windows.version`
- `download.windows.fileName`
- `download.windows.sha256`
- `download.windows.releasePageUrl`

## 2) Payment provider setup

Set your payment provider links in:

- `checkout.monthlyUrl`
- `checkout.lifetimeUrl`

Then set payment success URLs to:

- Monthly success URL: `/download/windows.html?plan=monthly`
- Lifetime success URL: `/download/windows.html?plan=lifetime`

Set cancel URL to:

- `/landing.html#pricing`

## 3) Release process

For every desktop release:

1. Build and sign installer (`.exe` or `.msi`).
2. Upload installer to GitHub Releases or your object storage.
3. Copy the installer URL to `download.windows.directUrl`.
4. Update `download.windows.version`, `fileName`, and `sha256`.
5. Deploy website.

## 4) Important limitation (static-only flow)

This is a static website flow. It does not verify payment on the download page.

If you need strict paid-only download access:

1. Add a backend endpoint.
2. Verify checkout session or webhook event server-side.
3. Return a short-lived signed download URL.

