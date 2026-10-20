import React, { useEffect, useState } from 'react'
import type { BrowserId, BrowserProfile } from '../../shared/types/browser'
import { BrowserAvatar, Button, Card, EmptyState, SectionTitle, Spinner, StatusPill } from '../components/ui'

const CATEGORY_INFO: Record<string, string> = {
  bookmarks: 'Bookmark import/export is not implemented in this build.',
  history: 'History conversion is not implemented in this build.',
  passwords: 'Credential migration is not implemented. Use the browser’s own export/import features.',
  cookies: 'Origin-scoped cookie transfer through a local Chromium automation interface, after Keychain authorisation.',
  localStorage: 'String Local Storage records for a selected origin, written by the destination browser.',
  indexedDB: 'IndexedDB has no supported cross-browser import path in this build.',
  sessionStorage: 'Session Storage is tab-scoped and cannot be recreated losslessly.',
  extensions: 'Extension migration is not supported.',
  settings: 'Browser settings migration is not supported.'
}

const CATEGORY_LABELS: Record<string, string> = {
  bookmarks: 'Bookmarks',
  history: 'Browsing history',
  passwords: 'Saved passwords',
  cookies: 'Cookies',
  localStorage: 'Local Storage',
  indexedDB: 'IndexedDB',
  sessionStorage: 'Session Storage',
  extensions: 'Extensions',
  settings: 'Browser settings'
}

interface Props {
  profiles: BrowserProfile[]
  onMigrate: (source: BrowserId, dest: BrowserId) => void
}

export default function Compatibility({ profiles, onMigrate }: Props) {
  const browsers = [...new Map(profiles.map((profile) => [profile.browserId, profile])).values()]
  const [selected, setSelected] = useState<{ source: BrowserId; dest: BrowserId } | null>(null)
  const [matrix, setMatrix] = useState<Record<string, Record<string, Record<string, string>>>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const next: Record<string, Record<string, Record<string, string>>> = {}
      for (const source of browsers) {
        next[source.browserId] = {}
        for (const dest of browsers) {
          next[source.browserId][dest.browserId] = await window.api.getCompatibility(source.browserId, dest.browserId)
        }
      }
      if (!cancelled) setMatrix(next)
    }
    if (browsers.length > 0) void load()
    return () => {
      cancelled = true
    }
  }, [profiles])

  const detailCategories = selected ? matrix[selected.source]?.[selected.dest] : undefined

  async function refreshCell(source: BrowserId, dest: BrowserId) {
    setLoading(true)
    try {
      const value = await window.api.getCompatibility(source, dest)
      setMatrix((current) => ({ ...current, [source]: { ...(current[source] ?? {}), [dest]: value } }))
      setSelected({ source, dest })
    } finally {
      setLoading(false)
    }
  }

  if (browsers.length === 0) {
    return (
      <div>
        <SectionTitle title="Migration Compatibility" subtitle="Real capability results from the browser adapters." />
        <EmptyState title="No browsers detected" description="Scan browsers first to build the compatibility matrix." />
      </div>
    )
  }

  return (
    <div>
      <SectionTitle
        title="Migration Compatibility"
        subtitle="A category is only marked supported when a migration method is implemented and the destination can be written safely."
      />

      <Card className="mb-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#0f1026]">
              <tr>
                <th className="px-3 py-3 text-xs uppercase tracking-wide text-[#8b90a8]">Source ↓ / Destination →</th>
                {browsers.map((dest) => (
                  <th key={dest.browserId} className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <BrowserAvatar browserId={dest.browserId} size="sm" />
                      <span className="text-xs font-medium">{dest.browserName}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {browsers.map((source) => (
                <tr key={source.browserId} className="border-t border-[#23263d]">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <BrowserAvatar browserId={source.browserId} size="sm" />
                      <span className="text-xs font-medium">{source.browserName}</span>
                    </div>
                  </td>
                  {browsers.map((dest) => {
                    const value = matrix[source.browserId]?.[dest.browserId]
                    return (
                      <td key={dest.browserId} className="px-3 py-3">
                        <button
                          onClick={() => void refreshCell(source.browserId, dest.browserId)}
                          className={`w-full rounded-md border px-2 py-2 text-left text-xs transition ${
                            selected?.source === source.browserId && selected?.dest === dest.browserId
                              ? 'border-[#3b82f6] bg-[#1e293b]'
                              : 'border-[#2a2e4a] bg-[#15182a] hover:border-[#3b5b9a]'
                          }`}
                        >
                          {source.browserId === dest.browserId ? (
                            <span className="text-[#93c5fd]">Same browser</span>
                          ) : value ? (
                            <div className="flex flex-col gap-1">
                              <StatusPill status={value['cookies']} />
                              <span className="text-[10px] text-[#8b90a8]">cookies · {value['localStorage']} storage</span>
                            </div>
                          ) : (
                            <span className="text-[#6b6f8a]">{loading ? 'Checking...' : 'Check compatibility'}</span>
                          )}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {loading && <Spinner label="Reading capabilities..." />}

      {selected && detailCategories && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                {browsers.find((browser) => browser.browserId === selected.source)?.browserName} →{' '}
                {browsers.find((browser) => browser.browserId === selected.dest)?.browserName}
              </h2>
              <p className="text-xs text-[#8b90a8]">
                Category-level capability. Select a website in Website Migration for a record-level plan.
              </p>
            </div>
            <Button
              variant="primary"
              onClick={() => onMigrate(selected.source, selected.dest)}
              disabled={!detailCategories['cookies'] || detailCategories['cookies'] === 'Unsupported'}
            >
              Start website migration
            </Button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
            {Object.entries(detailCategories).map(([category, status]) => (
              <div key={category} className="rounded-lg border border-[#2a2e4a] bg-[#0f1026] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{CATEGORY_LABELS[category] ?? category}</span>
                  <StatusPill status={status} />
                </div>
                <p className="mt-1 text-xs text-[#8b90a8]">{CATEGORY_INFO[category]}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
