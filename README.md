# HabitGlo

A desktop LED-style habit tracker that scrolls your goals, tasks, and reminders across your screen all day — so you never drift, never forget, and always know what to do next.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Tailwind CSS, Zustand |
| Desktop | Tauri v1 (Rust) |
| Backend | Supabase (Auth, Database, Edge Functions) |
| Payments | Paddle (checkout, subscriptions, webhooks) |
| Hosting | Vercel (landing page + public pages) |

## Project Structure

```
src/                  # React app (main window + overlay)
  components/         # UI components (HabitList, HabitForm, Settings, etc.)
  overlay/            # Marquee overlay window (OverlayApp, Marquee)
  stores/             # Zustand stores (habits, leaderboard)
  lib/                # Utilities (Supabase client, billing, platform detection)
src-tauri/            # Tauri / Rust backend (system tray, window management)
public/               # Static pages (pricing, checkout, download, legal)
supabase/             # Edge Functions (Paddle webhooks, checkout gating, billing portal)
landing.html          # Marketing landing page
docs/                 # Internal docs (Paddle setup, deployment flow, changelogs)
```

## Getting Started

### Prerequisites

- Node.js 18+
- Rust toolchain ([rustup.rs](https://rustup.rs))
- Tauri v1 CLI (`npm install -g @tauri-apps/cli@^1`)

### Install Dependencies

```bash
npm install
```

### Run in Browser (dev mode)

```bash
npm run dev
```

Opens at `http://localhost:4173`.

### Run as Desktop App

```bash
npm run tauri:dev
```

### Build for Production

```bash
npm run tauri:build
```

The Windows installer (MSI) is output to `src-tauri/target/release/bundle/msi/`.

## Environment Setup

Copy the example env file and fill in your Supabase credentials:

```bash
cp supabase.env.example .env
```

For Paddle checkout configuration, see `public/download/config.js` and `docs/paddle-setup.md`.

## Docs

- [Paddle Setup](docs/paddle-setup.md) — payment integration setup
- [Deployment & Download Flow](docs/deployment-download-flow.md) — how checkout → download works
- [Launch Readiness Checklist](docs/launch-readiness-checklist.txt) — pre-launch task list
- [Instruction Manual](docs/instruction-manual.md) — user-facing guide

## License

Proprietary. All rights reserved.
