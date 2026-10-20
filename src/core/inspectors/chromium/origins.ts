import type { OriginSummary } from '../../../shared/types/session'
import { resolveChromiumPaths } from './paths'
import { readCookieRows, summarizeCookies } from './cookies'
import { readLocalStorageDir } from './local-storage'
import { readSessionStorageDir } from './session-storage'
import { readIndexedDbOrigins } from './indexeddb'

export interface StorageInspection {
  origins: OriginSummary[]
  errors: string[]
  cookieHosts: Map<string, number>
  localStorageOrigins: Map<string, number>
  indexedDbOrigins: Map<string, number>
}

interface MutableOrigin {
  origin: string
  host: string
  cookies: number
  localStorage: number
  indexedDB: number
  sessionStorage: number
  estimatedSizeBytes: number
  readable: boolean
  exportable: boolean
  migratable: boolean
  reasons: Set<string>
}

function hostFromOrigin(origin: string): string {
  try {
    return new URL(origin).hostname
  } catch {
    return origin.replace(/^[a-z]+:\/\//, '').split('/')[0]
  }
}

export async function inspectProfileStorage(profileDir: string): Promise<StorageInspection> {
  const paths = await resolveChromiumPaths(profileDir)
  const map = new Map<string, MutableOrigin>()
  const errors: string[] = []
  const cookieHosts = new Map<string, number>()
  const localStorageOrigins = new Map<string, number>()
  const indexedDbOrigins = new Map<string, number>()

  const ensure = (origin: string): MutableOrigin => {
    const key = origin === 'file://' ? origin : origin.replace(/\/$/, '')
    const existing = map.get(key)
    if (existing) return existing
    const created: MutableOrigin = {
      origin: key,
      host: hostFromOrigin(key),
      cookies: 0,
      localStorage: 0,
      indexedDB: 0,
      sessionStorage: 0,
      estimatedSizeBytes: 0,
      readable: true,
      exportable: false,
      migratable: false,
      reasons: new Set<string>()
    }
    map.set(key, created)
    return created
  }

  if (paths.cookiesDb) {
    try {
      const rows = await readCookieRows(paths.cookiesDb)
      const summaries = summarizeCookies(rows)
      for (const summary of summaries) {
        const origin = `https://${summary.host}`
        const entry = ensure(origin)
        entry.cookies += summary.count
        entry.estimatedSizeBytes += summary.sizeBytes
        if (summary.encryptedCount > 0) {
          entry.reasons.add('Cookie values are encrypted and require macOS Keychain authorisation.')
        }
        const previous = cookieHosts.get(summary.host) ?? 0
        cookieHosts.set(summary.host, previous + summary.count)
      }
      if (rows.length === 0) errors.push('Cookie database is empty.')
    } catch (error) {
      errors.push(`Cookies: ${error instanceof Error ? error.message : 'unreadable database'}`)
    }
  } else {
    errors.push('Cookies: no supported cookie database found in this profile.')
  }

  if (paths.localStorageDir) {
    const ls = await readLocalStorageDir(paths.localStorageDir)
    if (!ls.readable) {
      errors.push(`Local Storage: ${ls.error ?? 'unreadable LevelDB store'}`)
    }
    for (const summary of ls.origins) {
      const entry = ensure(summary.origin)
      entry.localStorage += summary.count
      entry.estimatedSizeBytes += summary.sizeBytes
      localStorageOrigins.set(summary.origin, summary.count)
    }
    if (ls.skippedValues > 0) {
      errors.push(`${ls.skippedValues} Local Storage value(s) use an unsupported encoding and were not decoded.`)
    }
  } else {
    errors.push('Local Storage: no LevelDB store found in this profile.')
  }

  if (paths.indexedDbDir) {
    const idb = await readIndexedDbOrigins(paths.indexedDbDir)
    for (const summary of idb) {
      const entry = ensure(summary.origin)
      entry.indexedDB += summary.databases
      entry.estimatedSizeBytes += summary.sizeBytes
      entry.reasons.add('IndexedDB is inspectable but not migratable in this build.')
      indexedDbOrigins.set(summary.origin, summary.databases)
    }
  }

  if (paths.sessionStorageDir) {
    const sst = await readSessionStorageDir(paths.sessionStorageDir)
    if (!sst.readable) {
      errors.push(`Session Storage: ${sst.error ?? 'unreadable LevelDB store'}`)
    }
    for (const summary of sst.origins) {
      const entry = ensure(summary.origin)
      entry.sessionStorage += summary.count
      entry.estimatedSizeBytes += summary.sizeBytes
      entry.reasons.add('Session Storage is tab- and session-scoped; it is written into the destination tab.')
    }
  }

  for (const entry of map.values()) {
    entry.migratable = entry.cookies > 0 || entry.localStorage > 0 || entry.sessionStorage > 0
    entry.exportable = entry.localStorage > 0 || entry.cookies > 0 || entry.sessionStorage > 0
    entry.readable = entry.readable && !entry.reasons.has('Unreadable storage')
    if (entry.cookies === 0 && entry.localStorage === 0 && entry.sessionStorage > 0) {
      entry.reasons.add('Only session-scoped storage was found for this origin.')
    }
  }

  const origins = [...map.values()]
    .map((entry) => ({
      origin: entry.origin,
      host: entry.host,
      browserId: 'chrome' as const,
      profileId: '',
      profileDir,
      cookies: entry.cookies,
      localStorage: entry.localStorage,
      indexedDB: entry.indexedDB,
      sessionStorage: entry.sessionStorage,
      estimatedSizeBytes: entry.estimatedSizeBytes,
      readable: entry.readable,
      exportable: entry.exportable,
      migratable: entry.migratable,
      reasons: [...entry.reasons]
    }))
    .sort((a, b) => a.origin.localeCompare(b.origin))

  return { origins, errors, cookieHosts, localStorageOrigins, indexedDbOrigins }
}

export function normalizeOrigin(input: string): string {
  const parsed = new URL(input)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only http and https website origins are supported')
  }
  if (!parsed.hostname) throw new Error('Invalid website origin')
  return parsed.origin
}
