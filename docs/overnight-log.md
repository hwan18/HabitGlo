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
