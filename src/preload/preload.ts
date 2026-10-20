import { contextBridge, ipcRenderer } from 'electron'
import type { IpcApi } from '../shared/types/ipc'
import type { MigrationProgress } from '../shared/types/session'

const api: IpcApi = {
  detectProfiles: () => ipcRenderer.invoke('detectProfiles'),
  getInventory: (profileDir: string) => ipcRenderer.invoke('getInventory', { profileDir }),
  selectDirectory: () => ipcRenderer.invoke('selectDirectory'),
  createBackup: (destProfileDir: string) => ipcRenderer.invoke('createBackup', { destProfileDir }),
  getCompatibility: (sourceBrowserId: string, destBrowserId: string) =>
    ipcRenderer.invoke('getCompatibility', { sourceBrowserId, destBrowserId }),
  listOrigins: (profileDir: string, browserId) => ipcRenderer.invoke('listOrigins', { profileDir, browserId }),
  scanWebsites: () => ipcRenderer.invoke('scanWebsites'),
  getSitePlan: (sourceBrowserId, sourceProfileDir, destBrowserId, destProfileDir, origin) =>
    ipcRenderer.invoke('getSitePlan', { sourceBrowserId, sourceProfileDir, destBrowserId, destProfileDir, origin }),
  startSiteMigration: (request) => ipcRenderer.invoke('startSiteMigration', request),
  quitBrowser: (browserId) => ipcRenderer.invoke('quitBrowser', { browserId }),
  getJobs: () => ipcRenderer.invoke('getJobs'),
  revealPath: (targetPath: string) => ipcRenderer.invoke('revealPath', { path: targetPath }),
  exportSiteBundle: (input) => ipcRenderer.invoke('exportSiteBundle', input),
  selectSiteBundle: () => ipcRenderer.invoke('selectSiteBundle'),
  importSiteBundle: (request) => ipcRenderer.invoke('importSiteBundle', request),
  onMigrationProgress: (callback: (progress: MigrationProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: MigrationProgress) => callback(progress)
    ipcRenderer.on('migration-progress', listener)
    return () => ipcRenderer.removeListener('migration-progress', listener)
  },
  getAppInfo: () => ipcRenderer.invoke('getAppInfo')
}

contextBridge.exposeInMainWorld('api', api)
