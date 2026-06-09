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
- "demo days" are graded checkpoints. Each demo is scored on 4 criteria, each 0-4, so a demo total is out of 16. There are 3 demo days across the batch.
- "loose ends" are five categories of tasks that still need to be completed (details below).

# Loose ends — five categories
1. **Untouched sessions** — sessions where some or all active students haven't been marked yet. \`untouchedSessions\` is the total count of missing student-marks. \`untouchedSessionsByDate\` lists each affected session with \`date\`, \`dayLabel\` (e.g. "Thu 4 Jun"), and \`studentsMissing\` — always use this array to name specific dates when the mod asks "which sessions?" or "what do I still need to mark?"
2. **Absences without a reason** — sessions marked absent but no absence category or note added yet (batch field: \`absencesWithNoReason\`)
3. **Demo day scores missing** — student attended or did a make-up but hasn't been fully scored on all 4 criteria (per demo day: \`scoresMissing\` in \`demoDaySummaries\`)
4. **Demo day feedback missing** — student is fully scored but no written feedback has been saved yet (per demo day: \`feedbackMissing\` in \`demoDaySummaries\`)
5. **Demo day make-up needed** — student was absent on demo day and no make-up date is scheduled yet (per demo day: \`makeupNeeded\` in \`demoDaySummaries\`)

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
- "Demo Day 1 scores are in for 6 of your 8 students. Average is 11.2/16. Two students — Priya and Kasun — haven't been scored yet."
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

const SESSION_DAY_OFFSETS = [0, 1, 3, 4] // Mon, Tue, Thu, Fri
const SESSION_DAY_NAMES = ['Mon', 'Tue', 'Thu', 'Fri']

// Mirror of batchtrack.ts getSessionsOccurred — number of session slots (0-24)
// that have already passed as of `today`, based on batch start Monday.
function getSessionsOccurred(startDate: string | null, today: Date): number {
  if (!startDate) return 0
  const start = new Date(startDate + 'T00:00:00Z')
  const daysDiff = Math.floor((today.getTime() - start.getTime()) / 86400000)
  if (daysDiff < 0) return 0
  const fullWeeks = Math.floor(daysDiff / 7)
  const dayInWeek = daysDiff % 7 // 0=Mon 1=Tue 2=Wed 3=Thu 4=Fri 5=Sat 6=Sun
  let partial = 0
  for (const off of SESSION_DAY_OFFSETS) {
    if (off <= dayInWeek) partial++
  }
  return Math.min(fullWeeks * 4 + partial, 24)
}

// Returns the calendar date for session index `si` (0-23) given a batch start Monday.
function getSessionDate(startDate: string, si: number): Date {
  const week = Math.floor(si / 4)
  const dayInWeek = si % 4
  const start = new Date(startDate + 'T00:00:00Z')
  return new Date(start.getTime() + (week * 7 + SESSION_DAY_OFFSETS[dayInWeek]) * 86400000)
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
    let demoFeedback: any[] = []

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
        const [scoresRes, feedbackRes] = await Promise.all([
          supabaseAdmin
            .from('demo_scores')
            .select('demo_day_id, student_id, criterion, score, makeup_date')
            .in('demo_day_id', demoDayIds),
          supabaseAdmin
            .from('demo_feedback')
            .select('demo_day_id, student_id, feedback')
            .in('demo_day_id', demoDayIds),
        ])
        demoScores = scoresRes.data ?? []
        demoFeedback = feedbackRes.data ?? []
      }
    }

    // ── Build snapshot for this mod's batches ───────────────────────
    const snapshot = batchList.map((batch: any) => {
      const batchStudents = students.filter((s: any) => s.batch_id === batch.id)
      const batchDemoDays = demoDays.filter((d: any) => d.batch_id === batch.id)
      const batchDemoDayIds = batchDemoDays.map((d: any) => d.id)

      // Number of session slots that have already passed — needed for untouched counts.
      const sessionsOccurred = getSessionsOccurred(batch.start_date, today)

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
        const absencesWithNoReason = rows.filter((r) => r.state === 'x' && !r.absence_category && !r.absence_note).length
        // Sessions with no mark: expected slots minus rows that are 'c' or 'x'.
        // Exclude synthetic rescheduled indices (>=1000) from the marked count.
        const markedCount = rows.filter((r) => (r.state === 'c' || r.state === 'x') && r.session_index < 1000).length
        const untouchedSessions = Math.max(0, sessionsOccurred - markedCount)

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
          absencesWithNoReason,
          untouchedSessions,
          avgDemoScoreOutOf16: avgDemoScore,
          demoDaysScored: totals.length,
        }
      })

      const active = studentSummaries.filter((s) => s.status !== 'dropped')
      const batchActiveStudents = batchStudents.filter((s: any) => s.status !== 'dropped')
      const pcts = active.map((s) => s.attendancePct).filter((p): p is number => p !== null)
      const batchAvgAttendance = pcts.length > 0
        ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
        : null

      const totalAbsencesWithNoReason = active.reduce((sum, s) => sum + s.absencesWithNoReason, 0)

      // Per-session untouched breakdown — iterate every occurred session slot (index 0..sessionsOccurred-1).
      // For each session, count active students who have NO 'c'/'x' row (missing row = unmarked, same as state 'e').
      // Rescheduled sessions (synthetic index >=1000) are excluded — edge case not worth the extra fetch.
      const untouchedSessionsByDate: { date: string; dayLabel: string; studentsMissing: number }[] = []
      if (batch.start_date && sessionsOccurred > 0) {
        for (let si = 0; si < sessionsOccurred; si++) {
          const sDate = getSessionDate(batch.start_date, si)
          const markedForSession = batchActiveStudents.filter((s: any) =>
            attendance.some((a) => a.student_id === s.id && a.session_index === si && (a.state === 'c' || a.state === 'x'))
          ).length
          const studentsMissing = batchActiveStudents.length - markedForSession
          if (studentsMissing > 0) {
            const dayLabel = `${SESSION_DAY_NAMES[si % 4]} ${sDate.getUTCDate()} ${MONTHS[sDate.getUTCMonth()]}`
            untouchedSessionsByDate.push({ date: sDate.toISOString().slice(0, 10), dayLabel, studentsMissing })
          }
        }
      }
      const totalUntouchedSessions = untouchedSessionsByDate.reduce((sum, s) => sum + s.studentsMissing, 0)

      // Per-demo-day loose-end counts (past demo days only).
      // Absence check uses the standard Friday session index (dayNumber * 8 - 1).
      // Rescheduled demo days are an edge case not tracked here.
      const CRITERIA_COUNT = 4
      const demoDaySummaries = batchDemoDays
        .filter((d: any) => d.date && new Date(d.date + 'T00:00:00Z') <= today)
        .map((d: any) => {
          const ddId = d.id
          const baseIdx = d.day_number * 8 - 1

          const absentStudents = batchActiveStudents.filter((s: any) => {
            const att = attendance.find((a) => a.student_id === s.id && a.session_index === baseIdx)
            return att?.state === 'x'
          })

          // Students due to be scored: attended, or absent-with-makeup
          const dueStudents = batchActiveStudents.filter((s: any) => {
            const att = attendance.find((a) => a.student_id === s.id && a.session_index === baseIdx)
            if (!att || att.state === 'e') return false
            if (att.state === 'c') return true
            return demoScores.some((sc: any) => sc.demo_day_id === ddId && sc.student_id === s.id && sc.makeup_date)
          })

          const scoresMissing = dueStudents.filter((s: any) => {
            const count = demoScores.filter((sc: any) => sc.demo_day_id === ddId && sc.student_id === s.id).length
            return count < CRITERIA_COUNT
          }).length

          const feedbackMissing = dueStudents.filter((s: any) => {
            const count = demoScores.filter((sc: any) => sc.demo_day_id === ddId && sc.student_id === s.id).length
            if (count < CRITERIA_COUNT) return false
            const fb = demoFeedback.find((f: any) => f.demo_day_id === ddId && f.student_id === s.id)
            return !fb || !fb.feedback || fb.feedback.trim() === ''
          }).length

          const makeupNeeded = absentStudents.filter((s: any) =>
            !demoScores.some((sc: any) => sc.demo_day_id === ddId && sc.student_id === s.id && sc.makeup_date)
          ).length

          return { title: d.title, date: d.date, dayNumber: d.day_number, scoresMissing, feedbackMissing, makeupNeeded }
        })

      const totalOpenLooseEnds = totalAbsencesWithNoReason + totalUntouchedSessions +
        demoDaySummaries.reduce((sum, d) => sum + d.scoresMissing + d.feedbackMissing + d.makeupNeeded, 0)

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
        openLooseEnds: totalOpenLooseEnds,
        absencesWithNoReason: totalAbsencesWithNoReason,
        untouchedSessions: totalUntouchedSessions,
        untouchedSessionsByDate,
        demoDaySummaries,
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
        model: 'claude-haiku-4-5',
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

    // ── Log query for usage analytics ───────────────────────────────
    // TODO: Update pricing constants if Anthropic changes rates.
    // Claude Haiku 4.5: $1.00/M input, $5.00/M output (as of 2025-06)
    const INPUT_COST_PER_TOKEN = 0.000001
    const OUTPUT_COST_PER_TOKEN = 0.000005
    const tokensInput: number = completion?.usage?.input_tokens ?? 0
    const tokensOutput: number = completion?.usage?.output_tokens ?? 0
    const costUsd = (tokensInput * INPUT_COST_PER_TOKEN) + (tokensOutput * OUTPUT_COST_PER_TOKEN)
    // Await before returning — Supabase Edge Functions (Deno Deploy) kill pending
    // promises when the Response is sent, so fire-and-forget silently drops the insert.
    await supabaseAdmin.from('houston_query_log').insert({
      user_id: caller.id,
      user_role: callerProfile.role,
      houston_variant: 'mod',
      question: question.trim(),
      answer_preview: answer.slice(0, 200),
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      cost_usd: costUsd,
    }).catch((err: unknown) => console.error('houston-mod log error:', err))

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
