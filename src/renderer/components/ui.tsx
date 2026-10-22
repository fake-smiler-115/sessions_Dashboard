import React from 'react'

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`app-card rounded-xl border border-[#2a2e4a] bg-[#15182a] ${className}`}>{children}</div>
}

export function Button({
  children,
  onClick,
  disabled,
  variant = 'default',
  type = 'button',
  className = ''
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'default' | 'primary' | 'danger' | 'ghost'
  type?: 'button' | 'submit'
  className?: string
}) {
  const styles: Record<string, string> = {
    default: 'button-default bg-[#23263d] hover:bg-[#2d3150] text-[#e7e9ee]',
    primary: 'button-primary bg-[#3b82f6] hover:bg-[#2f6fd6] text-white',
    danger: 'button-danger bg-[#b91c1c] hover:bg-[#991b1b] text-white',
    ghost: 'button-ghost bg-transparent hover:bg-[#23263d] text-[#a9adbf]'
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`app-button rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    Supported: 'status-supported',
    'Partially supported': 'status-partial',
    'Requires permission': 'status-permission',
    Unsupported: 'status-danger',
    'Not detected': 'status-muted',
    'Same browser/profile': 'status-info',
    Blocked: 'status-partial',
    'Not scanned': 'status-muted',
    migrated: 'status-supported',
    'partially-migrated': 'status-partial',
    failed: 'status-danger',
    skipped: 'status-muted',
    success: 'status-supported',
    partial: 'status-partial',
    running: 'status-supported',
    stopped: 'status-muted',
    Readable: 'status-supported',
    Restricted: 'status-permission'
  }
  const label = status.replace(/-/g, ' ')
  return (
    <span className={`status-pill inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${map[status] ?? 'status-muted'}`}>
      {label}
    </span>
  )
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="section-title mb-4">
      <div className="page-kicker">Browser Migration</div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-[#8b90a8]">{subtitle}</p>}
    </div>
  )
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="empty-state flex flex-col items-center justify-center rounded-xl border border-dashed border-[#2a2e4a] px-6 py-14 text-center">
      <div className="text-base font-medium">{title}</div>
      <p className="mt-2 max-w-md text-sm text-[#8b90a8]">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-[#8b90a8]">
      <span className="spinner-mark h-4 w-4 animate-spin rounded-full border-2 border-[#3b82f6] border-t-transparent" />
      {label ?? 'Working...'}
    </div>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="field-label mb-1 block text-xs font-medium uppercase tracking-wide text-[#8b90a8]">{label}</span>
      {children}
    </label>
  )
}

export const selectClass =
  'form-control w-full rounded-md border border-[#2a2e4a] bg-[#0f1026] px-3 py-2 text-sm text-[#e7e9ee] outline-none focus:border-[#3b82f6]'

export function BrowserAvatar({ browserId, size = 'md' }: { browserId: string; size?: 'sm' | 'md' | 'lg' }) {
  const colors: Record<string, string> = {
    chrome: 'from-[#fbbc05] to-[#ea4335]',
    brave: 'from-[#fb542b] to-[#f59e0b]',
    arc: 'from-[#7c3aed] to-[#ec4899]',
    edge: 'from-[#0ea5e9] to-[#22c55e]',
    firefox: 'from-[#f97316] to-[#dc2626]',
    safari: 'from-[#38bdf8] to-[#2563eb]'
  }
  const letters: Record<string, string> = {
    chrome: 'C',
    brave: 'B',
    arc: 'A',
    edge: 'E',
    firefox: 'F',
    safari: 'S'
  }
  const sizes = { sm: 'h-7 w-7 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-12 w-12 text-base' }
  return (
    <span
      className={`browser-avatar inline-flex items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white ${colors[browserId] ?? 'from-[#475569] to-[#1e293b]'} ${sizes[size]}`}
    >
      {letters[browserId] ?? '?'}
    </span>
  )
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}
