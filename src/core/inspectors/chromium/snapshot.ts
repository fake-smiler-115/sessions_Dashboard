import fs from 'fs/promises'
import path from 'path'
import os from 'os'

export async function withDirectorySnapshot<T>(sourceDir: string, fn: (snapshotDir: string) => Promise<T>): Promise<T> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bmt-snapshot-'))
  const snapshotDir = path.join(tempRoot, 'db')
  try {
    await fs.cp(sourceDir, snapshotDir, {
      recursive: true,
      filter: (src) => {
        const base = path.basename(src)
        return base !== 'LOCK'
      }
    })
    return await fn(snapshotDir)
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function withFileSnapshot<T>(filePath: string, fn: (snapshotPath: string) => Promise<T> | T): Promise<T> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bmt-snapshot-'))
  const snapshotPath = path.join(tempRoot, path.basename(filePath))
  try {
    await fs.copyFile(filePath, snapshotPath)
    for (const suffix of ['-wal', '-shm', '-journal']) {
      const sidecar = `${filePath}${suffix}`
      try {
        await fs.copyFile(sidecar, `${snapshotPath}${suffix}`)
      } catch {
        // sidecar absent
      }
    }
    return await fn(snapshotPath)
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined)
  }
}
