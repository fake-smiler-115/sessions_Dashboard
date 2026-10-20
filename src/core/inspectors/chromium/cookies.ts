import Database from 'better-sqlite3'
import { withFileSnapshot } from './snapshot'

export interface ChromiumCookieRow {
  hostKey: string
  name: string
  path: string
  expiresUtc: number
  isSecure: boolean
  isHttpOnly: boolean
  sameSite: number
  isPersistent: boolean
  plainValue: string
  encryptedValue: Buffer | null
  sourcePort: number
  topFrameSiteKey: string
}

export interface CookieSummary {
  host: string
  count: number
  encryptedCount: number
  sizeBytes: number
}

interface RawCookieRow {
  host_key: string
  name: string
  path: string
  expires_utc: number
  is_secure: number
  is_httponly: number
  samesite: number
  is_persistent: number
  value: string | null
  encrypted_value: Buffer | null
  source_port: number
  top_frame_site_key: string | null
}

export function cookieHostMatches(hostKey: string, host: string): boolean {
  const normalizedHost = host.toLowerCase()
  const key = hostKey.toLowerCase()
  if (key.startsWith('.')) {
    const domain = key.slice(1)
    return normalizedHost === domain || normalizedHost.endsWith(`.${domain}`)
  }
  return normalizedHost === key
}

export async function readCookieRows(dbPath: string): Promise<ChromiumCookieRow[]> {
  return withFileSnapshot(dbPath, (snapshotPath) => {
    const db = new Database(snapshotPath, { readonly: true, fileMustExist: true })
    try {
      db.pragma('query_only = ON')
      const columns = db.prepare('PRAGMA table_info(cookies)').all() as Array<{ name: string }>
      const names = new Set(columns.map((column) => column.name))
      if (!names.has('host_key') || !names.has('name') || !names.has('encrypted_value')) {
        throw new Error('Unrecognised cookie database schema')
      }
      const expiry = names.has('expires_utc') ? 'expires_utc' : '0 AS expires_utc'
      const secure = names.has('is_secure') ? 'is_secure' : '0 AS is_secure'
      const httpOnly = names.has('is_httponly') ? 'is_httponly' : '0 AS is_httponly'
      const sameSite = names.has('samesite') ? 'samesite' : '-1 AS samesite'
      const persistent = names.has('is_persistent') ? 'is_persistent' : '1 AS is_persistent'
      const value = names.has('value') ? 'value' : 'NULL AS value'
      const sourcePort = names.has('source_port') ? 'source_port' : '0 AS source_port'
      const partition = names.has('top_frame_site_key') ? 'top_frame_site_key' : "'' AS top_frame_site_key"
      const rows = db
        .prepare(
          `SELECT host_key, name, path, ${expiry}, ${secure}, ${httpOnly}, ${sameSite}, ${persistent}, ${value}, encrypted_value, ${sourcePort}, ${partition} FROM cookies`
        )
        .all() as RawCookieRow[]
      return rows.map((row) => ({
        hostKey: row.host_key,
        name: row.name,
        path: row.path,
        expiresUtc: Number(row.expires_utc) || 0,
        isSecure: Boolean(row.is_secure),
        isHttpOnly: Boolean(row.is_httponly),
        sameSite: Number(row.samesite),
        isPersistent: Boolean(row.is_persistent),
        plainValue: row.value ?? '',
        encryptedValue: row.encrypted_value && row.encrypted_value.length > 0 ? Buffer.from(row.encrypted_value) : null,
        sourcePort: Number(row.source_port) || 0,
        topFrameSiteKey: row.top_frame_site_key ?? ''
      }))
    } finally {
      db.close()
    }
  })
}

export function summarizeCookies(rows: ChromiumCookieRow[]): CookieSummary[] {
  const map = new Map<string, CookieSummary>()
  for (const row of rows) {
    const host = row.hostKey.replace(/^\./, '').toLowerCase()
    const existing = map.get(host) ?? { host, count: 0, encryptedCount: 0, sizeBytes: 0 }
    existing.count += 1
    if (row.encryptedValue) existing.encryptedCount += 1
    existing.sizeBytes += row.name.length + row.path.length + (row.encryptedValue?.length ?? row.plainValue.length)
    map.set(host, existing)
  }
  return [...map.values()]
}
