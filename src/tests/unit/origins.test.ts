import { describe, it, expect, afterEach } from 'vitest'
import { inspectProfileStorage, normalizeOrigin } from '../../core/inspectors/chromium/origins'
import { parseIndexedDbDirectoryName } from '../../core/inspectors/chromium/indexeddb'
import { createChromiumFixture } from '../fixtures/profile'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.()
})

describe('origin identification', () => {
  it('parses IndexedDB directory names', () => {
    expect(parseIndexedDbDirectoryName('https_example.com_0.indexeddb.leveldb')).toBe('https://example.com')
    expect(parseIndexedDbDirectoryName('https_example.com_8443.indexeddb.leveldb')).toBe('https://example.com:8443')
    expect(parseIndexedDbDirectoryName('https_example.com_443.indexeddb.leveldb')).toBe('https://example.com')
    expect(parseIndexedDbDirectoryName('not-a-database')).toBeNull()
  })

  it('groups cookies, Local Storage, IndexedDB and Session Storage', async () => {
    const fixture = await createChromiumFixture()
    cleanups.push(fixture.cleanup)
    const inspection = await inspectProfileStorage(fixture.dir)
    const example = inspection.origins.find((entry) => entry.origin === 'https://example.com')
    expect(example?.cookies).toBe(2)
    expect(example?.localStorage).toBe(2)
    expect(example?.indexedDB).toBe(1)
    expect(example?.sessionStorage).toBe(1)
    const other = inspection.origins.find((entry) => entry.origin === 'https://other.test')
    expect(other?.cookies).toBe(1)
    expect(other?.localStorage).toBe(1)
  })

  it('normalises only http(s) origins', () => {
    expect(normalizeOrigin('https://Example.com/path')).toBe('https://example.com')
    expect(() => normalizeOrigin('file:///tmp/x')).toThrow()
  })
})
