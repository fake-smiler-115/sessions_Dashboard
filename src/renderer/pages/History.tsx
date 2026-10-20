import React, { useEffect, useState } from 'react'
import type { StoredJob } from '../../shared/types/session'
import { Button, Card, EmptyState, SectionTitle, Spinner, StatusPill } from '../components/ui'

export default function History() {
  const [jobs, setJobs] = useState<StoredJob[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      setJobs(await window.api.getJobs())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-3">
        <SectionTitle title="Migration History" subtitle="Completed, partial, and failed website session migrations." />
        <Button onClick={() => void load()}>Refresh</Button>
      </div>

      {loading ? (
        <Spinner label="Loading jobs..." />
      ) : jobs.length === 0 ? (
        <EmptyState
          title="No migration jobs yet"
          description="Completed migrations appear here with their verification results and backup location. Source profiles are never modified."
        />
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const isOpen = expanded === job.id
            return (
              <Card key={job.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{job.origin}</span>
                      <StatusPill status={job.overall} />
                    </div>
                    <div className="mt-1 text-xs text-[#8b90a8]">
                      {job.sourceBrowserId} → {job.destBrowserId} · {new Date(job.startedAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {job.backupPath && (
                      <Button variant="ghost" onClick={() => void window.api.revealPath(job.backupPath!)}>
                        Reveal backup
                      </Button>
                    )}
                    <Button onClick={() => setExpanded(isOpen ? null : job.id)}>{isOpen ? 'Hide report' : 'Open report'}</Button>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-4 space-y-3">
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {job.result.categories.map((category) => (
                        <div key={category.category} className="rounded-lg border border-[#2a2e4a] bg-[#0f1026] p-3 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{category.category}</span>
                            <StatusPill status={category.status} />
                          </div>
                          <div className="mt-1 text-[#8b90a8]">
                            imported {category.imported} · skipped {category.skipped} · failed {category.failed} · verified{' '}
                            {category.verified ? 'yes' : 'no'}
                          </div>
                          {category.reasons.map((reason) => (
                            <div key={reason} className="mt-1 text-[#a9adbf]">• {reason}</div>
                          ))}
                        </div>
                      ))}
                    </div>

                    <div className="rounded-lg border border-[#2a2e4a] bg-[#0f1026] p-3 text-xs">
                      <div className="font-medium">Verification</div>
                      <div className="mt-1 text-[#8b90a8]">
                        Cookies {job.result.verification.cookiesMatched}/{job.result.verification.cookiesChecked} · Local
                        Storage {job.result.verification.localStorageMatched}/{job.result.verification.localStorageChecked}
                      </div>
                      {job.result.verification.details.map((detail) => (
                        <div key={detail} className="mt-1 text-[#a9adbf]">• {detail}</div>
                      ))}
                    </div>

                    <div className="rounded-lg border border-[#2a2e4a] bg-[#0f1026] p-3 text-xs">
                      <div className="font-medium">Not migrated</div>
                      {job.result.limitations.map((limitation) => (
                        <div key={limitation} className="mt-1 text-[#a9adbf]">• {limitation}</div>
                      ))}
                    </div>

                    {job.backupPath && (
                      <div className="break-all font-mono text-[11px] text-[#6b6f8a]">Backup: {job.backupPath}</div>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
