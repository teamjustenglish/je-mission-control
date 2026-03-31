import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { BarChart3, Users, BookOpen, Plus, Download, Settings, AlertTriangle } from 'lucide-react';

interface Profile {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
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

const AdminDashboard: React.FC = () => {
  const { signOut, profile: currentProfile } = useAuth();
  const [activePage, setActivePage] = useState('dashboard');
  const [moderators, setModerators] = useState<Profile[]>([]);
  const [batchCount, setBatchCount] = useState(0);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [lowFlags, setLowFlags] = useState<LowAttendanceFlag[]>([]);
  const [avgAttendance, setAvgAttendance] = useState(0);
  const [avgDemoScore, setAvgDemoScore] = useState(0);
  const [inviteCode, setInviteCode] = useState('');
  const [newCode, setNewCode] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    // Load moderators
    const { data: mods } = await supabase.from('profiles').select('*').eq('role', 'moderator');
    if (mods) setModerators(mods);

    // Load batches count
    const { count } = await supabase.from('batches').select('*', { count: 'exact', head: true });
    setBatchCount(count || 0);

    // Load activity log
    const { data: logs } = await supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(20);
    if (logs) setActivityLog(logs);

    // Load settings
    const { data: settings } = await supabase.from('settings').select('*').eq('key', 'invite_code').single();
    if (settings) {
      setInviteCode(settings.value);
      setNewCode(settings.value);
    }

    // Calculate avg attendance
    const { data: allAttendance } = await supabase.from('attendance').select('*');
    const { data: allStudents } = await supabase.from('students').select('*');
    if (allAttendance && allStudents) {
      const totalPossible = allStudents.length * 24;
      const present = allAttendance.filter(a => a.state === 'c').length;
      setAvgAttendance(totalPossible > 0 ? Math.round((present / totalPossible) * 100) : 0);

      // Calculate low attendance flags
      const { data: batches } = await supabase.from('batches').select('*');
      const flags: LowAttendanceFlag[] = [];
      if (batches) {
        for (const student of allStudents) {
          const studentAtt = allAttendance.filter(a => a.student_id === student.id);
          const p = studentAtt.filter(a => a.state === 'c').length;
          const pct = Math.round((p / 24) * 100);
          if (pct < 70 && studentAtt.length > 0) {
            const batch = batches.find(b => b.id === student.batch_id);
            const mod = mods?.find(m => m.id === batch?.mod_id);
            flags.push({
              studentName: student.name,
              batchName: batch?.name || '',
              modName: mod?.name || '',
              pct,
            });
          }
        }
      }
      setLowFlags(flags);
    }

    // Calculate avg demo score
    const { data: allScores } = await supabase.from('demo_scores').select('*');
    if (allScores && allScores.length > 0) {
      const avg = allScores.reduce((sum, s) => sum + Number(s.score), 0) / allScores.length;
      setAvgDemoScore(Math.round(avg * 10) / 10);
    }
  };

  const updateInviteCode = async () => {
    await supabase.from('settings').update({ value: newCode }).eq('key', 'invite_code');
    setInviteCode(newCode);
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} mins ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days} days ago`;
  };

  const getActionBadge = (type: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      attendance_marked: { bg: 'bg-success-bg', text: 'text-success-text', label: 'attendance' },
      demo_score_added: { bg: 'bg-amber-bg', text: 'text-amber-text', label: 'demo day' },
      student_added: { bg: 'bg-info-bg', text: 'text-info-text', label: 'new student' },
      student_removed: { bg: 'bg-danger-bg', text: 'text-danger-text', label: 'removed' },
      batch_created: { bg: 'bg-info-bg', text: 'text-info-text', label: 'new batch' },
      report_exported: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'export' },
    };
    return map[type] || { bg: 'bg-muted', text: 'text-muted-foreground', label: type };
  };

  const sidebarItems = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3, section: 'OVERVIEW' },
    { id: 'moderators', label: 'Moderators', icon: Users, section: 'OVERVIEW' },
    { id: 'batches', label: 'All batches', icon: BookOpen, section: 'OVERVIEW' },
    { id: 'add-mod', label: 'Add moderator', icon: Plus, section: 'TOOLS' },
    { id: 'export', label: 'Export all', icon: Download, section: 'TOOLS' },
    { id: 'settings', label: 'Settings', icon: Settings, section: 'TOOLS' },
  ];

  const getInitials = (name: string) => {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  };

  const isRecentlyActive = (dateStr: string) => {
    return Date.now() - new Date(dateStr).getTime() < 24 * 60 * 60 * 1000;
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <div className="w-52 bg-card border-r border-border p-4 flex flex-col">
        <h1 className="text-base font-semibold text-foreground mb-6">BatchTrack</h1>
        {['OVERVIEW', 'TOOLS'].map(section => (
          <div key={section} className="mb-4">
            <p className="text-[10px] font-semibold text-muted-foreground tracking-widest uppercase mb-2">{section}</p>
            {sidebarItems.filter(i => i.section === section).map(item => (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md mb-0.5 ${
                  activePage === item.id ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </button>
            ))}
          </div>
        ))}
        <div className="mt-auto">
          <button onClick={signOut} className="text-xs text-muted-foreground hover:text-foreground">Logout</button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 p-6">
        {activePage === 'dashboard' && (
          <>
            {/* Top bar */}
            <div className="flex items-center justify-end mb-6">
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-1 bg-muted text-muted-foreground rounded">Admin</span>
                <div className="w-8 h-8 rounded-full bg-amber-bg text-amber-text flex items-center justify-center text-xs font-medium">
                  {getInitials(currentProfile?.name || 'A')}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="text-xl font-medium text-foreground">{moderators.length}</div>
                <div className="text-sm text-muted-foreground">Moderators</div>
              </div>
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="text-xl font-medium text-foreground">{batchCount}</div>
                <div className="text-sm text-muted-foreground">Active batches</div>
              </div>
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="text-xl font-medium text-success-text">{avgAttendance}%</div>
                <div className="text-sm text-muted-foreground">Avg attendance</div>
              </div>
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="text-xl font-medium text-amber-text">{avgDemoScore || '—'}</div>
                <div className="text-sm text-muted-foreground">Avg demo score</div>
              </div>
            </div>

            {/* Two columns */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* Moderators list */}
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-foreground">Moderators</h2>
                  <span className="text-sm text-muted-foreground">{moderators.length} active</span>
                </div>
                <div className="space-y-3">
                  {moderators.map(mod => (
                    <div key={mod.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                            mod.id === moderators[0]?.id ? 'bg-amber-bg text-amber-text' : 'bg-info-bg text-info-text'
                          }`}>
                            {getInitials(mod.name || mod.email)}
                          </div>
                          <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${
                            isRecentlyActive(mod.created_at) ? 'bg-success-text' : 'bg-muted-foreground'
                          }`} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{mod.name || mod.email}</p>
                          <p className="text-xs text-muted-foreground">{timeAgo(mod.created_at)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Low attendance flags */}
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-foreground">Low attendance flags</h2>
                  <span className="text-sm text-danger-text">{lowFlags.length} students</span>
                </div>
                <div className="space-y-3">
                  {lowFlags.map((flag, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="w-4 h-4 text-amber-text" />
                        <div>
                          <p className="text-sm font-medium text-foreground">{flag.studentName}</p>
                          <p className="text-xs text-muted-foreground">{flag.batchName} · {flag.modName}</p>
                        </div>
                      </div>
                      <span className="text-sm font-medium text-danger-text">{flag.pct}%</span>
                    </div>
                  ))}
                  {lowFlags.length === 0 && (
                    <p className="text-sm text-muted-foreground">No low attendance flags</p>
                  )}
                </div>
              </div>
            </div>

            {/* Recent activity */}
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-foreground">Recent activity</h2>
                <span className="text-sm text-muted-foreground">across all mods</span>
              </div>
              <div className="space-y-3">
                {activityLog.map(entry => {
                  const badge = getActionBadge(entry.action_type);
                  return (
                    <div key={entry.id} className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-full bg-info-bg text-info-text flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">
                        {getInitials(entry.mod_name || '?')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">
                          <span className="font-medium">{entry.mod_name}</span>{' '}
                          {entry.description}{' '}
                          <span className={`text-xs px-1.5 py-0.5 rounded ${badge.bg} ${badge.text}`}>{badge.label}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">{entry.batch_name} · {timeAgo(entry.created_at)}</p>
                      </div>
                    </div>
                  );
                })}
                {activityLog.length === 0 && (
                  <p className="text-sm text-muted-foreground">No recent activity</p>
                )}
              </div>
            </div>
          </>
        )}

        {activePage === 'settings' && (
          <div className="max-w-md">
            <h2 className="text-lg font-semibold text-foreground mb-4">Settings</h2>
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-medium text-foreground mb-2">Invite Code</h3>
              <p className="text-xs text-muted-foreground mb-3">Moderators need this code to sign up.</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  className="flex-1 px-3 py-2 border border-border rounded-md text-sm bg-card text-foreground"
                />
                <button
                  onClick={updateInviteCode}
                  disabled={newCode === inviteCode}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50"
                >
                  Update
                </button>
              </div>
              {newCode !== inviteCode && (
                <p className="text-xs text-muted-foreground mt-2">Click Update to save. Old code will be immediately invalid.</p>
              )}
            </div>
          </div>
        )}

        {activePage === 'moderators' && (
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">All Moderators</h2>
            <div className="bg-card border border-border rounded-lg">
              {moderators.map(mod => (
                <div key={mod.id} className="flex items-center justify-between p-4 border-b border-border last:border-b-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-info-bg text-info-text flex items-center justify-center text-xs font-medium">
                      {getInitials(mod.name || mod.email)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{mod.name || mod.email}</p>
                      <p className="text-xs text-muted-foreground">{mod.email}</p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">Joined {new Date(mod.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activePage === 'add-mod' && (
          <div className="max-w-md">
            <h2 className="text-lg font-semibold text-foreground mb-4">Add Moderator</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Share the invite code with new moderators. They can sign up at the login page using this code:
            </p>
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-lg font-mono font-semibold text-foreground">{inviteCode}</p>
            </div>
          </div>
        )}

        {activePage === 'batches' && (
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">All Batches</h2>
            <p className="text-sm text-muted-foreground">Total: {batchCount} batches across all moderators.</p>
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
