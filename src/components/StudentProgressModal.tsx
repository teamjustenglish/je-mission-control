import React, { useRef, useState, useEffect } from 'react';
import { getSessionLabel, isDemoWeek, CRITERIA, getSessionsOccurred, computeAttendancePct } from '@/lib/batchtrack';
import { supabase } from '@/integrations/supabase/client';

interface StudentProgressModalProps {
  student: { id: string; name: string; batch_id: string };
  batchName: string;
  modName: string;
  weekNumber: number;
  startDate?: string | null;
  attendance: { student_id: string; session_index: number; state: string; absence_note?: string | null }[];
  demoDays: { id: string; title: string; date: string | null; day_number: number }[];
  demoScores: { id: string; demo_day_id: string; student_id: string; criterion: string; score: number }[];
  demoFeedback?: { id: string; demo_day_id: string; student_id: string; feedback: string }[];
  onClose: () => void;
}

const emojiStyle: React.CSSProperties = { fontFamily: '"Apple Color Emoji","Segoe UI Emoji",sans-serif' };

function generateSlug(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const rand = Array.from({ length: 6 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
  return `${base}-${rand}`;
}

const StudentProgressModal: React.FC<StudentProgressModalProps> = ({
  student, batchName, modName, weekNumber, startDate, attendance, demoDays, demoScores, demoFeedback, onClose,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);

  // Share link state
  const [showSharePopover, setShowSharePopover] = useState(false);
  const [shareSlug, setShareSlug] = useState<string | null>(null);
  const [shareLinkId, setShareLinkId] = useState<string | null>(null);
  const [shareRevoked, setShareRevoked] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const shareUrl = shareSlug ? `${window.location.origin}/share/${shareSlug}` : '';

  const loadOrCreateShareLink = async () => {
    setShareLoading(true);
    setConfirmRevoke(false);
    // Check for existing non-revoked link
    const { data: existing } = await supabase
      .from('student_share_links')
      .select('*')
      .eq('student_id', student.id)
      .is('revoked_at', null)
      .limit(1);

    if (existing && existing.length > 0) {
      const link = existing[0] as any;
      setShareSlug(link.slug);
      setShareLinkId(link.id);
      setShareRevoked(false);
      setShareLoading(false);
      return;
    }

    // Create new
    const slug = generateSlug(student.name);
    const { data: user } = await supabase.auth.getUser();
    const { data: inserted, error } = await supabase
      .from('student_share_links')
      .insert({ student_id: student.id, slug, created_by: user?.user?.id ?? null } as any)
      .select()
      .single();

    if (error) {
      console.error('Failed to create share link', error);
      setShareLoading(false);
      return;
    }
    setShareSlug((inserted as any).slug);
    setShareLinkId((inserted as any).id);
    setShareRevoked(false);
    setShareLoading(false);
  };

  const handleShareClick = () => {
    if (!showSharePopover) {
      setShowSharePopover(true);
      loadOrCreateShareLink();
    } else {
      setShowSharePopover(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleRevoke = async () => {
    if (!shareLinkId) return;
    await supabase.from('student_share_links').update({ revoked_at: new Date().toISOString() } as any).eq('id', shareLinkId);
    setShareRevoked(true);
    setConfirmRevoke(false);
  };

  const handleRegenerateLink = () => {
    setShareSlug(null);
    setShareLinkId(null);
    setShareRevoked(false);
    loadOrCreateShareLink();
  };

  const studentAtt = attendance.filter(a => a.student_id === student.id);
  const present = studentAtt.filter(a => a.state === 'c').length;
  const attended = present;
  const sessionsOccurred = startDate ? getSessionsOccurred(startDate) : Math.min(weekNumber * 4, 24);
  const overallPct = computeAttendancePct(present, 1, sessionsOccurred);
  const attColor = overallPct === null ? '#555' : overallPct >= 70 ? '#4ade80' : overallPct >= 50 ? '#fbbf24' : '#f87171';

  const currentWeek = Math.min(Math.max(weekNumber, 1), 6);

  const demoDayTotal = (demoDayId: string): number | null => {
    const scores = demoScores.filter(s => s.demo_day_id === demoDayId && s.student_id === student.id);
    if (scores.length === 0) return null;
    const total = scores.reduce((sum, s) => sum + Number(s.score), 0);
    if (total === 0) return null;
    return Math.round(total * 10) / 10;
  };

  const lastDemoScore = (() => {
    const scored = demoDays
      .filter(dd => demoDayTotal(dd.id) !== null)
      .sort((a, b) => b.day_number - a.day_number);
    if (scored.length === 0) return null;
    return demoDayTotal(scored[0].id);
  })();

  const getInitials = (name: string) => name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '?';

  const getWeekAttendance = (weekNum: number) => {
    const startIdx = (weekNum - 1) * 4;
    return [0, 1, 2, 3].map(d => {
      const idx = startIdx + d;
      const info = getSessionLabel(idx);
      const rec = studentAtt.find(a => a.session_index === idx);
      return { ...info, state: rec?.state || 'e', idx };
    });
  };

  const weekPct = (weekNum: number) => {
    const days = getWeekAttendance(weekNum);
    const p = days.filter(d => d.state === 'c').length;
    return Math.round((p / 4) * 100);
  };

  const demoDayForWeek = (weekNum: number) => {
    if (!isDemoWeek(weekNum)) return null;
    const dayNumber = weekNum / 2;
    return demoDays.find(dd => dd.day_number === dayNumber) || null;
  };

  const scoreColor = (n: number) => n >= 15 ? '#4ade80' : n >= 10 ? '#fbbf24' : '#f87171';

  const visibleWeeks = Array.from({ length: currentWeek }, (_, i) => i + 1);
  const futureWeeksNote = currentWeek < 6 ? `Weeks ${currentWeek + 1}–6 not started yet` : null;

  const visibleDemoWeeks = [2, 4, 6].filter(w => w <= currentWeek);
  const nextFutureDemoWeek = [2, 4, 6].find(w => w > currentWeek);
  const nextFutureDemoNumber = nextFutureDemoWeek ? nextFutureDemoWeek / 2 : null;

  const firstName = student.name.split(' ')[0] || student.name;

  return (
    <>
      <style>{`@keyframes spm-pulse { 0%,100%{opacity:1} 50%{opacity:.4} } @keyframes spm-flash-red { 0%,100%{border-color:#333} 50%{border-color:#f87171} }`}</style>
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}
        onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()}
          ref={cardRef}
          style={{ background: '#1e1e1e', border: '1px solid #2e2e2e', borderRadius: 14, maxWidth: 500, width: '90%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
          {/* Header (fixed) */}
          <div style={{ padding: '16px 18px', borderBottom: '1px solid #2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#2a1f00', color: '#fbbf24', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, flexShrink: 0 }}>
                {getInitials(student.name)}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{student.name}</div>
                <div style={{ fontSize: 12, color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{batchName} · {modName} · Week {weekNumber} of 6</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, position: 'relative' }}>
              <button
                onClick={handleShareClick}
                style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #5a4a00', borderRadius: 6, background: '#2a1f00', color: '#fbbf24', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1, whiteSpace: 'nowrap' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#7a6000'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#5a4a00'; }}
              >🔗 Share link</button>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 18, padding: 4 }}>✕</button>

              {/* Share popover */}
              {showSharePopover && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, width: 320, background: '#1a1a1a', border: '1px solid #333', borderRadius: 10, padding: 14, zIndex: 100, boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}
                  onClick={(e) => e.stopPropagation()}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e8e8', marginBottom: 10 }}>Share {firstName}'s progress</div>
                  {shareLoading ? (
                    <div style={{ fontSize: 12, color: '#666' }}>Generating link…</div>
                  ) : shareRevoked ? (
                    <>
                      <div style={{ background: '#151515', border: '1px solid #333', borderRadius: 6, padding: '8px 10px', fontSize: 11, fontFamily: 'monospace', color: '#555', marginBottom: 8, textDecoration: 'line-through' }}>{shareUrl}</div>
                      <div style={{ fontSize: 11, color: '#f87171', marginBottom: 8 }}>Link revoked</div>
                      <button onClick={handleRegenerateLink} style={{ fontSize: 11, color: '#fbbf24', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Generate new link</button>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                        <input
                          readOnly
                          value={shareUrl}
                          onClick={(e) => (e.target as HTMLInputElement).select()}
                          style={{ flex: 1, background: '#151515', border: '1px solid #333', borderRadius: 6, padding: '8px 10px', fontSize: 11, fontFamily: 'monospace', color: '#ccc', outline: 'none' }}
                        />
                        <button onClick={handleCopy} style={{ fontSize: 11, padding: '6px 12px', background: copied ? '#14532d' : '#2a1f00', border: `1px solid ${copied ? '#166534' : '#5a4a00'}`, borderRadius: 6, color: copied ? '#4ade80' : '#fbbf24', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 600, transition: 'all 0.15s' }}>
                          {copied ? 'Copied ✓' : 'Copy'}
                        </button>
                      </div>
                      <div style={{ fontSize: 10, color: '#555', marginBottom: 10, lineHeight: 1.5 }}>Live link — always shows latest data. Anyone with the link can view.</div>
                      {!confirmRevoke ? (
                        <button onClick={() => setConfirmRevoke(true)} style={{ fontSize: 11, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Revoke link</button>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: '#f87171' }}>Revoke? Anyone with it will lose access.</span>
                          <button onClick={handleRevoke} style={{ fontSize: 11, padding: '3px 8px', background: '#7f1d1d', border: '1px solid #991b1b', borderRadius: 4, color: '#fca5a5', cursor: 'pointer', fontWeight: 600 }}>Yes</button>
                          <button onClick={() => setConfirmRevoke(false)} style={{ fontSize: 11, color: '#888', background: 'none', border: 'none', cursor: 'pointer' }}>No</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Scrollable body */}
          <div data-scroll-container="true" style={{ flex: 1, overflowY: 'auto', paddingBottom: 16 }}>
            {/* Hint banner */}
            <div style={{ padding: '6px 18px', fontSize: 10, color: '#555', fontStyle: 'italic' }}>👁 This is what the student / parent will see</div>

            {/* Stats row */}
            <div style={{ padding: '10px 18px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div style={{ background: '#242424', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: attColor }}>Attendance · {overallPct === null ? '—' : `${overallPct}%`}</div>
              </div>
              <div style={{ background: '#242424', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#e8e8e8' }}>{attended} / {sessionsOccurred}</div>
                <div style={{ fontSize: 10, color: '#888' }}>Sessions attended</div>
              </div>
              <div style={{ background: '#242424', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: lastDemoScore !== null ? scoreColor(lastDemoScore) : '#888' }}>
                  {lastDemoScore !== null ? `${lastDemoScore} / 20` : '—'}
                </div>
                <div style={{ fontSize: 10, color: '#888' }}>Last demo score</div>
              </div>
            </div>

            {/* Attendance by week */}
            <div style={{ padding: '0 24px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Attendance by week</div>
              {visibleWeeks.map(w => {
                const days = getWeekAttendance(w);
                const pct = weekPct(w);
                const isCurrent = w === currentWeek;
                const dd = demoDayForWeek(w);
                const ddTotal = dd ? demoDayTotal(dd.id) : null;
                return (
                  <div key={w} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: '#888', width: 110, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>Week {w}</span>
                      {isCurrent && (
                        <>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block', marginLeft: 4, marginRight: 4, animation: 'spm-pulse 1.5s ease-in-out infinite' }} />
                          <span style={{ fontSize: 10, color: '#4ade80', fontWeight: 600 }}>(Current)</span>
                        </>
                      )}
                    </span>
                    <div style={{ display: 'flex', gap: 5, flex: 1 }}>
                      {days.map(d => {
                        const isDDCell = d.isDemo && isDemoWeek(w);
                        if (isDDCell) {
                          const scored = ddTotal !== null;
                          return (
                            <div key={d.idx} style={{
                              flex: 1, height: 26, borderRadius: 5,
                              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                              background: scored ? '#2a1f00' : '#1a1500',
                              border: `1px solid ${scored ? '#7a5000' : '#3a3000'}`,
                            }}>
                              <span style={{ fontSize: 8, color: scored ? '#9a6000' : '#555', textTransform: 'uppercase', fontWeight: 700, lineHeight: 1 }}>DD</span>
                              {scored && (
                                <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor(ddTotal!), lineHeight: 1 }}>{ddTotal}</span>
                              )}
                            </div>
                          );
                        }
                        const bg = d.state === 'c' ? '#14532d' : d.state === 'x' ? '#450a0a' : '#242424';
                        const border = d.state === 'c' ? '#166534' : d.state === 'x' ? '#7f1d1d' : '#333';
                        return (
                          <div key={`${w}-${d.idx}`} style={{
                            flex: 1, height: 26, borderRadius: 5, background: bg, border: `1px solid ${border}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <span style={emojiStyle} className="text-sm">
                              {d.state === 'c' ? '✅' : d.state === 'x' ? '❌' : ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <span style={{ fontSize: 11, color: '#666', width: 36, textAlign: 'right' }}>{pct}%</span>
                  </div>
                );
              })}
              {futureWeeksNote && (
                <div style={{ fontSize: 11, color: '#444', fontStyle: 'italic', marginTop: 8 }}>{futureWeeksNote}</div>
              )}
            </div>

            {/* Demo day performance */}
            {visibleDemoWeeks.length > 0 && (
              <div style={{ padding: '0 24px 20px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Demo day performance</div>
                {visibleDemoWeeks.map(w => {
                  const dd = demoDayForWeek(w);
                  if (!dd) return null;
                  const scores = demoScores.filter(s => s.demo_day_id === dd.id && s.student_id === student.id);
                  const total = demoDayTotal(dd.id);
                  const totalColor = total !== null ? scoreColor(total) : '#555';
                  const fb = demoFeedback?.find(f => f.demo_day_id === dd.id && f.student_id === student.id);
                  const notScored = total === null;
                  return (
                    <div key={dd.id} style={{ background: '#242424', borderRadius: 10, padding: 14, marginBottom: 8, border: '1px solid #333' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#e8e8e8' }}>{dd.title}</span>
                        <span style={{ fontSize: 11, color: '#666' }}>{dd.date || ''}</span>
                      </div>
                      {CRITERIA.map(criterion => {
                        const scoreRec = scores.find(s => s.criterion === criterion);
                        const scoreNum = scoreRec ? Number(scoreRec.score) : 0;
                        const pct = (scoreNum / 5) * 100;
                        const barColor = scoreNum >= 4 ? '#4ade80' : scoreNum >= 2.5 ? '#fbbf24' : '#f87171';
                        return (
                          <div key={criterion} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 11, color: '#aaa', width: 140, flexShrink: 0 }}>{criterion}</span>
                            <div style={{ flex: 1, height: 8, borderRadius: 4, background: '#1e1e1e' }}>
                              {!notScored && <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: barColor }} />}
                            </div>
                            <span style={{ fontSize: 11, color: notScored ? '#555' : '#e8e8e8', width: 24, textAlign: 'right' }}>
                              {notScored ? '—' : scoreNum}
                            </span>
                          </div>
                        );
                      })}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                        {notScored ? (
                          <span style={{ fontSize: 11, color: '#555', fontStyle: 'italic' }}>Not scored yet</span>
                        ) : (
                          <span style={{ fontSize: 13, fontWeight: 700, color: totalColor }}>{total} / 20</span>
                        )}
                      </div>
                      {fb?.feedback && (
                        <>
                          <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginTop: 10, marginBottom: 4 }}>Feedback</div>
                          <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, padding: '9px 11px', fontSize: 12, color: '#888', lineHeight: 1.6, fontStyle: 'italic' }}>
                            {fb.feedback}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
                {nextFutureDemoNumber !== null && (
                  <div style={{ fontSize: 11, color: '#444', fontStyle: 'italic', marginTop: 4 }}>
                    Demo day {String(nextFutureDemoNumber).padStart(2, '0')} will appear after week {nextFutureDemoWeek}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default StudentProgressModal;
