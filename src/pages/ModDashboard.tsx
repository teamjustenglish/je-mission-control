import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { logActivity, getSessionLabel, getWeekSessions, isDemoWeek, MONTHS, CRITERIA } from '@/lib/batchtrack';
import { Plus, Trash2, ChevronDown, ChevronRight, Grid3X3, List, FileText } from 'lucide-react';
import StudentReport from '@/components/StudentReport';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

interface Batch { id: string; name: string; mod_id: string; month: number; year: number; label: string; start_date?: string | null; }
interface Student { id: string; batch_id: string; name: string; }
interface AttendanceRecord { id: string; student_id: string; batch_id: string; session_index: number; state: string; }
interface DemoDay { id: string; batch_id: string; title: string; date: string | null; day_number: number; }
interface DemoScore { id: string; demo_day_id: string; student_id: string; criterion: string; score: number; }

const emojiStyle: React.CSSProperties = { fontFamily: '"Apple Color Emoji","Segoe UI Emoji",sans-serif' };

const AttendanceCell: React.FC<{ state: string; isDemo: boolean; onClick: () => void }> = ({ state, isDemo, onClick }) => (
  <div
    data-state={state}
    onClick={onClick}
    className="flex items-center justify-center cursor-pointer w-full h-full py-2"
  >
    {state === 'c' ? (
      <span style={emojiStyle} className="text-[18px] leading-none">✅</span>
    ) : state === 'x' ? (
      <span style={emojiStyle} className="text-[18px] leading-none">❌</span>
    ) : (
      <div
        className="w-[22px] h-[22px] rounded-[5px]"
        style={{
          border: isDemo ? '1.5px solid hsl(var(--amber-border))' : '1.5px solid hsl(var(--checkbox-border))',
          background: 'transparent',
        }}
      />
    )}
  </div>
);

// Score input with validation: 0-4, decimals allowed
const ScoreInput: React.FC<{
  value: number;
  onChange: (val: number) => void;
}> = ({ value, onChange }) => {
  const [localVal, setLocalVal] = useState(value ? String(value) : '');
  const [flash, setFlash] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalVal(value ? String(value) : '');
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '' || raw === '.') { setLocalVal(raw); return; }
    const num = parseFloat(raw);
    if (isNaN(num)) { setFlash(true); setLocalVal(''); setTimeout(() => setFlash(false), 400); return; }
    if (num < 0 || num > 4) { setFlash(true); setLocalVal(''); setTimeout(() => setFlash(false), 400); return; }
    setLocalVal(raw);
  };

  const handleBlur = () => {
    const num = parseFloat(localVal);
    if (!isNaN(num) && num >= 0 && num <= 4) {
      onChange(num);
    } else if (localVal === '') {
      onChange(0);
    }
  };

  return (
    <input
      ref={inputRef}
      type="number"
      min={0} max={4} step={0.1}
      value={localVal}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={(e) => { if (e.key === 'Enter') inputRef.current?.blur(); }}
      className="score-input"
      style={{
        width: 44, textAlign: 'center', fontSize: 12, padding: '3px 6px',
        border: flash ? '1.5px solid hsl(var(--danger-text))' : '1px solid hsl(var(--input-border))',
        borderRadius: 5, background: 'hsl(var(--input-bg))', color: 'hsl(var(--foreground))',
        MozAppearance: 'textfield', outline: 'none',
        transition: 'border-color 0.2s',
      }}
    />
  );
};

const ModDashboard: React.FC = () => {
  const { user, profile, signOut } = useAuth();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [demoDays, setDemoDays] = useState<DemoDay[]>([]);
  const [demoScores, setDemoScores] = useState<DemoScore[]>([]);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [allWeeksView, setAllWeeksView] = useState(false);
  const [showCreateBatch, setShowCreateBatch] = useState(false);
  const [demoDaysExpanded, setDemoDaysExpanded] = useState(false);
  const [newBatchMonth, setNewBatchMonth] = useState(new Date().getMonth() + 1);
  const [newBatchYear, setNewBatchYear] = useState(new Date().getFullYear());
  const [newBatchLabel, setNewBatchLabel] = useState('');
  const [newBatchStartDate, setNewBatchStartDate] = useState('');
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [hoveredStudentId, setHoveredStudentId] = useState<string | null>(null);
  const [reportStudent, setReportStudent] = useState<Student | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Student | null>(null);
  const [savedVisible, setSavedVisible] = useState(false);
  const savedTimeout = useRef<ReturnType<typeof setTimeout>>();
  const nameInputRef = useRef<HTMLInputElement>(null);

  const activeBatch = batches.find(b => b.id === activeBatchId);

  const showSaved = () => {
    setSavedVisible(true);
    if (savedTimeout.current) clearTimeout(savedTimeout.current);
    savedTimeout.current = setTimeout(() => setSavedVisible(false), 2000);
  };

  const loadBatches = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('batches').select('*').eq('mod_id', user.id).order('created_at');
    if (data) {
      setBatches(data);
      if (data.length > 0 && !activeBatchId) setActiveBatchId(data[0].id);
    }
  }, [user, activeBatchId]);

  const loadBatchData = useCallback(async () => {
    if (!activeBatchId) return;
    const [studentsRes, attendanceRes, demoDaysRes] = await Promise.all([
      supabase.from('students').select('*').eq('batch_id', activeBatchId).order('created_at'),
      supabase.from('attendance').select('*').eq('batch_id', activeBatchId),
      supabase.from('demo_days').select('*').eq('batch_id', activeBatchId).order('day_number'),
    ]);
    if (studentsRes.data) setStudents(studentsRes.data);
    if (attendanceRes.data) setAttendance(attendanceRes.data);
    if (demoDaysRes.data) {
      setDemoDays(demoDaysRes.data);
      const ddIds = demoDaysRes.data.map(d => d.id);
      if (ddIds.length > 0) {
        const { data: scores } = await supabase.from('demo_scores').select('*').in('demo_day_id', ddIds);
        if (scores) setDemoScores(scores);
      }
    }
  }, [activeBatchId]);

  useEffect(() => { loadBatches(); }, [loadBatches]);
  useEffect(() => { loadBatchData(); }, [loadBatchData]);

  // Session date calculation
  const getSessionDate = (sessionIndex: number): string | null => {
    if (!activeBatch?.start_date) return null;
    const start = new Date(activeBatch.start_date);
    const week = Math.floor(sessionIndex / 4);
    const dayInWeek = sessionIndex % 4;
    const dayOffsets = [0, 1, 3, 4]; // Mon=0, Tue=1, Thu=3, Fri=4
    const date = new Date(start);
    date.setDate(start.getDate() + week * 7 + dayOffsets[dayInWeek]);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  const createBatch = async () => {
    if (!user || !newBatchLabel.trim()) return;
    const monthName = MONTHS[newBatchMonth - 1];
    const batchName = `${monthName} ${newBatchYear} · ${newBatchLabel.trim()}`;
    const { data } = await supabase.from('batches').insert({
      mod_id: user.id, name: batchName, month: newBatchMonth, year: newBatchYear, label: newBatchLabel.trim(),
    }).select().single();
    if (data) {
      await supabase.from('demo_days').insert([
        { batch_id: data.id, title: 'Demo day 01', day_number: 1 },
        { batch_id: data.id, title: 'Demo day 02', day_number: 2 },
        { batch_id: data.id, title: 'Demo day 03', day_number: 3 },
      ]);
      await logActivity(user.id, profile?.name || '', 'batch_created', `Created batch ${batchName}`, batchName);
      setShowCreateBatch(false);
      setNewBatchLabel('');
      setNewBatchStartDate('');
      setActiveBatchId(data.id);
      loadBatches();
    }
  };

  const addStudent = async () => {
    if (!activeBatchId || !user) return;
    const { data } = await supabase.from('students').insert({ batch_id: activeBatchId, name: '' }).select().single();
    if (data) {
      setStudents(prev => [...prev, data]);
      setEditingStudentId(data.id);
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  };

  const updateStudentName = async (studentId: string, name: string) => {
    await supabase.from('students').update({ name }).eq('id', studentId);
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, name } : s));
    if (name && user && activeBatch) {
      await logActivity(user.id, profile?.name || '', 'student_added', `Added student ${name}`, activeBatch.name);
    }
    setEditingStudentId(null);
  };

  const confirmRemoveStudent = (student: Student) => setDeleteConfirm(student);

  const removeStudent = async (student: Student) => {
    await supabase.from('attendance').delete().eq('student_id', student.id);
    await supabase.from('demo_scores').delete().eq('student_id', student.id);
    await supabase.from('students').delete().eq('id', student.id);
    setStudents(prev => prev.filter(s => s.id !== student.id));
    setDeleteConfirm(null);
    if (user && activeBatch) {
      await logActivity(user.id, profile?.name || '', 'student_removed', `Removed student ${student.name}`, activeBatch.name);
    }
  };

  const cycleAttendance = async (studentId: string, sessionIndex: number) => {
    if (!activeBatchId) return;
    const existing = attendance.find(a => a.student_id === studentId && a.session_index === sessionIndex);
    let newState: string;
    if (!existing || existing.state === 'e') newState = 'c';
    else if (existing.state === 'c') newState = 'x';
    else newState = 'e';

    if (existing) {
      await supabase.from('attendance').update({ state: newState }).eq('id', existing.id);
      setAttendance(prev => prev.map(a => a.id === existing.id ? { ...a, state: newState } : a));
    } else {
      const { data } = await supabase.from('attendance').insert({
        student_id: studentId, batch_id: activeBatchId, session_index: sessionIndex, state: newState,
      }).select().single();
      if (data) setAttendance(prev => [...prev, data]);
    }
    showSaved();

    if (user && activeBatch) {
      const week = Math.floor(sessionIndex / 4) + 1;
      await logActivity(user.id, profile?.name || '', 'attendance_marked', `Marked Week ${week} attendance`, activeBatch.name);
    }
  };

  const getAttendanceState = (studentId: string, sessionIndex: number): string => {
    return attendance.find(a => a.student_id === studentId && a.session_index === sessionIndex)?.state || 'e';
  };

  // Stats
  const totalStudents = students.length;
  const totalSessions = 24;
  const avgAttendance = (() => {
    if (students.length === 0) return 0;
    const totalPossible = students.length * totalSessions;
    const present = attendance.filter(a => a.state === 'c').length;
    return totalPossible > 0 ? Math.round((present / totalPossible) * 100) : 0;
  })();
  const avgDemoScore = (() => {
    if (demoScores.length === 0) return 0;
    const avg = demoScores.reduce((sum, s) => sum + Number(s.score), 0) / demoScores.length;
    return Math.round(avg * 10) / 10;
  })();
  const sessionsLogged = (() => {
    const loggedSessions = new Set<number>();
    attendance.forEach(a => { if (a.state !== 'e') loggedSessions.add(a.session_index); });
    return loggedSessions.size;
  })();

  const updateDemoScore = async (demoDayId: string, studentId: string, criterion: string, score: number) => {
    const existing = demoScores.find(s => s.demo_day_id === demoDayId && s.student_id === studentId && s.criterion === criterion);
    if (existing) {
      await supabase.from('demo_scores').update({ score }).eq('id', existing.id);
      setDemoScores(prev => prev.map(s => s.id === existing.id ? { ...s, score } : s));
    } else {
      const { data } = await supabase.from('demo_scores').insert({
        demo_day_id: demoDayId, student_id: studentId, criterion, score,
      }).select().single();
      if (data) setDemoScores(prev => [...prev, data]);
    }
    showSaved();
    if (user && activeBatch) {
      await logActivity(user.id, profile?.name || '', 'demo_score_added', `Added Demo day scores`, activeBatch.name);
    }
  };

  const getScore = (demoDayId: string, studentId: string, criterion: string): number => {
    return demoScores.find(s => s.demo_day_id === demoDayId && s.student_id === studentId && s.criterion === criterion)?.score || 0;
  };

  const getStudentDemoAvg = (demoDayId: string, studentId: string): string => {
    const scores = demoScores.filter(s => s.demo_day_id === demoDayId && s.student_id === studentId && Number(s.score) > 0);
    if (scores.length === 0) return '—';
    const total = scores.reduce((sum, s) => sum + Number(s.score), 0);
    return (Math.round((total / 6) * 10) / 10).toString();
  };

  const getAvgColor = (avgStr: string): string => {
    if (avgStr === '—') return 'hsl(var(--muted-foreground))';
    const val = parseFloat(avgStr);
    if (val >= 3.0) return 'hsl(var(--score-green))';
    if (val >= 2.0) return 'hsl(var(--score-amber))';
    return 'hsl(var(--score-red))';
  };

  if (reportStudent && activeBatch) {
    return (
      <StudentReport
        student={reportStudent} batch={activeBatch} students={students}
        attendance={attendance} demoDays={demoDays} demoScores={demoScores}
        modName={profile?.name || ''} onBack={() => setReportStudent(null)}
      />
    );
  }

  const weekSessions = getWeekSessions(selectedWeek);

  const attendanceColor = avgAttendance >= 70 ? 'hsl(var(--score-green))' : avgAttendance >= 50 ? 'hsl(var(--score-amber))' : 'hsl(var(--score-red))';

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <div className="px-6" style={{ background: 'hsl(var(--nav-bg))', borderBottom: '1px solid hsl(var(--nav-border))' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-0">
            {batches.map(batch => (
              <button
                key={batch.id}
                onClick={() => setActiveBatchId(batch.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  batch.id === activeBatchId
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {batch.name}
              </button>
            ))}
            <button onClick={() => setShowCreateBatch(true)} className="px-3 py-3 text-muted-foreground hover:text-foreground text-lg">+</button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium bg-amber-bg text-amber-text">
              {(profile?.name || 'M').slice(0, 2).toUpperCase()}
            </div>
            <span className="text-sm text-foreground">{profile?.name || 'Moderator'}</span>
            <button onClick={signOut} className="text-xs text-muted-foreground hover:text-foreground ml-2">Logout</button>
          </div>
        </div>
      </div>

      {/* Create batch modal */}
      {showCreateBatch && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="p-6 w-full max-w-sm bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10 }}>
            <h2 className="text-lg font-medium text-foreground mb-4">Create new batch</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground">Month</label>
                <select value={newBatchMonth} onChange={(e) => setNewBatchMonth(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 text-sm text-foreground" style={{ border: '1px solid hsl(var(--input-border))', borderRadius: 7, background: 'hsl(var(--input-bg))' }}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Year</label>
                <input type="number" value={newBatchYear} onChange={(e) => setNewBatchYear(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 text-sm text-foreground" style={{ border: '1px solid hsl(var(--input-border))', borderRadius: 7, background: 'hsl(var(--input-bg))' }} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Label</label>
                <input type="text" placeholder="e.g. Beginners" value={newBatchLabel} onChange={(e) => setNewBatchLabel(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-sm text-foreground" style={{ border: '1px solid hsl(var(--input-border))', borderRadius: 7, background: 'hsl(var(--input-bg))' }} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Batch start date (Monday of Week 1)</label>
                <input type="date" value={newBatchStartDate} onChange={(e) => setNewBatchStartDate(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-sm text-foreground" style={{ border: '1px solid hsl(var(--input-border))', borderRadius: 7, background: 'hsl(var(--input-bg))' }} />
              </div>
              {newBatchLabel && (
                <p className="text-xs text-muted-foreground">Batch name: <strong className="text-foreground">{MONTHS[newBatchMonth - 1]} {newBatchYear} · {newBatchLabel}</strong></p>
              )}
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowCreateBatch(false)}
                  className="flex-1 py-2 text-sm text-muted-foreground hover:text-foreground"
                  style={{ border: '1px solid hsl(var(--input-border))', borderRadius: 7, background: 'hsl(var(--input-bg))' }}>Cancel</button>
                <button onClick={createBatch} disabled={!newBatchLabel.trim()}
                  className="flex-1 py-2 bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50" style={{ borderRadius: 7 }}>Create</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="bg-card border-border" style={{ borderRadius: 10, padding: 24 }}>
          <DialogHeader>
            <DialogTitle className="text-foreground" style={{ fontSize: 16 }}>Remove student?</DialogTitle>
            <DialogDescription className="text-muted-foreground" style={{ fontSize: 13 }}>
              This will remove {deleteConfirm?.name || 'this student'} and all their attendance data from this batch. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-4">
            <button onClick={() => setDeleteConfirm(null)}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
              style={{ background: 'hsl(var(--input-bg))', border: '1px solid hsl(var(--input-border))', borderRadius: 7 }}>
              Cancel
            </button>
            <button onClick={() => deleteConfirm && removeStudent(deleteConfirm)}
              className="px-4 py-2 text-sm"
              style={{ background: '#7F1D1D', border: '1px solid #991B1B', color: '#FCA5A5', borderRadius: 7 }}>
              Remove
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {activeBatch ? (
        <div className="p-6 max-w-6xl mx-auto">
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 22, fontWeight: 500 }} className="text-foreground">{totalStudents}</div>
              <div className="text-muted-foreground" style={{ fontSize: 12, marginTop: 2 }}>Students</div>
            </div>
            <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 22, fontWeight: 500, color: attendanceColor }}>{avgAttendance}%</div>
              <div className="text-muted-foreground" style={{ fontSize: 12, marginTop: 2 }}>Avg attendance</div>
            </div>
            <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 22, fontWeight: 500, color: 'hsl(var(--score-amber))' }}>{avgDemoScore || '—'}</div>
              <div className="text-muted-foreground" style={{ fontSize: 12, marginTop: 2 }}>Avg demo score</div>
            </div>
            <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 22, fontWeight: 500 }} className="text-foreground">{sessionsLogged} / {totalSessions}</div>
              <div className="text-muted-foreground" style={{ fontSize: 12, marginTop: 2 }}>Sessions logged</div>
            </div>
          </div>

          {/* Attendance card */}
          <div className="bg-card mb-4" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, padding: '14px 16px' }}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Attendance</h2>
                <p className="text-muted-foreground" style={{ fontSize: 12, marginTop: 2 }}>{activeBatch.name} · {students.length} students</p>
              </div>
              <div className="flex items-center gap-2">
                {savedVisible && (
                  <span className="save-indicator" style={{ fontSize: 11, color: 'hsl(var(--score-green))' }}>✓ Saved</span>
                )}
                <button onClick={() => setAllWeeksView(!allWeeksView)}
                  className="flex items-center gap-1.5 text-xs"
                  style={{
                    padding: '4px 12px', borderRadius: 7,
                    ...(allWeeksView
                      ? { background: 'hsl(var(--foreground))', color: 'hsl(var(--background))', border: '1px solid hsl(var(--foreground))' }
                      : { background: 'hsl(var(--week-btn-bg))', color: 'hsl(var(--week-btn-text))', border: '1px solid hsl(var(--week-btn-border))' })
                  }}>
                  {allWeeksView ? <List className="w-3.5 h-3.5" /> : <Grid3X3 className="w-3.5 h-3.5" />}
                  {allWeeksView ? 'Week view' : 'All weeks'}
                </button>
                <button onClick={addStudent}
                  className="flex items-center gap-1.5 text-xs"
                  style={{ padding: '4px 12px', borderRadius: 7, background: 'hsl(var(--week-btn-bg))', color: 'hsl(var(--week-btn-text))', border: '1px solid hsl(var(--week-btn-border))' }}>
                  <Plus className="w-3.5 h-3.5" /> Add student
                </button>
              </div>
            </div>

            {/* Week selector */}
            {!allWeeksView && (
              <div className="flex gap-2 mb-4">
                {[1, 2, 3, 4, 5, 6].map(w => {
                  const demo = isDemoWeek(w);
                  const selected = w === selectedWeek;
                  let style: React.CSSProperties = { padding: '4px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer' };
                  if (selected && demo) {
                    style = { ...style, background: 'hsl(var(--week-demo-active-bg))', color: 'hsl(var(--week-demo-active-text))', border: '1px solid hsl(var(--week-demo-active-bg))' };
                  } else if (selected) {
                    style = { ...style, background: 'hsl(var(--week-btn-active-bg))', color: 'hsl(var(--week-btn-active-text))', border: '1px solid hsl(var(--week-btn-active-bg))' };
                  } else if (demo) {
                    style = { ...style, background: 'hsl(var(--week-demo-bg))', color: 'hsl(var(--week-demo-text))', border: '1px solid hsl(var(--week-demo-border))' };
                  } else {
                    style = { ...style, background: 'hsl(var(--week-btn-bg))', color: 'hsl(var(--week-btn-text))', border: '1px solid hsl(var(--week-btn-border))' };
                  }
                  return (
                    <button key={w} onClick={() => setSelectedWeek(w)} style={style}>
                      Week {w}{demo ? ' · Demo' : ''}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Empty state */}
            {students.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <span style={{ fontSize: 32, ...emojiStyle }} className="mb-3">👥</span>
                <p className="text-sm text-muted-foreground mb-1">No students yet</p>
                <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }} className="mb-4">Add your first student to get started</p>
                <button onClick={addStudent}
                  className="flex items-center gap-1.5 text-sm font-medium bg-primary text-primary-foreground"
                  style={{ padding: '8px 16px', borderRadius: 7 }}>
                  <Plus className="w-4 h-4" /> Add student
                </button>
              </div>
            ) : allWeeksView ? (
              <div className="overflow-x-auto">
                <table className="text-sm" style={{ tableLayout: 'fixed', width: 'max-content' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid hsl(var(--row-border))' }}>
                      <th className="text-left py-2 font-medium text-muted-foreground sticky left-0 bg-card" style={{ width: 140, fontSize: 12 }}>Student</th>
                      {Array.from({ length: 24 }, (_, i) => {
                        const info = getSessionLabel(i);
                        const dateStr = getSessionDate(i);
                        return (
                          <th key={i} className="text-center py-2 font-medium" style={{
                            width: 48, fontSize: 11,
                            background: info.isDemo ? 'hsl(var(--demo-col-bg))' : 'hsl(var(--grid-header-bg))',
                            color: info.isDemo ? 'hsl(var(--amber-text))' : 'hsl(var(--muted-foreground))',
                            ...(i % 4 === 0 && i > 0 ? { borderLeft: '2px solid hsl(var(--border))' } : {}),
                          }}>
                            <div>{info.day}</div>
                            {dateStr && <div style={{ fontSize: 9, opacity: 0.7 }}>{dateStr}</div>}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map(student => (
                      <tr key={student.id} style={{ borderBottom: '1px solid hsl(var(--row-border))' }}>
                        <td className="py-1 font-medium text-foreground sticky left-0 bg-card" style={{ width: 140, fontSize: 12 }}>{student.name || '(unnamed)'}</td>
                        {Array.from({ length: 24 }, (_, i) => {
                          const info = getSessionLabel(i);
                          return (
                            <td key={i} style={{
                              width: 48,
                              ...(info.isDemo ? { background: 'hsl(var(--demo-col-bg))' } : {}),
                              ...(i % 4 === 0 && i > 0 ? { borderLeft: '2px solid hsl(var(--border))' } : {}),
                            }}>
                              <AttendanceCell state={getAttendanceState(student.id, i)} isDemo={info.isDemo} onClick={() => cycleAttendance(student.id, i)} />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <table className="text-sm" style={{ tableLayout: 'fixed', width: '100%' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid hsl(var(--row-border))' }}>
                    <th className="text-left py-2 font-medium text-muted-foreground" style={{ width: 140, fontSize: 12, background: 'hsl(var(--grid-header-bg))' }}>Student</th>
                    {weekSessions.map(si => {
                      const info = getSessionLabel(si);
                      const dateStr = getSessionDate(si);
                      return (
                        <th key={si} className="text-center py-2 font-medium" style={{
                          fontSize: 12,
                          background: info.isDemo ? 'hsl(var(--demo-col-bg))' : 'hsl(var(--grid-header-bg))',
                          color: info.isDemo ? 'hsl(var(--amber-text))' : 'hsl(var(--muted-foreground))',
                        }}>
                          <div>{info.isDemo ? 'Demo day' : info.day}</div>
                          {dateStr && <div style={{ fontSize: 10, opacity: 0.7 }}>{dateStr}</div>}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {students.map(student => (
                    <tr
                      key={student.id}
                      className="group"
                      style={{ borderBottom: '1px solid hsl(var(--row-border))' }}
                      onMouseEnter={() => setHoveredStudentId(student.id)}
                      onMouseLeave={() => setHoveredStudentId(null)}
                    >
                      <td className="py-1 font-medium text-foreground relative" style={{ width: 140, fontSize: 13 }}>
                        <div className="flex items-center gap-2">
                          {editingStudentId === student.id ? (
                            <input
                              ref={nameInputRef}
                              defaultValue={student.name}
                              onBlur={(e) => updateStudentName(student.id, e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                              className="bg-transparent outline-none text-sm w-24 text-foreground"
                              style={{ borderBottom: '1px solid hsl(var(--foreground))' }}
                              autoFocus
                            />
                          ) : (
                            <span className="cursor-pointer hover:underline" onClick={() => setEditingStudentId(student.id)}>
                              {student.name || '(click to name)'}
                            </span>
                          )}
                          {hoveredStudentId === student.id && (
                            <div className="flex items-center gap-1">
                              <button onClick={() => confirmRemoveStudent(student)} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'hsl(var(--danger-text))' }}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setReportStudent(student)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 hover:text-foreground"
                                style={{ color: 'hsl(var(--muted-foreground))', fontSize: 11 }}>
                                <span style={emojiStyle}>📄</span> Progress
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                      {weekSessions.map(si => {
                        const info = getSessionLabel(si);
                        return (
                          <td key={si} style={{ ...(info.isDemo ? { background: 'hsl(var(--demo-col-bg))' } : {}) }}>
                            <AttendanceCell state={getAttendanceState(student.id, si)} isDemo={info.isDemo} onClick={() => cycleAttendance(student.id, si)} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {students.length > 0 && (
              <>
                {isDemoWeek(selectedWeek) && !allWeeksView && (
                  <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: 'hsl(var(--amber-text))' }}>
                    <span style={emojiStyle}>⭐</span> Demo day attendance marked above · Scores tracked in Demo days section below
                  </div>
                )}
                <button onClick={addStudent} className="mt-3 text-xs text-muted-foreground hover:text-foreground">+ Add student</button>
              </>
            )}
          </div>

          {/* Demo days section */}
          <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, overflow: 'hidden' }}>
            <button
              onClick={() => setDemoDaysExpanded(!demoDaysExpanded)}
              className="w-full flex items-center justify-between"
              style={{ padding: '12px 16px', background: 'hsl(var(--grid-header-bg))', borderTop: '1px solid hsl(var(--border))' }}
            >
              <div className="flex items-center gap-2">
                {demoDaysExpanded ? <ChevronDown className="w-4 h-4 text-foreground" /> : <ChevronRight className="w-4 h-4 text-foreground" />}
                <span style={{ fontWeight: 500, fontSize: 13 }} className="text-foreground">Demo days</span>
                <span style={{ background: 'hsl(var(--pill-success-bg))', color: 'hsl(var(--pill-success-text))', borderRadius: 99, padding: '2px 8px', fontSize: 11 }}>
                  {demoDays.length} days
                </span>
              </div>
              <span className="text-muted-foreground" style={{ fontSize: 13 }}>{activeBatch.name}</span>
            </button>

            {demoDaysExpanded && (
              <div style={{ padding: '0 16px 16px' }} className="space-y-4 mt-4">
                {demoDays.map(dd => (
                  <div key={dd.id} className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, padding: '14px 16px' }}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 style={{ fontWeight: 600, fontSize: 14 }} className="text-foreground">{dd.title}</h3>
                      <span className="text-muted-foreground" style={{ fontSize: 12 }}>
                        {dd.date || '—'} · {students.length} students
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid hsl(var(--row-border))' }}>
                            <th className="text-left py-2 pr-3 font-medium text-muted-foreground" style={{ fontSize: 12, width: 140 }}>Criteria</th>
                            {students.map(s => (
                              <th key={s.id} className="text-center px-2 py-2 font-medium text-muted-foreground" style={{ fontSize: 12 }}>{s.name}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {CRITERIA.map(criterion => (
                            <tr key={criterion} style={{ borderBottom: '1px solid hsl(var(--row-border))' }}>
                              <td className="py-2 pr-3 text-foreground" style={{ fontSize: 12 }}>{criterion}</td>
                              {students.map(s => (
                                <td key={s.id} className="text-center px-2 py-2">
                                  <ScoreInput
                                    value={getScore(dd.id, s.id, criterion)}
                                    onChange={(val) => updateDemoScore(dd.id, s.id, criterion, val)}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                          <tr className="font-medium">
                            <td className="py-2 pr-3 text-foreground" style={{ fontSize: 12 }}>Avg (/ 4)</td>
                            {students.map(s => {
                              const avg = getStudentDemoAvg(dd.id, s.id);
                              return (
                                <td key={s.id} className="text-center px-2 py-2" style={{ fontSize: 12, color: getAvgColor(avg) }}>
                                  {avg}
                                </td>
                              );
                            })}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-96 text-muted-foreground">
          <p>No batches yet. Click "+" to create your first batch.</p>
        </div>
      )}
    </div>
  );
};

export default ModDashboard;
