# Supported Browsers

## Session migration

| Browser | Source cookies | Source Local Storage | Destination | Notes |
| --- | --- | --- | --- | --- |
| Google Chrome | Yes | Yes | Yes (CDP) | Keychain: `Chrome Safe Storage` |
| Brave | Yes | Yes | Yes (CDP) | Keychain: `Brave Safe Storage` |
| Microsoft Edge | Yes | Yes | Yes (CDP) | Keychain: `Microsoft Edge Safe Storage`; may be absent if never signed in |
| Arc | Yes | Yes | No | Read as Chromium; launcher not supported as a CDP destination |
| Firefox | No | No | No | Discovery only in this build |
| Safari | No | No | No | Discovery only in this build |

## Discovery and inventory

All six browsers are discovered at their standard macOS locations. Chromium
profiles are detected with marker files. Firefox profiles come from
`profiles.ini` with a fallback scan. Safari is a single profile at
`~/Library/Safari`.

Inventory reports cookies, Local Storage, IndexedDB and Session Storage where
the format is known. Firefox and Safari storage formats are not decoded.

## Compatibility matrix behaviour

- Same source and destination profile: blocked.
- Destination browser running: blocked until it is quit.
- Arc destination: unsupported.
- Cookies: `Requires permission` when decryption is possible; blocked when the
  Keychain item is missing.
- Local Storage: `Partially supported`; only string records for the exact origin
  are transferred.
- Session Storage: `Partially supported`; written into the destination tab and
  persisted for session restore, but tab- and session-scoped.
- IndexedDB: `Unsupported` / not migrated.

## Staged destinations

Chromium 136 and newer (including Chrome 155) refuse to expose the DevTools
endpoint when launched with the default user-data directory. For destination
profiles under the browser's default data directory, the tool therefore writes
through a temporary staged profile and then merges the migrated origin's cookie
rows and Local Storage keys into the real profile after the browser closes.

## Verification

After a migration the app reads values back through the destination browser and
then re-reads the cookie database after the browser exits. A destination that
rejects a cookie (for example `SameSite=None` without `Secure`) or fails to flush
its database produces `partial`, not `success`.
