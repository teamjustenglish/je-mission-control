// "Report a problem" (25 Nov 2026): the box in the avatar menu's Help & feedback.
// Pure rules, tested in src/lib/problem-rules.test.ts; the report-problem function uses them.
// A report becomes an open alfred_notes row (source 'report'), which alfred-status shows to HQ.

export const PROBLEM_SEVERITIES = ['blocking', 'annoying', 'idea'] as const
export type ProblemSeverity = (typeof PROBLEM_SEVERITIES)[number]
export const PROBLEM_LIMITS = {
  detail: 4000, title: 120, page: 80, about: 120, errors: 5, error: 300, browser: 300,
  perHour: 10, // reports one person can send in an hour
} as const

const ISO = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/

/** One line of text: spaces tidied, cut to max. Empty -> null. */
const line = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, max) : null
}

/** "What happened?": trimmed, line breaks kept, 1..4000 characters. */
export function problemDetail(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return t && t.length <= PROBLEM_LIMITS.detail ? t : null
}

/** The note's title: the report's first non-empty line, at most 120 characters. */
export function firstLine(text: string): string {
  const l = text.split('\n').map(x => x.trim()).find(Boolean) ?? ''
  return l.length > PROBLEM_LIMITS.title ? l.slice(0, PROBLEM_LIMITS.title - 1).trimEnd() + '…' : l
}

/** Only the path of the page (no ?query or #hash, which can hold tokens). */
export function cleanPage(v: unknown): string | null {
  const t = line(v, 500)
  if (!t) return null
  const path = t.split(/[?#]/)[0]
  return path.startsWith('/') ? path.slice(0, PROBLEM_LIMITS.page) : null
}

export type Reporter = { id: string; name: string | null; role: string | null }

export type ProblemNote = {
  title: string; detail: string; status: 'open'; source: 'report'
  severity: ProblemSeverity; page: string | null; about: string | null
  reported_by: string; reporter_name: string | null; reporter_role: string | null
  browser: string | null; client_time: string | null; errors: string[] | null
}

/** The browser's form -> a note to save, or null when "What happened?" is empty or too long.
 *  Who reported it always comes from the login, never from the form. */
export function problemNoteInput(body: unknown, who: Reporter): ProblemNote | null {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const detail = problemDetail(b.detail)
  if (!detail) return null
  const errors = (Array.isArray(b.errors) ? b.errors : [])
    .map(e => line(e, PROBLEM_LIMITS.error)).filter((e): e is string => !!e).slice(-PROBLEM_LIMITS.errors)
  const time = typeof b.client_time === 'string' && b.client_time.length <= 40 && ISO.test(b.client_time) ? b.client_time : null
  return {
    title: firstLine(detail),
    detail,
    status: 'open',
    source: 'report',
    severity: (PROBLEM_SEVERITIES as readonly string[]).includes(b.severity as string) ? (b.severity as ProblemSeverity) : 'annoying',
    page: cleanPage(b.page),
    about: line(b.about, PROBLEM_LIMITS.about),
    reported_by: who.id,
    reporter_name: line(who.name, 80),
    reporter_role: line(who.role, 20),
    browser: line(b.browser, PROBLEM_LIMITS.browser),
    client_time: time,
    errors: errors.length ? errors : null,
  }
}
