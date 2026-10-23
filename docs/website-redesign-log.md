# Website redesign log — "After hours"

Branch: `website/redesign` · Worked overnight, autonomously, following `docs/website-redesign-brief.md`.

## What changed

| Page | File | Summary |
| --- | --- | --- |
| Landing | `landing.html` | Full rewrite. Tailwind CDN removed; shared `public/site.css`. Canvas LED hero sign, code-built demo film, problem diptych, 3 steps, who-it's-for with testimonials, pricing, FAQ + macOS waitlist, finale, footer. |
| Pricing | `public/pricing.html` | Same two plans, prices, ticks and CTA URLs (`source=website_pricing`), plus "How buying works" aside and a small LED. |
| Purchase | `public/purchase.html` | Split layout: headline + buying steps (step 1 lit) + LED on the left, sign-in card on the right. Supabase script byte-identical. |
| Checkout | `public/checkout/monthly.html`, `lifetime.html` | Same split layout, step 2 lit. Paddle script byte-identical. |
| Download | `public/download/windows.html` | Split layout; config-reader script byte-identical. |
| Legal | `public/legal/privacy.html`, `terms.html`, `refund.html` | Policy text moved over verbatim (script-checked), serif headings, sticky legal side nav. |

New files: `public/site.css`, `public/js/led.js`, `public/js/film.js`, `public/js/site.js`, `public/media/*` (3 generated illustrations + poster + `led-h.svg`), `docs/screenshots/*`.

Not touched: `src/`, `src-tauri/`, `public/download/config.js`, `vercel.json`, `vite.config.ts`, `package.json`.

## Design decisions

- **Palette**: warm near-black `#0d0b09`, warm off-white `#f2ebdd`. Amber `#FFB000` is the only accent; red and green appear only where something is lit (LED messages, status dots, the done/current step markers).
- **Type**: Instrument Serif for display with one italic word per headline; Inter for body; Caveat only for the small handwritten margin notes (editorial reference). The pixel face exists only inside the LED canvas (5×7 bitmap font drawn per-LED).
- **LED sign (hero)**: canvas renderer, one font pixel = one LED. Scrolls by whole columns like real hardware, phosphor decay on turn-off, per-LED brightness variance, unlit grid pre-rendered, additive bloom. Pauses off-screen/hidden tab; DPR capped at 2. Reduced motion → static "flip" pages. Pause button with `aria-pressed`.
- **Demo film**: deterministic 30 s timeline rendered from code (no video file): desktop at 9:12 AM, cursor opens HabitGlo from the taskbar, types "Follow up with leads today", Enter, strip docks to the top and windows resize, then a time-lapse to evening while the strip cycles real LED messages. 5 chapter buttons with progress, play/pause, captions, autoplay only when ≥35% visible and never under reduced motion. Narrow screens get a camera zoom so the action stays legible; during docking the camera is anchored to the top edge so the strip is always in frame.
- **Mobile order**: on <980 px the hero shows headline → sign → copy/CTAs (the product is visible without scrolling). On purchase/checkout/download, <940 px shows headline → card → steps.
- **Copy**: hero headline/sub, 9 LED messages, 3 testimonials with highlights, use-case list, pricing ticks, FAQ (incl. macOS) and waitlist are verbatim. Small UI labels were added ("How buying works", "In the box", chapter captions); the purchase/checkout headlines reuse existing lines ("You're one decision away from better days.", "Low-risk reset, cancel anytime", "One decision, no recurring decision fatigue"). No new claims or numbers.
- **Removed invented content**: an early "TAKE A BREAK" LED message was replaced by the brief's "SIT UP STRAIGHT".

## Integrations preserved and how they were verified

- **Paddle checkout** (`/checkout/*.html`): inline scripts compared programmatically against git HEAD before rewrite — identical. All IDs kept (`session-banner`, `session-email-text`, `session-signout`, `checkout-link`, `upgrade-link`, `status`, `purchase-link`). In the browser on localhost:
  - no `uid` → "Checkout Unavailable" + "Sign in first to link purchase to your account." ✔
  - valid UUID `uid` + email → session banner shows the email, "Ready to checkout." ✔
  - clicking Continue → Paddle sandbox overlay opened in Test Mode with email prefilled, `checkout.loaded` event received ✔ (`docs/screenshots/checkout-monthly-paddle-sandbox.png`)
- **Supabase auth** (`/purchase.html`): module script identical to HEAD; all IDs kept. Loaded with `?plan=monthly` → script ran and set "Sign in to continue to monthly plan checkout"; card revealed. ✔
- **Download config** (`/download/windows.html`): script identical; page populated version 0.1.0, file name, Windows 10+, SHA-256 from `config.js`, `?plan=lifetime` greeting shown. ✔
- **macOS waitlist** (landing): original module script kept verbatim (jsDelivr `supabase-js@2`, table `macos_waitlist`), IDs `macos-waitlist-form`, `macos-waitlist-email`, `macos-waitlist-success`, `macos-waitlist-error` kept; `.hidden` utility provided by `site.css`. Verified in the production build output. **Not submitted** (would write a real row).
- **Routes**: `/pricing`, `/terms`, `/privacy`, `/refund` loaded through the dev-server rewrites; `vercel.json` unchanged.
- **Pricing facts**: $4/month and $29 one-time, CTA URLs and `source` params unchanged.

## Build

- `npm run build` **fails on this machine for reasons outside the website**: `tsc` cannot find `papaparse` (`src/components/BulkImport.tsx`) and Vite cannot resolve `@fontsource/dm-mono` (`src/fonts.ts`). The worktree's `node_modules` is a junction to the main repo, whose working copy has uncommitted `package.json` changes that removed these packages. This branch's `package.json` still lists them. I did not install anything, to avoid changing the main checkout.
- Instead I ran a **website-only production build** (same Vite, root and `public/`, `landing.html` as the only input, temp config outside the repo): ✔ built in <1 s, landing 29.5 kB (7.7 kB gzip) + 1.9 kB JS chunk; all `/public` pages copied as-is.

## Review process

Browser review at 375 px and 1440 px (plus 768 px and overflow checks at 768/1024/1280/1920) with at least two iterations per page. Fixes made during review include: hero sign moved above the fold on mobile, film camera keeping the docked strip in frame on mobile, film chapter progress bars showing stale values (cache-key bug), finale text touching the edge on mobile, pricing empty column at 1440, a margin-note arrow pointing at nothing, spec list overflowing at 768, odd gaps in the proof row.

Tooling note: the in-editor browser pane is small (~850×580), so desktop captures were taken with device emulation at a reduced device-scale-factor; they look softer than the real page.

## Screenshots (`docs/screenshots/`)

- Landing 1440: `v1-1440-hero.jpg`, `landing-1440-hero.jpg`, `v1-1440-film.jpg`, `v1-1440-film-dock.jpg`, `v1-1440-problem.jpg`, `v1-1440-problem2.jpg`, `v1-1440-how.jpg`, `v1-1440-who.jpg`, `landing-1440-pricing.jpg`, `v1-1440-faq.jpg`, `v1-1440-finale.jpg`
- Landing 768: `landing-768-hero.jpg`
- Landing 375: `landing-375-hero.jpg`, `landing-375-film-type.jpg`, `landing-375-film-dock.jpg`, `landing-375-problem-2.jpg`, `landing-375-who.jpg`, `landing-375-pricing.jpg`, `landing-375-finale.jpg`
- Inner pages 1440: `pricing-1440.jpg`, `purchase-1440.jpg`, `checkout-monthly-1440.jpg`, `checkout-monthly-paddle-sandbox.png`, `download-1440.jpg`, `legal-refund-1440.jpg`

(`v1-*` files are from the first review pass, before some of the fixes above.)

## Adding a real demo recording

Drop a screen recording at `public/media/demo.mp4` (optionally replace `public/media/demo-poster.jpg`). The film section probes for it with a HEAD request and shows a "Watch the real recording" button automatically; no code change needed.

## Owner checklist

1. **Paddle sandbox price**: the monthly sandbox overlay showed **$5.00 due today** (HabitGloTest, $4.55/month + VAT for South Korea) while the site advertises **$4/month**. Check the price/tax-inclusive settings of the sandbox and live price IDs in Paddle.
2. Complete one sandbox checkout end to end (card 4242…) and confirm the webhook + redirect to `/download/windows.html?plan=…`.
3. Submit the macOS waitlist form once on the preview deploy and confirm the row in `macos_waitlist` (and the duplicate-email message).
4. Sign in / sign up / magic link on `/purchase.html?plan=monthly` against the real Supabase project.
5. Run Lighthouse on the Vercel preview (I could not run Lighthouse here). Expect strong scores: no framework on the landing page, ~54 kB CSS, ~38 kB JS, images ≤ 53 kB and lazy-loaded, fonts with `display=swap`.
6. Restore the main repo's `node_modules` (or commit/revert its `package.json` change) so `npm run build` passes again; it's unrelated to the website.
7. Optionally record a real `demo.mp4`.
