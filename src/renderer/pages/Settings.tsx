import React, { useEffect, useState } from 'react'
import type { AppInfo } from '../../shared/types/ipc'
import { Button, Card, SectionTitle, Spinner } from '../components/ui'

export default function Settings() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const appInfo = await window.api.getAppInfo()
        if (!cancelled) setInfo(appInfo)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div>
      <SectionTitle title="Settings" subtitle="Security posture, storage locations, and data-handling behaviour." />

      {loading ? (
        <Spinner label="Loading settings..." />
      ) : (
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-sm font-semibold">Privacy and security (fixed for this build)</h2>
            <div className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
              {[
                ['Local processing only', 'No browser data is uploaded. No telemetry contains profile data.'],
                ['Context isolation', 'Renderer runs sandboxed without Node.js integration.'],
                ['Validated IPC', 'Every IPC payload is schema-validated in the main process.'],
                ['Credential handling', 'Cookie values stay in main-process memory and never enter reports.'],
                ['Backups', 'Affected destination cookies and Local Storage are copied with SHA-256 checksums before writes.'],
                ['Source protection', 'Source databases are read through temporary snapshots and never modified.'],
                ['Confirmation', 'Cookie migration requires explicit confirmation and macOS Keychain authorisation.'],
                ['Unsupported data', 'Passwords, IndexedDB, Session Storage, extensions, and settings are not claimed as migrated.']
              ].map(([title, description]) => (
                <div key={title} className="rounded-lg border border-[#2a2e4a] bg-[#0f1026] p-3">
                  <div className="font-medium">{title}</div>
                  <div className="mt-1 text-xs text-[#8b90a8]">{description}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold">Application data</h2>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#0f1026] p-3">
                <div>
                  <div className="text-[#8b90a8]">Application data directory</div>
                  <div className="mt-1 break-all font-mono">{info?.userDataDir}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#0f1026] p-3">
                <div>
                  <div className="text-[#8b90a8]">Backup directory</div>
                  <div className="mt-1 break-all font-mono">{info?.backupRoot}</div>
                </div>
                <Button
                  onClick={() => {
                    if (info) void window.api.revealPath(info.backupRoot)
                  }}
                >
                  Reveal backups
                </Button>
              </div>
              <div className="text-[#6b6f8a]">
                Version {info?.version} · {info?.platform}
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold">Capability notes</h2>
            <ul className="mt-2 space-y-1 text-xs text-[#8b90a8]">
              <li>• Cookie and Local Storage migration is implemented for Chromium sources and Chrome, Brave, or Edge destinations.</li>
              <li>• Arc can be read as a Chromium source but is not used as a destination in this build.</li>
              <li>• Firefox and Safari storage are not transferred.</li>
              <li>• Reports contain counts and verification results, never cookie values or credential material.</li>
            </ul>
          </Card>
        </div>
      )}
    </div>
  )
}
