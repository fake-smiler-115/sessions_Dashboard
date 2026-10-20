import fs from 'fs/promises'
import path from 'path'

const allowedDirs = new Set<string>()

function normalize(dir: string): string {
  return path.resolve(dir)
}

export function registerAllowedDir(dir: string): void {
  allowedDirs.add(normalize(dir))
}

export function isAllowedDir(dir: string): boolean {
  return allowedDirs.has(normalize(dir))
}

export async function assertAllowedDir(dir: string): Promise<string> {
  const resolved = normalize(dir)
  if (!isAllowedDir(resolved)) {
    throw new Error('Profile directory was not selected or discovered in this session')
  }
  const st = await fs.lstat(resolved).catch(() => undefined)
  if (!st || !st.isDirectory() || st.isSymbolicLink()) {
    throw new Error('Profile directory is not an accessible directory')
  }
  return resolved
}
