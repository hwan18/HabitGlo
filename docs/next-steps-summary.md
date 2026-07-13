# HabitGlo — Next Steps Summary

**Last reviewed:** 2026-07-13

Based on `docs/launch-readiness-checklist.txt`, here's the prioritized action plan:

## Launch Blockers (must fix before going live)

1. **Switch Paddle from sandbox to production**
   - `public/download/config.js` — change `environment: 'sandbox'` → `'production'`, swap `test_` token for `live_` token, use production price IDs

2. **End-to-end payment testing**
   - Test: monthly purchase, lifetime purchase, Paddle webhook delivery, Supabase profile update, desktop app unlock, cancellation, billing portal

3. **Gate download page behind payment**
   - `public/download/windows.html` — currently anyone with the URL can download; needs backend-gated signed download URL

4. **Fix visual mismatch on public pages**
   - Align with HabitGlo design system: `public/pricing.html`, `public/checkout/monthly.html`, `public/checkout/lifetime.html`, `public/download/windows.html`, `public/legal/terms.html`, `public/legal/privacy.html`, `public/legal/refund.html`

5. **Fix broken encoded characters (mojibake)**
   - Clean up `â€"`, `Â·`, etc. in: `src/App.tsx`, `public/pricing.html`, `public/checkout/monthly.html`, `public/checkout/lifetime.html`

## Should Fix Before Public Launch

1. **Align app copy with website positioning** — app says "Ambient reminders" but website says "goals scrolling all day"
2. **Change Tauri window title** — `src-tauri/tauri.conf.json`: "HabitGlo Vault" → "HabitGlo"
3. **Verify Windows installer signing** — MSI should show trusted publisher
4. **Tighten Tauri security** — review `allowlist.all: true` and CSP in `src-tauri/tauri.conf.json`
5. **Confirm support email** — `support@habitglo.com` must be live and monitored
6. **Replace default Vite README** — `README.md` still has template content

## Nice-to-Have Polish

- Shared visual system across all public pages
- Launch QA checklist in repo
- Screenshots / demo video in landing/download flow
- Analytics / error reporting for checkout & app startup
- Update version from `0.1.0` for first public release
