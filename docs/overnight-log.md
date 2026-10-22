# Overnight log: simplify/core-v1

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
