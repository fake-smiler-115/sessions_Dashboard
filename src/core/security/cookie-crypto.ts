import crypto from 'crypto'

const IV = Buffer.alloc(16, 0x20)

export function deriveChromiumCookieKey(secret: string, iterations = 1003): Buffer {
  return crypto.pbkdf2Sync(secret, 'saltysalt', iterations, 16, 'sha1')
}

export function isEncryptedChromiumValue(value: Buffer): boolean {
  if (value.length < 3) return false
  return value[0] === 0x76 && value[1] === 0x31 && (value[2] === 0x30 || value[2] === 0x31)
}

export function decryptChromiumCookieValue(encrypted: Buffer, key: Buffer, hostKey?: string): string {
  if (!isEncryptedChromiumValue(encrypted)) {
    throw new Error('Unsupported cookie encryption format')
  }
  const version = encrypted.subarray(0, 3).toString('ascii')
  if (version === 'v20') {
    throw new Error('App-bound cookie encryption is not supported')
  }
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, IV)
  let output = Buffer.concat([decipher.update(encrypted.subarray(3)), decipher.final()])
  if (hostKey && output.length > 32) {
    const expected = crypto.createHash('sha256').update(hostKey).digest()
    if (output.subarray(0, 32).equals(expected)) {
      output = output.subarray(32)
    }
  }
  return output.toString('utf8')
}
