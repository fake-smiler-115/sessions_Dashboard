import type { BrowserId } from '../../../shared/types/browser'
import type { OriginSummary, SitePlan } from '../../../shared/types/session'
import { inspectProfileStorage, normalizeOrigin } from '../../../core/inspectors/chromium/origins'
import { buildSitePlan } from '../../../core/session/plan'
import { getSessionCapabilities } from '../../../core/session/capabilities'
import { BROWSER_EXECUTABLES, pathExists } from '../../browser-discovery/executables'
import { isBrowserRunning } from '../../browser-discovery/running'
import { hasKeychainItem } from '../../security/keychain'
import path from 'path'

export async function computeSitePlan(input: {
  sourceBrowserId: BrowserId
  sourceProfileDir: string
  destBrowserId: BrowserId
  destProfileDir: string
  origin: string
}): Promise<SitePlan> {
  const origin = normalizeOrigin(input.origin)
  const host = new URL(origin).hostname
  const sourceProfileDir = path.resolve(input.sourceProfileDir)
  const destProfileDir = path.resolve(input.destProfileDir)
  const sourceBrowserId = input.sourceBrowserId
  const destBrowserId = input.destBrowserId
  const sameProfile = sourceProfileDir === destProfileDir

  const sourceInspection = await inspectProfileStorage(sourceProfileDir)
  const summary: OriginSummary =
    sourceInspection.origins.find((entry) => entry.origin === origin) ?? {
      origin,
      host,
      browserId: sourceBrowserId,
      profileId: path.basename(sourceProfileDir),
      profileDir: sourceProfileDir,
      cookies: sourceInspection.cookieHosts.get(host) ?? 0,
      localStorage: sourceInspection.localStorageOrigins.get(origin) ?? 0,
      indexedDB: sourceInspection.indexedDbOrigins.get(origin) ?? 0,
      sessionStorage: 0,
      estimatedSizeBytes: 0,
      readable: true,
      exportable: false,
      migratable: false,
      reasons: []
    }

  const cookieCount = Math.max(summary.cookies, sourceInspection.cookieHosts.get(host) ?? 0)
  const mergedSummary: OriginSummary = {
    ...summary,
    cookies: cookieCount,
    localStorage: sourceInspection.localStorageOrigins.get(origin) ?? summary.localStorage,
    indexedDB: sourceInspection.indexedDbOrigins.get(origin) ?? summary.indexedDB
  }

  const destInspection = await inspectProfileStorage(destProfileDir)
  const destinationExisting = {
    cookies: destInspection.cookieHosts.get(host) ?? 0,
    localStorage: destInspection.localStorageOrigins.get(origin) ?? 0,
    indexedDB: destInspection.indexedDbOrigins.get(origin) ?? 0
  }

  const [sourceInstalled, destInstalled, running, sourceRunning] = await Promise.all([
    pathExists(BROWSER_EXECUTABLES[sourceBrowserId].appPath),
    pathExists(BROWSER_EXECUTABLES[destBrowserId].appPath),
    isBrowserRunning(destBrowserId),
    isBrowserRunning(sourceBrowserId)
  ])

  const sourceService = BROWSER_EXECUTABLES[sourceBrowserId].keychainService
  const keychainAvailable = sourceService ? await hasKeychainItem(sourceService) : false

  const sourceCaps = getSessionCapabilities({
    browserId: sourceBrowserId,
    installed: sourceInstalled,
    supportsCdp: BROWSER_EXECUTABLES[sourceBrowserId].supportsCdp,
    hasKeychainService: Boolean(sourceService)
  })
  const destCaps = getSessionCapabilities({
    browserId: destBrowserId,
    installed: destInstalled,
    supportsCdp: BROWSER_EXECUTABLES[destBrowserId].supportsCdp,
    hasKeychainService: Boolean(BROWSER_EXECUTABLES[destBrowserId].keychainService)
  })

  return buildSitePlan({
    origin,
    sourceProfile: { browserId: sourceBrowserId, profileId: path.basename(sourceProfileDir), profileDir: sourceProfileDir },
    destProfile: { browserId: destBrowserId, profileId: path.basename(destProfileDir), profileDir: destProfileDir },
    source: mergedSummary,
    sourceCaps,
    destCaps,
    destinationRunning: running,
    sourceRunning,
    destinationExisting,
    keychainAvailable,
    sameProfile
  })
}
