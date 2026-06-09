import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ArrowUp, Sparkles, Loader2, Mic } from 'lucide-react';
import { toast } from 'sonner';
import { randomHoustonVerb } from '@/lib/houston-verbs';

type Phase = 'idle' | 'loading' | 'answered' | 'error';

const emojiStyle: React.CSSProperties = { fontFamily: '"Apple Color Emoji","Segoe UI Emoji",sans-serif' };

// Browser-native speech recognition — no backend or API key required.
// NOTE: Accuracy varies for Sri Lankan English. Consider migrating to OpenAI
// Whisper via a new transcribe-audio Edge Function if accent recognition
// becomes a complaint.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SpeechRecognitionAPI: any =
  typeof window !== 'undefined'
    ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null)
    : null;

const HoustonPage: React.FC = () => {
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [askedQuestion, setAskedQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  // Ref (not state) used in onend to decide whether to auto-restart.
  // Must be set to false BEFORE calling rec.stop() to prevent restart.
  const isRecordingRef = useRef(false);
  const savedInputRef = useRef('');

  // Auto-expand textarea height on input change, capped at 200px
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [input]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      if (recognitionRef.current) recognitionRef.current.abort();
    };
  }, []);

  const stopRecording = () => {
    // Set ref to false BEFORE stop() so onend doesn't trigger an auto-restart
    isRecordingRef.current = false;
    setIsRecording(false);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const handleMicClick = () => {
    if (isRecording) {
      stopRecording();
      return;
    }

    savedInputRef.current = input.trimEnd();

    const rec = new SpeechRecognitionAPI();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-IN';
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      isRecordingRef.current = true;
      setIsRecording(true);
    };

    rec.onresult = (e: any) => {
      // Accumulate all results (final + interim) into one transcript string
      const transcript: string = Array.from(e.results as any[])
        .map((r: any) => r[0].transcript)
        .join('');
      const prefix = savedInputRef.current;
      setInput(prefix + (prefix.length > 0 ? ' ' : '') + transcript);
    };

    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed') {
        toast.error('Mic access denied. Allow microphone in your browser settings to use voice input.');
      }
      // All other errors: silent recovery — restore input to pre-recording value
      setInput(savedInputRef.current);
      savedInputRef.current = '';
      isRecordingRef.current = false;
      recognitionRef.current = null;
      setIsRecording(false);
    };

    rec.onend = () => {
      if (isRecordingRef.current) {
        // Chrome's ~60s session timeout fired mid-recording — user still wants
        // to record, so restart transparently on the same instance.
        if (textareaRef.current) {
          // Update savedInput so the next session appends to what we have
          savedInputRef.current = textareaRef.current.value.trimEnd();
        }
        try {
          rec.start();
        } catch {
          // If restart fails, give up gracefully
          isRecordingRef.current = false;
          recognitionRef.current = null;
          setIsRecording(false);
        }
      } else {
        recognitionRef.current = null;
        savedInputRef.current = '';
        setIsRecording(false);
      }
    };

    recognitionRef.current = rec;
    rec.start();
  };

  const ask = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || phase === 'loading') return;

    // Stop any active recording before sending
    if (isRecordingRef.current) stopRecording();

    setAskedQuestion(trimmed);
    setInput('');
    setAnswer('');
    setPhase('loading');

    try {
      const { data, error } = await supabase.functions.invoke('ask-houston', {
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
      console.error('ask-houston failed:', err);
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

  const isIdle = phase === 'idle';
  const isLoading = phase === 'loading';

  const [verb, setVerb] = useState(randomHoustonVerb);
  useEffect(() => {
    if (!isLoading) return;
    setVerb(randomHoustonVerb());
    const id = setInterval(() => setVerb(randomHoustonVerb()), 2000);
    return () => clearInterval(id);
  }, [isLoading]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minHeight: 'calc(100vh - 48px)',
        justifyContent: isIdle ? 'center' : 'flex-start',
        paddingTop: isIdle ? 0 : 16,
        paddingBottom: 56,
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 36, lineHeight: 1, marginBottom: 12, ...emojiStyle }}>✨</div>
        <h1 className="text-foreground" style={{ fontSize: 26, fontWeight: 600, margin: 0 }}>
          Ask Houston
        </h1>
        <p className="text-muted-foreground" style={{ fontSize: 14, marginTop: 6 }}>
          Anything about your batches, mods, students, or trends.
        </p>
      </div>

      {/* Chat input */}
      <div style={{ width: '100%', maxWidth: 600 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 8,
            background: 'hsl(var(--input-bg))',
            border: '1px solid hsl(var(--input-border))',
            borderRadius: 12,
            padding: 8,
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Houston anything..."
            rows={1}
            disabled={isLoading}
            className="text-foreground"
            style={{
              flex: 1,
              resize: 'none',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 14,
              lineHeight: 1.5,
              padding: '8px 8px',
              maxHeight: 200,
              overflowY: 'auto',
              fontFamily: 'Inter, sans-serif',
            }}
          />

          {/* Mic button — only rendered when browser supports SpeechRecognition */}
          {SpeechRecognitionAPI && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {/* Pulsing dot — visible only while recording */}
              {isRecording && (
                <span
                  className="animate-pulse"
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: '#f0a020',
                    display: 'inline-block',
                  }}
                />
              )}
              <button
                type="button"
                onClick={handleMicClick}
                disabled={isLoading}
                aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
                className="disabled:opacity-40"
                style={{
                  width: 36,
                  height: 36,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 8,
                  border: '1px solid hsl(var(--input-border))',
                  background: 'transparent',
                  color: isRecording ? '#f0a020' : 'hsl(var(--muted-foreground))',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  transition: 'color 0.15s',
                }}
              >
                <Mic size={16} />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading || !input.trim()}
            aria-label="Send"
            className="disabled:opacity-40"
            style={{
              flexShrink: 0,
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              border: 'none',
              background: 'hsl(var(--houston))',
              color: 'hsl(var(--houston-foreground))',
              cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            <ArrowUp size={18} />
          </button>
        </div>
      </div>

      {/* Q&A area */}
      {!isIdle && (
        <div style={{ width: '100%', maxWidth: 600, marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* You asked */}
          <div
            style={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 12,
              padding: '14px 16px',
            }}
          >
            <div className="text-muted-foreground" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
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
                borderRadius: 12,
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Loader2 size={16} className="animate-spin" style={{ color: 'hsl(var(--houston))' }} />
              <span style={{ fontSize: 14, color: 'hsl(var(--houston))' }}>{verb}...</span>
            </div>
          )}

          {/* Answer */}
          {phase === 'answered' && (
            <div
              style={{
                background: 'hsl(var(--houston-bg))',
                border: '1px solid hsl(var(--houston-border))',
                borderRadius: 12,
                padding: '16px 18px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                <Sparkles size={15} style={{ color: 'hsl(var(--houston))' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'hsl(var(--houston))' }}>Houston</span>
              </div>
              <div
                className="text-foreground"
                style={{ fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}
              >
                {answer}
              </div>
            </div>
          )}

          {/* Error */}
          {phase === 'error' && (
            <div
              style={{
                background: 'hsl(var(--danger-bg))',
                border: '1px solid hsl(var(--danger-text) / 0.3)',
                borderRadius: 12,
                padding: '16px 18px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                <Sparkles size={15} style={{ color: 'hsl(var(--houston))' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'hsl(var(--houston))' }}>Houston</span>
              </div>
              <div className="text-foreground" style={{ fontSize: 14, lineHeight: 1.6 }}>
                oh no something broke on my end <span style={emojiStyle}>🥲</span> try again in a sec?
              </div>
              <button
                type="button"
                onClick={() => ask(askedQuestion)}
                style={{
                  marginTop: 12,
                  fontSize: 13,
                  fontWeight: 600,
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'hsl(var(--houston))',
                  color: 'hsl(var(--houston-foreground))',
                  cursor: 'pointer',
                }}
              >
                Try again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default HoustonPage;
