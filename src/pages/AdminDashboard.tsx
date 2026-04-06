import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { BarChart3, Users, BookOpen, Plus, Download, Settings, AlertTriangle, Trash2, Calendar } from 'lucide-react';

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

  useEffect(() => { loadData(); }, []);

  const loadData = useCallback(async () => {
    const { data: mods } = await supabase.from('profiles').select('*').eq('role', 'moderator');
    if (mods) {
      setModerators(mods as Profile[]);
    }

    const { data: codes } = await supabase.from('moderator_codes').select('*').order('created_at', { ascending: false });
    if (codes) setModCodes(codes as ModCode[]);

    // Active batches: created in last 3 months
    const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: allBatches } = await supabase.from('batches').select('*').gte('created_at', threeMonthsAgo);
    setBatchCount(allBatches?.length || 0);

    const activeBatchIds = (allBatches || []).map(b => b.id);

    // Fetch students and attendance only for active batches
    let allStudents: any[] = [];
    let allAttendance: any[] = [];
    if (activeBatchIds.length > 0) {
      const { data: s } = await supabase.from('students').select('*').in('batch_id', activeBatchIds);
      allStudents = s || [];
      const { data: a } = await supabase.from('attendance').select('*').in('batch_id', activeBatchIds);
      allAttendance = a || [];
    }

    if (allBatches) {
      // Running batches info — filter out batches with 0 students
      const batchInfos: BatchInfo[] = [];
      for (const batch of allBatches) {
        const bStudents = allStudents.filter(s => s.batch_id === batch.id);
        if (bStudents.length === 0) continue;
        const bAttendance = allAttendance.filter(a => a.batch_id === batch.id);

        // Calculate week number from start_date
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

        // Sessions that have passed based on week number (4 sessions per week)
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

      // Avg attendance across all active batches
      if (allAttendance.length > 0) {
        const present = allAttendance.filter(a => a.state === 'c').length;
        const total = allAttendance.length;
        setAvgAttendance(total > 0 ? Math.round((present / total) * 100) : 0);
      } else {
        setAvgAttendance(0);
      }

      // Low attendance flags
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

    // Avg demo score for active batches
    if (activeBatchIds.length > 0) {
      const { data: demoDays } = await supabase.from('demo_days').select('id').in('batch_id', activeBatchIds);
      const demoDayIds = (demoDays || []).map(d => d.id);
      if (demoDayIds.length > 0) {
        const { data: allScores } = await supabase.from('demo_scores').select('score').in('demo_day_id', demoDayIds);
        if (allScores && allScores.length > 0) {
          const avg = allScores.reduce((sum, s) => sum + Number(s.score), 0) / allScores.length;
          setAvgDemoScore(Math.round(avg * 10) / 10);
        } else {
          setAvgDemoScore(0);
        }
      } else {
        setAvgDemoScore(0);
      }
    } else {
      setAvgDemoScore(0);
    }
  }, []);

  // Load activity with filter
  useEffect(() => { loadActivity(); }, [activityFilter, customDateFrom, customDateTo]);

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
    try {
      await supabase.functions.invoke('admin-manage-moderator', {
        body: { action: 'ban', userId: mod.id, ban: true },
      });
      setDeleteModConfirm(null);
      loadData();
    } catch (err) {
      console.error('Delete mod error', err);
    }
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

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <div className="w-52 flex flex-col p-4" style={{ background: 'hsl(var(--sidebar-background))', borderRight: '1px solid hsl(var(--border))' }}>
        <h1 className="text-base font-semibold text-foreground mb-6">BatchTrack</h1>
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
        <div className="mt-auto">
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
              {/* Running batches */}
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

              {/* Low attendance flags */}
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
                {activityLog.length === 0 && <p className="text-sm text-muted-foreground">No recent activity</p>}
              </div>
              {/* Inactive mod warnings */}
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
                return (
                  <div key={mod.id} className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid hsl(var(--row-border))' }}
                    onMouseEnter={() => setHoveredModId(mod.id)} onMouseLeave={() => setHoveredModId(null)}>
                    <div className="flex items-center gap-3">
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
                    <div className="flex items-center gap-3">
                      <span className="text-xs px-2 py-0.5 rounded" style={{ background: statusInfo.bg, color: statusInfo.text }}>{statusInfo.label}</span>
                      {code && !code.used && (
                        <span className="text-xs font-mono text-muted-foreground">{code.code}</span>
                      )}
                      <span className="text-xs text-muted-foreground">Joined {new Date(mod.created_at).toLocaleDateString()}</span>
                      {hoveredModId === mod.id && (
                        <button onClick={() => setDeleteModConfirm(mod)}
                          style={{ color: '#f87171', background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
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
                This will remove <span style={{ color: '#f87171' }}>{deleteModConfirm.name || deleteModConfirm.email}</span> ({deleteModConfirm.email}) from BatchTrack. They will immediately lose access. Their batch data will not be deleted.
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
