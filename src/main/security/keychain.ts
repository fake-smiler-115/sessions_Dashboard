import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const cache = new Map<string, string>()

export async function readGenericPassword(service: string): Promise<string> {
  const cached = cache.get(service)
  if (cached !== undefined) return cached
  try {
    const { stdout } = await execFileAsync('security', ['find-generic-password', '-w', '-s', service], {
      timeout: 60000,
      maxBuffer: 1024 * 1024
    })
    const secret = stdout.replace(/\r?\n$/, '')
    if (!secret) throw new Error('Keychain item is empty')
    cache.set(service, secret)
    return secret
  } catch {
    throw new Error('macOS Keychain access was denied or the encryption key was not found')
  }
}

export function clearKeychainCache(): void {
  cache.clear()
}

export async function hasKeychainItem(service: string): Promise<boolean> {
  try {
    await execFileAsync('security', ['find-generic-password', '-s', service], { timeout: 5000 })
    return true
  } catch {
    return false
  }
}
