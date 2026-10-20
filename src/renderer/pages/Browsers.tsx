import React, { useState } from 'react'
import type { BrowserProfile, Inventory } from '../../shared/types/browser'
import { BrowserAvatar, Button, Card, EmptyState, SectionTitle, StatusPill, formatBytes } from '../components/ui'

interface BrowsersProps {
  profiles: BrowserProfile[]
  onInspect: (profile: BrowserProfile) => Promise<Inventory>
  onSelectCustom: () => Promise<void>
  onRefresh: () => void
  onOpenOriginInventory: () => void
}

export default function Browsers({ profiles, onInspect, onSelectCustom, onRefresh, onOpenOriginInventory }: BrowsersProps) {
  const [selected, setSelected] = useState<BrowserProfile | null>(null)
  const [inventory, setInventory] = useState<Inventory | null>(null)
  const [loading, setLoading] = useState(false)

  async function inspect(profile: BrowserProfile) {
    setLoading(true)
    setSelected(profile)
    try {
      setInventory(await onInspect(profile))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <SectionTitle title="Browsers" subtitle="Detected macOS browser applications and profile directories." />
        <div className="flex gap-2">
          <Button onClick={onRefresh}>Rescan</Button>
          <Button onClick={() => void onSelectCustom()}>Open custom profile</Button>
        </div>
      </div>

      {profiles.length === 0 ? (
        <EmptyState
          title="No profiles detected"
          description="Supported browsers were not found in the standard macOS locations. You can open a profile directory manually."
          action={<Button onClick={() => void onSelectCustom()}>Open custom profile</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {profiles.map((profile) => (
            <Card key={`${profile.browserId}:${profile.profileDir}`} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <BrowserAvatar browserId={profile.browserId} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {profile.browserName} · {profile.profileName}
                      </span>
                      <StatusPill status={profile.running ? 'running' : 'stopped'} />
                      <StatusPill status={profile.accessible ? 'Readable' : 'Restricted'} />
                    </div>
                    <div className="mt-1 truncate font-mono text-xs text-[#8b90a8]" title={profile.profileDir}>
                      {profile.profileDir}
                    </div>
                    <div className="mt-1 text-xs text-[#6b6f8a]">
                      {profile.browserVersion ? `Version ${profile.browserVersion} · ` : ''}
                      Migration capabilities:{' '}
                      {profile.browserId === 'firefox' || profile.browserId === 'safari'
                        ? 'discovery only'
                        : profile.supportedMigration.length
                          ? profile.supportedMigration.join(', ')
                          : 'inspection only'}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => void inspect(profile)}>{selected?.profileDir === profile.profileDir ? 'Refresh files' : 'Inspect files'}</Button>
                  <Button variant="ghost" onClick={onOpenOriginInventory}>
                    Website inventory
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {selected && (
        <Card className="mt-6 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">{selected.browserName} — {selected.profileName}</div>
              <div className="font-mono text-xs text-[#8b90a8]">{selected.profileDir}</div>
            </div>
            {loading && <span className="text-xs text-[#8b90a8]">Reading profile...</span>}
          </div>
          {inventory && (
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric label="Files/directories" value={String(inventory.items.length)} />
              <Metric label="Databases" value={String(inventory.databases.length)} />
              <Metric label="LevelDB stores" value={String(inventory.leveldbDirs.length)} />
              <Metric label="JSON files" value={String(inventory.jsonFiles.length)} />
              <div className="col-span-2 lg:col-span-4">
                <div className="mb-1 text-xs uppercase tracking-wide text-[#8b90a8]">Largest observed files (metadata only)</div>
                <div className="max-h-56 overflow-auto rounded-lg bg-[#0f1026] p-2 font-mono text-[11px] text-[#a9adbf]">
                  {inventory.items
                    .filter((item) => item.type === 'file')
                    .sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0))
                    .slice(0, 25)
                    .map((item) => (
                      <div key={item.path} className="flex justify-between gap-4 py-0.5">
                        <span className="truncate">{item.path.replace(selected.profileDir, '.')}</span>
                        <span className="shrink-0 text-[#6b6f8a]">{formatBytes(item.sizeBytes ?? 0)}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#0f1026] p-3">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-[#8b90a8]">{label}</div>
    </div>
  )
}
