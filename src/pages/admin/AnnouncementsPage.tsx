import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Plus, X, ChevronDown, ChevronRight } from 'lucide-react';

interface Announcement {
  id: string;
  title: string;
  body: string | null;
  created_by: string;
  created_at: string;
  has_poll: boolean;
  archived: boolean;
  target_type: string;
  creator_name: string;
}

interface PollOption {
  id: string;
  announcement_id: string;
  option_text: string;
  position: number;
}

interface AnnouncementRead {
  announcement_id: string;
  user_id: string;
  read_at: string;
}

interface AnnouncementVote {
  announcement_id: string;
  user_id: string;
  option_id: string;
}

interface Mod {
  id: string;
  name: string;
}

type FilterTab = 'active' | 'archived' | 'all';

const emojiStyle: React.CSSProperties = { fontFamily: '"Apple Color Emoji","Segoe UI Emoji",sans-serif' };

const timeAgo = (dateStr: string): string => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const cancelBtnStyle: React.CSSProperties = {
  background: 'hsl(var(--secondary))', border: '1px solid hsl(var(--input))',
  color: 'hsl(var(--foreground))', borderRadius: 8, padding: '8px 16px',
  fontSize: 13, fontWeight: 500, cursor: 'pointer',
};
const primaryBtnStyle: React.CSSProperties = {
  background: 'hsl(var(--foreground))', border: '1px solid hsl(var(--foreground))',
  color: 'hsl(var(--primary-foreground))', borderRadius: 8, padding: '8px 16px',
  fontSize: 13, fontWeight: 700, cursor: 'pointer',
};

const AnnouncementsPage: React.FC = () => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [pollOptions, setPollOptions] = useState<PollOption[]>([]);
  const [reads, setReads] = useState<AnnouncementRead[]>([]);
  const [votes, setVotes] = useState<AnnouncementVote[]>([]);
  const [mods, setMods] = useState<Mod[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>('active');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);

  // Compose / edit modal state
  const [showCompose, setShowCompose] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [composeTitle, setComposeTitle] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composePoll, setComposePoll] = useState(false);
  const [pollOpts, setPollOpts] = useState<string[]>(['', '']);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [annRes, optsRes, readsRes, votesRes, modsRes, allProfilesRes] = await Promise.all([
      supabase.from('announcements').select('*').order('created_at', { ascending: false }),
      supabase.from('announcement_poll_options').select('*').order('position'),
      supabase.from('announcement_reads').select('*'),
      supabase.from('announcement_votes').select('*'),
      supabase.from('profiles').select('id, name').eq('role', 'moderator'),
      supabase.from('profiles').select('id, name'),
    ]);

    const profileMap: Record<string, string> = {};
    for (const p of allProfilesRes.data || []) profileMap[p.id] = p.name;

    setAnnouncements((annRes.data || []).map(a => ({ ...a, creator_name: profileMap[a.created_by] || 'Admin' })));
    setPollOptions(optsRes.data || []);
    setReads(readsRes.data || []);
    setVotes(votesRes.data || []);
    setMods(modsRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Close kebab menu on outside click
  useEffect(() => {
    if (!menuOpenId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpenId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpenId]);

  const resetCompose = () => {
    setShowCompose(false); setEditingId(null);
    setComposeTitle(''); setComposeBody('');
    setComposePoll(false); setPollOpts(['', '']);
  };

  const openNew = () => { resetCompose(); setShowCompose(true); };

  const openEdit = (ann: Announcement) => {
    setEditingId(ann.id);
    setComposeTitle(ann.title);
    setComposeBody(ann.body || '');
    setComposePoll(ann.has_poll);
    const opts = pollOptions.filter(o => o.announcement_id === ann.id).sort((a, b) => a.position - b.position);
    setPollOpts(opts.length >= 2 ? opts.map(o => o.option_text) : ['', '']);
    setShowCompose(true);
    setMenuOpenId(null);
  };

  const pollHasVotes = (annId: string) => votes.some(v => v.announcement_id === annId);

  const publish = async () => {
    if (!composeTitle.trim() || !user || publishing) return;
    setPublishing(true);

    if (editingId) {
      // Update existing
      await supabase.from('announcements').update({
        title: composeTitle.trim(),
        body: composeBody.trim() || null,
      }).eq('id', editingId);

      // Only touch poll options if poll exists and no votes yet
      if (composePoll && !pollHasVotes(editingId)) {
        const validOpts = pollOpts.map(o => o.trim()).filter(Boolean);
        if (validOpts.length >= 2) {
          await supabase.from('announcement_poll_options').delete().eq('announcement_id', editingId);
          await supabase.from('announcement_poll_options').insert(
            validOpts.map((text, i) => ({ announcement_id: editingId, option_text: text, position: i }))
          );
        }
      }
    } else {
      // Insert new
      const { data: ann, error } = await supabase.from('announcements').insert({
        title: composeTitle.trim(),
        body: composeBody.trim() || null,
        created_by: user.id,
        has_poll: composePoll,
        target_type: 'all_mods',
      }).select().single();

      if (!error && ann && composePoll) {
        const validOpts = pollOpts.map(o => o.trim()).filter(Boolean);
        if (validOpts.length >= 2) {
          await supabase.from('announcement_poll_options').insert(
            validOpts.map((text, i) => ({ announcement_id: ann.id, option_text: text, position: i }))
          );
        }
      }
      if (error) { setPublishing(false); return; }
    }

    setPublishing(false);
    resetCompose();
    load();
  };

  const toggleArchive = async (ann: Announcement) => {
    const next = !ann.archived;
    await supabase.from('announcements').update({ archived: next }).eq('id', ann.id);
    setAnnouncements(prev => prev.map(a => a.id === ann.id ? { ...a, archived: next } : a));
    setMenuOpenId(null);
  };

  const deleteAnn = async (id: string) => {
    setMenuOpenId(null);
    if (!window.confirm('Delete this announcement permanently? This cannot be undone.')) return;
    setAnnouncements(prev => prev.filter(a => a.id !== id));
    await supabase.from('announcements').delete().eq('id', id);
  };

  const getReadCount = (annId: string) => reads.filter(r => r.announcement_id === annId).length;
  const getVoteCount = (optId: string) => votes.filter(v => v.option_id === optId).length;
  const getTotalVotes = (annId: string) => votes.filter(v => v.announcement_id === annId).length;

  const modCount = mods.length;

  const filteredAnnouncements = announcements.filter(a => {
    if (filterTab === 'active') return !a.archived;
    if (filterTab === 'archived') return a.archived;
    return true;
  });

  const modalOpen = showCompose;

  return (
    <div style={{ maxWidth: 720 }}>
      {/* Header — title + button on same row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <h1 className="text-foreground" style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Announcements</h1>
          <p className="text-muted-foreground" style={{ fontSize: 13, marginTop: 3 }}>
            Broadcast messages to all moderators.
          </p>
        </div>
        <button onClick={openNew} style={{ ...primaryBtnStyle, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <Plus size={14} /> New announcement
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {(['active', 'archived', 'all'] as FilterTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setFilterTab(tab)}
            style={{
              padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none',
              background: filterTab === tab ? 'hsl(var(--foreground))' : 'hsl(var(--secondary))',
              color: filterTab === tab ? 'hsl(var(--background))' : 'hsl(var(--muted-foreground))',
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Compose / Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'hsl(var(--background) / 0.8)' }}
          onClick={resetCompose}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'hsl(var(--card))', border: '1px solid #2A2A2A', borderRadius: 8, padding: 24, width: '100%', maxWidth: 480 }}>

            <div className="flex items-center justify-between" style={{ marginBottom: 18 }}>
              <span className="text-foreground" style={{ fontSize: 15, fontWeight: 600 }}>
                {editingId ? 'Edit announcement' : 'New announcement'}
              </span>
              <button onClick={resetCompose}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))', padding: 4, lineHeight: 1 }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label className="text-sm text-muted-foreground" style={{ display: 'block', marginBottom: 4 }}>
                Title <span style={{ color: 'hsl(var(--score-red))' }}>*</span>
              </label>
              <input
                value={composeTitle}
                onChange={e => setComposeTitle(e.target.value)}
                placeholder="e.g. Week 3 check-in reminder"
                className="w-full text-foreground"
                style={{ background: 'hsl(var(--secondary))', border: '1px solid #333', borderRadius: 6, padding: '8px 10px', fontSize: 13, outline: 'none', fontFamily: 'Inter, sans-serif' }}
                onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                autoFocus
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label className="text-sm text-muted-foreground" style={{ display: 'block', marginBottom: 4 }}>Message (optional)</label>
              <textarea
                value={composeBody}
                onChange={e => setComposeBody(e.target.value)}
                placeholder="Add context, details, or a question..."
                rows={3}
                style={{ width: '100%', background: 'hsl(var(--secondary))', border: '1px solid #333', borderRadius: 6, padding: '8px 10px', fontSize: 13, color: 'hsl(var(--foreground))', resize: 'none', outline: 'none', fontFamily: 'Inter, sans-serif' }}
              />
              <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>
                Tip: use <code style={{ fontFamily: 'monospace', color: 'hsl(var(--foreground))' }}>{'{name}'}</code> for the mod's first name or <code style={{ fontFamily: 'monospace', color: 'hsl(var(--foreground))' }}>{'{batch}'}</code> for their batch
              </div>
            </div>

            {/* Poll section — toggle only for new; locked for edits */}
            {!editingId && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: composePoll ? 12 : 14 }}>
                <button
                  type="button"
                  onClick={() => setComposePoll(p => !p)}
                  style={{
                    width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                    position: 'relative', flexShrink: 0,
                    background: composePoll ? 'hsl(var(--score-green))' : 'hsl(var(--secondary))',
                    transition: 'background 0.15s',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 3, left: composePoll ? 18 : 3, width: 14, height: 14,
                    borderRadius: '50%', background: '#fff', transition: 'left 0.15s',
                  }} />
                </button>
                <span className="text-sm text-muted-foreground">Include a poll</span>
              </div>
            )}

            {composePoll && (() => {
              const hasVotes = editingId ? pollHasVotes(editingId) : false;
              return (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <label className="text-sm text-muted-foreground">Options (2–6)</label>
                    {hasVotes && (
                      <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' }}>
                        — locked (votes already in)
                      </span>
                    )}
                  </div>
                  {pollOpts.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2" style={{ marginBottom: 6 }}>
                      <input
                        value={opt}
                        onChange={e => { if (hasVotes) return; const next = [...pollOpts]; next[i] = e.target.value; setPollOpts(next); }}
                        placeholder={`Option ${i + 1}`}
                        disabled={hasVotes}
                        title={hasVotes ? "Can't edit poll options after votes are in." : undefined}
                        className="text-foreground"
                        style={{
                          flex: 1, background: 'hsl(var(--secondary))', border: '1px solid #333', borderRadius: 6,
                          padding: '6px 10px', fontSize: 13, outline: 'none', fontFamily: 'Inter, sans-serif',
                          opacity: hasVotes ? 0.5 : 1, cursor: hasVotes ? 'not-allowed' : 'text',
                        }}
                      />
                      {!hasVotes && pollOpts.length > 2 && (
                        <button type="button" onClick={() => setPollOpts(o => o.filter((_, j) => j !== i))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))', padding: 2, lineHeight: 1 }}>
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  {!hasVotes && pollOpts.length < 6 && (
                    <button type="button" onClick={() => setPollOpts(o => [...o, ''])}
                      style={{ fontSize: 12, color: 'hsl(var(--score-amber))', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginTop: 2 }}>
                      + Add option
                    </button>
                  )}
                </div>
              );
            })()}

            {!editingId && (
              <div style={{ marginBottom: 18 }}>
                <label className="text-sm text-muted-foreground" style={{ display: 'block', marginBottom: 4 }}>Send to</label>
                <select disabled
                  className="w-full text-foreground"
                  style={{ background: 'hsl(var(--input-bg))', border: '1px solid hsl(var(--input-border))', borderRadius: 8, padding: '7px 10px', fontSize: 13, opacity: 0.7, cursor: 'not-allowed' }}>
                  <option>All mods ({modCount})</option>
                </select>
              </div>
            )}

            <div className="flex justify-end gap-2" style={{ marginTop: editingId ? 18 : 0 }}>
              <button onClick={resetCompose} style={cancelBtnStyle}>Cancel</button>
              <button
                onClick={publish}
                disabled={!composeTitle.trim() || publishing}
                style={{ ...primaryBtnStyle, opacity: composeTitle.trim() && !publishing ? 1 : 0.5, cursor: composeTitle.trim() && !publishing ? 'pointer' : 'not-allowed' }}>
                {publishing ? 'Saving…' : editingId ? 'Save changes' : 'Publish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-muted-foreground" style={{ fontSize: 14, paddingTop: 20 }}>Loading…</div>
      ) : filteredAnnouncements.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0' }}>
          <div style={{ fontSize: 32, marginBottom: 10, ...emojiStyle }}>📣</div>
          <p className="text-muted-foreground" style={{ fontSize: 14 }}>
            {filterTab === 'archived' ? 'No archived announcements.' : 'No announcements yet.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filteredAnnouncements.map(ann => {
            const isExpanded = expandedId === ann.id;
            const readCount = getReadCount(ann.id);
            const opts = pollOptions.filter(o => o.announcement_id === ann.id);
            const totalVotes = getTotalVotes(ann.id);
            const allRead = modCount > 0 && readCount >= modCount;

            return (
              <div key={ann.id} style={{
                background: 'hsl(var(--card))', border: '1px solid #2A2A2A', borderRadius: 8,
                opacity: ann.archived ? 0.65 : 1,
                position: 'relative',
              }}>
                {/* Summary row */}
                <div
                  style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                  onClick={() => setExpandedId(isExpanded ? null : ann.id)}
                >
                  {isExpanded
                    ? <ChevronDown size={14} style={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
                    : <ChevronRight size={14} style={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Title row: title + badges + read count */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="text-foreground" style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                        {ann.title}
                      </span>
                      {ann.archived && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4, background: '#2a2a2a', color: '#666', flexShrink: 0 }}>ARCHIVED</span>
                      )}
                      {ann.has_poll && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4, background: '#1a2a1a', color: 'hsl(var(--score-green))', flexShrink: 0 }}>POLL</span>
                      )}
                      {/* Read count badge — same row as title */}
                      <span style={{
                        fontSize: 12, fontWeight: 500, padding: '2px 7px', borderRadius: 9999, flexShrink: 0,
                        background: allRead ? 'hsl(var(--score-green) / 0.12)' : 'hsl(var(--score-amber) / 0.12)',
                        color: allRead ? 'hsl(var(--score-green))' : 'hsl(var(--score-amber))',
                        border: `1px solid ${allRead ? 'hsl(var(--score-green) / 0.25)' : 'hsl(var(--score-amber) / 0.25)'}`,
                      }}>
                        {readCount}/{modCount} read
                      </span>
                    </div>
                    {/* Timestamp below title */}
                    <span className="text-muted-foreground" style={{ fontSize: 11, marginTop: 3, display: 'block' }}>{timeAgo(ann.created_at)}</span>
                  </div>

                  {/* Kebab menu */}
                  <div style={{ position: 'relative', flexShrink: 0 }} ref={menuOpenId === ann.id ? menuRef : undefined}>
                    <button
                      onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === ann.id ? null : ann.id); }}
                      className="text-muted-foreground"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 4, fontSize: 16, lineHeight: 1 }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'hsl(var(--foreground))'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = ''; }}
                    >⋮</button>

                    {menuOpenId === ann.id && (
                      <div
                        onClick={e => e.stopPropagation()}
                        style={{
                          position: 'absolute', right: 0, top: '100%', zIndex: 50, marginTop: 4,
                          background: 'hsl(var(--card))', border: '1px solid #2A2A2A', borderRadius: 8,
                          padding: '4px 0', minWidth: 140, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                        }}
                      >
                        <button
                          onClick={() => openEdit(ann)}
                          style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '7px 14px', fontSize: 13, color: 'hsl(var(--foreground))', cursor: 'pointer', borderRadius: 0 }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'hsl(var(--accent))'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                        >Edit</button>
                        <button
                          onClick={() => toggleArchive(ann)}
                          style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '7px 14px', fontSize: 13, color: 'hsl(var(--foreground))', cursor: 'pointer', borderRadius: 0 }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'hsl(var(--accent))'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                        >{ann.archived ? 'Unarchive' : 'Archive'}</button>
                        <div style={{ borderTop: '1px solid #2A2A2A', margin: '4px 0' }} />
                        <button
                          onClick={() => deleteAnn(ann.id)}
                          style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '7px 14px', fontSize: 13, color: 'hsl(var(--score-red))', cursor: 'pointer', borderRadius: 0 }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'hsl(var(--danger-bg))'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                        >Delete</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #1e1e1e', padding: '14px 16px' }}>
                    {ann.body && (
                      <p className="text-muted-foreground" style={{ fontSize: 13, lineHeight: 1.6, marginBottom: opts.length ? 16 : 12 }}>
                        {ann.body}
                      </p>
                    )}

                    {/* Poll results */}
                    {ann.has_poll && opts.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div className="text-muted-foreground" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                          Poll · {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
                        </div>
                        {opts.map(opt => {
                          const count = getVoteCount(opt.id);
                          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                          return (
                            <div key={opt.id} style={{ marginBottom: 10 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                                <span className="text-foreground" style={{ fontSize: 13 }}>{opt.option_text}</span>
                                <span className="text-muted-foreground" style={{ fontSize: 12 }}>{count} ({pct}%)</span>
                              </div>
                              <div style={{ height: 6, borderRadius: 3, background: 'hsl(var(--secondary))' }}>
                                <div style={{ height: '100%', borderRadius: 3, background: 'hsl(var(--score-green))', width: `${pct}%`, transition: 'width 0.3s' }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Per-mod read receipts */}
                    <div>
                      <div className="text-muted-foreground" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                        Read receipts
                      </div>
                      {mods.length === 0 ? (
                        <span className="text-muted-foreground" style={{ fontSize: 12 }}>No moderators found.</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {mods.map(mod => {
                            const read = reads.find(r => r.announcement_id === ann.id && r.user_id === mod.id);
                            return (
                              <div key={mod.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{
                                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                                  background: read ? 'hsl(var(--score-green))' : 'hsl(var(--score-amber))',
                                }} />
                                <span className="text-foreground" style={{ fontSize: 13, fontWeight: read ? 400 : 600 }}>{mod.name}</span>
                                {read && (
                                  <span className="text-muted-foreground" style={{ fontSize: 11 }}>{timeAgo(read.read_at)}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AnnouncementsPage;
