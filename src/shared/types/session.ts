import type { BrowserId, BrowserProfile } from './browser'

export type SiteDataCategory = 'cookies' | 'localStorage' | 'indexedDB' | 'sessionStorage'

export type CapabilityStatus =
  | 'Supported'
  | 'Partially supported'
  | 'Requires permission'
  | 'Unsupported'
  | 'Not scanned'
  | 'Same browser/profile'
  | 'Not detected'

export interface OriginSummary {
  origin: string
  host: string
  browserId: BrowserId
  profileId: string
  profileDir: string
  cookies: number
  localStorage: number
  indexedDB: number
  sessionStorage: number
  estimatedSizeBytes: number
  readable: boolean
  exportable: boolean
  migratable: boolean
  reasons: string[]
}

export interface ProfileOriginScan {
  profile: BrowserProfile
  origins: OriginSummary[]
  error?: string
}

export interface SiteCategoryPlan {
  category: SiteDataCategory
  detected: boolean
  readable: boolean
  destinationSupported: boolean
  migratable: boolean
  records: number
  estimatedSizeBytes: number
  status: CapabilityStatus
  reasons: string[]
}

export interface SitePlan {
  origin: string
  source: { browserId: BrowserId; profileId: string; profileDir: string }
  destination: { browserId: BrowserId; profileId: string; profileDir: string }
  destinationRunning: boolean
  sourceCredentialsRequireKeychain: boolean
  destinationExisting: { cookies: number; localStorage: number; indexedDB: number }
  categories: SiteCategoryPlan[]
  canMigrate: boolean
  warnings: string[]
}

export interface SiteMigrationRequest {
  sourceBrowserId: BrowserId
  sourceProfileDir: string
  destBrowserId: BrowserId
  destProfileDir: string
  origin: string
  categories: Array<'cookies' | 'localStorage' | 'sessionStorage'>
  persistSessionCookies: boolean
  confirmation: 'migrate-website-session'
}

export interface CategoryMigrationResult {
  category: SiteDataCategory
  status: 'migrated' | 'partially-migrated' | 'skipped' | 'unsupported' | 'failed'
  detected: boolean
  imported: number
  skipped: number
  failed: number
  verified: boolean
  reasons: string[]
}

export interface SessionVerification {
  ok: boolean
  cookiesChecked: number
  cookiesMatched: number
  localStorageChecked: number
  localStorageMatched: number
  sessionStorageChecked?: number
  sessionStorageMatched?: number
  details: string[]
}

export interface SessionMigrationResult {
  id: string
  origin: string
  startedAt: number
  finishedAt: number
  categories: CategoryMigrationResult[]
  verification: SessionVerification
  backupPath?: string
  backupManifestPath?: string
  warnings: string[]
  limitations: string[]
  overall: 'success' | 'partial' | 'failed'
}

export interface MigrationProgress {
  jobId: string
  stage: 'backup' | 'launch' | 'cookies' | 'localStorage' | 'sessionStorage' | 'verify' | 'close' | 'done'
  message: string
  current?: number
  total?: number
}

export interface StoredJob {
  id: string
  origin: string
  sourceBrowserId: BrowserId
  destBrowserId: BrowserId
  startedAt: number
  finishedAt: number
  overall: 'success' | 'partial' | 'failed'
  backupPath?: string
  result: SessionMigrationResult
}

export interface PortableCookie {
  name: string
  value: string
  domain: string
  path: string
  secure: boolean
  httpOnly: boolean
  sameSite: number
  session: boolean
  expiresUnix?: number
}

export interface PortableStorageRecord {
  key: string
  value: string
}

export interface PortableSessionBundle {
  format: 'session-transfer-bundle'
  version: 1
  generatedAt: string
  source: { browserId: BrowserId; origin: string; profileId?: string }
  categories: SiteDataCategory[]
  cookies: PortableCookie[]
  localStorage: PortableStorageRecord[]
  sessionStorage: PortableStorageRecord[]
}

export interface BundleSummary {
  origin: string
  sourceBrowserId: BrowserId
  generatedAt: string
  categories: SiteDataCategory[]
  counts: { cookies: number; localStorage: number; sessionStorage: number }
}

export interface BundleExportResult {
  canceled: boolean
  path?: string
  summary?: BundleSummary
  warnings?: string[]
}

export interface BundleSelectionResult {
  canceled: boolean
  path?: string
  summary?: BundleSummary
}

export interface SiteImportRequest {
  destBrowserId: BrowserId
  destProfileDir: string
  origin: string
  bundlePath: string
  categories: Array<'cookies' | 'localStorage' | 'sessionStorage'>
  persistSessionCookies: boolean
  confirmation: 'import-session-bundle'
}
