import type { BrowserId } from '../../shared/types/browser'
import type {
  BundleSummary,
  PortableCookie,
  PortableSessionBundle,
  SiteDataCategory
} from '../../shared/types/session'
import { PortableSessionBundleSchema } from '../../shared/schemas/bundle'
import type { SourceSiteData } from './types'

export const BUNDLE_FORMAT = 'session-transfer-bundle' as const
export const BUNDLE_VERSION = 1 as const

export interface BuildBundleInput {
  sourceBrowserId: BrowserId
  sourceProfileId?: string
  origin: string
  categories: Array<'cookies' | 'localStorage' | 'sessionStorage'>
  data: SourceSiteData
  generatedAt?: string
}

function toPortableCookie(cookie: SourceSiteData['cookies'][number]): PortableCookie {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path || '/',
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    session: cookie.session,
    ...(cookie.expiresUnix !== undefined ? { expiresUnix: cookie.expiresUnix } : {})
  }
}

export function buildBundle(input: BuildBundleInput): PortableSessionBundle {
  const cookies = input.categories.includes('cookies') ? input.data.cookies.map(toPortableCookie) : []
  const localStorage = input.categories.includes('localStorage')
    ? input.data.localStorage.map((record) => ({ key: record.key, value: record.value }))
    : []
  const sessionStorage = input.categories.includes('sessionStorage')
    ? input.data.sessionStorage.map((record) => ({ key: record.key, value: record.value }))
    : []
  const usedCategories = input.categories.filter(
    (category) =>
      (category === 'cookies' && cookies.length > 0) ||
      (category === 'localStorage' && localStorage.length > 0) ||
      (category === 'sessionStorage' && sessionStorage.length > 0)
  )
  return {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    source: {
      browserId: input.sourceBrowserId,
      origin: input.origin,
      ...(input.sourceProfileId ? { profileId: input.sourceProfileId } : {})
    },
    categories: usedCategories.length > 0 ? usedCategories : input.categories,
    cookies,
    localStorage,
    sessionStorage
  }
}

export function summarizeBundle(bundle: PortableSessionBundle): BundleSummary {
  return {
    origin: bundle.source.origin,
    sourceBrowserId: bundle.source.browserId,
    generatedAt: bundle.generatedAt,
    categories: bundle.categories,
    counts: {
      cookies: bundle.cookies.length,
      localStorage: bundle.localStorage.length,
      sessionStorage: bundle.sessionStorage.length
    }
  }
}

export function serializeBundle(bundle: PortableSessionBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`
}

export function parseBundle(json: string): PortableSessionBundle {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('The selected file is not valid JSON.')
  }
  const result = PortableSessionBundleSchema.safeParse(raw)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new Error(`The selected file is not a supported session bundle${issue ? `: ${issue.path.join('.')} ${issue.message}` : '.'}`)
  }
  return result.data as PortableSessionBundle
}

export function categoriesFromBundle(bundle: PortableSessionBundle): Array<SiteDataCategory> {
  const categories: Array<SiteDataCategory> = []
  if (bundle.cookies.length > 0) categories.push('cookies')
  if (bundle.localStorage.length > 0) categories.push('localStorage')
  if (bundle.sessionStorage.length > 0) categories.push('sessionStorage')
  return categories
}
