# Data Formats

All inspection is read-only and operates on temporary snapshots.

## Chromium cookies (SQLite)

File: `<profile>/Cookies`

Relevant columns: `host_key`, `name`, `path`, `expires_utc`, `is_secure`,
`is_httponly`, `samesite`, `is_persistent`, `value`, `encrypted_value`.

- `expires_utc` is microseconds since 1601-01-01. Unix seconds are derived by
  dividing by 1,000,000 and subtracting 11,644,473,600.
- `host_key` without a leading dot is host-only; a leading dot marks a domain
  cookie.
- Rows with a non-empty `top_frame_site_key` are partitioned (CHIPS) cookies and
  are skipped, because writing them unpartitioned would change their scope.
- Unknown schemas are rejected instead of guessed.

### macOS cookie encryption

- Stored values use a `v10` (and legacy `v11`) prefix followed by AES-128-CBC.
- Key: `PBKDF2-HMAC-SHA1(keychainSecret, "saltysalt", 1003, 16)`.
- IV: 16 space bytes.
- Some values prefix the plaintext with `SHA-256(host_key)` (32 bytes); it is
  stripped when present.
- Newer/unknown prefixes and malformed payloads are reported as unreadable, not
  guessed.
- Keychain services: `Chrome Safe Storage`, `Brave Safe Storage`,
  `Arc Safe Storage`, `Microsoft Edge Safe Storage`.

## Chromium Local Storage (LevelDB)

Directory: `<profile>/Local Storage/leveldb`

Opened with `classic-level` using binary key and value encodings.

- Value keys: `_` + origin + `\x00` + encoded key.
- `META:` and `METAACCESS:` keys are ignored.
- Encoded key and value: first byte `0` means UTF-16LE body; `1` means Latin-1.
- Only plain `http`/`https` origins are accepted. Composite/partitioned storage
  keys (for example `https://site/^0https://top-level-site`) are skipped because
  they cannot be addressed through a normal origin's `localStorage`.

## Session Storage

Stored under `<profile>/Session Storage` — unlike Local Storage, the store
directory itself is the LevelDB database (there is no nested `leveldb` folder).
Keys use an internal namespace scheme:

- `version` — schema marker (`1`).
- `namespace-<uuid>-<origin>/` — maps an origin to a numeric map id; the value
  is the map id as text. The origin carries a trailing slash.
- `map-<id>-<key>` — one record; the value is raw UTF-16LE with no prefix byte.

Session Storage is tab- and session-scoped: it is read and can be written into
the destination tab, and it persists for session restore, but it will not appear
in a brand-new tab. Migrations that include it are reported as
`partially-migrated`.

## IndexedDB

Origin directories under `<profile>/IndexedDB` are parsed into origins and
database counts. Contents are not decoded or migrated.

## Firefox and Safari

Firefox `profiles.ini` is parsed for discovery. Safari is discovered from
`~/Library/Safari`. Neither browser's session stores are read or migrated in
this build.

## Reports

`jobs.json` and IPC results contain: origin, browser IDs, timestamps, category
statuses, record counts, verification counts, reasons and the backup path.
Cookie and Local Storage values are excluded.

## JSON session bundles

A bundle is a single JSON file written by the export feature and read by the
import feature:

```json
{
  "format": "session-transfer-bundle",
  "version": 1,
  "generatedAt": "2026-01-01T00:00:00.000Z",
  "source": { "browserId": "chrome", "origin": "https://example.com" },
  "categories": ["cookies", "localStorage", "sessionStorage"],
  "cookies": [{ "name": "sid", "value": "...", "domain": ".example.com", "path": "/", "secure": true, "httpOnly": true, "sameSite": 1, "session": false, "expiresUnix": 1800000000 }],
  "localStorage": [{ "key": "token", "value": "..." }],
  "sessionStorage": [{ "key": "tab", "value": "..." }]
}
```

Unlike reports, a bundle **does** contain decrypted cookie values and storage
values in plain text. It is written with `0600` permissions and is only read
through the app's file picker. The import path rejects files that do not match
this schema.
