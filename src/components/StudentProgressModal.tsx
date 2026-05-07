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

  const firstName = student.name.split(' ')[0] || student.name;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}
        onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()}
          ref={cardRef}
          style={{ background: '#1e1e1e', border: '1px solid #2e2e2e', borderRadius: 14, maxWidth: 640, width: '90%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
          {/* Header (fixed) */}
          <div style={{ padding: '16px 18px', borderBottom: '1px solid #2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{student.name}</div>
              <div style={{ fontSize: 12, color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{batchName} · Week {weekNumber} of 6</div>
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
          <div data-scroll-container="true" style={{ flex: 1, overflowY: 'auto', padding: '0 18px 16px' }}>
            {/* Preview hint */}
            <div style={{ padding: '6px 0', fontSize: 10, color: '#888', fontStyle: 'italic' }}>👁 This is what the student / parent will see</div>

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
    </>
  );
};

export default StudentProgressModal;
