# HabitGlo — Next Steps Summary

**Last reviewed:** 2026-07-14

## Completed (this session)

- [x] Fix mojibake characters (already done in prior commits)
- [x] Change Tauri window title → "HabitGlo"
- [x] Replace default Vite README with HabitGlo-specific content
- [x] Fix visual mismatch on download + legal pages (font stacks, logo, back link)
- [x] Tighten Tauri security (allowlist + CSP locked down)
- [x] Removed code-signing command (no certificate yet — build completes unsigned)
- [x] Confirm support email — `support@habitglo.com` forwarding via Cloudflare

## Still Remaining

### 1. Align app copy with website positioning

The app still says "Ambient reminders on your screen." in `src/App.tsx` (lines 152 and 187).
The website landing page says "Your goals, scrolling in front of you. All day."

Pick a headline from below (or write your own), then replace both instances in `src/App.tsx`:

**Identity / Transformation**
- "Become the person who never forgets."
- "Your goals, always in sight. Your habits, always in motion."
- "Stop drifting. Start becoming."
- "The version of you that follows through."

**Emotional / Urgency**
- "Never drift. Never forget. Always moving forward."
- "You know what to do. Now you'll actually do it."
- "Your goals, scrolling all day. Your excuses, gone."

**Closest to your original idea**
- "Never forget a thing. Become who you're meant to be."
- "Never lose sight of who you're becoming."
- "Never forget. Always grow."

**Matching the landing page**
- "Your goals, scrolling in front of you. All day." (exact match with website)
- "Your goals, always visible. Your progress, always growing."

Also update the subtitle (lines 154 and 196):
- Current: "Keep your habits and reminders visible—all day, on your screen."

### 2. Gate download page behind payment (optional)

`public/download/windows.html` is open to anyone with the URL.
- If the desktop app requires login + active subscription to function, this is low priority.
- If the app works without login, this needs a backend-gated signed download URL.

### 3. Switch Paddle from sandbox to production

`public/download/config.js` — needs your live Paddle credentials:
- Change `environment: 'sandbox'` → `'production'`
- Swap `test_` client token for `live_` token
- Use production price IDs

### 4. Get a code-signing certificate

Purchase from DigiCert or Sectigo (~$70-200/year), then:
- Set `HABITGLO_CERT_THUMBPRINT` environment variable
- Re-enable `signCommand` in `src-tauri/tauri.conf.json`
- Rebuild to produce a signed MSI

### 5. End-to-end payment testing (do last)

After switching Paddle to production, manually test the full flow:
- Monthly purchase → webhook → Supabase profile update → download → app unlock
- Lifetime purchase → same flow
- Cancellation → billing portal
- Verify billing portal link works from desktop app
