import React, { useRef } from 'react';
import html2canvas from 'html2canvas';
import { getSessionLabel, isDemoWeek, CRITERIA } from '@/lib/batchtrack';

interface StudentProgressModalProps {
  student: { id: string; name: string; batch_id: string };
  batchName: string;
  modName: string;
  weekNumber: number;
  attendance: { student_id: string; session_index: number; state: string; absence_note?: string | null }[];
  demoDays: { id: string; title: string; date: string | null; day_number: number }[];
  demoScores: { id: string; demo_day_id: string; student_id: string; criterion: string; score: number }[];
  demoFeedback?: { id: string; demo_day_id: string; student_id: string; feedback: string }[];
  onClose: () => void;
}

const emojiStyle: React.CSSProperties = { fontFamily: '"Apple Color Emoji","Segoe UI Emoji",sans-serif' };

const StudentProgressModal: React.FC<StudentProgressModalProps> = ({
  student, batchName, modName, weekNumber, attendance, demoDays, demoScores, demoFeedback, onClose,
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
  const totalSessions = 24;
  const present = studentAtt.filter(a => a.state === 'c').length;
  const absent = studentAtt.filter(a => a.state === 'x').length;
  const attended = present;
  const sessionsOccurred = Math.min(weekNumber * 4, 24);
  const overallPct = sessionsOccurred > 0 ? Math.round((present / sessionsOccurred) * 100) : 0;
  const attColor = overallPct >= 70 ? '#4ade80' : overallPct >= 50 ? '#fbbf24' : '#f87171';

  const lastDemoScore = (() => {
    const studentDDs = demoDays
      .filter(dd => demoScores.some(s => s.demo_day_id === dd.id && s.student_id === student.id))
      .sort((a, b) => b.day_number - a.day_number);
    if (studentDDs.length === 0) return null;
    const lastDD = studentDDs[0];
    const scores = demoScores.filter(s => s.demo_day_id === lastDD.id && s.student_id === student.id);
    return Math.round(scores.reduce((sum, s) => sum + Number(s.score), 0) * 10) / 10;
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

  const studentDemoDays = demoDays.filter(dd =>
    demoScores.some(s => s.demo_day_id === dd.id && s.student_id === student.id)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        ref={cardRef}
        style={{ background: '#1e1e1e', border: '1px solid #2e2e2e', borderRadius: 14, maxWidth: 500, width: '90%', maxHeight: '90vh', overflowY: 'auto', padding: 0 }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#2a1f00', color: '#fbbf24', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600 }}>
              {getInitials(student.name)}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{student.name}</div>
              <div style={{ fontSize: 12, color: '#555' }}>{batchName} · {modName} · Currently in week {weekNumber} of 6</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} data-html2canvas-ignore="true">
            <button
              onClick={handleExport}
              style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #333', borderRadius: 6, background: '#242424', color: '#888', cursor: 'pointer', transition: 'all 0.15s', display: 'inline-flex', flexDirection: 'row', alignItems: 'center', gap: 6, lineHeight: 1, whiteSpace: 'nowrap' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#555'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = '#333'; }}
            ><span>⬇</span><span>Export</span></button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 18, padding: 4 }}>✕</button>
          </div>
        </div>

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
            <div style={{ fontSize: 18, fontWeight: 600, color: lastDemoScore !== null ? (lastDemoScore >= 16 ? '#4ade80' : lastDemoScore >= 12 ? '#fbbf24' : '#f87171') : '#888' }}>
              {lastDemoScore !== null ? `${lastDemoScore} / 20` : '—'}
            </div>
            <div style={{ fontSize: 10, color: '#888' }}>Last demo score</div>
          </div>
        </div>

        {/* Attendance by week */}
        <div style={{ padding: '0 24px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Attendance by week</div>
          {[1, 2, 3, 4, 5, 6].map(w => {
            const days = getWeekAttendance(w);
            const pct = weekPct(w);
            return (
              <div key={w} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: '#888', width: 50 }}>Week {w}</span>
                <div style={{ display: 'flex', gap: 3 }}>
                  {days.map(d => (
                    <span key={d.idx} style={emojiStyle} className="text-sm">
                      {d.isDemo && isDemoWeek(w) ? (
                        <span style={{ fontSize: 10, padding: '1px 4px', borderRadius: 3, background: '#2a1f00', color: '#fbbf24', fontWeight: 600 }}>DD</span>
                      ) : d.state === 'c' ? '✅' : d.state === 'x' ? '❌' : '⬜'}
                    </span>
                  ))}
                </div>
                <span style={{ fontSize: 11, color: '#666' }}>{pct}%</span>
              </div>
            );
          })}
        </div>

        {/* Demo day performance */}
        {studentDemoDays.length > 0 && (
          <div style={{ padding: '0 24px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Demo day performance</div>
            {studentDemoDays.map(dd => {
              const scores = demoScores.filter(s => s.demo_day_id === dd.id && s.student_id === student.id);
              const total = Math.round(scores.reduce((sum, s) => sum + Number(s.score), 0) * 10) / 10;
              const totalColor = total >= 16 ? '#4ade80' : total >= 12 ? '#fbbf24' : '#f87171';
              const fb = demoFeedback?.find(f => f.demo_day_id === dd.id && f.student_id === student.id);
              return (
                <div key={dd.id} style={{ background: '#242424', borderRadius: 10, padding: 14, marginBottom: 8, border: '1px solid #333' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#e8e8e8' }}>{dd.title}</span>
                    <span style={{ fontSize: 11, color: '#666' }}>{dd.date || ''}</span>
                  </div>
                  {CRITERIA.map(criterion => {
                    const score = scores.find(s => s.criterion === criterion)?.score || 0;
                    const pct = (Number(score) / 5) * 100;
                    const barColor = Number(score) >= 4 ? '#4ade80' : Number(score) >= 2.5 ? '#fbbf24' : '#f87171';
                    return (
                      <div key={criterion} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: '#aaa', width: 140, flexShrink: 0 }}>{criterion}</span>
                        <div style={{ flex: 1, height: 8, borderRadius: 4, background: '#1e1e1e' }}>
                          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: barColor }} />
                        </div>
                        <span style={{ fontSize: 11, color: '#e8e8e8', width: 24, textAlign: 'right' }}>{Number(score)}</span>
                      </div>
                    );
                  })}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: totalColor }}>{total} / 20</span>
                  </div>
                  {fb?.feedback && (
                    <div style={{ marginTop: 8, padding: '8px 10px', background: '#1e1e1e', borderRadius: 6, fontSize: 12, color: '#888', fontStyle: 'italic', lineHeight: 1.5 }}>
                      {fb.feedback}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentProgressModal;
