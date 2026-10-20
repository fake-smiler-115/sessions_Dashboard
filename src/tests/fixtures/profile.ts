import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import Database from 'better-sqlite3'
import { ClassicLevel } from 'classic-level'

export async function createTempDir(prefix = 'bmt-test-'): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

export async function createChromiumFixture(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await createTempDir('bmt-profile-')
  const cookieDb = path.join(dir, 'Cookies')
  const db = new Database(cookieDb)
  db.exec(`
    CREATE TABLE cookies (
      host_key TEXT, name TEXT, path TEXT, expires_utc INTEGER, is_secure INTEGER,
      is_httponly INTEGER, samesite INTEGER, is_persistent INTEGER, value TEXT,
      encrypted_value BLOB, source_port INTEGER
    )
  `)
  const insert = db.prepare(
    'INSERT INTO cookies (host_key,name,path,expires_utc,is_secure,is_httponly,samesite,is_persistent,value,encrypted_value,source_port) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
  )
  insert.run('example.com', 'session', '/', 0, 1, 1, 1, 0, 'plain-session-value', Buffer.alloc(0), 443)
  insert.run('.example.com', 'pref', '/', 13_500_000_000_000_000, 1, 0, 1, 1, 'plain-pref', Buffer.alloc(0), 443)
  insert.run('other.test', 'other', '/', 0, 0, 0, -1, 0, 'other-value', Buffer.alloc(0), 443)
  db.close()

  await writeLocalStorage(path.join(dir, 'Local Storage', 'leveldb'), [
    { origin: 'https://example.com', key: 'token', value: 'abc123' },
    { origin: 'https://example.com', key: 'unicode', value: 'héllo' },
    { origin: 'https://other.test', key: 'x', value: 'y' }
  ])
  await writeLocalStorage(path.join(dir, 'Session Storage'), [{ origin: 'https://example.com', key: 'tab', value: '1' }])

  const idb = path.join(dir, 'IndexedDB', 'https_example.com_0.indexeddb.leveldb')
  await fs.mkdir(idb, { recursive: true })
  await fs.writeFile(path.join(idb, 'CURRENT'), 'MANIFEST-000001\n')

  return {
    dir,
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true })
    }
  }
}

export async function writeLocalStorage(
  dir: string,
  entries: Array<{ origin: string; key: string; value: string }>
): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
  const db = new ClassicLevel<Buffer, Buffer>(dir, { keyEncoding: 'binary', valueEncoding: 'binary' })
  await db.open()
  for (const entry of entries) {
    const keyIsLatin1 = Array.from(entry.key).every((character) => character.codePointAt(0)! <= 0xff)
    const encodedKey = keyIsLatin1
      ? Buffer.concat([Buffer.from([1]), Buffer.from(entry.key, 'latin1')])
      : Buffer.concat([Buffer.from([0]), Buffer.from(entry.key, 'utf16le')])
    const key = Buffer.concat([
      Buffer.from('_', 'latin1'),
      Buffer.from(entry.origin, 'utf8'),
      Buffer.from([0]),
      encodedKey
    ])
    const canEncodeLatin1 = Array.from(entry.value).every((character) => character.codePointAt(0)! <= 0xff)
    const value = canEncodeLatin1
      ? Buffer.concat([Buffer.from([1]), Buffer.from(entry.value, 'latin1')])
      : Buffer.concat([Buffer.from([0]), Buffer.from(entry.value, 'utf16le')])
    await db.put(key, value)
  }
  await db.put(Buffer.from(`META:${entries[0]?.origin ?? 'https://example.com'}`), Buffer.from([0x08, 0x01]))
  await db.close()
}
