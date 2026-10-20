import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { createReadStream } from 'fs'
import { v4 as uuidv4 } from 'uuid'

export interface BackupResult {
  backupPath: string
  manifestPath: string
  fileCount: number
  totalBytes: number
}

interface ManifestFile {
  original: string
  stored: string
  sha256: string
  size: number
}

async function fileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

async function directorySize(dir: string): Promise<number> {
  let total = 0
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) total += await directorySize(full)
    else if (entry.isFile()) {
      const stat = await fs.stat(full).catch(() => undefined)
      total += stat?.size ?? 0
    }
  }
  return total
}

async function listFiles(dir: string): Promise<string[]> {
  const result: string[] = []
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) result.push(...(await listFiles(full)))
    else if (entry.isFile()) result.push(full)
  }
  return result
}

export async function backupDestinationData(
  destProfileDir: string,
  origin: string,
  backupRoot: string
): Promise<BackupResult> {
  const jobPart = uuidv4().slice(0, 8)
  const safeOrigin = origin.replace(/^[a-z]+:\/\//, '').replace(/[^a-zA-Z0-9._-]+/g, '_')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(backupRoot, `${stamp}-${safeOrigin}-${jobPart}`)
  const filesRoot = path.join(backupPath, 'files')

  const candidates: string[] = []
  const cookiesDb = path.join(destProfileDir, 'Cookies')
  const networkCookiesDb = path.join(destProfileDir, 'Network', 'Cookies')
  for (const db of [cookiesDb, networkCookiesDb]) {
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      candidates.push(`${db}${suffix}`)
    }
  }
  const localStorageDir = path.join(destProfileDir, 'Local Storage')

  let requiredBytes = 0
  for (const candidate of candidates) {
    const stat = await fs.stat(candidate).catch(() => undefined)
    if (stat?.isFile()) requiredBytes += stat.size
  }
  requiredBytes += await directorySize(localStorageDir)

  await fs.mkdir(backupRoot, { recursive: true, mode: 0o700 })
  const stats = await fs.statfs(backupRoot)
  const available = Number(stats.bavail) * Number(stats.bsize)
  if (available < requiredBytes + 1024 * 1024) {
    throw new Error('Not enough free disk space for the destination backup')
  }

  await fs.mkdir(filesRoot, { recursive: true, mode: 0o700 })
  const manifestFiles: ManifestFile[] = []

  const copyOne = async (sourcePath: string): Promise<void> => {
    const stat = await fs.stat(sourcePath).catch(() => undefined)
    if (!stat?.isFile()) return
    const relative = path.relative(destProfileDir, sourcePath)
    if (relative.startsWith('..') || path.isAbsolute(relative)) return
    const stored = path.join(filesRoot, relative)
    await fs.mkdir(path.dirname(stored), { recursive: true, mode: 0o700 })
    await fs.copyFile(sourcePath, stored)
    manifestFiles.push({
      original: sourcePath,
      stored: path.relative(backupPath, stored),
      sha256: await fileSha256(stored),
      size: stat.size
    })
  }

  for (const candidate of candidates) await copyOne(candidate)

  if (await fs.stat(localStorageDir).catch(() => undefined)) {
    const storedDir = path.join(filesRoot, 'Local Storage')
    await fs.cp(localStorageDir, storedDir, { recursive: true })
    for (const file of await listFiles(storedDir)) {
      const stat = await fs.stat(file)
      manifestFiles.push({
        original: path.join(destProfileDir, 'Local Storage', path.relative(storedDir, file)),
        stored: path.relative(backupPath, file),
        sha256: await fileSha256(file),
        size: stat.size
      })
    }
  }

  const manifestPath = path.join(backupPath, 'manifest.json')
  const manifest = {
    tool: 'Browser Migration Tool',
    version: '0.1.0',
    createdAt: Date.now(),
    origin,
    destProfileDir,
    files: manifestFiles
  }
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 })

  const totalBytes = manifestFiles.reduce((sum, file) => sum + file.size, 0)
  return { backupPath, manifestPath, fileCount: manifestFiles.length, totalBytes }
}
