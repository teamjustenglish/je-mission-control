import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { BarChart3, Users, BookOpen, Plus, Download, Settings, Trash2, Calendar, ChevronRight, ChevronDown, ClipboardList, ArrowLeft, Eye, GraduationCap, Search, Sparkles, Megaphone, Link2, Copy, Check, XCircle, Activity, UsersRound } from 'lucide-react';
import { getSessionLabel, getWeekSessions, isDemoWeek, MONTHS, CRITERIA, getSessionsOccurred, computeAttendancePct, getCurrentWeek } from '@/lib/batchtrack';

import StudentProgressModal from '@/components/StudentProgressModal';
import ModDashboard from './ModDashboard';
import HoustonPage from './admin/HoustonPage';
import HoustonUsagePage from './admin/HoustonUsagePage';
import ModeratorUsagePage from './admin/ModeratorUsagePage';
import AnnouncementsPage from './admin/AnnouncementsPage';
import AnalyticsDashboard from './admin/AnalyticsDashboard';

interface Profile {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
  last_sign_in?: string | null;
  avatar_url?: string | null;
}

interface ModCode {
  id: string;
  mod_id: string | null;
  email: string;
  code: string;
  used: boolean;
  created_at: string;
}

interface ModInvite {
  id: string;
  token: string;
  description: string | null;
  created_by: string;
  created_at: string;
  uses: number;
  revoked_at: string | null;
}

interface ModBatchCard {
  id: string;
  name: string;
  month: number;
  year: number;
  start_date: string | null;
  studentCount: number;
  attendancePct: number | null;
  avgDemoScore: number;
  demoDaysDone: number;
  demoDaysTotal: number;
  weekNumber: number;
  lastUpdated: string | null;
  lastUpdatedBy: string;
}

interface Student { id: string; batch_id: string; name: string; status?: string | null; }
interface AttendanceRecord { id: string; student_id: string; batch_id: string; session_index: number; state: string; absence_note?: string | null; absence_category?: string | null; }
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
  const { signOut, profile: currentProfile, session, user } = useAuth();
  const [activePage, setActivePage] = useState('analytics');
  const [moderators, setModerators] = useState<Profile[]>([]);
  const [modSearchQuery, setModSearchQuery] = useState('');
  const [modCodes, setModCodes] = useState<ModCode[]>([]);
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


  // FEATURE 1: Expanded mod rows
  const [expandedModId, setExpandedModId] = useState<string | null>(null);
  const [modBatchCards, setModBatchCards] = useState<ModBatchCard[]>([]);
  const [loadingModBatches, setLoadingModBatches] = useState(false);

  // FEATURE 1: Full grid view (renders ModDashboard in read-only mode)
  const [gridViewBatch, setGridViewBatch] = useState<{
    batchId: string; batchName: string; modName: string; modId: string;
  } | null>(null);


  // FEATURE 3: Credentials modal
  const [credentialsMod, setCredentialsMod] = useState<Profile | null>(null);

  // Invite links
  const [invites, setInvites] = useState<ModInvite[]>([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState<ModInvite | null>(null);
  const [showPastInvites, setShowPastInvites] = useState(false);
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  // Students page state
  const [studentSearch, setStudentSearch] = useState('');
  const [studentPage, setStudentPage] = useState(1);
  const STUDENTS_PER_PAGE = 15;
  const [allStudentsData, setAllStudentsData] = useState<{ student: Student; batch: any; mod: Profile; weekNumber: number; attendancePct: number | null; attendance: AttendanceRecord[]; demoDays: DemoDay[]; demoScores: DemoScore[]; demoFeedback: DemoFeedback[] }[]>([]);

  // Student progress modal
  const [progressModalData, setProgressModalData] = useState<{ student: Student; batchName: string; modName: string; weekNumber: number; startDate?: string | null; attendance: AttendanceRecord[]; demoDays: DemoDay[]; demoScores: DemoScore[]; demoFeedback: DemoFeedback[] } | null>(null);

  // Mod unread announcements — shown in the grid view header
  const [modUnreadAnns, setModUnreadAnns] = useState<{ id: string; title: string; created_at: string }[]>([]);
  const [unreadPillOpen, setUnreadPillOpen] = useState(false);
  const unreadPillRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadData(); }, []);

  // Load unread announcements for the mod currently being viewed
  useEffect(() => {
    if (!gridViewBatch) { setModUnreadAnns([]); setUnreadPillOpen(false); return; }
    const load = async () => {
      const [annsRes, readsRes] = await Promise.all([
        supabase.from('announcements').select('id, title, created_at').eq('archived', false).order('created_at', { ascending: false }),
        supabase.from('announcement_reads').select('announcement_id').eq('user_id', gridViewBatch.modId),
      ]);
      const readIds = new Set((readsRes.data || []).map((r: any) => r.announcement_id));
      setModUnreadAnns((annsRes.data || []).filter((a: any) => !readIds.has(a.id)));
    };
    load();
  }, [gridViewBatch?.modId]);

  useEffect(() => {
    if (!unreadPillOpen) return;
    const handler = (e: MouseEvent) => {
      if (unreadPillRef.current && !unreadPillRef.current.contains(e.target as Node)) setUnreadPillOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [unreadPillOpen]);

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
    // (No per-batch cache needed; admin grid now uses ModDashboard which fetches its own data.)

    // Build students data for Students page
    const studentsPageData = allStudents.map(student => {
      const batch = allBatches.find(b => b.id === student.batch_id);
      const mod = mods.find(m => m.id === batch?.mod_id);
      const weekNum = getCurrentWeek(batch?.start_date) ?? 6;
      const sessionsOccurred = getSessionsOccurred(batch?.start_date);
      const sAtt = allAttendance.filter(a => a.student_id === student.id);
      const present = sAtt.filter(a => a.state === 'c').length;
      const pct = computeAttendancePct(present, 1, sessionsOccurred);
      const batchDDs = allDemoDays.filter(d => d.batch_id === student.batch_id);
      const batchDDIds = batchDDs.map(d => d.id);
      return {
        student,
        batch: batch || { name: 'Unknown' },
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

    // Invite links
    const { data: inviteData } = await (supabase as any).from('mod_invites').select('*').order('created_at', { ascending: false });
    if (inviteData) setInvites(inviteData as ModInvite[]);

    // Preload all batch data for grid views and Students page
    if (mods) preloadAllBatchData(mods as Profile[]);
  }, [preloadAllBatchData]);


  const handleAddModerator = async () => {
    if (!newModEmail.trim() || !newModName.trim()) return;
    setAddModLoading(true);
    setAddModError('');
    setGeneratedCode('');
    try {
      const { data, error } = await supabase.functions.invoke('admin-manage-moderator', {
        body: { action: 'create', email: newModEmail.trim(), name: newModName.trim() },
      });
      if (error) {
        // Try to extract the actual error message from the response body
        let message = 'Failed to create moderator';
        try {
          const ctx = (error as any).context;
          if (ctx?.body) {
            const text = typeof ctx.body === 'string' ? ctx.body : typeof ctx.body?.text === 'function' ? await ctx.body.text() : null;
            if (text) {
              const parsed = JSON.parse(text);
              if (parsed?.error) message = parsed.error;
            }
          }
        } catch {}
        setAddModError(message);
      } else {
        const result = typeof data === 'string' ? JSON.parse(data) : data;
        if (result.error) throw new Error(result.error);
        setGeneratedCode(result.code);
        setGeneratedModName(result.name || newModName.trim());
        loadData();
      }
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

        const weekNum = getCurrentWeek(batch.start_date) ?? 6;

        const sessionsOccurred = getSessionsOccurred(batch.start_date);
        const present = bAttendance.filter(a => a.state === 'c').length;
        const attPct = computeAttendancePct(present, bStudents.length, sessionsOccurred);

        const bDDIds = bDemoDays.map(d => d.id);
        const bScores = allDemoScores.filter(s => bDDIds.includes(s.demo_day_id));
        const avgScore = bScores.length > 0 ? Math.round((bScores.reduce((sum: number, s: any) => sum + Number(s.score), 0) / bScores.length) * 10) / 10 : 0;
        const demoDaysDone = bDemoDays.filter(dd => bScores.some(s => s.demo_day_id === dd.id)).length;

        return {
          id: batch.id, name: batch.name,
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

  // FEATURE 1: Open full grid view — renders ModDashboard in read-only mode.
  // Data fetching is handled by ModDashboard itself, so we just stash the identifiers.
  const openGridView = (batchId: string, batchName: string, modName: string, modId: string) => {
    setGridViewBatch({ batchId, batchName, modName, modId });
  };

  const generateToken = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => chars[b % chars.length]).join('');
  };

  const refreshInvites = async () => {
    const { data } = await (supabase as any).from('mod_invites').select('*').order('created_at', { ascending: false });
    if (data) setInvites(data as ModInvite[]);
  };

  const handleGenerateInvite = async () => {
    setInviteLoading(true);
    const token = generateToken();
    await (supabase as any).from('mod_invites').insert({
      token,
      created_by: user!.id,
    });
    await refreshInvites();
    setShowGenerateForm(false);
    setInviteLoading(false);
  };

  const handleRevokeInvite = async (invite: ModInvite) => {
    await (supabase as any).from('mod_invites').update({ revoked_at: new Date().toISOString() }).eq('id', invite.id);
    await refreshInvites();
    setShowRevokeConfirm(null);
  };

  const copyInviteUrl = (invite: ModInvite) => {
    const url = `${window.location.origin}/invite/${invite.token}`;
    navigator.clipboard.writeText(url);
    setCopiedInviteId(invite.id);
    setTimeout(() => setCopiedInviteId(prev => prev === invite.id ? null : prev), 2000);
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

  const sidebarItems: { id: string; label: string; icon: typeof BarChart3; section: string; badge?: string }[] = [
    { id: 'analytics', label: 'Analytics', icon: BarChart3, section: 'OVERVIEW' },
    { id: 'moderators', label: 'Moderators', icon: Users, section: 'OVERVIEW' },
    { id: 'students', label: 'Students', icon: GraduationCap, section: 'OVERVIEW' },
    { id: 'batches', label: 'All batches', icon: BookOpen, section: 'OVERVIEW' },
    { id: 'announcements', label: 'Announcements', icon: Megaphone, section: 'OPERATIONS' },
    { id: 'houston', label: 'Ask Houston', icon: Sparkles, section: 'INTELLIGENCE' },
    { id: 'houston-usage', label: 'Houston usage', icon: Activity, section: 'INTELLIGENCE' },
    { id: 'moderator-usage', label: 'Moderator usage', icon: UsersRound, section: 'INTELLIGENCE' },
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

  // FULL GRID VIEW — reuses ModDashboard in read-only mode so admin sees exactly
  // what the moderator sees, including future features added there.
  if (gridViewBatch) {
    return (
      <div className="min-h-screen bg-background">
        {/* Admin chrome — Back button + mod/batch label + unread pill + Read-only badge */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
          <button
            onClick={() => setGridViewBatch(null)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" /> Back to moderators
          </button>

          <span style={{ fontSize: 13, color: '#a3a3a3' }}>
            <span style={{ color: '#f5f5f5', fontWeight: 500 }}>{gridViewBatch.modName}</span>
            {' · '}{gridViewBatch.batchName}
          </span>

          <div className="flex items-center gap-2">
            {modUnreadAnns.length > 0 && (
              <div ref={unreadPillRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setUnreadPillOpen(o => !o)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                    fontSize: 12, padding: '4px 10px', borderRadius: 99,
                    background: '#2a1f00', color: '#fbbf24',
                    border: '1px solid rgba(251,191,36,0.25)',
                  }}
                >
                  <Megaphone className="w-3 h-3" />
                  {modUnreadAnns.length} unread {modUnreadAnns.length === 1 ? 'announcement' : 'announcements'}
                </button>
                {unreadPillOpen && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                    width: 300, background: '#1a1a1a', zIndex: 50,
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10, padding: 8,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  }}>
                    <p style={{ fontSize: 11, color: '#6b6b6b', padding: '2px 8px 8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      Not yet read by {gridViewBatch.modName.split(' ')[0]}
                    </p>
                    {modUnreadAnns.map(ann => (
                      <button
                        key={ann.id}
                        onClick={() => { setGridViewBatch(null); setActivePage('announcements'); setUnreadPillOpen(false); }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px', borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                      >
                        <div style={{ fontSize: 13, color: '#f5f5f5', fontWeight: 500 }}>{ann.title}</div>
                        <div style={{ fontSize: 11, color: '#6b6b6b', marginTop: 2 }}>
                          {new Date(ann.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      </button>
                    ))}
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 4, paddingTop: 4 }}>
                      <button
                        onClick={() => { setGridViewBatch(null); setActivePage('announcements'); setUnreadPillOpen(false); }}
                        style={{ fontSize: 12, color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
                      >
                        View all in Announcements →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <span
              className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-full"
              style={{ background: '#1a2a3a', color: '#60a5fa', border: '1px solid #2a3a4a' }}
            >
              <Eye className="w-3.5 h-3.5" /> Read-only view
            </span>
          </div>
        </div>

        {/* Reused mod dashboard, in read-only mode.
            Key forces a fresh mount when switching between batches so no stale data leaks. */}
        <ModDashboard
          key={gridViewBatch.batchId}
          readOnly
          hideTopNav
          batchIdOverride={gridViewBatch.batchId}
          modIdOverride={gridViewBatch.modId}
        />
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      {/* Sidebar */}
      <div className="w-52 flex-shrink-0 flex flex-col p-4 overflow-y-auto" style={{ background: 'hsl(var(--sidebar-background))', borderRight: '1px solid hsl(var(--border))' }}>
        <h1 className="text-base font-semibold text-foreground mb-6">Mission Control</h1>
        {['OVERVIEW', 'OPERATIONS', 'INTELLIGENCE', 'TOOLS'].map(section => (
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
                {item.badge && (
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                      padding: '2px 5px',
                      borderRadius: 4,
                      background: item.section === 'OPERATIONS' ? 'hsl(var(--score-amber) / 0.15)' : 'hsl(var(--houston))',
                      color: item.section === 'OPERATIONS' ? 'hsl(var(--score-amber))' : 'hsl(var(--houston-foreground))',
                    }}
                  >
                    {item.badge}
                  </span>
                )}
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
            {/* Invite links */}
            {(() => {
              const activeInvites = invites.filter(i => !i.revoked_at);
              const revokedInvites = invites.filter(i => !!i.revoked_at);
              return (
                <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 10, padding: 20, marginBottom: 20 }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Link2 className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">Invite links</span>
                      <span className="text-xs text-muted-foreground">· reusable, Discord-style</span>
                    </div>
                    <button
                      onClick={() => setShowGenerateForm(v => !v)}
                      style={{ ...primaryBtnStyle, padding: '6px 12px', fontSize: 12 }}>
                      <Plus className="w-3 h-3 inline-block mr-1" style={{ verticalAlign: 'middle' }} />
                      Generate new invite link
                    </button>
                  </div>

                  {showGenerateForm && (
                    <div className="flex items-center gap-2 mb-4">
                      <button onClick={handleGenerateInvite} disabled={inviteLoading}
                        style={{ ...primaryBtnStyle, padding: '7px 14px', fontSize: 12, opacity: inviteLoading ? 0.5 : 1 }}>
                        {inviteLoading ? 'Generating…' : 'Generate link'}
                      </button>
                      <button onClick={() => setShowGenerateForm(false)}
                        style={{ ...cancelBtnStyle, padding: '7px 14px', fontSize: 12 }}>
                        Cancel
                      </button>
                    </div>
                  )}

                  {activeInvites.length === 0 && !showGenerateForm && (
                    <p className="text-sm text-muted-foreground">No active invite links. Generate one so mods can sign up without manual account creation.</p>
                  )}

                  {activeInvites.map(invite => {
                    const url = `${window.location.origin}/invite/${invite.token}`;
                    const isCopied = copiedInviteId === invite.id;
                    return (
                      <div key={invite.id} style={{ background: '#1e1e1e', border: '1px solid #2e2e2e', borderRadius: 8, padding: '10px 12px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 11, color: '#60a5fa', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</p>
                          <p style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
                            {invite.uses} {invite.uses === 1 ? 'use' : 'uses'} · Created {new Date(invite.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <button onClick={() => copyInviteUrl(invite)} title="Copy link"
                          style={{ background: '#2a2a2a', border: '1px solid #3a3a3a', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: isCopied ? '#4ade80' : '#888', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, flexShrink: 0 }}>
                          {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          {isCopied ? 'Copied' : 'Copy'}
                        </button>
                        <button onClick={() => setShowRevokeConfirm(invite)} title="Revoke"
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#f87171', padding: 4, flexShrink: 0 }}>
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}

                  {revokedInvites.length > 0 && (
                    <div style={{ marginTop: activeInvites.length > 0 ? 8 : 0 }}>
                      <button onClick={() => setShowPastInvites(v => !v)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}>
                        {showPastInvites ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        Past invites ({revokedInvites.length})
                      </button>
                      {showPastInvites && (
                        <div style={{ marginTop: 8 }}>
                          {revokedInvites.map(invite => (
                            <div key={invite.id} style={{ background: '#141414', border: '1px solid #222', borderRadius: 8, padding: '8px 12px', marginBottom: 6, opacity: 0.5 }}>
                              <p style={{ fontSize: 10, color: '#555' }}>
                                {invite.uses} {invite.uses === 1 ? 'use' : 'uses'} · Revoked {new Date(invite.revoked_at!).toLocaleDateString()}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            <div style={{ position: 'relative', marginBottom: 12 }}>
              <input
                type="text"
                value={modSearchQuery}
                onChange={(e) => setModSearchQuery(e.target.value)}
                placeholder="Search moderators..."
                className="w-full px-3 py-2 text-sm text-foreground"
                style={{ border: '1px solid hsl(var(--input-border))', borderRadius: 8, background: 'hsl(var(--input-bg))', outline: 'none' }}
              />
              {modSearchQuery && (
                <button
                  onClick={() => setModSearchQuery('')}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))', fontSize: 14 }}
                >✕</button>
              )}
            </div>
            <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10 }}>
              {moderators.filter(mod => mod.name?.toLowerCase().includes(modSearchQuery.toLowerCase())).map(mod => {
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
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium overflow-hidden"
                            style={{ background: avatarColor.bg, color: avatarColor.text }}>
                            {mod.avatar_url ? (
                              <img src={mod.avatar_url} alt={mod.name || mod.email} className="w-full h-full object-cover" />
                            ) : (
                              getInitials(mod.name || mod.email)
                            )}
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
                              const attColor = card.attendancePct === null ? '#555' : card.attendancePct >= 70 ? '#4ade80' : card.attendancePct >= 50 ? '#fbbf24' : '#f87171';
                              const scoreColor = card.avgDemoScore >= 14 ? '#4ade80' : card.avgDemoScore >= 10 ? '#fbbf24' : '#f87171';
                              const lastUpdateDiff = card.lastUpdated ? Date.now() - new Date(card.lastUpdated).getTime() : Infinity;
                              const dotColor = lastUpdateDiff < 24 * 60 * 60 * 1000 ? '#4ade80' : lastUpdateDiff < 7 * 24 * 60 * 60 * 1000 ? '#fbbf24' : '#555';
                              return (
                                <div key={card.id} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: 16 }}>
                                  <div className="mb-3">
                                    <p className="text-sm font-medium text-foreground">{card.name}</p>
                                    <p className="text-xs text-muted-foreground">Currently in week {card.weekNumber} of 6</p>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 mb-3">
                                    <div style={{ background: '#242424', borderRadius: 8, padding: '8px 10px' }}>
                                      <div style={{ fontSize: 16, fontWeight: 600 }} className="text-foreground">{card.studentCount}</div>
                                      <div style={{ fontSize: 10, color: '#888' }}>Students</div>
                                    </div>
                                    <div style={{ background: '#242424', borderRadius: 8, padding: '8px 10px' }}>
                                      <div style={{ fontSize: 16, fontWeight: 600, color: attColor }}>Attendance · {card.attendancePct === null ? '—' : `${card.attendancePct}%`}</div>
                                      <div style={{ fontSize: 10, color: '#888' }}></div>
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
                                    <button onClick={() => openGridView(card.id, card.name, mod.name || mod.email, mod.id)}
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
                <div className="flex justify-end mt-6">
                  <button onClick={() => setCredentialsMod(null)}
                    style={cancelBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#333'; e.currentTarget.style.color = '#fff'; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = '#2a2a2a'; e.currentTarget.style.color = '#ccc'; }}>Close</button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Revoke invite confirm */}
        {showRevokeConfirm && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setShowRevokeConfirm(null)}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 10, padding: 24, maxWidth: 400, width: '90%' }}>
              <div style={{ fontSize: 16, color: '#F0F0F0', fontWeight: 500, marginBottom: 8 }}>Revoke invite link?</div>
              <div style={{ fontSize: 13, color: '#888', lineHeight: 1.6, marginBottom: 16 }}>
                Revoking this stops new signups but doesn't affect mods who already signed up with it.
                {showRevokeConfirm.description && <span style={{ color: '#aaa' }}> Link: "{showRevokeConfirm.description}"</span>}
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowRevokeConfirm(null)} style={cancelBtnStyle}
                  onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#333'; e.currentTarget.style.color = '#fff'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = '#2a2a2a'; e.currentTarget.style.color = '#ccc'; }}>Cancel</button>
                <button onClick={() => handleRevokeInvite(showRevokeConfirm)} style={destructBtnStyle}
                  onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#991b1b'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = '#7f1d1d'; }}>Revoke link</button>
              </div>
            </div>
          </div>
        )}

        {activePage === 'settings' && (
          <div className="max-w-md">
            <h2 className="text-lg font-semibold text-foreground mb-4">Settings</h2>
            <p className="text-sm text-muted-foreground">Moderators are now added via the Moderators page with access codes.</p>
          </div>
        )}

        {activePage === 'batches' && (() => {
          const batchMap = new Map<string, { id: string; name: string; modName: string; weekNumber: number; studentCount: number; attendancePct: number | null }>();
          for (const row of allStudentsData) {
            const id = row.batch?.id;
            if (!id) continue;
            const existing = batchMap.get(id);
            if (existing) {
              existing.studentCount += 1;
            } else {
              batchMap.set(id, {
                id,
                name: row.batch?.name ?? 'Unknown',
                modName: row.mod?.name ?? 'Unknown',
                weekNumber: row.weekNumber,
                studentCount: 1,
                attendancePct: row.attendancePct,
              });
            }
          }
          const runningBatches = Array.from(batchMap.values());
          return (
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">All Batches</h2>
            <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10 }}>
              {runningBatches.map(batch => {
                const pct = batch.attendancePct;
                const barColor = pct === null ? '#555' : pct >= 70 ? '#4ade80' : pct >= 50 ? '#fbbf24' : '#f87171';
                return (
                  <div key={batch.id} className="p-4" style={{ borderBottom: '1px solid hsl(var(--row-border))' }}>
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <p className="text-sm" style={{ fontWeight: 500, color: '#e8e8e8' }}>{batch.modName}</p>
                        <p className="text-xs" style={{ color: '#888' }}>{batch.name} · Week {batch.weekNumber} of 6 · {batch.studentCount} students</p>
                      </div>
                      <span className="text-sm font-medium" style={{ color: barColor }}>Attendance · {pct === null ? '—' : `${pct}%`}</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: '#2a2a2a' }}>
                      <div style={{ height: '100%', width: `${pct ?? 0}%`, borderRadius: 2, background: barColor }} />
                    </div>
                  </div>
                );
              })}
              {runningBatches.length === 0 && <p className="text-sm text-muted-foreground p-4">No batches yet.</p>}
            </div>
          </div>
          );
        })()}

        {activePage === 'students' && (
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-1">All students</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {allStudentsData.length} students across {new Set(allStudentsData.map(s => s.batch.id)).size} active batches
            </p>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text" value={studentSearch} onChange={(e) => { setStudentSearch(e.target.value); setStudentPage(1); }}
                placeholder="Search by student name..."
                style={{ width: '100%', background: '#242424', border: '1px solid #333', borderRadius: 8, padding: '10px 12px 10px 36px', fontSize: 13, color: '#e8e8e8', outline: 'none' }}
              />
            </div>
            {(() => {
                const filtered = studentSearch.trim()
                  ? allStudentsData.filter(s => s.student.name.toLowerCase().includes(studentSearch.toLowerCase()))
                  : [...allStudentsData].sort((a, b) => a.student.name.localeCompare(b.student.name));
                const totalPages = Math.max(1, Math.ceil(filtered.length / STUDENTS_PER_PAGE));
                const currentPage = Math.min(studentPage, totalPages);
                const paginated = filtered.slice((currentPage - 1) * STUDENTS_PER_PAGE, currentPage * STUDENTS_PER_PAGE);
                return (
                  <>
                    <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10 }}>
                      {filtered.length === 0 ? (
                        <div className="text-center py-12">
                          <p style={{ fontSize: 14, color: '#888' }}>No students found matching '{studentSearch}'</p>
                        </div>
                      ) : paginated.map(({ student, batch, mod, weekNumber, attendancePct, attendance: sAtt, demoDays: sDDs, demoScores: sDSc, demoFeedback: sDFb }) => {
                        const attColor = attendancePct === null ? '#555' : attendancePct >= 70 ? '#4ade80' : attendancePct >= 50 ? '#fbbf24' : '#f87171';
                        return (
                          <div key={student.id} className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid hsl(var(--row-border))' }}>
                            <div className="flex items-center gap-3">
                              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#2a1f00', color: '#fbbf24', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>
                                {getInitials(student.name)}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground">
                                  <span style={{ cursor: 'pointer' }} className="hover:underline"
                                    onClick={() => setProgressModalData({ student, batchName: batch.name, modName: mod.name, weekNumber, startDate: batch?.start_date || null, attendance: sAtt, demoDays: sDDs, demoScores: sDSc, demoFeedback: sDFb })}>
                                    {student.name}
                                  </span>
                                  <span style={{ ...emojiStyle, marginLeft: 8, cursor: 'pointer' }}
                                    onClick={() => setProgressModalData({ student, batchName: batch.name, modName: mod.name, weekNumber, startDate: batch?.start_date || null, attendance: sAtt, demoDays: sDDs, demoScores: sDSc, demoFeedback: sDFb })}>📄</span>
                                </p>
                                <p className="text-xs text-muted-foreground">{batch.name} · {mod.name} · Currently in week {weekNumber} of 6</p>
                              </div>
                            </div>
                            <span className="text-xs px-2 py-1 rounded" style={{ background: attColor === '#4ade80' ? '#1a3a1a' : attColor === '#fbbf24' ? '#2a2000' : attColor === '#f87171' ? '#2a0a0a' : '#222', color: attColor }}>
                              Attendance · {attendancePct === null ? '—' : `${attendancePct}%`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {filtered.length > STUDENTS_PER_PAGE && (
                      <div className="flex items-center justify-center gap-4 mt-4">
                        <button
                          disabled={currentPage <= 1}
                          onClick={() => setStudentPage(p => Math.max(1, p - 1))}
                          style={{ background: '#1e1e1e', border: '1px solid #333', color: currentPage <= 1 ? '#888' : '#e8e8e8', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: currentPage <= 1 ? 'not-allowed' : 'pointer', opacity: currentPage <= 1 ? 0.4 : 1 }}
                        >← Previous</button>
                        <span style={{ fontSize: 13, color: '#888' }}>Page {currentPage} of {totalPages}</span>
                        <button
                          disabled={currentPage >= totalPages}
                          onClick={() => setStudentPage(p => Math.min(totalPages, p + 1))}
                          style={{ background: '#1e1e1e', border: '1px solid #333', color: currentPage >= totalPages ? '#888' : '#e8e8e8', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer', opacity: currentPage >= totalPages ? 0.4 : 1 }}
                        >Next →</button>
                      </div>
                    )}
                  </>
                );
              })()}
          </div>
        )}

        {activePage === 'export' && (
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">Export All</h2>
            <p className="text-sm text-muted-foreground">Export functionality coming soon.</p>
          </div>
        )}

        {activePage === 'analytics' && <AnalyticsDashboard onOpenHouston={() => setActivePage('houston')} />}
        {activePage === 'announcements' && <AnnouncementsPage />}
        {activePage === 'houston' && <HoustonPage />}
        {activePage === 'houston-usage' && <HoustonUsagePage />}
        {activePage === 'moderator-usage' && (
          <ModeratorUsagePage
            onLookCloser={(modId) => {
              setActivePage('moderators');
              if (expandedModId !== modId) toggleModExpanded(modId);
            }}
          />
        )}
      </div>

      {/* Student progress modal */}
      {progressModalData && (
        <StudentProgressModal
          student={progressModalData.student}
          batchName={progressModalData.batchName}
          modName={progressModalData.modName}
          weekNumber={progressModalData.weekNumber}
          startDate={progressModalData.startDate}
          attendance={progressModalData.attendance}
          demoDays={progressModalData.demoDays}
          demoScores={progressModalData.demoScores}
          demoFeedback={progressModalData.demoFeedback}
          onClose={() => setProgressModalData(null)}
        />
      )}
    </div>
  );
};

export default AdminDashboard;
