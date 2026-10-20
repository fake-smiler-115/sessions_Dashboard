import type { BrowserId } from '../../shared/types/browser'
import type { SessionCapabilities } from './types'

const CHROMIUM: BrowserId[] = ['chrome', 'arc', 'brave', 'edge']

export interface CapabilityInput {
  browserId: BrowserId
  installed: boolean
  supportsCdp: boolean
  hasKeychainService: boolean
}

export function getSessionCapabilities(input: CapabilityInput): SessionCapabilities {
  const { browserId, installed, supportsCdp, hasKeychainService } = input
  const isChromium = CHROMIUM.includes(browserId)
  const reasons: string[] = []
  if (!installed) reasons.push('Browser application is not installed at the expected macOS location.')
  if (browserId === 'firefox') reasons.push('Firefox uses a different cookie and storage format; this build only inspects Chromium session stores.')
  if (browserId === 'safari') reasons.push('Safari storage is protected by macOS privacy controls and no supported session import interface is implemented.')
  if (browserId === 'arc') reasons.push('Arc can be read as a Chromium source, but its launcher does not expose a supported CDP destination entry point in this build.')
  if (isChromium && !hasKeychainService) reasons.push('No supported macOS Keychain item was found for this browser.')
  if (!isChromium) reasons.push('Session transfer currently supports Chromium-based browsers only.')
  return {
    browserId,
    readableCookies: isChromium,
    readableLocalStorage: isChromium,
    readableSessionStorage: isChromium,
    writableCookies: isChromium && supportsCdp && installed,
    writableLocalStorage: isChromium && supportsCdp && installed,
    writableSessionStorage: isChromium && supportsCdp && installed,
    requiresKeychain: isChromium && hasKeychainService,
    installed,
    reasons
  }
}
