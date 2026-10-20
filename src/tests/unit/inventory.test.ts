import { describe, it, expect } from 'vitest'
import { getInventory } from '../../main/filesystem/inventory'
import os from 'os'
import path from 'path'
import fs from 'fs/promises'

describe('inventory', () => {
  it('walks temp dir', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bmt-'))
    const Database = (await import('better-sqlite3')).default
    const db = new Database(path.join(dir, 'test.db'))
    db.exec('CREATE TABLE t (a TEXT)')
    db.close()
    const inv = await getInventory(dir)
    expect(inv.databases.length).toBeGreaterThan(0)
    await fs.rm(dir, { recursive: true, force: true })
  })
})
