import React, { useMemo, useState } from 'react'
import type { ProfileOriginScan, OriginSummary } from '../../shared/types/session'
import { BrowserAvatar, Button, Card, EmptyState, SectionTitle, StatusPill, formatBytes, selectClass } from '../components/ui'

interface Props {
  scans: ProfileOriginScan[]
  scanning: boolean
  onScan: () => void
  onMigrate: (origin: OriginSummary) => void
}

function capability(origin: OriginSummary): { label: string; status: string } {
  if (origin.migratable && (origin.indexedDB > 0 || origin.sessionStorage > 0)) {
    return { label: 'Partial session transfer', status: 'Partially supported' }
  }
  if (origin.migratable) return { label: 'Session transfer available', status: 'Supported' }
  return { label: 'Inspect only', status: 'Unsupported' }
}

export default function WebsiteInventory({ scans, scanning, onScan, onMigrate }: Props) {
  const [query, setQuery] = useState('')
  const [browserFilter, setBrowserFilter] = useState('all')
  const [profileFilter, setProfileFilter] = useState('all')
  const [sort, setSort] = useState<'origin' | 'size'>('origin')

  const profiles = scans.map((scan) => scan.profile)

  const rows = useMemo(() => {
    const all = scans.flatMap((scan) => scan.origins)
    const filtered = all.filter((origin) => {
      if (query && !origin.origin.toLowerCase().includes(query.toLowerCase())) return false
      if (browserFilter !== 'all' && origin.browserId !== browserFilter) return false
      if (profileFilter !== 'all' && origin.profileDir !== profileFilter) return false
      return true
    })
    return filtered.sort((a, b) =>
      sort === 'origin' ? a.origin.localeCompare(b.origin) : b.estimatedSizeBytes - a.estimatedSizeBytes
    )
  }, [scans, query, browserFilter, profileFilter, sort])

  const errors = scans.filter((scan) => scan.error)

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <SectionTitle
          title="Website Inventory"
          subtitle="Websites discovered from real cookie, Local Storage, IndexedDB and Session Storage inspection."
        />
        <Button variant="primary" onClick={onScan} disabled={scanning}>
          {scanning ? 'Scanning...' : 'Scan websites'}
        </Button>
      </div>

      <Card className="mb-4 p-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search origin..."
            className="rounded-md border border-[#2a2e4a] bg-[#0f1026] px-3 py-2 text-sm outline-none focus:border-[#3b82f6]"
          />
          <select value={browserFilter} onChange={(event) => setBrowserFilter(event.target.value)} className={selectClass}>
            <option value="all">All browsers</option>
            {[...new Set(profiles.map((profile) => profile.browserId))].map((browserId) => (
              <option key={browserId} value={browserId}>
                {profiles.find((profile) => profile.browserId === browserId)?.browserName ?? browserId}
              </option>
            ))}
          </select>
          <select value={profileFilter} onChange={(event) => setProfileFilter(event.target.value)} className={selectClass}>
            <option value="all">All profiles</option>
            {profiles.map((profile) => (
              <option key={profile.profileDir} value={profile.profileDir}>
                {profile.browserName} · {profile.profileName}
              </option>
            ))}
          </select>
          <select value={sort} onChange={(event) => setSort(event.target.value as 'origin' | 'size')} className={selectClass}>
            <option value="origin">Sort by origin</option>
            <option value="size">Sort by size</option>
          </select>
        </div>
      </Card>

      {errors.length > 0 && (
        <div className="mb-4 space-y-1">
          {errors.map((scan) => (
            <div key={scan.profile.profileDir} className="rounded-md border border-[#7f1d1d] bg-[#3f1d1d]/40 px-3 py-2 text-xs text-[#fca5a5]">
              {scan.profile.browserName} · {scan.profile.profileName}: {scan.error}
            </div>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title={scans.length === 0 ? 'No website scan yet' : 'No matching websites'}
          description={
            scans.length === 0
              ? 'Run a website scan to read storage locations for the detected profiles. Source files are opened through temporary snapshots and are never modified.'
              : 'No website origins matched the current search and filters.'
          }
          action={scans.length === 0 ? <Button onClick={onScan}>Scan websites</Button> : undefined}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0f1026] text-xs uppercase tracking-wide text-[#8b90a8]">
                <tr>
                  <th className="px-3 py-2">Website origin</th>
                  <th className="px-3 py-2">Browser / profile</th>
                  <th className="px-3 py-2">Cookies</th>
                  <th className="px-3 py-2">Local Storage</th>
                  <th className="px-3 py-2">IndexedDB</th>
                  <th className="px-3 py-2">Session</th>
                  <th className="px-3 py-2">Size</th>
                  <th className="px-3 py-2">Capability</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((origin) => {
                  const cap = capability(origin)
                  return (
                    <tr key={`${origin.profileDir}:${origin.origin}`} className="border-t border-[#23263d] hover:bg-[#1a1d33]">
                      <td className="px-3 py-2 font-medium">{origin.origin}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <BrowserAvatar browserId={origin.browserId} size="sm" />
                          <div>
                            <div className="text-xs">{origin.profileId}</div>
                            <div className="text-[11px] text-[#6b6f8a]">{origin.profileDir.split('/').slice(-3, -1).join('/')}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-[#a9adbf]">{origin.cookies || '—'}</td>
                      <td className="px-3 py-2 text-[#a9adbf]">{origin.localStorage || '—'}</td>
                      <td className="px-3 py-2 text-[#a9adbf]">{origin.indexedDB || '—'}</td>
                      <td className="px-3 py-2 text-[#a9adbf]">{origin.sessionStorage || '—'}</td>
                      <td className="px-3 py-2 text-[#a9adbf]">{formatBytes(origin.estimatedSizeBytes)}</td>
                      <td className="px-3 py-2">
                        <StatusPill status={cap.status} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {origin.migratable ? (
                          <Button variant="ghost" onClick={() => onMigrate(origin)}>
                            Migrate
                          </Button>
                        ) : (
                          <span className="text-xs text-[#6b6f8a]">Inspect only</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
