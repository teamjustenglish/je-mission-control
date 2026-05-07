import React, { useState, useEffect } from 'react';

interface Task {
  id: string;
  type: 'untouched_session' | 'absence_no_reason' | 'demo_scores_missing' | 'demo_feedback_missing' | 'finalise';
  severity: 'urgent' | 'warn' | 'default';
  title: string;
  meta: string | null;
  targetSessionIndex?: number;
  targetDemoDayId?: string;
  targetStudentId?: string;
  isOverdue?: boolean;
  weekNumber?: number;
}

interface ToDoSidebarProps {
  tasks: Task[];
  overdueTasks: Task[];
  weekNumber: number;
  weekStatus: string;
  onTaskClick: (task: Task) => void;
  onFinaliseClick: () => void;
}

const getThisWeeksFriday = (): Date => {
  const now = new Date();
  const day = now.getDay();
  const friday = new Date(now);
  friday.setHours(23, 59, 0, 0);
  if (day < 5) {
    friday.setDate(now.getDate() + (5 - day));
  } else if (day === 5) {
    // already Friday
  } else if (day === 6) {
    friday.setDate(now.getDate() + 6);
  } else if (day === 0) {
    friday.setDate(now.getDate() + 5);
  }
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

const ToDoSidebar: React.FC<ToDoSidebarProps> = ({ tasks, overdueTasks, weekNumber, weekStatus, onTaskClick, onFinaliseClick }) => {
  const [countdown, setCountdown] = useState(() => formatCountdown(getThisWeeksFriday()));
  const [activeTab, setActiveTab] = useState<'current' | 'overdue'>('current');

  useEffect(() => {
    const iv = setInterval(() => setCountdown(formatCountdown(getThisWeeksFriday())), 60000);
    return () => clearInterval(iv);
  }, []);

  const nonFinaliseTasks = tasks.filter(t => t.type !== 'finalise');
  const finaliseTask = tasks.find(t => t.type === 'finalise');
  const canFinalise = nonFinaliseTasks.length === 0 && !!finaliseTask;
  const hasOverdue = overdueTasks.length > 0;

  const severityColors: Record<string, { text: string; border: string }> = {
    urgent: { text: '#f87171', border: '#f87171' },
    warn: { text: '#fbbf24', border: '#fbbf24' },
    default: { text: '#888', border: '#555' },
  };

  return (
    <div style={{
      width: 320, minWidth: 320, position: 'sticky', top: 16, height: 'calc(100vh - 32px)',
      maxHeight: 'calc(100vh - 32px)', background: '#161616', borderLeft: '1px solid #2a2a2a',
      borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
        padding: '12px 12px 8px', borderBottom: '1px solid #2a2a2a',
      }}>
        <span style={{ fontSize: 13, color: '#e8e8e8', fontWeight: 500 }}>
          📋 To do
        </span>
        <span style={{
          background: '#2a1f00', color: '#fbbf24', padding: '1px 8px',
          border: '1px solid #5a4a00', borderRadius: 99, fontSize: 11, fontWeight: 500,
        }}>
          {nonFinaliseTasks.length + overdueTasks.length}
        </span>
      </div>

      {/* Tabs */}
      <div style={{ flexShrink: 0, display: 'flex', borderBottom: '1px solid #2a2a2a', padding: '0 12px' }}>
        <button
          onClick={() => setActiveTab('current')}
          style={{
            fontSize: 11, padding: '7px 11px', background: 'none', border: 'none', cursor: 'pointer',
            color: activeTab === 'current' ? '#e8e8e8' : '#888',
            fontWeight: activeTab === 'current' ? 500 : 400,
            borderBottom: activeTab === 'current' ? '2px solid #e8e8e8' : '2px solid transparent',
            marginBottom: -1,
          }}
        >
          {weekNumber ? `Current week (W${weekNumber})` : 'Current week'}
        </button>
        {hasOverdue && (
          <button
            onClick={() => setActiveTab('overdue')}
            style={{
              fontSize: 11, padding: '7px 11px', background: 'none', border: 'none', cursor: 'pointer',
              color: activeTab === 'overdue' ? '#e8e8e8' : '#888',
              fontWeight: activeTab === 'overdue' ? 500 : 400,
              borderBottom: activeTab === 'overdue' ? '2px solid #e8e8e8' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            Overdue ({overdueTasks.length})
          </button>
        )}
      </div>

      {activeTab === 'current' ? (
        <>
          {/* Deadline pill */}
          <div style={{
            flexShrink: 0,
            background: '#1e1800', border: '1px solid #5a4a00', color: '#fbbf24',
            fontSize: 10, padding: '6px 9px', borderRadius: 5, margin: '12px 12px 0', lineHeight: 1.4,
          }}>
            Closes Friday 11:59 PM · {countdown}
          </div>

          {/* Task list — scrollable */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 12px 6px' }}>
            {nonFinaliseTasks.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <span style={{ fontSize: 28 }}>☕</span>
                <span style={{ fontSize: 13, color: '#e8e8e8', fontWeight: 500 }}>All caught up</span>
                <span style={{ fontSize: 11, color: '#888', textAlign: 'center' }}>
                  {finaliseTask ? 'Ready to finalise this week.' : 'Nothing to do this week. Go take a break.'}
                </span>
              </div>
            ) : (
              nonFinaliseTasks.map(task => {
                const colors = severityColors[task.severity] || severityColors.default;
                return (
                  <div
                    key={task.id}
                    onClick={() => onTaskClick(task)}
                    style={{
                      background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: 6,
                      padding: '8px 10px', cursor: 'pointer', transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#3a3a3a'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 12, height: 12, borderRadius: 2, flexShrink: 0,
                        border: `1.5px solid ${colors.border}`, background: 'transparent',
                      }} />
                      <span style={{ fontSize: 11, color: colors.text, fontWeight: 500 }}>{task.title}</span>
                    </div>
                    {task.meta && (
                      <div style={{ fontSize: 10, color: '#888', marginTop: 3, marginLeft: 18 }}>{task.meta}</div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Finalise button — sticky bottom */}
          {finaliseTask && (
            <div style={{ flexShrink: 0, padding: '10px 12px 14px', borderTop: '1px solid #2a2a2a' }}>
              {canFinalise ? (
                <button
                  onClick={onFinaliseClick}
                  style={{
                    width: '100%', padding: '10px 0', borderRadius: 7, fontSize: 12, fontWeight: 600,
                    background: '#fff', color: '#111', border: 'none', cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#e8e8e8'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
                >
                  ✓ Finalise Week {weekNumber}
                </button>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <button
                    disabled
                    style={{
                      width: '100%', padding: '10px 0', borderRadius: 7, fontSize: 12, fontWeight: 600,
                      background: '#222', color: '#555', border: '1px solid #2a2a2a', cursor: 'not-allowed',
                    }}
                  >
                    ✓ Finalise Week {weekNumber}
                  </button>
                  <div style={{ fontSize: 9, color: '#555', marginTop: 4 }}>Complete tasks above first</div>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        /* Overdue tab */
        <>
          <div style={{ flexShrink: 0, padding: '10px 12px 6px' }}>
            <p style={{ fontSize: 10, color: '#888', fontStyle: 'italic', lineHeight: 1.4 }}>
              Ask your admin to reopen these weeks if you need to edit.
            </p>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, padding: '6px 12px 14px' }}>
            {overdueTasks.map(task => (
              <div
                key={task.id}
                style={{
                  background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: 6,
                  padding: '8px 10px', cursor: 'not-allowed', opacity: 0.65,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 12, height: 12, borderRadius: 2, flexShrink: 0,
                    border: '1.5px solid #555', background: 'transparent',
                  }} />
                  <span style={{ fontSize: 11, color: '#555', fontWeight: 500 }}>{task.title}</span>
                </div>
                {task.meta && (
                  <div style={{ fontSize: 10, color: '#555', marginTop: 3, marginLeft: 18 }}>{task.meta}</div>
                )}
              </div>
            ))}
          </div>
        </>
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
  const pctColor = weekCompletionPct >= 80 ? '#4ade80' : weekCompletionPct >= 50 ? '#fbbf24' : '#f87171';
  return (
    <div style={{
      width: 280, minWidth: 280, position: 'sticky', top: 0, height: 'fit-content',
      background: '#161616', borderLeft: '1px solid #2a2a2a', padding: '20px 16px',
    }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#555', fontWeight: 600, marginBottom: 12 }}>
        Mod progress
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#e8e8e8', marginBottom: 2 }}>{modName || 'Moderator'}</div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>Week {weekNumber} of 6</div>
      <div style={{ height: 1, background: '#2a2a2a', marginBottom: 14 }} />
      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Week completion</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: pctColor, marginBottom: 4 }}>{weekCompletionPct}%</div>
      <div style={{ fontSize: 11, color: '#888' }}>{taskCount} task{taskCount === 1 ? '' : 's'} pending</div>
    </div>
  );
};

export default ToDoSidebar;
export type { Task };
