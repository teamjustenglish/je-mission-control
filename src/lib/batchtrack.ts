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

export const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export const CRITERIA = [
  'Organization',
  'Clarity',
  'Delivery',
  'Content',
  'Language use',
  'Vocab & grammar',
];
