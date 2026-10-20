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

Stored in a LevelDB store with the same value encoding, but it is tab- and
session-scoped. It is inspected only; it is never migrated.

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
