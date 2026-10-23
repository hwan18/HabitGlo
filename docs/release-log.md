# HabitGlo 1.0.0 release

## Went live (24 Oct 2026, about 2:40 AM)

- `master` is the simplified app plus the redesigned site. Pushed to GitHub.
- The installer is public: https://github.com/hwan18/HabitGlo/releases/tag/v1.0.0
- The download page points at that file. Checksum `5B9DB010DAE6F6D0BDAEF3DD89DBC72CAF199BE84E4210D4FE828E78828C163F`.
- Paddle is still sandbox. A live checkout was not switched on, because a full sandbox purchase could not be run from this PC (the saved Paddle API key is rejected).
- Still yours: back up `C:\Users\Hwan\.tauri\habitglo-updater.key` and `habitglo-updater.password.txt` somewhere that is not this PC. Install the MSI once yourself. When a sandbox buy and refund both behave, switch `public/download/config.js` from `sandbox` to `production` with the live token and price IDs.



Published release: https://github.com/hwan18/HabitGlo/releases/tag/v1.0.0 (tag `v1.0.0`). The installer was rebuilt from the cut-corner UI commit before it was published.

## Installer

| | |
| --- | --- |
| File | `HabitGlo_1.0.0_x64_en-US.msi` |
| Size | 4.50 MB (was 16.8 MB for 0.1.0) |
| SHA-256 | `5B9DB010DAE6F6D0BDAEF3DD89DBC72CAF199BE84E4210D4FE828E78828C163F` |
| Direct URL (after publish) | https://github.com/hwan18/HabitGlo/releases/download/v1.0.0/HabitGlo_1.0.0_x64_en-US.msi |
| Signed | No. Windows SmartScreen will show “More info” → “Run anyway”. |

The MSI extracts cleanly (`msiexec /a`) and contains `PFiles\HabitGlo\HabitGlo.exe`. It was **not** installed on this PC.

A live smoke test of the release exe was skipped because HabitGlo was already running (debug build, PID 43880). The test scripts refuse to start a second copy so they never touch a real session.

## Desktop bundle

`npm run build` still builds the full website into `dist/`.
`npm run build:desktop` / Tauri's `beforeBuildCommand` writes `dist-desktop/` with only the app windows and the few public files in `desktop-public-files.json`.

| | Bytes |
| --- | --- |
| Website `dist/` | 13,999,080 |
| Desktop `dist-desktop/` | 1,370,778 |

## Auto-updater

- Endpoint: `https://github.com/hwan18/HabitGlo/releases/latest/download/latest.json`
- Built-in dialog on startup. Fails silently if GitHub is unreachable.
- **Private key:** `C:\Users\Hwan\.tauri\habitglo-updater.key`
- **Password:** `C:\Users\Hwan\.tauri\habitglo-updater.password.txt`
- Back these two files up somewhere that is not this PC. If either is lost, existing installs can never auto-update again. Do not commit them.

## Next release (1.0.1, 1.1.0, …)

1. Bump the version in `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.
2. In PowerShell: `$env:TAURI_PRIVATE_KEY = 'C:\Users\Hwan\.tauri\habitglo-updater.key'; $env:TAURI_KEY_PASSWORD = Get-Content -Raw C:\Users\Hwan\.tauri\habitglo-updater.password.txt; npm run tauri:build`
3. Copy the new `.msi`, `.msi.zip`, `.msi.zip.sig` and write a new `latest.json` (version, notes, pub_date, signature, url).
4. `gh release create vX.Y.Z --title "HabitGlo X.Y.Z" --notes "..." <files>`
5. Update `public/download/config.js` with the new file name, SHA-256 and URL.

## What still needs the owner

1. The release is published. The download page on `website/redesign` points at this file.
2. Try the installer once on this PC before sending it to anyone else.
3. Paddle is still in sandbox. Switch to live keys only after a full checkout test.
4. Code signing later: set `HABITGLO_CERT_THUMBPRINT` and add `signCommand` in `tauri.conf.json` pointing at `src-tauri/scripts/sign-windows.ps1`. Without the thumbprint the script now exits 0 and skips signing.
