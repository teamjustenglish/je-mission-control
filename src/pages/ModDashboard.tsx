import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { logActivity, getSessionLabel, getWeekSessions, isDemoWeek, MONTHS, CRITERIA } from '@/lib/batchtrack';
import { Plus, Trash2, ChevronDown, ChevronRight, Grid3X3, List } from 'lucide-react';
import StudentReport from '@/components/StudentReport';

interface Batch {
  id: string;
  name: string;
  mod_id: string;
  month: number;
  year: number;
  label: string;
}

interface Student {
  id: string;
  batch_id: string;
  name: string;
}

interface AttendanceRecord {
  id: string;
  student_id: string;
  batch_id: string;
  session_index: number;
  state: string;
}

interface DemoDay {
  id: string;
  batch_id: string;
  title: string;
  date: string | null;
  day_number: number;
}

interface DemoScore {
  id: string;
  demo_day_id: string;
  student_id: string;
  criterion: string;
  score: number;
}

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
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [hoveredStudentId, setHoveredStudentId] = useState<string | null>(null);
  const [reportStudent, setReportStudent] = useState<Student | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const activeBatch = batches.find(b => b.id === activeBatchId);

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
      // Load scores for all demo days
      const ddIds = demoDaysRes.data.map(d => d.id);
      if (ddIds.length > 0) {
        const { data: scores } = await supabase.from('demo_scores').select('*').in('demo_day_id', ddIds);
        if (scores) setDemoScores(scores);
      }
    }
  }, [activeBatchId]);

  useEffect(() => { loadBatches(); }, [loadBatches]);
  useEffect(() => { loadBatchData(); }, [loadBatchData]);

  const createBatch = async () => {
    if (!user || !newBatchLabel.trim()) return;
    const monthName = MONTHS[newBatchMonth - 1];
    const batchName = `${monthName} ${newBatchYear} · ${newBatchLabel.trim()}`;
    const { data } = await supabase.from('batches').insert({
      mod_id: user.id,
      name: batchName,
      month: newBatchMonth,
      year: newBatchYear,
      label: newBatchLabel.trim(),
    }).select().single();

    if (data) {
      // Create 3 demo days
      await supabase.from('demo_days').insert([
        { batch_id: data.id, title: 'Demo day 01', day_number: 1 },
        { batch_id: data.id, title: 'Demo day 02', day_number: 2 },
        { batch_id: data.id, title: 'Demo day 03', day_number: 3 },
      ]);
      await logActivity(user.id, profile?.name || '', 'batch_created', `Created batch ${batchName}`, batchName);
      setShowCreateBatch(false);
      setNewBatchLabel('');
      setActiveBatchId(data.id);
      loadBatches();
    }
  };

  const addStudent = async () => {
    if (!activeBatchId || !user) return;
    const { data } = await supabase.from('students').insert({
      batch_id: activeBatchId,
      name: '',
    }).select().single();
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

  const removeStudent = async (student: Student) => {
    await supabase.from('students').delete().eq('id', student.id);
    setStudents(prev => prev.filter(s => s.id !== student.id));
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
        student_id: studentId,
        batch_id: activeBatchId,
        session_index: sessionIndex,
        state: newState,
      }).select().single();
      if (data) setAttendance(prev => [...prev, data]);
    }

    if (user && activeBatch) {
      const week = Math.floor(sessionIndex / 4) + 1;
      await logActivity(user.id, profile?.name || '', 'attendance_marked', `Marked Week ${week} attendance`, activeBatch.name);
    }
  };

  const getAttendanceState = (studentId: string, sessionIndex: number): string => {
    return attendance.find(a => a.student_id === studentId && a.session_index === sessionIndex)?.state || 'e';
  };

  const renderAttendanceCell = (state: string, isDemo: boolean) => {
    const emojiStyle = { fontFamily: '"Apple Color Emoji","Segoe UI Emoji",sans-serif' };
    if (state === 'c') return <span style={emojiStyle} className="text-lg">✅</span>;
    if (state === 'x') return <span style={emojiStyle} className="text-lg">❌</span>;
    return (
      <div className={`w-5 h-5 rounded border-2 ${isDemo ? 'border-amber-border' : 'border-border'}`} />
    );
  };

  // Stats calculations
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
    attendance.forEach(a => {
      if (a.state !== 'e') loggedSessions.add(a.session_index);
    });
    return loggedSessions.size;
  })();

  const updateDemoScore = async (demoDayId: string, studentId: string, criterion: string, score: number) => {
    const existing = demoScores.find(s => s.demo_day_id === demoDayId && s.student_id === studentId && s.criterion === criterion);
    if (existing) {
      await supabase.from('demo_scores').update({ score }).eq('id', existing.id);
      setDemoScores(prev => prev.map(s => s.id === existing.id ? { ...s, score } : s));
    } else {
      const { data } = await supabase.from('demo_scores').insert({
        demo_day_id: demoDayId,
        student_id: studentId,
        criterion,
        score,
      }).select().single();
      if (data) setDemoScores(prev => [...prev, data]);
    }
    if (user && activeBatch) {
      await logActivity(user.id, profile?.name || '', 'demo_score_added', `Added Demo day scores`, activeBatch.name);
    }
  };

  const getScore = (demoDayId: string, studentId: string, criterion: string): number => {
    return demoScores.find(s => s.demo_day_id === demoDayId && s.student_id === studentId && s.criterion === criterion)?.score || 0;
  };

  const getStudentDemoAvg = (demoDayId: string, studentId: string): number => {
    const scores = demoScores.filter(s => s.demo_day_id === demoDayId && s.student_id === studentId);
    if (scores.length === 0) return 0;
    return Math.round((scores.reduce((sum, s) => sum + Number(s.score), 0) / scores.length) * 10) / 10;
  };

  if (reportStudent && activeBatch) {
    return (
      <StudentReport
        student={reportStudent}
        batch={activeBatch}
        students={students}
        attendance={attendance}
        demoDays={demoDays}
        demoScores={demoScores}
        modName={profile?.name || ''}
        onBack={() => setReportStudent(null)}
      />
    );
  }

  const weekSessions = getWeekSessions(selectedWeek);

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav with batch tabs */}
      <div className="bg-card border-b border-border px-6">
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
            <button
              onClick={() => setShowCreateBatch(true)}
              className="px-3 py-3 text-muted-foreground hover:text-foreground text-lg"
            >
              +
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-bg text-amber-text flex items-center justify-center text-xs font-medium">
              {(profile?.name || 'M').slice(0, 2).toUpperCase()}
            </div>
            <span className="text-sm text-foreground">{profile?.name || 'Moderator'}</span>
            <button onClick={signOut} className="text-xs text-muted-foreground hover:text-foreground ml-2">Logout</button>
          </div>
        </div>
      </div>

      {/* Create batch modal */}
      {showCreateBatch && (
        <div className="fixed inset-0 bg-foreground/20 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border border-border p-6 w-full max-w-sm">
            <h2 className="text-lg font-medium text-foreground mb-4">Create new batch</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground">Month</label>
                <select
                  value={newBatchMonth}
                  onChange={(e) => setNewBatchMonth(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 border border-border rounded-md text-sm bg-card text-foreground"
                >
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Year</label>
                <input
                  type="number"
                  value={newBatchYear}
                  onChange={(e) => setNewBatchYear(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 border border-border rounded-md text-sm bg-card text-foreground"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Label</label>
                <input
                  type="text"
                  placeholder="e.g. Beginners"
                  value={newBatchLabel}
                  onChange={(e) => setNewBatchLabel(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-border rounded-md text-sm bg-card text-foreground"
                />
              </div>
              {newBatchLabel && (
                <p className="text-xs text-muted-foreground">
                  Batch name: <strong>{MONTHS[newBatchMonth - 1]} {newBatchYear} · {newBatchLabel}</strong>
                </p>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowCreateBatch(false)}
                  className="flex-1 py-2 border border-border rounded-md text-sm text-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={createBatch}
                  disabled={!newBatchLabel.trim()}
                  className="flex-1 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeBatch ? (
        <div className="p-6 max-w-6xl mx-auto">
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Students', value: totalStudents, color: '' },
              { label: 'Avg attendance', value: `${avgAttendance}%`, color: 'text-success-text' },
              { label: 'Avg demo score', value: avgDemoScore || '—', color: 'text-amber-text' },
              { label: 'Sessions logged', value: `${sessionsLogged} / ${totalSessions}`, color: '' },
            ].map(stat => (
              <div key={stat.label} className="bg-card border border-border rounded-lg p-4">
                <div className={`text-xl font-medium ${stat.color}`}>{stat.value}</div>
                <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Attendance card */}
          <div className="bg-card border border-border rounded-lg p-5 mb-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">Attendance</h2>
                <p className="text-sm text-muted-foreground">{activeBatch.name} · {students.length} students</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setAllWeeksView(!allWeeksView)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-md ${
                    allWeeksView ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-foreground hover:bg-muted'
                  }`}
                >
                  {allWeeksView ? <List className="w-3.5 h-3.5" /> : <Grid3X3 className="w-3.5 h-3.5" />}
                  {allWeeksView ? 'Week view' : 'All weeks'}
                </button>
                <button
                  onClick={addStudent}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-md text-foreground hover:bg-muted"
                >
                  <Plus className="w-3.5 h-3.5" /> Add student
                </button>
              </div>
            </div>

            {/* Week selector */}
            {!allWeeksView && (
              <div className="flex gap-2 mb-4">
                {[1, 2, 3, 4, 5, 6].map(w => (
                  <button
                    key={w}
                    onClick={() => setSelectedWeek(w)}
                    className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                      w === selectedWeek
                        ? isDemoWeek(w)
                          ? 'bg-amber-bg text-amber-text border-amber-border'
                          : 'bg-primary text-primary-foreground border-primary'
                        : isDemoWeek(w)
                          ? 'border-amber-border text-amber-text hover:bg-amber-bg'
                          : 'border-border text-foreground hover:bg-muted'
                    }`}
                  >
                    Week {w}{isDemoWeek(w) ? ' · Demo' : ''}
                  </button>
                ))}
              </div>
            )}

            {/* Attendance table */}
            {allWeeksView ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground sticky left-0 bg-card">Student</th>
                      {Array.from({ length: 24 }, (_, i) => {
                        const info = getSessionLabel(i);
                        return (
                          <th
                            key={i}
                            className={`text-center px-2 py-2 font-medium text-xs min-w-[48px] ${
                              info.isDemo ? 'bg-amber-bg text-amber-text' : 'text-muted-foreground'
                            } ${i % 4 === 0 && i > 0 ? 'border-l-2 border-border' : ''}`}
                          >
                            {info.day}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map(student => (
                      <tr key={student.id} className="border-b border-border">
                        <td className="py-2 pr-4 font-medium text-foreground sticky left-0 bg-card">{student.name || '(unnamed)'}</td>
                        {Array.from({ length: 24 }, (_, i) => {
                          const info = getSessionLabel(i);
                          return (
                            <td
                              key={i}
                              className={`text-center px-2 py-2 cursor-pointer ${
                                info.isDemo ? 'bg-amber-bg' : ''
                              } ${i % 4 === 0 && i > 0 ? 'border-l-2 border-border' : ''}`}
                              onClick={() => cycleAttendance(student.id, i)}
                            >
                              {renderAttendanceCell(getAttendanceState(student.id, i), info.isDemo)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground w-32">Student</th>
                    {weekSessions.map(si => {
                      const info = getSessionLabel(si);
                      return (
                        <th
                          key={si}
                          className={`text-center py-2 px-4 font-medium ${
                            info.isDemo ? 'bg-amber-bg text-amber-text' : 'text-muted-foreground'
                          }`}
                        >
                          {info.day}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {students.map(student => (
                    <tr
                      key={student.id}
                      className="border-b border-border group"
                      onMouseEnter={() => setHoveredStudentId(student.id)}
                      onMouseLeave={() => setHoveredStudentId(null)}
                    >
                      <td className="py-3 pr-4 font-medium text-foreground relative">
                        <div className="flex items-center gap-2">
                          {editingStudentId === student.id ? (
                            <input
                              ref={nameInputRef}
                              defaultValue={student.name}
                              onBlur={(e) => updateStudentName(student.id, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                              }}
                              className="border-b border-foreground bg-transparent outline-none text-sm w-24"
                              autoFocus
                            />
                          ) : (
                            <span
                              className="cursor-pointer hover:underline"
                              onClick={() => setEditingStudentId(student.id)}
                            >
                              {student.name || '(click to name)'}
                            </span>
                          )}
                          {hoveredStudentId === student.id && (
                            <div className="flex gap-1">
                              <button
                                onClick={() => removeStudent(student)}
                                className="text-danger-text opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setReportStudent(student)}
                                className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity text-xs hover:text-foreground"
                              >
                                Export
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                      {weekSessions.map(si => {
                        const info = getSessionLabel(si);
                        return (
                          <td
                            key={si}
                            className={`text-center py-3 px-4 cursor-pointer ${info.isDemo ? 'bg-amber-bg' : ''}`}
                            onClick={() => cycleAttendance(student.id, si)}
                          >
                            {renderAttendanceCell(getAttendanceState(student.id, si), info.isDemo)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <button
              onClick={addStudent}
              className="mt-3 text-sm text-muted-foreground hover:text-foreground"
            >
              + Add student
            </button>
          </div>

          {/* Demo days section */}
          <div className="bg-card border border-border rounded-lg">
            <button
              onClick={() => setDemoDaysExpanded(!demoDaysExpanded)}
              className="w-full flex items-center justify-between p-4"
            >
              <div className="flex items-center gap-2">
                {demoDaysExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <span className="font-medium text-foreground">Demo days</span>
                <span className="text-xs px-2 py-0.5 bg-amber-bg text-amber-text rounded-full border border-amber-border">
                  {demoDays.length} days
                </span>
              </div>
              <span className="text-sm text-muted-foreground">{activeBatch.name}</span>
            </button>

            {demoDaysExpanded && (
              <div className="px-4 pb-4 space-y-4">
                {demoDays.map(dd => {
                  const ddStudents = students.filter(s => {
                    // Students who appeared on the demo day (attendance 'c' for that session)
                    const demoSessionIndex = (dd.day_number * 2 - 1) * 4 + 3; // week 2,4,6 Friday
                    const att = getAttendanceState(s.id, demoSessionIndex);
                    return att === 'c' || demoScores.some(ds => ds.demo_day_id === dd.id && ds.student_id === s.id);
                  });
                  const displayStudents = ddStudents.length > 0 ? ddStudents : students;

                  return (
                    <div key={dd.id} className="border border-border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-foreground">{dd.title}</h3>
                        <span className="text-sm text-muted-foreground">
                          {dd.date || '—'} · {displayStudents.length} students
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Criteria</th>
                              {displayStudents.map(s => (
                                <th key={s.id} className="text-center px-2 py-2 text-muted-foreground font-medium min-w-[60px]">
                                  {s.name}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {CRITERIA.map(criterion => (
                              <tr key={criterion} className="border-b border-border">
                                <td className="py-2 pr-3 text-foreground">{criterion}</td>
                                {displayStudents.map(s => (
                                  <td key={s.id} className="text-center px-2 py-2">
                                    <input
                                      type="number"
                                      min={0}
                                      max={4}
                                      step={0.5}
                                      value={getScore(dd.id, s.id, criterion) || ''}
                                      onChange={(e) => updateDemoScore(dd.id, s.id, criterion, Number(e.target.value))}
                                      className="w-12 text-center border border-border rounded px-1 py-0.5 text-sm bg-card text-foreground"
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))}
                            <tr className="font-medium">
                              <td className="py-2 pr-3 text-foreground">Avg (/ 4)</td>
                              {displayStudents.map(s => (
                                <td key={s.id} className="text-center px-2 py-2 text-foreground">
                                  {getStudentDemoAvg(dd.id, s.id) || '—'}
                                </td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
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
