import { supabase } from '@/integrations/supabase/client';

export const logActivity = async (
  modId: string,
  modName: string,
  actionType: string,
  description: string,
  batchName: string,
  batchId?: string
) => {
  // Dedup for attendance_marked: one entry per mod + batch + week + day
  if (actionType === 'attendance_marked') {
    const today = new Date().toISOString().split('T')[0];
    const { data: existing } = await supabase
      .from('activity_log')
      .select('id, created_at')
      .eq('mod_id', modId)
      .eq('action_type', 'attendance_marked')
      .eq('batch_name', batchName)
      .eq('description', description)
      .gte('created_at', today + 'T00:00:00Z')
      .limit(1);

    if (existing && existing.length > 0) {
      // Update timestamp only
      await supabase.from('activity_log').update({ created_at: new Date().toISOString() } as any).eq('id', existing[0].id);
      return;
    }
  }

  await supabase.from('activity_log').insert({
    mod_id: modId,
    mod_name: modName,
    action_type: actionType,
    description,
    batch_name: batchName,
    ...(batchId ? { batch_id: batchId } : {}),
  } as any);
};

// Session schedule: 4 days/week × 6 weeks = 24 sessions
export const getSessionLabel = (sessionIndex: number): { day: string; week: number; isDemo: boolean } => {
  const week = Math.floor(sessionIndex / 4) + 1;
  const dayInWeek = sessionIndex % 4;
  const days = ['Mon', 'Tue', 'Thu', 'Fri'];
  const isDemoWeek = week % 2 === 0;
  const isDemo = isDemoWeek && dayInWeek === 3;
  return {
    day: isDemo ? 'Demo day' : days[dayInWeek],
    week,
    isDemo,
  };
};

export const getWeekSessions = (weekNumber: number): number[] => {
  const start = (weekNumber - 1) * 4;
  return [start, start + 1, start + 2, start + 3];
};

export const isDemoWeek = (weekNumber: number): boolean => weekNumber % 2 === 0;

// Compute current week (1-6) based on batch start_date.
// Returns null if start_date is missing (caller should treat as "show all weeks").
// daysDiff < 0 → week 1, daysDiff >= 35 → week 6.
export const getCurrentWeek = (startDate: string | null | undefined, now: Date = new Date()): number | null => {
  if (!startDate) return null;
  const start = new Date(startDate + 'T00:00:00');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysDiff = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff < 0) return 1;
  if (daysDiff >= 35) return 6;
  return Math.min(Math.max(Math.floor(daysDiff / 7) + 1, 1), 6);
};

// Sessions occur on Mon, Tue, Thu, Fri (day-of-week offsets from batch start Monday)
// Returns total sessions that have already occurred based on batch start date and today.
// Caps at 24. Returns 0 if batch hasn't started yet or no start date.
export const getSessionsOccurred = (startDate: string | null | undefined, now: Date = new Date()): number => {
  if (!startDate) return 0;
  const start = new Date(startDate + 'T00:00:00');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysDiff = Math.floor((today.getTime() - start.getTime()) / msPerDay);
  if (daysDiff < 0) return 0;
  const fullWeeks = Math.floor(daysDiff / 7);
  const dayInWeek = daysDiff % 7; // 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
  // Sessions in current partial week that have already passed (Mon=0, Tue=1, Thu=3, Fri=4)
  // Count how many of [0,1,3,4] are <= dayInWeek
  let partial = 0;
  for (const off of [0, 1, 3, 4]) {
    if (off <= dayInWeek) partial++;
  }
  // If we've finished week, partial = 4. fullWeeks already accounts for completed weeks.
  const total = fullWeeks * 4 + partial;
  return Math.min(total, 24);
};

// Compute attendance percentage. Returns null if no sessions have occurred (caller should render "—").
export const computeAttendancePct = (
  presentCount: number,
  studentCount: number,
  sessionsOccurred: number
): number | null => {
  const denom = studentCount * sessionsOccurred;
  if (denom <= 0) return null;
  const pct = Math.round((presentCount / denom) * 100);
  return Math.min(pct, 100);
};

export const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export type BatchSession = 'morning' | 'evening';

// Morning = sun, evening = moon.
export const sessionIcon = (session?: string | null): string =>
  session === 'morning' ? '☀️' : '🌙';

export const sessionLabel = (session?: string | null): string =>
  session === 'morning' ? 'morning' : 'evening';

// STOPGAP: the `session` column can't be added to the DB right now — Supabase is
// fully managed by Lovable and we have no migration/SQL access. So we hardcode the
// known MORNING cohorts by batch id; every other batch is treated as evening (🌙).
// New evening batches therefore display correctly with no extra work. Remove this
// (and switch back to the real `session` column) once schema access is available.
export const MORNING_BATCH_IDS = new Set<string>([
  'b9c52b69-895b-4f7f-bcf1-c926abba0601', // Lilian — Jun 2026 morning (Poorni)
  '8379572b-5129-48ed-8e8c-8f6fca33d710', // Sia — May 2026 morning (Kushin)
]);

export const sessionIconForBatch = (batchId?: string | null): string =>
  batchId && MORNING_BATCH_IDS.has(batchId) ? '☀️' : '🌙';

export const CRITERIA = [
  'Task achievement & content',
  'Fluency & coherence',
  'Lexical resources',
  'Grammatical accuracy',
];

// ── Absence-streak detection ──────────────────────────────────────────

interface AttendanceRow {
  student_id: string;
  session_index: number;
  state: string;
}

interface RescheduleRow {
  from_week?: number | null;
  from_day?: string | null;
  week_number: number;
  day_name: string;
  new_date: string;
  to_week?: number | null;
}

/** Date of a normal session (index 0-23) given the batch start Monday. */
const sessionDate = (index: number, batchStart: Date): Date => {
  const week = Math.floor(index / 4);
  const dayInWeek = index % 4;
  const offsets = [0, 1, 3, 4]; // Mon Tue Thu Fri
  const d = new Date(batchStart);
  d.setDate(batchStart.getDate() + week * 7 + offsets[dayInWeek]);
  return d;
};

/** True when the original session slot was moved to a rescheduled Wednesday. */
const isSourceRescheduled = (
  index: number,
  reschedules: RescheduleRow[],
): boolean => {
  const info = getSessionLabel(index);
  const week = Math.floor(index / 4) + 1;
  const dayName = info.isDemo ? 'Demo day' : info.day;
  return reschedules.some(
    r => ((r.from_week ?? r.week_number) === week) && ((r.from_day ?? r.day_name) === dayName),
  );
};

/**
 * Count consecutive absences at the END of a student's marked attendance timeline.
 *
 * - Skips 'e' / empty rows entirely (they neither break nor extend the streak).
 * - Skips source slots that were rescheduled (attendance lives on the 1000+ index).
 * - For 1000+ indices, uses the reschedule's new_date for chronological ordering.
 */
export const getAbsenceStreak = (
  studentId: string,
  attendance: AttendanceRow[],
  reschedules: RescheduleRow[],
  batchStartDate: string,
): { length: number; lastAttendedDate: Date | null; startedAt: Date | null; latestAbsenceDate: Date | null } => {
  const batchStart = new Date(batchStartDate + 'T00:00:00');

  // 1. Gather marked rows (c or x) for this student, skipping rescheduled source slots
  const rows: { state: string; date: Date }[] = [];
  for (const a of attendance) {
    if (a.student_id !== studentId) continue;
    if (a.state !== 'c' && a.state !== 'x') continue;

    if (a.session_index >= 1000) {
      // Rescheduled Wednesday — find the matching reschedule for its date
      const toWeek = a.session_index - 1000 + 1;
      const r = reschedules.find(r => (r.to_week ?? null) === toWeek);
      if (r) {
        rows.push({ state: a.state, date: new Date(r.new_date + 'T00:00:00') });
      }
    } else if (a.session_index >= 0 && a.session_index < 24) {
      // Normal slot — skip if it was moved to a rescheduled Wed
      if (isSourceRescheduled(a.session_index, reschedules)) continue;
      rows.push({ state: a.state, date: sessionDate(a.session_index, batchStart) });
    }
  }

  if (rows.length === 0) {
    return { length: 0, lastAttendedDate: null, startedAt: null, latestAbsenceDate: null };
  }

  // 2. Sort chronologically
  rows.sort((a, b) => a.date.getTime() - b.date.getTime());

  // 3. Walk backwards counting consecutive 'x'
  let streak = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].state === 'x') streak++;
    else break;
  }

  // 4. Derive outputs
  const lastC = [...rows].reverse().find(r => r.state === 'c');
  const lastAttendedDate = lastC?.date ?? null;
  const startedAt = streak > 0 ? rows[rows.length - streak].date : null;

  const latestAbsenceDate = streak > 0 ? rows[rows.length - 1].date : null;
  return { length: streak, lastAttendedDate, startedAt, latestAbsenceDate };
};

// ── Snooze helpers ────────────────────────────────────────────────────

interface SnoozeRow {
  student_id: string;
  snooze_type: string;
  expires_at: string;
  created_at?: string;
}

/**
 * Check if a specific (student, type) has an active snooze.
 * - For 'dropout_check_in' / 'dropout_red_flag': snooze is valid until a new 'x' occurs after created_at
 * - For 'dropout_force_decide': snooze is valid until expires_at
 */
export const hasActiveSnooze = (
  studentId: string,
  snoozeType: string,
  snoozes: SnoozeRow[],
  now: Date = new Date(),
  attendance?: { student_id: string; session_index: number; state: string }[],
  sessionDateFn?: (index: number) => Date | null,
): boolean => {
  if ((snoozeType === 'dropout_check_in' || snoozeType === 'dropout_red_flag') && attendance && sessionDateFn) {
    const matching = snoozes.filter(s => s.student_id === studentId && s.snooze_type === snoozeType && s.created_at);
    if (matching.length === 0) return false;
    const latestSnooze = matching.sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime())[0];
    const snoozeTime = new Date(latestSnooze.created_at!);
    const hasNewAbsence = attendance.some(a => {
      if (a.student_id !== studentId || a.state !== 'x') return false;
      if (a.session_index >= 1000) return false;
      const d = sessionDateFn(a.session_index);
      return d && d > snoozeTime;
    });
    return !hasNewAbsence;
  }
  return snoozes.some(
    s => s.student_id === studentId && s.snooze_type === snoozeType && new Date(s.expires_at) > now,
  );
};

/** Get all (student, type) pairs that currently have active snoozes. */
export const getActiveSnoozes = (
  snoozes: SnoozeRow[],
  now: Date = new Date(),
): Array<{ studentId: string; snoozeType: string }> => {
  return snoozes
    .filter(s => new Date(s.expires_at) > now)
    .map(s => ({ studentId: s.student_id, snoozeType: s.snooze_type }));
};

// ── Loose ends (canonical) ────────────────────────────────────────────
//
// SINGLE SOURCE OF TRUTH for a batch's "loose ends" — the mod-facing 📋 panel,
// the admin analytics dashboard, and the moderator-usage watchlist all count via
// this function so their numbers agree. It faithfully reproduces the tally the
// mod sees (ModDashboard `generateTasksForWeek` summed over the current week +
// every prior non-finalised week; the "finalise" prompt is not a loose end).
//
// If you change a detection rule here, the mod panel's card generator in
// ModDashboard must change to match — the two are kept deliberately in step.

export type LooseEndType =
  | 'untouched_session'
  | 'absence_no_reason'
  | 'demo_scores_missing'
  | 'demo_feedback_missing'
  | 'demo_makeup_needed'
  | 'dropout_check_in'
  | 'dropout_red_flag'
  | 'dropout_force_decide';

export interface LooseEndsInput {
  startDate: string | null | undefined;
  students: { id: string; status?: string | null }[];
  attendance: { student_id: string; session_index: number; state: string; absence_note?: string | null; absence_category?: string | null }[];
  demoDays: { id: string; day_number: number; date: string | null }[];
  demoScores: { demo_day_id: string; student_id: string; makeup_date?: string | null }[];
  demoFeedback: { demo_day_id: string; student_id: string; feedback: string | null }[];
  rescheduledSessions: RescheduleRow[];
  weekStatuses: { week_number: number; status: string }[];
  snoozes: SnoozeRow[];
}

export interface LooseEndsResult {
  total: number;
  byType: Record<LooseEndType, number>;
}

const emptyLooseEnds = (): LooseEndsResult => ({
  total: 0,
  byType: {
    untouched_session: 0,
    absence_no_reason: 0,
    demo_scores_missing: 0,
    demo_feedback_missing: 0,
    demo_makeup_needed: 0,
    dropout_check_in: 0,
    dropout_red_flag: 0,
    dropout_force_decide: 0,
  },
});

export const computeLooseEnds = (input: LooseEndsInput, now: Date = new Date()): LooseEndsResult => {
  const result = emptyLooseEnds();
  if (!input.startDate) return result;
  const startDate = input.startDate;
  const batchStart = new Date(startDate + 'T00:00:00');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const activeOnly = input.students.filter(s => s.status !== 'dropped');
  if (activeOnly.length === 0) return result;
  const activeIds = new Set(activeOnly.map(s => s.id));
  const total = activeOnly.length;
  const c = result.byType;

  const getSessionDateObj = (idx: number): Date => sessionDate(idx, batchStart);
  const sessionRescheduled = (idx: number): boolean => isSourceRescheduled(idx, input.rescheduledSessions);
  // Demo days fall on the Friday (session index) of weeks 2, 4, 6.
  const demoIdx = (dayNumber: number): number | null =>
    (dayNumber < 1 || dayNumber > 3) ? null : (dayNumber * 2 - 1) * 4 + 3;
  const demoDate = (dd: { day_number: number; date: string | null }): Date | null => {
    if (dd.date) return new Date(dd.date + 'T00:00:00');
    const idx = demoIdx(dd.day_number);
    return idx === null ? null : getSessionDateObj(idx);
  };
  const absentOnDemoDay = (studentId: string, dayNumber: number): boolean => {
    const baseIdx = demoIdx(dayNumber);
    if (baseIdx === null) return false;
    const week = dayNumber * 2;
    const reschedule = input.rescheduledSessions.find(r =>
      ((r.from_week ?? r.week_number) === week) &&
      ((r.from_day ?? r.day_name) === 'Demo day' || (r.from_day ?? r.day_name) === 'Fri')
    );
    if (reschedule) {
      const wedIdx = 1000 + ((reschedule.to_week ?? week) - 1);
      const ra = input.attendance.find(a => a.student_id === studentId && a.session_index === wedIdx);
      return ra ? ra.state === 'x' : false;
    }
    const original = input.attendance.find(a => a.student_id === studentId && a.session_index === baseIdx);
    return original?.state === 'x';
  };
  const hasMakeup = (studentId: string, dayNumber: number): boolean => {
    if (!absentOnDemoDay(studentId, dayNumber)) return false;
    const dd = input.demoDays.find(d => d.day_number === dayNumber);
    if (!dd) return false;
    return input.demoScores.some(s => s.demo_day_id === dd.id && s.student_id === studentId && !!s.makeup_date);
  };
  const hasScores = (ddId: string, studentId: string): boolean =>
    input.demoScores.some(s => s.demo_day_id === ddId && s.student_id === studentId);
  const sessionDateFn = (idx: number) => getSessionDateObj(idx);

  const tallyWeek = (weekNum: number, isOverdue: boolean) => {
    const wStart = (weekNum - 1) * 4;

    // 1. Untouched regular sessions — one per session missing any active student's mark.
    for (let i = 0; i < 4; i++) {
      const si = wStart + i;
      if (sessionRescheduled(si)) continue;
      const sd = getSessionDateObj(si);
      const marked = input.attendance.filter(a =>
        a.session_index === si && a.state !== 'e' && activeIds.has(a.student_id)
      ).length;
      const isPast = sd < today;
      const hasStarted = marked > 0;
      if (!isOverdue && !isPast && !hasStarted) continue;
      if (isOverdue && !isPast) continue;
      if (marked < total) c.untouched_session++;
    }

    // 1b. Rescheduled Wednesday session for this week (synthetic index 1000 + week-1).
    const wedReschedule = input.rescheduledSessions.find(r => (r.to_week ?? null) === weekNum);
    const wedSi = wedReschedule ? 1000 + (weekNum - 1) : null;
    if (wedReschedule && wedSi !== null) {
      const wedDate = new Date(wedReschedule.new_date + 'T00:00:00');
      const marked = input.attendance.filter(a =>
        a.session_index === wedSi && a.state !== 'e' && activeIds.has(a.student_id)
      ).length;
      const isPast = wedDate < today;
      const hasStarted = marked > 0;
      if ((isPast || hasStarted) && marked < total) c.untouched_session++;
    }

    // 2. Absences without a reason — one task per session that has any such absence.
    const sessWithUnexplained = new Set<number>();
    for (const a of input.attendance) {
      if (a.state !== 'x') continue;
      if (a.absence_note && a.absence_note.trim() !== '') continue;
      if (a.absence_category) continue;
      const inSourceRange = a.session_index >= wStart && a.session_index < wStart + 4;
      const isWedDest = wedSi !== null && a.session_index === wedSi;
      if (!inSourceRange && !isWedDest) continue;
      if (inSourceRange && sessionRescheduled(a.session_index)) continue;
      if (!activeIds.has(a.student_id)) continue;
      sessWithUnexplained.add(a.session_index);
    }
    c.absence_no_reason += sessWithUnexplained.size;

    // 3 & 4. Demo scores / feedback missing for this week's demo day.
    for (const dd of input.demoDays) {
      if (dd.day_number * 2 !== weekNum) continue;
      const ddDate = demoDate(dd);
      if (!ddDate || ddDate > today) continue;
      let scoresMissing = 0;
      let feedbackMissing = 0;
      for (const s of activeOnly) {
        const isAbsent = absentOnDemoDay(s.id, dd.day_number);
        if (isAbsent && !hasMakeup(s.id, dd.day_number)) continue; // absent-no-makeup → makeup task instead
        if (!hasScores(dd.id, s.id)) { scoresMissing++; continue; }
        const fb = input.demoFeedback.find(f => f.demo_day_id === dd.id && f.student_id === s.id);
        if (!fb || !fb.feedback || fb.feedback.trim() === '') feedbackMissing++;
      }
      if (scoresMissing > 0) c.demo_scores_missing++;
      if (feedbackMissing > 0) c.demo_feedback_missing++;
    }

    // Current-week pass only: cross-week make-up follow-ups + dropout interventions.
    if (!isOverdue) {
      for (const dd of input.demoDays) {
        const ddDate = demoDate(dd);
        if (!ddDate || ddDate > today) continue;
        const isCurrentWeekDemo = dd.day_number * 2 === weekNum;

        // 3b/4b. Make-up scores/feedback missing for absent-with-makeup students (other weeks).
        if (!isCurrentWeekDemo) {
          let scoresMissing = 0;
          let feedbackMissing = 0;
          for (const s of activeOnly) {
            if (!absentOnDemoDay(s.id, dd.day_number)) continue;
            if (!hasMakeup(s.id, dd.day_number)) continue;
            if (!hasScores(dd.id, s.id)) { scoresMissing++; continue; }
            const fb = input.demoFeedback.find(f => f.demo_day_id === dd.id && f.student_id === s.id);
            if (!fb || !fb.feedback || fb.feedback.trim() === '') feedbackMissing++;
          }
          if (scoresMissing > 0) c.demo_scores_missing++;
          if (feedbackMissing > 0) c.demo_feedback_missing++;
        }

        // 5. Make-up needed — one per absent-without-makeup student, across all demo days.
        for (const s of activeOnly) {
          if (!absentOnDemoDay(s.id, dd.day_number)) continue;
          if (hasMakeup(s.id, dd.day_number)) continue;
          c.demo_makeup_needed++;
        }
      }

      // 6. Dropout interventions — one per active student on a ≥2 absence streak (unless snoozed).
      for (const s of activeOnly) {
        const streak = getAbsenceStreak(s.id, input.attendance, input.rescheduledSessions, startDate);
        if (streak.length < 2) continue;
        if (streak.length >= 6) {
          if (hasActiveSnooze(s.id, 'dropout_force_decide', input.snoozes, now)) continue;
          c.dropout_force_decide++;
        } else if (streak.length >= 4) {
          if (hasActiveSnooze(s.id, 'dropout_red_flag', input.snoozes, now, input.attendance, sessionDateFn)) continue;
          c.dropout_red_flag++;
        } else {
          if (hasActiveSnooze(s.id, 'dropout_check_in', input.snoozes, now, input.attendance, sessionDateFn)) continue;
          c.dropout_check_in++;
        }
      }
    }
  };

  const currentWeek = getCurrentWeek(startDate, now) ?? 1;
  tallyWeek(currentWeek, false);
  for (let w = 1; w < currentWeek; w++) {
    const ws = input.weekStatuses.find(s => s.week_number === w);
    const status = ws?.status || 'open';
    if (status === 'finalised' || status === 'reopened') continue;
    tallyWeek(w, true);
  }

  result.total = Object.values(c).reduce((a, b) => a + b, 0);
  return result;
};
