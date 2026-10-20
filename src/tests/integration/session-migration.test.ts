import { describe, it, expect, afterAll } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { createChromiumFixture } from '../fixtures/profile'
import { registerAllowedDir } from '../../main/security/profile-registry'
import { runSiteMigration } from '../../main/migration/session/job'
import { runSiteImport } from '../../main/migration/session/import-job'
import { buildBundle, serializeBundle } from '../../core/session/bundle'
import type { SourceSiteData } from '../../core/session/types'
import { inspectProfileStorage } from '../../core/inspectors/chromium/origins'
import { existsSync } from 'fs'
import { execFileSync } from 'child_process'

function chromeReady(): boolean {
  if (!existsSync('/Applications/Google Chrome.app')) return false
  try {
    execFileSync('pgrep', ['-x', 'Google Chrome'], { stdio: 'ignore' })
    return false
  } catch {
    return true
  }
}

const chromeAvailable = chromeReady()

const cleanups: Array<() => Promise<void>> = []
afterAll(async () => {
  while (cleanups.length) await cleanups.pop()?.()
})

describe('end-to-end website session migration', () => {
  it.runIf(chromeAvailable)('migrates cookies, Local Storage, and Session Storage and verifies the destination', async () => {
    const fixture = await createChromiumFixture()
    const destRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bmt-e2e-dest-'))
    const destProfile = path.join(destRoot, 'Default')
    await fs.mkdir(destProfile, { recursive: true })
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bmt-e2e-data-'))
    cleanups.push(fixture.cleanup, async () => fs.rm(destRoot, { recursive: true, force: true }))
    cleanups.push(async () => fs.rm(userDataDir, { recursive: true, force: true }))
    registerAllowedDir(fixture.dir)
    registerAllowedDir(destProfile)

    const before = await profileChecksums(fixture.dir)
    const result = await runSiteMigration(
      {
        sourceBrowserId: 'chrome',
        sourceProfileDir: fixture.dir,
        destBrowserId: 'chrome',
        destProfileDir: destProfile,
        origin: 'https://example.com',
        categories: ['cookies', 'localStorage', 'sessionStorage'],
        persistSessionCookies: true,
        confirmation: 'migrate-website-session'
      },
      {
        userDataDir,
        backupRoot: path.join(userDataDir, 'backups'),
        onProgress: () => undefined
      }
    )

    expect(result.overall).toBe('partial')
    expect(result.categories.every((category) => category.verified)).toBe(true)
    expect(result.categories.find((category) => category.category === 'cookies')?.imported).toBe(2)
    expect(result.categories.find((category) => category.category === 'localStorage')?.imported).toBe(2)
    const sessionCategory = result.categories.find((category) => category.category === 'sessionStorage')
    expect(sessionCategory?.imported).toBe(1)
    expect(sessionCategory?.status).toBe('partially-migrated')
    expect(result.backupPath).toBeTruthy()
    expect(JSON.stringify(result)).not.toContain('plain-session-value')
    expect(JSON.stringify(result)).not.toContain('abc123')

    const dest = await inspectProfileStorage(destProfile)
    expect(dest.cookieHosts.get('example.com')).toBe(2)
    expect(dest.localStorageOrigins.get('https://example.com')).toBe(2)
    expect(dest.origins.find((entry) => entry.origin === 'https://example.com')?.sessionStorage).toBe(1)
    expect(await profileChecksums(fixture.dir)).toEqual(before)
  }, 180000)

  it.runIf(chromeAvailable)('imports a JSON bundle into a destination profile', async () => {
    const destRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bmt-e2e-import-'))
    const destProfile = path.join(destRoot, 'Default')
    await fs.mkdir(destProfile, { recursive: true })
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bmt-e2e-import-data-'))
    const bundleDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bmt-e2e-bundle-'))
    cleanups.push(async () => fs.rm(destRoot, { recursive: true, force: true }))
    cleanups.push(async () => fs.rm(userDataDir, { recursive: true, force: true }))
    cleanups.push(async () => fs.rm(bundleDir, { recursive: true, force: true }))
    registerAllowedDir(destProfile)

    const data: SourceSiteData = {
      origin: 'https://example.com',
      cookies: [
        {
          name: 'sid',
          value: 'bundle-secret',
          domain: '.example.com',
          path: '/',
          secure: true,
          httpOnly: true,
          sameSite: 1,
          session: false,
          expiresUnix: Math.floor(Date.now() / 1000) + 3600
        }
      ],
      localStorage: [{ origin: 'https://example.com', key: 'token', value: 'bundle-ls' }],
      sessionStorage: [{ origin: 'https://example.com', key: 'tab', value: 'bundle-ss' }],
      skippedExpiredCookies: 0
    }
    const bundle = buildBundle({
      sourceBrowserId: 'chrome',
      origin: 'https://example.com',
      categories: ['cookies', 'localStorage', 'sessionStorage'],
      data
    })
    const bundlePath = path.join(bundleDir, 'bundle.json')
    await fs.writeFile(bundlePath, serializeBundle(bundle))

    const result = await runSiteImport(
      {
        destBrowserId: 'chrome',
        destProfileDir: destProfile,
        origin: 'https://example.com',
        bundlePath,
        categories: ['cookies', 'localStorage', 'sessionStorage'],
        persistSessionCookies: true,
        confirmation: 'import-session-bundle'
      },
      {
        userDataDir,
        backupRoot: path.join(userDataDir, 'backups'),
        onProgress: () => undefined
      }
    )

    expect(result.overall).toBe('partial')
    expect(result.categories.find((category) => category.category === 'cookies')?.imported).toBe(1)
    expect(result.categories.find((category) => category.category === 'localStorage')?.imported).toBe(1)
    expect(result.categories.find((category) => category.category === 'sessionStorage')?.imported).toBe(1)
    expect(result.categories.every((category) => category.verified)).toBe(true)

    const dest = await inspectProfileStorage(destProfile)
    expect(dest.cookieHosts.get('example.com')).toBe(1)
    expect(dest.localStorageOrigins.get('https://example.com')).toBe(1)
    expect(dest.origins.find((entry) => entry.origin === 'https://example.com')?.sessionStorage).toBe(1)
  }, 180000)
})

async function profileChecksums(dir: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  async function walk(current: string) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.isFile()) {
        result[path.relative(dir, full)] = crypto.createHash('sha256').update(await fs.readFile(full)).digest('hex')
      }
    }
  }
  await walk(dir)
  return result
}
