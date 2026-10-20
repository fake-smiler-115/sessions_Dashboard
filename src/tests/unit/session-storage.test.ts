import { describe, it, expect, afterEach } from 'vitest'
import path from 'path'
import { createTempDir, writeSessionStorage } from '../fixtures/profile'
import { readSessionStorageDir, mergeSessionStorageDirs, normalizeSessionStorageOrigin } from '../../core/inspectors/chromium/session-storage'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.()
})

async function tempStore(entries: Array<{ origin: string; key: string; value: string }>) {
  const dir = path.join(await createTempDir('bmt-ss-'), 'Session Storage')
  cleanups.push(async () => {
    const { rm } = await import('fs/promises')
    await rm(path.dirname(dir), { recursive: true, force: true })
  })
  await writeSessionStorage(dir, entries)
  return dir
}

describe('Session Storage reader', () => {
  it('normalises trailing slashes in origins', () => {
    expect(normalizeSessionStorageOrigin('https://example.com/')).toBe('https://example.com')
    expect(normalizeSessionStorageOrigin('https://example.com')).toBe('https://example.com')
  })

  it('reads namespaced UTF-16LE records', async () => {
    const dir = await tempStore([
      { origin: 'https://example.com', key: 'tab', value: '1' },
      { origin: 'https://example.com', key: 'unicode', value: 'héllo' },
      { origin: 'https://other.test', key: 'x', value: 'y' }
    ])
    const read = await readSessionStorageDir(dir)
    expect(read.readable).toBe(true)
    expect(read.records).toHaveLength(3)
    const unicode = read.records.find((record) => record.key === 'unicode')
    expect(unicode?.origin).toBe('https://example.com')
    expect(unicode?.value).toBe('héllo')
    const summary = read.origins.find((entry) => entry.origin === 'https://example.com')
    expect(summary?.count).toBe(2)
  })

  it('reports unreadable stores instead of throwing', async () => {
    const read = await readSessionStorageDir(path.join(await createTempDir('bmt-ss-missing-'), 'Session Storage'))
    expect(read.readable).toBe(false)
    expect(read.error).toBeTruthy()
  })
})

describe('Session Storage merge', () => {
  it('overwrites into an existing origin namespace and keeps unrelated origins', async () => {
    const stagedDir = await tempStore([{ origin: 'https://example.com', key: 'tab', value: 'NEW' }])
    const realDir = await tempStore([
      { origin: 'https://example.com', key: 'tab', value: 'OLD' },
      { origin: 'https://other.test', key: 'x', value: 'y' }
    ])
    const result = await mergeSessionStorageDirs(stagedDir, realDir, 'https://example.com')
    expect(result.merged).toBe(1)
    const read = await readSessionStorageDir(realDir)
    expect(read.records.find((record) => record.origin === 'https://example.com' && record.key === 'tab')?.value).toBe('NEW')
    expect(read.records.find((record) => record.origin === 'https://other.test' && record.key === 'x')?.value).toBe('y')
  })

  it('creates a namespace when the destination has no record for the origin', async () => {
    const stagedDir = await tempStore([{ origin: 'https://example.com', key: 'tab', value: 'NEW' }])
    const realDir = await tempStore([{ origin: 'https://other.test', key: 'x', value: 'y' }])
    const result = await mergeSessionStorageDirs(stagedDir, realDir, 'https://example.com')
    expect(result.merged).toBe(1)
    const read = await readSessionStorageDir(realDir)
    expect(read.records.find((record) => record.origin === 'https://example.com' && record.key === 'tab')?.value).toBe('NEW')
  })
})
