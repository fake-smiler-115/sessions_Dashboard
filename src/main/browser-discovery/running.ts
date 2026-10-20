import { execFile } from 'child_process'
import { promisify } from 'util'
import type { BrowserId } from '../../shared/types/browser'
import { BROWSER_EXECUTABLES } from './executables'

const execFileAsync = promisify(execFile)

export async function isBrowserRunning(browserId: BrowserId): Promise<boolean> {
  const name = BROWSER_EXECUTABLES[browserId].processName
  try {
    await execFileAsync('pgrep', ['-x', name], { timeout: 3000 })
    return true
  } catch {
    return false
  }
}
