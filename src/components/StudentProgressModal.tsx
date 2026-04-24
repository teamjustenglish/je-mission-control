import React, { useRef } from 'react';
import html2canvas from 'html2canvas';
import { getSessionLabel, isDemoWeek, CRITERIA, getSessionsOccurred, computeAttendancePct } from '@/lib/batchtrack';

interface StudentProgressModalProps {
  student: { id: string; name: string; batch_id: string };
  batchName: string;
  modName: string;
  weekNumber: number;
  startDate?: string | null;
  attendance: { student_id: string; session_index: number; state: string; absence_note?: string | null }[];
  demoDays: { id: string; title: string; date: string | null; day_number: number }[];
  demoScores: { id: string; demo_day_id: string; student_id: string; criterion: string; score: number }[];
  demoFeedback?: { id: string; demo_day_id: string; student_id: string; feedback: string }[];
  onClose: () => void;
}

const emojiStyle: React.CSSProperties = { fontFamily: '"Apple Color Emoji","Segoe UI Emoji",sans-serif' };

const StudentProgressModal: React.FC<StudentProgressModalProps> = ({
  student, batchName, modName, weekNumber, startDate, attendance, demoDays, demoScores, demoFeedback, onClose,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleExport = async () => {
    if (!cardRef.current) return;
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#1e1e1e',
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement('a');
      const safeName = (student.name || 'student').replace(/[^a-z0-9]+/gi, '_');
      const safeBatch = (batchName || 'batch').replace(/[^a-z0-9]+/gi, '_');
      link.download = `${safeName}_progress_${safeBatch}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      console.error('Export failed, falling back to print', e);
      window.print();
    }
  };

  const studentAtt = attendance.filter(a => a.student_id === student.id);
  const present = studentAtt.filter(a => a.state === 'c').length;
  const attended = present;
  const sessionsOccurred = Math.min(weekNumber * 4, 24);
  const overallPct = sessionsOccurred > 0 ? Math.round((present / sessionsOccurred) * 100) : 0;
  const attColor = overallPct >= 70 ? '#4ade80' : overallPct >= 50 ? '#fbbf24' : '#f87171';

  const currentWeek = Math.min(Math.max(weekNumber, 1), 6);

  // Compute student's total for a demo day
  const demoDayTotal = (demoDayId: string): number | null => {
    const scores = demoScores.filter(s => s.demo_day_id === demoDayId && s.student_id === student.id);
    if (scores.length === 0) return null;
    const total = scores.reduce((sum, s) => sum + Number(s.score), 0);
    if (total === 0) return null;
    return Math.round(total * 10) / 10;
  };

  const lastDemoScore = (() => {
    const scored = demoDays
      .filter(dd => demoDayTotal(dd.id) !== null)
      .sort((a, b) => b.day_number - a.day_number);
    if (scored.length === 0) return null;
    return demoDayTotal(scored[0].id);
  })();

  const getInitials = (name: string) => name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '?';

  const getWeekAttendance = (weekNum: number) => {
    const startIdx = (weekNum - 1) * 4;
    return [0, 1, 2, 3].map(d => {
      const idx = startIdx + d;
      const info = getSessionLabel(idx);
      const rec = studentAtt.find(a => a.session_index === idx);
      return { ...info, state: rec?.state || 'e', idx };
    });
  };

  const weekPct = (weekNum: number) => {
    const days = getWeekAttendance(weekNum);
    const p = days.filter(d => d.state === 'c').length;
    return Math.round((p / 4) * 100);
  };

  // Find demo day record for a given week (weeks 2, 4, 6 → day_number 1, 2, 3)
  const demoDayForWeek = (weekNum: number) => {
    if (!isDemoWeek(weekNum)) return null;
    const dayNumber = weekNum / 2;
    return demoDays.find(dd => dd.day_number === dayNumber) || null;
  };

  const scoreColor = (n: number) => n >= 15 ? '#4ade80' : n >= 10 ? '#fbbf24' : '#f87171';

  const visibleWeeks = Array.from({ length: currentWeek }, (_, i) => i + 1);
  const futureWeeksNote = currentWeek < 6 ? `Weeks ${currentWeek + 1}–6 not started yet` : null;

  // Demo day cards: show for weeks 2, 4, 6 where week ≤ currentWeek
  const visibleDemoWeeks = [2, 4, 6].filter(w => w <= currentWeek);
  const nextFutureDemoWeek = [2, 4, 6].find(w => w > currentWeek);
  const nextFutureDemoNumber = nextFutureDemoWeek ? nextFutureDemoWeek / 2 : null;

  return (
    <>
      <style>{`@keyframes spm-pulse { 0%,100%{opacity:1} 50%{opacity:.4} } @keyframes spm-flash-red { 0%,100%{border-color:#333} 50%{border-color:#f87171} }`}</style>
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}
        onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()}
          ref={cardRef}
          style={{ background: '#1e1e1e', border: '1px solid #2e2e2e', borderRadius: 14, maxWidth: 500, width: '90%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
          {/* Header (fixed) */}
          <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#2a1f00', color: '#fbbf24', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, flexShrink: 0 }}>
                {getInitials(student.name)}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{student.name}</div>
                <div style={{ fontSize: 12, color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{batchName} · {modName} · Week {weekNumber} of 6</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }} data-html2canvas-ignore="true">
              <button
                onClick={handleExport}
                style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #333', borderRadius: 6, background: '#242424', color: '#888', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1, whiteSpace: 'nowrap' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#555'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = '#333'; }}
              ><span>⬇</span><span>Export</span></button>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 18, padding: 4 }}>✕</button>
            </div>
          </div>

          {/* Scrollable body */}
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 16 }}>
            {/* Stats row */}
            <div style={{ padding: '16px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div style={{ background: '#242424', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: attColor }}>Attendance · {overallPct}%</div>
              </div>
              <div style={{ background: '#242424', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#e8e8e8' }}>{attended} / {sessionsOccurred}</div>
                <div style={{ fontSize: 10, color: '#888' }}>Sessions attended</div>
              </div>
              <div style={{ background: '#242424', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: lastDemoScore !== null ? scoreColor(lastDemoScore) : '#888' }}>
                  {lastDemoScore !== null ? `${lastDemoScore} / 20` : '—'}
                </div>
                <div style={{ fontSize: 10, color: '#888' }}>Last demo score</div>
              </div>
            </div>

            {/* Attendance by week */}
            <div style={{ padding: '0 24px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Attendance by week</div>
              {visibleWeeks.map(w => {
                const days = getWeekAttendance(w);
                const pct = weekPct(w);
                const isCurrent = w === currentWeek;
                const dd = demoDayForWeek(w);
                const ddTotal = dd ? demoDayTotal(dd.id) : null;
                return (
                  <div key={w} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: '#888', width: 110, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>Week {w}</span>
                      {isCurrent && (
                        <>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block', marginLeft: 4, marginRight: 4, animation: 'spm-pulse 1.5s ease-in-out infinite' }} />
                          <span style={{ fontSize: 10, color: '#4ade80', fontWeight: 600 }}>(Current)</span>
                        </>
                      )}
                    </span>
                    <div style={{ display: 'flex', gap: 5, flex: 1 }}>
                      {days.map(d => {
                        const isDDCell = d.isDemo && isDemoWeek(w);
                        if (isDDCell) {
                          const scored = ddTotal !== null;
                          return (
                            <div key={d.idx} style={{
                              flex: 1, height: 26, borderRadius: 5,
                              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                              background: scored ? '#2a1f00' : '#1a1500',
                              border: `1px solid ${scored ? '#7a5000' : '#3a3000'}`,
                            }}>
                              <span style={{ fontSize: 8, color: scored ? '#9a6000' : '#555', textTransform: 'uppercase', fontWeight: 700, lineHeight: 1 }}>DD</span>
                              {scored && (
                                <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor(ddTotal!), lineHeight: 1 }}>{ddTotal}</span>
                              )}
                            </div>
                          );
                        }
                        const bg = d.state === 'c' ? '#14532d' : d.state === 'x' ? '#4a1717' : '#242424';
                        return (
                          <div key={d.idx} style={{
                            flex: 1, height: 26, borderRadius: 5, background: bg,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <span style={emojiStyle} className="text-sm">
                              {d.state === 'c' ? '✅' : d.state === 'x' ? '❌' : ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <span style={{ fontSize: 11, color: '#666', width: 36, textAlign: 'right' }}>{pct}%</span>
                  </div>
                );
              })}
              {futureWeeksNote && (
                <div style={{ fontSize: 11, color: '#444', fontStyle: 'italic', marginTop: 8 }}>{futureWeeksNote}</div>
              )}
            </div>

            {/* Demo day performance */}
            {visibleDemoWeeks.length > 0 && (
              <div style={{ padding: '0 24px 20px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Demo day performance</div>
                {visibleDemoWeeks.map(w => {
                  const dd = demoDayForWeek(w);
                  if (!dd) return null;
                  const scores = demoScores.filter(s => s.demo_day_id === dd.id && s.student_id === student.id);
                  const total = demoDayTotal(dd.id);
                  const totalColor = total !== null ? scoreColor(total) : '#555';
                  const fb = demoFeedback?.find(f => f.demo_day_id === dd.id && f.student_id === student.id);
                  const notScored = total === null;
                  return (
                    <div key={dd.id} style={{ background: '#242424', borderRadius: 10, padding: 14, marginBottom: 8, border: '1px solid #333' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#e8e8e8' }}>{dd.title}</span>
                        <span style={{ fontSize: 11, color: '#666' }}>{dd.date || ''}</span>
                      </div>
                      {CRITERIA.map(criterion => {
                        const scoreRec = scores.find(s => s.criterion === criterion);
                        const scoreNum = scoreRec ? Number(scoreRec.score) : 0;
                        const pct = (scoreNum / 5) * 100;
                        const barColor = scoreNum >= 4 ? '#4ade80' : scoreNum >= 2.5 ? '#fbbf24' : '#f87171';
                        return (
                          <div key={criterion} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 11, color: '#aaa', width: 140, flexShrink: 0 }}>{criterion}</span>
                            <div style={{ flex: 1, height: 8, borderRadius: 4, background: '#1e1e1e' }}>
                              {!notScored && <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: barColor }} />}
                            </div>
                            <span style={{ fontSize: 11, color: notScored ? '#555' : '#e8e8e8', width: 24, textAlign: 'right' }}>
                              {notScored ? '—' : scoreNum}
                            </span>
                          </div>
                        );
                      })}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                        {notScored ? (
                          <span style={{ fontSize: 11, color: '#555', fontStyle: 'italic' }}>Not scored yet</span>
                        ) : (
                          <span style={{ fontSize: 13, fontWeight: 700, color: totalColor }}>{total} / 20</span>
                        )}
                      </div>
                      {fb?.feedback && (
                        <>
                          <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginTop: 10, marginBottom: 4 }}>Feedback</div>
                          <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, padding: '9px 11px', fontSize: 12, color: '#888', lineHeight: 1.6, fontStyle: 'italic' }}>
                            {fb.feedback}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
                {nextFutureDemoNumber !== null && (
                  <div style={{ fontSize: 11, color: '#444', fontStyle: 'italic', marginTop: 4 }}>
                    Demo day {String(nextFutureDemoNumber).padStart(2, '0')} will appear after week {nextFutureDemoWeek}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default StudentProgressModal;
