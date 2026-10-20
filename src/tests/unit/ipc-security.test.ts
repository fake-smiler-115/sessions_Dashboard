import { describe, it, expect } from 'vitest'
import { IpcSchemas } from '../../shared/schemas/ipc'
import { registerAllowedDir, assertAllowedDir } from '../../main/security/profile-registry'
import { createTempDir } from '../fixtures/profile'
import fs from 'fs/promises'
import path from 'path'
import { isSafePath } from '../../main/filesystem/safe'

describe('IPC validation', () => {
  it('rejects positional arguments', () => {
    expect(IpcSchemas.getInventory.safeParse('/tmp/x').success).toBe(false)
    expect(IpcSchemas.getSitePlan.safeParse({ origin: 'https://x.test' }).success).toBe(false)
  })

  it('requires explicit migration confirmation', () => {
    const base = {
      sourceBrowserId: 'chrome',
      sourceProfileDir: '/tmp/a',
      destBrowserId: 'brave',
      destProfileDir: '/tmp/b',
      origin: 'https://example.com',
      categories: ['cookies'],
      persistSessionCookies: true
    }
    expect(IpcSchemas.startSiteMigration.safeParse(base).success).toBe(false)
    expect(
      IpcSchemas.startSiteMigration.safeParse({ ...base, confirmation: 'migrate-website-session' }).success
    ).toBe(true)
  })

  it('blocks paths that were not explicitly selected', async () => {
    const dir = await createTempDir('bmt-allowed-')
    try {
      await expect(assertAllowedDir(dir)).rejects.toThrow(/not selected/)
      registerAllowedDir(dir)
      await expect(assertAllowedDir(dir)).resolves.toBe(path.resolve(dir))
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  it('detects path traversal', () => {
    expect(isSafePath('/tmp/profile', '/tmp/profile/Default')).toBe(true)
    expect(isSafePath('/tmp/profile', '/tmp/profile/../secrets')).toBe(false)
    expect(isSafePath('/tmp/profile', '/tmp/profile-other')).toBe(false)
  })
})
