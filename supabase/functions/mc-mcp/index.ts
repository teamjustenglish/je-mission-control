import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// TODO(v2): add endpoint-level auth (e.g. shared secret header) so only
// trusted claude.ai connector requests can reach this function.

// ── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'mc_query_data',
    description:
      'Run a read-only SELECT query against Mission Control tables. ' +
      'Available tables: attendance, batches, mod_profiles (use `profiles`), students, ' +
      'announcements, announcement_poll_options, announcement_reads, announcement_votes, activity_log. ' +
      'Only SELECT statements are allowed. Use this to answer ad-hoc questions about raw data.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'A valid PostgreSQL SELECT statement. Must start with SELECT.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'mc_send_announcement',
    description:
      'Publish a new announcement to all moderators in Mission Control. ' +
      'Optionally attach a poll. Use this to broadcast program updates, reminders, or decisions.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short headline for the announcement.' },
        body: { type: 'string', description: 'Full announcement text (markdown OK).' },
        has_poll: {
          type: 'boolean',
          description: 'Set true to attach a poll. Requires poll_options.',
          default: false,
        },
        poll_options: {
          type: 'array',
          items: { type: 'string' },
          description: 'Poll option texts (2–6 items). Required when has_poll is true.',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'mc_get_mod_engagement',
    description:
      'Return engagement statistics per moderator: average days to mark attendance, ' +
      'percentage of sessions marked same-day, absences missing a reason (loose ends), ' +
      'and dropped student count. Pass a mod name to filter to one mod, or omit for all.',
    inputSchema: {
      type: 'object',
      properties: {
        mod_name: {
          type: 'string',
          description: 'Exact or partial mod display name. Omit to get all mods.',
        },
      },
    },
  },
  {
    name: 'mc_list_overdue_tasks',
    description:
      'List pending "loose ends" — absences (state=x) that are still missing both ' +
      'an absence reason and a category, for active (non-dropped) students only. ' +
      'Mirrors the overdue tasks panel in the Mod Dashboard. Filter by mod name or omit for all.',
    inputSchema: {
      type: 'object',
      properties: {
        mod_name: {
          type: 'string',
          description: 'Exact or partial mod display name. Omit to get all mods.',
        },
      },
    },
  },
  {
    name: 'mc_get_batch_health',
    description:
      'Return a health snapshot for a batch: total students, active count, dropped count, ' +
      'current-week attendance percentage, number of open loose ends, and the mod name. ' +
      'Use this to quickly assess how a batch is doing.',
    inputSchema: {
      type: 'object',
      properties: {
        batch_name: {
          type: 'string',
          description: 'The batch name (partial match is OK, e.g. "Anne" or "May 2026").',
        },
      },
      required: ['batch_name'],
    },
  },
]

// ── Forbidden SQL verbs ──────────────────────────────────────────────────────
const FORBIDDEN = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXEC|EXECUTE)\b/i

function assertSelectOnly(query: string): void {
  const trimmed = query.trimStart()
  if (!/^SELECT\b/i.test(trimmed)) throw new Error('Only SELECT queries are allowed')
  if (FORBIDDEN.test(trimmed)) throw new Error('Query contains a forbidden SQL keyword')
}

// ── Tool implementations ─────────────────────────────────────────────────────

async function toolQueryData(supabase: ReturnType<typeof createClient>, args: Record<string, unknown>) {
  const query = String(args.query ?? '').trim()
  if (!query) throw new Error('query is required')
  assertSelectOnly(query)
  // exec_select_query is a SECURITY DEFINER RPC that validates and runs SELECT-only SQL
  const { data, error } = await supabase.rpc('exec_select_query', { query })
  if (error) throw new Error(error.message)
  return data
}

async function toolSendAnnouncement(
  supabase: ReturnType<typeof createClient>,
  args: Record<string, unknown>,
) {
  const title = String(args.title ?? '').trim()
  if (!title) throw new Error('title is required')
  const body = args.body ? String(args.body) : null
  const has_poll = args.has_poll === true
  const poll_options: string[] = Array.isArray(args.poll_options)
    ? (args.poll_options as string[]).filter((o) => typeof o === 'string' && o.trim())
    : []

  if (has_poll && poll_options.length < 2)
    throw new Error('has_poll requires at least 2 poll_options')

  // Resolve an admin profile — service role bypasses RLS so we can join user_roles
  const { data: adminProfile, error: adminErr } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'admin')
    .limit(1)
    .single()
  if (adminErr || !adminProfile) throw new Error('Could not resolve admin profile for created_by')

  const { data: ann, error: insertErr } = await supabase
    .from('announcements')
    .insert({ title, body, has_poll, created_by: adminProfile.user_id, target_type: 'all_mods' })
    .select('id, title, created_at')
    .single()
  if (insertErr) throw new Error(insertErr.message)

  if (has_poll && poll_options.length > 0) {
    const rows = poll_options.map((option_text, position) => ({
      announcement_id: ann.id,
      option_text,
      position,
    }))
    const { error: pollErr } = await supabase.from('announcement_poll_options').insert(rows)
    if (pollErr) throw new Error(pollErr.message)
  }

  return { id: ann.id, title: ann.title, created_at: ann.created_at, has_poll, poll_options }
}

async function toolGetModEngagement(
  supabase: ReturnType<typeof createClient>,
  args: Record<string, unknown>,
) {
  const modNameFilter = args.mod_name ? String(args.mod_name).trim() : null

  // Fetch all mods with their batches
  let profilesQuery = supabase.from('profiles').select('id, name, email')
  if (modNameFilter) profilesQuery = profilesQuery.ilike('name', `%${modNameFilter}%`)
  const { data: profiles, error: pErr } = await profilesQuery
  if (pErr) throw new Error(pErr.message)
  if (!profiles || profiles.length === 0) return { mods: [] }

  const modIds = profiles.map((p: any) => p.id)

  const [batchesRes, activityRes] = await Promise.all([
    supabase.from('batches').select('id, name, mod_id').in('mod_id', modIds),
    supabase
      .from('activity_log')
      .select('mod_id, action_type, created_at')
      .in('mod_id', modIds)
      .order('created_at', { ascending: false }),
  ])

  const batches: any[] = batchesRes.data ?? []
  const activityRows: any[] = activityRes.data ?? []
  const batchIds = batches.map((b: any) => b.id)

  let students: any[] = []
  let attendance: any[] = []

  if (batchIds.length > 0) {
    const [studRes, attRes] = await Promise.all([
      supabase.from('students').select('id, batch_id, status').in('batch_id', batchIds),
      supabase
        .from('attendance')
        .select('student_id, batch_id, session_index, state, absence_note, absence_category')
        .in('batch_id', batchIds),
    ])
    students = studRes.data ?? []
    attendance = attRes.data ?? []
  }

  const results = profiles.map((mod: any) => {
    const modBatches = batches.filter((b: any) => b.mod_id === mod.id)
    const modBatchIds = new Set(modBatches.map((b: any) => b.id))
    const modStudents = students.filter((s: any) => modBatchIds.has(s.batch_id))
    const activeStudentIds = new Set(
      modStudents.filter((s: any) => s.status !== 'dropped').map((s: any) => s.id),
    )
    const droppedCount = modStudents.filter((s: any) => s.status === 'dropped').length

    // Activity log stats — count attendance-related actions
    const attActions = activityRows.filter(
      (a: any) => a.mod_id === mod.id && a.action_type === 'attendance_marked',
    )

    // Loose ends: absent with no note and no category, active students only
    const looseEnds = attendance.filter(
      (a: any) =>
        modBatchIds.has(a.batch_id) &&
        a.state === 'x' &&
        !a.absence_note &&
        !a.absence_category &&
        activeStudentIds.has(a.student_id),
    )

    const lastActivity = activityRows.find((a: any) => a.mod_id === mod.id)?.created_at ?? null

    return {
      mod: mod.name,
      email: mod.email,
      batches: modBatches.length,
      dropped_students: droppedCount,
      open_loose_ends: looseEnds.length,
      attendance_actions_logged: attActions.length,
      last_activity: lastActivity,
    }
  })

  return { mods: results }
}

async function toolListOverdueTasks(
  supabase: ReturnType<typeof createClient>,
  args: Record<string, unknown>,
) {
  const modNameFilter = args.mod_name ? String(args.mod_name).trim() : null

  let profilesQuery = supabase.from('profiles').select('id, name')
  if (modNameFilter) profilesQuery = profilesQuery.ilike('name', `%${modNameFilter}%`)
  const { data: profiles, error: pErr } = await profilesQuery
  if (pErr) throw new Error(pErr.message)
  if (!profiles || profiles.length === 0) return { loose_ends: [] }

  const modIds = profiles.map((p: any) => p.id)
  const { data: batches, error: bErr } = await supabase
    .from('batches')
    .select('id, name, mod_id, start_date')
    .in('mod_id', modIds)
  if (bErr) throw new Error(bErr.message)
  const batchList: any[] = batches ?? []
  const batchIds = batchList.map((b: any) => b.id)
  if (batchIds.length === 0) return { loose_ends: [] }

  const [studRes, attRes] = await Promise.all([
    supabase
      .from('students')
      .select('id, batch_id, name, status')
      .in('batch_id', batchIds)
      .eq('status', 'active'),
    supabase
      .from('attendance')
      .select('student_id, batch_id, session_index, state, absence_note, absence_category')
      .in('batch_id', batchIds)
      .eq('state', 'x')
      .is('absence_note', null)
      .is('absence_category', null),
  ])

  const activeStudents: any[] = studRes.data ?? []
  const missingNotes: any[] = attRes.data ?? []

  const activeIds = new Set(activeStudents.map((s: any) => s.id))
  const modById = Object.fromEntries(profiles.map((p: any) => [p.id, p.name]))
  const batchById = Object.fromEntries(batchList.map((b: any) => [b.id, b]))

  const loose_ends = missingNotes
    .filter((a: any) => activeIds.has(a.student_id))
    .map((a: any) => {
      const student = activeStudents.find((s: any) => s.id === a.student_id)
      const batch = batchById[a.batch_id]
      const mod = batch ? modById[batch.mod_id] : 'Unknown'
      return {
        batch: batch?.name ?? 'Unknown',
        mod,
        student: student?.name ?? 'Unknown',
        session_index: a.session_index,
        week: Math.floor(a.session_index / 4) + 1,
      }
    })
    .sort((a, b) => a.session_index - b.session_index)

  return { count: loose_ends.length, loose_ends }
}

async function toolGetBatchHealth(
  supabase: ReturnType<typeof createClient>,
  args: Record<string, unknown>,
) {
  const batchName = String(args.batch_name ?? '').trim()
  if (!batchName) throw new Error('batch_name is required')

  const { data: batches, error: bErr } = await supabase
    .from('batches')
    .select('id, name, mod_id, start_date, month, year')
    .ilike('name', `%${batchName}%`)
    .limit(5)
  if (bErr) throw new Error(bErr.message)
  if (!batches || batches.length === 0)
    return { error: `No batch found matching "${batchName}"` }

  const batch = batches[0]
  const modIds = [batch.mod_id]
  const batchId = batch.id

  const [studRes, attRes, profileRes] = await Promise.all([
    supabase.from('students').select('id, status').eq('batch_id', batchId),
    supabase
      .from('attendance')
      .select('student_id, session_index, state, absence_note, absence_category')
      .eq('batch_id', batchId),
    supabase.from('profiles').select('name').in('id', modIds).single(),
  ])

  const students: any[] = studRes.data ?? []
  const attendance: any[] = attRes.data ?? []
  const modName: string = (profileRes.data as any)?.name ?? 'Unknown'

  const totalStudents = students.length
  const activeStudents = students.filter((s: any) => s.status !== 'dropped')
  const droppedCount = totalStudents - activeStudents.length
  const activeIds = new Set(activeStudents.map((s: any) => s.id))

  // Current week based on start_date
  const today = new Date()
  let currentWeek: number | null = null
  if (batch.start_date) {
    const start = new Date(batch.start_date + 'T00:00:00Z')
    const days = Math.floor((today.getTime() - start.getTime()) / 86400000)
    if (days >= 0) currentWeek = Math.min(6, Math.floor(days / 7) + 1)
  }

  // Current-week attendance % (sessions in current week only)
  let weekAttendancePct: number | null = null
  if (currentWeek !== null) {
    const wStart = (currentWeek - 1) * 4
    const weekAtt = attendance.filter(
      (a: any) =>
        a.session_index >= wStart &&
        a.session_index < wStart + 4 &&
        (a.state === 'c' || a.state === 'x') &&
        activeIds.has(a.student_id),
    )
    const present = weekAtt.filter((a: any) => a.state === 'c').length
    const total = weekAtt.length
    weekAttendancePct = total > 0 ? Math.round((present / total) * 100) : null
  }

  // Open loose ends (active students, absent, no note/category)
  const looseEnds = attendance.filter(
    (a: any) =>
      a.state === 'x' &&
      !a.absence_note &&
      !a.absence_category &&
      activeIds.has(a.student_id),
  ).length

  return {
    batch: batch.name,
    mod: modName,
    current_week: currentWeek,
    total_students: totalStudents,
    active_students: activeStudents.length,
    dropped_students: droppedCount,
    current_week_attendance_pct: weekAttendancePct,
    open_loose_ends: looseEnds,
  }
}

// ── JSON-RPC helpers ─────────────────────────────────────────────────────────

function rpcResult(id: unknown, result: unknown) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function rpcError(id: unknown, code: number, message: string) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return rpcError(null, -32700, 'Parse error')
  }

  const { jsonrpc, id, method, params } = body

  // Notifications (no id) — acknowledge and return immediately
  if (id === undefined || id === null) {
    return new Response(null, { status: 202, headers: corsHeaders })
  }

  if (jsonrpc !== '2.0') return rpcError(id, -32600, 'Invalid JSON-RPC version')

  try {
    // ── initialize ───────────────────────────────────────────────────
    if (method === 'initialize') {
      return rpcResult(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'Mission Control MCP', version: '1.0.0' },
      })
    }

    // ── tools/list ───────────────────────────────────────────────────
    if (method === 'tools/list') {
      return rpcResult(id, { tools: TOOLS })
    }

    // ── tools/call ───────────────────────────────────────────────────
    if (method === 'tools/call') {
      const toolName: string = params?.name ?? ''
      const toolArgs: Record<string, unknown> = params?.arguments ?? {}

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      )

      let result: unknown

      switch (toolName) {
        case 'mc_query_data':
          result = await toolQueryData(supabase, toolArgs)
          break
        case 'mc_send_announcement':
          result = await toolSendAnnouncement(supabase, toolArgs)
          break
        case 'mc_get_mod_engagement':
          result = await toolGetModEngagement(supabase, toolArgs)
          break
        case 'mc_list_overdue_tasks':
          result = await toolListOverdueTasks(supabase, toolArgs)
          break
        case 'mc_get_batch_health':
          result = await toolGetBatchHealth(supabase, toolArgs)
          break
        default:
          return rpcError(id, -32601, `Unknown tool: ${toolName}`)
      }

      return rpcResult(id, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      })
    }

    return rpcError(id, -32601, `Method not found: ${method}`)
  } catch (err) {
    console.error('mc-mcp error:', err)
    return rpcError(id, -32000, (err as Error).message ?? 'Internal error')
  }
})
