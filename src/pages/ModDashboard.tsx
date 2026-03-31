import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { logActivity, getSessionLabel, getWeekSessions, isDemoWeek, MONTHS, CRITERIA } from '@/lib/batchtrack';
import { Plus, Trash2, ChevronDown, ChevronRight, Grid3X3, List } from 'lucide-react';
import StudentReport from '@/components/StudentReport';

interface Batch { id: string; name: string; mod_id: string; month: number; year: number; label: string; }
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
          border: isDemo ? '1.5px solid #FDE68A' : '1.5px solid #ddd',
          background: 'transparent',
        }}
      />
    )}
  </div>
);

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
        student_id: studentId, batch_id: activeBatchId, session_index: sessionIndex, state: newState,
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
    if (user && activeBatch) {
      await logActivity(user.id, profile?.name || '', 'demo_score_added', `Added Demo day scores`, activeBatch.name);
    }
  };

  const getScore = (demoDayId: string, studentId: string, criterion: string): number => {
    return demoScores.find(s => s.demo_day_id === demoDayId && s.student_id === studentId && s.criterion === criterion)?.score || 0;
  };

  // Fix #10: avg divides by 6 always, shows — if no scores at all
  const getStudentDemoAvg = (demoDayId: string, studentId: string): string => {
    const scores = demoScores.filter(s => s.demo_day_id === demoDayId && s.student_id === studentId && Number(s.score) > 0);
    if (scores.length === 0) return '—';
    const total = scores.reduce((sum, s) => sum + Number(s.score), 0);
    return (Math.round((total / 6) * 10) / 10).toString();
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

  // Attendance color for stats
  const attendanceColor = avgAttendance >= 70 ? '#16a34a' : avgAttendance >= 50 ? '#b45309' : '#dc2626';

  return (
    <div className="min-h-screen" style={{ background: '#F5F5F3' }}>
      {/* Top nav */}
      <div style={{ background: '#fff', borderBottom: '0.5px solid #E5E5E3' }} className="px-6">
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
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium" style={{ background: '#FFFBEB', color: '#92400E' }}>
              {(profile?.name || 'M').slice(0, 2).toUpperCase()}
            </div>
            <span className="text-sm text-foreground">{profile?.name || 'Moderator'}</span>
            <button onClick={signOut} className="text-xs text-muted-foreground hover:text-foreground ml-2">Logout</button>
          </div>
        </div>
      </div>

      {/* Create batch modal */}
      {showCreateBatch && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div style={{ background: '#fff', border: '0.5px solid #E5E5E3', borderRadius: 10 }} className="p-6 w-full max-w-sm">
            <h2 className="text-lg font-medium text-foreground mb-4">Create new batch</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground">Month</label>
                <select value={newBatchMonth} onChange={(e) => setNewBatchMonth(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 text-sm text-foreground" style={{ border: '0.5px solid #E5E5E3', borderRadius: 7, background: '#fff' }}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Year</label>
                <input type="number" value={newBatchYear} onChange={(e) => setNewBatchYear(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 text-sm text-foreground" style={{ border: '0.5px solid #E5E5E3', borderRadius: 7, background: '#fff' }} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Label</label>
                <input type="text" placeholder="e.g. Beginners" value={newBatchLabel} onChange={(e) => setNewBatchLabel(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-sm text-foreground" style={{ border: '0.5px solid #E5E5E3', borderRadius: 7, background: '#fff' }} />
              </div>
              {newBatchLabel && (
                <p className="text-xs text-muted-foreground">Batch name: <strong>{MONTHS[newBatchMonth - 1]} {newBatchYear} · {newBatchLabel}</strong></p>
              )}
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowCreateBatch(false)}
                  className="flex-1 py-2 text-sm text-foreground hover:bg-muted" style={{ border: '0.5px solid #E5E5E3', borderRadius: 7 }}>Cancel</button>
                <button onClick={createBatch} disabled={!newBatchLabel.trim()}
                  className="flex-1 py-2 bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50" style={{ borderRadius: 7 }}>Create</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeBatch ? (
        <div className="p-6 max-w-6xl mx-auto">
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div style={{ background: '#fff', border: '0.5px solid #E5E5E3', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 22, fontWeight: 500 }} className="text-foreground">{totalStudents}</div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>Students</div>
            </div>
            <div style={{ background: '#fff', border: '0.5px solid #E5E5E3', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 22, fontWeight: 500, color: attendanceColor }}>{avgAttendance}%</div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>Avg attendance</div>
            </div>
            <div style={{ background: '#fff', border: '0.5px solid #E5E5E3', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 22, fontWeight: 500, color: '#b45309' }}>{avgDemoScore || '—'}</div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>Avg demo score</div>
            </div>
            <div style={{ background: '#fff', border: '0.5px solid #E5E5E3', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 22, fontWeight: 500 }} className="text-foreground">{sessionsLogged} / {totalSessions}</div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>Sessions logged</div>
            </div>
          </div>

          {/* Attendance card */}
          <div style={{ background: '#fff', border: '0.5px solid #E5E5E3', borderRadius: 10, padding: '14px 16px' }} className="mb-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Attendance</h2>
                <p style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{activeBatch.name} · {students.length} students</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setAllWeeksView(!allWeeksView)}
                  className="flex items-center gap-1.5 text-xs"
                  style={{
                    padding: '4px 12px', borderRadius: 7,
                    ...(allWeeksView
                      ? { background: '#1a1a1a', color: '#fff', border: '0.5px solid #1a1a1a' }
                      : { background: '#fff', color: '#666', border: '0.5px solid #ddd' })
                  }}>
                  {allWeeksView ? <List className="w-3.5 h-3.5" /> : <Grid3X3 className="w-3.5 h-3.5" />}
                  {allWeeksView ? 'Week view' : 'All weeks'}
                </button>
                <button onClick={addStudent}
                  className="flex items-center gap-1.5 text-xs"
                  style={{ padding: '4px 12px', borderRadius: 7, background: '#fff', color: '#666', border: '0.5px solid #ddd' }}>
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
                    style = { ...style, background: '#92400E', color: '#fff', border: '0.5px solid #92400E' };
                  } else if (selected) {
                    style = { ...style, background: '#1a1a1a', color: '#fff', border: '0.5px solid #1a1a1a' };
                  } else if (demo) {
                    style = { ...style, background: '#FFFBEB', color: '#92400E', border: '0.5px solid #FDE68A' };
                  } else {
                    style = { ...style, background: '#fff', color: '#666', border: '0.5px solid #ddd' };
                  }
                  return (
                    <button key={w} onClick={() => setSelectedWeek(w)} style={style}>
                      Week {w}{demo ? ' · Demo' : ''}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Attendance table */}
            {allWeeksView ? (
              <div className="overflow-x-auto">
                <table className="text-sm" style={{ tableLayout: 'fixed', width: 'max-content' }}>
                  <thead>
                    <tr style={{ borderBottom: '0.5px solid #E5E5E3' }}>
                      <th className="text-left py-2 font-medium text-muted-foreground sticky left-0" style={{ width: 140, background: '#fff', fontSize: 12 }}>Student</th>
                      {Array.from({ length: 24 }, (_, i) => {
                        const info = getSessionLabel(i);
                        return (
                          <th key={i} className="text-center py-2 font-medium" style={{
                            width: 48, fontSize: 11,
                            ...(info.isDemo ? { background: '#FFFBEB', color: '#92400E' } : { color: '#999' }),
                            ...(i % 4 === 0 && i > 0 ? { borderLeft: '2px solid #E5E5E3' } : {}),
                          }}>
                            {info.day}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map(student => (
                      <tr key={student.id} style={{ borderBottom: '0.5px solid #E5E5E3' }}>
                        <td className="py-1 font-medium text-foreground sticky left-0" style={{ width: 140, background: '#fff', fontSize: 12 }}>{student.name || '(unnamed)'}</td>
                        {Array.from({ length: 24 }, (_, i) => {
                          const info = getSessionLabel(i);
                          return (
                            <td key={i} style={{
                              width: 48,
                              ...(info.isDemo ? { background: '#FFFBEB' } : {}),
                              ...(i % 4 === 0 && i > 0 ? { borderLeft: '2px solid #E5E5E3' } : {}),
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
                  <tr style={{ borderBottom: '0.5px solid #E5E5E3' }}>
                    <th className="text-left py-2 font-medium" style={{ width: 140, fontSize: 12, color: '#999' }}>Student</th>
                    {weekSessions.map(si => {
                      const info = getSessionLabel(si);
                      return (
                        <th key={si} className="text-center py-2 font-medium" style={{
                          fontSize: 12,
                          ...(info.isDemo ? { background: '#FFFBEB', color: '#92400E' } : { color: '#999' }),
                        }}>
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
                      className="group"
                      style={{ borderBottom: '0.5px solid #E5E5E3' }}
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
                              className="bg-transparent outline-none text-sm w-24"
                              style={{ borderBottom: '1px solid #1a1a1a' }}
                              autoFocus
                            />
                          ) : (
                            <span className="cursor-pointer hover:underline" onClick={() => setEditingStudentId(student.id)}>
                              {student.name || '(click to name)'}
                            </span>
                          )}
                          {hoveredStudentId === student.id && (
                            <div className="flex gap-1">
                              <button onClick={() => removeStudent(student)} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#991B1B' }}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setReportStudent(student)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-xs hover:text-foreground" style={{ color: '#999' }}>
                                Export
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                      {weekSessions.map(si => {
                        const info = getSessionLabel(si);
                        return (
                          <td key={si} style={{ ...(info.isDemo ? { background: '#FFFBEB' } : {}) }}>
                            <AttendanceCell state={getAttendanceState(student.id, si)} isDemo={info.isDemo} onClick={() => cycleAttendance(student.id, si)} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <button onClick={addStudent} className="mt-3 text-xs hover:text-foreground" style={{ color: '#999' }}>+ Add student</button>
          </div>

          {/* Demo days section */}
          <div style={{ background: '#fff', border: '0.5px solid #E5E5E3', borderRadius: 10, overflow: 'hidden' }}>
            <button
              onClick={() => setDemoDaysExpanded(!demoDaysExpanded)}
              className="w-full flex items-center justify-between"
              style={{ padding: '12px 16px', background: '#FAFAFA' }}
            >
              <div className="flex items-center gap-2">
                {demoDaysExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <span style={{ fontWeight: 500, fontSize: 13 }} className="text-foreground">Demo days</span>
                <span style={{ background: '#DCFCE7', color: '#166534', borderRadius: 99, padding: '2px 8px', fontSize: 11 }}>
                  {demoDays.length} days
                </span>
              </div>
              <span style={{ fontSize: 13, color: '#999' }}>{activeBatch.name}</span>
            </button>

            {demoDaysExpanded && (
              <div style={{ padding: '0 16px 16px' }} className="space-y-4">
                {demoDays.map(dd => (
                  <div key={dd.id} style={{ border: '0.5px solid #E5E5E3', borderRadius: 10, padding: '14px 16px' }}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 style={{ fontWeight: 600, fontSize: 14 }} className="text-foreground">{dd.title}</h3>
                      <span style={{ fontSize: 12, color: '#999' }}>
                        {dd.date || '—'} · {students.length} students
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                        <thead>
                          <tr style={{ borderBottom: '0.5px solid #E5E5E3' }}>
                            <th className="text-left py-2 pr-3 font-medium" style={{ fontSize: 12, color: '#999', width: 140 }}>Criteria</th>
                            {students.map(s => (
                              <th key={s.id} className="text-center px-2 py-2 font-medium" style={{ fontSize: 12, color: '#999' }}>{s.name}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {CRITERIA.map(criterion => (
                            <tr key={criterion} style={{ borderBottom: '0.5px solid #E5E5E3' }}>
                              <td className="py-2 pr-3 text-foreground" style={{ fontSize: 12 }}>{criterion}</td>
                              {students.map(s => (
                                <td key={s.id} className="text-center px-2 py-2">
                                  <input
                                    type="number"
                                    min={0} max={4} step={0.5}
                                    value={getScore(dd.id, s.id, criterion) || ''}
                                    onChange={(e) => updateDemoScore(dd.id, s.id, criterion, Number(e.target.value))}
                                    className="score-input"
                                    style={{
                                      width: 44, textAlign: 'center', fontSize: 12, padding: '3px 6px',
                                      border: '0.5px solid #E5E5E3', borderRadius: 5, background: '#fff',
                                      MozAppearance: 'textfield', outline: 'none',
                                    }}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                          <tr className="font-medium">
                            <td className="py-2 pr-3 text-foreground" style={{ fontSize: 12 }}>Avg (/ 4)</td>
                            {students.map(s => (
                              <td key={s.id} className="text-center px-2 py-2 text-foreground" style={{ fontSize: 12 }}>
                                {getStudentDemoAvg(dd.id, s.id)}
                              </td>
                            ))}
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
