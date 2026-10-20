import type { BrowserId } from '../../../shared/types/browser'
import type { BundleSummary, PortableSessionBundle } from '../../../shared/types/session'
import { buildBundle, summarizeBundle } from '../../../core/session/bundle'
import { loadSourceSiteData } from './source'

export interface ExportBundleInput {
  sourceBrowserId: BrowserId
  sourceProfileId?: string
  sourceProfileDir: string
  origin: string
  categories: Array<'cookies' | 'localStorage' | 'sessionStorage'>
}

export interface ExportBundleOutput {
  bundle: PortableSessionBundle
  summary: BundleSummary
  warnings: string[]
}

export async function buildExportBundle(input: ExportBundleInput): Promise<ExportBundleOutput> {
  const data = await loadSourceSiteData(input.sourceBrowserId, input.sourceProfileDir, input.origin)
  const warnings: string[] = []
  if (input.categories.includes('cookies')) {
    if (data.cookieError) warnings.push(data.cookieError)
    else if (data.cookieWarning) warnings.push(data.cookieWarning)
  }
  if (input.categories.includes('localStorage') && data.localStorageError) warnings.push(data.localStorageError)
  if (input.categories.includes('sessionStorage') && data.sessionStorageError) warnings.push(data.sessionStorageError)

  const bundle = buildBundle({
    sourceBrowserId: input.sourceBrowserId,
    sourceProfileId: input.sourceProfileId,
    origin: data.origin,
    categories: input.categories,
    data
  })
  return { bundle, summary: summarizeBundle(bundle), warnings }
}
