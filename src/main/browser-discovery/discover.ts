import path from 'path'
import fs from 'fs/promises'
import type { BrowserId, BrowserProfile } from '../../shared/types/browser'
import {
  BROWSER_EXECUTABLES,
  BROWSER_NAMES,
  CHROMIUM_BROWSERS,
  browserDataBase,
  pathExists,
  readBrowserVersion
} from './executables'
import { isBrowserRunning } from './running'

interface ProfileCandidate {
  profileId: string
  profileName: string
  profileDir: string
}

const PROFILE_MARKERS = ['Preferences', 'Cookies', 'History', 'Local Storage', 'Web Data']

async function looksLikeChromiumProfile(dir: string): Promise<boolean> {
  for (const marker of PROFILE_MARKERS) {
    if (await pathExists(path.join(dir, marker))) return true
  }
  return false
}

async function readChromiumProfileNames(baseDir: string): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(path.join(baseDir, 'Local State'), 'utf8')
    const parsed = JSON.parse(raw) as { profile?: { info_cache?: Record<string, { name?: string }> } }
    const cache = parsed.profile?.info_cache ?? {}
    const result: Record<string, string> = {}
    for (const [id, value] of Object.entries(cache)) {
      if (value?.name) result[id] = value.name
    }
    return result
  } catch {
    return {}
  }
}

async function discoverChromium(browserId: BrowserId, baseDir: string): Promise<ProfileCandidate[]> {
  const found: ProfileCandidate[] = []
  if (!(await pathExists(baseDir))) return found
  const names = await readChromiumProfileNames(baseDir)
  const entries = await fs.readdir(baseDir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name !== 'Default' && !entry.name.startsWith('Profile ')) continue
    const profileDir = path.join(baseDir, entry.name)
    if (!(await looksLikeChromiumProfile(profileDir))) continue
    found.push({
      profileId: entry.name,
      profileName: names[entry.name] ?? entry.name,
      profileDir
    })
  }
  return found
}

function parseIniSections(content: string): Array<Record<string, string>> {
  const sections: Array<Record<string, string>> = []
  let current: Record<string, string> | undefined
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) continue
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      current = {}
      sections.push(current)
      continue
    }
    if (!current) continue
    const idx = trimmed.indexOf('=')
    if (idx < 0) continue
    current[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
  }
  return sections
}

async function discoverFirefox(baseDir: string): Promise<ProfileCandidate[]> {
  const found: ProfileCandidate[] = []
  const iniPath = path.join(baseDir, 'profiles.ini')
  if (await pathExists(iniPath)) {
    const content = await fs.readFile(iniPath, 'utf8').catch(() => '')
    for (const section of parseIniSections(content)) {
      if (!section.Path) continue
      const dir = section.IsRelative === '1' ? path.join(baseDir, section.Path) : section.Path
      if (!(await pathExists(path.join(dir, 'prefs.js'))) && !(await pathExists(path.join(dir, 'places.sqlite')))) {
        if (!(await pathExists(dir))) continue
      }
      found.push({
        profileId: section.Path,
        profileName: section.Name ?? path.basename(dir),
        profileDir: dir
      })
    }
  }
  if (found.length === 0) {
    const fallback = path.join(baseDir, 'Profiles')
    const entries = await fs.readdir(fallback, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      found.push({
        profileId: entry.name,
        profileName: entry.name,
        profileDir: path.join(fallback, entry.name)
      })
    }
  }
  return found
}

async function discoverSafari(baseDir: string): Promise<ProfileCandidate[]> {
  if (!(await pathExists(baseDir))) return []
  if (!(await pathExists('/Applications/Safari.app'))) return []
  return [{ profileId: 'default', profileName: 'Safari', profileDir: baseDir }]
}

async function toProfileCandidate(browserId: BrowserId, candidate: ProfileCandidate): Promise<BrowserProfile> {
  const accessible = await pathExists(candidate.profileDir)
  let sizeBytes: number | undefined
  let lastModified: number | undefined
  try {
    const st = await fs.stat(candidate.profileDir)
    lastModified = st.mtimeMs
    sizeBytes = st.size
  } catch {
    sizeBytes = undefined
  }
  return {
    browserId,
    browserName: BROWSER_NAMES[browserId],
    profileId: candidate.profileId,
    profileName: candidate.profileName,
    profileDir: candidate.profileDir,
    exists: true,
    accessible,
    sizeBytes,
    lastModified,
    running: await isBrowserRunning(browserId),
    supportedInspection: CHROMIUM_BROWSERS.includes(browserId) ? ['files', 'sqlite', 'leveldb'] : ['files'],
    supportedMigration: []
  }
}

export async function detectProfiles(): Promise<BrowserProfile[]> {
  const results: BrowserProfile[] = []
  for (const browserId of CHROMIUM_BROWSERS) {
    const base = browserDataBase(browserId)
    for (const candidate of await discoverChromium(browserId, base)) {
      results.push(await toProfileCandidate(browserId, candidate))
    }
  }
  for (const candidate of await discoverFirefox(browserDataBase('firefox'))) {
    results.push(await toProfileCandidate('firefox', candidate))
  }
  for (const candidate of await discoverSafari(browserDataBase('safari'))) {
    results.push(await toProfileCandidate('safari', candidate))
  }
  const versionCache = new Map<BrowserId, string | undefined>()
  for (const profile of results) {
    if (!versionCache.has(profile.browserId)) {
      versionCache.set(profile.browserId, await readBrowserVersion(profile.browserId))
    }
    const version = versionCache.get(profile.browserId)
    if (version) profile.browserVersion = version
    const caps = await capabilitiesFor(profile)
    profile.supportedMigration = caps
  }
  return results
}

async function capabilitiesFor(profile: BrowserProfile): Promise<string[]> {
  const caps: string[] = []
  if (CHROMIUM_BROWSERS.includes(profile.browserId)) {
    caps.push('cookies:read', 'localStorage:read', 'sessionStorage:read', 'indexedDB:inspect')
    if (BROWSER_EXECUTABLES[profile.browserId].supportsCdp && (await pathExists(BROWSER_EXECUTABLES[profile.browserId].executablePath))) {
      caps.push('cookies:import', 'localStorage:import')
    }
  }
  if (profile.browserId === 'firefox' || profile.browserId === 'safari') {
    caps.push('discovery:only')
  }
  return caps
}
