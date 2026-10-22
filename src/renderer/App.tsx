import React, { useEffect, useState } from 'react'
import type { BrowserId, BrowserProfile, Inventory } from '../shared/types/browser'
import type { OriginSummary, ProfileOriginScan } from '../shared/types/session'
import Dashboard from './pages/Dashboard'
import Browsers from './pages/Browsers'
import WebsiteInventory from './pages/WebsiteInventory'
import Compatibility from './pages/Compatibility'
import WebsiteMigration, { type MigrationPreset } from './pages/WebsiteMigration'
import SessionBundle from './pages/SessionBundle'
import History from './pages/History'
import Settings from './pages/Settings'

type Page = 'dashboard' | 'browsers' | 'websites' | 'compatibility' | 'migration' | 'bundle' | 'history' | 'settings'

const NAV: Array<{ id: Page; label: string; hint: string }> = [
  { id: 'dashboard', label: 'Dashboard', hint: 'Overview' },
  { id: 'browsers', label: 'Browsers', hint: 'Profiles and files' },
  { id: 'websites', label: 'Website Inventory', hint: 'Origins and storage' },
  { id: 'compatibility', label: 'Migration Compatibility', hint: 'Capability matrix' },
  { id: 'migration', label: 'Website Migration', hint: 'Session transfer' },
  { id: 'bundle', label: 'Session Bundle', hint: 'Export / import JSON' },
  { id: 'history', label: 'Migration History', hint: 'Jobs and reports' },
  { id: 'settings', label: 'Settings', hint: 'Security and data' }
]

const NAV_GROUPS: Array<{ label: string; items: typeof NAV }> = [
  { label: 'Workspace', items: NAV.slice(0, 3) },
  { label: 'Move data', items: NAV.slice(3, 6) },
  { label: 'Review', items: NAV.slice(6) }
]

const NAV_ICONS: Record<Page, string> = {
  dashboard: '⌂',
  browsers: '◉',
  websites: '◌',
  compatibility: '⇄',
  migration: '↗',
  bundle: '□',
  history: '◷',
  settings: '⚙'
}

const BROWSER_NAMES: Record<BrowserId, string> = {
  chrome: 'Google Chrome',
  arc: 'Arc',
  brave: 'Brave',
  edge: 'Microsoft Edge',
  firefox: 'Mozilla Firefox',
  safari: 'Safari'
}

function inferBrowser(dir: string): BrowserId {
  const value = dir.toLowerCase()
  if (value.includes('brave')) return 'brave'
  if (value.includes('arc')) return 'arc'
  if (value.includes('edge')) return 'edge'
  if (value.includes('firefox')) return 'firefox'
  if (value.includes('safari')) return 'safari'
  return 'chrome'
}

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [profiles, setProfiles] = useState<BrowserProfile[]>([])
  const [scans, setScans] = useState<ProfileOriginScan[]>([])
  const [preset, setPreset] = useState<MigrationPreset | undefined>(undefined)
  const [scanning, setScanning] = useState(false)
  const [scanningSites, setScanningSites] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadProfiles() {
    setScanning(true)
    setError(null)
    try {
      setProfiles(await window.api.detectProfiles())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Browser discovery failed')
    } finally {
      setScanning(false)
    }
  }

  async function scanSites() {
    setScanningSites(true)
    setError(null)
    try {
      setScans(await window.api.scanWebsites())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Website scan failed')
    } finally {
      setScanningSites(false)
    }
  }

  useEffect(() => {
    void loadProfiles()
  }, [])

  async function inspectProfile(profile: BrowserProfile): Promise<Inventory> {
    return window.api.getInventory(profile.profileDir)
  }

  async function selectCustomProfile() {
    const dir = await window.api.selectDirectory()
    if (!dir) return
    if (profiles.some((profile) => profile.profileDir === dir)) return
    const browserId = inferBrowser(dir)
    setProfiles((current) => [
      ...current,
      {
        browserId,
        browserName: `${BROWSER_NAMES[browserId]} (custom)`,
        profileId: dir.split('/').pop() ?? 'custom',
        profileName: 'Custom profile',
        profileDir: dir,
        exists: true,
        accessible: true,
        running: false,
        supportedInspection: ['files'],
        supportedMigration: []
      }
    ])
  }

  function startFromOrigin(origin: OriginSummary) {
    setPreset({ origin: origin.origin, browserId: origin.browserId, profileDir: origin.profileDir })
    setPage('migration')
  }

  function startFromMatrix(sourceBrowserId: BrowserId, destBrowserId: BrowserId) {
    const source = profiles.find((profile) => profile.browserId === sourceBrowserId)
    if (!source) return
    setPreset({ origin: '', browserId: sourceBrowserId, profileDir: source.profileDir, destBrowserId })
    setPage('migration')
  }

  return (
    <div className="app-shell flex h-screen overflow-hidden bg-[#0f1026] text-[#e7e9ee]">
      <aside className="app-sidebar flex w-64 shrink-0 flex-col border-r border-[#23263d] bg-[#121426]">
        <div className="brand-block border-b border-[#23263d] px-4 py-4">
          <div className="brand-mark" aria-hidden="true">↗</div>
          <div>
            <div className="text-sm font-semibold tracking-tight">Browser Migration</div>
            <div className="mt-1 text-[11px] text-[#6b6f8a]">Private Mac utility</div>
          </div>
        </div>
        <nav className="flex-1 space-y-5 p-3" aria-label="Primary navigation">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="nav-section-label">{group.label}</div>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setPage(item.id)}
                    aria-current={page === item.id ? 'page' : undefined}
                    className={`nav-item w-full rounded-lg px-3 py-2 text-left transition ${
                      page === item.id ? 'bg-[#23263d] text-white' : 'text-[#a9adbf] hover:bg-[#1b1e33]'
                    }`}
                  >
                    <span className="nav-icon" aria-hidden="true">{NAV_ICONS[item.id]}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{item.label}</span>
                      <span className="block text-[10px] text-[#6b6f8a]">{item.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="sidebar-footer border-t border-[#23263d] p-3 text-[10px] leading-relaxed text-[#6b6f8a]">
          <div className="mb-1 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
            Processing stays on this Mac
          </div>
          Credentials are never included in reports.
        </div>
      </aside>

      <main className="app-main flex-1 overflow-auto p-6">
        <div className="content-frame">
        {error && (
          <div className="app-alert app-alert-danger mb-4 flex items-center justify-between gap-3 rounded-lg border border-[#7f1d1d] bg-[#3f1d1d]/50 px-4 py-3 text-sm text-[#fca5a5]">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-xs underline">Dismiss</button>
          </div>
        )}

        {page === 'dashboard' && (
          <Dashboard
            profiles={profiles}
            scans={scans}
            scanning={scanning}
            scanningSites={scanningSites}
            onScanBrowsers={() => void loadProfiles()}
            onScanSites={() => void scanSites()}
            onOpenBrowsers={() => setPage('browsers')}
            onOpenSites={() => setPage('websites')}
          />
        )}
        {page === 'browsers' && (
          <Browsers
            profiles={profiles}
            onInspect={inspectProfile}
            onSelectCustom={selectCustomProfile}
            onRefresh={() => void loadProfiles()}
            onOpenOriginInventory={() => setPage('websites')}
          />
        )}
        {page === 'websites' && (
          <WebsiteInventory scans={scans} scanning={scanningSites} onScan={() => void scanSites()} onMigrate={startFromOrigin} />
        )}
        {page === 'compatibility' && <Compatibility profiles={profiles} onMigrate={startFromMatrix} />}
        {page === 'migration' && (
          <WebsiteMigration profiles={profiles} preset={preset} onOpenHistory={() => setPage('history')} />
        )}
        {page === 'bundle' && (
          <SessionBundle profiles={profiles} onOpenHistory={() => setPage('history')} onRefreshProfiles={() => void loadProfiles()} />
        )}
        {page === 'history' && <History />}
        {page === 'settings' && <Settings />}
        </div>
      </main>
    </div>
  )
}
