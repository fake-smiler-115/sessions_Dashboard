import { describe, it, expect } from 'vitest'
import { buildBundle, parseBundle, serializeBundle, summarizeBundle } from '../../core/session/bundle'
import type { SourceSiteData } from '../../core/session/types'

function sampleData(): SourceSiteData {
  return {
    origin: 'https://example.com',
    cookies: [
      {
        name: 'sid',
        value: 'secret',
        domain: '.example.com',
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 1,
        session: false,
        expiresUnix: 1_800_000_000
      }
    ],
    localStorage: [{ origin: 'https://example.com', key: 'token', value: 'abc123' }],
    sessionStorage: [{ origin: 'https://example.com', key: 'tab', value: '1' }],
    skippedExpiredCookies: 0
  }
}

describe('portable session bundle', () => {
  it('includes only the requested categories', () => {
    const bundle = buildBundle({
      sourceBrowserId: 'chrome',
      origin: 'https://example.com',
      categories: ['cookies'],
      data: sampleData()
    })
    expect(bundle.cookies).toHaveLength(1)
    expect(bundle.localStorage).toHaveLength(0)
    expect(bundle.sessionStorage).toHaveLength(0)
    expect(bundle.categories).toEqual(['cookies'])
    expect(bundle.format).toBe('session-transfer-bundle')
    expect(bundle.version).toBe(1)
  })

  it('round-trips through JSON with values intact', () => {
    const bundle = buildBundle({
      sourceBrowserId: 'chrome',
      sourceProfileId: 'Default',
      origin: 'https://example.com',
      categories: ['cookies', 'localStorage', 'sessionStorage'],
      data: sampleData(),
      generatedAt: '2026-01-01T00:00:00.000Z'
    })
    const parsed = parseBundle(serializeBundle(bundle))
    expect(parsed.cookies[0].value).toBe('secret')
    expect(parsed.localStorage[0].value).toBe('abc123')
    expect(parsed.sessionStorage[0].value).toBe('1')
    expect(parsed.source.profileId).toBe('Default')
    const summary = summarizeBundle(parsed)
    expect(summary.counts).toEqual({ cookies: 1, localStorage: 1, sessionStorage: 1 })
  })

  it('rejects files that are not valid bundles', () => {
    expect(() => parseBundle('not json')).toThrow(/valid JSON/)
    expect(() => parseBundle('{"format":"other"}')).toThrow(/supported session bundle/)
  })

  it('drops categories that produced no records', () => {
    const data = sampleData()
    data.cookies = []
    const bundle = buildBundle({
      sourceBrowserId: 'chrome',
      origin: 'https://example.com',
      categories: ['cookies', 'localStorage'],
      data
    })
    expect(bundle.categories).toEqual(['localStorage'])
  })
})
