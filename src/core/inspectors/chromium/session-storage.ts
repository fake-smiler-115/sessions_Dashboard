import { randomUUID } from 'crypto'
import { ClassicLevel } from 'classic-level'
import { withDirectorySnapshot } from './snapshot'

export interface SessionStorageNamespace {
  uuid: string
  originRaw: string
  origin: string
  mapId: string
}

export interface SessionStorageEntry {
  mapId: string
  key: string
  value: string
}

export interface SessionStorageRecord {
  origin: string
  key: string
  value: string
}

export interface SessionStorageOriginSummary {
  origin: string
  count: number
  sizeBytes: number
}

export interface SessionStorageReadResult {
  records: SessionStorageRecord[]
  origins: SessionStorageOriginSummary[]
  namespaces: SessionStorageNamespace[]
  entries: SessionStorageEntry[]
  readable: boolean
  error?: string
}

const NAMESPACE_PREFIX = 'namespace-'
const MAP_PREFIX = 'map-'
const UUID_LENGTH = 36
const DASH = 0x2d

function asBuffer(value: Buffer | string): Buffer {
  return Buffer.isBuffer(value) ? value : Buffer.from(String(value))
}

export function normalizeSessionStorageOrigin(originRaw: string): string {
  return originRaw.endsWith('/') ? originRaw.slice(0, -1) : originRaw
}

export function parseSessionStorageEntries(entries: Array<[Buffer, Buffer]>): {
  namespaces: SessionStorageNamespace[]
  entries: SessionStorageEntry[]
} {
  const namespaces: SessionStorageNamespace[] = []
  const parsed: SessionStorageEntry[] = []
  for (const [rawKey, rawValue] of entries) {
    const key = asBuffer(rawKey)
    const value = asBuffer(rawValue)
    if (key.length > NAMESPACE_PREFIX.length && key.subarray(0, NAMESPACE_PREFIX.length).toString('latin1') === NAMESPACE_PREFIX) {
      const rest = key.subarray(NAMESPACE_PREFIX.length)
      if (rest.length > UUID_LENGTH && rest[UUID_LENGTH] === DASH) {
        const uuid = rest.subarray(0, UUID_LENGTH).toString('latin1')
        const originRaw = rest.subarray(UUID_LENGTH + 1).toString('utf8')
        const mapId = value.toString('latin1').trim()
        if (originRaw && mapId) {
          namespaces.push({ uuid, originRaw, origin: normalizeSessionStorageOrigin(originRaw), mapId })
        }
      }
      continue
    }
    if (key.length > MAP_PREFIX.length && key.subarray(0, MAP_PREFIX.length).toString('latin1') === MAP_PREFIX) {
      const rest = key.subarray(MAP_PREFIX.length)
      const dash = rest.indexOf(DASH)
      if (dash > 0) {
        const mapId = rest.subarray(0, dash).toString('latin1')
        const itemKey = rest.subarray(dash + 1).toString('utf8')
        parsed.push({ mapId, key: itemKey, value: value.toString('utf16le') })
      }
    }
  }
  return { namespaces, entries: parsed }
}

function buildResult(parsed: { namespaces: SessionStorageNamespace[]; entries: SessionStorageEntry[] }): SessionStorageReadResult {
  const records: SessionStorageRecord[] = []
  const originByMap = new Map<string, string>()
  for (const namespace of parsed.namespaces) {
    if (!originByMap.has(namespace.mapId)) originByMap.set(namespace.mapId, namespace.origin)
  }
  for (const entry of parsed.entries) {
    const origin = originByMap.get(entry.mapId)
    if (!origin) continue
    records.push({ origin, key: entry.key, value: entry.value })
  }
  const map = new Map<string, SessionStorageOriginSummary>()
  for (const record of records) {
    const existing = map.get(record.origin) ?? { origin: record.origin, count: 0, sizeBytes: 0 }
    existing.count += 1
    existing.sizeBytes += record.key.length + record.value.length
    map.set(record.origin, existing)
  }
  return {
    records,
    origins: [...map.values()],
    namespaces: parsed.namespaces,
    entries: parsed.entries,
    readable: true
  }
}

export async function readSessionStorageDir(dir: string): Promise<SessionStorageReadResult> {
  try {
    return await withDirectorySnapshot(dir, async (snapshotDir) => {
      const db = new ClassicLevel<Buffer, Buffer>(snapshotDir, { keyEncoding: 'binary', valueEncoding: 'binary' })
      const raw: Array<[Buffer, Buffer]> = []
      try {
        await db.open()
        for await (const [key, value] of db.iterator()) raw.push([asBuffer(key), asBuffer(value)])
      } finally {
        await db.close().catch(() => undefined)
      }
      return buildResult(parseSessionStorageEntries(raw))
    })
  } catch (error) {
    return {
      records: [],
      origins: [],
      namespaces: [],
      entries: [],
      readable: false,
      error: error instanceof Error ? error.message : 'Unable to read Session Storage'
    }
  }
}

function namespaceKey(uuid: string, originRaw: string): Buffer {
  return Buffer.concat([Buffer.from(`${NAMESPACE_PREFIX}${uuid}-`, 'latin1'), Buffer.from(originRaw, 'utf8')])
}

function mapKey(mapId: string, key: string): Buffer {
  return Buffer.concat([Buffer.from(`${MAP_PREFIX}${mapId}-`, 'latin1'), Buffer.from(key, 'utf8')])
}

export async function mergeSessionStorageDirs(
  stagedDir: string,
  realDir: string,
  origin: string
): Promise<{ merged: number; detail?: string }> {
  const staged = await readSessionStorageDir(stagedDir)
  if (!staged.readable) return { merged: 0, detail: 'The staged Session Storage store could not be read.' }
  const namespaces = staged.namespaces.filter((namespace) => namespace.origin === origin)
  if (namespaces.length === 0) return { merged: 0 }
  const stagedMapIds = new Set(namespaces.map((namespace) => namespace.mapId))
  const stagedEntries = staged.entries.filter((entry) => stagedMapIds.has(entry.mapId))
  if (stagedEntries.length === 0) return { merged: 0 }

  const real = await readSessionStorageDir(realDir)
  const originRaw = namespaces[0].originRaw
  let targetMapId = real.namespaces.find((namespace) => namespace.origin === origin)?.mapId
  const used = new Set<string>([...real.entries.map((entry) => entry.mapId), ...real.namespaces.map((namespace) => namespace.mapId)])
  if (!targetMapId) {
    let candidate = 0
    while (used.has(String(candidate))) candidate += 1
    targetMapId = String(candidate)
  }

  const db = new ClassicLevel<Buffer, Buffer>(realDir, { keyEncoding: 'binary', valueEncoding: 'binary' })
  await db.open()
  try {
    if (!real.namespaces.some((namespace) => namespace.origin === origin)) {
      await db.put(namespaceKey(randomUUID().replace(/-/g, '_'), originRaw), Buffer.from(targetMapId, 'latin1'))
    }
    for (const entry of stagedEntries) {
      await db.put(mapKey(targetMapId, entry.key), Buffer.from(entry.value, 'utf16le'))
    }
    return { merged: stagedEntries.length }
  } finally {
    await db.close().catch(() => undefined)
  }
}
