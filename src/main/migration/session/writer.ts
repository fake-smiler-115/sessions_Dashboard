import type { BrowserId } from '../../../shared/types/browser'
import type { DecryptedCookie, SessionWriter, WriteResult } from '../../../core/session/types'
import { CdpConnection } from './cdp'
import { findPageTarget, launchDestinationBrowser, type LaunchedBrowser } from './launcher'
import { mergeStagedProfile } from './staged'

function sameSiteValue(value: number): 'Strict' | 'Lax' | 'None' | undefined {
  if (value === 0) return 'None'
  if (value === 1) return 'Lax'
  if (value === 2) return 'Strict'
  return undefined
}

function normalizeDomain(domain: string): string {
  return domain.replace(/^\./, '').toLowerCase()
}

export class CdpSessionWriter implements SessionWriter {
  readonly staged: boolean
  mergeDetails: string[] = []
  private originLoaded = false

  private constructor(
    private readonly launched: LaunchedBrowser,
    private readonly page: CdpConnection,
    private readonly browser: CdpConnection,
    private readonly origin: string
  ) {
    this.staged = launched.staged
  }

  static async open(browserId: BrowserId, profileDir: string, origin: string): Promise<CdpSessionWriter> {
    const launched = await launchDestinationBrowser(browserId, profileDir)
    let page: CdpConnection | undefined
    let browser: CdpConnection | undefined
    try {
      const pageUrl = await findPageTarget(launched.port)
      page = await CdpConnection.connect(pageUrl)
      browser = await CdpConnection.connect(launched.browserWebSocketUrl)
      await page.send('Network.enable')
      await page.send('Runtime.enable')
      await page.send('Page.enable')
      return new CdpSessionWriter(launched, page, browser, origin)
    } catch (error) {
      page?.close()
      browser?.close()
      await launched.close().catch(() => undefined)
      await launched.cleanup()
      throw error
    }
  }

  async writeCookies(cookies: DecryptedCookie[], options: { persistSessionCookies: boolean }): Promise<WriteResult> {
    const result: WriteResult = { imported: 0, skipped: 0, failed: 0, verified: 0, reasons: [] }
    let convertedSessionCookies = 0
    const scheme = new URL(this.origin).protocol.replace(':', '')
    for (const cookie of cookies) {
      const params: Record<string, unknown> = {
        name: cookie.name,
        value: cookie.value,
        path: cookie.path || '/',
        secure: cookie.secure,
        httpOnly: cookie.httpOnly
      }
      const sameSite = sameSiteValue(cookie.sameSite)
      if (sameSite) params.sameSite = sameSite
      if (cookie.domain.startsWith('.')) {
        params.domain = cookie.domain
      } else {
        params.url = `${scheme}://${cookie.domain}${cookie.path || '/'}`
      }
      if (cookie.session) {
        if (options.persistSessionCookies) {
          params.expires = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
          convertedSessionCookies += 1
        }
      } else if (cookie.expiresUnix) {
        params.expires = cookie.expiresUnix
      }
      try {
        const response = await this.page.send<{ success?: boolean }>('Network.setCookie', params)
        if (response.success === false) result.failed += 1
        else result.imported += 1
      } catch {
        result.failed += 1
      }
    }
    if (convertedSessionCookies > 0) {
      result.reasons.push(`${convertedSessionCookies} session-only cookie(s) were converted to persistent cookies expiring in 7 days.`)
    }
    if (result.failed > 0) {
      result.reasons.push(`${result.failed} cookie(s) were rejected by the destination browser.`)
    }
    return result
  }

  private async ensureOrigin(): Promise<boolean> {
    if (this.originLoaded) return true
    const loaded = await this.navigateToOrigin()
    if (loaded) this.originLoaded = true
    return loaded
  }

  private async navigateToOrigin(): Promise<boolean> {
    for (const probe of [`${this.origin}/robots.txt`, `${this.origin}/`]) {
      try {
        await this.page.send('Page.navigate', { url: probe })
      } catch {
        continue
      }
      const deadline = Date.now() + 20000
      while (Date.now() < deadline) {
        try {
          const response = await this.page.send<{ result?: { value?: string } }>('Runtime.evaluate', {
            expression: 'location.origin',
            returnByValue: true
          })
          if (response.result?.value === this.origin) return true
        } catch {
          // retry
        }
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
    }
    return false
  }

  async writeLocalStorage(origin: string, items: Array<{ key: string; value: string }>): Promise<WriteResult> {
    return this.writeWebStorage('localStorage', origin, items)
  }

  async writeSessionStorage(origin: string, items: Array<{ key: string; value: string }>): Promise<WriteResult> {
    return this.writeWebStorage('sessionStorage', origin, items)
  }

  private async writeWebStorage(
    storage: 'localStorage' | 'sessionStorage',
    _origin: string,
    items: Array<{ key: string; value: string }>
  ): Promise<WriteResult> {
    const label = storage === 'localStorage' ? 'Local Storage' : 'Session Storage'
    const result: WriteResult = { imported: 0, skipped: 0, failed: 0, verified: 0, reasons: [] }
    if (items.length === 0) return result
    const onOrigin = await this.ensureOrigin()
    if (!onOrigin) {
      result.failed = items.length
      result.reasons.push(`The destination browser could not load the selected origin, so ${label} was not written.`)
      return result
    }
    for (const item of items) {
      try {
        const response = await this.page.send<{ exceptionDetails?: unknown }>('Runtime.evaluate', {
          expression: `${storage}.setItem(${JSON.stringify(item.key)}, ${JSON.stringify(item.value)})`,
          returnByValue: true
        })
        if (response.exceptionDetails) result.failed += 1
        else result.imported += 1
      } catch {
        result.failed += 1
      }
    }
    if (result.failed > 0) {
      result.reasons.push(`${result.failed} ${label} record(s) could not be written.`)
    }
    return result
  }

  async verifyCookies(cookies: DecryptedCookie[]): Promise<{ checked: number; matched: number; details: string[] }> {
    const details: string[] = []
    let all: Array<{ name: string; value: string; domain: string; path: string }> = []
    try {
      const response = await this.page.send<{
        cookies: Array<{ name: string; value: string; domain: string; path: string }>
      }>('Network.getAllCookies')
      all = response.cookies
    } catch {
      details.push('The destination browser did not return its cookie store for verification.')
      return { checked: cookies.length, matched: 0, details }
    }
    let matched = 0
    const missing: string[] = []
    for (const cookie of cookies) {
      const found = all.find(
        (candidate) =>
          candidate.name === cookie.name &&
          normalizeDomain(candidate.domain) === normalizeDomain(cookie.domain) &&
          candidate.path === (cookie.path || '/')
      )
      if (found && found.value === cookie.value) matched += 1
      else missing.push(cookie.name)
    }
    if (missing.length > 0) {
      details.push(`${missing.length} cookie(s) were not readable in the destination after import.`)
    }
    return { checked: cookies.length, matched, details }
  }

  async verifyLocalStorage(
    origin: string,
    items: Array<{ key: string; value: string }>
  ): Promise<{ checked: number; matched: number; details: string[] }> {
    return this.verifyWebStorage('localStorage', origin, items)
  }

  async verifySessionStorage(
    origin: string,
    items: Array<{ key: string; value: string }>
  ): Promise<{ checked: number; matched: number; details: string[] }> {
    return this.verifyWebStorage('sessionStorage', origin, items)
  }

  private async verifyWebStorage(
    storage: 'localStorage' | 'sessionStorage',
    _origin: string,
    items: Array<{ key: string; value: string }>
  ): Promise<{ checked: number; matched: number; details: string[] }> {
    const label = storage === 'localStorage' ? 'Local Storage' : 'Session Storage'
    const details: string[] = []
    if (items.length === 0) return { checked: 0, matched: 0, details }
    let matched = 0
    let failedReads = 0
    for (const item of items) {
      try {
        const response = await this.page.send<{ result?: { value?: unknown }; exceptionDetails?: unknown }>(
          'Runtime.evaluate',
          {
            expression: `${storage}.getItem(${JSON.stringify(item.key)})`,
            returnByValue: true
          }
        )
        if (response.exceptionDetails) failedReads += 1
        else if (response.result?.value === item.value) matched += 1
      } catch {
        failedReads += 1
      }
    }
    if (failedReads > 0) details.push(`${failedReads} ${label} value(s) could not be verified.`)
    return { checked: items.length, matched, details }
  }

  async close(): Promise<void> {
    try {
      await this.browser.send('Browser.close', {}, 5000)
    } catch {
      // fall through to process termination
    }
    this.page.close()
    this.browser.close()
    await this.launched.close()

    if (!this.launched.staged || !this.launched.stagedProfileDir) return
    try {
      const result = await mergeStagedProfile({
        browserId: this.launched.browserId,
        realProfileDir: this.launched.realProfileDir,
        stagedProfileDir: this.launched.stagedProfileDir,
        origin: this.origin
      })
      this.mergeDetails = result.details
      this.mergeDetails.push(
        `Staged migration merged ${result.cookies} cookie record(s), ${result.localStorageKeys} Local Storage key(s), and ${result.sessionStorageKeys} Session Storage key(s) into the destination profile.`
      )
    } finally {
      await this.launched.cleanup()
    }
  }
}
