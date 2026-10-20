import React, { useEffect, useMemo, useState } from 'react'
import type { BrowserId, BrowserProfile } from '../../shared/types/browser'
import type {
  MigrationProgress,
  OriginSummary,
  SessionMigrationResult,
  SitePlan
} from '../../shared/types/session'
import {
  BrowserAvatar,
  Button,
  Card,
  EmptyState,
  Field,
  SectionTitle,
  Spinner,
  StatusPill,
  formatBytes,
  selectClass
} from '../components/ui'

export interface MigrationPreset {
  origin: string
  browserId: BrowserId
  profileDir: string
  destBrowserId?: BrowserId
}

interface Props {
  profiles: BrowserProfile[]
  preset?: MigrationPreset
  onOpenHistory: () => void
}

const CATEGORY_LABELS: Record<string, string> = {
  cookies: 'Cookies',
  localStorage: 'Local Storage',
  indexedDB: 'IndexedDB',
  sessionStorage: 'Session Storage'
}

export default function WebsiteMigration({ profiles, preset, onOpenHistory }: Props) {
  const [sourceProfileDir, setSourceProfileDir] = useState(preset?.profileDir ?? profiles[0]?.profileDir ?? '')
  const [destProfileDir, setDestProfileDir] = useState('')
  const [origin, setOrigin] = useState(preset?.origin ?? '')
  const [origins, setOrigins] = useState<OriginSummary[]>([])
  const [loadingOrigins, setLoadingOrigins] = useState(false)
  const [plan, setPlan] = useState<SitePlan | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [selectedCategories, setSelectedCategories] = useState<Array<'cookies' | 'localStorage'>>([])
  const [persistSessionCookies, setPersistSessionCookies] = useState(true)
  const [checking, setChecking] = useState(false)
  const [quitting, setQuitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<MigrationProgress[]>([])
  const [result, setResult] = useState<SessionMigrationResult | null>(null)
  const [fatalError, setFatalError] = useState<string | null>(null)

  const sourceProfile = profiles.find((profile) => profile.profileDir === sourceProfileDir)
  const destProfile = profiles.find((profile) => profile.profileDir === destProfileDir)

  const destinationProfiles = useMemo(() => {
    if (!sourceProfile) return profiles
    return profiles.filter((profile) => profile.profileDir !== sourceProfile.profileDir)
  }, [profiles, sourceProfile])

  useEffect(() => {
    if (preset) {
      setSourceProfileDir(preset.profileDir)
      setOrigin(preset.origin)
      if (preset.destBrowserId) {
        const candidate = profiles.find(
          (profile) => profile.browserId === preset.destBrowserId && profile.profileDir !== preset.profileDir
        )
        if (candidate) setDestProfileDir(candidate.profileDir)
      }
      return
    }
    if (!sourceProfileDir && profiles[0]) setSourceProfileDir(profiles[0].profileDir)
  }, [preset, profiles])

  useEffect(() => {
    if (!destProfileDir && destinationProfiles[0]) setDestProfileDir(destinationProfiles[0].profileDir)
    if (destProfileDir && !destinationProfiles.some((profile) => profile.profileDir === destProfileDir)) {
      setDestProfileDir(destinationProfiles[0]?.profileDir ?? '')
    }
  }, [destinationProfiles, destProfileDir])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!sourceProfile) {
        setOrigins([])
        return
      }
      setLoadingOrigins(true)
      setPlan(null)
      try {
        const list = await window.api.listOrigins(sourceProfile.profileDir, sourceProfile.browserId)
        if (cancelled) return
        setOrigins(list)
        if (preset?.origin && list.some((entry) => entry.origin === preset.origin)) {
          setOrigin(preset.origin)
        } else if (origin && !list.some((entry) => entry.origin === origin)) {
          setOrigin('')
        }
      } catch (error) {
        if (!cancelled) setPlanError(error instanceof Error ? error.message : 'Unable to list website origins')
      } finally {
        if (!cancelled) setLoadingOrigins(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [sourceProfile?.profileDir, sourceProfile?.browserId])

  useEffect(() => {
    const unsubscribe = window.api.onMigrationProgress((event) => {
      setProgress((current) => [...current, event].slice(-200))
    })
    return unsubscribe
  }, [])

  function resetPlan() {
    setPlan(null)
    setPlanError(null)
    setSelectedCategories([])
    setResult(null)
  }

  async function checkCompatibility() {
    if (!sourceProfile || !destProfile || !origin) return
    setChecking(true)
    setPlanError(null)
    setResult(null)
    try {
      const nextPlan = await window.api.getSitePlan(
        sourceProfile.browserId,
        sourceProfile.profileDir,
        destProfile.browserId,
        destProfile.profileDir,
        origin
      )
      setPlan(nextPlan)
      setSelectedCategories(
        nextPlan.categories
          .filter((category) => (category.category === 'cookies' || category.category === 'localStorage') && category.migratable)
          .map((category) => category.category as 'cookies' | 'localStorage')
      )
    } catch (error) {
      setPlan(null)
      setPlanError(error instanceof Error ? error.message : 'Unable to compute compatibility')
    } finally {
      setChecking(false)
    }
  }

  async function quitDestination() {
    if (!destProfile) return
    setQuitting(true)
    try {
      await window.api.quitBrowser(destProfile.browserId)
      await checkCompatibility()
    } finally {
      setQuitting(false)
    }
  }

  function toggleCategory(category: 'cookies' | 'localStorage') {
    setSelectedCategories((current) =>
      current.includes(category) ? current.filter((entry) => entry !== category) : [...current, category]
    )
  }

  async function startMigration() {
    if (!sourceProfile || !destProfile || !origin || !plan) return
    setConfirmOpen(false)
    setRunning(true)
    setFatalError(null)
    setResult(null)
    setProgress([])
    try {
      const migrationResult = await window.api.startSiteMigration({
        sourceBrowserId: sourceProfile.browserId,
        sourceProfileDir: sourceProfile.profileDir,
        destBrowserId: destProfile.browserId,
        destProfileDir: destProfile.profileDir,
        origin,
        categories: selectedCategories,
        persistSessionCookies,
        confirmation: 'migrate-website-session'
      })
      setResult(migrationResult)
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : 'The migration failed')
    } finally {
      setRunning(false)
      setAcknowledged(false)
    }
  }

  const selectedOrigin = origins.find((entry) => entry.origin === origin)

  return (
    <div>
      <SectionTitle
        title="Website Migration"
        subtitle="Move one website's cookies and Local Storage session into another Chromium-based browser profile."
      />

      <div className="mb-4 rounded-lg border border-[#3b2f63] bg-[#241b3f]/50 px-4 py-3 text-xs text-[#c4b5fd]">
        Cookies are authentication credentials. Values are decrypted only after macOS Keychain authorisation, are held
        in memory, and are never written to logs, reports, or the renderer. A backup of affected destination data is
        created before any change.
      </div>

      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Field label="Source browser profile">
            <select
              className={selectClass}
              value={sourceProfileDir}
              onChange={(event) => {
                setSourceProfileDir(event.target.value)
                setOrigin('')
                resetPlan()
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
              onChange={(event) => {
                setOrigin(event.target.value)
                resetPlan()
              }}
              disabled={!sourceProfile || loadingOrigins}
            >
              <option value="">{loadingOrigins ? 'Loading origins...' : 'Select a website origin'}</option>
              {origins.filter((entry) => /^https?:\/\//.test(entry.origin)).map((entry) => (
                <option key={entry.origin} value={entry.origin}>
                  {entry.origin} · {entry.cookies} cookies · {entry.localStorage} LS
                </option>
              ))}
            </select>
          </Field>

          <Field label="Destination browser profile">
            <select
              className={selectClass}
              value={destProfileDir}
              onChange={(event) => {
                setDestProfileDir(event.target.value)
                resetPlan()
              }}
            >
              <option value="">Select a destination profile</option>
              {destinationProfiles.map((profile) => (
                <option key={profile.profileDir} value={profile.profileDir}>
                  {profile.browserName} · {profile.profileName}
                  {profile.running ? ' (running)' : ''}
                </option>
              ))}
            </select>
            {destProfile?.running && (
              <div className="mt-1 text-xs text-[#fcd34d]">
                {destProfile.browserName} is running. Quit it before starting the migration.
              </div>
            )}
          </Field>

          <div className="flex items-end">
            <Button
              variant="primary"
              onClick={() => void checkCompatibility()}
              disabled={!sourceProfile || !destProfile || !origin || checking}
              className="w-full"
            >
              {checking ? 'Checking...' : 'Check compatibility'}
            </Button>
          </div>
        </div>

        {loadingOrigins && <div className="mt-3"><Spinner label="Reading website storage..." /></div>}
        {selectedOrigin && (
          <div className="mt-3 text-xs text-[#8b90a8]">
            Detected for {selectedOrigin.origin}: {selectedOrigin.cookies} cookie record(s), {selectedOrigin.localStorage} Local
            Storage key(s), {selectedOrigin.indexedDB} IndexedDB database(s), {selectedOrigin.sessionStorage} Session Storage
            key(s), approximately {formatBytes(selectedOrigin.estimatedSizeBytes)}.
          </div>
        )}
        {sourceProfile && origins.length === 0 && !loadingOrigins && (
          <div className="mt-3 text-xs text-[#8b90a8]">
            No website storage origins were found in this profile. Browsing history alone does not count as stored website
            data.
          </div>
        )}
      </Card>

      {planError && (
        <div className="mb-4 rounded-lg border border-[#7f1d1d] bg-[#3f1d1d]/50 px-4 py-3 text-sm text-[#fca5a5]">{planError}</div>
      )}

      {plan && (
        <Card className="mb-4 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">{plan.origin}</h2>
              <div className="text-xs text-[#8b90a8]">
                {sourceProfile?.browserName} → {destProfile?.browserName}
                {plan.destinationRunning ? ' · destination browser is running' : ''}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill status={plan.canMigrate ? 'Supported' : plan.destinationRunning ? 'Blocked' : 'Unsupported'} />
              <span className="text-xs text-[#8b90a8]">{plan.canMigrate ? 'Ready for confirmation' : plan.destinationRunning ? 'Quit the destination to continue' : 'Blocked'}</span>
            </div>
          </div>

          {plan.destinationRunning && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#854d0e] bg-[#422006]/40 px-3 py-2 text-xs text-[#fcd34d]">
              <span>
                {destProfile?.browserName} is running. It must be fully quit before cookies and Local Storage can be
                written, then compatibility is re-checked automatically.
              </span>
              <Button variant="primary" disabled={quitting} onClick={() => void quitDestination()}>
                {quitting ? 'Quitting...' : `Quit ${destProfile?.browserName}`}
              </Button>
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-[#2a2e4a]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0f1026] text-xs uppercase tracking-wide text-[#8b90a8]">
                <tr>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Detected</th>
                  <th className="px-3 py-2">Records</th>
                  <th className="px-3 py-2">Destination import</th>
                  <th className="px-3 py-2">Select</th>
                  <th className="px-3 py-2">Limitations</th>
                </tr>
              </thead>
              <tbody>
                {plan.categories.map((category) => {
                  const selectable = category.category === 'cookies' || category.category === 'localStorage'
                  return (
                    <tr key={category.category} className="border-t border-[#23263d]">
                      <td className="px-3 py-2 font-medium">{CATEGORY_LABELS[category.category]}</td>
                      <td className="px-3 py-2">{category.detected ? 'Yes' : 'No'}</td>
                      <td className="px-3 py-2 text-[#a9adbf]">{category.records}</td>
                      <td className="px-3 py-2">
                        <StatusPill status={category.status} />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          disabled={!selectable || !category.migratable}
                          checked={selectedCategories.includes(category.category as 'cookies' | 'localStorage')}
                          onChange={() => toggleCategory(category.category as 'cookies' | 'localStorage')}
                          className="h-4 w-4 accent-[#3b82f6]"
                        />
                      </td>
                      <td className="px-3 py-2 text-xs text-[#8b90a8]">
                        {category.reasons.length ? category.reasons.join(' ') : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {plan.warnings.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-[#fcd34d]">
              {plan.warnings.map((warning) => (
                <li key={warning}>• {warning}</li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={persistSessionCookies}
                onChange={(event) => setPersistSessionCookies(event.target.checked)}
                className="h-4 w-4 accent-[#3b82f6]"
              />
              Keep sign-in after restart (converts session-only cookies to 7-day persistent cookies)
            </label>
            <Button
              variant="primary"
              disabled={
                !plan.canMigrate ||
                plan.destinationRunning ||
                selectedCategories.length === 0 ||
                running
              }
              onClick={() => {
                setAcknowledged(false)
                setConfirmOpen(true)
              }}
            >
              {running ? 'Migration running...' : 'Start migration'}
            </Button>
          </div>
          {sourceProfile?.running && (
            <div className="mt-2 text-xs text-[#fcd34d]">
              The source browser is running. The source is read through temporary snapshots and will not be modified.
            </div>
          )}
        </Card>
      )}

      {(running || progress.length > 0) && !result && (
        <Card className="mb-4 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Progress</h2>
            {running && <Spinner label="Working" />}
          </div>
          <div className="max-h-48 space-y-1 overflow-auto rounded-lg bg-[#0f1026] p-3 font-mono text-xs text-[#a9adbf]">
            {progress.length === 0 && <div>Waiting for the migration job...</div>}
            {progress.map((entry, index) => (
              <div key={`${entry.stage}-${index}`}>
                <span className="text-[#6b6f8a]">[{entry.stage}]</span> {entry.message}
                {typeof entry.current === 'number' && typeof entry.total === 'number' && entry.total > 0
                  ? ` (${entry.current}/${entry.total})`
                  : ''}
              </div>
            ))}
          </div>
        </Card>
      )}

      {fatalError && (
        <div className="mb-4 rounded-lg border border-[#7f1d1d] bg-[#3f1d1d]/50 px-4 py-3 text-sm text-[#fca5a5]">
          {fatalError}
        </div>
      )}

      {result && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Migration result</h2>
              <div className="text-xs text-[#8b90a8]">{result.origin}</div>
            </div>
            <StatusPill status={result.overall} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
            {result.categories.map((category) => (
              <div key={category.category} className="rounded-lg border border-[#2a2e4a] bg-[#0f1026] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{CATEGORY_LABELS[category.category]}</span>
                  <StatusPill status={category.status} />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <div className="text-base font-semibold">{category.imported}</div>
                    <div className="text-[#6b6f8a]">imported</div>
                  </div>
                  <div>
                    <div className="text-base font-semibold">{category.skipped}</div>
                    <div className="text-[#6b6f8a]">skipped</div>
                  </div>
                  <div>
                    <div className="text-base font-semibold">{category.failed}</div>
                    <div className="text-[#6b6f8a]">failed</div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-[#8b90a8]">Verified: {category.verified ? 'Yes' : 'No'}</div>
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

          <div className="mt-4 rounded-lg border border-[#2a2e4a] bg-[#0f1026] p-3 text-xs">
            <div className="font-medium">Verification</div>
            <div className="mt-1 text-[#8b90a8]">
              Cookies: {result.verification.cookiesMatched}/{result.verification.cookiesChecked} matched · Local Storage:{' '}
              {result.verification.localStorageMatched}/{result.verification.localStorageChecked} matched
            </div>
            {result.verification.details.map((detail) => (
              <div key={detail} className="mt-1 text-[#a9adbf]">• {detail}</div>
            ))}
          </div>

          {result.backupPath && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2a2e4a] bg-[#0f1026] p-3 text-xs">
              <div>
                <div className="font-medium">Destination backup</div>
                <div className="font-mono text-[#8b90a8]">{result.backupPath}</div>
              </div>
              <Button onClick={() => void window.api.revealPath(result.backupPath!)}>Reveal backup</Button>
            </div>
          )}

          <div className="mt-3 text-xs text-[#8b90a8]">
            <div className="font-medium text-[#e7e9ee]">Not migrated</div>
            <ul className="mt-1 space-y-1">
              {result.limitations.map((limitation) => (
                <li key={limitation}>• {limitation}</li>
              ))}
            </ul>
          </div>

          <div className="mt-4 flex gap-2">
            <Button onClick={onOpenHistory}>View migration history</Button>
            <Button variant="ghost" onClick={() => { setResult(null); setProgress([]) }}>
              Dismiss
            </Button>
          </div>
        </Card>
      )}

      {confirmOpen && plan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded-xl border border-[#2a2e4a] bg-[#15182a] p-5 shadow-2xl">
            <h2 className="text-lg font-semibold">Confirm website session migration</h2>
            <p className="mt-1 text-sm text-[#8b90a8]">
              This changes the destination browser profile. A backup of affected destination data is created first.
            </p>
            <div className="mt-3 space-y-2 rounded-lg bg-[#0f1026] p-3 text-xs">
              <div><span className="text-[#6b6f8a]">Website:</span> {plan.origin}</div>
              <div><span className="text-[#6b6f8a]">Source:</span> <span className="font-mono">{sourceProfile?.profileDir}</span></div>
              <div><span className="text-[#6b6f8a]">Destination:</span> <span className="font-mono">{destProfile?.profileDir}</span></div>
              <div><span className="text-[#6b6f8a]">Categories:</span> {selectedCategories.map((category) => CATEGORY_LABELS[category]).join(', ')}</div>
              <div><span className="text-[#6b6f8a]">Session cookies:</span> {persistSessionCookies ? 'converted to 7-day persistent cookies' : 'left session-only'}</div>
            </div>
            <div className="mt-3 rounded-lg border border-[#854d0e] bg-[#422006]/40 p-3 text-xs text-[#fcd34d]">
              Cookies are credentials. The selected macOS Keychain item may prompt for authorisation. The destination
              browser will be launched and then closed. Quit it first if it is running.
            </div>
            <label className="mt-4 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#3b82f6]"
              />
              I understand that cookies grant account access, that a destination backup will be created, and that only
              the selected categories and website are migrated.
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
              <Button variant="primary" disabled={!acknowledged || running} onClick={() => void startMigration()}>
                Confirm and migrate
              </Button>
            </div>
          </div>
        </div>
      )}

      {profiles.length === 0 && (
        <EmptyState title="No browser profiles detected" description="Scan browsers before planning a website migration." />
      )}
    </div>
  )
}
