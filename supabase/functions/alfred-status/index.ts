// alfred-status: read-only health feed for Alfred HQ (contract: ~/code/je/ALFRED-HQ.md).
//
// POST with header `x-alfred-hq-key: <key>`. Only the key's SHA-256 hex is stored
// (public.private_secrets, key 'alfred_hq_key_sha256'; RLS on, service role only).
// Anything else gets 401. It never writes anything.
//
// No personal data in the response: counts, timestamps and note text only.
// Cheap on purpose: one SQL call (alfred_status_snapshot), one notes read, one
// tiny self-test of mc-mcp; the whole answer is cached for 60 s.
//
// When an MC feature is added or changed, add/update its health check and numbers here
// (and in alfred_status_snapshot() if it needs new counts). See AGENTS.md.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

type Health = { name: string; ok: boolean; detail: string }
type NumberItem = { label: string; value: string }

let cachedHash: string | null = null
let cachedBody: { at: number; json: string } | null = null
const CACHE_MS = 60_000

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function expectedHash(): Promise<string | null> {
  if (cachedHash) return cachedHash
  const { data, error } = await admin
    .from('private_secrets').select('value').eq('key', 'alfred_hq_key_sha256').maybeSingle()
  if (error || !data?.value) return null
  cachedHash = String(data.value).toLowerCase()
  return cachedHash
}

function ago(iso: string | null | undefined): { hours: number; text: string } {
  if (!iso) return { hours: Infinity, text: 'never' }
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  const hours = mins / 60
  if (mins < 60) return { hours, text: `${mins} min ago` }
  if (mins < 48 * 60) return { hours, text: `${Math.round(hours)} h ago` }
  return { hours, text: `${Math.round(hours / 24)} days ago` }
}

// mc-mcp must refuse a request without its key (security fix, PR #66).
async function mcpLocked(): Promise<Health> {
  const name = 'MC connector (mc-mcp) needs its key'
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/mc-mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      signal: AbortSignal.timeout(5000),
    })
    await res.body?.cancel()
    if (res.status === 401) return { name, ok: true, detail: 'request without key refused' }
    return { name, ok: false, detail: `request without key got ${res.status}: anyone can read MC data and post announcements` }
  } catch (e) {
    return { name, ok: false, detail: `could not test: ${(e as Error).message}` }
  }
}

async function buildStatus(): Promise<string> {
  const health: Health[] = []
  const numbers: NumberItem[] = []

  const t0 = Date.now()
  const [snapRes, notesRes, mcp] = await Promise.all([
    admin.rpc('alfred_status_snapshot'),
    admin.from('alfred_notes')
      .select('id, title, detail, status, source, created_at, fixed_at, fix, times_seen, last_seen_at, severity, page, about, reporter_name, reporter_role, errors')
      .or(`status.eq.open,fixed_at.gt."${new Date(Date.now() - 30 * 86_400_000).toISOString()}"`)
      .order('created_at', { ascending: false })
      .limit(50),
    mcpLocked(),
  ])
  const ms = Date.now() - t0
  const s = (snapRes.data ?? {}) as Record<string, unknown> & { last_mod_action_at?: string; last_share_view_at?: string; last_sign_in_at?: string }

  health.push(snapRes.error
    ? { name: 'Database answering', ok: false, detail: snapRes.error.message }
    : { name: 'Database answering', ok: true, detail: `answered in ${ms} ms` })

  if (!snapRes.error) {
    // Sessions run Mon/Tue/Thu/Fri, so a quiet weekend is normal: warn after 4 days.
    const act = ago(s.last_mod_action_at)
    health.push({ name: 'Mods logging work in MC', ok: act.hours <= 96, detail: `last mod action ${act.text}` })

    const view = ago(s.last_share_view_at)
    health.push({ name: 'Student result pages opening', ok: view.hours <= 7 * 24, detail: `last opened ${view.text}` })

    const signIn = ago(s.last_sign_in_at)
    health.push({ name: 'Logins working', ok: signIn.hours <= 4 * 24, detail: `last sign-in ${signIn.text}` })

    health.push({
      name: 'Raw SQL closed to the public',
      ok: s.raw_sql_open_to_public === false,
      detail: s.raw_sql_open_to_public ? 'exec_select_query is callable with the public key' : 'only the server can run it',
    })
  }
  health.push(mcp)

  if (!snapRes.error) {
    // "Report a problem" (25 Nov): a report someone marked "blocking" means they can't do their work.
    const blocking = Number(s.open_blocking_reports ?? 0)
    health.push({
      name: 'No one blocked (problem reports)',
      ok: blocking === 0,
      detail: blocking === 0 ? 'no open "blocking" reports' : `${blocking} open report(s) marked blocking`,
    })
  }

  if (!snapRes.error) {
    numbers.push(
      { label: 'Batches running', value: String(s.running_batches ?? 0) },
      { label: 'Mods with a running batch', value: String(s.mods_running ?? 0) },
      { label: 'Active students', value: String(s.active_students ?? 0) },
      { label: 'Absences missing a reason', value: String(s.absences_no_reason ?? 0) },
      { label: 'Mod actions (7 days)', value: String(s.mod_actions_7d ?? 0) },
      { label: 'Result links live', value: String(s.share_links_live ?? 0) },
      { label: 'Open notes', value: String(s.open_notes ?? 0) },
      { label: 'Open problem reports', value: String(s.open_problem_reports ?? 0) },
    )
  }

  const notes = (notesRes.data ?? []).map(n => ({
    id: n.id, title: n.title, detail: n.detail, status: n.status, source: n.source,
    created_at: n.created_at, fixed_at: n.fixed_at, fix: n.fix,
    times_seen: n.times_seen, last_seen_at: n.last_seen_at,
    // Set only on people's reports (source 'report'). Reporter = their MC display name + role, nothing else.
    severity: n.severity ?? null, page: n.page ?? null, about: n.about ?? null,
    reported_by: n.source === 'report' ? [n.reporter_name, n.reporter_role].filter(Boolean).join(' · ') || null : null,
    errors: n.errors ?? null,
  }))
  if (notesRes.error) health.push({ name: 'Notes list readable', ok: false, detail: notesRes.error.message })

  return JSON.stringify({
    project: 'mc',
    name: 'Mission Control',
    url: 'https://missioncontrol.justenglish.lk',
    checked_at: new Date().toISOString(),
    health,
    numbers,
    notes,
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const presented = req.headers.get('x-alfred-hq-key') ?? ''
  const expected = await expectedHash()
  if (!presented || !expected || !timingSafeEqual(await sha256Hex(presented), expected)) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    if (!cachedBody || Date.now() - cachedBody.at > CACHE_MS) {
      cachedBody = { at: Date.now(), json: await buildStatus() }
    }
    return new Response(cachedBody.json, {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    })
  } catch (e) {
    return new Response(JSON.stringify({
      project: 'mc', name: 'Mission Control', url: 'https://missioncontrol.justenglish.lk',
      checked_at: new Date().toISOString(),
      health: [{ name: 'Status feed', ok: false, detail: (e as Error).message }],
      numbers: [], notes: [],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
})
