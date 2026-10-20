# Browser Migration Tool

A local-only macOS app for inspecting browser profiles and migrating a website's
session (cookies + Local Storage) between Chromium-based browsers.

## What it does

- Discovers Chrome, Arc, Brave, Edge, Firefox and Safari profiles.
- Inventories cookies, Local Storage, IndexedDB and Session Storage per profile, read-only.
- Explains what can and cannot be migrated for a selected website origin.
- Migrates cookies and Local Storage for one origin at a time into Chrome, Brave or Edge.
- Creates a destination backup with a SHA-256 manifest before writing anything.
- Verifies imported values through the destination browser and again from its
  cookie database after the browser closes.
- Records every job in Migration History without storing cookie values.

## Session migration support

| Role | Browsers |
| --- | --- |
| Source | Chrome, Arc, Brave, Edge |
| Destination | Chrome, Brave, Edge |
| Discovery / inventory only | Firefox, Safari |

Arc is read as a Chromium source but is not a migration destination in this
build. Firefox and Safari stores are not read for session transfer.

## How a migration works

1. The selected source cookie database and Local Storage store are copied to a
   temporary snapshot. The source profile is never modified.
2. Encrypted cookies are decrypted in the Electron main process using the
   browser's macOS Keychain item (`Chrome Safe Storage`, `Brave Safe Storage`,
   etc.). macOS may ask for permission.
3. The destination profile's cookie and Local Storage files are backed up under
   the app data directory.
4. The destination is written through a browser. Modern Chromium (m136+) blocks
   remote debugging on default profile directories, so the tool launches the
   destination with a temporary staged profile, sets cookies with
   `Network.setCookie`, and writes Local Storage strings with
   `localStorage.setItem` after loading the origin.
5. Values are read back through the browser to verify the import. The browser is
   then asked to close gracefully so Chromium flushes its staged cookie database.
6. The affected cookie rows and Local Storage keys are merged from the staged
   profile back into the real destination profile while the destination browser
   is closed. Only rows for the migrated origin's hosts are touched.
7. The destination database is re-read to confirm the cookies persisted. The
   job report contains counts, statuses and reasons only.

Session-only cookies can optionally be converted to persistent cookies with a
7-day expiry. Without that option they may be removed when the destination
browser closes, and the report will say so.

## Safety and privacy

- Local-only. No telemetry, network uploads or cloud services.
- `contextIsolation`, sandboxed preload, no Node.js in the renderer, CSP.
- IPC payloads are validated with Zod. Renderer-supplied profile paths must be
  in the allowed-profile registry.
- Cookie values are never sent to the renderer, logged, or written to reports.
- Source files are read from temporary snapshots. Destination changes happen
  only after explicit confirmation.
- `IndexedDB`, `Cache Storage`, service workers, extensions, history, bookmarks,
  passwords and browser settings are not migrated.

See [SECURITY.md](SECURITY.md) for details.

## Requirements

- macOS with Chrome, Brave or Edge installed (for migration)
- Node.js 22 or newer
- Xcode Command Line Tools for native modules (`better-sqlite3`)

## Install and run

```bash
npm install
npm run dev
```

If Electron's binary is missing after install:

```bash
npm rebuild electron
# or: node node_modules/electron/install.js
```

## Build, test and package

```bash
npm run typecheck
npm run test
npm run build
npm run package
```

The end-to-end session test runs only when Google Chrome is installed and not
running. Otherwise it is reported as skipped.

## Usage

1. Open **Website Migration**.
2. Choose a source Chromium profile and a website origin.
3. Choose a destination profile. Quit the destination browser first; the plan
   offers a one-click **Quit** action and re-checks compatibility automatically.
   Quitting the source browser too gives a complete migration.
4. Click **Check compatibility** and review the per-category status.
5. Choose cookies and/or Local Storage, confirm, and start the migration.
6. Approve the macOS Keychain prompt if it appears.
7. Review the result and the backup path. Use the destination browser to check
   the signed-in session.

A `partial` result is not hidden: the report lists rejected, unreadable or
non-persisted records. Common causes are `SameSite=None` cookies without
`Secure`, expired cookies, unsupported newer encryption formats, or a keychain
request that was denied.

## Limitations

- Chromium only for session transfer. Firefox and Safari sessions are not read.
- Arc is not a destination.
- IndexedDB, Session Storage, Cache Storage, service workers and partitioned
  (`^0`/composite-key) Local Storage records are not migrated.
- Partitioned (CHIPS) cookies with a `top_frame_site_key` are skipped rather
  than promoted to unpartitioned cookies.
- The destination browser must be fully quit before migration; the app launches
  it itself.
- Local Storage requires the origin to load in the destination. Origins that
  redirect away or time out cannot receive Local Storage.
- Secure cookies cannot be applied to `http://` origins.
- Fresh Chromium profiles may defer cookie DB writes. The report marks these as
  partial instead of claiming success.
- Because of the Chromium default-profile restriction, a temporary staged
  profile is used. The merge into the real destination is targeted at the
  migrated origin's cookie rows and Local Storage keys; unrelated data is not
  replaced.
- macOS Keychain authorisation is required for encrypted cookies and cannot be
  bypassed.

## Project layout

```
src/main       Electron main process, IPC, discovery, migration, security
src/preload    Sandboxed contextBridge API
src/renderer   React UI
src/core       Storage inspectors, cookie crypto, session planning
src/shared     Types and Zod schemas
src/tests      Unit and end-to-end tests
```
# sessions_Dashboard
