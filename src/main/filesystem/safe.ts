import path from 'path'

export function isSafePath(base: string, target: string): boolean {
  const resolvedBase = path.resolve(base)
  const resolvedTarget = path.resolve(target)
  return resolvedTarget.startsWith(resolvedBase + path.sep) || resolvedTarget === resolvedBase
}

export function sanitizePath(p: string): string {
  return path.normalize(p)
}
