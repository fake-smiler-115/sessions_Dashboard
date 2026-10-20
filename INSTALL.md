# Install

## Requirements

- macOS 13 or newer recommended
- Node.js 22 or newer
- Xcode Command Line Tools (`xcode-select --install`) for native modules
- Chrome, Brave or Edge for destination migration

## Development

```bash
npm install
npm run dev
```

## Native modules

`better-sqlite3` must match the Electron ABI:

```bash
npm rebuild better-sqlite3
```

If Electron itself was not downloaded (its postinstall was skipped):

```bash
npm rebuild electron
# or
node node_modules/electron/install.js
```

## Verification

```bash
npm run typecheck
npm run test
npm run build
```

The end-to-end test needs Google Chrome installed and quit. It is skipped when
Chrome is running.

## Packaging

```bash
npm run package
```

The unsigned app is written to `dist-electron/`. Signing and notarisation are
not configured. Keychain prompts show the app identity; an unsigned development
build may be denied or re-prompt after rebuilds.
