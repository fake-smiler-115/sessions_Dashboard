import fs from 'fs/promises'
import path from 'path'
import Database from 'better-sqlite3'
import { ClassicLevel } from 'classic-level'
import type { BrowserId } from '../../../shared/types/browser'
import { resolveChromiumPaths } from '../../../core/inspectors/chromium/paths'
import { cookieHostMatches } from '../../../core/inspectors/chromium/cookies'
import { mergeSessionStorageDirs } from '../../../core/inspectors/chromium/session-storage'

export interface StagedMergeResult {
  cookies: number
  localStorageKeys: number
  sessionStorageKeys: number
  details: string[]
}

function columnNames(db: Database.Database): string[] {
  return (db.prepare('PRAGMA table_info(cookies)').all() as Array<{ name: string }>).map((row) => row.name)
}

export async function mergeStagedCookies(
  stagedDbPath: string,
  realDbPath: string,
  host: string
): Promise<{ merged: number; detail?: string }> {
  const staged = new Database(stagedDbPath, { readonly: true, fileMustExist: true })
  try {
    const stagedColumns = columnNames(staged)
    if (stagedColumns.length === 0) return { merged: 0, detail: 'The staged profile had no cookies table.' }
    const rows = staged.prepare('SELECT * FROM cookies').all() as Array<Record<string, unknown>>
    const matching = rows.filter((row) => cookieHostMatches(String(row.host_key ?? ''), host))
    if (matching.length === 0) return { merged: 0 }

    let real: Database.Database
    try {
      real = new Database(realDbPath, { fileMustExist: true })
    } catch {
      await fs.copyFile(stagedDbPath, realDbPath)
      return { merged: matching.length, detail: 'The destination had no cookie database; the staged database was installed.' }
    }
    try {
      const realColumns = columnNames(real)
      const common = stagedColumns.filter((column) => realColumns.includes(column))
      if (common.length === 0) return { merged: 0, detail: 'The destination cookie schema is incompatible.' }
      const placeholders = common.map(() => '?').join(',')
      const insert = real.prepare(`INSERT INTO cookies (${common.join(',')}) VALUES (${placeholders})`)
      const keyColumns = ['host_key', 'name', 'path', 'top_frame_site_key', 'has_cross_site_ancestor', 'source_scheme', 'source_port'].filter(
        (column) => common.includes(column)
      )
      const where = keyColumns.map((column) => `${column} = ?`).join(' AND ')
      const remove = real.prepare(`DELETE FROM cookies WHERE ${where}`)
      const transaction = real.transaction((list: Array<Record<string, unknown>>) => {
        for (const row of list) {
          remove.run(keyColumns.map((column) => row[column] as never))
          insert.run(common.map((column) => row[column] as never))
        }
      })
      transaction(matching)
      return { merged: matching.length }
    } finally {
      real.close()
    }
  } finally {
    staged.close()
  }
}

export async function mergeStagedLocalStorage(
  stagedDir: string,
  realDir: string,
  origin: string
): Promise<number> {
  await fs.mkdir(realDir, { recursive: true })
  const staged = new ClassicLevel<Buffer, Buffer>(stagedDir, { keyEncoding: 'binary', valueEncoding: 'binary' })
  const real = new ClassicLevel<Buffer, Buffer>(realDir, { keyEncoding: 'binary', valueEncoding: 'binary' })
  await staged.open()
  await real.open()
  try {
    const prefix = Buffer.concat([Buffer.from(`_${origin}`), Buffer.from([0])])
    let merged = 0
    for await (const [key, value] of staged.iterator()) {
      const keyBuffer = Buffer.isBuffer(key) ? key : Buffer.from(key)
      if (keyBuffer.length >= prefix.length && keyBuffer.subarray(0, prefix.length).equals(prefix)) {
        const valueBuffer = Buffer.isBuffer(value) ? value : Buffer.from(value)
        await real.put(keyBuffer, valueBuffer)
        merged += 1
      }
    }
    return merged
  } finally {
    await staged.close().catch(() => undefined)
    await real.close().catch(() => undefined)
  }
}

export async function mergeStagedProfile(input: {
  browserId: BrowserId
  realProfileDir: string
  stagedProfileDir: string
  origin: string
}): Promise<StagedMergeResult> {
  const details: string[] = []
  let cookies = 0
  let localStorageKeys = 0
  let sessionStorageKeys = 0
  const host = new URL(input.origin).hostname

  const stagedPaths = await resolveChromiumPaths(input.stagedProfileDir)
  const realPaths = await resolveChromiumPaths(input.realProfileDir)

  if (stagedPaths.cookiesDb) {
    const realCookies = realPaths.cookiesDb ?? path.join(input.realProfileDir, path.basename(stagedPaths.cookiesDb))
    try {
      const result = await mergeStagedCookies(stagedPaths.cookiesDb, realCookies, host)
      cookies = result.merged
      if (result.detail) details.push(result.detail)
    } catch (error) {
      details.push(`Cookies could not be merged into the destination: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  if (stagedPaths.localStorageDir) {
    const realLocalStorage = realPaths.localStorageDir ?? path.join(input.realProfileDir, 'Local Storage', 'leveldb')
    try {
      localStorageKeys = await mergeStagedLocalStorage(stagedPaths.localStorageDir, realLocalStorage, input.origin)
    } catch (error) {
      details.push(
        `Local Storage could not be merged into the destination: ${error instanceof Error ? error.message : 'unknown error'}`
      )
    }
  }

  if (stagedPaths.sessionStorageDir && realPaths.sessionStorageDir) {
    try {
      const result = await mergeSessionStorageDirs(stagedPaths.sessionStorageDir, realPaths.sessionStorageDir, input.origin)
      sessionStorageKeys = result.merged
      if (result.detail) details.push(result.detail)
    } catch (error) {
      details.push(
        `Session Storage could not be merged into the destination: ${error instanceof Error ? error.message : 'unknown error'}`
      )
    }
  }

  return { cookies, localStorageKeys, sessionStorageKeys, details }
}
