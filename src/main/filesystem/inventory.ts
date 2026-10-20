import fs from 'fs/promises'
import path from 'path'
import type { Inventory, InventoryItem } from '../../shared/types/browser'

const SQLITE_SIGNATURE = Buffer.from('SQLite format 3\u0000', 'latin1')

async function detectSignature(filePath: string): Promise<string | undefined> {
  try {
    const handle = await fs.open(filePath, 'r')
    try {
      const buffer = Buffer.alloc(16)
      const { bytesRead } = await handle.read(buffer, 0, 16, 0)
      const slice = buffer.subarray(0, bytesRead)
      if (slice.subarray(0, 16).equals(SQLITE_SIGNATURE)) return 'sqlite'
      const text = slice.toString('utf8').trimStart()
      if (text.startsWith('{') || text.startsWith('[')) return 'json'
      return undefined
    } finally {
      await handle.close()
    }
  } catch {
    return undefined
  }
}

async function isLevelDbDir(dir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dir)
    return entries.includes('CURRENT') && entries.some((entry) => entry.startsWith('MANIFEST-'))
  } catch {
    return false
  }
}

async function walk(dir: string, depth = 0, maxDepth = 6): Promise<InventoryItem[]> {
  if (depth > maxDepth) return []
  const items: InventoryItem[] = []
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return items
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isSymbolicLink()) {
      items.push({ path: full, type: 'unknown', ext: path.extname(entry.name) })
      continue
    }
    if (entry.isDirectory()) {
      items.push({ path: full, type: 'dir' })
      items.push(...(await walk(full, depth + 1, maxDepth)))
    } else if (entry.isFile()) {
      const stat = await fs.stat(full).catch(() => undefined)
      const signature = await detectSignature(full)
      items.push({
        path: full,
        type: 'file',
        sizeBytes: stat?.size,
        ext: path.extname(entry.name),
        signature
      })
    } else {
      items.push({ path: full, type: 'unknown' })
    }
  }
  return items
}

export async function getInventory(profileDir: string): Promise<Inventory> {
  const items = await walk(profileDir)
  const databases: InventoryItem[] = []
  const leveldbDirs: InventoryItem[] = []
  const jsonFiles: InventoryItem[] = []
  const unknown: InventoryItem[] = []

  for (const item of items) {
    if (item.type === 'dir') {
      if (await isLevelDbDir(item.path)) leveldbDirs.push(item)
      continue
    }
    if (item.type === 'unknown') {
      unknown.push(item)
      continue
    }
    if (item.signature === 'sqlite') databases.push(item)
    else if (item.signature === 'json' || item.ext === '.json') jsonFiles.push(item)
  }

  return {
    profile: {
      browserId: 'chrome',
      browserName: 'Unknown',
      profileId: path.basename(profileDir),
      profileName: path.basename(profileDir),
      profileDir,
      exists: true,
      accessible: true,
      supportedInspection: ['files'],
      supportedMigration: []
    },
    items,
    databases,
    leveldbDirs,
    jsonFiles,
    unknown
  }
}
