import React, { useEffect, useMemo, useState } from 'react'
import type { BrowserProfile } from '../../shared/types/browser'
import type {
  BundleSummary,
  MigrationProgress,
  OriginSummary,
  SessionMigrationResult
} from '../../shared/types/session'
import { Button, Card, Field, SectionTitle, Spinner, StatusPill, selectClass } from '../components/ui'

interface Props {
  profiles: BrowserProfile[]
  onOpenHistory: () => void
  onRefreshProfiles: () => void
}

type Category = 'cookies' | 'localStorage' | 'sessionStorage'

const SUPPORTED: Category[] = ['cookies', 'localStorage', 'sessionStorage']
const CATEGORY_LABELS: Record<string, string> = {
  cookies: 'Cookies',
  localStorage: 'Local Storage',
  sessionStorage: 'Session Storage'
}

export default function SessionBundle({ profiles, onOpenHistory, onRefreshProfiles }: Props) {
  const [sourceProfileDir, setSourceProfileDir] = useState(profiles[0]?.profileDir ?? '')
  const [origins, setOrigins] = useState<OriginSummary[]>([])
  const [loadingOrigins, setLoadingOrigins] = useState(false)
  const [origin, setOrigin] = useState('')
  const [exportCategories, setExportCategories] = useState<Category[]>(['cookies', 'localStorage', 'sessionStorage'])
  const [exporting, setExporting] = useState(false)
  const [exportPath, setExportPath] = useState<string | null>(null)
  const [exportWarnings, setExportWarnings] = useState<string[]>([])

  const [bundlePath, setBundlePath] = useState<string | null>(null)
  const [summary, setSummary] = useState<BundleSummary | null>(null)
  const [destProfileDir, setDestProfileDir] = useState('')
  const [importCategories, setImportCategories] = useState<Category[]>([])
  const [persistSessionCookies, setPersistSessionCookies] = useState(true)
  const [importing, setImporting] = useState(false)
  const [quitting, setQuitting] = useState(false)
  const [result, setResult] = useState<SessionMigrationResult | null>(null)
  const [progress, setProgress] = useState<MigrationProgress[]>([])
  const [error, setError] = useState<string | null>(null)

  const sourceProfile = profiles.find((profile) => profile.profileDir === sourceProfileDir)
  const destProfile = profiles.find((profile) => profile.profileDir === destProfileDir)

  const destinationProfiles = useMemo(
    () => profiles.filter((profile) => profile.profileDir !== sourceProfileDir),
    [profiles, sourceProfileDir]
  )

  useEffect(() => {
    if (!destProfileDir && destinationProfiles[0]) setDestProfileDir(destinationProfiles[0].profileDir)
  }, [destinationProfiles, destProfileDir])

  useEffect(() => {
    const unsubscribe = window.api.onMigrationProgress((event) => {
      setProgress((current) => [...current, event].slice(-200))
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!sourceProfile) {
        setOrigins([])
        return
      }
      setLoadingOrigins(true)
      try {
        const list = await window.api.listOrigins(sourceProfile.profileDir, sourceProfile.browserId)
        if (!cancelled) setOrigins(list.filter((entry) => /^https?:\/\//.test(entry.origin)))
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to list website origins')
      } finally {
        if (!cancelled) setLoadingOrigins(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [sourceProfile?.profileDir, sourceProfile?.browserId])

  function toggle(list: Category[], setList: (value: Category[]) => void, category: Category) {
    setList(list.includes(category) ? list.filter((entry) => entry !== category) : [...list, category])
  }

  async function exportBundle() {
    if (!sourceProfile || !origin) return
    setExporting(true)
    setError(null)
    setExportPath(null)
    setExportWarnings([])
    try {
      const outcome = await window.api.exportSiteBundle({
        sourceBrowserId: sourceProfile.browserId,
        sourceProfileDir: sourceProfile.profileDir,
        origin,
        categories: exportCategories
      })
      if (!outcome.canceled) {
        setExportPath(outcome.path ?? null)
        setExportWarnings(outcome.warnings ?? [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The export failed')
    } finally {
      setExporting(false)
    }
  }

  async function selectBundle() {
    setError(null)
    setResult(null)
    try {
      const selection = await window.api.selectSiteBundle()
      if (selection.canceled || !selection.summary) return
      setBundlePath(selection.path ?? null)
      setSummary(selection.summary)
      setImportCategories(
        selection.summary.categories.filter((category): category is Category =>
          SUPPORTED.includes(category as Category)
        )
      )
    } catch (err) {
      setSummary(null)
      setBundlePath(null)
      setError(err instanceof Error ? err.message : 'The bundle could not be read')
    }
  }

  async function quitDestination() {
    if (!destProfile) return
    setQuitting(true)
    try {
      await window.api.quitBrowser(destProfile.browserId)
      onRefreshProfiles()
    } finally {
      setQuitting(false)
    }
  }

  async function importBundle() {
    if (!summary || !bundlePath || !destProfile) return
    setImporting(true)
    setError(null)
    setResult(null)
    setProgress([])
    try {
      const importResult = await window.api.importSiteBundle({
        destBrowserId: destProfile.browserId,
        destProfileDir: destProfile.profileDir,
        origin: summary.origin,
        bundlePath,
        categories: importCategories,
        persistSessionCookies,
        confirmation: 'import-session-bundle'
      })
      setResult(importResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div>
      <SectionTitle
        title="Session Bundle (JSON)"
        subtitle="Export a website's cookies and storage to a portable JSON file, then import it into another browser profile."
      />

      <div className="mb-4 rounded-lg border border-[#7f1d1d] bg-[#3f1d1d]/40 px-4 py-3 text-xs text-[#fca5a5]">
        A session bundle contains cookies and other credentials in plain text. Store it securely and delete it when it is
        no longer needed. Exports include decrypted cookie values so the file can be imported anywhere.
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[#7f1d1d] bg-[#3f1d1d]/50 px-4 py-3 text-sm text-[#fca5a5]">{error}</div>
      )}

      <Card className="mb-4 p-4">
        <h2 className="mb-3 text-lg font-semibold">1. Export from a browser profile</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Field label="Source browser profile">
            <select
              className={selectClass}
              value={sourceProfileDir}
              onChange={(event) => {
                setSourceProfileDir(event.target.value)
                setOrigin('')
              }}
            >
              <option value="">Select a source profile</option>
              {profiles.map((profile) => (
                <option key={profile.profileDir} value={profile.profileDir}>
                  {profile.browserName} · {profile.profileName}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Website origin">
            <select
              className={selectClass}
              value={origin}
              onChange={(event) => setOrigin(event.target.value)}
              disabled={!sourceProfile || loadingOrigins}
            >
              <option value="">{loadingOrigins ? 'Loading origins...' : 'Select a website origin'}</option>
              {origins.map((entry) => (
                <option key={entry.origin} value={entry.origin}>
                  {entry.origin} · {entry.cookies} cookies · {entry.localStorage} LS · {entry.sessionStorage} SS
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-3">
          <div className="mb-1 text-xs text-[#8b90a8]">Categories to export</div>
          <div className="flex flex-wrap gap-4">
            {SUPPORTED.map((category) => (
              <label key={category} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#3b82f6]"
                  checked={exportCategories.includes(category)}
                  onChange={() => toggle(exportCategories, setExportCategories, category)}
                />
                {CATEGORY_LABELS[category]}
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button
            variant="primary"
            disabled={!sourceProfile || !origin || exportCategories.length === 0 || exporting}
            onClick={() => void exportBundle()}
          >
            {exporting ? 'Exporting...' : 'Export JSON bundle'}
          </Button>
          {exporting && <Spinner label="Decrypting and writing" />}
        </div>

        {exportPath && (
          <div className="mt-3 rounded-lg border border-[#2a2e4a] bg-[#0f1026] p-3 text-xs">
            <div className="font-medium text-[#22c55e]">Bundle exported</div>
            <div className="mt-1 break-all font-mono text-[#8b90a8]">{exportPath}</div>
            {exportWarnings.map((warning) => (
              <div key={warning} className="mt-1 text-[#fcd34d]">• {warning}</div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mb-4 p-4">
        <h2 className="mb-3 text-lg font-semibold">2. Import a bundle into a destination profile</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void selectBundle()}>Choose JSON bundle...</Button>
          {bundlePath && <span className="break-all font-mono text-xs text-[#8b90a8]">{bundlePath}</span>}
        </div>

        {summary && (
          <div className="mt-3 rounded-lg border border-[#2a2e4a] bg-[#0f1026] p-3 text-xs">
            <div className="font-medium">{summary.origin}</div>
            <div className="mt-1 text-[#8b90a8]">
              Source: {summary.sourceBrowserId} · exported {new Date(summary.generatedAt).toLocaleString()}
            </div>
            <div className="mt-1 text-[#a9adbf]">
              {summary.counts.cookies} cookie(s) · {summary.counts.localStorage} Local Storage ·{' '}
              {summary.counts.sessionStorage} Session Storage
            </div>
          </div>
        )}

        {summary && (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Field label="Destination browser profile">
              <select
                className={selectClass}
                value={destProfileDir}
                onChange={(event) => setDestProfileDir(event.target.value)}
              >
                <option value="">Select a destination profile</option>
                {destinationProfiles.map((profile) => (
                  <option key={profile.profileDir} value={profile.profileDir}>
                    {profile.browserName} · {profile.profileName}
                    {profile.running ? ' (running)' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex items-end">
              {destProfile?.running ? (
                <Button variant="primary" disabled={quitting} onClick={() => void quitDestination()} className="w-full">
                  {quitting ? 'Quitting...' : `Quit ${destProfile.browserName}`}
                </Button>
              ) : (
                <div className="text-xs text-[#8b90a8]">The destination must be fully quit before importing.</div>
              )}
            </div>
          </div>
        )}

        {summary && (
          <>
            <div className="mt-3">
              <div className="mb-1 text-xs text-[#8b90a8]">Categories to import</div>
              <div className="flex flex-wrap gap-4">
                {SUPPORTED.map((category) => {
                  const available =
                    (category === 'cookies' && summary.counts.cookies > 0) ||
                    (category === 'localStorage' && summary.counts.localStorage > 0) ||
                    (category === 'sessionStorage' && summary.counts.sessionStorage > 0)
                  return (
                    <label key={category} className={`flex items-center gap-2 text-sm ${available ? '' : 'opacity-40'}`}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[#3b82f6]"
                        disabled={!available}
                        checked={importCategories.includes(category)}
                        onChange={() => toggle(importCategories, setImportCategories, category)}
                      />
                      {CATEGORY_LABELS[category]}
                    </label>
                  )
                })}
              </div>
            </div>

            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={persistSessionCookies}
                onChange={(event) => setPersistSessionCookies(event.target.checked)}
                className="h-4 w-4 accent-[#3b82f6]"
              />
              Keep sign-in after restart (converts session-only cookies to 7-day persistent cookies)
            </label>

            <div className="mt-4">
              <Button
                variant="primary"
                disabled={!destProfile || destProfile.running || importCategories.length === 0 || importing}
                onClick={() => void importBundle()}
              >
                {importing ? 'Importing...' : 'Import into destination'}
              </Button>
            </div>
          </>
        )}
      </Card>

      {(importing || progress.length > 0) && !result && (
        <Card className="mb-4 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Progress</h2>
            {importing && <Spinner label="Working" />}
          </div>
          <div className="max-h-48 space-y-1 overflow-auto rounded-lg bg-[#0f1026] p-3 font-mono text-xs text-[#a9adbf]">
            {progress.map((entry, index) => (
              <div key={`${entry.stage}-${index}`}>
                <span className="text-[#6b6f8a]">[{entry.stage}]</span> {entry.message}
              </div>
            ))}
          </div>
        </Card>
      )}

      {result && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Import result</h2>
              <div className="text-xs text-[#8b90a8]">{result.origin}</div>
            </div>
            <StatusPill status={result.overall} />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
            {result.categories.map((category) => (
              <div key={category.category} className="rounded-lg border border-[#2a2e4a] bg-[#0f1026] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{CATEGORY_LABELS[category.category]}</span>
                  <StatusPill status={category.status} />
                </div>
                <div className="mt-1 text-xs text-[#8b90a8]">
                  {category.imported} imported · {category.failed} failed · verified {category.verified ? 'yes' : 'no'}
                </div>
                {category.reasons.length > 0 && (
                  <ul className="mt-1 space-y-1 text-xs text-[#a9adbf]">
                    {category.reasons.map((reason) => (
                      <li key={reason}>• {reason}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
          {result.backupPath && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2a2e4a] bg-[#0f1026] p-3 text-xs">
              <div>
                <div className="font-medium">Destination backup</div>
                <div className="break-all font-mono text-[#8b90a8]">{result.backupPath}</div>
              </div>
              <Button onClick={() => void window.api.revealPath(result.backupPath!)}>Reveal backup</Button>
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <Button onClick={onOpenHistory}>View migration history</Button>
            <Button variant="ghost" onClick={() => { setResult(null); setProgress([]) }}>
              Dismiss
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
