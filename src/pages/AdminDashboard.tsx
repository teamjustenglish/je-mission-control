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

interface ModCode {
  id: string;
  mod_id: string | null;
  email: string;
  code: string;
  used: boolean;
  created_at: string;
}

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

  // Add mod modal
  const [showAddMod, setShowAddMod] = useState(false);
  const [newModEmail, setNewModEmail] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [addModLoading, setAddModLoading] = useState(false);
  const [addModError, setAddModError] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const { data: mods } = await supabase.from('profiles').select('*').eq('role', 'moderator');
    if (mods) setModerators(mods);

    const { data: codes } = await supabase.from('moderator_codes').select('*').order('created_at', { ascending: false });
    if (codes) setModCodes(codes as ModCode[]);

    const { count } = await supabase.from('batches').select('*', { count: 'exact', head: true });
    setBatchCount(count || 0);

    const { data: logs } = await supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(20);
    if (logs) setActivityLog(logs);

    const { data: allAttendance } = await supabase.from('attendance').select('*');
    const { data: allStudents } = await supabase.from('students').select('*');
    if (allAttendance && allStudents) {
      const totalPossible = allStudents.length * 24;
      const present = allAttendance.filter(a => a.state === 'c').length;
      setAvgAttendance(totalPossible > 0 ? Math.round((present / totalPossible) * 100) : 0);

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
            flags.push({ studentName: student.name, batchName: batch?.name || '', modName: mod?.name || '', pct });
          }
        }
      }
      setLowFlags(flags);
    }

    const { data: allScores } = await supabase.from('demo_scores').select('*');
    if (allScores && allScores.length > 0) {
      const avg = allScores.reduce((sum, s) => sum + Number(s.score), 0) / allScores.length;
      setAvgDemoScore(Math.round(avg * 10) / 10);
    }
  };

  const handleAddModerator = async () => {
    if (!newModEmail.trim()) return;
    setAddModLoading(true);
    setAddModError('');
    setGeneratedCode('');
    try {
      const { data, error } = await supabase.functions.invoke('create-moderator', {
        body: { email: newModEmail.trim() },
      });
      if (error) throw error;
      const result = typeof data === 'string' ? JSON.parse(data) : data;
      if (result.error) throw new Error(result.error);
      setGeneratedCode(result.code);
      loadData();
    } catch (err: any) {
      setAddModError(err.message || 'Failed to create moderator');
    }
    setAddModLoading(false);
  };

  const handleDeactivateMod = async (modId: string, ban: boolean) => {
    try {
      await supabase.functions.invoke('deactivate-moderator', {
        body: { userId: modId, ban },
      });
      loadData();
    } catch (err) {
      console.error('Deactivate error', err);
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} mins ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)} days ago`;
  };

  const getActionBadge = (type: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      attendance_marked: { bg: 'hsl(var(--success-bg))', text: 'hsl(var(--success-text))', label: 'attendance' },
      demo_score_added: { bg: 'hsl(var(--amber-bg))', text: 'hsl(var(--amber-text))', label: 'demo day' },
      student_added: { bg: 'hsl(var(--info-bg))', text: 'hsl(var(--info-text))', label: 'new student' },
      student_removed: { bg: 'hsl(var(--danger-bg))', text: 'hsl(var(--danger-text))', label: 'removed' },
      batch_created: { bg: 'hsl(var(--info-bg))', text: 'hsl(var(--info-text))', label: 'new batch' },
      report_exported: { bg: 'hsl(var(--muted))', text: 'hsl(var(--muted-foreground))', label: 'export' },
      session_rescheduled: { bg: 'hsl(var(--amber-bg))', text: 'hsl(var(--amber-text))', label: 'rescheduled' },
    };
    return map[type] || { bg: 'hsl(var(--muted))', text: 'hsl(var(--muted-foreground))', label: type };
  };

  const sidebarItems = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3, section: 'OVERVIEW' },
    { id: 'moderators', label: 'Moderators', icon: Users, section: 'OVERVIEW' },
    { id: 'batches', label: 'All batches', icon: BookOpen, section: 'OVERVIEW' },
    { id: 'export', label: 'Export all', icon: Download, section: 'TOOLS' },
    { id: 'settings', label: 'Settings', icon: Settings, section: 'TOOLS' },
  ];

  const getInitials = (name: string) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const isRecentlyActive = (dateStr: string) => Date.now() - new Date(dateStr).getTime() < 24 * 60 * 60 * 1000;

  const attColor = avgAttendance >= 70 ? 'hsl(var(--score-green))' : avgAttendance >= 50 ? 'hsl(var(--score-amber))' : 'hsl(var(--score-red))';

  const getModStatus = (modId: string): 'active' | 'pending' => {
    const code = modCodes.find(c => c.mod_id === modId);
    if (code && !code.used) return 'pending';
    return 'active';
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
      <div className="flex-1 p-6">
        {activePage === 'dashboard' && (
          <>
            <div className="flex items-center justify-end mb-6">
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-1 rounded" style={{ background: 'hsl(var(--success-bg))', color: 'hsl(var(--success-text))' }}>Admin</span>
                <div className="w-8 h-8 rounded-full bg-amber-bg text-amber-text flex items-center justify-center text-xs font-medium">
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
                <div className="text-muted-foreground" style={{ fontSize: 12 }}>Active batches</div>
              </div>
              <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 22, fontWeight: 500, color: attColor }}>{avgAttendance}%</div>
                <div className="text-muted-foreground" style={{ fontSize: 12 }}>Avg attendance</div>
              </div>
              <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 22, fontWeight: 500, color: 'hsl(var(--score-amber))' }}>{avgDemoScore || '—'}</div>
                <div className="text-muted-foreground" style={{ fontSize: 12 }}>Avg demo score</div>
              </div>
            </div>

            {/* Two columns */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* Moderators */}
              <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, padding: '14px 16px' }}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-foreground">Moderators</h2>
                  <span className="text-sm text-muted-foreground">{moderators.length} active</span>
                </div>
                <div className="space-y-3">
                  {moderators.map(mod => {
                    const status = getModStatus(mod.id);
                    return (
                      <div key={mod.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium bg-amber-bg text-amber-text">
                              {getInitials(mod.name || mod.email)}
                            </div>
                            <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${
                              status === 'active' ? 'bg-success-text' : 'bg-muted-foreground'
                            }`} />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{mod.name || mod.email}</p>
                            <p className="text-xs text-muted-foreground">
                              {status === 'pending' ? 'Pending activation' : timeAgo(mod.created_at)}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded" style={{
                          background: status === 'active' ? 'hsl(var(--success-bg))' : 'hsl(var(--amber-bg))',
                          color: status === 'active' ? 'hsl(var(--success-text))' : 'hsl(var(--amber-text))',
                        }}>{status}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Low attendance flags */}
              <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, padding: '14px 16px' }}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-foreground">Low attendance flags</h2>
                  <span style={{ color: 'hsl(var(--danger-text))' }} className="text-sm">{lowFlags.length} students</span>
                </div>
                <div className="space-y-3">
                  {lowFlags.map((flag, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="w-4 h-4" style={{ color: 'hsl(var(--score-amber))' }} />
                        <div>
                          <p className="text-sm font-medium text-foreground">{flag.studentName}</p>
                          <p className="text-xs text-muted-foreground">{flag.batchName} · {flag.modName}</p>
                        </div>
                      </div>
                      <span className="text-sm font-medium" style={{ color: 'hsl(var(--danger-text))' }}>{flag.pct}%</span>
                    </div>
                  ))}
                  {lowFlags.length === 0 && <p className="text-sm text-muted-foreground">No low attendance flags</p>}
                </div>
              </div>
            </div>

            {/* Activity feed */}
            <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, padding: '14px 16px' }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-foreground">Recent activity</h2>
                <span className="text-sm text-muted-foreground">across all mods</span>
              </div>
              <div>
                {activityLog.map(entry => {
                  const badge = getActionBadge(entry.action_type);
                  return (
                    <div key={entry.id} className="flex items-start gap-3 py-3" style={{ borderBottom: '1px solid hsl(var(--row-border))' }}>
                      <div className="w-7 h-7 rounded-full bg-info-bg text-info-text flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">
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
                    </div>
                  );
                })}
                {activityLog.length === 0 && <p className="text-sm text-muted-foreground">No recent activity</p>}
              </div>
            </div>
          </>
        )}

        {activePage === 'moderators' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">All Moderators</h2>
              <button onClick={() => { setShowAddMod(true); setGeneratedCode(''); setNewModEmail(''); setAddModError(''); }}
                className="flex items-center gap-1.5 text-sm font-medium bg-primary text-primary-foreground"
                style={{ padding: '8px 16px', borderRadius: 7 }}>
                <Plus className="w-4 h-4" /> Add moderator
              </button>
            </div>
            <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10 }}>
              {moderators.map(mod => {
                const status = getModStatus(mod.id);
                const code = modCodes.find(c => c.mod_id === mod.id);
                return (
                  <div key={mod.id} className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid hsl(var(--row-border))' }}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-info-bg text-info-text flex items-center justify-center text-xs font-medium">
                        {getInitials(mod.name || mod.email)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{mod.name || mod.email}</p>
                        <p className="text-xs text-muted-foreground">{mod.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs px-2 py-0.5 rounded" style={{
                        background: status === 'active' ? 'hsl(var(--success-bg))' : 'hsl(var(--amber-bg))',
                        color: status === 'active' ? 'hsl(var(--success-text))' : 'hsl(var(--amber-text))',
                      }}>{status}</span>
                      {code && !code.used && (
                        <span className="text-xs font-mono text-muted-foreground">{code.code}</span>
                      )}
                      <span className="text-xs text-muted-foreground">Joined {new Date(mod.created_at).toLocaleDateString()}</span>
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
                  <div style={{ fontSize: 14, color: '#F0F0F0', fontWeight: 500, marginBottom: 8 }}>Moderator created</div>
                  <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Share this access code with {newModEmail}:</p>
                  <div style={{ background: '#242424', border: '1px solid #333', borderRadius: 8, padding: '12px 16px', textAlign: 'center', marginBottom: 16 }}>
                    <span style={{ fontSize: 20, fontFamily: 'monospace', fontWeight: 700, color: '#d4920a', letterSpacing: 2 }}>{generatedCode}</span>
                  </div>
                  <p style={{ fontSize: 11, color: '#555', marginBottom: 16 }}>They will use this code along with their email to activate their account and set a password.</p>
                  <button onClick={() => { navigator.clipboard.writeText(generatedCode); }}
                    style={{ width: '100%', padding: '8px', fontSize: 12, background: '#2a1f00', border: '1px solid #7a5000', color: '#d4920a', borderRadius: 6, cursor: 'pointer', marginBottom: 8 }}>
                    Copy code
                  </button>
                  <button onClick={() => setShowAddMod(false)}
                    style={{ width: '100%', padding: '8px', fontSize: 12, background: '#242424', border: '1px solid #333', color: '#888', borderRadius: 6, cursor: 'pointer' }}>
                    Done
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 14, color: '#F0F0F0', fontWeight: 500, marginBottom: 4 }}>Add moderator</div>
                  <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Enter their email address. An access code will be generated for them.</p>
                  {addModError && (
                    <div style={{ fontSize: 12, color: 'hsl(var(--danger-text))', background: 'hsl(var(--danger-bg))', padding: '8px 10px', borderRadius: 6, marginBottom: 8 }}>
                      {addModError}
                    </div>
                  )}
                  <input type="email" value={newModEmail} onChange={(e) => setNewModEmail(e.target.value)}
                    placeholder="moderator@email.com"
                    style={{ width: '100%', background: '#242424', border: '1px solid #333', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: '#F0F0F0', outline: 'none', marginBottom: 12 }} />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowAddMod(false)}
                      style={{ padding: '6px 14px', fontSize: 12, background: '#242424', border: '1px solid #333', color: '#888', borderRadius: 6, cursor: 'pointer' }}>
                      Cancel
                    </button>
                    <button onClick={handleAddModerator} disabled={addModLoading || !newModEmail.trim()}
                      style={{ padding: '6px 14px', fontSize: 12, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', borderRadius: 6, cursor: 'pointer', border: 'none', opacity: addModLoading || !newModEmail.trim() ? 0.5 : 1 }}>
                      {addModLoading ? 'Creating…' : 'Create moderator'}
                    </button>
                  </div>
                </>
              )}
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
