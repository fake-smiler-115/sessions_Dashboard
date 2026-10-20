import { describe, it, expect } from 'vitest'
import { getCompatibility } from '../../main/migration/compat'

describe('compatibility', () => {
  it('same browser returns same-profile', async () => {
    const c = await getCompatibility('chrome', 'chrome')
    expect(c.bookmarks).toBe('Same browser/profile')
  })
  it('does not claim unimplemented categories', async () => {
    const c = await getCompatibility('chrome', 'brave')
    expect(c.bookmarks).toBe('Unsupported')
    expect(c.cookies).toBe('Requires permission')
    expect(c.localStorage).toBe('Partially supported')
  })

  it('does not treat Arc as a supported destination', async () => {
    const c = await getCompatibility('chrome', 'arc')
    expect(c.cookies).toBe('Unsupported')
  })
})
