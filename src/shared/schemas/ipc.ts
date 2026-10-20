import { z } from 'zod'

const browserId = z.enum(['chrome', 'arc', 'brave', 'edge', 'firefox', 'safari'])

export const DetectProfilesSchema = z.object({})
export const GetInventorySchema = z.object({ profileDir: z.string().min(1) })
export const SelectDirectorySchema = z.object({})
export const CreateBackupSchema = z.object({ destProfileDir: z.string().min(1) })
export const GetCompatibilitySchema = z.object({
  sourceBrowserId: browserId,
  destBrowserId: browserId
})
export const ListOriginsSchema = z.object({
  profileDir: z.string().min(1),
  browserId
})
export const ScanWebsitesSchema = z.object({})
export const GetSitePlanSchema = z.object({
  sourceBrowserId: browserId,
  sourceProfileDir: z.string().min(1),
  destBrowserId: browserId,
  destProfileDir: z.string().min(1),
  origin: z.string().min(1)
})
export const StartSiteMigrationSchema = z.object({
  sourceBrowserId: browserId,
  sourceProfileDir: z.string().min(1),
  destBrowserId: browserId,
  destProfileDir: z.string().min(1),
  origin: z.string().min(1),
  categories: z.array(z.enum(['cookies', 'localStorage'])).min(1),
  persistSessionCookies: z.boolean(),
  confirmation: z.literal('migrate-website-session')
})
export const QuitBrowserSchema = z.object({ browserId })
export const GetJobsSchema = z.object({})
export const RevealPathSchema = z.object({ path: z.string().min(1) })
export const GetAppInfoSchema = z.object({})

export const IpcSchemas = {
  detectProfiles: DetectProfilesSchema,
  getInventory: GetInventorySchema,
  selectDirectory: SelectDirectorySchema,
  createBackup: CreateBackupSchema,
  getCompatibility: GetCompatibilitySchema,
  listOrigins: ListOriginsSchema,
  scanWebsites: ScanWebsitesSchema,
  getSitePlan: GetSitePlanSchema,
  startSiteMigration: StartSiteMigrationSchema,
  quitBrowser: QuitBrowserSchema,
  getJobs: GetJobsSchema,
  revealPath: RevealPathSchema,
  getAppInfo: GetAppInfoSchema
} as const
