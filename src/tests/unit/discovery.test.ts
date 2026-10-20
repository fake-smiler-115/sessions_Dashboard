import { describe, it, expect } from 'vitest'
import { detectProfiles } from '../../main/browser-discovery/discover'

describe('discovery', () => {
  it('returns array', async () => {
    const res = await detectProfiles()
    expect(Array.isArray(res)).toBe(true)
  })
})
