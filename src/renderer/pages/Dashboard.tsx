import React, { useMemo } from 'react'
import type { BrowserId, BrowserProfile } from '../../shared/types/browser'
import type { ProfileOriginScan } from '../../shared/types/session'
import { BrowserAvatar, Button, Card, EmptyState, SectionTitle, StatusPill, formatBytes } from '../components/ui'

interface DashboardProps {
  profiles: BrowserProfile[]
  scans: ProfileOriginScan[]
  scanning: boolean
  scanningSites: boolean
  onScanBrowsers: () => void
  onScanSites: () => void
  onOpenBrowsers: () => void
  onOpenSites: () => void
}

const BROWSER_ORDER: BrowserId[] = ['chrome', 'arc', 'brave', 'edge', 'firefox', 'safari']

export default function Dashboard({
  profiles,
  scans,
  scanning,
  scanningSites,
  onScanBrowsers,
  onScanSites,
  onOpenBrowsers,
  onOpenSites
}: DashboardProps) {
  const cards = useMemo(() => {
    const byBrowser = new Map<BrowserId, BrowserProfile[]>()
    for (const profile of profiles) {
      const list = byBrowser.get(profile.browserId) ?? []
      list.push(profile)
      byBrowser.set(profile.browserId, list)
    }
    return BROWSER_ORDER.filter((browserId) => byBrowser.has(browserId)).map((browserId) => {
      const browserProfiles = byBrowser.get(browserId) ?? []
      const browserScans = scans.filter((scan) => scan.profile.browserId === browserId)
      const origins = browserScans.flatMap((scan) => scan.origins)
      const partial = origins.filter((origin) => origin.migratable && (origin.indexedDB > 0 || origin.sessionStorage > 0)).length
      const migratable = origins.filter((origin) => origin.migratable && !(origin.indexedDB > 0 || origin.sessionStorage > 0)).length
      const unsupported = origins.filter((origin) => !origin.migratable).length
      return {
        browserId,
        name: browserProfiles[0]?.browserName ?? browserId,
        version: browserProfiles[0]?.browserVersion,
        profiles: browserProfiles,
        running: browserProfiles.some((profile) => profile.running),
        origins: origins.length,
        categories: new Set(
          origins.flatMap((origin) => [
            ...(origin.cookies ? ['cookies'] : []),
            ...(origin.localStorage ? ['localStorage'] : []),
            ...(origin.indexedDB ? ['indexedDB'] : []),
            ...(origin.sessionStorage ? ['sessionStorage'] : [])
          ])
        ).size,
        migratable,
        partial,
        unsupported,
        scanned: browserScans.length > 0,
        error: browserScans.find((scan) => scan.error)?.error,
        size: origins.reduce((total, origin) => total + origin.estimatedSizeBytes, 0)
      }
    })
  }, [profiles, scans])

  const totalOrigins = scans.flatMap((scan) => scan.origins).length
  const migratableOrigins = scans.flatMap((scan) => scan.origins).filter((origin) => origin.migratable).length
  const categoriesFound = new Set(
    scans
      .flatMap((scan) => scan.origins)
      .flatMap((origin) => [
        ...(origin.cookies ? ['cookies'] : []),
        ...(origin.localStorage ? ['localStorage'] : []),
        ...(origin.indexedDB ? ['indexedDB'] : []),
        ...(origin.sessionStorage ? ['sessionStorage'] : [])
      ])
  ).size

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <SectionTitle
          title="Dashboard"
          subtitle="Local-only inspection of installed browser profiles and website storage."
        />
        <div className="flex gap-2">
          <Button onClick={onScanBrowsers} disabled={scanning}>
            {scanning ? 'Scanning browsers...' : 'Scan browsers'}
          </Button>
          <Button variant="primary" onClick={onScanSites} disabled={scanningSites || profiles.length === 0}>
            {scanningSites ? 'Scanning websites...' : 'Scan websites'}
          </Button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Browsers detected', value: cards.length },
          { label: 'Profile count', value: profiles.length },
          { label: 'Websites identified', value: totalOrigins },
          { label: 'Session-migratable sites', value: migratableOrigins }
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <div className="text-xs uppercase tracking-wide text-[#8b90a8]">{stat.label}</div>
            <div className="mt-2 text-2xl font-semibold">{stat.value}</div>
          </Card>
        ))}
      </div>

      {profiles.length === 0 ? (
        <EmptyState
          title="No browser profiles detected"
          description="Install a supported browser or scan again. This tool only reads profile data; it does not upload anything."
          action={<Button onClick={onScanBrowsers}>Scan browsers</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {cards.map((card) => (
            <Card key={card.browserId} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <BrowserAvatar browserId={card.browserId} size="lg" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold">{card.name}</h2>
                      <StatusPill status={card.running ? 'running' : 'stopped'} />
                    </div>
                    <div className="text-sm text-[#8b90a8]">
                      {card.profiles.length} profile{card.profiles.length === 1 ? '' : 's'}
                      {card.version ? ` · v${card.version}` : ''}
                      {card.scanned ? ` · ${formatBytes(card.size)} observed` : ''}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-1 text-xs text-[#8b90a8]">
                {card.profiles.map((profile) => (
                  <div key={profile.profileDir} className="truncate font-mono" title={profile.profileDir}>
                    {profile.profileName} — {profile.profileDir}
                  </div>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                <div className="rounded-lg bg-[#0f1026] p-2">
                  <div className="text-lg font-semibold">{card.origins}</div>
                  <div className="text-[11px] text-[#8b90a8]">websites</div>
                </div>
                <div className="rounded-lg bg-[#0f1026] p-2">
                  <div className="text-lg font-semibold">{card.categories}</div>
                  <div className="text-[11px] text-[#8b90a8]">categories</div>
                </div>
                <div className="rounded-lg bg-[#0f1026] p-2">
                  <div className="text-lg font-semibold text-[#86efac]">{card.migratable}</div>
                  <div className="text-[11px] text-[#8b90a8]">migratable</div>
                </div>
                <div className="rounded-lg bg-[#0f1026] p-2">
                  <div className="text-lg font-semibold text-[#fca5a5]">{card.unsupported}</div>
                  <div className="text-[11px] text-[#8b90a8]">unsupported</div>
                </div>
              </div>

              {card.scanned && card.partial > 0 && (
                <div className="mt-2 text-xs text-[#fcd34d]">
                  {card.partial} website{card.partial === 1 ? '' : 's'} include data that is only partially transferable.
                </div>
              )}
              {card.error && <div className="mt-2 text-xs text-[#fca5a5]">{card.error}</div>}

              <div className="mt-4 flex gap-2">
                <Button onClick={onScanSites} disabled={scanningSites}>
                  {card.scanned ? 'Rescan websites' : 'Scan websites'}
                </Button>
                <Button variant="ghost" onClick={onOpenBrowsers}>
                  View profiles
                </Button>
                <Button variant="ghost" onClick={onOpenSites} disabled={!card.scanned}>
                  Website inventory
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {profiles.length > 0 && scans.length === 0 && (
        <div className="mt-6 rounded-xl border border-[#2a2e4a] bg-[#15182a] p-4 text-sm text-[#8b90a8]">
          Profiles were detected. Run <span className="text-[#e7e9ee]">Scan websites</span> to read website-origin
          storage (cookies, Local Storage, IndexedDB, Session Storage) for these profiles.
        </div>
      )}
      {categoriesFound > 0 && (
        <div className="mt-6 text-xs text-[#6b6f8a]">
          Categories observed across scanned profiles: {categoriesFound}. Credential and session data stays on this
          machine and is never included in reports.
        </div>
      )}
    </div>
  )
}
