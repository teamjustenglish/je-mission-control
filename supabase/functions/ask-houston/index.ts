import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const HOUSTON_SYSTEM = `You are Houston — the AI assistant inside Mission Control (MC), an admin tool used to run a 6-week English-coaching program. You are talking to a program admin.

# What Mission Control tracks
- A "batch" is one cohort run by one moderator ("mod"). It runs for 6 weeks. Each week has 4 sessions (Mon, Tue, Thu, Fri) — 24 sessions total, indexed 0-23. Week N covers session indexes (N-1)*4 .. (N-1)*4+3.
- "students" belong to a batch. A student's status is "active" or "dropped". A dropped student has a drop reason and a drop date.
- "attendance" marks each session per student: present, absent, or not-yet-marked. An "absence streak" is consecutive absences in the most recent sessions — a high streak (4+) means a student is at real risk of dropping.
- "demo days" are graded checkpoints. Each demo is scored on 4 criteria, each 0-5, so a demo total is out of 20.
- Each mod also has a "last activity" timestamp — if a mod hasn't logged anything for several days, they may be disengaged.

# The data you receive
The user message contains a JSON snapshot of recent MC data (batches from roughly the last 90 days, so currently-running batches are fully covered) plus today's date. Treat that JSON as the single source of truth. Numbers like attendance % and demo averages are pre-computed for you. If the data doesn't contain something, say so plainly — never invent names, numbers, or batches.

# Your voice
Lead with the answer in the first sentence. Write like a sharp, direct colleague — not formal, not corporate, but not Discord-casual either.

Tone rules:
- Contractions are fine ("can't", "you're", "I'd")
- Numbers should be precise but framed naturally: "Anne's batch had 87% attendance this week" — NOT "Anne's performing well"
- When uncertain, say it plainly: "I don't have data on that yet" — NOT stiff phrases like "the available datasets do not contain..."
- One light emoji is okay if it fits naturally (🫡 ✓ ⚠️) — not sprinkled everywhere
- Keep it concise — answer the question, drop one related insight if it genuinely helps, then stop

# Hard bans — these break the brand voice
- NEVER write in all-lowercase. Capitalize sentences, proper nouns, and batch references ("Anne's batch", not "anne's batch"). Even casual openers start with a capital.
- NEVER use extended greetings: "heyyy", "yooo", "hii". If you open with a greeting, use "Hey" (capital, single). Better yet, skip the greeting and lead straight with the answer.
- NEVER use the 💙 emoji or any sign-off emoji. End on the last insight, not a heart.
- NEVER use these softeners as descriptive language: "kinda", "wanna", "gonna", "like, today", "lowkey", "tbh", "ngl", "fr", "no cap". These read as Discord-friend, not as a colleague.
- NEVER replace facts with vague colloquialisms: "she's been through it", "same deal", "talk to me". Substitute the actual data — "Esther has 5 dropouts in this batch", "Ahamed has missed 5 sessions in a row".

# Keep doing — these are working
- Specific numbers ("3 of 9 students", "5-session streak", "0% attendance") — never replace numbers with vague language
- Naming mods and students directly ("Wicky", "Ahamed", "Stephie")
- Operational framing ("needs a drop decision today", "final stretch") — colloquial shorthand like "danger zone" is fine only when paired with the actual data, never as a standalone description
- Stiff phrasing: no "I would like to inform you", "please be advised", "as per the data", "kindly note"

# Data guardrail
When answering questions about specific people, batches, or weeks, always include the actual numbers in your response (attendance %, count of loose ends, days late, # of dropped students, etc.). Don't be vague — show the data. If you genuinely don't have a number, say "I don't have that data yet" plainly. Never approximate or hedge with words like "a few" or "some" when a real count exists in the database.

# Worked examples — study these, not just the rules above

BAD (violates every ban — do not write like this):
"heyyy! ok so honestly things are pretty solid rn, real quick i did notice esther's been quiet... she's kinda been through it this batch tbh. same deal with eloise. three students are lowkey in the danger zone but idk fr"

GOOD (target voice):
"Most batches are stable. Two mods have been quiet — Esther 4 days, Eloise 3 days. Worth a check-in. Three students sitting on a 4+ absence streak: Wicky, Lucas, HARSHA — each needs a drop decision this week."

---

BAD:
"heyyy so i checked on noor's batch and like... it's kinda worrying ngl 😬 attendance has been going down and there are sooo many loose ends. she's gonna need help soon i think 💙"

GOOD:
"Noor's batch is the biggest concern right now. 76% attendance (lowest active batch), 11 open loose ends with no reason set. She's in week 6 — not much runway left to recover."

---

BAD:
"ok so yumi's batch is same deal as last week tbh, nothing crazy, attendance is fine i guess, demo days are coming up so wanna keep an eye on it"

GOOD:
"Yumi's batch is holding at 95% attendance through week 2 — no flags yet. Demo Day 1 is this week; 0 demo scores logged so far, which is expected at this stage."

Examples of right tone:
- "Anne's batch is in good shape. 87% attendance this week, 2 open loose ends, all reasons filled in same-day."
- "Vindi has 17 loose ends across Week 3-4 — way more than anyone else. Mostly absent students with no reason set. Worth a 1:1."
- "Yumi marks attendance ~4 days late on average. Slowest of the active mods."`

interface AttendanceRow {
  student_id: string
  batch_id: string
  session_index: number
  state: string
}

function computeStreak(rows: AttendanceRow[]): number {
  const marked = rows
    .filter((r) => r.state === 'c' || r.state === 'x')
    .sort((a, b) => b.session_index - a.session_index)
  let streak = 0
  for (const r of marked) {
    if (r.state === 'x') streak++
    else break
  }
  return streak
}

function currentWeek(startDate: string | null, today: Date): number | null {
  if (!startDate) return null
  const start = new Date(startDate + 'T00:00:00Z').getTime()
  const days = Math.floor((today.getTime() - start) / 86400000)
  if (days < 0) return null
  return Math.min(6, Math.floor(days / 7) + 1)
}

function round(n: number): number {
  return Math.round(n * 10) / 10
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Verify caller is an admin (same pattern as other admin edge functions)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Unauthorized')
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token)
    if (!caller) throw new Error('Unauthorized')
    const { data: isAdmin } = await supabaseAdmin.rpc('has_role', { _user_id: caller.id, _role: 'admin' })
    if (!isAdmin) throw new Error('Not an admin')

    const body = await req.json()
    const question: string = body?.question
    if (!question || typeof question !== 'string' || !question.trim()) {
      throw new Error('Question is required')
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('Houston is not configured (missing API key)')

    // ── Fetch MC data ────────────────────────────────────────────────
    // Batches created in the last 90 days so any currently-running 6-week
    // batch is fully covered (a strict 30-day window would miss weeks 5-6).
    const today = new Date()
    const since = new Date(today.getTime() - 90 * 86400000).toISOString()
    const activitySince = new Date(today.getTime() - 30 * 86400000).toISOString()

    const { data: batches } = await supabaseAdmin
      .from('batches')
      .select('id, name, mod_id, month, year, start_date, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })

    const batchList = batches ?? []
    const batchIds = batchList.map((b: any) => b.id)
    const modIds = [...new Set(batchList.map((b: any) => b.mod_id))]

    let students: any[] = []
    let attendance: AttendanceRow[] = []
    let demoDays: any[] = []
    let demoScores: any[] = []
    let profiles: any[] = []
    let activity: any[] = []

    if (batchIds.length > 0) {
      const [studentsRes, attendanceRes, demoDaysRes, profilesRes, activityRes] = await Promise.all([
        supabaseAdmin.from('students').select('id, batch_id, name, status, status_reason, status_changed_at').in('batch_id', batchIds),
        supabaseAdmin.from('attendance').select('student_id, batch_id, session_index, state').in('batch_id', batchIds),
        supabaseAdmin.from('demo_days').select('id, batch_id, title, date, day_number').in('batch_id', batchIds),
        supabaseAdmin.from('profiles').select('id, name, email').in('id', modIds),
        supabaseAdmin.from('activity_log').select('mod_id, created_at').gte('created_at', activitySince).order('created_at', { ascending: false }),
      ])
      students = studentsRes.data ?? []
      attendance = (attendanceRes.data ?? []) as AttendanceRow[]
      demoDays = demoDaysRes.data ?? []
      profiles = profilesRes.data ?? []
      activity = activityRes.data ?? []

      const demoDayIds = demoDays.map((d: any) => d.id)
      if (demoDayIds.length > 0) {
        const { data: scoresData } = await supabaseAdmin
          .from('demo_scores')
          .select('demo_day_id, student_id, criterion, score')
          .in('demo_day_id', demoDayIds)
        demoScores = scoresData ?? []
      }
    }

    // ── Build a synthesised snapshot per batch ───────────────────────
    const modName = (id: string) => profiles.find((p: any) => p.id === id)?.name || 'Unknown mod'
    const lastActivityByMod = new Map<string, string>()
    for (const a of activity) {
      if (!lastActivityByMod.has(a.mod_id)) lastActivityByMod.set(a.mod_id, a.created_at)
    }

    const snapshot = batchList.map((batch: any) => {
      const batchStudents = students.filter((s: any) => s.batch_id === batch.id)
      const batchDemoDays = demoDays.filter((d: any) => d.batch_id === batch.id)
      const batchDemoDayIds = batchDemoDays.map((d: any) => d.id)

      const studentSummaries = batchStudents.map((student: any) => {
        const rows = attendance.filter((a) => a.student_id === student.id)
        const present = rows.filter((r) => r.state === 'c').length
        const absent = rows.filter((r) => r.state === 'x').length
        const marked = present + absent
        const attendancePct = marked > 0 ? Math.round((present / marked) * 100) : null

        // Demo totals — sum the (max 5) criterion scores per demo day, total out of 20.
        const totals: number[] = []
        for (const ddId of batchDemoDayIds) {
          const studentScores = demoScores.filter(
            (sc: any) => sc.demo_day_id === ddId && sc.student_id === student.id,
          )
          if (studentScores.length > 0) {
            totals.push(studentScores.reduce((sum: number, sc: any) => sum + Number(sc.score), 0))
          }
        }
        const avgDemoScore = totals.length > 0
          ? round(totals.reduce((a, b) => a + b, 0) / totals.length)
          : null

        return {
          name: student.name || '(unnamed)',
          status: student.status || 'active',
          dropReason: student.status === 'dropped' ? student.status_reason || null : undefined,
          droppedAt: student.status === 'dropped' ? student.status_changed_at || null : undefined,
          attendancePct,
          sessionsPresent: present,
          sessionsAbsent: absent,
          sessionsMarked: marked,
          currentAbsenceStreak: computeStreak(rows),
          avgDemoScoreOutOf20: avgDemoScore,
          demoDaysScored: totals.length,
        }
      })

      const active = studentSummaries.filter((s) => s.status !== 'dropped')
      const pcts = active.map((s) => s.attendancePct).filter((p): p is number => p !== null)
      const batchAvgAttendance = pcts.length > 0
        ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
        : null

      const lastActivity = lastActivityByMod.get(batch.mod_id) || null
      const daysSinceModActivity = lastActivity
        ? Math.floor((today.getTime() - new Date(lastActivity).getTime()) / 86400000)
        : null

      return {
        batch: batch.name,
        month: MONTHS[(batch.month ?? 1) - 1] || String(batch.month),
        year: batch.year,
        mod: modName(batch.mod_id),
        startDate: batch.start_date || null,
        currentWeek: currentWeek(batch.start_date, today),
        modLastActivity: lastActivity,
        daysSinceModActivity,
        totalEnrolled: studentSummaries.length,
        activeStudents: active.length,
        droppedStudents: studentSummaries.length - active.length,
        batchAvgAttendancePct: batchAvgAttendance,
        demoDays: batchDemoDays.map((d: any) => ({ title: d.title, date: d.date, dayNumber: d.day_number })),
        students: studentSummaries,
      }
    })

    const dataContext = {
      today: today.toISOString().slice(0, 10),
      batchCount: snapshot.length,
      batches: snapshot,
    }

    const userMessage =
      `Here is the current Mission Control data snapshot (JSON):\n\n` +
      `${JSON.stringify(dataContext, null, 2)}\n\n` +
      `The admin asks: "${question.trim()}"\n\n` +
      `Answer as Houston.`

    // ── Call Anthropic ───────────────────────────────────────────────
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: [{ type: 'text', text: HOUSTON_SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text()
      console.error('Anthropic API error:', anthropicRes.status, errText)
      throw new Error('Anthropic API request failed')
    }

    const completion = await anthropicRes.json()
    const answer = (completion?.content ?? [])
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('\n')
      .trim()

    if (!answer) throw new Error('Empty response from Anthropic')

    // ── Log query for usage analytics ───────────────────────────────
    // Claude Haiku 4.5 with prompt caching (as of 2025-06):
    //   Input:        $1.00/M  → 0.000001 per token
    //   Cache write:  $1.25/M  → 0.00000125 per token (25% premium on first cache fill)
    //   Cache read:   $0.10/M  → 0.0000001 per token  (10% of base — the big saving)
    //   Output:       $5.00/M  → 0.000005 per token
    const tokensInput: number = completion?.usage?.input_tokens ?? 0
    const tokensOutput: number = completion?.usage?.output_tokens ?? 0
    const cacheCreationTokens: number = completion?.usage?.cache_creation_input_tokens ?? 0
    const cacheReadTokens: number = completion?.usage?.cache_read_input_tokens ?? 0
    const costUsd =
      tokensInput        * 0.000001    +
      cacheCreationTokens * 0.00000125 +
      cacheReadTokens     * 0.0000001  +
      tokensOutput       * 0.000005
    // Await before returning — Supabase Edge Functions (Deno Deploy) kill pending
    // promises when the Response is sent, so fire-and-forget silently drops the insert.
    await supabaseAdmin.from('houston_query_log').insert({
      user_id: caller.id,
      user_role: 'admin',
      houston_variant: 'admin',
      question: question.trim(),
      answer_preview: answer.slice(0, 200),
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      cache_creation_tokens: cacheCreationTokens,
      cache_read_tokens: cacheReadTokens,
      cost_usd: costUsd,
    }).catch((err: unknown) => console.error('houston log error:', err))

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('ask-houston error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
