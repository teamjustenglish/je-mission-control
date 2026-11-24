// report-problem (25 Nov 2026): saves one "Report a problem" from the avatar menu as an open alfred_notes row.
// Only for someone logged in to MC (their own login token); who, role and time come from the server, never the form.
// At most PROBLEM_LIMITS.perHour reports per person per hour. One small indexed table, nothing else is read.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PROBLEM_LIMITS, problemNoteInput } from '../_shared/problem-rules.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } }
  const user = auth?.user
  if (!user) return json({ error: 'Please log in again', login: true }, 401)
  const { data: profile } = await admin.from('profiles').select('id, name, role').eq('id', user.id).maybeSingle()
  if (!profile) return json({ error: 'Please log in again', login: true }, 401)

  const body = await req.json().catch(() => ({}))
  const note = problemNoteInput(body, { id: user.id, name: profile.name, role: profile.role })
  if (!note) return json({ error: `Write what happened (up to ${PROBLEM_LIMITS.detail} characters)` }, 400)

  try {
    const since = new Date(Date.now() - 3_600_000).toISOString()
    const { count } = await admin.from('alfred_notes').select('id', { count: 'exact', head: true })
      .eq('source', 'report').eq('reported_by', user.id).gt('created_at', since)
    if ((count ?? 0) >= PROBLEM_LIMITS.perHour) {
      return json({ error: 'You have sent a lot of reports this hour. Please try again a bit later.' }, 429)
    }
    const { error } = await admin.from('alfred_notes').insert(note)
    if (error) throw error
    return json({ ok: true })
  } catch (e) {
    console.error('report-problem', String(e).slice(0, 160))
    return json({ error: 'Could not send the report. Try again in a moment.' }, 500)
  }
})
