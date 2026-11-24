// Keeps the page's last few errors in memory so "Report a problem" can send them along.
// Nothing is stored or sent unless the person sends a report.
const MAX = 5
const errors: string[] = []

const push = (msg: string) => {
  const t = msg.replace(/\s+/g, ' ').trim().slice(0, 300)
  if (!t) return
  errors.push(`${new Date().toISOString().slice(11, 19)} ${t}`)
  if (errors.length > MAX) errors.shift()
}

let installed = false
export function installErrorCatcher(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('error', e => push(e.message || String(e.error ?? 'error')))
  window.addEventListener('unhandledrejection', e => {
    const r = (e as PromiseRejectionEvent).reason
    push(r instanceof Error ? r.message : String(r))
  })
}

export const recentErrors = (): string[] => [...errors]
