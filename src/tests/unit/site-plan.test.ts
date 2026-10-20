import { describe, it, expect } from 'vitest'
import { buildSitePlan, type PlanInput } from '../../core/session/plan'
import { getSessionCapabilities } from '../../core/session/capabilities'
import type { OriginSummary } from '../../shared/types/session'

const source: OriginSummary = {
  origin: 'https://example.com',
  host: 'example.com',
  browserId: 'chrome',
  profileId: 'Default',
  profileDir: '/tmp/chrome',
  cookies: 4,
  localStorage: 2,
  indexedDB: 1,
  sessionStorage: 1,
  estimatedSizeBytes: 100,
  readable: true,
  exportable: true,
  migratable: true,
  reasons: []
}

function input(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    origin: 'https://example.com',
    sourceProfile: { browserId: 'chrome', profileId: 'Default', profileDir: '/tmp/chrome' },
    destProfile: { browserId: 'brave', profileId: 'Default', profileDir: '/tmp/brave' },
    source,
    sourceCaps: getSessionCapabilities({
      browserId: 'chrome',
      installed: true,
      supportsCdp: true,
      hasKeychainService: true
    }),
    destCaps: getSessionCapabilities({
      browserId: 'brave',
      installed: true,
      supportsCdp: true,
      hasKeychainService: true
    }),
    destinationRunning: false,
    destinationExisting: { cookies: 0, localStorage: 0, indexedDB: 0 },
    keychainAvailable: true,
    sameProfile: false,
    ...overrides
  }
}

describe('site plan', () => {
  it('requires permission for cookies and marks Local Storage partial', () => {
    const plan = buildSitePlan(input())
    expect(plan.categories.find((c) => c.category === 'cookies')?.status).toBe('Requires permission')
    expect(plan.categories.find((c) => c.category === 'localStorage')?.status).toBe('Partially supported')
    expect(plan.categories.find((c) => c.category === 'indexedDB')?.status).toBe('Unsupported')
    expect(plan.canMigrate).toBe(true)
  })

  it('blocks a running destination', () => {
    const plan = buildSitePlan(input({ destinationRunning: true }))
    expect(plan.canMigrate).toBe(false)
    expect(plan.warnings.join(' ')).toMatch(/running/i)
  })

  it('reports same profile without pretending migration is supported', () => {
    const plan = buildSitePlan(input({ sameProfile: true }))
    expect(plan.canMigrate).toBe(false)
    expect(plan.categories.find((c) => c.category === 'cookies')?.status).toBe('Same browser/profile')
  })

  it('marks unsupported destinations', () => {
    const plan = buildSitePlan(
      input({
        destCaps: getSessionCapabilities({
          browserId: 'firefox',
          installed: true,
          supportsCdp: false,
          hasKeychainService: false
        }),
        destProfile: { browserId: 'firefox', profileId: 'x', profileDir: '/tmp/firefox' }
      })
    )
    expect(plan.canMigrate).toBe(false)
    expect(plan.categories.find((c) => c.category === 'cookies')?.status).toBe('Unsupported')
  })

  it('does not report undetected categories as migratable', () => {
    const plan = buildSitePlan(
      input({
        source: {
          ...source,
          cookies: 0,
          localStorage: 0,
          indexedDB: 0,
          sessionStorage: 0
        }
      })
    )
    expect(plan.categories.every((category) => category.status === 'Not detected')).toBe(true)
    expect(plan.canMigrate).toBe(false)
  })
})
