import React, { useState, useEffect } from 'react';
import { getSessionLabel, isDemoWeek, CRITERIA, getSessionsOccurred, computeAttendancePct } from '@/lib/batchtrack';

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
}

const scoreColor = (n: number) => n >= 14 ? '#4ade80' : n >= 9 ? '#fbbf24' : '#f87171';
const cellScoreColor = (n: number) => n >= 4 ? '#4ade80' : n >= 2.5 ? '#fbbf24' : '#f87171';

const StudentProgressView: React.FC<StudentProgressViewProps> = ({
  student, batchName, modName, weekNumber, startDate,
  attendance, demoDays, demoScores, demoFeedback,
  showLiveBanner, lastUpdatedAt,
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
  const present = studentAtt.filter(a => a.state === 'c').length;
  const overallPct = computeAttendancePct(present, 1, sessionsOccurred);
  const attColor = overallPct === null ? '#555' : overallPct >= 70 ? '#4ade80' : overallPct >= 50 ? '#fbbf24' : '#f87171';

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
    <div style={{ color: '#e8e8e8', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Live banner */}
      {showLiveBanner && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 0 10px', borderBottom: '1px solid #1a1a1a' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', display: 'inline-block', animation: 'spv-pulse 1.5s ease-in-out infinite' }} />
          <span style={{ fontSize: 12, color: '#4ade80', fontWeight: 600 }}>Live</span>
          <span style={{ fontSize: 12, color: '#555' }}>· Updated {timeAgo()}</span>
        </div>
      )}

      {/* Header */}
      <div style={{ padding: '20px 0 16px' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{student.name}</div>
        <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
          {batchName} · Moderator: {modName} · Week {weekNumber} of 6
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
        <div style={{ background: '#1a1a1a', borderRadius: 10, padding: '14px 12px', textAlign: 'center', border: '1px solid #222' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: attColor }}>{overallPct === null ? '—' : `${overallPct}%`}</div>
          <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>Attendance</div>
          <div style={{ fontSize: 10, color: '#555' }}>{present} of {sessionsOccurred} sessions</div>
        </div>
        <div style={{ background: '#1a1a1a', borderRadius: 10, padding: '14px 12px', textAlign: 'center', border: '1px solid #222' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#e8e8e8' }}>{demoDaysCompleted} / 3</div>
          <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>Demo days</div>
          <div style={{ fontSize: 10, color: '#555' }}>completed so far</div>
        </div>
        <div style={{ background: '#1a1a1a', borderRadius: 10, padding: '14px 12px', textAlign: 'center', border: '1px solid #222' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: lastDemoScore !== null ? scoreColor(lastDemoScore) : '#555' }}>
            {lastDemoScore !== null ? `${lastDemoScore} / 20` : '—'}
          </div>
          <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>Last demo</div>
          <div style={{ fontSize: 10, color: '#555' }}>{lastDemoNumber !== null ? `Demo Day ${lastDemoNumber}` : '—'}</div>
        </div>
      </div>

      {/* Attendance by week */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Attendance by week</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
          {[1, 2, 3, 4, 5, 6].map(w => {
            const days = getWeekAttendance(w);
            const isFuture = w > currentWeek;
            const presentCount = days.filter(d => d.state === 'c').length;
            const totalInWeek = isFuture ? 0 : Math.min(4, sessionsOccurred - (w - 1) * 4);
            return (
              <div key={w} style={{ background: '#1a1a1a', borderRadius: 8, padding: '10px 6px 8px', textAlign: 'center', border: '1px solid #222', opacity: isFuture ? 0.4 : 1 }}>
                <div style={{ fontSize: 10, color: w === currentWeek ? '#4ade80' : '#666', fontWeight: 600, marginBottom: 6 }}>W{w}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 6 }}>
                  {days.map(d => {
                    const sessionOccurred = d.idx < sessionsOccurred;
                    const bg = d.state === 'c' ? '#14532d' : d.state === 'x' ? '#450a0a' : sessionOccurred ? '#242424' : '#151515';
                    const border = d.state === 'c' ? '#166534' : d.state === 'x' ? '#7f1d1d' : sessionOccurred ? '#333' : '#2a2a2a';
                    const borderStyle = (!sessionOccurred && d.state === 'e') ? 'dashed' : 'solid';
                    return (
                      <div key={d.idx} style={{
                        width: '100%', aspectRatio: '1', borderRadius: 4,
                        background: bg, border: `1px ${borderStyle} ${border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ fontSize: 10 }}>
                          {d.state === 'c' ? '✅' : d.state === 'x' ? '❌' : sessionOccurred ? '·' : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 10, color: '#666' }}>
                  {isFuture ? '—' : `${presentCount} / ${Math.max(totalInWeek, 0)}`}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 10, color: '#555' }}>
          <span>✅ Present</span><span>❌ Absent</span><span style={{ color: '#444' }}>· Not marked</span>
        </div>
      </div>

      {/* Demo days — always render all 3 */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Demo days</div>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 8 }}>
              {CRITERIA.map(c => {
                const s = scores.find(sc => sc.criterion === c);
                const val = s ? Number(s.score) : 0;
                return (
                  <div key={c} style={{ background: '#151515', borderRadius: 6, padding: '8px 4px', textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: '#555', marginBottom: 4 }}>{c.split(' ')[0]}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: muted ? '#555' : cellScoreColor(val) }}>
                      {muted || total === null ? '—' : val}
                    </div>
                  </div>
                );
              })}
            </div>
          );

          return (
            <div key={dn} style={{ background: '#1a1a1a', borderRadius: 10, padding: 16, marginBottom: 10, border: '1px solid #222', opacity: isFuture ? 0.55 : 1 }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#e8e8e8' }}>Demo Day {dn}</span>
                  {wasAbsent && <span style={{ fontSize: 10, background: '#450a0a', color: '#f87171', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>Absent</span>}
                </div>
                <span style={{ fontSize: 11, color: '#555' }}>{dd?.date || ''}</span>
              </div>

              {/* Rubric + total */}
              {isFuture ? (
                <>
                  {renderRubric(true)}
                  <div style={{ textAlign: 'right', fontSize: 12, color: '#555', fontStyle: 'italic' }}>Not yet</div>
                </>
              ) : wasAbsent ? (
                <>
                  {renderRubric(true)}
                  <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#f87171' }}>Absent</div>
                </>
              ) : (
                <>
                  {renderRubric(total === null)}
                  <div style={{ textAlign: 'right' }}>
                    {total !== null ? (
                      <span style={{ fontSize: 14, fontWeight: 700, color: scoreColor(total) }}>{total} / 20</span>
                    ) : (
                      <span style={{ fontSize: 12, color: '#555', fontStyle: 'italic' }}>Not scored yet</span>
                    )}
                  </div>
                  {fb?.feedback && (
                    <div style={{ marginTop: 10, borderLeft: '3px solid #4ade80', paddingLeft: 12 }}>
                      <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Feedback</div>
                      <div style={{ fontSize: 13, color: '#999', lineHeight: 1.5, fontStyle: 'italic' }}>{fb.feedback}</div>
                    </div>
                  )}
                  {!fb?.feedback && total !== null && (
                    <div style={{ marginTop: 10, fontSize: 12, color: '#444', fontStyle: 'italic' }}>No feedback yet</div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid #1a1a1a', padding: '20px 0 32px', textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: '#444' }}>Just English Mission Control</div>
        <div style={{ fontSize: 11, color: '#333', marginTop: 4 }}>This page updates automatically. Refresh anytime.</div>
      </div>

      <style>{`@keyframes spv-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
    </div>
  );
};

export default StudentProgressView;
