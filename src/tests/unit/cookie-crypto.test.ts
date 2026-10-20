import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import {
  decryptChromiumCookieValue,
  deriveChromiumCookieKey,
  isEncryptedChromiumValue
} from '../../core/security/cookie-crypto'

function encrypt(value: string, key: Buffer, hostKey?: string, version = 'v10'): Buffer {
  const cipher = crypto.createCipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20))
  const prefix = hostKey ? crypto.createHash('sha256').update(hostKey).digest() : Buffer.alloc(0)
  const encrypted = Buffer.concat([cipher.update(Buffer.concat([prefix, Buffer.from(value, 'utf8')])), cipher.final()])
  return Buffer.concat([Buffer.from(version, 'ascii'), encrypted])
}

describe('Chromium cookie crypto', () => {
  it('derives the documented macOS key length', () => {
    expect(deriveChromiumCookieKey('secret')).toHaveLength(16)
  })

  it('round-trips v10 values', () => {
    const key = deriveChromiumCookieKey('secret')
    const encrypted = encrypt('hello', key)
    expect(isEncryptedChromiumValue(encrypted)).toBe(true)
    expect(decryptChromiumCookieValue(encrypted, key)).toBe('hello')
  })

  it('strips the domain hash prefix when present', () => {
    const key = deriveChromiumCookieKey('secret')
    const encrypted = encrypt('value', key, 'example.com')
    expect(decryptChromiumCookieValue(encrypted, key, 'example.com')).toBe('value')
  })

  it('rejects unknown formats', () => {
    expect(() => decryptChromiumCookieValue(Buffer.from('plain'), deriveChromiumCookieKey('secret'))).toThrow(
      /Unsupported/
    )
  })
})
