import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { detectProfiles } from '../browser-discovery/discover'
import { quitBrowser } from '../browser-discovery/quit'
import { getInventory } from '../filesystem/inventory'
import { createBackup } from '../migration/backup'
import { getCompatibility } from '../migration/compat'
import { IpcSchemas } from '../../shared/schemas/ipc'
import { validateArgs } from '../security/validate'
import { registerAllowedDir, assertAllowedDir } from '../security/profile-registry'
import { inspectProfileStorage } from '../../core/inspectors/chromium/origins'
import type { ProfileOriginScan } from '../../shared/types/session'
import type { BrowserProfile } from '../../shared/types/browser'
import { computeSitePlan } from '../migration/session/plan-service'
import { runSiteMigration } from '../migration/session/job'
import { runSiteImport } from '../migration/session/import-job'
import { buildExportBundle } from '../migration/session/export'
import { parseBundle, serializeBundle, summarizeBundle } from '../../core/session/bundle'
import { readJobs } from '../migration/session/jobs-store'
import { CHROMIUM_BROWSERS, BROWSER_NAMES } from '../browser-discovery/executables'

const knownProfiles = new Map<string, BrowserProfile>()
const approvedBundlePaths = new Set<string>()

async function detectAndRegister(): Promise<BrowserProfile[]> {
  const profiles = await detectProfiles()
  for (const profile of profiles) {
    registerAllowedDir(profile.profileDir)
    knownProfiles.set(path.resolve(profile.profileDir), profile)
  }
  return profiles
}

export function registerHandlers() {
  ipcMain.handle('detectProfiles', async () => {
    validateArgs(IpcSchemas.detectProfiles, {})
    return detectAndRegister()
  })

  ipcMain.handle('getInventory', async (_event, args) => {
    const { profileDir } = validateArgs(IpcSchemas.getInventory, args)
    const resolved = await assertAllowedDir(profileDir)
    const inventory = await getInventory(resolved)
    const known = knownProfiles.get(resolved)
    if (known) inventory.profile = known
    return inventory
  })

  ipcMain.handle('selectDirectory', async () => {
    validateArgs(IpcSchemas.selectDirectory, {})
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    registerAllowedDir(result.filePaths[0])
    return result.filePaths[0]
  })

  ipcMain.handle('createBackup', async (_event, args) => {
    const { destProfileDir } = validateArgs(IpcSchemas.createBackup, args)
    return createBackup(await assertAllowedDir(destProfileDir))
  })

  ipcMain.handle('getCompatibility', async (_event, args) => {
    const { sourceBrowserId, destBrowserId } = validateArgs(IpcSchemas.getCompatibility, args)
    return getCompatibility(sourceBrowserId, destBrowserId)
  })

  ipcMain.handle('listOrigins', async (_event, args) => {
    const { profileDir, browserId } = validateArgs(IpcSchemas.listOrigins, args)
    const resolved = await assertAllowedDir(profileDir)
    if (!CHROMIUM_BROWSERS.includes(browserId)) {
      return []
    }
    const inspection = await inspectProfileStorage(resolved)
    const profile = knownProfiles.get(resolved)
    return inspection.origins.map((origin) => ({
      ...origin,
      browserId,
      profileId: profile?.profileId ?? path.basename(resolved),
      profileDir: resolved
    }))
  })

  ipcMain.handle('scanWebsites', async () => {
    validateArgs(IpcSchemas.scanWebsites, {})
    const profiles = await detectAndRegister()
    const scans: ProfileOriginScan[] = []
    for (const profile of profiles) {
      if (!profile.accessible) {
        scans.push({ profile, origins: [], error: 'Profile directory is not accessible.' })
        continue
      }
      if (!CHROMIUM_BROWSERS.includes(profile.browserId)) {
        scans.push({
          profile,
          origins: [],
          error: `${BROWSER_NAMES[profile.browserId]} storage is not inspected by the origin scanner in this build.`
        })
        continue
      }
      try {
        const inspection = await inspectProfileStorage(profile.profileDir)
        scans.push({
          profile,
          origins: inspection.origins.map((origin) => ({
            ...origin,
            browserId: profile.browserId,
            profileId: profile.profileId,
            profileDir: profile.profileDir
          }))
        })
      } catch (error) {
        scans.push({
          profile,
          origins: [],
          error: error instanceof Error ? error.message : 'Unable to inspect profile'
        })
      }
    }
    return scans
  })

  ipcMain.handle('getSitePlan', async (_event, args) => {
    const data = validateArgs(IpcSchemas.getSitePlan, args)
    await assertAllowedDir(data.sourceProfileDir)
    await assertAllowedDir(data.destProfileDir)
    return computeSitePlan(data)
  })

  ipcMain.handle('startSiteMigration', async (event, args) => {
    const request = validateArgs(IpcSchemas.startSiteMigration, args)
    await assertAllowedDir(request.sourceProfileDir)
    await assertAllowedDir(request.destProfileDir)
    const userDataDir = app.getPath('userData')
    const sender = event.sender
    const result = await runSiteMigration(request, {
      userDataDir,
      backupRoot: path.join(userDataDir, 'backups'),
      onProgress: (progress) => {
        if (!sender.isDestroyed()) sender.send('migration-progress', progress)
      }
    })
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send('jobs-changed')
    }
    return result
  })

  ipcMain.handle('quitBrowser', async (_event, args) => {
    const { browserId } = validateArgs(IpcSchemas.quitBrowser, args)
    return quitBrowser(browserId)
  })

  ipcMain.handle('getJobs', async () => {
    validateArgs(IpcSchemas.getJobs, {})
    return readJobs(app.getPath('userData'))
  })

  ipcMain.handle('getAppInfo', async () => {
    validateArgs(IpcSchemas.getAppInfo, {})
    const userDataDir = app.getPath('userData')
    const backupRoot = path.join(userDataDir, 'backups')
    await fs.mkdir(backupRoot, { recursive: true, mode: 0o700 })
    return {
      version: app.getVersion(),
      platform: process.platform,
      userDataDir,
      backupRoot
    }
  })

  ipcMain.handle('revealPath', async (_event, args) => {
    const { path: requested } = validateArgs(IpcSchemas.revealPath, args)
    const userDataDir = path.resolve(app.getPath('userData'))
    const resolved = path.resolve(requested)
    if (!resolved.startsWith(userDataDir + path.sep)) {
      throw new Error('Only application backup and report paths can be revealed')
    }
    shell.showItemInFolder(resolved)
  })

  ipcMain.handle('exportSiteBundle', async (_event, args) => {
    const data = validateArgs(IpcSchemas.exportSiteBundle, args)
    const resolved = await assertAllowedDir(data.sourceProfileDir)
    const { bundle, warnings } = await buildExportBundle({
      sourceBrowserId: data.sourceBrowserId,
      sourceProfileId: knownProfiles.get(resolved)?.profileId,
      sourceProfileDir: resolved,
      origin: data.origin,
      categories: data.categories
    })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const result = await dialog.showSaveDialog({
      title: 'Export session bundle',
      defaultPath: path.join(app.getPath('downloads'), `session-${safeHost(data.origin)}-${stamp}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    await fs.writeFile(result.filePath, serializeBundle(bundle), { mode: 0o600 })
    return { canceled: false, path: result.filePath, summary: summarizeBundle(bundle), warnings }
  })

  ipcMain.handle('selectSiteBundle', async () => {
    validateArgs(IpcSchemas.selectSiteBundle, {})
    const result = await dialog.showOpenDialog({
      title: 'Select a session bundle',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return { canceled: true }
    const filePath = path.resolve(result.filePaths[0])
    const bundle = parseBundle(await fs.readFile(filePath, 'utf8'))
    approvedBundlePaths.add(filePath)
    return { canceled: false, path: filePath, summary: summarizeBundle(bundle) }
  })

  ipcMain.handle('importSiteBundle', async (event, args) => {
    const request = validateArgs(IpcSchemas.importSiteBundle, args)
    const resolved = path.resolve(request.bundlePath)
    if (!approvedBundlePaths.has(resolved)) {
      throw new Error('Select the bundle file through this app before importing it')
    }
    await assertAllowedDir(request.destProfileDir)
    const userDataDir = app.getPath('userData')
    const sender = event.sender
    const result = await runSiteImport(
      { ...request, bundlePath: resolved },
      {
        userDataDir,
        backupRoot: path.join(userDataDir, 'backups'),
        onProgress: (progress) => {
          if (!sender.isDestroyed()) sender.send('migration-progress', progress)
        }
      }
    )
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send('jobs-changed')
    }
    return result
  })
}

function safeHost(origin: string): string {
  try {
    return new URL(origin).hostname.replace(/[^a-z0-9.-]/gi, '_')
  } catch {
    return 'site'
  }
}
