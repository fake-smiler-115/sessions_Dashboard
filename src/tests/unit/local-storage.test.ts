import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import {
  decodeLocalStorageValue,
  parseLocalStorageKey,
  readLocalStorageDir
} from '../../core/inspectors/chromium/local-storage'
import { createChromiumFixture, createTempDir, writeLocalStorage } from '../fixtures/profile'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.()
})

describe('Local Storage decoding', () => {
  it('parses origin and key', () => {
    const raw = Buffer.concat([Buffer.from('_https://example.com'), Buffer.from([0]), Buffer.from([1]), Buffer.from('token')])
    expect(parseLocalStorageKey(raw)).toEqual({ origin: 'https://example.com', key: 'token' })
  })

  it('decodes latin1 and UTF-16 values', () => {
    expect(decodeLocalStorageValue(Buffer.concat([Buffer.from([1]), Buffer.from('hé', 'latin1')]))).toBe('hé')
    const utf16 = Buffer.from('hello', 'utf16le')
    expect(decodeLocalStorageValue(Buffer.concat([Buffer.from([0]), utf16]))).toBe('hello')
  })

  it('ignores metadata keys', () => {
    expect(parseLocalStorageKey(Buffer.from('META:https://example.com'))).toBeNull()
  })

  it('ignores partitioned composite storage keys', () => {
    const raw = Buffer.concat([
      Buffer.from('_https://geo.captcha-delivery.com/^0https://github.com'),
      Buffer.from([0, 1]),
      Buffer.from('key')
    ])
    expect(parseLocalStorageKey(raw)).toBeNull()
  })

  it('ignores non-http origins', () => {
    const raw = Buffer.concat([Buffer.from('_chrome-extension://abcdef'), Buffer.from([0, 1]), Buffer.from('key')])
    expect(parseLocalStorageKey(raw)).toBeNull()
  })
})

describe('Local Storage inspection', () => {
  it('reads origins without modifying the source', async () => {
    const fixture = await createChromiumFixture()
    cleanups.push(fixture.cleanup)
    const dir = path.join(fixture.dir, 'Local Storage', 'leveldb')
    const before = await listChecksums(dir)
    const result = await readLocalStorageDir(dir)
    const after = await listChecksums(dir)
    expect(result.readable).toBe(true)
    expect(result.origins.find((entry) => entry.origin === 'https://example.com')?.count).toBe(2)
    expect(result.records.find((record) => record.key === 'unicode')?.value).toBe('héllo')
    expect(after).toEqual(before)
  })

  it('reports unreadable stores without throwing', async () => {
    const dir = await createTempDir('bmt-bad-level-')
    cleanups.push(async () => fs.rm(dir, { recursive: true, force: true }))
    await fs.writeFile(path.join(dir, 'CURRENT'), 'not-a-manifest')
    const result = await readLocalStorageDir(dir)
    expect(result.readable).toBe(false)
  })

  it('round-trips a synthetic store', async () => {
    const dir = await createTempDir('bmt-ls-')
    cleanups.push(async () => fs.rm(dir, { recursive: true, force: true }))
    await writeLocalStorage(dir, [{ origin: 'https://a.test', key: 'k', value: 'v' }])
    const read = await readLocalStorageDir(dir)
    expect(read.records).toEqual([{ origin: 'https://a.test', key: 'k', value: 'v' }])
  })
})

async function listChecksums(dir: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  for (const entry of await fs.readdir(dir)) {
    const full = path.join(dir, entry)
    const stat = await fs.stat(full)
    if (stat.isFile()) result[entry] = crypto.createHash('sha256').update(await fs.readFile(full)).digest('hex')
  }
  return result
}
