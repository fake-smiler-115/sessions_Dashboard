import { spawn, type ChildProcess } from 'child_process'
import net from 'net'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import type { BrowserId } from '../../../shared/types/browser'
import { BROWSER_EXECUTABLES, browserDataBase } from '../../browser-discovery/executables'
import { isBrowserRunning } from '../../browser-discovery/running'

export interface LaunchedBrowser {
  browserId: BrowserId
  port: number
  browserWebSocketUrl: string
  process: ChildProcess
  staged: boolean
  realProfileDir: string
  stagedProfileDir?: string
  tempUserDataDir?: string
  close(): Promise<void>
  cleanup(): Promise<void>
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (typeof address === 'object' && address) {
        const port = address.port
        server.close(() => resolve(port))
      } else {
        server.close(() => reject(new Error('Unable to allocate a debugging port')))
      }
    })
  })
}

async function waitForDevTools(port: number, timeoutMs: number): Promise<{ webSocketDebuggerUrl: string }> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (response.ok) {
        const data = (await response.json()) as { webSocketDebuggerUrl?: string }
        if (data.webSocketDebuggerUrl) return { webSocketDebuggerUrl: data.webSocketDebuggerUrl }
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('The destination browser did not expose a local automation endpoint')
}

export async function launchDestinationBrowser(browserId: BrowserId, profileDir: string): Promise<LaunchedBrowser> {
  const info = BROWSER_EXECUTABLES[browserId]
  if (!info.supportsCdp) {
    throw new Error('This browser does not expose a supported automation entry point')
  }
  try {
    await fs.access(info.executablePath)
  } catch {
    throw new Error('The destination browser application was not found')
  }
  if (await isBrowserRunning(browserId)) {
    throw new Error('Quit the destination browser before starting the migration')
  }

  const realProfileDir = profileDir
  const realDataDir = path.dirname(profileDir)
  const profileDirectory = path.basename(profileDir)
  const defaultBase = browserDataBase(browserId)
  const staged = path.resolve(realDataDir) === path.resolve(defaultBase)

  let tempUserDataDir: string | undefined
  let stagedProfileDir: string | undefined
  let userDataDir = realDataDir
  let profileArg = profileDirectory

  if (staged) {
    tempUserDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bmt-dest-'))
    await fs.chmod(tempUserDataDir, 0o700)
    userDataDir = tempUserDataDir
    profileArg = 'Default'
    stagedProfileDir = path.join(tempUserDataDir, profileArg)
  }

  const port = await getFreePort()
  const child = spawn(
    info.executablePath,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      `--profile-directory=${profileArg}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-session-crashed-bubble',
      '--hide-crash-restore-bubble',
      '--new-window',
      'about:blank'
    ],
    { stdio: 'ignore' }
  )

  let exited = false
  child.once('exit', () => {
    exited = true
  })

  const cleanup = async () => {
    if (tempUserDataDir) {
      await fs.rm(tempUserDataDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  try {
    const version = await waitForDevTools(port, 25000)
    if (exited) throw new Error('The destination browser closed before migration could start')
    return {
      browserId,
      port,
      browserWebSocketUrl: version.webSocketDebuggerUrl,
      process: child,
      staged,
      realProfileDir,
      stagedProfileDir,
      tempUserDataDir,
      async close() {
        await new Promise<void>((resolve) => {
          if (child.exitCode !== null) {
            resolve()
            return
          }
          const termTimer = setTimeout(() => {
            try {
              child.kill('SIGTERM')
            } catch {
              // ignore
            }
          }, 6000)
          const killTimer = setTimeout(() => {
            try {
              if (child.exitCode === null) child.kill('SIGKILL')
            } catch {
              // ignore
            }
            resolve()
          }, 11000)
          child.once('exit', () => {
            clearTimeout(termTimer)
            clearTimeout(killTimer)
            resolve()
          })
        })
      },
      cleanup
    }
  } catch (error) {
    try {
      child.kill('SIGKILL')
    } catch {
      // ignore
    }
    await cleanup()
    throw error
  }
}

export async function findPageTarget(port: number, timeoutMs = 15000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const pages = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as Array<{
        type: string
        url: string
        webSocketDebuggerUrl?: string
      }>
      const page = pages.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl)
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('No browser page was available for session migration')
}
