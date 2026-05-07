import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getSessionLabel, isDemoWeek, CRITERIA, getSessionsOccurred, computeAttendancePct, getCurrentWeek } from '@/lib/batchtrack';

interface ShareLink { id: string; student_id: string; slug: string; revoked_at: string | null; }
interface Student { id: string; name: string; batch_id: string; }
interface Batch { id: string; name: string; start_date: string | null; mod_id: string; }
interface AttRec { student_id: string; session_index: number; state: string; absence_note?: string | null; }
interface DemoDay { id: string; title: string; date: string | null; day_number: number; batch_id: string; }
interface DemoScore { id: string; demo_day_id: string; student_id: string; criterion: string; score: number; }
interface DemoFeedback { id: string; demo_day_id: string; student_id: string; feedback: string; }

const scoreColor = (n: number) => n >= 15 ? '#4ade80' : n >= 10 ? '#fbbf24' : '#f87171';
const cellScoreColor = (n: number) => n >= 4 ? '#4ade80' : n >= 2.5 ? '#fbbf24' : '#f87171';

const StudentShare: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const [student, setStudent] = useState<Student | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [modName, setModName] = useState('');
  const [attendance, setAttendance] = useState<AttRec[]>([]);
  const [demoDays, setDemoDays] = useState<DemoDay[]>([]);
  const [demoScores, setDemoScores] = useState<DemoScore[]>([]);
  const [demoFeedback, setDemoFeedback] = useState<DemoFeedback[]>([]);
  const [linkId, setLinkId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!slug) { setError('No link provided'); setLoading(false); return; }

    // 1. Look up share link
    const { data: linkData, error: linkErr } = await supabase
      .from('student_share_links')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (linkErr || !linkData || linkData.revoked_at) {
      setError('This link is not found or has been revoked.');
      setLoading(false);
      return;
    }

    setLinkId(linkData.id);
    const studentId = linkData.student_id;

    // 2. Fetch student
    const { data: stu } = await supabase.from('students').select('*').eq('id', studentId).single();
    if (!stu) { setError('Student not found.'); setLoading(false); return; }
    setStudent(stu as Student);

    // 3. Fetch batch
    const { data: b } = await supabase.from('batches').select('*').eq('id', stu.batch_id).single();
    setBatch(b as Batch | null);

    // 4. Fetch mod profile
    if (b?.mod_id) {
      const { data: prof } = await supabase.from('profiles').select('name').eq('id', b.mod_id).single();
      setModName(prof?.name || '');
    }

    // 5. Fetch attendance, demo data
    const [attRes, ddRes, dsRes, dfRes] = await Promise.all([
      supabase.from('attendance').select('*').eq('student_id', studentId),
      supabase.from('demo_days').select('*').eq('batch_id', stu.batch_id),
      supabase.from('demo_scores').select('*').eq('student_id', studentId),
      supabase.from('demo_feedback').select('*').eq('student_id', studentId),
    ]);

    setAttendance((attRes.data || []) as AttRec[]);
    setDemoDays((ddRes.data || []) as DemoDay[]);
    setDemoScores((dsRes.data || []) as DemoScore[]);
    setDemoFeedback((dfRes.data || []) as DemoFeedback[]);
    setLastFetched(new Date());
    setLoading(false);

    // Fire-and-forget: update last_viewed_at
    supabase.from('student_share_links').update({ last_viewed_at: new Date().toISOString() } as any).eq('id', linkData.id).then(() => {});
  }, [slug]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 30s
  useEffect(() => {
    if (error) return;
    const interval = setInterval(() => { fetchData(); }, 30000);
    return () => clearInterval(interval);
  }, [fetchData, error]);

  const timeAgo = () => {
    if (!lastFetched) return '';
    const secs = Math.floor((Date.now() - lastFetched.getTime()) / 1000);
    if (secs < 10) return 'just now';
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    return `${mins} min${mins > 1 ? 's' : ''} ago`;
  };

  // Re-render timeAgo every 10s
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 10000);
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f0f0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#888', fontSize: 14 }}>Loading…</p>
      </div>
    );
  }

  if (error || !student || !batch) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f0f0f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ fontSize: 32, fontWeight: 700, color: '#fff' }}>Just English</div>
        <div style={{ fontSize: 14, color: '#888' }}>{error || 'Something went wrong.'}</div>
      </div>
    );
  }

  const weekNumber = getCurrentWeek(batch.start_date) ?? 1;
  const sessionsOccurred = batch.start_date ? getSessionsOccurred(batch.start_date) : 0;
  const studentAtt = attendance.filter(a => a.student_id === student.id);
  const present = studentAtt.filter(a => a.state === 'c').length;
  const overallPct = computeAttendancePct(present, 1, sessionsOccurred);
  const attColor = overallPct === null ? '#555' : overallPct >= 70 ? '#4ade80' : overallPct >= 50 ? '#fbbf24' : '#f87171';

  const demoDayTotal = (ddId: string): number | null => {
    const scores = demoScores.filter(s => s.demo_day_id === ddId && s.student_id === student.id);
    if (scores.length === 0) return null;
    const total = scores.reduce((sum, s) => sum + Number(s.score), 0);
    return total === 0 ? null : Math.round(total * 10) / 10;
  };

  const demoDaysCompleted = demoDays.filter(dd => demoDayTotal(dd.id) !== null).length;
  const totalDemoDays = demoDays.length;

  const lastDemoScore = (() => {
    const scored = demoDays.filter(dd => demoDayTotal(dd.id) !== null).sort((a, b) => b.day_number - a.day_number);
    if (scored.length === 0) return null;
    return demoDayTotal(scored[0].id);
  })();
  const lastDemoNumber = (() => {
    const scored = demoDays.filter(dd => demoDayTotal(dd.id) !== null).sort((a, b) => b.day_number - a.day_number);
    return scored.length > 0 ? scored[0].day_number : null;
  })();

  const getWeekAttendance = (w: number) => {
    const startIdx = (w - 1) * 4;
    return [0, 1, 2, 3].map(d => {
      const idx = startIdx + d;
      const info = getSessionLabel(idx);
      const rec = studentAtt.find(a => a.session_index === idx);
      return { ...info, state: rec?.state || 'e', idx };
    });
  };

  const visibleWeeks = [1, 2, 3, 4, 5, 6];
  const visibleDemoWeeks = [2, 4, 6].filter(w => w <= weekNumber);
  const demoDayForWeek = (w: number) => {
    if (!isDemoWeek(w)) return null;
    const dn = w / 2;
    return demoDays.find(dd => dd.day_number === dn) || null;
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f0f', color: '#e8e8e8', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px' }}>
        {/* Live banner */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 0 10px', borderBottom: '1px solid #1a1a1a' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', display: 'inline-block', animation: 'share-pulse 1.5s ease-in-out infinite' }} />
          <span style={{ fontSize: 12, color: '#4ade80', fontWeight: 600 }}>Live</span>
          <span style={{ fontSize: 12, color: '#555' }}>· Updated {timeAgo()}</span>
        </div>

        {/* Header */}
        <div style={{ padding: '20px 0 16px' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{student.name}</div>
          <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
            {batch.name} · Moderator: {modName} · Week {weekNumber} of 6
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
          <div style={{ background: '#1a1a1a', borderRadius: 10, padding: '14px 12px', textAlign: 'center', border: '1px solid #222' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: attColor }}>{overallPct === null ? '—' : `${overallPct}%`}</div>
            <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>Attendance</div>
            <div style={{ fontSize: 10, color: '#555' }}>{present} of {sessionsOccurred} sessions</div>
          </div>
          <div style={{ background: '#1a1a1a', borderRadius: 10, padding: '14px 12px', textAlign: 'center', border: '1px solid #222' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#e8e8e8' }}>{demoDaysCompleted} / {totalDemoDays}</div>
            <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>Demo days</div>
            <div style={{ fontSize: 10, color: '#555' }}>completed so far</div>
          </div>
          <div style={{ background: '#1a1a1a', borderRadius: 10, padding: '14px 12px', textAlign: 'center', border: '1px solid #222' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: lastDemoScore !== null ? scoreColor(lastDemoScore) : '#555' }}>
              {lastDemoScore !== null ? `${lastDemoScore} / 20` : '—'}
            </div>
            <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>Last demo</div>
            <div style={{ fontSize: 10, color: '#555' }}>{lastDemoNumber !== null ? `Demo Day ${lastDemoNumber}` : '—'}</div>
          </div>
        </div>

        {/* Attendance by week */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Attendance by week</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
            {visibleWeeks.map(w => {
              const days = getWeekAttendance(w);
              const isFuture = w > weekNumber;
              const presentCount = days.filter(d => d.state === 'c').length;
              const totalInWeek = isFuture ? 0 : Math.min(4, sessionsOccurred - (w - 1) * 4);
              return (
                <div key={w} style={{ background: '#1a1a1a', borderRadius: 8, padding: '10px 6px 8px', textAlign: 'center', border: '1px solid #222', opacity: isFuture ? 0.4 : 1 }}>
                  <div style={{ fontSize: 10, color: w === weekNumber ? '#4ade80' : '#666', fontWeight: 600, marginBottom: 6 }}>W{w}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 6 }}>
                    {days.map(d => {
                      const sessionOccurred = d.idx < sessionsOccurred;
                      const bg = d.state === 'c' ? '#14532d' : d.state === 'x' ? '#450a0a' : sessionOccurred ? '#242424' : '#151515';
                      const border = d.state === 'c' ? '#166534' : d.state === 'x' ? '#7f1d1d' : '#2a2a2a';
                      return (
                        <div key={d.idx} style={{ width: '100%', aspectRatio: '1', borderRadius: 4, background: bg, border: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 10 }}>
                            {d.state === 'c' ? '✅' : d.state === 'x' ? '❌' : sessionOccurred ? '·' : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 10, color: '#666' }}>
                    {isFuture ? '—' : `${presentCount} / ${Math.max(totalInWeek, 0)}`}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 10, color: '#555' }}>
            <span>✅ Present</span><span>❌ Absent</span><span style={{ color: '#444' }}>· Not marked</span>
          </div>
        </div>

        {/* Demo days */}
        {visibleDemoWeeks.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Demo days</div>
            {[1, 2, 3].map(dn => {
              const dd = demoDays.find(d => d.day_number === dn);
              if (!dd) return null;
              const isFuture = dn * 2 > weekNumber;
              const scores = demoScores.filter(s => s.demo_day_id === dd.id && s.student_id === student.id);
              const total = demoDayTotal(dd.id);
              const fb = demoFeedback.find(f => f.demo_day_id === dd.id && f.student_id === student.id);
              // Check if student was absent on demo day
              const demoSessionIdx = (dn * 2 - 1) * 4 + 3; // Friday of demo week
              const demoAtt = studentAtt.find(a => a.session_index === demoSessionIdx);
              const wasAbsent = demoAtt?.state === 'x';

              return (
                <div key={dd.id} style={{ background: '#1a1a1a', borderRadius: 10, padding: 16, marginBottom: 10, border: '1px solid #222', opacity: isFuture ? 0.55 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#e8e8e8' }}>Demo Day {dn}</span>
                      {wasAbsent && <span style={{ fontSize: 10, background: '#450a0a', color: '#f87171', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>Absent</span>}
                    </div>
                    <span style={{ fontSize: 11, color: '#555' }}>{dd.date || ''}</span>
                  </div>

                  {isFuture ? (
                    <div style={{ fontSize: 12, color: '#555', fontStyle: 'italic' }}>Not yet</div>
                  ) : wasAbsent ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 8 }}>
                        {CRITERIA.map(c => (
                          <div key={c} style={{ background: '#151515', borderRadius: 6, padding: '8px 4px', textAlign: 'center' }}>
                            <div style={{ fontSize: 9, color: '#555', marginBottom: 4 }}>{c.split(' ')[0]}</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#555' }}>—</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#f87171' }}>Absent</div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 8 }}>
                        {CRITERIA.map(c => {
                          const s = scores.find(sc => sc.criterion === c);
                          const val = s ? Number(s.score) : 0;
                          const notScored = total === null;
                          return (
                            <div key={c} style={{ background: '#151515', borderRadius: 6, padding: '8px 4px', textAlign: 'center' }}>
                              <div style={{ fontSize: 9, color: '#555', marginBottom: 4 }}>{c.split(' ')[0]}</div>
                              <div style={{ fontSize: 14, fontWeight: 600, color: notScored ? '#555' : cellScoreColor(val) }}>
                                {notScored ? '—' : val}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {total !== null ? (
                          <span style={{ fontSize: 14, fontWeight: 700, color: scoreColor(total) }}>{total} / 20</span>
                        ) : (
                          <span style={{ fontSize: 12, color: '#555', fontStyle: 'italic' }}>Not scored yet</span>
                        )}
                      </div>
                      {fb?.feedback && (
                        <div style={{ marginTop: 10, borderLeft: '3px solid #4ade80', paddingLeft: 12 }}>
                          <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Feedback</div>
                          <div style={{ fontSize: 13, color: '#999', lineHeight: 1.5, fontStyle: 'italic' }}>{fb.feedback}</div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: '1px solid #1a1a1a', padding: '20px 0 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#444' }}>Just English Mission Control</div>
          <div style={{ fontSize: 11, color: '#333', marginTop: 4 }}>This page updates automatically. Refresh anytime.</div>
        </div>
      </div>

      <style>{`@keyframes share-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
    </div>
  );
};

export default StudentShare;
