# Security

## Model

The app runs entirely on the local Mac. There is no telemetry, update service,
remote API or network upload.

## Electron controls

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` for the
  renderer.
- Preload exposes a narrow, typed API through `contextBridge`.
- IPC payloads are validated with Zod before use.
- Renderer-supplied profile directories must be registered during discovery;
  arbitrary paths are rejected.
- A restrictive CSP is set in the renderer HTML.

## Credentials

- Cookie values and Local Storage values are treated as credentials.
- Decryption happens only in the main process, only after explicit confirmation.
- Values are never logged, never returned to the renderer, and never written to
  `jobs.json` or migration reports. Reports contain counts, statuses and
  verification details only.
- Cookie values are held in memory for the duration of the job and are not
  persisted by the app.
- The Keychain secret is read with `security find-generic-password`; macOS may
  prompt the user. A denied or timed-out request produces an honest failure.

## JSON session bundles

- A bundle is an explicit, user-requested export and **does** contain decrypted
  cookie values and storage values in plain text. It is the only artifact the app
  writes that contains credentials.
- Bundles are written with `0600` permissions after a save dialog.
- Bundle files can only be read through the app's open dialog; import rejects any
  path that was not chosen that way.
- The UI states that bundles are credential files that should be stored securely
  and deleted when no longer needed. Bundle contents are never logged and are not
  sent to the renderer (only a non-secret summary is).

## Destination changes

- The destination is modified only after an explicit confirmation payload
  (`confirmation: 'migrate-website-session'`) and a compatibility plan.
- A backup of the destination cookie DB and Local Storage is created first,
  with a SHA-256 manifest and a free-space check.
- The destination browser must be quit. The app launches it with a loopback-only
  debugging port, writes through CDP, verifies, and closes it gracefully.
- The source profile is never modified; source data is read from temporary
  snapshots.
- For default-profile destinations, Chromium's remote-debugging restriction
  forces a temporary staged profile. The merge back into the real destination
  runs while the destination browser is closed and only replaces cookie rows
  and Local Storage keys for the migrated origin's hosts.

## Residual risks

- CDP listens on an ephemeral loopback port with no authentication for the
  lifetime of the migration. Any local process able to reach that port could
  control the temporary destination browser.
- Temporary snapshots contain Local Storage plaintext and encrypted cookies.
  They use `0700` permissions and are deleted, but a crash can leave them behind.
- Keychain authorisation is outside the app's control. The app reports failures
  rather than bypassing them.
- A backup lets the user restore destination files manually; the app does not
  provide automated rollback.
