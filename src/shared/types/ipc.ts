import type { BrowserProfile, Inventory } from './browser'
import type {
  MigrationProgress,
  OriginSummary,
  ProfileOriginScan,
  SessionMigrationResult,
  SiteMigrationRequest,
  SitePlan,
  StoredJob
} from './session'

export interface AppInfo {
  version: string
  platform: string
  userDataDir: string
  backupRoot: string
}

export interface IpcApi {
  detectProfiles: () => Promise<BrowserProfile[]>
  getInventory: (profileDir: string) => Promise<Inventory>
  selectDirectory: () => Promise<string | null>
  createBackup: (destProfileDir: string) => Promise<{ backupPath: string; manifestPath: string }>
  getCompatibility: (sourceBrowserId: string, destBrowserId: string) => Promise<Record<string, string>>
  listOrigins: (profileDir: string, browserId: BrowserProfile['browserId']) => Promise<OriginSummary[]>
  scanWebsites: () => Promise<ProfileOriginScan[]>
  getSitePlan: (
    sourceBrowserId: string,
    sourceProfileDir: string,
    destBrowserId: string,
    destProfileDir: string,
    origin: string
  ) => Promise<SitePlan>
  startSiteMigration: (request: SiteMigrationRequest) => Promise<SessionMigrationResult>
  quitBrowser: (browserId: BrowserProfile['browserId']) => Promise<boolean>
  getJobs: () => Promise<StoredJob[]>
  revealPath: (path: string) => Promise<void>
  onMigrationProgress: (callback: (progress: MigrationProgress) => void) => () => void
  getAppInfo: () => Promise<AppInfo>
}
