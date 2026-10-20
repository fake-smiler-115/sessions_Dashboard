import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'

export async function createBackup(destProfileDir: string): Promise<{ backupPath: string; manifestPath: string }> {
  const backupRoot = path.join(os.homedir(), 'Library/Application Support/BrowserMigrationTool/backups')
  await fs.mkdir(backupRoot, { recursive: true })
  const id = uuidv4()
  const backupPath = path.join(backupRoot, id)
  await fs.mkdir(backupPath, { recursive: true })
  const manifest = {
    id,
    createdAt: Date.now(),
    destProfileDir,
    files: []
  }
  const manifestPath = path.join(backupPath, 'manifest.json')
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  return { backupPath, manifestPath }
}
