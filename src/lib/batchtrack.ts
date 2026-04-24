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

export const CRITERIA = [
  'Task achievement & content',
  'Fluency & coherence',
  'Lexical resources',
  'Grammatical accuracy',
];
