import React, { useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getSessionLabel, CRITERIA } from '@/lib/batchtrack';
import { logActivity } from '@/lib/batchtrack';
import { ArrowLeft } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface Props {
  student: { id: string; name: string; batch_id: string };
  batch: { id: string; name: string };
  students: { id: string; name: string }[];
  attendance: { student_id: string; session_index: number; state: string }[];
  demoDays: { id: string; title: string; date: string | null; day_number: number }[];
  demoScores: { id: string; demo_day_id: string; student_id: string; criterion: string; score: number }[];
  modName: string;
  onBack: () => void;
}

const StudentReport: React.FC<Props> = ({
  student, batch, attendance, demoDays, demoScores, modName, onBack,
}) => {
  const { user, profile } = useAuth();
  const reportRef = useRef<HTMLDivElement>(null);
  const [remarks, setRemarks] = useState('');
  const [exporting, setExporting] = useState(false);

  const studentAttendance = attendance.filter(a => a.student_id === student.id);
  const totalSessions = 24;
  const present = studentAttendance.filter(a => a.state === 'c').length;
  const absent = studentAttendance.filter(a => a.state === 'x').length;
  const overallPct = totalSessions > 0 ? Math.round((present / totalSessions) * 100) : 0;

  const exportPdf = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true, backgroundColor: '#1A1A1A' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const imgWidth = pageWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
      pdf.save(`${student.name}_progress_report.pdf`);
      if (user) {
        await logActivity(user.id, profile?.name || '', 'report_exported', `Exported report for ${student.name}`, batch.name);
      }
    } catch (e) { console.error('PDF export error', e); }
    setExporting(false);
  };

  const getWeekAttendance = (weekNum: number) => {
    const startIdx = (weekNum - 1) * 4;
    return [0, 1, 2, 3].map(d => {
      const idx = startIdx + d;
      const info = getSessionLabel(idx);
      const state = studentAttendance.find(a => a.session_index === idx)?.state || 'e';
      return { ...info, state, idx };
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

  const getDemoAvg = (ddId: string) => {
    const scores = demoScores.filter(s => s.demo_day_id === ddId && s.student_id === student.id);
    if (scores.length === 0) return 0;
    return Math.round((scores.reduce((sum, s) => sum + Number(s.score), 0) / 6) * 10) / 10;
  };

  const emojiStyle: React.CSSProperties = { fontFamily: '"Apple Color Emoji","Segoe UI Emoji",sans-serif' };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <button onClick={exportPdf} disabled={exporting}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50">
            {exporting ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>

        <div ref={reportRef} className="bg-card p-8" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10 }}>
          <p className="text-xs font-semibold text-muted-foreground tracking-widest uppercase mb-1">Student Progress Report</p>
          <h1 className="text-2xl font-semibold text-foreground mb-1">{student.name}</h1>
          <p className="text-sm text-muted-foreground mb-6">
            {batch.name} &nbsp; Moderator: {modName} &nbsp; {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>

          <h2 className="text-xs font-semibold text-muted-foreground tracking-widest uppercase mb-3">Attendance</h2>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-lg p-3" style={{ background: 'hsl(var(--success-bg))' }}>
              <div className="text-xl font-semibold" style={{ color: 'hsl(var(--success-text))' }}>{overallPct}%</div>
              <div className="text-xs" style={{ color: 'hsl(var(--success-text))' }}>Overall</div>
            </div>
            <div className="rounded-lg p-3 bg-muted">
              <div className="text-xl font-semibold text-foreground">{present}/{totalSessions}</div>
              <div className="text-xs text-muted-foreground">Sessions attended</div>
            </div>
            <div className="rounded-lg p-3" style={{ background: 'hsl(var(--danger-bg))' }}>
              <div className="text-xl font-semibold" style={{ color: 'hsl(var(--danger-text))' }}>{absent}</div>
              <div className="text-xs" style={{ color: 'hsl(var(--danger-text))' }}>Absences</div>
            </div>
          </div>

          <div className="space-y-2 mb-6">
            {[1, 2, 3, 4, 5, 6].map(w => {
              const days = getWeekAttendance(w);
              return (
                <div key={w} className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground w-14">Week {w}</span>
                  <div className="flex gap-1">
                    {days.map(d => (
                      <span key={d.idx} style={emojiStyle} className="text-base">
                        {d.state === 'c' ? (d.isDemo ? '🟠' : '✅') : d.state === 'x' ? '❌' : '⬜'}
                      </span>
                    ))}
                  </div>
                  <span className="text-muted-foreground text-xs">{weekPct(w)}%</span>
                </div>
              );
            })}
          </div>

          {studentDemoDays.length > 0 && (
            <>
              <h2 className="text-xs font-semibold text-muted-foreground tracking-widest uppercase mb-3">Demo Day Performance</h2>
              <div className="space-y-4 mb-6">
                {studentDemoDays.map((dd, idx) => {
                  const avg = getDemoAvg(dd.id);
                  const prevAvg = idx > 0 ? getDemoAvg(studentDemoDays[idx - 1].id) : null;
                  const avgColor = avg >= 3.0 ? 'hsl(var(--score-green))' : avg >= 2.0 ? 'hsl(var(--score-amber))' : 'hsl(var(--score-red))';
                  return (
                    <div key={dd.id} className="p-4" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10 }}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-foreground">{dd.title}</h3>
                        <span className="text-sm text-muted-foreground">{dd.date || ''}</span>
                      </div>
                      {CRITERIA.map(criterion => {
                        const score = demoScores.find(s => s.demo_day_id === dd.id && s.student_id === student.id && s.criterion === criterion)?.score || 0;
                        const pct = (Number(score) / 4) * 100;
                        const barColor = score >= 2.5 ? 'hsl(var(--score-green))' : score >= 2 ? 'hsl(var(--score-amber))' : 'hsl(var(--score-red))';
                        return (
                          <div key={criterion} className="flex items-center gap-3 mb-1.5 text-sm">
                            <span className="text-foreground w-28 text-xs">{criterion}</span>
                            <div className="flex-1 bg-muted rounded-full h-3">
                              <div className="h-3 rounded-full" style={{ width: `${pct}%`, background: barColor }} />
                            </div>
                            <span className="text-foreground w-8 text-right text-xs">{score}</span>
                          </div>
                        );
                      })}
                      <div className="mt-2 flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Avg band</span>
                        <span className="font-semibold px-2 py-0.5 rounded" style={{ background: 'hsl(var(--success-bg))', color: avgColor }}>{avg} / 4</span>
                        {prevAvg !== null && (
                          <span className="text-xs" style={{ color: avg > prevAvg ? 'hsl(var(--score-green))' : avg < prevAvg ? 'hsl(var(--score-red))' : 'hsl(var(--muted-foreground))' }}>
                            {avg > prevAvg ? `↑ improved from DD0${idx}` : avg < prevAvg ? `↓ declined from DD0${idx}` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <h2 className="text-xs font-semibold text-muted-foreground tracking-widest uppercase mb-2">Moderator Remarks</h2>
          <div className="p-4 mb-4" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10 }}>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Add remarks about this student's progress…"
              className="w-full bg-transparent text-sm text-foreground resize-none outline-none min-h-[60px] placeholder:text-muted-foreground"
            />
            <p className="text-xs text-muted-foreground mt-1">Editable before export</p>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-4" style={{ borderTop: '1px solid hsl(var(--border))' }}>
            <span>Prepared by {modName} · {batch.name}</span>
            <span>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentReport;
