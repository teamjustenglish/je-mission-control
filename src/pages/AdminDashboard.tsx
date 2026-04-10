import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { BarChart3, Users, BookOpen, Plus, Download, Settings, AlertTriangle, Trash2, Calendar, ChevronRight, ChevronDown, ClipboardList, KeyRound, ArrowLeft, Eye, GraduationCap, Search } from 'lucide-react';
import { getSessionLabel, getWeekSessions, isDemoWeek, MONTHS, CRITERIA } from '@/lib/batchtrack';
import ScoringRubric from '@/components/ScoringRubric';
import StudentProgressModal from '@/components/StudentProgressModal';

interface Profile {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
  last_sign_in?: string | null;
}

interface ActivityLogEntry {
  id: string;
  mod_id: string;
  mod_name: string;
  action_type: string;
  description: string;
  batch_name: string;
  created_at: string;
}

interface LowAttendanceFlag {
  studentName: string;
  batchName: string;
  modName: string;
  pct: number;
}

interface ModCode {
  id: string;
  mod_id: string | null;
  email: string;
  code: string;
  used: boolean;
  created_at: string;
}

interface BatchInfo {
  id: string;
  name: string;
  mod_id: string;
  modName: string;
  studentCount: number;
  attendancePct: number;
  weekNumber: number;
}

interface ModBatchCard {
  id: string;
  name: string;
  label: string;
  month: number;
  year: number;
  start_date: string | null;
  studentCount: number;
  attendancePct: number;
  avgDemoScore: number;
  demoDaysDone: number;
  demoDaysTotal: number;
  weekNumber: number;
  lastUpdated: string | null;
  lastUpdatedBy: string;
}

interface Student { id: string; batch_id: string; name: string; }
interface AttendanceRecord { id: string; student_id: string; batch_id: string; session_index: number; state: string; absence_note?: string | null; }
interface DemoDay { id: string; batch_id: string; title: string; date: string | null; day_number: number; }
interface DemoScore { id: string; demo_day_id: string; student_id: string; criterion: string; score: number; }
interface DemoFeedback { id: string; demo_day_id: string; student_id: string; feedback: string; }
interface RescheduledSession { id: string; batch_id: string; week_number: number; day_name: string; original_date: string | null; new_date: string; reason: string | null; created_by: string; }

const emojiStyle: React.CSSProperties = { fontFamily: '"Apple Color Emoji","Segoe UI Emoji",sans-serif' };

const btnPress = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.transform = 'scale(0.98)'; };
const btnRelease = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.transform = ''; };
const cancelBtnStyle: React.CSSProperties = { background: '#2a2a2a', border: '1px solid #444', color: '#ccc', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'background 0.1s, transform 0.05s' };
const primaryBtnStyle: React.CSSProperties = { background: '#fff', border: '1px solid #fff', color: '#111', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'background 0.1s, transform 0.05s' };
const destructBtnStyle: React.CSSProperties = { background: '#7f1d1d', border: '1px solid #991b1b', color: '#fca5a5', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'background 0.1s, transform 0.05s' };

const AdminDashboard: React.FC = () => {
  const { signOut, profile: currentProfile, session } = useAuth();
  const [activePage, setActivePage] = useState('dashboard');
  const [moderators, setModerators] = useState<Profile[]>([]);
  const [modCodes, setModCodes] = useState<ModCode[]>([]);
  const [batchCount, setBatchCount] = useState(0);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [lowFlags, setLowFlags] = useState<LowAttendanceFlag[]>([]);
  const [avgAttendance, setAvgAttendance] = useState(0);
  const [avgDemoScore, setAvgDemoScore] = useState(0);
  const [runningBatches, setRunningBatches] = useState<BatchInfo[]>([]);
  const [hoveredModId, setHoveredModId] = useState<string | null>(null);

  // Add mod modal
  const [showAddMod, setShowAddMod] = useState(false);
  const [newModName, setNewModName] = useState('');
  const [newModEmail, setNewModEmail] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [generatedModName, setGeneratedModName] = useState('');
  const [addModLoading, setAddModLoading] = useState(false);
  const [addModError, setAddModError] = useState('');

  // Delete mod modal
  const [deleteModConfirm, setDeleteModConfirm] = useState<Profile | null>(null);

  // Activity filter
  const [activityFilter, setActivityFilter] = useState<'today' | '7days' | 'custom'>('7days');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');

  // Inactive mods warning
  const [inactiveMods, setInactiveMods] = useState<Profile[]>([]);

  // FEATURE 1: Expanded mod rows
  const [expandedModId, setExpandedModId] = useState<string | null>(null);
  const [modBatchCards, setModBatchCards] = useState<ModBatchCard[]>([]);
  const [loadingModBatches, setLoadingModBatches] = useState(false);

  // FEATURE 1: Full grid view
  const [gridViewBatch, setGridViewBatch] = useState<{
    batchId: string; batchName: string; modName: string;
    students: Student[]; attendance: AttendanceRecord[]; demoDays: DemoDay[];
    demoScores: DemoScore[]; demoFeedback: DemoFeedback[]; rescheduledSessions: RescheduledSession[];
    startDate: string | null;
  } | null>(null);
  const [gridSelectedWeek, setGridSelectedWeek] = useState(1);
  const [gridAllWeeks, setGridAllWeeks] = useState(false);
  const [gridDemoDaysExpanded, setGridDemoDaysExpanded] = useState(false);

  // Batch data cache for quick grid view loading
  const adminBatchCacheRef = useRef<Record<string, {
    students: Student[]; attendance: AttendanceRecord[]; demoDays: DemoDay[];
    demoScores: DemoScore[]; demoFeedback: DemoFeedback[]; rescheduledSessions: RescheduledSession[];
    startDate: string | null;
  }>>({});

  // FEATURE 2: Reset access modal
  const [resetAccessModal, setResetAccessModal] = useState<{ mod: Profile; code?: string; loading?: boolean; error?: string } | null>(null);

  // FEATURE 3: Credentials modal
  const [credentialsMod, setCredentialsMod] = useState<Profile | null>(null);

  // Students page state
  const [studentSearch, setStudentSearch] = useState('');
  const [allStudentsData, setAllStudentsData] = useState<{ student: Student; batch: any; mod: Profile; weekNumber: number; attendancePct: number; attendance: AttendanceRecord[]; demoDays: DemoDay[]; demoScores: DemoScore[]; demoFeedback: DemoFeedback[] }[]>([]);

  // Student progress modal
  const [progressModalData, setProgressModalData] = useState<{ student: Student; batchName: string; modName: string; weekNumber: number; attendance: AttendanceRecord[]; demoDays: DemoDay[]; demoScores: DemoScore[]; demoFeedback: DemoFeedback[] } | null>(null);

  useEffect(() => { loadData(); }, []);

  // Preload all batch data for admin grid views
  const preloadAllBatchData = useCallback(async (mods: Profile[]) => {
    const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: allBatches } = await supabase.from('batches').select('*').gte('created_at', threeMonthsAgo);
    if (!allBatches || allBatches.length === 0) return;
    const batchIds = allBatches.map(b => b.id);
    const [studentsRes, attendanceRes, demoDaysRes, rescheduledRes] = await Promise.all([
      supabase.from('students').select('*').in('batch_id', batchIds),
      supabase.from('attendance').select('*').in('batch_id', batchIds),
      supabase.from('demo_days').select('*').in('batch_id', batchIds),
      supabase.from('rescheduled_sessions').select('*').in('batch_id', batchIds),
    ]);
    const allStudents = studentsRes.data || [];
    const allAttendance = (attendanceRes.data || []) as AttendanceRecord[];
    const allDemoDays = demoDaysRes.data || [];
    const allRescheduled = (rescheduledRes.data || []) as RescheduledSession[];
    const ddIds = allDemoDays.map(d => d.id);
    let allDemoScores: DemoScore[] = [];
    let allDemoFeedback: DemoFeedback[] = [];
    if (ddIds.length > 0) {
      const [scoresRes, fbRes] = await Promise.all([
        supabase.from('demo_scores').select('*').in('demo_day_id', ddIds),
        supabase.from('demo_feedback').select('*').in('demo_day_id', ddIds),
      ]);
      allDemoScores = scoresRes.data || [];
      allDemoFeedback = (fbRes.data || []) as DemoFeedback[];
    }
    // Cache per batch
    for (const batch of allBatches) {
      adminBatchCacheRef.current[batch.id] = {
        students: allStudents.filter(s => s.batch_id === batch.id),
        attendance: allAttendance.filter(a => a.batch_id === batch.id),
        demoDays: allDemoDays.filter(d => d.batch_id === batch.id),
        demoScores: allDemoScores.filter(s => allDemoDays.filter(d => d.batch_id === batch.id).map(d => d.id).includes(s.demo_day_id)),
        demoFeedback: allDemoFeedback.filter(f => allDemoDays.filter(d => d.batch_id === batch.id).map(d => d.id).includes(f.demo_day_id)),
        rescheduledSessions: allRescheduled.filter(r => r.batch_id === batch.id),
        startDate: batch.start_date || null,
      };
    }
    // Build students data for Students page
    const studentsPageData = allStudents.map(student => {
      const batch = allBatches.find(b => b.id === student.batch_id);
      const mod = mods.find(m => m.id === batch?.mod_id);
      let weekNum = 1;
      if (batch?.start_date) {
        const daysDiff = Math.floor((Date.now() - new Date(batch.start_date).getTime()) / (1000 * 60 * 60 * 24));
        weekNum = Math.min(Math.max(Math.ceil(daysDiff / 7), 1), 6);
      }
      const sessionsPassed = Math.min(weekNum * 4, 24);
      const sAtt = allAttendance.filter(a => a.student_id === student.id);
      const present = sAtt.filter(a => a.state === 'c').length;
      const pct = sessionsPassed > 0 ? Math.round((present / sessionsPassed) * 100) : 0;
      const batchDDs = allDemoDays.filter(d => d.batch_id === student.batch_id);
      const batchDDIds = batchDDs.map(d => d.id);
      return {
        student,
        batch: batch || { name: 'Unknown', label: '' },
        mod: mod || { id: '', email: '', name: 'Unknown', role: 'moderator', created_at: '' } as Profile,
        weekNumber: weekNum,
        attendancePct: pct,
        attendance: allAttendance,
        demoDays: batchDDs,
        demoScores: allDemoScores.filter(s => batchDDIds.includes(s.demo_day_id)),
        demoFeedback: allDemoFeedback.filter(f => batchDDIds.includes(f.demo_day_id)),
      };
    });
    setAllStudentsData(studentsPageData);
  }, []);

  const loadData = useCallback(async () => {
    const { data: mods } = await supabase.from('profiles').select('*').eq('role', 'moderator');
    if (mods) setModerators(mods as Profile[]);

    const { data: codes } = await supabase.from('moderator_codes').select('*').order('created_at', { ascending: false });
    if (codes) setModCodes(codes as ModCode[]);

    const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: allBatches } = await supabase.from('batches').select('*').gte('created_at', threeMonthsAgo);
    setBatchCount(allBatches?.length || 0);

    const activeBatchIds = (allBatches || []).map(b => b.id);

    let allStudents: any[] = [];
    let allAttendance: any[] = [];
    if (activeBatchIds.length > 0) {
      const { data: s } = await supabase.from('students').select('*').in('batch_id', activeBatchIds);
      allStudents = s || [];
      const { data: a } = await supabase.from('attendance').select('*').in('batch_id', activeBatchIds);
      allAttendance = a || [];
    }

    if (allBatches) {
      const batchInfos: BatchInfo[] = [];
      for (const batch of allBatches) {
        const bStudents = allStudents.filter(s => s.batch_id === batch.id);
        if (bStudents.length === 0) continue;
        const bAttendance = allAttendance.filter(a => a.batch_id === batch.id);
        let weekNum = 1;
        if (batch.start_date) {
          const startDate = new Date(batch.start_date);
          const now = new Date();
          const daysDiff = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
          weekNum = Math.min(Math.max(Math.ceil(daysDiff / 7), 1), 6);
        } else {
          const sessionsLogged = new Set(bAttendance.map(a => a.session_index)).size;
          weekNum = Math.min(Math.ceil(sessionsLogged / 4), 6) || 1;
        }
        const sessionsPassed = Math.min(weekNum * 4, 24);
        const totalPossible = bStudents.length * sessionsPassed;
        const present = bAttendance.filter(a => a.state === 'c').length;
        const pct = totalPossible > 0 ? Math.round((present / totalPossible) * 100) : 0;
        const mod = mods?.find(m => m.id === batch.mod_id);
        batchInfos.push({
          id: batch.id, name: batch.name, mod_id: batch.mod_id,
          modName: (mod as any)?.name || 'Unknown',
          studentCount: bStudents.length, attendancePct: pct, weekNumber: weekNum,
        });
      }
      setRunningBatches(batchInfos);

      if (allAttendance.length > 0) {
        const present = allAttendance.filter(a => a.state === 'c').length;
        const total = allAttendance.length;
        setAvgAttendance(total > 0 ? Math.round((present / total) * 100) : 0);
      } else {
        setAvgAttendance(0);
      }

      const flags: LowAttendanceFlag[] = [];
      for (const student of allStudents) {
        const studentAtt = allAttendance.filter(a => a.student_id === student.id);
        if (studentAtt.length === 0) continue;
        const batch = allBatches.find(b => b.id === student.batch_id);
        if (!batch?.start_date) continue;
        const startDate = new Date(batch.start_date);
        const daysDiff = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff < 1) continue;
        const weekNum = Math.min(Math.max(Math.ceil(daysDiff / 7), 1), 6);
        const sessionsPassed = Math.min(weekNum * 4, 24);
        if (sessionsPassed === 0) continue;
        const p = studentAtt.filter(a => a.state === 'c').length;
        const pct = Math.round((p / sessionsPassed) * 100);
        if (pct < 70) {
          const mod = mods?.find(m => m.id === batch?.mod_id);
          flags.push({ studentName: student.name, batchName: batch?.name || '', modName: (mod as any)?.name || '', pct });
        }
      }
      setLowFlags(flags);
    }

    if (activeBatchIds.length > 0) {
      const { data: demoDays } = await supabase.from('demo_days').select('id').in('batch_id', activeBatchIds);
      const demoDayIds = (demoDays || []).map(d => d.id);
      if (demoDayIds.length > 0) {
        const { data: allScores } = await supabase.from('demo_scores').select('score').in('demo_day_id', demoDayIds);
        if (allScores && allScores.length > 0) {
          const avg = allScores.reduce((sum, s) => sum + Number(s.score), 0) / allScores.length;
          setAvgDemoScore(Math.round(avg * 10) / 10);
        } else { setAvgDemoScore(0); }
      } else { setAvgDemoScore(0); }
    } else { setAvgDemoScore(0); }
    // Preload all batch data for grid views
    if (mods) preloadAllBatchData(mods as Profile[]);
  }, [preloadAllBatchData]);

  // Load activity with filter
  useEffect(() => { loadActivity(); }, [activityFilter, customDateFrom, customDateTo, moderators]);

  const loadActivity = async () => {
    let query = supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(50);
    const now = new Date();
    if (activityFilter === 'today') {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      query = query.gte('created_at', todayStart);
    } else if (activityFilter === '7days') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('created_at', weekAgo);
    } else if (activityFilter === 'custom' && customDateFrom) {
      query = query.gte('created_at', customDateFrom + 'T00:00:00Z');
      if (customDateTo) query = query.lte('created_at', customDateTo + 'T23:59:59Z');
    }
    const { data: logs } = await query;
    if (logs) setActivityLog(logs);

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: allLogs } = await supabase.from('activity_log').select('mod_id, created_at').order('created_at', { ascending: false });
    if (allLogs && moderators.length > 0) {
      const modActivity = new Map<string, string>();
      for (const log of allLogs) {
        if (!modActivity.has(log.mod_id)) modActivity.set(log.mod_id, log.created_at);
      }
      const inactive = moderators.filter(m => {
        const latest = modActivity.get(m.id);
        if (!latest) return false;
        return latest < threeDaysAgo;
      });
      setInactiveMods(inactive);
    } else {
      setInactiveMods([]);
    }
  };

  const handleAddModerator = async () => {
    if (!newModEmail.trim() || !newModName.trim()) return;
    setAddModLoading(true);
    setAddModError('');
    setGeneratedCode('');
    try {
      const { data, error } = await supabase.functions.invoke('admin-manage-moderator', {
        body: { action: 'create', email: newModEmail.trim(), name: newModName.trim() },
      });
      if (error) throw error;
      const result = typeof data === 'string' ? JSON.parse(data) : data;
      if (result.error) throw new Error(result.error);
      setGeneratedCode(result.code);
      setGeneratedModName(result.name || newModName.trim());
      loadData();
    } catch (err: any) {
      setAddModError(err.message || 'Failed to create moderator');
    }
    setAddModLoading(false);
  };

  const handleDeleteMod = async (mod: Profile) => {
    setModerators(prev => prev.filter(m => m.id !== mod.id));
    setDeleteModConfirm(null);
    try {
      const { data, error } = await supabase.functions.invoke('admin-manage-moderator', {
        body: { action: 'delete', userId: mod.id },
      });
      if (error) throw error;
      const result = typeof data === 'string' ? JSON.parse(data) : data;
      if (result.error) throw new Error(result.error);
      loadData();
    } catch (err: any) {
      console.error('Delete mod error', err);
      loadData();
      alert(`Failed to remove moderator: ${err.message || 'Unknown error'}`);
    }
  };

  // FEATURE 2: Reset access
  const handleResetAccess = async (mod: Profile) => {
    setResetAccessModal({ mod, loading: true });
    try {
      const { data, error } = await supabase.functions.invoke('admin-manage-moderator', {
        body: { action: 'reset', userId: mod.id, email: mod.email, name: mod.name },
      });
      if (error) throw error;
      const result = typeof data === 'string' ? JSON.parse(data) : data;
      if (result.error) throw new Error(result.error);
      setResetAccessModal({ mod, code: result.code });
      loadData();
    } catch (err: any) {
      setResetAccessModal({ mod, error: err.message || 'Failed to reset access' });
    }
  };

  // FEATURE 1: Load mod batches when expanding
  const toggleModExpanded = async (modId: string) => {
    if (expandedModId === modId) { setExpandedModId(null); return; }
    setExpandedModId(modId);
    setLoadingModBatches(true);
    try {
      const { data: batches } = await supabase.from('batches').select('*').eq('mod_id', modId).order('created_at', { ascending: false });
      if (!batches || batches.length === 0) { setModBatchCards([]); setLoadingModBatches(false); return; }

      const batchIds = batches.map(b => b.id);
      const [studentsRes, attendanceRes, demoDaysRes] = await Promise.all([
        supabase.from('students').select('*').in('batch_id', batchIds),
        supabase.from('attendance').select('*').in('batch_id', batchIds),
        supabase.from('demo_days').select('*').in('batch_id', batchIds),
      ]);
      const allStudents = studentsRes.data || [];
      const allAttendance = attendanceRes.data || [];
      const allDemoDays = demoDaysRes.data || [];

      let allDemoScores: any[] = [];
      const ddIds = allDemoDays.map(d => d.id);
      if (ddIds.length > 0) {
        const { data: scores } = await supabase.from('demo_scores').select('*').in('demo_day_id', ddIds);
        allDemoScores = scores || [];
      }

      // Get last activity for this mod
      const { data: lastActivity } = await supabase.from('activity_log').select('created_at, mod_name').eq('mod_id', modId).order('created_at', { ascending: false }).limit(1);

      const mod = moderators.find(m => m.id === modId);
      const cards: ModBatchCard[] = batches.map(batch => {
        const bStudents = allStudents.filter(s => s.batch_id === batch.id);
        const bAttendance = allAttendance.filter(a => a.batch_id === batch.id);
        const bDemoDays = allDemoDays.filter(d => d.batch_id === batch.id);

        let weekNum = 1;
        if (batch.start_date) {
          const daysDiff = Math.floor((Date.now() - new Date(batch.start_date).getTime()) / (1000 * 60 * 60 * 24));
          weekNum = Math.min(Math.max(Math.ceil(daysDiff / 7), 1), 6);
        }

        const sessionsPassed = Math.min(weekNum * 4, 24);
        const totalPossible = bStudents.length * sessionsPassed;
        const present = bAttendance.filter(a => a.state === 'c').length;
        const attPct = totalPossible > 0 ? Math.round((present / totalPossible) * 100) : 0;

        const bDDIds = bDemoDays.map(d => d.id);
        const bScores = allDemoScores.filter(s => bDDIds.includes(s.demo_day_id));
        const avgScore = bScores.length > 0 ? Math.round((bScores.reduce((sum: number, s: any) => sum + Number(s.score), 0) / bScores.length) * 10) / 10 : 0;
        const demoDaysDone = bDemoDays.filter(dd => bScores.some(s => s.demo_day_id === dd.id)).length;

        return {
          id: batch.id, name: batch.name, label: batch.label,
          month: batch.month, year: batch.year, start_date: batch.start_date || null,
          studentCount: bStudents.length, attendancePct: attPct,
          avgDemoScore: avgScore, demoDaysDone,
          demoDaysTotal: bDemoDays.length, weekNumber: weekNum,
          lastUpdated: lastActivity?.[0]?.created_at || null,
          lastUpdatedBy: lastActivity?.[0]?.mod_name || mod?.name || '',
        };
      });
      setModBatchCards(cards);
    } catch (err) {
      console.error('Failed to load mod batches', err);
      setModBatchCards([]);
    }
    setLoadingModBatches(false);
  };

  // FEATURE 1: Open full grid view (uses cache)
  const openGridView = async (batchId: string, batchName: string, modName: string) => {
    const cached = adminBatchCacheRef.current[batchId];
    if (cached) {
      setGridViewBatch({
        batchId, batchName, modName,
        students: cached.students,
        attendance: cached.attendance,
        demoDays: cached.demoDays,
        demoScores: cached.demoScores,
        demoFeedback: cached.demoFeedback,
        rescheduledSessions: cached.rescheduledSessions,
        startDate: cached.startDate,
      });
      setGridSelectedWeek(1);
      setGridAllWeeks(false);
      setGridDemoDaysExpanded(false);
      return;
    }
    // Fallback: fetch from DB
    const [batchRes, studentsRes, attendanceRes, demoDaysRes, rescheduledRes] = await Promise.all([
      supabase.from('batches').select('*').eq('id', batchId).single(),
      supabase.from('students').select('*').eq('batch_id', batchId).order('created_at'),
      supabase.from('attendance').select('*').eq('batch_id', batchId),
      supabase.from('demo_days').select('*').eq('batch_id', batchId).order('day_number'),
      supabase.from('rescheduled_sessions').select('*').eq('batch_id', batchId),
    ]);
    const fetchedStudents = studentsRes.data || [];
    const fetchedDemoDays = demoDaysRes.data || [];
    let fetchedScores: DemoScore[] = [];
    let fetchedFeedback: DemoFeedback[] = [];
    const ddIds = fetchedDemoDays.map(d => d.id);
    if (ddIds.length > 0) {
      const [scoresRes, fbRes] = await Promise.all([
        supabase.from('demo_scores').select('*').in('demo_day_id', ddIds),
        supabase.from('demo_feedback').select('*').in('demo_day_id', ddIds),
      ]);
      fetchedScores = scoresRes.data || [];
      fetchedFeedback = (fbRes.data || []) as DemoFeedback[];
    }
    setGridViewBatch({
      batchId, batchName, modName,
      students: fetchedStudents,
      attendance: (attendanceRes.data || []) as AttendanceRecord[],
      demoDays: fetchedDemoDays,
      demoScores: fetchedScores,
      demoFeedback: fetchedFeedback,
      rescheduledSessions: (rescheduledRes.data || []) as RescheduledSession[],
      startDate: batchRes.data?.start_date || null,
    });
    setGridSelectedWeek(1);
    setGridAllWeeks(false);
    setGridDemoDaysExpanded(false);
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} mins ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const getActionBadge = (type: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      attendance_marked: { bg: '#1a3a1a', text: '#4ade80', label: 'attendance' },
      demo_score_added: { bg: '#2a2000', text: '#fbbf24', label: 'demo scores' },
      absence_note_added: { bg: '#2a1a3a', text: '#c084fc', label: 'absence note' },
      student_added: { bg: '#1a2a3a', text: '#60a5fa', label: 'new student' },
      student_removed: { bg: '#2a2a2a', text: '#888', label: 'removed' },
      batch_created: { bg: '#1a2a3a', text: '#60a5fa', label: 'new batch' },
      session_rescheduled: { bg: '#2a1f00', text: '#f97316', label: 'rescheduled' },
      report_exported: { bg: '#1a2a2a', text: '#22d3ee', label: 'report' },
      batch_edited: { bg: '#2a2a2a', text: '#888', label: 'edited' },
      batch_deleted: { bg: '#2a2a2a', text: '#888', label: 'deleted' },
    };
    return map[type] || { bg: '#2a2a2a', text: '#888', label: type };
  };

  const sidebarItems = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3, section: 'OVERVIEW' },
    { id: 'moderators', label: 'Moderators', icon: Users, section: 'OVERVIEW' },
    { id: 'batches', label: 'All batches', icon: BookOpen, section: 'OVERVIEW' },
    { id: 'export', label: 'Export all', icon: Download, section: 'TOOLS' },
    { id: 'settings', label: 'Settings', icon: Settings, section: 'TOOLS' },
  ];

  const getInitials = (name: string) => name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '?';

  const getModAvatarColor = (modId: string) => {
    const colors = [
      { bg: '#2a1f00', text: '#fbbf24' },
      { bg: '#1a2a3a', text: '#60a5fa' },
      { bg: '#2a1a3a', text: '#c084fc' },
      { bg: '#1a3a1a', text: '#4ade80' },
      { bg: '#3a1a1a', text: '#f87171' },
      { bg: '#1a2a2a', text: '#22d3ee' },
    ];
    let hash = 0;
    for (let i = 0; i < modId.length; i++) hash = ((hash << 5) - hash) + modId.charCodeAt(i);
    return colors[Math.abs(hash) % colors.length];
  };

  const attColor = avgAttendance >= 70 ? '#4ade80' : avgAttendance >= 50 ? '#fbbf24' : '#f87171';

  const getModStatus = (mod: Profile): { status: 'pending' | 'active' | 'inactive'; label: string; bg: string; text: string } => {
    const code = modCodes.find(c => c.mod_id === mod.id);
    if (code && !code.used) return { status: 'pending', label: 'pending', bg: '#2a2000', text: '#fbbf24' };
    if (mod.last_sign_in) {
      const diff = Date.now() - new Date(mod.last_sign_in).getTime();
      if (diff < 7 * 24 * 60 * 60 * 1000) return { status: 'active', label: 'active', bg: '#1a3a1a', text: '#4ade80' };
    }
    return { status: 'inactive', label: 'inactive', bg: '#2a2a2a', text: '#888' };
  };

  const getModLastActive = (mod: Profile): string => {
    const code = modCodes.find(c => c.mod_id === mod.id);
    if (code && !code.used) return 'Never logged in';
    if (mod.last_sign_in) return `Last active: ${timeAgo(mod.last_sign_in)}`;
    return 'Never logged in';
  };

  // Grid view helpers
  const getGridSessionDate = (sessionIndex: number): string | null => {
    if (!gridViewBatch?.startDate) return null;
    const start = new Date(gridViewBatch.startDate);
    const week = Math.floor(sessionIndex / 4);
    const dayInWeek = sessionIndex % 4;
    const dayOffsets = [0, 1, 3, 4];
    const date = new Date(start);
    date.setDate(start.getDate() + week * 7 + dayOffsets[dayInWeek]);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  const getGridAttState = (studentId: string, sessionIndex: number): string => {
    return gridViewBatch?.attendance.find(a => a.student_id === studentId && a.session_index === sessionIndex)?.state || 'e';
  };

  const getGridScore = (demoDayId: string, studentId: string, criterion: string): number => {
    return gridViewBatch?.demoScores.find(s => s.demo_day_id === demoDayId && s.student_id === studentId && s.criterion === criterion)?.score || 0;
  };

  const getGridTotal = (demoDayId: string, studentId: string): string => {
    if (!gridViewBatch) return '—';
    const scores = gridViewBatch.demoScores.filter(s => s.demo_day_id === demoDayId && s.student_id === studentId && Number(s.score) > 0);
    if (scores.length === 0) return '—';
    const total = scores.reduce((sum, s) => sum + Number(s.score), 0);
    return (Math.round(total * 10) / 10).toString();
  };

  const getTotalColor = (totalStr: string): string => {
    if (totalStr === '—') return '#888';
    const val = parseFloat(totalStr);
    if (val >= 16) return '#4ade80';
    if (val >= 12) return '#fbbf24';
    return '#f87171';
  };

  const getGridRescheduled = (sessionIndex: number): RescheduledSession | undefined => {
    if (!gridViewBatch) return undefined;
    const info = getSessionLabel(sessionIndex);
    const week = Math.floor(sessionIndex / 4) + 1;
    return gridViewBatch.rescheduledSessions.find(r => r.week_number === week && r.day_name === (info.isDemo ? 'Demo day' : info.day));
  };

  // FULL GRID VIEW
  if (gridViewBatch) {
    const { students, demoDays, demoScores: gScores, demoFeedback: gFeedback } = gridViewBatch;
    const weekSessions = getWeekSessions(gridSelectedWeek);

    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <button onClick={() => setGridViewBatch(null)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" /> Back to moderators
            </button>
            <span className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-full" style={{ background: '#1a2a3a', color: '#60a5fa', border: '1px solid #2a3a4a' }}>
              <Eye className="w-3.5 h-3.5" /> Read-only view
            </span>
          </div>

          <h2 className="text-lg font-semibold text-foreground mb-1">{gridViewBatch.batchName}</h2>
          <p className="text-sm text-muted-foreground mb-6">{gridViewBatch.modName} · {students.length} students</p>

          {/* Attendance */}
          <div className="bg-card mb-4" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, padding: '14px 16px' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">Attendance</h3>
              <button onClick={() => setGridAllWeeks(!gridAllWeeks)} className="text-xs px-3 py-1 rounded"
                style={{ background: gridAllWeeks ? '#fff' : '#2a2a2a', color: gridAllWeeks ? '#111' : '#888', border: '1px solid #444' }}>
                {gridAllWeeks ? 'Week view' : 'All weeks'}
              </button>
            </div>
            {!gridAllWeeks && (
              <div className="flex gap-2 mb-4">
                {[1, 2, 3, 4, 5, 6].map(w => (
                  <button key={w} onClick={() => setGridSelectedWeek(w)}
                    style={{
                      padding: '4px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                      background: w === gridSelectedWeek ? '#fff' : '#2a2a2a',
                      color: w === gridSelectedWeek ? '#111' : '#888',
                      border: `1px solid ${w === gridSelectedWeek ? '#fff' : '#333'}`,
                    }}>Week {w}{isDemoWeek(w) ? ' · Demo' : ''}</button>
                ))}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="text-sm" style={{ tableLayout: 'fixed', width: gridAllWeeks ? 'max-content' : '100%' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid hsl(var(--row-border))' }}>
                    <th className="text-left py-2 font-medium text-muted-foreground" style={{ width: 140, minWidth: 140, fontSize: 12 }}>Student</th>
                    {(gridAllWeeks ? Array.from({ length: 24 }, (_, i) => i) : weekSessions).map(si => {
                      const info = getSessionLabel(si);
                      const rescheduled = getGridRescheduled(si);
                      const dateStr = getGridSessionDate(si);
                      const newDateStr = rescheduled ? new Date(rescheduled.new_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null;
                      return (
                        <th key={si} className="text-center py-2 font-medium" style={{
                          fontSize: 12,
                          background: rescheduled ? '#1e1800' : info.isDemo ? 'hsl(var(--demo-col-bg))' : 'hsl(var(--grid-header-bg))',
                          color: rescheduled ? '#d4920a' : info.isDemo ? 'hsl(var(--amber-text))' : 'hsl(var(--muted-foreground))',
                        }}>
                          {info.isDemo ? 'Demo day' : info.day}
                          {rescheduled ? (
                            <div style={{ fontSize: 10, opacity: 0.8 }}>{newDateStr}<br /><span style={{ fontSize: 9 }}>↻</span></div>
                          ) : dateStr && <div style={{ fontSize: 10, opacity: 0.7 }}>{dateStr}</div>}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {students.map(student => (
                    <tr key={student.id} style={{ borderBottom: '1px solid hsl(var(--row-border))' }}>
                      <td className="py-1 font-medium text-foreground" style={{ fontSize: 12 }}>{student.name || '(unnamed)'}</td>
                      {(gridAllWeeks ? Array.from({ length: 24 }, (_, i) => i) : weekSessions).map(si => {
                        const info = getSessionLabel(si);
                        const state = getGridAttState(student.id, si);
                        const rescheduled = getGridRescheduled(si);
                        return (
                          <td key={si} className="text-center py-2" style={{
                            ...(rescheduled ? { background: '#1e1800' } : info.isDemo ? { background: 'hsl(var(--demo-col-bg))' } : {}),
                            ...(gridAllWeeks && si % 4 === 0 && si > 0 ? { borderLeft: '2px solid hsl(var(--border))' } : {}),
                          }}>
                            {rescheduled ? (
                              <span style={{ fontSize: 15, fontWeight: 700, color: '#d4920a' }}>↻</span>
                            ) : state === 'c' ? (
                              <span style={emojiStyle} className="text-[18px]">✅</span>
                            ) : state === 'x' ? (
                              <span style={emojiStyle} className="text-[18px]">❌</span>
                            ) : (
                              <div className="w-[22px] h-[22px] rounded-[5px] mx-auto" style={{
                                border: info.isDemo ? '1.5px solid hsl(var(--amber-border))' : '1.5px solid hsl(var(--checkbox-border))',
                              }} />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Demo days */}
          <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, overflow: 'hidden' }}>
            <button onClick={() => setGridDemoDaysExpanded(!gridDemoDaysExpanded)} className="w-full flex items-center justify-between"
              style={{ padding: '12px 16px', background: 'hsl(var(--grid-header-bg))' }}>
              <div className="flex items-center gap-2">
                {gridDemoDaysExpanded ? <ChevronDown className="w-4 h-4 text-foreground" /> : <ChevronRight className="w-4 h-4 text-foreground" />}
                <span style={{ fontWeight: 500, fontSize: 13 }} className="text-foreground">Demo days</span>
                <span style={{ background: 'hsl(var(--pill-success-bg))', color: 'hsl(var(--pill-success-text))', borderRadius: 99, padding: '2px 8px', fontSize: 11 }}>
                  {demoDays.length} days
                </span>
              </div>
            </button>
            {gridDemoDaysExpanded && (
              <div style={{ padding: '0 16px 16px' }} className="space-y-4 mt-4">
                {demoDays.map(dd => (
                  <div key={dd.id} className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, overflow: 'hidden' }}>
                    <div className="flex items-center justify-between" style={{ padding: '14px 16px' }}>
                      <h3 style={{ fontWeight: 600, fontSize: 14 }} className="text-foreground">{dd.title}</h3>
                      <span className="text-muted-foreground" style={{ fontSize: 12 }}>{dd.date || '—'} · {students.length} students</span>
                    </div>
                    <ScoringRubric />
                    <div className="overflow-x-auto" style={{ padding: '0 16px 14px' }}>
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
                              {students.map(s => {
                                const score = getGridScore(dd.id, s.id, criterion);
                                return (
                                  <td key={s.id} className="text-center px-2 py-2" style={{ fontSize: 12, color: '#e8e8e8' }}>
                                    {score || '—'}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                          <tr className="font-medium" style={{ borderBottom: '1px solid hsl(var(--row-border))' }}>
                            <td className="py-2 pr-3 text-foreground" style={{ fontSize: 12 }}>Total (/ 20)</td>
                            {students.map(s => {
                              const total = getGridTotal(dd.id, s.id);
                              return <td key={s.id} className="text-center px-2 py-2" style={{ fontSize: 12, fontWeight: 700, color: getTotalColor(total) }}>{total}</td>;
                            })}
                          </tr>
                          <tr>
                            <td className="py-2 pr-3 text-foreground" style={{ fontSize: 12 }}>Individual feedback</td>
                            {students.map(s => {
                              const fb = gFeedback.find(f => f.demo_day_id === dd.id && f.student_id === s.id);
                              return (
                                <td key={s.id} className="text-center px-2 py-2">
                                  {fb?.feedback ? (
                                    <div style={{ fontSize: 11, color: '#888', maxWidth: 120, margin: '0 auto', textAlign: 'left', lineHeight: 1.4 }}>
                                      {fb.feedback.slice(0, 80)}{fb.feedback.length > 80 ? '…' : ''}
                                    </div>
                                  ) : (
                                    <span style={{ fontSize: 11, color: '#555', fontStyle: 'italic' }}>—</span>
                                  )}
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
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <div className="w-52 flex flex-col p-4" style={{ background: 'hsl(var(--sidebar-background))', borderRight: '1px solid hsl(var(--border))' }}>
        <h1 className="text-base font-semibold text-foreground mb-6">Mission Control</h1>
        {['OVERVIEW', 'TOOLS'].map(section => (
          <div key={section} className="mb-4">
            <p className="text-[10px] font-semibold text-muted-foreground tracking-widest uppercase mb-2">{section}</p>
            {sidebarItems.filter(i => i.section === section).map(item => (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md mb-0.5 transition-colors ${
                  activePage === item.id ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </button>
            ))}
          </div>
        ))}
        <div className="mt-4">
          <button onClick={signOut} className="text-xs text-muted-foreground hover:text-foreground mt-2">Logout</button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 p-6 overflow-y-auto">
        {activePage === 'dashboard' && (
          <>
            <div className="flex items-center justify-end mb-6">
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-1 rounded" style={{ background: '#1a3a1a', color: '#4ade80' }}>Admin</span>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium" style={{ background: '#2a1f00', color: '#fbbf24' }}>
                  {getInitials(currentProfile?.name || 'A')}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 22, fontWeight: 500 }} className="text-foreground">{moderators.length}</div>
                <div className="text-muted-foreground" style={{ fontSize: 12 }}>Moderators</div>
              </div>
              <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 22, fontWeight: 500 }} className="text-foreground">{batchCount}</div>
                <div className="text-muted-foreground" style={{ fontSize: 12 }}>Running batches</div>
              </div>
              <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 22, fontWeight: 500, color: attColor }}>{avgAttendance}%</div>
                <div className="text-muted-foreground" style={{ fontSize: 12 }}>Avg attendance</div>
              </div>
              <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 22, fontWeight: 500, color: '#fbbf24' }}>{avgDemoScore || '—'}</div>
                <div className="text-muted-foreground" style={{ fontSize: 12 }}>Avg demo score</div>
              </div>
            </div>

            {/* Running batches + Low attendance */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, padding: '14px 16px' }}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-foreground">Running batches</h2>
                  <span className="text-sm text-muted-foreground">{runningBatches.length} batches</span>
                </div>
                <div className="space-y-3">
                  {runningBatches.map(batch => {
                    const barColor = batch.attendancePct >= 70 ? '#4ade80' : batch.attendancePct >= 50 ? '#fbbf24' : '#f87171';
                    return (
                      <div key={batch.id}>
                        <div className="flex items-center justify-between mb-1">
                          <div>
                            <p className="text-sm font-medium text-foreground">{batch.name}</p>
                            <p className="text-xs text-muted-foreground">{batch.modName} · Week {batch.weekNumber} of 6 · {batch.studentCount} students</p>
                          </div>
                          <span className="text-sm font-medium" style={{ color: barColor }}>{batch.attendancePct}%</span>
                        </div>
                        <div style={{ height: 4, borderRadius: 2, background: '#2a2a2a' }}>
                          <div style={{ height: '100%', width: `${batch.attendancePct}%`, borderRadius: 2, background: barColor, transition: 'width 0.3s' }} />
                        </div>
                      </div>
                    );
                  })}
                  {runningBatches.length === 0 && <p className="text-sm text-muted-foreground">No running batches</p>}
                </div>
              </div>

              <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, padding: '14px 16px' }}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-foreground">Low attendance flags</h2>
                  <span style={{ color: '#f87171' }} className="text-sm">{lowFlags.length} students</span>
                </div>
                <div className="space-y-3">
                  {lowFlags.map((flag, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="w-4 h-4" style={{ color: flag.pct >= 50 ? '#fbbf24' : '#f87171' }} />
                        <div>
                          <p className="text-sm font-medium text-foreground">{flag.studentName}</p>
                          <p className="text-xs text-muted-foreground">{flag.batchName} · {flag.modName}</p>
                        </div>
                      </div>
                      <span className="text-sm font-medium" style={{ color: flag.pct >= 50 ? '#fbbf24' : '#f87171' }}>{flag.pct}%</span>
                    </div>
                  ))}
                  {lowFlags.length === 0 && <p className="text-sm text-muted-foreground">No low attendance flags</p>}
                </div>
                {lowFlags.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-4" style={{ fontStyle: 'italic' }}>Flagged when below 70% of sessions attended so far</p>
                )}
              </div>
            </div>

            {/* Activity feed */}
            <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, padding: '14px 16px' }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-foreground">Recent activity</h2>
                <div className="flex items-center gap-2">
                  {(['today', '7days', 'custom'] as const).map(f => (
                    <button key={f} onClick={() => setActivityFilter(f)}
                      style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                        background: activityFilter === f ? '#fff' : '#2a2a2a',
                        color: activityFilter === f ? '#111' : '#888',
                        border: `1px solid ${activityFilter === f ? '#fff' : '#333'}`,
                        fontWeight: activityFilter === f ? 600 : 400,
                      }}>
                      {f === 'today' ? 'Today' : f === '7days' ? 'Last 7 days' : 'Custom'}
                    </button>
                  ))}
                </div>
              </div>
              {activityFilter === 'custom' && (
                <div className="flex items-center gap-2 mb-4">
                  <input type="date" value={customDateFrom} onChange={(e) => setCustomDateFrom(e.target.value)}
                    style={{ background: '#242424', border: '1px solid #333', borderRadius: 6, padding: '4px 8px', fontSize: 12, color: '#F0F0F0' }} />
                  <span className="text-xs text-muted-foreground">to</span>
                  <input type="date" value={customDateTo} onChange={(e) => setCustomDateTo(e.target.value)}
                    style={{ background: '#242424', border: '1px solid #333', borderRadius: 6, padding: '4px 8px', fontSize: 12, color: '#F0F0F0' }} />
                </div>
              )}
              <div>
                {activityLog.map(entry => {
                  const badge = getActionBadge(entry.action_type);
                  const avatarColor = getModAvatarColor(entry.mod_id);
                  return (
                    <div key={entry.id} className="flex items-start gap-3 py-3" style={{ borderBottom: '1px solid hsl(var(--row-border))' }}>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5"
                        style={{ background: avatarColor.bg, color: avatarColor.text }}>
                        {getInitials(entry.mod_name || '?')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">
                          <span className="font-medium">{entry.mod_name}</span>{' '}
                          {entry.description}{' '}
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: badge.bg, color: badge.text }}>{badge.label}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">{entry.batch_name} · {timeAgo(entry.created_at)}</p>
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">{formatTime(entry.created_at)}</span>
                    </div>
                  );
                })}
                {activityLog.length === 0 && (
                  <div className="text-center py-8">
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                    <p style={{ fontSize: 14, color: '#888' }}>No activity yet</p>
                    <p style={{ fontSize: 12, color: '#555' }}>Activity will appear here as moderators use the app</p>
                  </div>
                )}
              </div>
              {inactiveMods.length > 0 && (
                <div className="mt-4 space-y-1" style={{ borderTop: '1px solid hsl(var(--row-border))', paddingTop: 12 }}>
                  {inactiveMods.map(mod => (
                    <p key={mod.id} style={{ fontSize: 12, color: '#fbbf24' }}>
                      ⚠️ {mod.name || mod.email} has not logged any activity in the last 3 days
                    </p>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {activePage === 'moderators' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">All Moderators</h2>
              <button onClick={() => { setShowAddMod(true); setGeneratedCode(''); setNewModEmail(''); setNewModName(''); setAddModError(''); }}
                className="flex items-center gap-1.5 text-sm font-medium"
                style={{ padding: '8px 16px', borderRadius: 7, background: '#fff', color: '#111' }}>
                <Plus className="w-4 h-4" /> Add moderator
              </button>
            </div>
            <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10 }}>
              {moderators.map(mod => {
                const statusInfo = getModStatus(mod);
                const code = modCodes.find(c => c.mod_id === mod.id);
                const avatarColor = getModAvatarColor(mod.id);
                const isExpanded = expandedModId === mod.id;
                return (
                  <div key={mod.id}>
                    <div className="flex items-center justify-between p-4 cursor-pointer" style={{ borderBottom: '1px solid hsl(var(--row-border))' }}
                      onClick={() => toggleModExpanded(mod.id)}
                      onMouseEnter={() => setHoveredModId(mod.id)} onMouseLeave={() => setHoveredModId(null)}>
                      <div className="flex items-center gap-3">
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                        <div className="relative">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium"
                            style={{ background: avatarColor.bg, color: avatarColor.text }}>
                            {getInitials(mod.name || mod.email)}
                          </div>
                          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card"
                            style={{ background: statusInfo.text }} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{mod.name || mod.email}</p>
                          <p className="text-xs text-muted-foreground">{mod.email}</p>
                          <p className="text-xs text-muted-foreground" style={{ fontSize: 11 }}>{getModLastActive(mod)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs px-2 py-0.5 rounded" style={{ background: statusInfo.bg, color: statusInfo.text }}>{statusInfo.label}</span>
                        {code && !code.used && (
                          <span className="text-xs font-mono text-muted-foreground">{code.code}</span>
                        )}
                        <span className="text-xs text-muted-foreground">Joined {new Date(mod.created_at).toLocaleDateString()}</span>
                        {hoveredModId === mod.id && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => setCredentialsMod(mod)} title="Account details"
                              style={{ color: '#888', background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>
                              <ClipboardList className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleResetAccess(mod)} title="Reset access"
                              style={{ color: '#fbbf24', background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>
                              <KeyRound className="w-4 h-4" />
                            </button>
                            <button onClick={() => setDeleteModConfirm(mod)} title="Delete moderator"
                              style={{ color: '#f87171', background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Expanded batch cards */}
                    {isExpanded && (
                      <div style={{ background: '#0e0e0e', padding: '16px 20px', borderBottom: '1px solid hsl(var(--row-border))' }}>
                        {loadingModBatches ? (
                          <p className="text-sm text-muted-foreground">Loading batches…</p>
                        ) : modBatchCards.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No batches found for this moderator.</p>
                        ) : (
                          <div className="grid grid-cols-2 gap-4">
                            {modBatchCards.map(card => {
                              const attColor = card.attendancePct >= 70 ? '#4ade80' : card.attendancePct >= 50 ? '#fbbf24' : '#f87171';
                              const scoreColor = card.avgDemoScore >= 14 ? '#4ade80' : card.avgDemoScore >= 10 ? '#fbbf24' : '#f87171';
                              const lastUpdateDiff = card.lastUpdated ? Date.now() - new Date(card.lastUpdated).getTime() : Infinity;
                              const dotColor = lastUpdateDiff < 24 * 60 * 60 * 1000 ? '#4ade80' : lastUpdateDiff < 7 * 24 * 60 * 60 * 1000 ? '#fbbf24' : '#555';
                              return (
                                <div key={card.id} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: 16 }}>
                                  <div className="mb-3">
                                    <p className="text-sm font-medium text-foreground">{card.name}</p>
                                    <p className="text-xs text-muted-foreground">Week {card.weekNumber} of 6</p>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 mb-3">
                                    <div style={{ background: '#242424', borderRadius: 8, padding: '8px 10px' }}>
                                      <div style={{ fontSize: 16, fontWeight: 600 }} className="text-foreground">{card.studentCount}</div>
                                      <div style={{ fontSize: 10, color: '#888' }}>Students</div>
                                    </div>
                                    <div style={{ background: '#242424', borderRadius: 8, padding: '8px 10px' }}>
                                      <div style={{ fontSize: 16, fontWeight: 600, color: attColor }}>{card.attendancePct}%</div>
                                      <div style={{ fontSize: 10, color: '#888' }}>Attendance</div>
                                    </div>
                                    <div style={{ background: '#242424', borderRadius: 8, padding: '8px 10px' }}>
                                      <div style={{ fontSize: 16, fontWeight: 600, color: scoreColor }}>{card.avgDemoScore || '—'}</div>
                                      <div style={{ fontSize: 10, color: '#888' }}>Avg demo score</div>
                                    </div>
                                    <div style={{ background: '#242424', borderRadius: 8, padding: '8px 10px' }}>
                                      <div style={{ fontSize: 16, fontWeight: 600 }} className="text-foreground">{card.demoDaysDone} / {card.demoDaysTotal}</div>
                                      <div style={{ fontSize: 10, color: '#888' }}>Demo days done</div>
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor }} />
                                      <span style={{ fontSize: 10, color: '#666' }}>
                                        {card.lastUpdated ? `Last updated ${timeAgo(card.lastUpdated)} by ${card.lastUpdatedBy}` : 'No activity'}
                                      </span>
                                    </div>
                                    <button onClick={() => openGridView(card.id, card.name, mod.name || mod.email)}
                                      style={{ fontSize: 11, color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer' }}>
                                      View full grid →
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Add moderator modal */}
        {showAddMod && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}
            onClick={() => setShowAddMod(false)}>
            <div onClick={(e) => e.stopPropagation()}
              style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 10, padding: 24, maxWidth: 380, width: '100%' }}>
              {generatedCode ? (
                <>
                  <div style={{ fontSize: 14, color: '#F0F0F0', fontWeight: 500, marginBottom: 8 }}>Moderator added</div>
                  <p style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>
                    Moderator <strong style={{ color: '#F0F0F0' }}>{generatedModName}</strong> has been added. Share this code with them to activate their account:
                  </p>
                  <div style={{ background: '#242424', border: '1px solid #333', borderRadius: 8, padding: '12px 16px', textAlign: 'center', marginBottom: 12, cursor: 'pointer' }}
                    onClick={() => navigator.clipboard.writeText(generatedCode)}>
                    <span style={{ fontSize: 22, fontFamily: 'monospace', fontWeight: 700, color: '#d4920a', letterSpacing: 3 }}>{generatedCode}</span>
                    <p style={{ fontSize: 10, color: '#555', marginTop: 4 }}>Click to copy</p>
                  </div>
                  <p style={{ fontSize: 11, color: '#555', marginBottom: 16 }}>
                    This code is unique to {newModEmail} and can only be used once.
                  </p>
                  <button onClick={() => setShowAddMod(false)}
                    style={{ ...cancelBtnStyle, width: '100%' }}
                    onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#333'; e.currentTarget.style.color = '#fff'; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = '#2a2a2a'; e.currentTarget.style.color = '#ccc'; }}>
                    Done
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 14, color: '#F0F0F0', fontWeight: 500, marginBottom: 4 }}>Add moderator</div>
                  <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Enter their details. An access code will be generated for them.</p>
                  {addModError && (
                    <div style={{ fontSize: 12, color: '#f87171', background: '#2a0a0a', padding: '8px 10px', borderRadius: 6, marginBottom: 8 }}>
                      {addModError}
                    </div>
                  )}
                  <input type="text" value={newModName} onChange={(e) => setNewModName(e.target.value)}
                    placeholder="e.g. Amelia"
                    style={{ width: '100%', background: '#242424', border: '1px solid #333', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: '#F0F0F0', outline: 'none', marginBottom: 8 }} />
                  <input type="email" value={newModEmail} onChange={(e) => setNewModEmail(e.target.value)}
                    placeholder="e.g. amelia@school.com"
                    style={{ width: '100%', background: '#242424', border: '1px solid #333', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: '#F0F0F0', outline: 'none', marginBottom: 12 }} />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowAddMod(false)}
                      style={cancelBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#333'; e.currentTarget.style.color = '#fff'; }}
                      onMouseOut={(e) => { e.currentTarget.style.background = '#2a2a2a'; e.currentTarget.style.color = '#ccc'; }}>
                      Cancel
                    </button>
                    <button onClick={handleAddModerator} disabled={addModLoading || !newModEmail.trim() || !newModName.trim()}
                      style={{ ...primaryBtnStyle, opacity: addModLoading || !newModEmail.trim() || !newModName.trim() ? 0.5 : 1 }}
                      onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#e8e8e8'; }}
                      onMouseOut={(e) => { e.currentTarget.style.background = '#fff'; }}>
                      {addModLoading ? 'Creating…' : 'Create moderator'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Delete moderator confirmation */}
        {deleteModConfirm && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setDeleteModConfirm(null)}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 10, padding: 24, maxWidth: 400, width: '100%' }}>
              <div style={{ fontSize: 16, color: '#F0F0F0', fontWeight: 500, marginBottom: 8 }}>Remove moderator?</div>
              <div style={{ fontSize: 13, color: '#888', lineHeight: 1.5 }}>
                This will remove <span style={{ color: '#f87171' }}>{deleteModConfirm.name || deleteModConfirm.email}</span> ({deleteModConfirm.email}) from Mission Control. They will immediately lose access. Their batch data will not be deleted.
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setDeleteModConfirm(null)}
                  style={cancelBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#333'; e.currentTarget.style.color = '#fff'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = '#2a2a2a'; e.currentTarget.style.color = '#ccc'; }}>Cancel</button>
                <button onClick={() => { const m = deleteModConfirm; setDeleteModConfirm(null); handleDeleteMod(m); }}
                  style={destructBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#991b1b'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = '#7f1d1d'; }}>Remove moderator</button>
              </div>
            </div>
          </div>
        )}

        {/* FEATURE 2: Reset access modal */}
        {resetAccessModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}
            onClick={() => setResetAccessModal(null)}>
            <div onClick={(e) => e.stopPropagation()}
              style={{ background: '#1e1e1e', border: '1px solid #2e2e2e', borderRadius: 14, padding: 28, maxWidth: 420, width: '90%' }}>
              {resetAccessModal.loading ? (
                <p className="text-sm text-muted-foreground">Generating new access code…</p>
              ) : resetAccessModal.error ? (
                <>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Reset failed</div>
                  <p style={{ fontSize: 13, color: '#f87171', marginBottom: 16 }}>{resetAccessModal.error}</p>
                  <button onClick={() => setResetAccessModal(null)} style={cancelBtnStyle}>Close</button>
                </>
              ) : resetAccessModal.code ? (
                <>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 8 }}>New access code generated</div>
                  <p style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>
                    Share this code with <strong style={{ color: '#F0F0F0' }}>{resetAccessModal.mod.name}</strong> — they can use it to reset their password.
                  </p>
                  <div style={{ background: '#242424', border: '1px solid #333', borderRadius: 8, padding: '12px 16px', textAlign: 'center', marginTop: 12, marginBottom: 12, cursor: 'pointer' }}
                    onClick={() => navigator.clipboard.writeText(resetAccessModal.code!)}>
                    <span style={{ fontSize: 22, fontFamily: 'monospace', fontWeight: 700, color: '#d4920a', letterSpacing: 3 }}>{resetAccessModal.code}</span>
                    <p style={{ fontSize: 10, color: '#555', marginTop: 4 }}>Click to copy</p>
                  </div>
                  <button onClick={() => setResetAccessModal(null)}
                    style={{ ...cancelBtnStyle, width: '100%' }}
                    onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}>
                    Done
                  </button>
                </>
              ) : null}
            </div>
          </div>
        )}

        {/* FEATURE 3: Credentials modal */}
        {credentialsMod && (() => {
          const mod = credentialsMod;
          const statusInfo = getModStatus(mod);
          const code = modCodes.find(c => c.mod_id === mod.id && !c.used);
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}
              onClick={() => setCredentialsMod(null)}>
              <div onClick={(e) => e.stopPropagation()}
                style={{ background: '#1e1e1e', border: '1px solid #2e2e2e', borderRadius: 14, padding: 28, maxWidth: 420, width: '90%' }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 20 }}>
                  {mod.name || mod.email} · Account details
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 12, color: '#888' }}>Email</span>
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 13, color: '#e8e8e8' }}>{mod.email}</span>
                      <button onClick={() => navigator.clipboard.writeText(mod.email)}
                        style={{ fontSize: 10, color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer' }}>copy</button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 12, color: '#888' }}>Status</span>
                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: statusInfo.bg, color: statusInfo.text }}>{statusInfo.label}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 12, color: '#888' }}>Joined</span>
                    <span style={{ fontSize: 13, color: '#e8e8e8' }}>{new Date(mod.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 12, color: '#888' }}>Access code</span>
                    {code ? (
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: 13, fontFamily: 'monospace', color: '#d4920a' }}>{code.code}</span>
                        <button onClick={() => navigator.clipboard.writeText(code.code)}
                          style={{ fontSize: 10, color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer' }}>copy</button>
                        <span style={{ fontSize: 10, color: '#fbbf24', fontStyle: 'italic' }}>Not yet activated</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: '#4ade80' }}>Account activated</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 12, color: '#888' }}>Last active</span>
                    <span style={{ fontSize: 13, color: '#e8e8e8' }}>
                      {mod.last_sign_in ? timeAgo(mod.last_sign_in) : 'Never logged in'}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between mt-6">
                  <button onClick={() => { setCredentialsMod(null); handleResetAccess(mod); }}
                    style={{ fontSize: 12, color: '#fbbf24', background: 'none', border: '1px solid #444', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>
                    <KeyRound className="w-3.5 h-3.5 inline mr-1" style={{ verticalAlign: 'middle' }} />
                    Reset access
                  </button>
                  <button onClick={() => setCredentialsMod(null)}
                    style={cancelBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#333'; e.currentTarget.style.color = '#fff'; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = '#2a2a2a'; e.currentTarget.style.color = '#ccc'; }}>Close</button>
                </div>
              </div>
            </div>
          );
        })()}

        {activePage === 'settings' && (
          <div className="max-w-md">
            <h2 className="text-lg font-semibold text-foreground mb-4">Settings</h2>
            <p className="text-sm text-muted-foreground">Moderators are now added via the Moderators page with access codes.</p>
          </div>
        )}

        {activePage === 'batches' && (
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">All Batches</h2>
            <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10 }}>
              {runningBatches.map(batch => {
                const barColor = batch.attendancePct >= 70 ? '#4ade80' : batch.attendancePct >= 50 ? '#fbbf24' : '#f87171';
                return (
                  <div key={batch.id} className="p-4" style={{ borderBottom: '1px solid hsl(var(--row-border))' }}>
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <p className="text-sm font-medium text-foreground">{batch.name}</p>
                        <p className="text-xs text-muted-foreground">{batch.modName} · {batch.studentCount} students · Week {batch.weekNumber} of 6</p>
                      </div>
                      <span className="text-sm font-medium" style={{ color: barColor }}>{batch.attendancePct}%</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: '#2a2a2a' }}>
                      <div style={{ height: '100%', width: `${batch.attendancePct}%`, borderRadius: 2, background: barColor }} />
                    </div>
                  </div>
                );
              })}
              {runningBatches.length === 0 && <p className="text-sm text-muted-foreground p-4">No batches yet.</p>}
            </div>
          </div>
        )}

        {activePage === 'export' && (
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">Export All</h2>
            <p className="text-sm text-muted-foreground">Export functionality coming soon.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
