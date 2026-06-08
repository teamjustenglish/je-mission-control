import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, ArrowUp, Loader2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Phase = 'idle' | 'loading' | 'answered' | 'error';

const emojiStyle: React.CSSProperties = { fontFamily: '"Apple Color Emoji","Segoe UI Emoji",sans-serif' };

export default function ModHoustonChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [askedQuestion, setAskedQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-expand textarea height on input change
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [input]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Focus textarea when dialog opens
  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 60);
  }, [open]);

  const ask = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || phase === 'loading') return;

    setAskedQuestion(trimmed);
    setInput('');
    setAnswer('');
    setPhase('loading');

    try {
      const { data, error } = await supabase.functions.invoke('ask-houston-mod', {
        body: { question: trimmed },
      });
      if (error) throw error;
      const result = typeof data === 'string' ? JSON.parse(data) : data;
      if (!result || typeof result.answer !== 'string' || result.error) {
        throw new Error(result?.error || 'No answer returned');
      }
      setAnswer(result.answer);
      setPhase('answered');
    } catch (err) {
      console.error('ask-houston-mod failed:', err);
      setPhase('error');
    }
  };

  const handleSubmit = () => ask(input);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleClose = () => {
    setOpen(false);
    setInput('');
    setPhase('idle');
    setAskedQuestion('');
    setAnswer('');
  };

  const isLoading = phase === 'loading';

  return (
    <>
      {/* Trigger button in top bar */}
      <button
        type="button"
        aria-label="Ask Houston"
        onClick={() => setOpen(true)}
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          borderRadius: 8,
          border: '1px solid hsl(var(--border))',
          background: 'transparent',
          color: 'hsl(var(--muted-foreground))',
          cursor: 'pointer',
          transition: 'color 0.15s, border-color 0.15s, background 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'hsl(var(--houston))';
          e.currentTarget.style.borderColor = 'hsl(var(--houston))';
          e.currentTarget.style.background = 'hsl(var(--houston-bg))';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'hsl(var(--muted-foreground))';
          e.currentTarget.style.borderColor = 'hsl(var(--border))';
          e.currentTarget.style.background = 'transparent';
        }}
      >
        <Sparkles size={15} />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          {/* Panel */}
          <div
            style={{
              width: '100%', maxWidth: 540,
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 14,
              padding: '20px 22px 22px',
              display: 'flex', flexDirection: 'column', gap: 16,
              maxHeight: 'calc(100vh - 80px)',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={16} style={{ color: 'hsl(var(--houston))' }} />
                <span style={{ fontSize: 15, fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                  Ask Houston
                </span>
              </div>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: 6,
                  border: 'none', background: 'transparent',
                  color: 'hsl(var(--muted-foreground))', cursor: 'pointer',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'hsl(var(--foreground))'; e.currentTarget.style.background = 'hsl(var(--secondary))'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'hsl(var(--muted-foreground))'; e.currentTarget.style.background = 'transparent'; }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Subheading */}
            <p style={{ margin: 0, fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>
              Ask about your students, attendance, demo scores, or anything about your batch.
            </p>

            {/* Chat input */}
            <div
              style={{
                display: 'flex', alignItems: 'flex-end', gap: 8,
                background: 'hsl(var(--input-bg))',
                border: '1px solid hsl(var(--input-border))',
                borderRadius: 10, padding: 8,
              }}
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. Who's been absent the most this week?"
                rows={1}
                disabled={isLoading}
                className="text-foreground"
                style={{
                  flex: 1, resize: 'none',
                  background: 'transparent', border: 'none', outline: 'none',
                  fontSize: 14, lineHeight: 1.5,
                  padding: '6px 8px', maxHeight: 160, overflowY: 'auto',
                  fontFamily: 'Inter, sans-serif',
                }}
              />
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isLoading || !input.trim()}
                aria-label="Send"
                className="disabled:opacity-40"
                style={{
                  flexShrink: 0, width: 34, height: 34,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 8, border: 'none',
                  background: 'hsl(var(--houston))',
                  color: 'hsl(var(--houston-foreground))',
                  cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                <ArrowUp size={16} />
              </button>
            </div>

            {/* Q&A area */}
            {phase !== 'idle' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* You asked */}
                <div
                  style={{
                    background: 'hsl(var(--secondary))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 10, padding: '12px 14px',
                  }}
                >
                  <div className="text-muted-foreground" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4 }}>
                    You asked
                  </div>
                  <div className="text-foreground" style={{ fontSize: 14, lineHeight: 1.5 }}>{askedQuestion}</div>
                </div>

                {/* Loading */}
                {isLoading && (
                  <div
                    style={{
                      background: 'hsl(var(--houston-bg))',
                      border: '1px solid hsl(var(--houston-border))',
                      borderRadius: 10, padding: '12px 14px',
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}
                  >
                    <Loader2 size={15} className="animate-spin" style={{ color: 'hsl(var(--houston))' }} />
                    <span style={{ fontSize: 13, color: 'hsl(var(--houston))' }}>let me look into that...</span>
                  </div>
                )}

                {/* Answer */}
                {phase === 'answered' && (
                  <div
                    style={{
                      background: 'hsl(var(--houston-bg))',
                      border: '1px solid hsl(var(--houston-border))',
                      borderRadius: 10, padding: '14px 16px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <Sparkles size={14} style={{ color: 'hsl(var(--houston))' }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--houston))' }}>Houston</span>
                    </div>
                    <div
                      className="text-foreground"
                      style={{ fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}
                    >
                      {answer}
                    </div>
                    {/* Ask another */}
                    <button
                      type="button"
                      onClick={() => { setPhase('idle'); setAskedQuestion(''); setAnswer(''); setTimeout(() => textareaRef.current?.focus(), 30); }}
                      style={{
                        marginTop: 12, fontSize: 12, fontWeight: 500,
                        padding: '5px 12px', borderRadius: 6,
                        border: '1px solid hsl(var(--houston-border))',
                        background: 'transparent', color: 'hsl(var(--houston))',
                        cursor: 'pointer',
                      }}
                    >
                      Ask another question
                    </button>
                  </div>
                )}

                {/* Error */}
                {phase === 'error' && (
                  <div
                    style={{
                      background: 'hsl(var(--danger-bg))',
                      border: '1px solid hsl(var(--danger-text) / 0.3)',
                      borderRadius: 10, padding: '14px 16px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <Sparkles size={14} style={{ color: 'hsl(var(--houston))' }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--houston))' }}>Houston</span>
                    </div>
                    <div className="text-foreground" style={{ fontSize: 14, lineHeight: 1.6 }}>
                      oh no, something broke on my end <span style={emojiStyle}>🥲</span> try again in a sec?
                    </div>
                    <button
                      type="button"
                      onClick={() => ask(askedQuestion)}
                      style={{
                        marginTop: 10, fontSize: 12, fontWeight: 600,
                        padding: '5px 12px', borderRadius: 6,
                        border: 'none', background: 'hsl(var(--houston))',
                        color: 'hsl(var(--houston-foreground))', cursor: 'pointer',
                      }}
                    >
                      Try again
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
