import fs from 'fs/promises'
import { v4 as uuidv4 } from 'uuid'
import type { SessionMigrationResult, SiteImportRequest } from '../../../shared/types/session'
import type { DecryptedCookie, SourceSiteData } from '../../../core/session/types'
import { normalizeOrigin } from '../../../core/inspectors/chromium/origins'
import { parseBundle } from '../../../core/session/bundle'
import { migrateSiteData, type JobDependencies, type SupportedCategory } from './job'
import { assertAllowedDir } from '../../security/profile-registry'
import { isBrowserRunning } from '../../browser-discovery/running'

export async function runSiteImport(
  request: SiteImportRequest,
  deps: JobDependencies
): Promise<SessionMigrationResult> {
  const id = uuidv4()
  const startedAt = Date.now()
  const origin = normalizeOrigin(request.origin)
  const destProfileDir = await assertAllowedDir(request.destProfileDir)
  if (await isBrowserRunning(request.destBrowserId)) {
    throw new Error('Quit the destination browser before starting the import')
  }

  const raw = await fs.readFile(request.bundlePath, 'utf8')
  const bundle = parseBundle(raw)
  const bundleOrigin = normalizeOrigin(bundle.source.origin)
  if (bundleOrigin !== origin) {
    throw new Error(`The selected bundle contains ${bundleOrigin}, not ${origin}`)
  }

  const categories = request.categories.filter(
    (category): category is SupportedCategory =>
      category === 'cookies' || category === 'localStorage' || category === 'sessionStorage'
  )
  if (categories.length === 0) throw new Error('Select at least one supported data category')

  const cookies: DecryptedCookie[] = categories.includes('cookies')
    ? bundle.cookies.map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || '/',
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        expiresUnix: cookie.expiresUnix,
        session: cookie.session
      }))
    : []

  const data: SourceSiteData = {
    origin,
    cookies,
    localStorage: categories.includes('localStorage')
      ? bundle.localStorage.map((record) => ({ origin, key: record.key, value: record.value }))
      : [],
    sessionStorage: categories.includes('sessionStorage')
      ? bundle.sessionStorage.map((record) => ({ origin, key: record.key, value: record.value }))
      : [],
    skippedExpiredCookies: 0
  }

  const warnings = [
    'Imported from a JSON session bundle. The bundle contains cookies and other credentials in plain text; store and delete it carefully.',
    'The destination profile was backed up before any change.'
  ]

  return migrateSiteData({
    id,
    origin,
    startedAt,
    destBrowserId: request.destBrowserId,
    destProfileDir,
    categories,
    data,
    persistSessionCookies: request.persistSessionCookies,
    warnings,
    sourceBrowserId: bundle.source.browserId,
    deps
  })
}
