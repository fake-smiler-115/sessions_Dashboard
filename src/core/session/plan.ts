import type { BrowserId } from '../../shared/types/browser'
import type { OriginSummary, SiteCategoryPlan, SitePlan, SiteDataCategory } from '../../shared/types/session'
import type { SessionCapabilities } from './types'

export interface PlanInput {
  origin: string
  sourceProfile: { browserId: BrowserId; profileId: string; profileDir: string }
  destProfile: { browserId: BrowserId; profileId: string; profileDir: string }
  source: OriginSummary
  sourceCaps: SessionCapabilities
  destCaps: SessionCapabilities
  destinationRunning: boolean
  sourceRunning?: boolean
  destinationExisting: { cookies: number; localStorage: number; indexedDB: number }
  keychainAvailable: boolean
  sameProfile: boolean
}

function base(
  category: SiteDataCategory,
  detected: boolean,
  readable: boolean,
  records: number,
  size: number,
  status: SiteCategoryPlan['status'],
  reasons: string[]
): SiteCategoryPlan {
  return {
    category,
    detected,
    readable,
    destinationSupported: status === 'Supported' || status === 'Partially supported' || status === 'Requires permission',
    migratable: status === 'Supported' || status === 'Partially supported' || status === 'Requires permission',
    records,
    estimatedSizeBytes: size,
    status,
    reasons
  }
}

export function buildSitePlan(input: PlanInput): SitePlan {
  const { source, sourceCaps, destCaps, destinationRunning, destinationExisting, keychainAvailable } = input
  const warnings: string[] = []
  const categories: SiteCategoryPlan[] = []

  const blockedReason = input.sameProfile
    ? 'Source and destination are the same browser profile.'
    : !destCaps.installed
      ? 'The destination browser application is not installed.'
      : !destCaps.writableCookies
        ? 'This build has no supported destination write mechanism for the selected browser.'
        : undefined

  if (input.sameProfile) warnings.push('Source and destination refer to the same profile.')
  if (input.sourceRunning && (source.cookies > 0 || source.localStorage > 0 || source.sessionStorage > 0)) {
    warnings.push(
      'The source browser is running. Recent cookies, Local Storage, or Session Storage may not be included; quit it for a complete migration.'
    )
  }
  if (destinationRunning) warnings.push('The destination browser is currently running. Quit it before migrating.')
  if (destinationExisting.cookies > 0) {
    warnings.push(`${destinationExisting.cookies} existing cookie record(s) already exist for this host in the destination.`)
  }
  if (destinationExisting.localStorage > 0) {
    warnings.push(`${destinationExisting.localStorage} existing Local Storage key(s) already exist for this origin in the destination.`)
  }
  if (destinationExisting.indexedDB > 0) {
    warnings.push('The destination already contains an IndexedDB database for this origin; IndexedDB is not migrated by this operation.')
  }
  if (source.cookies > 0) {
    warnings.push('Cookies are authentication credentials. The destination is changed only after explicit confirmation, and a backup is created first.')
  }
  if (!keychainAvailable) {
    warnings.push('The macOS Keychain item needed to decrypt source cookies was not found.')
  }
  if (input.origin.startsWith('http://') && source.cookies > 0) {
    warnings.push('Secure cookies cannot be applied over http, and the destination may reject them.')
  }
  if (input.destProfile.browserId === 'arc') {
    warnings.push('Arc is not available as a session migration destination in this build.')
  }

  const cookieReasons: string[] = []
  let cookieStatus: SiteCategoryPlan['status'] = 'Not detected'
  if (source.cookies > 0) {
    if (input.sameProfile) cookieStatus = 'Same browser/profile'
    else if (blockedReason) {
      cookieStatus = 'Unsupported'
      cookieReasons.push(blockedReason)
    } else if (!sourceCaps.readableCookies) {
      cookieStatus = 'Unsupported'
      cookieReasons.push('Source cookies cannot be read with a supported mechanism.')
    } else if (!keychainAvailable) {
      cookieStatus = 'Unsupported'
      cookieReasons.push('Cookie decryption requires the browser Keychain item and it was not found.')
    } else {
      cookieStatus = 'Requires permission'
      cookieReasons.push('Decrypting cookies requires macOS Keychain authorisation.')
      cookieReasons.push('The destination browser is launched with a debugging interface and cookies are set through the browser itself.')
      cookieReasons.push('Session-only cookies can optionally be converted to persistent cookies so the sign-in survives a restart.')
    }
  }
  categories.push(
    base('cookies', source.cookies > 0, sourceCaps.readableCookies, source.cookies, 0, cookieStatus, cookieReasons)
  )

  const lsReasons: string[] = []
  let lsStatus: SiteCategoryPlan['status'] = 'Not detected'
  if (source.localStorage > 0) {
    if (input.sameProfile) lsStatus = 'Same browser/profile'
    else if (blockedReason) {
      lsStatus = 'Unsupported'
      lsReasons.push(blockedReason)
    } else if (!sourceCaps.readableLocalStorage) {
      lsStatus = 'Unsupported'
      lsReasons.push('Local Storage cannot be read with a supported mechanism.')
    } else {
      lsStatus = 'Partially supported'
      lsReasons.push('Only Local Storage string records for this exact origin are transferred.')
      lsReasons.push('The destination browser loads a page on the origin so values are written through the browser itself.')
      lsReasons.push('IndexedDB, Cache Storage, and service worker data are not transferred.')
    }
  }
  categories.push(
    base('localStorage', source.localStorage > 0, sourceCaps.readableLocalStorage, source.localStorage, 0, lsStatus, lsReasons)
  )

  categories.push(
    base(
      'indexedDB',
      source.indexedDB > 0,
      false,
      source.indexedDB,
      0,
      source.indexedDB > 0 ? 'Unsupported' : 'Not detected',
      source.indexedDB > 0
        ? ['IndexedDB data is detected but no lossless cross-browser import mechanism is implemented in this build.']
        : []
    )
  )

  const ssReasons: string[] = []
  let ssStatus: SiteCategoryPlan['status'] = 'Not detected'
  if (source.sessionStorage > 0) {
    if (input.sameProfile) ssStatus = 'Same browser/profile'
    else if (blockedReason) {
      ssStatus = 'Unsupported'
      ssReasons.push(blockedReason)
    } else if (!sourceCaps.readableSessionStorage) {
      ssStatus = 'Unsupported'
      ssReasons.push('Session Storage cannot be read with a supported mechanism.')
    } else {
      ssStatus = 'Partially supported'
      ssReasons.push('Session Storage is written into the destination browser tab and persisted for session restore.')
      ssReasons.push('It is tab- and session-scoped, so it will not appear in a brand-new tab.')
    }
  }
  categories.push(
    base(
      'sessionStorage',
      source.sessionStorage > 0,
      sourceCaps.readableSessionStorage,
      source.sessionStorage,
      0,
      ssStatus,
      ssReasons
    )
  )

  const canMigrate =
    !input.sameProfile &&
    !destinationRunning &&
    destCaps.installed &&
    categories.some((category) => category.migratable)

  return {
    origin: input.origin,
    source: input.sourceProfile,
    destination: input.destProfile,
    destinationRunning,
    sourceCredentialsRequireKeychain: source.cookies > 0 && keychainAvailable,
    destinationExisting,
    categories,
    canMigrate,
    warnings
  }
}
