import type { BrowserId } from '../../shared/types/browser'
import { BROWSER_EXECUTABLES, CHROMIUM_BROWSERS, pathExists } from '../browser-discovery/executables'

const CATEGORIES = [
  'bookmarks',
  'history',
  'passwords',
  'cookies',
  'localStorage',
  'indexedDB',
  'sessionStorage',
  'extensions',
  'settings'
] as const

export async function getCompatibility(
  sourceBrowserId: BrowserId,
  destBrowserId: BrowserId
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  if (sourceBrowserId === destBrowserId) {
    for (const category of CATEGORIES) result[category] = 'Same browser/profile'
    return result
  }

  const sourceChromium = CHROMIUM_BROWSERS.includes(sourceBrowserId)
  const destInfo = BROWSER_EXECUTABLES[destBrowserId]
  const destInstalled = await pathExists(destInfo.appPath)
  const destCanWrite = destInfo.supportsCdp && destInstalled

  for (const category of CATEGORIES) {
    result[category] = 'Unsupported'
  }

  if (sourceChromium && destCanWrite) {
    result.cookies = 'Requires permission'
    result.localStorage = 'Partially supported'
  }

  if (sourceChromium && destBrowserId === 'arc') {
    result.cookies = 'Unsupported'
    result.localStorage = 'Unsupported'
  }

  if (!sourceChromium) {
    for (const category of CATEGORIES) result[category] = 'Unsupported'
  }

  return result
}
