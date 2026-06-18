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

// Morning = sun, evening = moon. Stored as 'morning'/'evening' in the DB;
// the icon is purely for display. Anything unset is treated as evening (the default).
export const sessionIcon = (session?: string | null): string =>
  session === 'morning' ? '☀️' : '🌙';

export const sessionLabel = (session?: string | null): string =>
  session === 'morning' ? 'morning' : 'evening';

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
