import React, { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import StudentProgressView from '@/components/StudentProgressView';

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

function generateSlug(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const rand = Array.from({ length: 6 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
  return `${base}-${rand}`;
}

const StudentProgressModal: React.FC<StudentProgressModalProps> = ({
  student, batchName, modName, weekNumber, startDate, attendance, demoDays, demoScores, demoFeedback, onClose,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);

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
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = shareUrl;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        alert('Copy failed. Please select and copy the URL manually.');
      } finally {
        document.body.removeChild(textArea);
      }
    }
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

  const firstName = student.name.split(' ')[0] || student.name;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'hsl(var(--background) / 0.75)' }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        ref={cardRef}
        style={{
          background: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 12,
          width: 'min(800px, 95vw)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
        }}>

        {/* Header */}
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid hsl(var(--border))', flexShrink: 0 }}>
          {/* Row 1: Name + Preview chip + Close */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{ fontSize: 22, fontWeight: 600, color: 'hsl(var(--foreground))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {student.name}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 500,
                background: 'hsl(var(--info-bg))', color: 'hsl(var(--info-text))',
                padding: '2px 8px', borderRadius: 9999,
                whiteSpace: 'nowrap', lineHeight: '16px',
              }}>Preview mode</span>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 36, height: 36,
                background: 'transparent',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                color: 'hsl(var(--muted-foreground))',
                cursor: 'pointer',
                fontSize: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'hsl(var(--secondary))')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >✕</button>
          </div>

          {/* Subtitle */}
          <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', fontWeight: 400, marginBottom: 12 }}>
            {batchName} · Moderator: {modName} · Week {weekNumber} of 6
          </div>

          {/* Row 2: Share link button + caption */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
            <button
              onClick={handleShareClick}
              style={{
                height: 36, padding: '0 14px',
                background: 'transparent',
                border: '1px solid hsl(var(--amber-border))',
                borderRadius: 8,
                color: 'hsl(var(--amber-text))',
                cursor: 'pointer',
                fontSize: 13, fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'background 0.15s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'hsl(var(--amber-bg))')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >🔗 Share link</button>
            <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>Live link · always shows latest</span>

            {/* Share popover */}
            {showSharePopover && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 8, width: 320,
                background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
                borderRadius: 8, padding: 16, zIndex: 100,
                boxShadow: '0 8px 30px hsl(var(--background) / 0.5)',
              }}
                onClick={(e) => e.stopPropagation()}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'hsl(var(--foreground))', marginBottom: 12 }}>Share {firstName}'s progress</div>
                {shareLoading ? (
                  <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>Generating link…</div>
                ) : shareRevoked ? (
                  <>
                    <div style={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 6, padding: '8px 12px', fontSize: 11, fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace", color: 'hsl(var(--muted-foreground))', marginBottom: 8, textDecoration: 'line-through' }}>{shareUrl}</div>
                    <div style={{ fontSize: 11, color: 'hsl(var(--score-red))', marginBottom: 8 }}>Link revoked</div>
                    <button onClick={handleRegenerateLink} style={{ fontSize: 11, color: 'hsl(var(--score-amber))', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Generate new link</button>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <input readOnly value={shareUrl} onClick={(e) => (e.target as HTMLInputElement).select()}
                        style={{ flex: 1, background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 6, padding: '8px 12px', fontSize: 11, fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace", color: 'hsl(var(--foreground))', outline: 'none' }} />
                      <button onClick={handleCopy} style={{ fontSize: 11, padding: '8px 12px', background: copied ? 'hsl(var(--success-bg))' : 'hsl(var(--amber-bg))', border: `1px solid ${copied ? 'hsl(var(--success-text))' : 'hsl(var(--amber-border))'}`, borderRadius: 6, color: copied ? 'hsl(var(--score-green))' : 'hsl(var(--score-amber))', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 600, transition: 'all 0.15s' }}>
                        {copied ? 'Copied ✓' : 'Copy'}
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginBottom: 12, lineHeight: 1.5 }}>Live link — always shows latest data. Anyone with the link can view.</div>
                    {!confirmRevoke ? (
                      <button onClick={() => setConfirmRevoke(true)} style={{ fontSize: 11, color: 'hsl(var(--score-red))', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Revoke link</button>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: 'hsl(var(--score-red))' }}>Revoke? Anyone with it will lose access.</span>
                        <button onClick={handleRevoke} style={{ fontSize: 11, padding: '4px 8px', background: 'hsl(var(--destructive))', border: '1px solid hsl(var(--destructive))', borderRadius: 4, color: 'hsl(var(--destructive-foreground))', cursor: 'pointer', fontWeight: 600 }}>Yes</button>
                        <button onClick={() => setConfirmRevoke(false)} style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', background: 'none', border: 'none', cursor: 'pointer' }}>No</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Scrollable body */}
        <div data-scroll-container="true" style={{ flex: 1, overflowY: 'auto', padding: '0 20px 16px' }}>
          <StudentProgressView
            student={student}
            batchName={batchName}
            modName={modName}
            weekNumber={weekNumber}
            startDate={startDate ?? null}
            attendance={attendance}
            demoDays={demoDays}
            demoScores={demoScores}
            demoFeedback={demoFeedback}
            showLiveBanner={false}
            hideHeader={true}
          />
        </div>
      </div>
    </div>
  );
};

export default StudentProgressModal;
