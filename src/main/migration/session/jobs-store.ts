import fs from 'fs/promises'
import path from 'path'
import type { StoredJob } from '../../../shared/types/session'

export async function readJobs(userDataDir: string): Promise<StoredJob[]> {
  try {
    const raw = await fs.readFile(path.join(userDataDir, 'jobs.json'), 'utf8')
    const parsed = JSON.parse(raw) as StoredJob[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function appendJob(userDataDir: string, job: StoredJob): Promise<void> {
  const existing = await readJobs(userDataDir)
  const next = [job, ...existing].slice(0, 50)
  await fs.mkdir(userDataDir, { recursive: true, mode: 0o700 })
  await fs.writeFile(path.join(userDataDir, 'jobs.json'), JSON.stringify(next, null, 2), { mode: 0o600 })
}
