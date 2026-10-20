import type { BrowserId } from '../../shared/types/browser'

export interface DecryptedCookie {
  name: string
  value: string
  domain: string
  path: string
  secure: boolean
  httpOnly: boolean
  sameSite: number
  expiresUnix?: number
  session: boolean
}

export interface SourceSiteData {
  origin: string
  cookies: DecryptedCookie[]
  localStorage: Array<{ origin: string; key: string; value: string }>
  cookieError?: string
  cookieWarning?: string
  localStorageError?: string
  cookieCountBeforeRead?: number
  skippedExpiredCookies: number
  skippedPartitionedCookies?: number
  undecryptableCookies?: number
}

export interface WriteResult {
  imported: number
  skipped: number
  failed: number
  verified: number
  reasons: string[]
}

export interface SessionWriter {
  readonly staged?: boolean
  mergeDetails?: string[]
  writeCookies(cookies: DecryptedCookie[], options: { persistSessionCookies: boolean }): Promise<WriteResult>
  writeLocalStorage(origin: string, items: Array<{ key: string; value: string }>): Promise<WriteResult>
  verifyCookies(cookies: DecryptedCookie[]): Promise<{ checked: number; matched: number; details: string[] }>
  verifyLocalStorage(
    origin: string,
    items: Array<{ key: string; value: string }>
  ): Promise<{ checked: number; matched: number; details: string[] }>
  close(): Promise<void>
}

export interface SessionCapabilities {
  browserId: BrowserId
  readableCookies: boolean
  readableLocalStorage: boolean
  writableCookies: boolean
  writableLocalStorage: boolean
  requiresKeychain: boolean
  installed: boolean
  reasons: string[]
}
