import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { backupDestinationData } from '../../main/migration/session/backup'
import { createChromiumFixture, createTempDir } from '../fixtures/profile'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.()
})

describe('destination backup', () => {
  it('copies cookie and Local Storage data with checksums', async () => {
    const fixture = await createChromiumFixture()
    const root = await createTempDir('bmt-backups-')
    cleanups.push(fixture.cleanup, async () => fs.rm(root, { recursive: true, force: true }))
    const result = await backupDestinationData(fixture.dir, 'https://example.com', root)
    expect(result.fileCount).toBeGreaterThan(0)
    const manifest = JSON.parse(await fs.readFile(result.manifestPath, 'utf8'))
    expect(manifest.files.length).toBe(result.fileCount)
    for (const file of manifest.files) {
      const stored = path.join(result.backupPath, file.stored)
      const hash = crypto.createHash('sha256').update(await fs.readFile(stored)).digest('hex')
      expect(hash).toBe(file.sha256)
    }
    const cookieCopy = path.join(result.backupPath, 'files', 'Cookies')
    expect(await fs.readFile(cookieCopy)).toEqual(await fs.readFile(path.join(fixture.dir, 'Cookies')))
  })

  it('does not modify the destination during backup', async () => {
    const fixture = await createChromiumFixture()
    const root = await createTempDir('bmt-backups-')
    cleanups.push(fixture.cleanup, async () => fs.rm(root, { recursive: true, force: true }))
    const before = await fs.readFile(path.join(fixture.dir, 'Cookies'))
    await backupDestinationData(fixture.dir, 'https://example.com', root)
    const after = await fs.readFile(path.join(fixture.dir, 'Cookies'))
    expect(after.equals(before)).toBe(true)
  })
})
