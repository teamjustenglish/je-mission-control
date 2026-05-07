import React, { useState, useEffect } from 'react';
import { getSessionLabel, CRITERIA, getSessionsOccurred, isDemoWeek } from '@/lib/batchtrack';

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
}

const scoreColor = (n: number) => n >= 14 ? 'hsl(var(--score-green))' : n >= 9 ? 'hsl(var(--score-amber))' : 'hsl(var(--score-red))';
const cellScoreColor = (n: number) => n >= 4 ? 'hsl(var(--score-green))' : n >= 2.5 ? 'hsl(var(--score-amber))' : 'hsl(var(--score-red))';

const monoStyle: React.CSSProperties = {
  fontSize: 11,
  fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'hsl(var(--muted-foreground))',
  fontWeight: 500,
};

const StudentProgressView: React.FC<StudentProgressViewProps> = ({
  student, batchName, modName, weekNumber, startDate,
  attendance, demoDays, demoScores, demoFeedback,
  showLiveBanner, lastUpdatedAt, hideHeader,
}) => {
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

  const isAbsentOnDemo = (demoNumber: number) => {
    const demoSessionIdx = (demoNumber * 2 - 1) * 4 + 3;
    const rec = studentAtt.find(a => a.session_index === demoSessionIdx);
    return rec?.state === 'x';
  };

  // Demo day badge mapping: week 2 → D1, week 4 → D2, week 6 → D3
  const getDemoBadge = (w: number, dayIdx: number): string | null => {
    if (dayIdx !== 3) return null; // Friday only
    if (w === 2) return 'D1';
    if (w === 4) return 'D2';
    if (w === 6) return 'D3';
    return null;
  };

  const dayHeaders = ['MON', 'TUE', 'THU', 'FRI'];

  const formatDemoDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day} ${months[d.getMonth()]}`;
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
          <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>
            {batchName} · Moderator: {modName} · Week {weekNumber} of 6
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
        {/* Attendance */}
        <div style={{ background: 'hsl(var(--secondary))', borderRadius: 8, padding: '16px 18px', border: '1px solid hsl(var(--border))' }}>
          <div style={{ ...monoStyle, marginBottom: 8 }}>ATTENDANCE</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 44, fontWeight: 600, color: attColor, lineHeight: 1 }}>{attended}</span>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'hsl(var(--muted-foreground))' }}>attended</span>
          </div>
          <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'hsl(var(--score-red))', display: 'inline-block', flexShrink: 0 }} />
            <span>{missed} missed</span>
            <span style={{ margin: '0 2px' }}>·</span>
            <span>{toGo} to go</span>
          </div>
        </div>

        {/* Demo days */}
        <div style={{ background: 'hsl(var(--secondary))', borderRadius: 8, padding: '16px 18px', border: '1px solid hsl(var(--border))' }}>
          <div style={{ ...monoStyle, marginBottom: 8 }}>DEMO DAYS</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
            <span style={{ fontSize: 32, fontWeight: 600, color: 'hsl(var(--foreground))', lineHeight: 1 }}>{demoDaysCompleted}</span>
            <span style={{ fontSize: 20, fontWeight: 400, color: 'hsl(var(--muted-foreground))' }}>/</span>
            <span style={{ fontSize: 20, fontWeight: 400, color: 'hsl(var(--muted-foreground))' }}>3</span>
          </div>
          <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>Completed</div>
        </div>

        {/* Last demo */}
        <div style={{ background: 'hsl(var(--secondary))', borderRadius: 8, padding: '16px 18px', border: '1px solid hsl(var(--border))' }}>
          <div style={{ ...monoStyle, marginBottom: 8 }}>LAST DEMO</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
            {lastDemoScore !== null ? (
              <>
                <span style={{ fontSize: 32, fontWeight: 600, color: scoreColor(lastDemoScore), lineHeight: 1 }}>{lastDemoScore}</span>
                <span style={{ fontSize: 20, fontWeight: 400, color: 'hsl(var(--muted-foreground))' }}>/</span>
                <span style={{ fontSize: 20, fontWeight: 400, color: 'hsl(var(--muted-foreground))' }}>20</span>
              </>
            ) : (
              <span style={{ fontSize: 32, fontWeight: 600, color: 'hsl(var(--muted-foreground))', lineHeight: 1 }}>—</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>
            {lastDemoNumber !== null ? `Demo Day ${lastDemoNumber}` : '—'}
          </div>
        </div>
      </div>

      {/* Attendance by week — calendar table */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ ...monoStyle, marginBottom: 12 }}>ATTENDANCE BY WEEK</div>

        {/* Table header */}
        <div style={{ display: 'grid', gridTemplateColumns: '56px repeat(4, 1fr) 60px', gap: 0, alignItems: 'center', marginBottom: 4 }}>
          <div />
          {dayHeaders.map(h => (
            <div key={h} style={{ ...monoStyle, textAlign: 'center', fontSize: 11 }}>{h}</div>
          ))}
          <div style={{ ...monoStyle, textAlign: 'right', fontSize: 11 }}>TOTAL</div>
        </div>

        {/* Table rows */}
        {[1, 2, 3, 4, 5, 6].map(w => {
          const days = getWeekAttendance(w);
          const isFuture = w > currentWeek;
          const presentCount = days.filter(d => d.state === 'c').length;
          const totalInWeek = isFuture ? 0 : Math.min(4, Math.max(sessionsOccurred - (w - 1) * 4, 0));
          const isCurrent = w === currentWeek;

          // Total color
          let totalColor = 'hsl(var(--muted-foreground))';
          if (!isFuture && totalInWeek > 0) {
            totalColor = presentCount === 4 ? 'hsl(var(--score-green))' : presentCount >= 2 ? 'hsl(var(--score-amber))' : 'hsl(var(--muted-foreground))';
          }

          return (
            <div key={w} style={{
              display: 'grid',
              gridTemplateColumns: '56px repeat(4, 1fr) 60px',
              gap: 0,
              alignItems: 'center',
              padding: '4px 0',
              opacity: isFuture ? 0.55 : 1,
            }}>
              {/* Week label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'hsl(var(--foreground))' }}>W{w}</span>
                {isCurrent && (
                  <span style={{
                    fontSize: 9, fontWeight: 500, padding: '1px 5px', borderRadius: 9999,
                    background: 'hsl(var(--success-bg))', color: 'hsl(var(--success-text))',
                    lineHeight: '14px',
                  }}>NOW</span>
                )}
              </div>

              {/* Day cells */}
              {days.map((d, di) => {
                const badge = getDemoBadge(w, di);
                return (
                  <div key={d.idx} style={{ display: 'flex', justifyContent: 'center', padding: 4 }}>
                    <div style={{ position: 'relative' }}>
                      {d.state === 'c' ? (
                        <div style={{
                          width: 28, height: 28, borderRadius: 6,
                          background: 'hsl(var(--success-bg))',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <span style={{ color: 'hsl(var(--score-green))', fontSize: 14, fontWeight: 'bold', lineHeight: 1 }}>✓</span>
                        </div>
                      ) : d.state === 'x' ? (
                        <div style={{
                          width: 28, height: 28, borderRadius: 6,
                          background: 'hsl(var(--danger-bg))',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <span style={{ color: 'hsl(var(--score-red))', fontSize: 14, fontWeight: 'bold', lineHeight: 1 }}>✕</span>
                        </div>
                      ) : (
                        <div style={{
                          width: 28, height: 28, borderRadius: 6,
                          background: 'transparent',
                          border: '1px dashed hsl(var(--input))',
                        }} />
                      )}
                      {badge && (
                        <span style={{
                          position: 'absolute', top: -6, right: -6,
                          background: 'hsl(var(--info-bg))', color: 'hsl(var(--info-text))',
                          borderRadius: 9999, fontSize: 9, padding: '1px 5px', fontWeight: 600,
                          lineHeight: '14px',
                        }}>{badge}</span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Total */}
              <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 500, color: totalColor }}>
                {isFuture ? '—' : presentCount} / 4
              </div>
            </div>
          );
        })}
      </div>

      {/* Demo days section */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ ...monoStyle }}>DEMO DAYS</div>
          <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
            {demoDaysCompleted} of 3 complete
          </div>
        </div>

        {[1, 2, 3].map(dn => {
          const dd = demoDays.find(d => d.day_number === dn);
          const demoWeek = dn * 2;
          const isFuture = demoWeek > currentWeek;
          const ddId = dd?.id;
          const scores = ddId ? demoScores.filter(s => s.demo_day_id === ddId && s.student_id === student.id) : [];
          const total = ddId ? demoDayTotal(ddId) : null;
          const wasAbsent = !isFuture && isAbsentOnDemo(dn);
          const fb = ddId ? demoFeedback?.find(f => f.demo_day_id === ddId && f.student_id === student.id) : null;

          return (
            <div key={dn} style={{
              background: 'hsl(var(--secondary))',
              borderRadius: 8,
              padding: '14px 16px',
              marginBottom: 10,
              border: isFuture ? '1px dashed hsl(var(--border))' : '1px solid hsl(var(--border))',
              opacity: isFuture ? 0.55 : 1,
            }}>
              {/* Card header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isFuture ? 0 : 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: 'hsl(var(--foreground))' }}>Demo Day {dn}</span>
                  {isFuture && (
                    <span style={{
                      fontSize: 10, padding: '2px 7px', borderRadius: 9999,
                      background: 'hsl(var(--secondary))', border: '1px solid hsl(var(--border))',
                      color: 'hsl(var(--muted-foreground))', fontWeight: 500,
                    }}>Upcoming</span>
                  )}
                  {wasAbsent && (
                    <span style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 11, padding: '2px 7px', borderRadius: 9999,
                      background: 'hsl(var(--danger-bg))', color: 'hsl(var(--score-red))', fontWeight: 500,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'hsl(var(--score-red))', display: 'inline-block' }} />
                      Absent
                    </span>
                  )}
                  {!isFuture && dd?.date && (
                    <span style={{ fontSize: 12, ...monoStyle }}>{formatDemoDate(dd.date)}</span>
                  )}
                </div>
                <div>
                  {isFuture ? null : wasAbsent ? (
                    <span style={{ fontSize: 24, fontWeight: 600, color: 'hsl(var(--muted-foreground))' }}>—</span>
                  ) : (
                    <span style={{ fontSize: 24, fontWeight: 600, color: total !== null ? scoreColor(total) : 'hsl(var(--muted-foreground))' }}>
                      {total !== null ? <>{total}<span style={{ fontWeight: 400, color: 'hsl(var(--muted-foreground))', fontSize: 16 }}> / 20</span></> : '—'}
                    </span>
                  )}
                </div>
              </div>

              {/* Rubric strip */}
              {!isFuture && (
                <div style={{
                  display: 'flex',
                  borderTop: '1px solid hsl(var(--border))',
                  borderBottom: '1px solid hsl(var(--border))',
                  padding: '10px 0',
                }}>
                  {CRITERIA.map((c, ci) => {
                    const s = scores.find(sc => sc.criterion === c);
                    const val = s ? Number(s.score) : 0;
                    const isMuted = wasAbsent || total === null;
                    return (
                      <div key={c} style={{
                        flex: 1,
                        textAlign: 'center',
                        borderRight: ci < 3 ? '1px solid hsl(var(--border))' : 'none',
                        display: 'flex', flexDirection: 'column', gap: 4,
                      }}>
                        <div style={{ ...monoStyle }}>{c.split(' ')[0].toUpperCase()}</div>
                        <div style={{ fontSize: 22, fontWeight: 600, color: isMuted ? 'hsl(var(--muted-foreground))' : cellScoreColor(val) }}>
                          {isMuted ? '—' : val}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Feedback */}
              {!isFuture && !wasAbsent && (
                <>
                  {fb?.feedback ? (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ ...monoStyle, marginBottom: 8 }}>FEEDBACK FROM {modName.toUpperCase()}</div>
                      <div style={{
                        background: 'hsl(var(--card))',
                        borderRadius: 6,
                        padding: '12px 14px',
                        fontSize: 14,
                        lineHeight: 1.55,
                        color: 'hsl(var(--foreground))',
                      }}>{fb.feedback}</div>
                    </div>
                  ) : total !== null ? (
                    <div style={{ marginTop: 12, fontSize: 12, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' }}>No feedback yet.</div>
                  ) : null}
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
