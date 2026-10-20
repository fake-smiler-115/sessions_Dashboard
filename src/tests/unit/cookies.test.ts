import { describe, it, expect, afterEach } from 'vitest'
import { cookieHostMatches, readCookieRows, summarizeCookies } from '../../core/inspectors/chromium/cookies'
import { createChromiumFixture } from '../fixtures/profile'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.()
})

describe('Chromium cookies', () => {
  it('matches host-only and domain cookies correctly', () => {
    expect(cookieHostMatches('example.com', 'example.com')).toBe(true)
    expect(cookieHostMatches('.example.com', 'www.example.com')).toBe(true)
    expect(cookieHostMatches('.example.com', 'badexample.com')).toBe(false)
    expect(cookieHostMatches('example.com', 'www.example.com')).toBe(false)
  })

  it('reads schema without exposing values in summaries', async () => {
    const fixture = await createChromiumFixture()
    cleanups.push(fixture.cleanup)
    const rows = await readCookieRows(`${fixture.dir}/Cookies`)
    expect(rows).toHaveLength(3)
    const summaries = summarizeCookies(rows)
    const example = summaries.find((entry) => entry.host === 'example.com')
    expect(example?.count).toBe(2)
    expect(JSON.stringify(summaries)).not.toContain('plain-session-value')
  })

  it('rejects unrecognised databases', async () => {
    const fixture = await createChromiumFixture()
    cleanups.push(fixture.cleanup)
    const { default: Database } = await import('better-sqlite3')
    const db = new Database(`${fixture.dir}/Cookies`)
    db.exec('DROP TABLE cookies')
    db.close()
    await expect(readCookieRows(`${fixture.dir}/Cookies`)).rejects.toThrow()
  })
})
