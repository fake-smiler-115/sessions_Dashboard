import { describe, it, expect } from 'vitest'
import { IpcSchemas } from '../../shared/schemas/ipc'

describe('IPC schemas', () => {
  it('accepts object payloads from preload', () => {
    expect(IpcSchemas.getInventory.safeParse({ profileDir: '/tmp/x' }).success).toBe(true)
    expect(IpcSchemas.createBackup.safeParse({ destProfileDir: '/tmp/x' }).success).toBe(true)
    expect(
      IpcSchemas.getCompatibility.safeParse({ sourceBrowserId: 'chrome', destBrowserId: 'arc' }).success
    ).toBe(true)
  })

  it('rejects positional strings', () => {
    expect(IpcSchemas.getInventory.safeParse('/tmp/x').success).toBe(false)
  })

  it('rejects empty paths', () => {
    expect(IpcSchemas.getInventory.safeParse({ profileDir: '' }).success).toBe(false)
  })
})
