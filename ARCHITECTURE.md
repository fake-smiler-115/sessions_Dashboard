# Architecture

Electron main process + sandboxed preload + React renderer. Storage inspection
and migration logic live in the main process; the renderer only sees validated
metadata and reports.

## Modules

| Path | Responsibility |
| --- | --- |
| `src/main/index.ts` | Window creation, security defaults, IPC registration |
| `src/main/ipc/handlers.ts` | IPC handlers, allowed-profile enforcement, progress events |
| `src/main/browser-discovery/` | App paths, profile discovery, running checks, Keychain service names |
| `src/main/security/` | Keychain CLI access, allowed-profile registry |
| `src/main/migration/session/` | Plan service, source loading, CDP launcher/writer, backup, job pipeline, JSON bundle export/import, job store |
| `src/core/inspectors/chromium/` | Cookie DB, Local Storage LevelDB, IndexedDB, origin aggregation, snapshots |
| `src/core/security/cookie-crypto.ts` | PBKDF2 + AES-128-CBC cookie decryption |
| `src/core/session/` | Capability matrix and site plan builder |
| `src/preload/preload.ts` | `contextBridge` API |
| `src/shared/` | Types and Zod IPC schemas |
| `src/renderer/` | UI pages and components |

## Session migration pipeline

1. `getSitePlan` inspects the source and destination profiles and returns
   per-category status plus warnings.
2. `startSiteMigration` re-runs the plan, rejects blocked requests, and checks
   that the destination browser is not running.
3. `backupDestinationData` copies the destination cookie DB and Local Storage
   directory, writes a SHA-256 manifest, and checks free disk space.
4. `loadSourceSiteData` snapshots the source, filters cookies by host, decrypts
   encrypted values via the browser Keychain item, and reads Local Storage
   records for the exact origin.
5. `CdpSessionWriter` launches the destination with
   `--remote-debugging-port`, `--user-data-dir` and `--profile-directory`, then
   writes cookies and Local Storage through CDP. When the destination lives
   under the browser's default data directory, Chromium refuses to expose
   remote debugging, so `launcher.ts` creates a temporary staged profile and
   `staged.ts` merges the affected cookie rows and Local Storage keys back into
   the real profile once the browser has closed.
6. Values are verified through the browser, the browser is closed gracefully,
   and the cookie DB is checked again after the process exits.
7. `runSiteMigration` builds a report with counts and reasons only, appends it to
   `jobs.json`, and emits the final result.

## JSON bundle pipeline

`exportSiteBundle` reuses `loadSourceSiteData`, shapes the values into a
`session-transfer-bundle` JSON document (`core/session/bundle.ts`) and writes it
through a save dialog. `selectSiteBundle` reads and validates a bundle through an
open dialog, and `importSiteBundle` reconstructs a `SourceSiteData`, then calls
`migrateSiteData` — the same backup, staged-write, verification and merge path as
a direct migration. Bundle paths must be approved through the open dialog before
they can be imported.

## Snapshot rules

- SQLite files are copied with `-wal`, `-shm` and `-journal` sidecars.
- LevelDB directories are copied recursively, excluding `LOCK`.
- Snapshots live in a `0700` temp directory and are removed in `finally`.
- The source profile is never opened for writing.

## Destination writing

CDP is used instead of editing profile files so Chromium validates and commits
changes itself. Cookies use `Network.setCookie`; Local Storage uses
`Runtime.evaluate` after navigating to the origin. `DOMStorage.setDOMStorageItem`
is intentionally not used: current Chrome returns
`Frame not found for the given storage id` for that path.

Launch arguments include `--no-first-run`, `--no-default-browser-check` and
crash-bubble suppression. Closing uses `Browser.close` first, then waits before
`SIGTERM`/`SIGKILL` so Chromium can flush the cookie database.
