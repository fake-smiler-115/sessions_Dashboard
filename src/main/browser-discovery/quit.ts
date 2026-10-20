import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import type { BrowserId } from '../../shared/types/browser'
import { BROWSER_EXECUTABLES } from './executables'
import { isBrowserRunning } from './running'

const execFileAsync = promisify(execFile)

export async function quitBrowser(browserId: BrowserId): Promise<boolean> {
  const info = BROWSER_EXECUTABLES[browserId]
  const appName = path.basename(info.appPath, '.app')
  try {
    await execFileAsync('osascript', ['-e', `quit app "${appName}"`], { timeout: 10000 })
  } catch {
    // The browser may already be quitting; poll below is authoritative.
  }
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    if (!(await isBrowserRunning(browserId))) return true
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  return !(await isBrowserRunning(browserId))
}
