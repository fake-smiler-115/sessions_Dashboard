export type BrowserId = 'chrome' | 'arc' | 'brave' | 'edge' | 'firefox' | 'safari'

export interface BrowserApp {
  id: BrowserId
  name: string
  installed: boolean
  appPath?: string
  version?: string
}

export interface BrowserProfile {
  browserId: BrowserId
  browserName: string
  browserVersion?: string
  profileId: string
  profileName: string
  profileDir: string
  exists: boolean
  accessible: boolean
  sizeBytes?: number
  lastModified?: number
  running?: boolean
  supportedInspection: string[]
  supportedMigration: string[]
}

export interface InventoryItem {
  path: string
  type: 'file' | 'dir' | 'unknown'
  sizeBytes?: number
  ext?: string
  signature?: string
}

export interface Inventory {
  profile: BrowserProfile
  items: InventoryItem[]
  databases: InventoryItem[]
  leveldbDirs: InventoryItem[]
  jsonFiles: InventoryItem[]
  unknown: InventoryItem[]
}

export interface WebsiteOrigin {
  origin: string
  browserId: BrowserId
  profileId: string
  categories: string[]
  files: string[]
  estimatedSizeBytes?: number
  recordCount?: number
  readable: boolean
  exportable: boolean
  migratable: boolean
  reasons: string[]
}

export interface MigrationSelection {
  sourceProfile: BrowserProfile
  destProfile: BrowserProfile
  categories: string[]
  origins?: string[]
}

export interface MigrationRecordResult {
  origin?: string
  category: string
  status: 'migrated' | 'skipped' | 'unsupported' | 'failed'
  reason?: string
  count?: number
}

export interface MigrationReport {
  id: string
  startedAt: number
  finishedAt?: number
  selection: MigrationSelection
  results: MigrationRecordResult[]
  backupPath?: string
  verified: boolean
}

export interface VerificationReport {
  ok: boolean
  details: string[]
}
