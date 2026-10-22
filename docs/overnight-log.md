# Overnight log: simplify/core-v1

## Morning checklist (owner)

1. `git switch simplify/core-v1`, then `npm install`, then `npm run tauri:dev`.
2. Fresh first launch: clear local storage (in the HabitGlo window right-click > Inspect > Application > Local Storage > Clear, then restart), or use a new Windows user. Confirm the 5 starter reminders and the LED strip docked at the top.
3. Turn Wi-Fi off, relaunch, add a reminder, and confirm the LED strip shows it.
4. Watch the CPU of the HabitGlo / WebView2 processes in Task Manager for a minute while it scrolls (expect low single-digit %), then press Pause (expect about 0).
5. Right-click the tray icon: Open HabitGlo, Show/Hide LED (the label should flip), Quit (the reserved space at the top should go away).
6. Settings (gear): Fast + Bottom should move the strip to the bottom immediately; Color presets should change the strip colours.

Runbook: `docs/overnight-simplify-runbook.md`.

## Slice 0: baseline

Gate on the untouched branch (commit `ccb57c8`):

| Check | Result |
| --- | --- |
| `npm run build` | pass (warning: one chunk > 500 kB) |
| `npm run lint` | pass |
| `cargo check` (src-tauri) | pass |
| `npm test` | n/a (no test runner yet) |

Baseline `dist/` size: **17,712,188 bytes (66 files)**.
Most of it is `public/` assets copied as-is (icons ~12 MB, `fonts/fusion-pixel.ttf` 3.5 MB, `fonts/galmuri9.woff2` 0.4 MB) which are shared with the website and are not touched here.

Largest JS chunks:

| Chunk | Bytes |
| --- | --- |
| `overlaySync-*.js` (shared vendor: react, supabase, posthog, framer-motion, dnd-kit) | 841,969 |
| `main-*.js` | 114,347 |
| `window-*.js` | 12,047 |
| `overlay-*.js` | 2,316 |

Shipped:
- Vitest 3 + jsdom, `npm test` script (`vitest run`), `vitest.config.ts`, `src/test/setup.ts` (mocks PostHog, clears localStorage between tests), one smoke test.

Decisions:
- Vitest 3.2 (supports the project's Vite 5). Tests live next to the code as `*.test.ts` under `src/`.
- PostHog is mocked globally in tests because `src/lib/posthog.ts` throws in dev mode without keys.

## Slice 1: first launch just works, offline

Gate: build pass, lint pass, test pass (6 tests), cargo check pass.

Shipped:
- `src/lib/starterReminders.ts`: on the very first launch (no `habitglo-store`, no legacy `habitglo_local_habits`, no `habitglo-starter-seeded-v1` flag) the main window seeds the 5 starter reminders. The flag is set on every first check, so existing users and users who later delete everything are never re-seeded.
- New Rust commands `dock_overlay(edge, reserve)` and `set_overlay_visible(visible)` in `src-tauri/src/commands.rs`. The strip is moved to the primary monitor, stretched to full width, and docked top/bottom; with reserve on it registers a Windows AppBar so maximized windows stop above/below it.
- The overlay window docks itself and then shows on every launch (`src/overlay/main.tsx`). New default settings: `position: 'top'`, `reserveSpace: true`.
- Hiding the strip (button, Alt+F4 on the strip) releases the reserved band; showing re-reserves it. Tray "Quit" releases the AppBar before exiting (Tauri's `app.exit` skips exit events, so this is done explicitly).
- All windows get a `habitglo:overlay-visibility` event so the Show/Hide button stays correct.
- Removed the Google Fonts `@import`; removed `fonts.googleapis.com` / `fonts.gstatic.com` from the CSP. UI text falls back to the system sans-serif until slice 4 sets the single theme font.
- Main window: 560 x 720, centered, min 420 x 520.

Decisions:
- The overlay window no longer writes to `habitglo-store` (read-only persist storage) and no longer calls `hydrate()` on startup. Before, the overlay could overwrite the main window's saved list with a stale copy (and on first launch it could create the store key before the main window seeded).
- Added `wss://*.supabase.co` to the CSP `connect-src`. Supabase Realtime uses websockets and was silently blocked before.
- Existing users keep their saved `reserveSpace` value; only new installs default to reserved space on.
- The strip always spans the full width of the primary monitor (no more 1600 px centered strip).

Owner must test by hand:
- Fresh launch: strip appears at the top of the primary monitor, maximized windows stop below it.
- Hide LED: the reserved band disappears; Show LED: it comes back.
- Tray > Quit: no empty band is left at the top of the screen.

## Slice 2: local-first data with background sync

Gate: build pass, lint pass, test pass (30 tests), cargo check pass.

Shipped:
- The persisted store list (`habitglo-store`) is now the single local source of truth. Add / edit text / toggle / color / reorder / delete / clear update the UI and localStorage synchronously; nothing awaits the network.
- `src/lib/syncQueue.ts`: pending changes per user in `habitglo-sync-queue-v1`, one op per reminder (latest wins). Deleting a reminder that never reached the server removes it from the queue entirely. Flush sends all upserts in one request and all deletes in one request.
- `src/lib/db.ts` is now remote-only helpers (`fetchRemoteHabits`, `remoteHabitsApi`, `hasLiveSessionFor`); the old local-storage branch and settings sync are gone.
- Store `syncNow({ pull })`: flush first, then fetch and lay still-pending changes on top (no flicker, no lost edits). Triggered on sign-in/startup, on the `online` event, 400 ms after each change, on Realtime changes, and on token refresh. Offline / failed syncs stay queued silently; no popups.
- Persist version 3 migration: existing saved reminders are kept (owner marked `legacy`); signed-out users of older versions get their list back from the old `habitglo_local_habits` key.
- Tests: queue unit tests and store tests against an in-memory fake server (offline add then online flush, delete of an unsynced item, reorder offline, server-as-truth, flush-before-fetch, no-session, long and non-Latin text), plus migration tests.

Decisions:
- Flush is skipped unless Supabase has a live session for that user. Without a session, row-level security silently ignores deletes and rejects inserts, which would otherwise look like permanent errors and drop the change.
- Server errors with a Postgres/PostgREST error code (bad data, permission denied) drop only that one row with a console warning; network and connection errors keep everything queued.
- Sync loop is capped at 5 rounds per run and retries late requests after 2 s, so a bouncing change can never spin.
- First sign-in on a device with an empty account uploads the reminders made while signed out (e.g. the starter reminders). If the account already has reminders, the account wins.
- Signing out clears the reminders from the screen (privacy on shared PCs); that account's unsynced changes stay queued and are pushed next time it signs in. Another account's list is never shown while a different user's list loads.
- Settings (speed, colors, position) are now per-device and no longer synced to `profiles.settings`. The column is left untouched.
- `markDone` (streak logging) is local + queued too; it no longer inserts into `habit_logs` (leaderboards are removed in slice 5).

Owner must test by hand:
- Signed in: add a reminder, then check it appears on a second device / in Supabase within a second or two.
- Turn Wi-Fi off, add/delete/reorder, turn Wi-Fi on: changes reach Supabase without any error message.

## Slice 3: offline license with 14-day grace

Gate: build pass, lint pass, test pass (43 tests), cargo check pass.

Shipped:
- `src/lib/entitlement.ts`: caches `{ userId, email, status, checkedAt }` in `habitglo-entitlement-v1` after every successful online check (paid or not), and the pure access rule `evaluateAccess`.
- Access rule: paid (`active` / `trialing` / `lifetime`) confirmed online, or a cached paid status for the same user checked within 14 days while the online check cannot complete. Otherwise one screen: "Connect to the internet to verify your HabitGlo subscription" + Retry, plus the sign-in panel when there is no cached user.
- `checkSubscriptionOnline` returns "unknown" (never "free") when offline, without a live session, or on a server error. Before, any error read as `free` and locked paying users out.
- Startup: if the stored Supabase session cannot be refreshed because of the network, the app opens as the cached user (`offlineSession`). When the connection returns, supabase-js refreshes the session and the app re-checks and syncs automatically.
- `src/App.tsx` uses `useAccess()` + `AccessGate` instead of `requiresAuth` / `requiresSubscription`. `VITE_BILLING_GATE` behaviour is unchanged (dev: only gated if `true`; release: gated unless `false`).
- Tests: the 5 required cases (online paid, online unpaid, offline within 14 days, offline after 14 days, never signed in) plus instant-open-while-checking, bad caches, and store-level offline starts (expired token + no network) including adding a reminder offline and signing out offline.

Decisions:
- With a fresh paid cache the app opens instantly and verifies in the background (no "Checking subscription" wait on every start). If the server then says unpaid, it switches to the subscribe screen.
- A cache dated more than 1 day in the future is ignored (stops winding the clock back to extend the grace).
- `INITIAL_SESSION` auth events are ignored: offline, supabase-js reports it as "no session" while still keeping the session, which used to sign people out.
- Sign out now uses `scope: 'local'` (this PC only, not all devices). If the server can't be reached, the local session is removed anyway. Any real sign-out also clears the offline grace cache.
- When the billing gate is off (dev builds), the desktop app no longer forces sign-in; the account is optional. Before, desktop always required sign-in when Supabase was configured.
- The grace clock is re-evaluated every minute while the app is open.

Owner must test by hand:
- Signed in + paid: Wi-Fi off, quit from tray, relaunch: the app opens straight to the reminders.
- Wi-Fi off with no account on a fresh Windows user: the connect screen with Retry and the sign-in form.

## Slice 4: one simple screen

Gate: build pass, lint pass, test pass (57 tests), cargo check pass.

Shipped (`src/App.tsx` is now about 70 lines):
- From top to bottom: the live LED preview with a big Start/Pause button and Show/Hide LED; the "Add a reminder" input (Enter adds); then the list with a drag handle, on/off switch and delete. Empty state: "Add something you want to see all day."
- Gear icon opens the Settings popup (native `<dialog>`: Escape and backdrop click close it, focus stays inside). It has Speed (Slow / Medium / Fast = 30 / 55 / 90 px/s), Position (Top / Bottom) + "Keep windows from covering it", Color (Classic LED, Neon, Calm blue, Mono white) and Account.
- One built-in dark theme: system font (Segoe UI), amber accent, high-contrast text. The `!important` colour overrides and per-theme CSS variables are gone from `src/index.css`.
- Settings model: `overlay.speed` is now a preset and `overlay.color` was added. Persist version 4 maps the old speed slider to the nearest preset (old speed was slider value / 2 px/s) and the old palette to the nearest of the 4 colour presets. Corrupt saved values fall back to defaults.
- Browser `/app` uses the same screen. Show/Hide LED, Position and "Keep windows from covering it" are disabled there, with a short note.
- Removed in this slice because the new screen replaces them: `SettingsPanel`, `HabitForm`, `HabitList`.
- Tests: `src/App.test.tsx` (Testing Library) covers the empty state; add with Enter; blank input ignored; Korean/Japanese/Chinese text; 400 pasted characters capped at 220; toggle; delete; inline edit with Enter and Escape; Start/Pause; and settings for speed, colour and the disabled desktop controls. `src/lib/ledSettings.test.ts` covers the mappings. The migration test covers v3 → v4 and corrupt values.

Decisions:
- Colours now cycle by position in the strip (neighbours always differ), not per reminder. The old per-reminder colour button is gone. The `color` / `colorIndex` database columns are left untouched.
- Clicking a reminder's text edits it in place: Enter saves, Escape cancels, and an empty edit keeps the old text.
- Delete is immediate (no confirm, no undo) to keep the screen simple.
- Enter is handled in the input itself, ignoring Enter while an IME is composing (Korean/Japanese/Chinese), so half-typed syllables are never added.
- Account in the browser preview says "Sign in from the HabitGlo desktop app" (the browser never had sign-in before either).
- Unpaid accounts see Subscribe (monthly checkout), See plans (website, includes lifetime) and Refresh status. Recurring plans see Manage billing; lifetime sees no billing button.
- The overlay strip shows "Add a reminder in HabitGlo" when nothing is active. The preview shows "Your reminders will scroll here."
- Dev dependencies added: `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event` (tests only, not shipped).

Owner must test by hand:
- Drag a reminder by its handle; also Tab to the handle, press Space, use the arrow keys, then Space to drop.
- Type Korean with the Windows IME and press Enter once: the full word is added once.

## Slice 5: delete what is no longer used

Gate: build pass, lint pass, test pass (58 tests), cargo check pass.

Removed:
- Components: `Leaderboard`, `HabitPacks`, `BulkImport`, `CompletedToday`, `OnboardingTour` (the Tips panel went with the old `App.tsx` in slice 4). Data: `src/data/habitPacks.ts`. Store: `useLeaderboardStore`. Theme system: `src/lib/uiThemes.ts`. Also the unused `src/assets/react.svg`.
- Store: the theme object (UI themes, 10 palettes, glow, opacity, LED shape, LED font, separator toggle), the completed-today list, `markDone` streak logging, `setHabitColor`, `clearAllHabits`, `toggleLeaderboardSharing`, `hydrate`, and the overlay fields `gap`, `spacing`, `clickThrough`, `alwaysOnTop`, `monitorIndex`.
- `src/lib/db.ts`: `computeStreak` and the three leaderboard RPC helpers (the database functions themselves are untouched).
- LED fonts: Silkscreen, Press Start 2P, VT323, DM Mono, and the Galmuri9 (Korean) and Fusion Pixel (Chinese) pixel fonts in `public/fonts` (3.9 MB). Kept: DotGothic16 (Latin + Japanese) and Noto Sans (Cyrillic/Greek fallback). Korean now uses Malgun Gothic and Chinese uses Microsoft YaHei, both always present on Windows.
- npm packages: `papaparse`, `@types/papaparse`, `tailwind-merge`, `@fontsource/dm-mono`, `@fontsource/press-start-2p`, `@fontsource/silkscreen`, `@fontsource/vt323`, `galmuri`, `@fontpkg/fusion-pixel`. `framer-motion` is still used by the marquee and goes in slice 6.
- Rust: the commands `set_click_through`, `set_always_on_top`, `snap_to_top`, `snap_to_bottom`, `set_reserve_space`, `set_overlay_size` and the helper `infer_snap_edge_for_window`. Ctrl/Alt-drag of the strip is gone; it is always docked.
- Tailwind: the `glow-*` colours, glow shadow, burn background and `fatdot` font.

Migration (persist version 5):
- Saved state now holds only `habits`, `habitsOwner` and `overlay` (speed, color, position, reserveSpace, paused). Old keys are dropped on load: `theme`, `completedToday` and the old overlay fields.
- Every saved reminder with an id and text is kept. Missing `is_active` means on, a missing priority keeps list order, and a missing `colorIndex` becomes 0. Server-side fields (`streak_*`, `show_on_leaderboard`, `color`) are carried through untouched so syncing never resets them.
- Test: a full v4 state with every removed field present loads with the 3 valid reminders intact and only the 5 overlay settings left.

Grep check: no references remain to the removed components, stores, functions, fonts, Tauri commands or theme fields (only the `show_on_leaderboard` database column, kept on purpose).

Size: dist 17,712,188 → 13,597,327 bytes (66 → 52 files). The main-window script went from 114 KB to 78 KB.

Decisions:
- The strip is never click-through. With "Keep windows from covering it" on (the default), nothing sits under it anyway.
- The `shadcn` dev dependency stays (owner tooling for the shadcn MCP server).

Note: commit `2ec25de` only contains the file deletions (a bad `git add` path stopped the rest from being staged). `12f127e` completes slice 5 and passed the gate. Do not check out `2ec25de` on its own.

## Slice 6: smooth overlay

Gate: build pass, lint pass, test pass (62 tests), cargo check pass.

Before:
- Marquee: framer-motion `useAnimationFrame` ran a JavaScript callback on every display frame, forever. When paused it still woke up every frame and returned early, and it kept running while the strip or the main window was hidden.
- Each frame wrote a motion value, a `drop-shadow` filter was on the whole moving row, and a `mix-blend-mode: screen` layer sat on top. Both force extra compositing work every frame.
- Sync: the overlay polled localStorage every 200 ms (JSON parse of the whole store plus two JSON stringify compares, 5 times a second, even when hidden). The main window also sent the full state on every store change with no debounce.

After:
- `src/overlay/Marquee.tsx`: one Web Animations API animation (`translate3d(0) → translate3d(-copyWidth)`, linear, infinite) on a `will-change: transform` row. It runs on the compositor, with no JavaScript and no React state per frame.
- The animation is rebuilt only when the measured copy width (text, font size, fonts loaded) or the speed changes, and it keeps the current scroll position. Window resizes only change how many copies are rendered.
- Adding, editing or reordering reminders keeps the same DOM row: no flicker, no remount, no jump.
- Pause: `useLedRunning` pauses the animation when it is paused, when the page is hidden or minimized (`visibilitychange`), when the strip is hidden (`habitglo:overlay-visibility`), or when the main window is hidden to the tray (new Rust event `habitglo:main-visibility`). A paused Web Animation does no work.
- LED look: the glow is now a per-reminder `text-shadow` (rasterised once). The dot grid is a static overlay without blend modes, and the separator is a neutral dim dot that suits all 4 colour presets.
- Sync (`src/lib/overlaySync.ts`): the main window sends only what the strip draws (overlay settings + id/text/on/order per reminder + user id), debounced to 80 ms, and skips sends when nothing visible changed. The overlay announces `habitglo:overlay-ready` when it starts listening and gets the current state back. The 200 ms poll is gone; a `storage` event (no polling) rehydrates as a fallback.
- `framer-motion` uninstalled. The shared vendor chunk went from 816 KB to 706 KB, and dist from 13,597,327 to 13,486,518 bytes.

Verified in a real browser (Chromium, `/app`):
- `document.getAnimations()` shows exactly 1 animation, advancing at the preset speed (90 px/s measured on Fast).
- Pause: `playState` is "paused", `currentTime` stays frozen, and 0 `requestAnimationFrame` calls happen in 1 second.
- Adding a reminder while scrolling: same row element, position continues from −1106 px to −1132 px (no reset), still 1 animation.

Tests: `src/lib/overlaySync.test.ts`: a burst of changes gives 1 message, changes the strip does not show give none, and a starting overlay always gets the state.

Decisions:
- The strip starts at the left edge (the old 32 px inner padding is gone, so the loop maths stays exact).
- CPU numbers on the real desktop app are measured in slice 9 (`scripts/perf-desktop.ps1`).

## Slice 7: tray

Gate: build pass, lint pass, test pass (62 tests), cargo check pass.

- Tray menu is now **Open HabitGlo**, **Show LED / Hide LED**, separator, **Quit**. Left-click and double-click open the window.
- The LED item's label follows the real strip state. `set_overlay_visibility` (the single path for the window button, the tray item and Alt+F4 on the strip) updates the tray title and emits `habitglo:overlay-visibility`, so the in-app button and the tray never disagree.
- Closing the main window hides it to the tray (slice 6 already emits `habitglo:main-visibility`, so the preview stops animating). Quit releases the reserved screen space before exiting.
- `docs/instruction-manual.md` rewritten to under one page for the new single screen (it described packs, streaks, leaderboards, themes, fonts, click-through and Ctrl/Alt drag, which are all gone).

Decision: the tray item starts as "Show LED" because the strip window is created hidden. The overlay page shows itself about a second after launch, and the label then switches to "Hide LED".

## Slice 8: finish

Gate on `574c01a` + this log: build pass, lint pass, test pass (10 files, 62 tests), cargo check pass (no warnings).

| `dist/` | Baseline (slice 0) | Now |
| --- | --- | --- |
| Total | 17,712,188 bytes (66 files) | 13,997,506 bytes (58 files), -21% (corrected in slice 9) |
| Shared vendor chunk `overlaySync-*.js` | 841,969 | 705,840 |
| `main-*.js` | 114,347 | 77,600 |

What is left is mostly `public/` artwork shared with the website: five `habitglo-*icon*` PNGs (about 9.4 MB) that the desktop app never loads. I did not remove them because the website worktree owns `public/`. Recommendation: move website-only images out of the app's `public/` (or exclude them from the Tauri bundle) in a coordinated change, which would bring `dist/` to about 4 MB.
## Slice 9: automated testing of the real desktop app

Gate on the final commit: build pass, lint pass (now also lints `e2e/*.mjs`), test pass (13 files, 67 tests), cargo check pass (no warnings).

Correction: the `dist/` size I logged in slices 6 and 8 (13,486,518 bytes, 52 files) does not reproduce. Rebuilding commit `c69a5b7` gives 13,997,506 bytes (58 files), and `public/` has no untracked files, so the earlier number was a measurement slip. The verified final size is **13,998,876 bytes (58 files), 21% below the 17,712,188-byte baseline**. Slice 9 itself adds about 1.4 KB.

How every desktop test keeps the owner's data safe:
- Each run uses a throwaway WebView2 profile in `%TEMP%`: `WEBVIEW2_USER_DATA_FOLDER` for the scripts, msedgedriver's own `scoped_dir` for WebDriver. Reminders, sign-in and settings in `com.habitglo.app` are never read or written. The e2e spec checks this before doing anything and refuses to run otherwise.
- The test dev server runs with `VITE_BILLING_GATE=false` (`.env` has it `true`, which would stop at sign-in) and PostHog pointed at an unreachable address, so no analytics events are sent.
- Every script refuses to start if a real HabitGlo is running or port 4173 is busy. It always closes the strip first (which gives the reserved screen space back), then ends the app and dev server. I checked after every run: no `habitglo`, `tauri-driver` or `msedgedriver` left, port free, work area back to the full screen minus the taskbar.
- The debug app is built with `cargo build --no-default-features` (no `custom-protocol`), so it loads the Vite dev server exactly like `tauri dev`.

### Launch + screenshot smoke test: `scripts/smoke-desktop.ps1`: PASS
- Both windows appear about 4 s after launch. The strip is docked at the top, full width (2560×96 at 0,0), and the work area starts at y=96, so the space is reserved. After quit the work area is back to y=0.
- The strip crops at 2 s and 5 s differ in 17.7% of pixels, so the strip is scrolling. I looked at both: red, amber and green dot-matrix text with the separators, as designed.
- The main-window capture (`PrintWindow`, so other windows can't cover it) shows the 5 starter reminders, the live preview, and Pause / Hide LED.
- Artifacts: `docs/test-artifacts/smoke-strip-2s.png`, `smoke-strip-5s.png`, `smoke-main-window.png`, `smoke-result.json`. Full-screen shots are saved locally but git-ignored, because they capture whatever else is on the desktop.

### CPU / memory: `scripts/perf-desktop.ps1`: PASS
Share of the whole machine (12 logical cores, 144 Hz monitor), 60 s per state, habitglo.exe plus all its WebView2 processes. The window is minimized while measuring, as it is while someone works.

| State | Avg CPU | Median | Max | Memory | Target |
| --- | --- | --- | --- | --- | --- |
| Paused | 0.10% | 0% | 1.71% | 536 MB | < 0.5% ✓ |
| Scrolling | 2.13% | 2.54% | 3.68% | 538 MB | < 3% ✓ |
| LED hidden | 0.02% | 0% | 0.39% | 540 MB | < 0.5% ✓ |
| Scrolling, window in tray | 2.14% | 2.50% | 4.32% | 543 MB | < 3% ✓ |

Where scrolling CPU goes: WebView2's GPU process about 19% of one core, the strip's renderer about 6%. That is the cost of composing a 2560-px-wide transparent window at 144 frames per second. The page does no script, layout or style work per frame (checked with DevTools: 0 ms script, 0 layouts, 1 animation).

What I found and changed while measuring:
- **The in-window preview kept animating all day whenever the window was open, even behind other apps.** It now only moves while the HabitGlo window is the active window (`src/lib/useLedRunning.ts`). The signal is Tauri's native focus (`appWindow.onFocusChanged` / `isFocused`), because WebView2 reports the page as focused even when its window never was. The browser preview uses page focus. The real strip is not affected. Tests: `useLedRunning.test.ts`, `useLedRunning.tauri.test.ts`. The manual says so in one line.
- Fresh-profile noise: every test run starts a brand-new WebView2 profile, and WebView2 then spends 10–150 s on one-time work (GPU shader cache, first-run components), with bursts up to a full core. A real install does this once. The perf script now waits for 5 quiet seconds before measuring and records how long that took (6 s in the passing run). One earlier run never went quiet (an extra tenth WebView2 process, +300 MB) and failed. Paused + minimized was 0% in a targeted re-check, so I treat it as that one-time work, but it is the first thing to look at if the owner's own Task Manager check disagrees.
- Tried and rejected (measured, no reliable gain within run-to-run noise, reverted): whole-pixel `steps()` scrolling, an opaque strip window, and removing the rounded clip around the moving text.

### UI tests with WebDriver: `npm run test:e2e`: PASS (5/5, first attach worked)
WebdriverIO 10 + `tauri-driver` + msedgedriver 155.0.4283.62 (matches WebView2 155.0.4283.62, from `C:\Users\Hwan\.cursor-tools\msedgedriver\`). Tests, all against the real app windows:
1. Opens with the 5 starter reminders.
2. Adds "E2E 물 마시기 ✓" with the input + Enter; it appears in the list and on the strip.
3. Turns it off (it leaves the strip), then deletes it.
4. Settings: Fast and Bottom. The strip's animation gets faster and the strip window moves to the bottom of the screen.
5. Hide LED stops the strip's animation, and Show LED starts it again.

Not part of `npm test`. Needs Windows, Rust and `cargo install tauri-driver`. `MSEDGEDRIVER_PATH` overrides the driver location.

### Offline simulation (unit/integration): PASS
`src/App.offline.test.tsx` renders the whole app as the desktop build: billing gate on, Supabase configured, `navigator.onLine = false`, every Supabase call failing.
- With a paid check 3 days old, the app opens and a reminder added through the real input appears in the list and is queued for sync.
- With a check 15 days old, it shows "Connect to the internet to verify your HabitGlo subscription" and no input.