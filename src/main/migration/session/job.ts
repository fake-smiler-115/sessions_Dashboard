import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import type {
  SiteMigrationRequest,
  SessionMigrationResult,
  CategoryMigrationResult,
  MigrationProgress,
  StoredJob
} from '../../../shared/types/session'
import type { BrowserId } from '../../../shared/types/browser'
import type { SessionWriter, SourceSiteData, WriteResult, DecryptedCookie } from '../../../core/session/types'
import { normalizeOrigin } from '../../../core/inspectors/chromium/origins'
import { readCookieRows } from '../../../core/inspectors/chromium/cookies'
import { resolveChromiumPaths } from '../../../core/inspectors/chromium/paths'
import { loadSourceSiteData } from './source'
import { computeSitePlan } from './plan-service'
import { CdpSessionWriter } from './writer'
import { backupDestinationData } from './backup'
import { appendJob } from './jobs-store'
import { assertAllowedDir } from '../../security/profile-registry'
import { isBrowserRunning } from '../../browser-discovery/running'

export interface JobDependencies {
  userDataDir: string
  backupRoot: string
  onProgress: (progress: MigrationProgress) => void
}

export type SupportedCategory = 'cookies' | 'localStorage' | 'sessionStorage'

const LIMITATIONS = [
  'Only cookies, Local Storage, and Session Storage for the selected origin are migrated.',
  'Modern Chromium blocks remote debugging on default profiles, so the destination is written through a temporary staged profile and the affected cookies, Local Storage, and Session Storage are merged back.',
  'IndexedDB, Cache Storage, service workers, extensions, and browser settings are not migrated.',
  'Session Storage is tab- and session-scoped. It is written into the destination tab and persisted for session restore, but it will not appear in a brand-new tab.',
  'Destinations are written through a local Chromium automation interface, not by copying profile files.',
  'Cookie values are held in memory only and are never written to reports or logs.'
]

function emptyWrite(): WriteResult {
  return { imported: 0, skipped: 0, failed: 0, verified: 0, reasons: [] }
}

export async function runSiteMigration(
  request: SiteMigrationRequest,
  deps: JobDependencies
): Promise<SessionMigrationResult> {
  const id = uuidv4()
  const startedAt = Date.now()
  const origin = normalizeOrigin(request.origin)
  const sourceProfileDir = await assertAllowedDir(request.sourceProfileDir)
  const destProfileDir = await assertAllowedDir(request.destProfileDir)
  const emit = (stage: MigrationProgress['stage'], message: string, current?: number, total?: number) =>
    deps.onProgress({ jobId: id, stage, message, current, total })

  const plan = await computeSitePlan({
    sourceBrowserId: request.sourceBrowserId,
    sourceProfileDir,
    destBrowserId: request.destBrowserId,
    destProfileDir,
    origin
  })

  const selected = request.categories.filter(
    (category): category is SupportedCategory =>
      category === 'cookies' || category === 'localStorage' || category === 'sessionStorage'
  )
  if (selected.length === 0) throw new Error('Select at least one supported data category')
  if (!plan.canMigrate) {
    const blocked = plan.categories.find((category) => category.detected && !category.migratable && category.reasons.length > 0)
    const reason = blocked?.reasons[0] ?? plan.warnings[0] ?? 'No supported migration method is available for this selection'
    throw new Error(reason)
  }
  const unmigratableSelection = selected.filter((category) => {
    const planned = plan.categories.find((entry) => entry.category === category)
    return planned?.detected && !planned.migratable
  })
  if (unmigratableSelection.length > 0) {
    throw new Error(`The selected categories cannot be migrated: ${unmigratableSelection.join(', ')}`)
  }
  if (await isBrowserRunning(request.destBrowserId)) {
    throw new Error('Quit the destination browser before starting the migration')
  }

  let data: SourceSiteData
  try {
    data = await loadSourceSiteData(request.sourceBrowserId, sourceProfileDir, origin)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to read source session data'
    return finalize(
      id,
      origin,
      startedAt,
      selected.map((category) => ({
        category,
        status: 'failed' as const,
        detected: false,
        imported: 0,
        skipped: 0,
        failed: 0,
        verified: false,
        reasons: [message]
      })),
      undefined,
      undefined,
      plan.warnings,
      'failed',
      deps,
      { sourceBrowserId: request.sourceBrowserId, destBrowserId: request.destBrowserId }
    )
  }

  return migrateSiteData({
    id,
    origin,
    startedAt,
    destBrowserId: request.destBrowserId,
    destProfileDir,
    categories: selected,
    data,
    persistSessionCookies: request.persistSessionCookies,
    warnings: plan.warnings,
    sourceBrowserId: request.sourceBrowserId,
    deps
  })
}

export interface MigrateSiteDataInput {
  id: string
  origin: string
  startedAt: number
  destBrowserId: BrowserId
  destProfileDir: string
  categories: SupportedCategory[]
  data: SourceSiteData
  persistSessionCookies: boolean
  warnings: string[]
  sourceBrowserId: BrowserId
  deps: JobDependencies
}

export async function migrateSiteData(input: MigrateSiteDataInput): Promise<SessionMigrationResult> {
  const { id, origin, startedAt, deps } = input
  const selected = input.categories
  const emit = (stage: MigrationProgress['stage'], message: string, current?: number, total?: number) =>
    deps.onProgress({ jobId: id, stage, message, current, total })

  const categories: CategoryMigrationResult[] = []
  const backup = await backupDestinationData(input.destProfileDir, origin, deps.backupRoot)
  emit('backup', 'Destination data backed up', 1, 1)

  const data = input.data
  const cookieItems = selected.includes('cookies') ? data.cookies : []
  const localStorageItems = selected.includes('localStorage') ? data.localStorage : []
  const sessionStorageItems = selected.includes('sessionStorage') ? data.sessionStorage : []
  const categoryError = (category: string): string | undefined =>
    category === 'cookies' ? data.cookieError : category === 'localStorage' ? data.localStorageError : data.sessionStorageError
  const categoryLabel = (category: string): string =>
    category === 'cookies' ? 'cookies' : category === 'localStorage' ? 'Local Storage records' : 'Session Storage records'
  if (cookieItems.length === 0 && localStorageItems.length === 0 && sessionStorageItems.length === 0) {
    for (const category of selected) {
      const error = categoryError(category)
      categories.push({
        category,
        status: error ? 'failed' : 'skipped',
        detected: false,
        imported: 0,
        skipped: 0,
        failed: 0,
        verified: false,
        reasons: [error ?? `No ${categoryLabel(category)} were detected for this origin.`]
      })
    }
    return finalize(
      id,
      origin,
      startedAt,
      categories,
      backup.backupPath,
      backup.manifestPath,
      input.warnings,
      'failed',
      deps,
      { sourceBrowserId: input.sourceBrowserId, destBrowserId: input.destBrowserId }
    )
  }

  let writer: SessionWriter | undefined
  const verification: SessionMigrationResult['verification'] = {
    ok: false,
    cookiesChecked: 0,
    cookiesMatched: 0,
    localStorageChecked: 0,
    localStorageMatched: 0,
    sessionStorageChecked: 0,
    sessionStorageMatched: 0,
    details: []
  }

  try {
    emit('launch', 'Launching the destination browser')
    writer = await CdpSessionWriter.open(input.destBrowserId, input.destProfileDir, origin)
    emit('launch', 'Destination browser ready', 1, 1)
    if (writer.staged) {
      emit('launch', 'Modern Chromium blocks remote debugging on default profiles; using a staged destination profile')
    }

    let cookieWrite = emptyWrite()
    if (selected.includes('cookies')) {
      if (data.cookieError) {
        categories.push({
          category: 'cookies',
          status: 'failed',
          detected: true,
          imported: 0,
          skipped: 0,
          failed: data.cookies.length,
          verified: false,
          reasons: [data.cookieError]
        })
      } else if (cookieItems.length === 0) {
        categories.push({
          category: 'cookies',
          status: data.undecryptableCookies ? 'failed' : 'skipped',
          detected: (data.cookieCountBeforeRead ?? 0) > 0,
          imported: 0,
          skipped: 0,
          failed: data.undecryptableCookies ?? 0,
          verified: false,
          reasons: [data.cookieWarning ?? 'No readable cookies were detected for this origin.']
        })
      } else {
        emit('cookies', `Importing ${cookieItems.length} cookie record(s)`, 0, cookieItems.length)
        cookieWrite = await writer.writeCookies(cookieItems, {
          persistSessionCookies: input.persistSessionCookies
        })
        emit('cookies', 'Cookie import completed', cookieItems.length, cookieItems.length)
        const cookieVerify = await writer.verifyCookies(cookieItems)
        verification.cookiesChecked = cookieVerify.checked
        verification.cookiesMatched = cookieVerify.matched
        verification.details.push(...cookieVerify.details)
        const verified = cookieVerify.checked > 0 && cookieVerify.matched === cookieVerify.checked
        const cookieFailures = cookieWrite.failed + (data.undecryptableCookies ?? 0)
        categories.push({
          category: 'cookies',
          status:
            cookieWrite.imported > 0
              ? verified && cookieFailures === 0
                ? 'migrated'
                : 'partially-migrated'
              : 'failed',
          detected: true,
          imported: cookieWrite.imported,
          skipped: cookieWrite.skipped + data.skippedExpiredCookies + (data.skippedPartitionedCookies ?? 0),
          failed: cookieFailures,
          verified,
          reasons: [
            ...cookieWrite.reasons,
            ...(data.cookieWarning ? [data.cookieWarning] : []),
            ...cookieVerify.details,
            ...(data.skippedExpiredCookies > 0 ? [`${data.skippedExpiredCookies} expired cookie(s) were skipped.`] : []),
            ...(data.skippedPartitionedCookies
              ? [`${data.skippedPartitionedCookies} partitioned (CHIPS) cookie(s) were skipped because partition keys are not migrated.`]
              : [])
          ]
        })
      }
    }

    if (selected.includes('localStorage')) {
      if (data.localStorageError) {
        categories.push({
          category: 'localStorage',
          status: 'failed',
          detected: true,
          imported: 0,
          skipped: 0,
          failed: data.localStorage.length,
          verified: false,
          reasons: [data.localStorageError]
        })
      } else if (localStorageItems.length === 0) {
        categories.push({
          category: 'localStorage',
          status: 'skipped',
          detected: false,
          imported: 0,
          skipped: 0,
          failed: 0,
          verified: false,
          reasons: ['No Local Storage records were detected for this exact origin.']
        })
      } else {
        emit('localStorage', `Importing ${localStorageItems.length} Local Storage record(s)`, 0, localStorageItems.length)
        const lsWrite = await writer.writeLocalStorage(origin, localStorageItems)
        emit('localStorage', 'Local Storage import completed', localStorageItems.length, localStorageItems.length)
        const lsVerify = await writer.verifyLocalStorage(origin, localStorageItems)
        verification.localStorageChecked = lsVerify.checked
        verification.localStorageMatched = lsVerify.matched
        verification.details.push(...lsVerify.details)
        const verified = lsVerify.checked > 0 && lsVerify.matched === lsVerify.checked
        categories.push({
          category: 'localStorage',
          status:
            lsWrite.imported > 0
              ? verified && lsWrite.failed === 0
                ? 'migrated'
                : 'partially-migrated'
              : 'failed',
          detected: true,
          imported: lsWrite.imported,
          skipped: lsWrite.skipped,
          failed: lsWrite.failed,
          verified,
          reasons: [...lsWrite.reasons, ...lsVerify.details]
        })
      }
    }

    if (selected.includes('sessionStorage')) {
      if (data.sessionStorageError) {
        categories.push({
          category: 'sessionStorage',
          status: 'failed',
          detected: true,
          imported: 0,
          skipped: 0,
          failed: data.sessionStorage.length,
          verified: false,
          reasons: [data.sessionStorageError]
        })
      } else if (sessionStorageItems.length === 0) {
        categories.push({
          category: 'sessionStorage',
          status: 'skipped',
          detected: false,
          imported: 0,
          skipped: 0,
          failed: 0,
          verified: false,
          reasons: ['No Session Storage records were detected for this exact origin.']
        })
      } else {
        emit('sessionStorage', `Importing ${sessionStorageItems.length} Session Storage record(s)`, 0, sessionStorageItems.length)
        const ssWrite = await writer.writeSessionStorage(origin, sessionStorageItems)
        emit('sessionStorage', 'Session Storage import completed', sessionStorageItems.length, sessionStorageItems.length)
        const ssVerify = await writer.verifySessionStorage(origin, sessionStorageItems)
        verification.sessionStorageChecked = ssVerify.checked
        verification.sessionStorageMatched = ssVerify.matched
        verification.details.push(...ssVerify.details)
        const verified = ssVerify.checked > 0 && ssVerify.matched === ssVerify.checked
        categories.push({
          category: 'sessionStorage',
          status: ssWrite.imported > 0 ? 'partially-migrated' : 'failed',
          detected: true,
          imported: ssWrite.imported,
          skipped: ssWrite.skipped,
          failed: ssWrite.failed,
          verified,
          reasons: [
            ...ssWrite.reasons,
            ...ssVerify.details,
            'Session Storage is tab- and session-scoped: it was written into the destination tab and persisted for session restore, but it will not appear in a brand-new tab.'
          ]
        })
      }
    }

    emit('verify', 'Verifying destination data')
    const categoryOk = categories.every(
      (category) => category.status === 'migrated' && category.verified && category.failed === 0
    )
    verification.ok = categoryOk
    if (!categoryOk) verification.details.push('One or more categories did not fully verify.')

    if (selected.includes('cookies') && !input.persistSessionCookies && cookieItems.some((cookie) => cookie.session)) {
      verification.details.push('Session-only cookies were imported without an expiry and may be removed when the destination browser closes.')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The migration could not be completed'
    for (const category of selected) {
      if (!categories.some((entry) => entry.category === category)) {
        categories.push({
          category,
          status: 'failed',
          detected: false,
          imported: 0,
          skipped: 0,
          failed: 0,
          verified: false,
          reasons: [message]
        })
      }
    }
  } finally {
    if (writer) {
      emit('close', 'Closing the destination browser')
      try {
        await writer.close()
      } catch (error) {
        verification.details.push(error instanceof Error ? error.message : 'The staged destination merge failed.')
        verification.ok = false
      }
      if (writer.mergeDetails && writer.mergeDetails.length > 0) verification.details.push(...writer.mergeDetails)
    }
  }

  await verifyCookiePersistence(input.destProfileDir, origin, cookieItems, verification, categories)

  const overall = computeOverall(categories)
  return finalize(
    id,
    origin,
    startedAt,
    categories,
    backup.backupPath,
    backup.manifestPath,
    [...input.warnings, ...verification.details],
    overall,
    deps,
    { sourceBrowserId: input.sourceBrowserId, destBrowserId: input.destBrowserId },
    verification
  )
}

async function verifyCookiePersistence(
  destProfileDir: string,
  origin: string,
  cookies: DecryptedCookie[],
  verification: SessionMigrationResult['verification'],
  categories: CategoryMigrationResult[]
): Promise<void> {
  if (cookies.length === 0) return
  const category = categories.find((entry) => entry.category === 'cookies')
  if (!category) return
  await new Promise((resolve) => setTimeout(resolve, 500))
  try {
    const paths = await resolveChromiumPaths(destProfileDir)
    if (!paths.cookiesDb) {
      verification.details.push('The destination cookie database was not found for a persistence check.')
      return
    }
    const rows = await readCookieRows(paths.cookiesDb)
    const persisted = new Set(rows.map((row) => `${row.name}\u0000${row.hostKey}\u0000${row.path}`))
    let found = 0
    for (const cookie of cookies) {
      const key = `${cookie.name}\u0000${cookie.domain}\u0000${cookie.path || '/'}`
      if (persisted.has(key)) found += 1
    }
    if (found < cookies.length) {
      verification.details.push(`${cookies.length - found} cookie(s) were not present in the destination database after the browser closed.`)
      if (category.status === 'migrated') category.status = 'partially-migrated'
      category.verified = false
      category.reasons.push('Some cookies did not persist after the destination browser closed.')
      verification.ok = false
    } else {
      verification.details.push(`${found} cookie record(s) confirmed in the destination database after the browser closed.`)
    }
  } catch {
    verification.details.push('The destination database persistence check could not be completed.')
  }
}

function computeOverall(categories: CategoryMigrationResult[]): SessionMigrationResult['overall'] {
  if (categories.length === 0) return 'failed'
  if (categories.every((category) => category.status === 'migrated' && category.verified)) return 'success'
  if (categories.some((category) => category.imported > 0)) return 'partial'
  return 'failed'
}

interface JobMeta {
  sourceBrowserId: BrowserId
  destBrowserId: BrowserId
}

async function finalize(
  id: string,
  origin: string,
  startedAt: number,
  categories: CategoryMigrationResult[],
  backupPath: string | undefined,
  backupManifestPath: string | undefined,
  warnings: string[],
  overall: SessionMigrationResult['overall'],
  deps: JobDependencies,
  meta: JobMeta,
  verification?: SessionMigrationResult['verification']
): Promise<SessionMigrationResult> {
  const finishedAt = Date.now()
  const resolvedVerification = verification ?? {
    ok: false,
    cookiesChecked: 0,
    cookiesMatched: 0,
    localStorageChecked: 0,
    localStorageMatched: 0,
    sessionStorageChecked: 0,
    sessionStorageMatched: 0,
    details: []
  }
  const result: SessionMigrationResult = {
    id,
    origin,
    startedAt,
    finishedAt,
    categories,
    verification: resolvedVerification,
    backupPath,
    backupManifestPath,
    warnings: [...new Set(warnings)],
    limitations: LIMITATIONS,
    overall
  }
  deps.onProgress({ jobId: id, stage: 'done', message: 'Migration finished' })

  const job: StoredJob = {
    id,
    origin,
    sourceBrowserId: meta.sourceBrowserId,
    destBrowserId: meta.destBrowserId,
    startedAt,
    finishedAt,
    overall,
    backupPath,
    result
  }
  await appendJob(deps.userDataDir, job).catch(() => undefined)
  return result
}
