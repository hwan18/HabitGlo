# Overnight runbook: simplify the HabitGlo desktop app

Deadline: 09:00 (UTC+9). Repo: `C:\Saas\HabitGlo`. Branch: `simplify/core-v1` (already checked out).
Do not touch the website files (`landing.html`, `public/**/*.html`); another agent is redesigning them in a separate worktree.

## Goal

A desktop app that works right out of the box, feels instant, never lags, and works offline.
The core stays: reminders scroll across the screen on an always-on-top LED strip.

## Ground rules

- Commit only on `simplify/core-v1`. Never commit to `theme/tweakcn-lab` or `main`. Push the branch after every slice (`git push -u origin simplify/core-v1`).
- Quality gate after every slice, all must pass before committing:
  - `npm run build`
  - `npm run lint`
  - `npm test` (once Vitest is added in slice 1)
  - `cargo check` inside `src-tauri`
- If a slice fails its gate after 3 fix attempts: `git restore` / `git reset --hard` to the last good commit, record why in `docs/overnight-log.md`, and move to the next slice.
- Never ask questions. Choose the simplest reasonable option and record the decision in the log.
- Do not run `tauri build` (needs code signing). Do not edit `supabase/`, `supabase.sql`, Paddle code, or the signing script.
- Do not change database schemas. Leaderboard tables can stay in Supabase unused.
- Log every slice in `docs/overnight-log.md`: what shipped, decisions, anything the owner must test by hand.

## Vertical slices (each one is shippable on its own, in this order)

Each slice cuts through store, UI and Tauri as needed, and leaves the app fully working.

### Slice 0: baseline
- Run the quality gate on the untouched branch and record results.
- Record `dist/` total size and the largest JS chunk sizes.
- Add Vitest (`vitest`, `jsdom` if needed) and an `npm test` script with one smoke test.

### Slice 1: first launch just works, offline
- First launch (no saved data) seeds 5 starter reminders: `DRINK WATER`, `SIT UP STRAIGHT`, `ONE TASK AT A TIME`, `LOOK AWAY FOR 20 SECONDS`, `DONE IS BETTER THAN PERFECT`. Only seed once (flag in local storage).
- Overlay window shows on launch, docked at the top of the primary monitor, always on top, reserve screen space on.
- Remove the Google Fonts `@import` in `src/index.css`; use bundled `@fontsource` fonts only. Remove the `fonts.googleapis.com` / `fonts.gstatic.com` entries from the CSP in `src-tauri/tauri.conf.json`.
- Main window default size about 560 x 720.

### Slice 2: local-first data with background sync
- `src/lib/db.ts` and `src/stores/useHabitsStore.ts`: every add / edit / reorder / delete / toggle writes to local storage first and updates the UI immediately. Supabase is a background sync, never on the critical path.
- Pending changes queue in local storage; flushed when online and signed in (on startup, on the `online` event, and after each change). Failed syncs stay queued; no error popups for being offline.
- On hydrate while signed in: if the queue is empty, take remote as truth; if not, flush first, then fetch.
- Unit tests for the queue: offline add then online flush, delete of an unsynced item, reorder while offline.

### Slice 3: offline license with 14-day grace
- New module (e.g. `src/lib/entitlement.ts`) caching `{ userId, email, status, checkedAt }` in local storage after every successful online subscription check.
- Access rule: paid status (`active`, `trialing`, `lifetime`) checked online now, OR cached paid status with `checkedAt` within 14 days and the network/auth check failed. Otherwise show a single clear screen: "Connect to the internet to verify your HabitGlo subscription" with a Retry button, plus the sign-in panel when there's no cached user.
- If Supabase session restore fails because of network, fall back to the cached user so the app still opens.
- Replace the `requiresAuth` / `requiresSubscription` logic in `src/App.tsx` with this. Keep `VITE_BILLING_GATE` behavior.
- Unit tests: online paid, online unpaid, offline within 14 days, offline after 14 days, never signed in.

### Slice 4: one simple screen
Main window layout, top to bottom:
1. Live LED preview with a big Start/Pause button and a Show/Hide LED button.
2. "Add a reminder" input (Enter to add).
3. Reminder list: drag to reorder, on/off toggle, delete. Empty state text: "Add something you want to see all day."
4. A gear icon opens a small Settings popup with only:
   - Speed: Slow / Medium / Fast buttons (map to about 30 / 55 / 90 px/s)
   - Position: Top / Bottom, plus "Keep windows from covering it" (reserve screen space)
   - Color: 4 presets (Classic LED red/amber/green, Neon pink/blue, Calm blue, Mono white)
   - Account: email, plan status, Manage billing, Sign out (and sign-in when signed out)
- One built-in dark UI theme. Clear, readable text; consistent spacing; keyboard accessible.
- The browser preview at `/app` must keep working with this same simplified UI (desktop-only controls disabled with a short note).

### Slice 5: delete what's no longer used
- Remove: `Leaderboard`, `useLeaderboardStore`, `HabitPacks`, `src/data/habitPacks.ts`, `BulkImport`, `CompletedToday`, `OnboardingTour`, the Tips panel, `src/lib/uiThemes.ts` (replace with the one theme), extra palettes, extra LED fonts (keep DotGothic16 plus the Noto Sans fallback for non-Latin text), glow/opacity sliders, separator toggle, click-through toggle, snap buttons.
- Remove now-unused npm packages (`papaparse`, unused `@fontsource/*`, `framer-motion` if unused, etc.) and leaderboard functions in `db.ts`.
- Persisted store migration: bump the persist `version`, map old saved settings to the new ones (old speed number to nearest preset, old palette to nearest of the 4 presets), drop removed fields. Existing users must not lose reminders.
- Grep for dead imports and references until `build` and `lint` are clean.

### Slice 6: smooth, lag-free overlay
- `src/overlay/Marquee.tsx`: animate with a single `requestAnimationFrame` loop or a CSS `transform: translate3d` animation. No React state updates per frame. Recompute layout only when text, speed, or window size changes. Use `will-change: transform`.
- Pause the animation when the overlay is hidden or paused (no CPU use when not visible).
- Overlay must not flicker on reminder changes (no full remount).
- Check that the dashboard and overlay stay in sync via the existing local storage sync (`src/lib/overlaySync.ts`), debounced.
- Note the before/after approach in the log; the owner will check CPU in Task Manager.

### Slice 7: tray and polish
- Tray menu in `src-tauri/src/main.rs`: Open HabitGlo, Show/Hide LED, Quit. Left-click opens the main window.
- Closing the main window hides it (already does); the LED keeps running.
- Update `docs/instruction-manual.md` to describe the new simple app in under one page.

### Slice 8: finish
- Full quality gate, final `dist/` size vs. baseline in the log.
- Morning checklist at the top of `docs/overnight-log.md`:
  1. `git switch simplify/core-v1` then `npm install` then `npm run tauri:dev`
  2. Fresh first launch: clear local storage (or new Windows user) and confirm starter reminders + LED at top
  3. Turn Wi-Fi off, relaunch, add a reminder, confirm the LED updates
  4. Watch CPU of the overlay in Task Manager for a minute
- Push the branch.

### Slice 9: automated testing of the real desktop app
Goal: prove the real app launches, shows the LED, responds to the UI, and doesn't lag, without the owner present. Put everything under `e2e/` and `scripts/`; results go in `docs/overnight-log.md` and `docs/test-artifacts/`.
- **Launch + screenshot smoke test** (`scripts/smoke-desktop.ps1`): build the debug binary with `cargo build` in `src-tauri` (not `tauri build`), start the Vite dev server (`npm run dev`, port from `tauri.conf.json` `devPath`), start `src-tauri/target/debug/<app>.exe`, wait for both windows, take full-screen screenshots with .NET `System.Drawing` (`CopyFromScreen`) at 2s and 5s, save to `docs/test-artifacts/`. Then stop the app and the dev server. Look at the screenshots yourself (Read tool) and record whether the LED strip is visible, docked at the top, and that the two shots show the text in different positions (it's scrolling).
- **CPU / memory sampling** (`scripts/perf-desktop.ps1`): while the app runs, sample every second for 60s the summed CPU % (`Get-Counter '\Process(*)\% Processor Time'` divided by core count) and working set of the app process plus its `msedgewebview2` children. Do it for three states: scrolling, paused, LED hidden. Record avg/max per state in the log. Targets: scrolling avg under 3% CPU, paused/hidden under 0.5%. If scrolling is over target, profile and fix Marquee, then re-measure.
- **UI tests with WebDriver** (`e2e/`): use `tauri-driver` (already installed via `cargo install tauri-driver`) and `msedgedriver.exe` matching the installed WebView2 version (check `C:\Users\Hwan\.cursor-tools\msedgedriver\` first; otherwise download from https://msedgedriver.microsoft.com/<version>/edgedriver_win64.zip). Use WebdriverIO (`@wdio/cli`, mocha) as a devDependency, script `npm run test:e2e`. Tests: app opens with starter reminders; add a reminder via the input + Enter and it appears in the list; toggle and delete a reminder; open Settings, switch speed to Fast and position to Bottom, close Settings; Show/Hide LED button works. If WebDriver can't attach after 3 attempts, record why in the log and keep the smoke + perf scripts.
- **Offline simulation**: in a unit/integration test, force `navigator.onLine = false` and failing Supabase calls, and assert the app still opens with cached entitlement and adding reminders works (don't actually disconnect the PC).
- Always kill any processes you started (app, dev server, tauri-driver, msedgedriver) before finishing. Never leave the LED window running.
- Quality gate still applies; e2e is not part of `npm test` (it needs the real app).
