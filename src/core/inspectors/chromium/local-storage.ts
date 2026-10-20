import { ClassicLevel } from 'classic-level'
import { withDirectorySnapshot } from './snapshot'

export interface LocalStorageRecord {
  origin: string
  key: string
  value: string
}

export interface LocalStorageOriginSummary {
  origin: string
  count: number
  sizeBytes: number
}

export interface LocalStorageReadResult {
  records: LocalStorageRecord[]
  origins: LocalStorageOriginSummary[]
  skippedValues: number
  readable: boolean
  error?: string
}

function isPlainHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value
  } catch {
    return false
  }
}

export function parseLocalStorageKey(raw: Buffer): { origin: string; key: string } | null {
  if (raw.length < 3 || raw[0] !== 0x5f) return null
  const separator = raw.indexOf(0, 1)
  if (separator < 0) return null
  const origin = raw.subarray(1, separator).toString('utf8')
  if (!isPlainHttpOrigin(origin)) return null
  const encodedKey = raw.subarray(separator + 1)
  const key = decodeLocalStorageValue(encodedKey)
  if (!key) return null
  return { origin, key }
}

export function decodeLocalStorageValue(raw: Buffer): string | null {
  if (raw.length === 0) return null
  const encoding = raw[0]
  const body = raw.subarray(1)
  if (encoding === 0) return body.toString('utf16le')
  if (encoding === 1) return body.toString('latin1')
  return null
}

export async function readLocalStorageDir(dir: string): Promise<LocalStorageReadResult> {
  try {
    return await withDirectorySnapshot(dir, async (snapshotDir) => {
      const db = new ClassicLevel<Buffer, Buffer>(snapshotDir, { keyEncoding: 'binary', valueEncoding: 'binary' })
      const records: LocalStorageRecord[] = []
      let skippedValues = 0
      try {
        await db.open()
        for await (const [rawKey, rawValue] of db.iterator()) {
          const keyBuffer = Buffer.isBuffer(rawKey) ? rawKey : Buffer.from(String(rawKey))
          const parsed = parseLocalStorageKey(keyBuffer)
          if (!parsed) continue
          const valueBuffer = Buffer.isBuffer(rawValue) ? rawValue : Buffer.from(String(rawValue))
          const value = decodeLocalStorageValue(valueBuffer)
          if (value === null) {
            skippedValues += 1
            continue
          }
          records.push({ origin: parsed.origin, key: parsed.key, value })
        }
      } finally {
        await db.close().catch(() => undefined)
      }
      return {
        records,
        origins: summarizeLocalStorage(records),
        skippedValues,
        readable: true
      }
    })
  } catch (error) {
    return {
      records: [],
      origins: [],
      skippedValues: 0,
      readable: false,
      error: error instanceof Error ? error.message : 'Unable to read Local Storage'
    }
  }
}

export function summarizeLocalStorage(records: LocalStorageRecord[]): LocalStorageOriginSummary[] {
  const map = new Map<string, LocalStorageOriginSummary>()
  for (const record of records) {
    const existing = map.get(record.origin) ?? { origin: record.origin, count: 0, sizeBytes: 0 }
    existing.count += 1
    existing.sizeBytes += record.key.length + record.value.length
    map.set(record.origin, existing)
  }
  return [...map.values()]
}
