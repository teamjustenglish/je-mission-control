import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const MOD_HOUSTON_SYSTEM = `You are Houston — an AI assistant inside Mission Control (MC), a tool that moderators use to run a 6-week English-coaching program. You are talking directly to a moderator ("mod").

# What Mission Control tracks
- A "batch" is one cohort run by you (the mod). It runs for 6 weeks. Each week has 4 sessions (Mon, Tue, Thu, Fri) — 24 sessions total, indexed 0-23. Week N covers session indexes (N-1)*4 to (N-1)*4+3.
- "students" belong to a batch. A student's status is "active" or "dropped". A dropped student has a drop reason and a drop date.
- "attendance" marks each session per student: present (c), absent (x), or not-yet-marked (e). An "absence streak" is consecutive absences in the most recent sessions — a streak of 4+ means a student is at real risk of dropping.
- "demo days" are graded checkpoints. Each demo is scored on 4 criteria, each 0-5, so a demo total is out of 20. There are 3 demo days across the batch.
- "loose ends" are students marked absent without a reason set.

# The data you receive
The user message contains a JSON snapshot of the mod's own batches and today's date. Treat that JSON as the single source of truth. Never invent names, numbers, or data that isn't in the snapshot.

# Your scope
You ONLY know about this mod's batches and students. You have no visibility into other mods' batches, admin-wide stats, or program-level trends. If the mod asks about something outside their data, say so plainly.

# What needs admin help
If the mod asks you to do something that requires admin action (deleting a batch, changing student roles, seeing other mods' data, adjusting system settings, etc.), say clearly: "This needs admin help — message Dave on Discord."

# Your voice
Lead with the answer in the first sentence. Write like a sharp, direct colleague — not formal, not corporate, but not Discord-casual either.

Tone rules:
- Contractions are fine ("can't", "you're", "I'd")
- Numbers should be precise but framed naturally: "3 of your 8 students are sitting on a 4+ absence streak" — NOT "a few students are struggling"
- When uncertain, say it plainly: "I don't have data on that yet" — NOT stiff phrases like "the available datasets do not contain..."
- One light emoji is okay if it fits naturally (🫡 ✓ ⚠️) — not sprinkled everywhere
- Keep it concise — answer the question, drop one related insight if it genuinely helps, then stop
- Use "your batch", "your students" — you're talking to the mod directly

# Hard bans
- NEVER write in all-lowercase. Capitalize sentences, proper nouns, and names.
- NEVER use extended greetings: "heyyy", "yooo", "hii".
- NEVER use the 💙 emoji or any sign-off emoji.
- NEVER use these softeners: "kinda", "wanna", "gonna", "like, today", "lowkey", "tbh", "ngl", "fr", "no cap".
- NEVER replace facts with vague colloquialisms: "she's been through it", "same deal". Use the actual data.

# Keep doing
- Specific numbers ("3 of 9 students", "5-session streak", "0% attendance")
- Naming students directly ("Ahamed", "Priya")
- Operational framing ("needs a drop decision today", "final stretch")

# Example answers (right tone)
- "Your batch is in good shape overall. 87% attendance through week 3, 2 students with open absences that need a reason added."
- "Ahamed has missed 5 sessions in a row — that's the highest streak in your batch. If he misses the next session, you'll need to make a drop call."
- "Demo Day 1 scores are in for 6 of your 8 students. Average is 14.2/20. Two students — Priya and Kasun — haven't been scored yet."
- "I don't have data on that yet — it may not be tracked in Mission Control. This needs admin help — message Dave on Discord."`

interface AttendanceRow {
  student_id: string
  batch_id: string
  session_index: number
  state: string
  absence_note?: string | null
  absence_category?: string | null
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

    // Verify caller is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Unauthorized')
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token)
    if (!caller) throw new Error('Unauthorized')

    // Verify caller has the moderator role (not admin-only, but must be a known user)
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, name, role')
      .eq('id', caller.id)
      .maybeSingle()
    if (!callerProfile) throw new Error('Unauthorized')

    const body = await req.json()
    const question: string = body?.question
    if (!question || typeof question !== 'string' || !question.trim()) {
      throw new Error('Question is required')
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('Houston is not configured (missing API key)')

    const today = new Date()

    // ── Fetch ONLY this mod's batches — hard-coded WHERE mod_id = caller.id ──
    const { data: batches } = await supabaseAdmin
      .from('batches')
      .select('id, name, mod_id, month, year, start_date, created_at')
      .eq('mod_id', caller.id)
      .order('created_at', { ascending: false })

    const batchList = batches ?? []
    const batchIds = batchList.map((b: any) => b.id)

    let students: any[] = []
    let attendance: AttendanceRow[] = []
    let demoDays: any[] = []
    let demoScores: any[] = []

    if (batchIds.length > 0) {
      const [studentsRes, attendanceRes, demoDaysRes] = await Promise.all([
        supabaseAdmin
          .from('students')
          .select('id, batch_id, name, status, status_reason, status_changed_at')
          .in('batch_id', batchIds),
        supabaseAdmin
          .from('attendance')
          .select('student_id, batch_id, session_index, state, absence_note, absence_category')
          .in('batch_id', batchIds),
        supabaseAdmin
          .from('demo_days')
          .select('id, batch_id, title, date, day_number')
          .in('batch_id', batchIds),
      ])
      students = studentsRes.data ?? []
      attendance = (attendanceRes.data ?? []) as AttendanceRow[]
      demoDays = demoDaysRes.data ?? []

      const demoDayIds = demoDays.map((d: any) => d.id)
      if (demoDayIds.length > 0) {
        const { data: scoresData } = await supabaseAdmin
          .from('demo_scores')
          .select('demo_day_id, student_id, criterion, score')
          .in('demo_day_id', demoDayIds)
        demoScores = scoresData ?? []
      }
    }

    // ── Build snapshot for this mod's batches ───────────────────────
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

        // Loose ends: absent sessions with no reason set
        const looseEnds = rows.filter((r) => r.state === 'x' && !r.absence_category && !r.absence_note).length

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
          absencesWithNoReason: looseEnds,
          avgDemoScoreOutOf20: avgDemoScore,
          demoDaysScored: totals.length,
        }
      })

      const active = studentSummaries.filter((s) => s.status !== 'dropped')
      const pcts = active.map((s) => s.attendancePct).filter((p): p is number => p !== null)
      const batchAvgAttendance = pcts.length > 0
        ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
        : null
      const totalLooseEnds = active.reduce((sum, s) => sum + s.absencesWithNoReason, 0)

      return {
        batch: batch.name,
        month: MONTHS[(batch.month ?? 1) - 1] || String(batch.month),
        year: batch.year,
        startDate: batch.start_date || null,
        currentWeek: currentWeek(batch.start_date, today),
        totalEnrolled: studentSummaries.length,
        activeStudents: active.length,
        droppedStudents: studentSummaries.length - active.length,
        batchAvgAttendancePct: batchAvgAttendance,
        openLooseEnds: totalLooseEnds,
        demoDays: batchDemoDays.map((d: any) => ({ title: d.title, date: d.date, dayNumber: d.day_number })),
        students: studentSummaries,
      }
    })

    const dataContext = {
      today: today.toISOString().slice(0, 10),
      modName: callerProfile.name || 'Mod',
      batchCount: snapshot.length,
      batches: snapshot,
    }

    const userMessage =
      `Here is the current Mission Control data snapshot for your batches (JSON):\n\n` +
      `${JSON.stringify(dataContext, null, 2)}\n\n` +
      `The mod asks: "${question.trim()}"\n\n` +
      `Answer as Houston.`

    // ── Call Anthropic ───────────────────────────────────────────────
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        system: MOD_HOUSTON_SYSTEM,
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

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('ask-houston-mod error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
