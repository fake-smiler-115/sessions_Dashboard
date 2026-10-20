import React from 'react'

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-[#2a2e4a] bg-[#15182a] ${className}`}>{children}</div>
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
    default: 'bg-[#23263d] hover:bg-[#2d3150] text-[#e7e9ee]',
    primary: 'bg-[#3b82f6] hover:bg-[#2f6fd6] text-white',
    danger: 'bg-[#b91c1c] hover:bg-[#991b1b] text-white',
    ghost: 'bg-transparent hover:bg-[#23263d] text-[#a9adbf]'
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    Supported: 'bg-[#14532d] text-[#86efac] border-[#166534]',
    'Partially supported': 'bg-[#422006] text-[#fcd34d] border-[#854d0e]',
    'Requires permission': 'bg-[#3b2f63] text-[#c4b5fd] border-[#5b21b6]',
    Unsupported: 'bg-[#3f1d1d] text-[#fca5a5] border-[#7f1d1d]',
    'Not detected': 'bg-[#1f2237] text-[#8b90a8] border-[#2a2e4a]',
    'Same browser/profile': 'bg-[#172554] text-[#93c5fd] border-[#1e40af]',
    Blocked: 'bg-[#422006] text-[#fcd34d] border-[#854d0e]',
    'Not scanned': 'bg-[#1f2237] text-[#8b90a8] border-[#2a2e4a]',
    migrated: 'bg-[#14532d] text-[#86efac] border-[#166534]',
    'partially-migrated': 'bg-[#422006] text-[#fcd34d] border-[#854d0e]',
    failed: 'bg-[#3f1d1d] text-[#fca5a5] border-[#7f1d1d]',
    skipped: 'bg-[#1f2237] text-[#8b90a8] border-[#2a2e4a]',
    success: 'bg-[#14532d] text-[#86efac] border-[#166534]',
    partial: 'bg-[#422006] text-[#fcd34d] border-[#854d0e]',
    running: 'bg-[#14532d] text-[#86efac] border-[#166534]',
    stopped: 'bg-[#1f2237] text-[#8b90a8] border-[#2a2e4a]',
    Readable: 'bg-[#14532d] text-[#86efac] border-[#166534]',
    Restricted: 'bg-[#3b2f63] text-[#c4b5fd] border-[#5b21b6]'
  }
  const label = status.replace(/-/g, ' ')
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${map[status] ?? 'bg-[#1f2237] text-[#a9adbf] border-[#2a2e4a]'}`}>
      {label}
    </span>
  )
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-[#8b90a8]">{subtitle}</p>}
    </div>
  )
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#2a2e4a] px-6 py-14 text-center">
      <div className="text-base font-medium">{title}</div>
      <p className="mt-2 max-w-md text-sm text-[#8b90a8]">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-[#8b90a8]">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#3b82f6] border-t-transparent" />
      {label ?? 'Working...'}
    </div>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#8b90a8]">{label}</span>
      {children}
    </label>
  )
}

export const selectClass =
  'w-full rounded-md border border-[#2a2e4a] bg-[#0f1026] px-3 py-2 text-sm text-[#e7e9ee] outline-none focus:border-[#3b82f6]'

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
      className={`inline-flex items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white ${colors[browserId] ?? 'from-[#475569] to-[#1e293b]'} ${sizes[size]}`}
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
