import type { BrowserId } from '../../../shared/types/browser'
import { BROWSER_EXECUTABLES } from '../../browser-discovery/executables'
import { resolveChromiumPaths } from '../../../core/inspectors/chromium/paths'
import { cookieHostMatches, readCookieRows } from '../../../core/inspectors/chromium/cookies'
import { readLocalStorageDir } from '../../../core/inspectors/chromium/local-storage'
import { readSessionStorageDir } from '../../../core/inspectors/chromium/session-storage'
import { deriveChromiumCookieKey, decryptChromiumCookieValue } from '../../../core/security/cookie-crypto'
import { readGenericPassword } from '../../security/keychain'
import type { SourceSiteData } from '../../../core/session/types'
import { normalizeOrigin } from '../../../core/inspectors/chromium/origins'

const CHROMIUM: BrowserId[] = ['chrome', 'arc', 'brave', 'edge']

function toUnixSeconds(chromiumMicroseconds: number): number | undefined {
  if (!chromiumMicroseconds) return undefined
  return Math.round(chromiumMicroseconds / 1_000_000 - 11_644_473_600)
}

export async function loadSourceSiteData(
  browserId: BrowserId,
  profileDir: string,
  originInput: string
): Promise<SourceSiteData> {
  if (!CHROMIUM.includes(browserId)) {
    return {
      origin: originInput,
      cookies: [],
      localStorage: [],
      sessionStorage: [],
      cookieError: 'This browser does not expose a supported session store reader.',
      localStorageError: 'This browser does not expose a supported Local Storage reader.',
      sessionStorageError: 'This browser does not expose a supported Session Storage reader.',
      skippedExpiredCookies: 0
    }
  }

  const origin = normalizeOrigin(originInput)
  const host = new URL(origin).hostname
  const paths = await resolveChromiumPaths(profileDir)
  const nowSeconds = Math.floor(Date.now() / 1000)
  const result: SourceSiteData = {
    origin,
    cookies: [],
    localStorage: [],
    sessionStorage: [],
    skippedExpiredCookies: 0
  }

  if (paths.cookiesDb) {
    try {
      const rows = await readCookieRows(paths.cookiesDb)
      const matching = rows.filter((row) => cookieHostMatches(row.hostKey, host))
      result.cookieCountBeforeRead = matching.length
      let key: Buffer | undefined
      let keyError: string | undefined
      let lastFailure: string | undefined
      let undecryptable = 0
      for (const row of matching) {
        if (row.topFrameSiteKey) {
          result.skippedPartitionedCookies = (result.skippedPartitionedCookies ?? 0) + 1
          continue
        }
        const expiry = toUnixSeconds(row.expiresUtc)
        if (expiry !== undefined && expiry <= nowSeconds) {
          result.skippedExpiredCookies += 1
          continue
        }
        let value: string | undefined
        if (row.encryptedValue) {
          if (!key && !keyError) {
            const service = BROWSER_EXECUTABLES[browserId].keychainService
            if (!service) {
              keyError = 'No supported Keychain service is known for this browser.'
            } else {
              try {
                key = deriveChromiumCookieKey(await readGenericPassword(service))
              } catch (error) {
                keyError = error instanceof Error ? error.message : 'Keychain access failed'
              }
            }
          }
          if (!key) {
            undecryptable += 1
            lastFailure = keyError ?? 'No decryption key is available.'
            continue
          }
          try {
            value = decryptChromiumCookieValue(row.encryptedValue, key, row.hostKey)
          } catch {
            undecryptable += 1
            lastFailure = 'A cookie uses an unsupported encryption format.'
            continue
          }
        } else {
          value = row.plainValue
        }
        if (value === undefined) {
          undecryptable += 1
          lastFailure = lastFailure ?? 'A cookie value could not be read.'
          continue
        }
        result.cookies.push({
          name: row.name,
          value,
          domain: row.hostKey,
          path: row.path || '/',
          secure: row.isSecure,
          httpOnly: row.isHttpOnly,
          sameSite: row.sameSite,
          expiresUnix: expiry,
          session: !row.isPersistent || expiry === undefined
        })
      }
      if (undecryptable > 0) {
        result.undecryptableCookies = undecryptable
        if (result.cookies.length === 0) {
          result.cookieError = lastFailure ?? keyError ?? 'No cookies could be decrypted.'
        } else {
          result.cookieWarning = `${undecryptable} cookie(s) could not be decrypted. ${lastFailure ?? keyError ?? ''}`.trim()
        }
      }
    } catch (error) {
      result.cookieError = error instanceof Error ? error.message : 'Unable to read the source cookie database'
    }
  } else {
    result.cookieError = 'No supported cookie database was found in the source profile.'
  }

  if (paths.localStorageDir) {
    const read = await readLocalStorageDir(paths.localStorageDir)
    if (!read.readable) {
      result.localStorageError = read.error ?? 'Unable to read source Local Storage'
    } else {
      result.localStorage = read.records
        .filter((record) => record.origin === origin)
        .map((record) => ({ origin: record.origin, key: record.key, value: record.value }))
    }
  } else {
    result.localStorageError = 'No Local Storage store was found in the source profile.'
  }

  if (paths.sessionStorageDir) {
    const read = await readSessionStorageDir(paths.sessionStorageDir)
    if (!read.readable) {
      result.sessionStorageError = read.error ?? 'Unable to read source Session Storage'
    } else {
      result.sessionStorage = read.records
        .filter((record) => record.origin === origin)
        .map((record) => ({ origin: record.origin, key: record.key, value: record.value }))
    }
  } else {
    result.sessionStorageError = 'No Session Storage store was found in the source profile.'
  }

  return result
}
