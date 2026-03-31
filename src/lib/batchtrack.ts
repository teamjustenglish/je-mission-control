import { supabase } from '@/integrations/supabase/client';

export const logActivity = async (
  modId: string,
  modName: string,
  actionType: string,
  description: string,
  batchName: string
) => {
  await supabase.from('activity_log').insert({
    mod_id: modId,
    mod_name: modName,
    action_type: actionType,
    description,
    batch_name: batchName,
  });
};

// Session schedule: 4 days/week × 6 weeks = 24 sessions
// Mon=0, Tue=1, Thu=2, Fri=3 per week
// Weeks 2,4,6 (index 1,3,5): Fri replaced by Demo Day
export const getSessionLabel = (sessionIndex: number): { day: string; week: number; isDemo: boolean } => {
  const week = Math.floor(sessionIndex / 4) + 1;
  const dayInWeek = sessionIndex % 4;
  const days = ['Mon', 'Tue', 'Thu', 'Fri'];
  const isDemoWeek = week % 2 === 0; // weeks 2,4,6
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
