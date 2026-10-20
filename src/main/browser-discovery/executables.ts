import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import type { BrowserId } from '../../shared/types/browser'

export interface BrowserExecutableInfo {
  appPath: string
  executablePath: string
  processName: string
  keychainService?: string
  supportsCdp: boolean
}

export const BROWSER_EXECUTABLES: Record<BrowserId, BrowserExecutableInfo> = {
  chrome: {
    appPath: '/Applications/Google Chrome.app',
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    processName: 'Google Chrome',
    keychainService: 'Chrome Safe Storage',
    supportsCdp: true
  },
  arc: {
    appPath: '/Applications/Arc.app',
    executablePath: '/Applications/Arc.app/Contents/MacOS/Arc',
    processName: 'Arc',
    keychainService: 'Arc Safe Storage',
    supportsCdp: false
  },
  brave: {
    appPath: '/Applications/Brave Browser.app',
    executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    processName: 'Brave Browser',
    keychainService: 'Brave Safe Storage',
    supportsCdp: true
  },
  edge: {
    appPath: '/Applications/Microsoft Edge.app',
    executablePath: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    processName: 'Microsoft Edge',
    keychainService: 'Microsoft Edge Safe Storage',
    supportsCdp: true
  },
  firefox: {
    appPath: '/Applications/Firefox.app',
    executablePath: '/Applications/Firefox.app/Contents/MacOS/firefox',
    processName: 'firefox',
    supportsCdp: false
  },
  safari: {
    appPath: '/Applications/Safari.app',
    executablePath: '/Applications/Safari.app/Contents/MacOS/Safari',
    processName: 'Safari',
    supportsCdp: false
  }
}

export const BROWSER_NAMES: Record<BrowserId, string> = {
  chrome: 'Google Chrome',
  arc: 'Arc',
  brave: 'Brave',
  edge: 'Microsoft Edge',
  firefox: 'Mozilla Firefox',
  safari: 'Safari'
}

export const CHROMIUM_BROWSERS: BrowserId[] = ['chrome', 'arc', 'brave', 'edge']

export function browserDataBase(browserId: BrowserId): string {
  const home = os.homedir()
  switch (browserId) {
    case 'chrome':
      return path.join(home, 'Library/Application Support/Google/Chrome')
    case 'arc':
      return path.join(home, 'Library/Application Support/Arc/User Data')
    case 'brave':
      return path.join(home, 'Library/Application Support/BraveSoftware/Brave-Browser')
    case 'edge':
      return path.join(home, 'Library/Application Support/Microsoft Edge')
    case 'firefox':
      return path.join(home, 'Library/Application Support/Firefox')
    case 'safari':
      return path.join(home, 'Library/Safari')
  }
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export async function isBrowserInstalled(browserId: BrowserId): Promise<boolean> {
  return pathExists(BROWSER_EXECUTABLES[browserId].appPath)
}

export async function readBrowserVersion(browserId: BrowserId): Promise<string | undefined> {
  const info = BROWSER_EXECUTABLES[browserId]
  const plist = path.join(info.appPath, 'Contents/Info.plist')
  try {
    const buf = await fs.readFile(plist)
    const match = buf.toString('utf8').match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/)
    return match?.[1]
  } catch {
    return undefined
  }
}
