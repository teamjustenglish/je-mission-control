import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentWeek } from '@/lib/batchtrack';
import StudentProgressView from '@/components/StudentProgressView';

const StudentShare: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const [student, setStudent] = useState<any>(null);
  const [batch, setBatch] = useState<any>(null);
  const [modName, setModName] = useState('');
  const [attendance, setAttendance] = useState<any[]>([]);
  const [demoDays, setDemoDays] = useState<any[]>([]);
  const [demoScores, setDemoScores] = useState<any[]>([]);
  const [demoFeedback, setDemoFeedback] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    if (!slug) { setError('No link provided'); setLoading(false); return; }

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

    const studentId = linkData.student_id;

    const { data: stu } = await supabase.from('students').select('*').eq('id', studentId).single();
    if (!stu) { setError('Student not found.'); setLoading(false); return; }
    setStudent(stu);

    const { data: b } = await supabase.from('batches').select('*').eq('id', stu.batch_id).single();
    setBatch(b);

    if (b?.mod_id) {
      const { data: prof } = await supabase.from('profiles').select('name').eq('id', b.mod_id).single();
      setModName(prof?.name || '');
    }

    const [attRes, ddRes, dsRes, dfRes] = await Promise.all([
      supabase.from('attendance').select('*').eq('student_id', studentId),
      supabase.from('demo_days').select('*').eq('batch_id', stu.batch_id),
      supabase.from('demo_scores').select('*').eq('student_id', studentId),
      supabase.from('demo_feedback').select('*').eq('student_id', studentId),
    ]);

    setAttendance(attRes.data || []);
    setDemoDays(ddRes.data || []);
    setDemoScores(dsRes.data || []);
    setDemoFeedback(dfRes.data || []);
    setLastFetched(new Date());
    setLoading(false);

    // Fire-and-forget: update last_viewed_at
    supabase.from('student_share_links').update({ last_viewed_at: new Date().toISOString() } as any).eq('id', linkData.id).then(() => {});
  }, [slug]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (error) return;
    const interval = setInterval(() => { fetchData(); }, 30000);
    return () => clearInterval(interval);
  }, [fetchData, error]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'hsl(var(--background))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: 14 }}>Loading…</p>
      </div>
    );
  }

  if (error || !student || !batch) {
    return (
      <div style={{ minHeight: '100vh', background: 'hsl(var(--background))', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ fontSize: 32, fontWeight: 700, color: 'hsl(var(--foreground))' }}>Just English</div>
        <div style={{ fontSize: 14, color: 'hsl(var(--muted-foreground))' }}>{error || 'Something went wrong.'}</div>
      </div>
    );
  }

  const weekNumber = getCurrentWeek(batch.start_date) ?? 1;

  return (
    <div style={{ minHeight: '100vh', background: 'hsl(var(--background))' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px' }}>
        <StudentProgressView
          student={student}
          batchName={batch.name}
          modName={modName}
          weekNumber={weekNumber}
          startDate={batch.start_date}
          attendance={attendance}
          demoDays={demoDays}
          demoScores={demoScores}
          demoFeedback={demoFeedback}
          showLiveBanner={true}
          lastUpdatedAt={lastFetched ?? undefined}
        />
      </div>
    </div>
  );
};

export default StudentShare;
