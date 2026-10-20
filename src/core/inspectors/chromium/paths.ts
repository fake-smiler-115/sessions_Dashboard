import fs from 'fs/promises'
import path from 'path'

export interface ChromiumProfilePaths {
  profileDir: string
  cookiesDb?: string
  localStorageDir?: string
  sessionStorageDir?: string
  indexedDbDir?: string
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export async function resolveChromiumPaths(profileDir: string): Promise<ChromiumProfilePaths> {
  const candidates = [path.join(profileDir, 'Network', 'Cookies'), path.join(profileDir, 'Cookies')]
  let cookiesDb: string | undefined
  for (const candidate of candidates) {
    if (await exists(candidate)) {
      cookiesDb = candidate
      break
    }
  }
  const localStorage = path.join(profileDir, 'Local Storage', 'leveldb')
  const sessionStorage = path.join(profileDir, 'Session Storage')
  const indexedDb = path.join(profileDir, 'IndexedDB')
  return {
    profileDir,
    cookiesDb,
    localStorageDir: (await exists(localStorage)) ? localStorage : undefined,
    sessionStorageDir: (await exists(sessionStorage)) ? sessionStorage : undefined,
    indexedDbDir: (await exists(indexedDb)) ? indexedDb : undefined
  }
}
