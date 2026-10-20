import { describe, it, expect, afterEach } from 'vitest'
import path from 'path'
import { createChromiumFixture, writeLocalStorage } from '../fixtures/profile'
import { resolveChromiumPaths } from '../../core/inspectors/chromium/paths'
import { readCookieRows, cookieHostMatches } from '../../core/inspectors/chromium/cookies'
import { readLocalStorageDir } from '../../core/inspectors/chromium/local-storage'
import { mergeStagedCookies, mergeStagedLocalStorage, mergeStagedProfile } from '../../main/migration/session/staged'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.()
})

async function fixtures() {
  const staged = await createChromiumFixture()
  const real = await createChromiumFixture()
  cleanups.push(staged.cleanup, real.cleanup)
  return { staged, real }
}

describe('staged destination merge', () => {
  it('merges only cookies for the origin host and keeps unrelated rows', async () => {
    const { staged, real } = await fixtures()
    const stagedPaths = await resolveChromiumPaths(staged.dir)
    const realPaths = await resolveChromiumPaths(real.dir)
    const result = await mergeStagedCookies(stagedPaths.cookiesDb!, realPaths.cookiesDb!, 'example.com')
    expect(result.merged).toBe(2)

    const rows = await readCookieRows(realPaths.cookiesDb!)
    expect(rows.filter((row) => cookieHostMatches(row.hostKey, 'example.com')).length).toBe(2)
    expect(rows.filter((row) => row.hostKey === 'other.test').length).toBe(1)
  })

  it('overwrites matching Local Storage keys and keeps unrelated origins', async () => {
    const { staged, real } = await fixtures()
    const realPaths = await resolveChromiumPaths(real.dir)
    await writeLocalStorage(realPaths.localStorageDir!, [{ origin: 'https://example.com', key: 'token', value: 'OLD' }])

    const stagedPaths = await resolveChromiumPaths(staged.dir)
    const merged = await mergeStagedLocalStorage(stagedPaths.localStorageDir!, realPaths.localStorageDir!, 'https://example.com')
    expect(merged).toBe(2)

    const read = await readLocalStorageDir(realPaths.localStorageDir!)
    expect(read.records.find((record) => record.origin === 'https://example.com' && record.key === 'token')?.value).toBe('abc123')
    expect(read.records.find((record) => record.origin === 'https://example.com' && record.key === 'unicode')?.value).toBe('héllo')
    expect(read.records.find((record) => record.origin === 'https://other.test' && record.key === 'x')?.value).toBe('y')
  })

  it('merges a full staged profile into the destination', async () => {
    const { staged, real } = await fixtures()
    const result = await mergeStagedProfile({
      browserId: 'chrome',
      realProfileDir: real.dir,
      stagedProfileDir: staged.dir,
      origin: 'https://example.com'
    })
    expect(result.cookies).toBe(2)
    expect(result.localStorageKeys).toBe(2)
    expect(result.details).toEqual([])
  })

  it('reports the destination profile it merges into', async () => {
    const { staged, real } = await fixtures()
    const realPaths = await resolveChromiumPaths(real.dir)
    await mergeStagedProfile({
      browserId: 'chrome',
      realProfileDir: real.dir,
      stagedProfileDir: staged.dir,
      origin: 'https://example.com'
    })
    const rows = await readCookieRows(realPaths.cookiesDb!)
    expect(rows.some((row) => row.name === 'session')).toBe(true)
    expect(path.basename(real.dir).startsWith('bmt-profile-')).toBe(true)
  })
})
