import fs from 'fs/promises'
import path from 'path'

export interface IndexedDbOriginSummary {
  origin: string
  directory: string
  databases: number
  sizeBytes: number
}

export function parseIndexedDbDirectoryName(name: string): string | null {
  const suffix = '.indexeddb.leveldb'
  if (!name.endsWith(suffix)) return null
  const base = name.slice(0, -suffix.length)
  const match = base.match(/^(https?|chrome-extension|file)_(.+)_(\d+)$/)
  if (!match) return null
  const [, scheme, host, portRaw] = match
  const port = Number(portRaw)
  if (scheme === 'file') return 'file://'
  if (scheme === 'chrome-extension') return `chrome-extension://${host}`
  if (port === 0) return `${scheme}://${host}`
  const defaultPort = (scheme === 'https' && port === 443) || (scheme === 'http' && port === 80)
  return defaultPort ? `${scheme}://${host}` : `${scheme}://${host}:${port}`
}

async function directorySize(dir: string): Promise<number> {
  let total = 0
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) total += await directorySize(full)
    else if (entry.isFile()) {
      const st = await fs.stat(full).catch(() => undefined)
      total += st?.size ?? 0
    }
  }
  return total
}

export async function readIndexedDbOrigins(indexedDbDir: string): Promise<IndexedDbOriginSummary[]> {
  const entries = await fs.readdir(indexedDbDir, { withFileTypes: true }).catch(() => [])
  const map = new Map<string, IndexedDbOriginSummary>()
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const origin = parseIndexedDbDirectoryName(entry.name)
    if (!origin) continue
    const existing = map.get(origin) ?? { origin, directory: indexedDbDir, databases: 0, sizeBytes: 0 }
    existing.databases += 1
    existing.sizeBytes += await directorySize(path.join(indexedDbDir, entry.name))
    map.set(origin, existing)
  }
  return [...map.values()]
}
