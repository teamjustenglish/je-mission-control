import React, { useState, useEffect } from 'react';
import { getSessionLabel, CRITERIA, getSessionsOccurred } from '@/lib/batchtrack';

export interface StudentProgressViewProps {
  student: { id: string; name: string };
  batchName: string;
  modName: string;
  weekNumber: number;
  startDate: string | null;
  attendance: { student_id: string; session_index: number; state: string }[];
  demoDays: { id: string; title?: string; date: string | null; day_number: number }[];
  demoScores: { id: string; demo_day_id: string; student_id: string; criterion: string; score: number }[];
  demoFeedback?: { id: string; demo_day_id: string; student_id: string; feedback: string }[];
  rescheduledSessions?: { from_week?: number; from_day?: string; week_number?: number; day_name?: string }[];
  showLiveBanner?: boolean;
  lastUpdatedAt?: Date;
  hideHeader?: boolean;
  studentStatus?: string;
  statusReason?: string | null;
  statusChangedAt?: string | null;
  onReverseDropout?: () => void;
}

const scoreColor = (n: number) => n >= 14 ? 'hsl(var(--score-green))' : n >= 9 ? 'hsl(var(--score-amber))' : 'hsl(var(--score-red))';
const cellScoreColor = (n: number) => n >= 4 ? 'hsl(var(--score-green))' : n >= 2.5 ? 'hsl(var(--score-amber))' : 'hsl(var(--score-red))';

const StudentProgressView: React.FC<StudentProgressViewProps> = ({
  student, batchName, modName, weekNumber, startDate,
  attendance, demoDays, demoScores, demoFeedback,
  showLiveBanner, lastUpdatedAt, hideHeader,
}) => {
  // Time ago ticker
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!showLiveBanner) return;
    const t = setInterval(() => setTick(x => x + 1), 10000);
    return () => clearInterval(t);
  }, [showLiveBanner]);

  const timeAgo = () => {
    if (!lastUpdatedAt) return '';
    const secs = Math.floor((Date.now() - lastUpdatedAt.getTime()) / 1000);
    if (secs < 10) return 'just now';
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    return `${mins} min${mins > 1 ? 's' : ''} ago`;
  };

  const studentAtt = attendance.filter(a => a.student_id === student.id);
  const sessionsOccurred = startDate ? getSessionsOccurred(startDate) : 0;
  const attended = studentAtt.filter(a => a.state === 'c').length;
  const missed = studentAtt.filter(a => a.state === 'x').length;
  const toGo = 24 - attended - missed;
  const missedRatio = sessionsOccurred > 0 ? missed / sessionsOccurred : 0;
  const attColor = sessionsOccurred === 0 ? 'hsl(var(--score-green))' : missedRatio >= 0.4 ? 'hsl(var(--score-red))' : missedRatio >= 0.2 ? 'hsl(var(--score-amber))' : 'hsl(var(--score-green))';

  const currentWeek = Math.min(Math.max(weekNumber, 1), 6);

  const demoDayTotal = (ddId: string): number | null => {
    const scores = demoScores.filter(s => s.demo_day_id === ddId && s.student_id === student.id);
    if (scores.length === 0) return null;
    const total = scores.reduce((sum, s) => sum + Number(s.score), 0);
    if (total === 0) return null;
    return Math.round(total * 10) / 10;
  };

  const demoDaysCompleted = demoDays.filter(dd => demoDayTotal(dd.id) !== null).length;

  const lastDemoScore = (() => {
    const scored = demoDays.filter(dd => demoDayTotal(dd.id) !== null).sort((a, b) => b.day_number - a.day_number);
    return scored.length > 0 ? demoDayTotal(scored[0].id) : null;
  })();
  const lastDemoNumber = (() => {
    const scored = demoDays.filter(dd => demoDayTotal(dd.id) !== null).sort((a, b) => b.day_number - a.day_number);
    return scored.length > 0 ? scored[0].day_number : null;
  })();

  const getWeekAttendance = (w: number) => {
    const startIdx = (w - 1) * 4;
    return [0, 1, 2, 3].map(d => {
      const idx = startIdx + d;
      const info = getSessionLabel(idx);
      const rec = studentAtt.find(a => a.session_index === idx);
      return { ...info, state: rec?.state || 'e', idx };
    });
  };

  // Check if student was absent on a demo day
  const isAbsentOnDemo = (demoNumber: number) => {
    const demoSessionIdx = (demoNumber * 2 - 1) * 4 + 3; // Friday of demo week
    const rec = studentAtt.find(a => a.session_index === demoSessionIdx);
    return rec?.state === 'x';
  };

  return (
    <div style={{ color: 'hsl(var(--foreground))', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Live banner */}
      {showLiveBanner && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 0 12px', borderBottom: '1px solid hsl(var(--card))' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'hsl(var(--score-green))', display: 'inline-block', animation: 'spv-pulse 1.5s ease-in-out infinite' }} />
          <span style={{ fontSize: 12, color: 'hsl(var(--score-green))', fontWeight: 600 }}>Live</span>
          <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>· Updated {timeAgo()}</span>
        </div>
      )}

      {/* Header */}
      {!hideHeader && (
        <div style={{ padding: '20px 0 16px' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'hsl(var(--foreground))' }}>{student.name}</div>
          <div style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>
            {batchName} · Moderator: {modName} · Week {weekNumber} of 6
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        <div style={{ background: 'hsl(var(--card))', borderRadius: 8, padding: '14px 12px', textAlign: 'center', border: '1px solid hsl(var(--secondary))' }}>
          <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Attendance</div>
          <div>
            <span style={{ fontSize: 24, fontWeight: 500, color: attColor }}>{attended}</span>
            <span style={{ fontSize: 14, color: 'hsl(var(--muted-foreground))', marginLeft: 4 }}>attended</span>
          </div>
          <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>
            <span style={{ color: 'hsl(var(--score-red))' }}>{missed} missed</span>
            <span> · </span>
            <span>{toGo} to go</span>
          </div>
        </div>
        <div style={{ background: 'hsl(var(--card))', borderRadius: 8, padding: '14px 12px', textAlign: 'center', border: '1px solid hsl(var(--secondary))' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'hsl(var(--foreground))' }}>{demoDaysCompleted} / 3</div>
          <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>Demo days</div>
          <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>completed so far</div>
        </div>
        <div style={{ background: 'hsl(var(--card))', borderRadius: 8, padding: '14px 12px', textAlign: 'center', border: '1px solid hsl(var(--secondary))' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: lastDemoScore !== null ? scoreColor(lastDemoScore) : 'hsl(var(--muted-foreground))' }}>
            {lastDemoScore !== null ? `${lastDemoScore} / 20` : '—'}
          </div>
          <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>Last demo</div>
          <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>{lastDemoNumber !== null ? `Demo Day ${lastDemoNumber}` : '—'}</div>
        </div>
      </div>

      {/* Attendance by week */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Attendance by week</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
          {[1, 2, 3, 4, 5, 6].map(w => {
            const days = getWeekAttendance(w);
            const isFuture = w > currentWeek;
            const presentCount = days.filter(d => d.state === 'c').length;
            const totalInWeek = isFuture ? 4 : Math.min(4, sessionsOccurred - (w - 1) * 4);
            return (
              <div key={w} style={{ background: 'hsl(var(--card))', borderRadius: 6, padding: '8px 8px', textAlign: 'center', border: '1px solid hsl(var(--border))', opacity: isFuture ? 0.4 : 1 }}>
                <div style={{ fontSize: 11, color: w === currentWeek ? 'hsl(var(--score-green))' : 'hsl(var(--muted-foreground))', fontWeight: 500, marginBottom: 8 }}>W{w}</div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 8 }}>
                  {days.map(d => {
                    if (d.state === 'c') {
                      return <div key={d.idx} style={{ width: 8, height: 8, borderRadius: '50%', background: 'hsl(var(--score-green))' }} />;
                    } else if (d.state === 'x') {
                      return <div key={d.idx} style={{ width: 8, height: 8, borderRadius: '50%', background: 'hsl(var(--score-red))' }} />;
                    } else {
                      return <div key={d.idx} style={{ width: 8, height: 8, borderRadius: '50%', background: 'transparent', border: '1px dashed hsl(var(--input))' }} />;
                    }
                  })}
                </div>
                <div style={{ fontSize: 11, color: isFuture ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))', fontWeight: 500, marginTop: 8 }}>
                  {isFuture ? '— / 4' : `${presentCount} / ${Math.max(totalInWeek, 0)}`}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: 'hsl(var(--muted-foreground))', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'hsl(var(--score-green))', display: 'inline-block' }} />
            Present
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'hsl(var(--score-red))', display: 'inline-block' }} />
            Absent
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'transparent', border: '1px dashed hsl(var(--input))', display: 'inline-block' }} />
            Not marked
          </span>
        </div>
      </div>

      {/* Demo days — always render all 3 */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Demo days</div>
        {[1, 2, 3].map(dn => {
          const dd = demoDays.find(d => d.day_number === dn);
          const demoWeek = dn * 2;
          const isFuture = demoWeek > currentWeek;
          const ddId = dd?.id;
          const scores = ddId ? demoScores.filter(s => s.demo_day_id === ddId && s.student_id === student.id) : [];
          const total = ddId ? demoDayTotal(ddId) : null;
          const wasAbsent = !isFuture && isAbsentOnDemo(dn);
          const fb = ddId ? demoFeedback?.find(f => f.demo_day_id === ddId && f.student_id === student.id) : null;

          const renderRubric = (muted: boolean) => (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 8 }}>
              {CRITERIA.map(c => {
                const s = scores.find(sc => sc.criterion === c);
                const val = s ? Number(s.score) : 0;
                return (
                  <div key={c} style={{ background: 'hsl(var(--background))', borderRadius: 6, padding: '8px 4px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}>{c.split(' ')[0]}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: muted ? 'hsl(var(--muted-foreground))' : cellScoreColor(val) }}>
                      {muted || total === null ? '—' : val}
                    </div>
                  </div>
                );
              })}
            </div>
          );

          return (
            <div key={dn} style={{ background: 'hsl(var(--card))', borderRadius: 8, padding: 16, marginBottom: 12, border: '1px solid hsl(var(--secondary))', opacity: isFuture ? 0.55 : 1 }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'hsl(var(--foreground))' }}>Demo Day {dn}</span>
                  {wasAbsent && <span style={{ fontSize: 11, background: 'hsl(var(--danger-bg))', color: 'hsl(var(--score-red))', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>Absent</span>}
                </div>
                <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>{dd?.date || ''}</span>
              </div>

              {/* Rubric + total */}
              {isFuture ? (
                <>
                  {renderRubric(true)}
                  <div style={{ textAlign: 'right', fontSize: 12, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' }}>Not yet</div>
                </>
              ) : wasAbsent ? (
                <>
                  {renderRubric(true)}
                  <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'hsl(var(--score-red))' }}>Absent</div>
                </>
              ) : (
                <>
                  {renderRubric(total === null)}
                  <div style={{ textAlign: 'right' }}>
                    {total !== null ? (
                      <span style={{ fontSize: 14, fontWeight: 700, color: scoreColor(total) }}>{total} / 20</span>
                    ) : (
                      <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' }}>Not scored yet</span>
                    )}
                  </div>
                  {fb?.feedback && (
                    <div style={{ marginTop: 12, borderLeft: '3px solid hsl(var(--score-green))', paddingLeft: 12 }}>
                      <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Feedback</div>
                      <div style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', lineHeight: 1.5, fontStyle: 'italic' }}>{fb.feedback}</div>
                    </div>
                  )}
                  {!fb?.feedback && total !== null && (
                    <div style={{ marginTop: 12, fontSize: 12, color: 'hsl(var(--input))', fontStyle: 'italic' }}>No feedback yet</div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid hsl(var(--card))', padding: '20px 0 32px', textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: 'hsl(var(--input))' }}>Just English Mission Control</div>
        <div style={{ fontSize: 11, color: 'hsl(var(--border))', marginTop: 4 }}>This page updates automatically. Refresh anytime.</div>
      </div>

      <style>{`@keyframes spv-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
    </div>
  );
};

export default StudentProgressView;
