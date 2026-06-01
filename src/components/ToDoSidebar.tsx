import React, { useState, useEffect, useRef } from 'react';

interface Task {
  id: string;
  type: 'untouched_session' | 'absence_no_reason' | 'demo_scores_missing' | 'demo_feedback_missing' | 'finalise' | 'dropout_check_in' | 'dropout_red_flag' | 'dropout_force_decide' | 'demo_makeup_needed';
  severity: 'urgent' | 'warn' | 'default';
  title: string;
  meta: string | null;
  targetSessionIndex?: number;
  targetDemoDayId?: string;
  targetStudentId?: string;
  isOverdue?: boolean;
  weekNumber?: number;
  targetWeekNumber?: number;
  actions?: { type: 'dropout_decision'; studentId: string };
}

interface ToDoSidebarProps {
  tasks: Task[];
  overdueTasks: Task[];
  weekNumber: number;
  weekStatus: string;
  onTaskClick: (task: Task) => void;
  onFinaliseClick: () => void;
  viewMode?: 'mod' | 'admin';
  adminInfo?: { modName: string; weekCompletionPct: number };
  onMarkDropped?: (studentId: string) => void;
  onStillActive?: (studentId: string) => void;
  onCheckedIn?: (studentId: string, snoozeType: string) => void;
}

const getThisWeeksFriday = (): Date => {
  const now = new Date();
  const day = now.getDay();
  const friday = new Date(now);
  friday.setHours(23, 59, 0, 0);
  if (day < 5) friday.setDate(now.getDate() + (5 - day));
  else if (day === 6) friday.setDate(now.getDate() + 6);
  else if (day === 0) friday.setDate(now.getDate() + 5);
  return friday;
};

const formatCountdown = (deadline: Date): string => {
  const now = new Date();
  const diff = deadline.getTime() - now.getTime();
  if (diff <= 0) return "this week's deadline has passed";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h left`;
  return `${hours}h left`;
};

// Tier styling
const tierStyles = {
  overdue: {
    background: 'rgba(229,75,75,0.08)',
    border: '1px solid rgba(229,75,75,0.35)',
    borderLeft: '3px solid #e54b4b',
  },
  current: {
    background: 'rgba(245,184,0,0.06)',
    border: '1px solid rgba(245,184,0,0.3)',
    borderLeft: '2px solid #f5b800',
  },
  neutral: {
    background: 'hsl(var(--secondary))',
    border: '1px solid #2a2a2a',
    borderLeft: 'none',
  },
} as const;

// Task type display metadata
const taskTypeMeta: Record<string, { emoji: string; label: string }> = {
  untouched_session:    { emoji: '📝', label: 'attendance' },
  absence_no_reason:   { emoji: '🚫', label: 'absence' },
  demo_scores_missing: { emoji: '📊', label: 'demo score' },
  demo_feedback_missing: { emoji: '📊', label: 'demo feedback' },
  demo_makeup_needed:  { emoji: '📅', label: 'make-up' },
  dropout_check_in:    { emoji: '👋', label: 'check-in' },
  dropout_red_flag:    { emoji: '👋', label: 'check-in' },
  dropout_force_decide:{ emoji: '👋', label: 'decision' },
  finalise:            { emoji: '✅', label: 'finalise' },
};

type AnimatedEntry<T> = { task: T; stage: 'present' | 'completing' | 'removing' };

function useAnimatedList<T extends { id: string }>(tasks: T[]): AnimatedEntry<T>[] {
  const [display, setDisplay] = useState<AnimatedEntry<T>[]>(() =>
    tasks.map(t => ({ task: t, stage: 'present' as const }))
  );
  const prevIdsRef = useRef<Set<string>>(new Set(tasks.map(t => t.id)));
  const timersRef = useRef<Map<string, number[]>>(new Map());

  useEffect(() => {
    const currIds = new Set(tasks.map(t => t.id));
    const wasIds = prevIdsRef.current;
    prevIdsRef.current = currIds;
    const removedIds = [...wasIds].filter(id => !currIds.has(id));
    const addedTasks = tasks.filter(t => !wasIds.has(t.id));
    if (removedIds.length === 0 && addedTasks.length === 0) return;

    setDisplay(prev => {
      const next: AnimatedEntry<T>[] = [];
      for (const d of prev) {
        if (currIds.has(d.task.id)) next.push(d.stage === 'present' ? d : { task: d.task, stage: 'present' });
        else if (d.stage === 'present') next.push({ task: d.task, stage: 'completing' });
        else next.push(d);
      }
      for (const t of addedTasks) {
        if (!next.some(d => d.task.id === t.id)) next.push({ task: t, stage: 'present' });
      }
      return next;
    });

    if (removedIds.length === 0) return;
    const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    for (const id of removedIds) {
      const existing = timersRef.current.get(id);
      if (existing) existing.forEach(t => window.clearTimeout(t));
      const newTimers: number[] = [];
      if (reducedMotion) {
        newTimers.push(window.setTimeout(() => {
          setDisplay(prev => prev.filter(d => !(d.task.id === id && d.stage === 'completing')));
          timersRef.current.delete(id);
        }, 300));
      } else {
        newTimers.push(window.setTimeout(() => {
          setDisplay(prev => prev.map(d => d.task.id === id && d.stage === 'completing' ? { ...d, stage: 'removing' } : d));
        }, 350));
        newTimers.push(window.setTimeout(() => {
          setDisplay(prev => prev.filter(d => !(d.task.id === id && d.stage === 'removing')));
          timersRef.current.delete(id);
        }, 750));
      }
      timersRef.current.set(id, newTimers);
    }
  }, [tasks]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(ts => ts.forEach(t => window.clearTimeout(t)));
      timersRef.current.clear();
    };
  }, []);

  return display;
}

function useCountPop(value: number): boolean {
  const [popping, setPopping] = useState(false);
  const prevRef = useRef(value);
  useEffect(() => {
    if (value !== prevRef.current) {
      prevRef.current = value;
      setPopping(true);
      const t = window.setTimeout(() => setPopping(false), 400);
      return () => window.clearTimeout(t);
    }
  }, [value]);
  return popping;
}

const ToDoSidebar: React.FC<ToDoSidebarProps> = ({
  tasks, overdueTasks, weekNumber, weekStatus,
  onTaskClick, onFinaliseClick, viewMode = 'mod', adminInfo,
  onMarkDropped, onStillActive, onCheckedIn,
}) => {
  const [countdown, setCountdown] = useState(() => formatCountdown(getThisWeeksFriday()));

  useEffect(() => {
    const iv = setInterval(() => setCountdown(formatCountdown(getThisWeeksFriday())), 60000);
    return () => clearInterval(iv);
  }, []);

  const nonFinaliseTasks = tasks.filter(t => t.type !== 'finalise');
  const finaliseTask = tasks.find(t => t.type === 'finalise');
  const canFinalise = nonFinaliseTasks.length === 0 && !!finaliseTask;

  // Unified list: overdue (sorted by week asc) first, then current week
  const sortedOverdue = [...overdueTasks].sort((a, b) => (a.weekNumber ?? 0) - (b.weekNumber ?? 0));
  const unified = [...sortedOverdue, ...nonFinaliseTasks];

  const totalCount = unified.length;
  const counterPopping = useCountPop(totalCount);
  const unifiedDisplay = useAnimatedList(unified);

  const getCardTier = (task: Task): 'overdue' | 'current' | 'neutral' => {
    if (task.type === 'finalise') return 'neutral';
    if (task.type === 'dropout_check_in' || task.type === 'dropout_red_flag' || task.type === 'dropout_force_decide') return 'neutral';
    if (task.isOverdue) return 'overdue';
    return 'current';
  };

  const getPillLabel = (task: Task, currentWeekNumber: number): string => {
    const w = task.weekNumber ?? currentWeekNumber;
    if (task.isOverdue) return `WEEK ${w} · OVERDUE`;
    if (task.type === 'finalise') return `END OF WEEK ${w}`;
    return `WEEK ${w}`;
  };

  const getPillColor = (tier: 'overdue' | 'current' | 'neutral'): string => {
    if (tier === 'overdue') return '#e54b4b';
    if (tier === 'current') return '#f5b800';
    return 'hsl(var(--muted-foreground))';
  };

  return (
    <div style={{
      width: 320, minWidth: 320, position: 'sticky', top: 64, height: 'calc(100vh - 96px)',
      maxHeight: 'calc(100vh - 96px)', background: 'hsl(var(--card))', borderLeft: '1px solid hsl(var(--border))',
      borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingTop: 16, paddingBottom: 16,
    }}>
      {/* Admin info header */}
      {viewMode === 'admin' && adminInfo && (
        <div style={{ flexShrink: 0, padding: '12px 12px 8px', borderBottom: '1px solid hsl(var(--border))' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground))', fontWeight: 600, marginBottom: 6 }}>
            Viewing as admin
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'hsl(var(--foreground))' }}>{adminInfo.modName || 'Moderator'}</div>
          <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
            Week {weekNumber} of 6 · {adminInfo.weekCompletionPct}% complete
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
        padding: '12px 12px 8px', borderBottom: '1px solid hsl(var(--border))',
      }}>
        <span style={{ fontSize: 13, color: 'hsl(var(--foreground))', fontWeight: 500 }}>
          📋 Loose ends
        </span>
        <span className={counterPopping ? 'counter-pop' : ''} style={{
          background: 'hsl(var(--amber-bg))', color: 'hsl(var(--score-amber))', padding: '2px 8px',
          border: '1px solid hsl(var(--amber-border))', borderRadius: 9999, fontSize: 11, fontWeight: 500,
          display: 'inline-block',
        }}>
          {totalCount}
        </span>
        {/* Deadline pill — right side */}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>
          {countdown}
        </span>
      </div>

      {/* Unified task list */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 12px 8px' }}>
        {unifiedDisplay.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <span style={{ fontSize: 28 }}>☕</span>
            <span style={{ fontSize: 13, color: 'hsl(var(--foreground))', fontWeight: 500 }}>All caught up</span>
            <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', textAlign: 'center' }}>
              {finaliseTask ? 'Ready to finalise this week.' : 'Nothing to do this week. Go take a break.'}
            </span>
          </div>
        ) : (
          unifiedDisplay.map(({ task, stage }) => {
            const tier = getCardTier(task);
            const ts = tierStyles[tier];
            const pillLabel = getPillLabel(task, weekNumber);
            const pillColor = getPillColor(tier);
            const typeMeta = taskTypeMeta[task.type] ?? { emoji: '📝', label: task.type };

            return (
              <div
                key={task.id}
                className={stage === 'completing' ? 'task-completing' : stage === 'removing' ? 'task-removing' : ''}
                onClick={stage === 'present' ? () => onTaskClick(task) : undefined}
                style={{
                  ...ts,
                  borderRadius: 6,
                  padding: '9px 12px',
                  cursor: stage === 'present' ? 'pointer' : 'default',
                  pointerEvents: stage === 'present' ? 'auto' : 'none',
                  transition: 'opacity 0.15s',
                }}
              >
                {/* Top row: week pill (left) + type icon-label (right) */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
                    color: pillColor,
                    textTransform: 'uppercase',
                  }}>
                    {pillLabel}
                  </span>
                  <span style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }}>
                    {typeMeta.emoji} {typeMeta.label}
                  </span>
                </div>

                {/* Title */}
                <div style={{ fontSize: 12, color: 'hsl(var(--foreground))', fontWeight: 500, lineHeight: 1.35 }}>
                  {task.title}
                </div>

                {/* Meta */}
                {task.meta && (
                  <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 3 }}>
                    {task.meta}
                  </div>
                )}

                {/* Dropout action buttons */}
                {task.actions?.type === 'dropout_decision' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    {task.type === 'dropout_force_decide' ? (
                      <>
                        <button disabled={viewMode === 'admin'} onClick={(e) => { e.stopPropagation(); onMarkDropped?.(task.actions!.studentId); }}
                          style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 4, border: 'none', background: 'hsl(var(--score-red))', color: '#fff', cursor: 'pointer' }}
                        >Mark as dropped</button>
                        <button disabled={viewMode === 'admin'} onClick={(e) => { e.stopPropagation(); onStillActive?.(task.actions!.studentId); }}
                          style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 4, border: '1px solid hsl(var(--border))', background: 'transparent', color: 'hsl(var(--muted-foreground))', cursor: 'pointer' }}
                        >Still active</button>
                      </>
                    ) : (
                      <>
                        <button disabled={viewMode === 'admin'} onClick={(e) => { e.stopPropagation(); onCheckedIn?.(task.actions!.studentId, task.type); }}
                          style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 4, border: '1px solid hsl(var(--border))', background: 'transparent', color: 'hsl(var(--foreground))', cursor: 'pointer' }}
                        >I've checked in</button>
                        <button disabled={viewMode === 'admin'} onClick={(e) => { e.stopPropagation(); onMarkDropped?.(task.actions!.studentId); }}
                          style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 4, border: 'none', background: 'hsl(var(--score-red))', color: '#fff', cursor: 'pointer' }}
                        >Mark as dropped</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Finalise button — sticky bottom */}
      {finaliseTask && viewMode !== 'admin' && (
        <div style={{ flexShrink: 0, padding: '12px 12px 16px', borderTop: '1px solid hsl(var(--border))' }}>
          {canFinalise ? (
            <button
              onClick={onFinaliseClick}
              style={{
                width: '100%', padding: '12px 0', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: 'hsl(var(--foreground))', color: 'hsl(var(--background))', border: 'none', cursor: 'pointer',
              }}
            >
              ✓ Finalise Week {weekNumber}
            </button>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <button disabled style={{
                width: '100%', padding: '12px 0', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))', border: '1px solid hsl(var(--border))', cursor: 'not-allowed',
              }}>
                ✓ Finalise Week {weekNumber}
              </button>
              <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>Complete tasks above first</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Admin summary panel for read-only view
export const AdminSummaryPanel: React.FC<{
  modName: string;
  weekNumber: number;
  taskCount: number;
  weekCompletionPct: number;
}> = ({ modName, weekNumber, taskCount, weekCompletionPct }) => {
  const pctColor = weekCompletionPct >= 80 ? 'hsl(var(--score-green))' : weekCompletionPct >= 50 ? 'hsl(var(--score-amber))' : 'hsl(var(--score-red))';
  return (
    <div style={{
      width: 280, minWidth: 280, position: 'sticky', top: 0, height: 'fit-content',
      background: 'hsl(var(--card))', borderLeft: '1px solid hsl(var(--border))', padding: '20px 16px',
    }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground))', fontWeight: 600, marginBottom: 12 }}>
        Mod progress
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'hsl(var(--foreground))', marginBottom: 2 }}>{modName || 'Moderator'}</div>
      <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginBottom: 14 }}>Week {weekNumber} of 6</div>
      <div style={{ height: 1, background: 'hsl(var(--border))', marginBottom: 14 }} />
      <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}>Week completion</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: pctColor, marginBottom: 4 }}>{weekCompletionPct}%</div>
      <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>{taskCount} task{taskCount === 1 ? '' : 's'} pending</div>
    </div>
  );
};

export default ToDoSidebar;
export type { Task };
