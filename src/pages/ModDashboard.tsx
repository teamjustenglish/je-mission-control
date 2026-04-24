import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { logActivity, getSessionLabel, getWeekSessions, isDemoWeek, MONTHS, CRITERIA } from '@/lib/batchtrack';
import { Plus, Trash2, ChevronDown, ChevronRight, Grid3X3, List } from 'lucide-react';
import StudentReport from '@/components/StudentReport';
import ScoringRubric from '@/components/ScoringRubric';
import StudentProgressModal from '@/components/StudentProgressModal';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

interface Batch { id: string; name: string; mod_id: string; month: number; year: number; label: string; start_date?: string | null; }
interface Student { id: string; batch_id: string; name: string; }
interface AttendanceRecord { id: string; student_id: string; batch_id: string; session_index: number; state: string; absence_note?: string | null; }
interface DemoDay { id: string; batch_id: string; title: string; date: string | null; day_number: number; }
interface DemoScore { id: string; demo_day_id: string; student_id: string; criterion: string; score: number; }
interface DemoFeedback { id: string; demo_day_id: string; student_id: string; feedback: string; }
interface RescheduledSession { id: string; batch_id: string; week_number: number; day_name: string; original_date: string | null; new_date: string; reason: string | null; created_by: string; from_week?: number | null; from_day?: string | null; to_week?: number | null; to_date?: string | null; }

const emojiStyle: React.CSSProperties = { fontFamily: '"Apple Color Emoji","Segoe UI Emoji",sans-serif' };

const btnPress = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.transform = 'scale(0.98)'; };
const btnRelease = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.transform = ''; };
const cancelBtnStyle: React.CSSProperties = { background: '#2a2a2a', border: '1px solid #444', color: '#ccc', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'background 0.1s, transform 0.05s' };
const primaryBtnStyle: React.CSSProperties = { background: '#fff', border: '1px solid #fff', color: '#111', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'background 0.1s, transform 0.05s' };
const destructBtnStyle: React.CSSProperties = { background: '#7f1d1d', border: '1px solid #991b1b', color: '#fca5a5', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'background 0.1s, transform 0.05s' };

// Attendance cell with tooltip for ❌ states — BUG FIXES: yellow dot position, hover bridge, no ⋮
const AttendanceCell: React.FC<{
  state: string;
  isDemo: boolean;
  absenceNote?: string | null;
  onClick: () => void;
  onNoteClick: () => void;
}> = ({ state, isDemo, absenceNote, onClick, onNoteClick }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout>>();

  const handleMouseEnter = () => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    if (state === 'x') setShowTooltip(true);
  };
  const handleMouseLeave = () => {
    hideTimeout.current = setTimeout(() => setShowTooltip(false), 150);
  };

  return (
    <div
      style={{ position: 'relative' }}
      className="flex items-center justify-center cursor-pointer w-full h-full py-2"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {state === 'c' ? (
        <span style={emojiStyle} className="text-[18px] leading-none" onClick={onClick}>✅</span>
      ) : state === 'x' ? (
        <>
          <span style={{ position: 'relative', display: 'inline-block', paddingBottom: 8, marginBottom: -8 }}>
            <span style={emojiStyle} className="text-[18px] leading-none" onClick={onClick}>❌</span>
            {absenceNote ? (
              <span style={{
                position: 'absolute', top: -3, right: -3,
                width: 7, height: 7, borderRadius: '50%',
                background: '#4ade80',
                border: '2px solid #1e1e1e',
                zIndex: 10,
              }} />
            ) : (
              <span className="pulse-dot" style={{
                position: 'absolute', top: -3, right: -3,
                width: 7, height: 7, borderRadius: '50%',
                background: '#FBBF24',
                border: '2px solid #1e1e1e',
                zIndex: 10,
              }} />
            )}
          </span>
          {/* Tooltip — BUG 2 fix: margin bridge */}
          {showTooltip && (
            <div
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              style={{
                position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                marginBottom: -8, paddingBottom: 14,
                zIndex: 50, pointerEvents: 'auto',
              }}
            >
              <div style={{
                background: '#252525', border: '1px solid #333', borderRadius: 9,
                padding: '10px 13px', minWidth: 185, maxWidth: 220,
              }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.05em' }}>Absence note</div>
                {absenceNote ? (
                  <>
                    <div style={{ fontSize: 13, color: '#e8e8e8', lineHeight: 1.4, marginBottom: 6 }}>{absenceNote}</div>
                    <button onClick={(e) => { e.stopPropagation(); onNoteClick(); }} style={{ fontSize: 11, color: '#FBBF24', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      <span style={emojiStyle}>✏️</span> Edit note
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 13, color: '#555', fontStyle: 'italic', marginBottom: 6 }}>No reason added yet</div>
                    <button onClick={(e) => { e.stopPropagation(); onNoteClick(); }} style={{ fontSize: 11, color: '#FBBF24', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      <span style={emojiStyle}>✏️</span> Add note
                    </button>
                  </>
                )}
                {/* Arrow */}
                <div style={{
                  position: 'absolute', bottom: 9, left: '50%', transform: 'translateX(-50%)',
                  width: 0, height: 0,
                  borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
                  borderTop: '5px solid #252525',
                }} />
              </div>
            </div>
          )}
        </>
      ) : (
        <div
          className="w-[22px] h-[22px] rounded-[5px]"
          onClick={onClick}
          style={{
            border: isDemo ? '1.5px solid hsl(var(--amber-border))' : '1.5px solid hsl(var(--checkbox-border))',
            background: 'transparent',
          }}
        />
      )}
    </div>
  );
};

// Column header dropdown menu
const ColumnMenu: React.FC<{
  sessionIndex: number;
  isRescheduled: boolean;
  onMarkAllPresent?: () => void;
  onMarkAllAbsent?: () => void;
  onReschedule: () => void;
  onEditReschedule?: () => void;
  onRemoveReschedule?: () => void;
  rescheduleDisabled?: boolean;
  hideMarkAll?: boolean;
}> = ({ isRescheduled, onMarkAllPresent, onMarkAllAbsent, onReschedule, onEditReschedule, onRemoveReschedule, rescheduleDisabled, hideMarkAll }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        style={{
          width: 20, height: 20, borderRadius: 4, border: '1px solid #333',
          color: '#555', background: '#222', cursor: 'pointer', fontSize: 12,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1,
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => { const t = e.currentTarget; t.style.background = '#2e2e2e'; t.style.color = '#fff'; t.style.borderColor = '#555'; }}
        onMouseLeave={(e) => { const t = e.currentTarget; t.style.background = '#222'; t.style.color = '#555'; t.style.borderColor = '#333'; }}
      >⋮</button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4,
          background: '#252525', border: '1px solid #333', borderRadius: 9,
          padding: 5, minWidth: 195, zIndex: 50,
        }}>
          {isRescheduled ? (
            <>
              <button
                onClick={() => { setOpen(false); onEditReschedule?.(); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 13px', fontSize: 13, color: '#d4920a', borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.background = '#2e2e2e'; (e.target as HTMLElement).style.color = '#fff'; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = '#d4920a'; }}
              >↻ Edit reschedule</button>
              <button
                onClick={() => { setOpen(false); onRemoveReschedule?.(); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 13px', fontSize: 13, color: '#888', borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.background = '#2e2e2e'; (e.target as HTMLElement).style.color = '#fff'; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = '#888'; }}
              >✕ Remove reschedule</button>
            </>
          ) : (
            <>
              <button
                onClick={() => { if (rescheduleDisabled) return; setOpen(false); onReschedule(); }}
                title={rescheduleDisabled ? 'Maximum reschedules reached (3 of 3)' : ''}
                disabled={rescheduleDisabled}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 13px', fontSize: 13, color: rescheduleDisabled ? '#555' : '#d4920a', borderRadius: 6, background: 'transparent', border: 'none', cursor: rescheduleDisabled ? 'not-allowed' : 'pointer' }}
                onMouseEnter={(e) => { if (rescheduleDisabled) return; (e.target as HTMLElement).style.background = '#2e2e2e'; (e.target as HTMLElement).style.color = '#fff'; }}
                onMouseLeave={(e) => { if (rescheduleDisabled) return; (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = '#d4920a'; }}
              >↻ Reschedule session</button>
              {!hideMarkAll && <>
                <div style={{ height: 1, background: '#333', margin: '4px 0' }} />
                <button
                  onClick={() => { setOpen(false); onMarkAllPresent?.(); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 13px', fontSize: 13, color: '#888', borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.background = '#2e2e2e'; (e.target as HTMLElement).style.color = '#fff'; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = '#888'; }}
                >✓ Mark all present</button>
                <button
                  onClick={() => { setOpen(false); onMarkAllAbsent?.(); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 13px', fontSize: 13, color: '#888', borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.background = '#2e2e2e'; (e.target as HTMLElement).style.color = '#fff'; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = '#888'; }}
                >✗ Mark all absent</button>
              </>}
            </>
          )}
        </div>
      )}
    </div>
  );
};

// Score input with validation: 0-5, decimals allowed, fully controlled
const ScoreInput: React.FC<{
  value: string;
  onChange: (val: string) => void;
}> = ({ value, onChange }) => {
  const [flash, setFlash] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { inputRef.current?.blur(); return; }
    if (e.key === 'Backspace' || e.key === 'Tab' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Delete') return;
    if (!/[\d.]/.test(e.key)) { e.preventDefault(); }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '' || raw === '.') { onChange(raw); return; }
    const num = parseFloat(raw);
    if (isNaN(num)) { setFlash(true); onChange(''); setTimeout(() => setFlash(false), 400); return; }
    if (num > 5) { setFlash(true); onChange(''); setTimeout(() => setFlash(false), 400); return; }
    if (num < 0) { onChange(''); return; }
    // Allow 0..5 inclusive (including exactly 5)
    onChange(raw);
  };

  const handleBlur = () => {
    if (value === '' || value === '.') return;
    const num = parseFloat(value);
    if (isNaN(num)) { onChange(''); return; }
    if (num < 0) { onChange(''); return; }
    if (num > 5) { setFlash(true); onChange(''); setTimeout(() => setFlash(false), 400); return; }
    // num is 0..5 inclusive — keep it (do NOT clear when num === 5)
  };

  return (
    <input
      ref={inputRef} type="text" inputMode="decimal"
      value={value} onChange={handleChange} onBlur={handleBlur}
      onKeyDown={handleKeyPress}
      className="score-input"
      style={{
        width: 44, textAlign: 'center', fontSize: 12, padding: '3px 6px',
        border: flash ? '1.5px solid #f87171' : '1px solid hsl(var(--input-border))',
        borderRadius: 5, background: 'hsl(var(--input-bg))', color: 'hsl(var(--foreground))',
        MozAppearance: 'textfield', outline: 'none', transition: 'border-color 0.2s',
      }}
    />
  );
};

const ModDashboard: React.FC = () => {
  const { user, profile, signOut } = useAuth();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [demoDays, setDemoDays] = useState<DemoDay[]>([]);
  const [demoScores, setDemoScores] = useState<DemoScore[]>([]);
  const [demoFeedback, setDemoFeedback] = useState<DemoFeedback[]>([]);
  const [rescheduledSessions, setRescheduledSessions] = useState<RescheduledSession[]>([]);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [allWeeksView, setAllWeeksView] = useState(false);
  const [showCreateBatch, setShowCreateBatch] = useState(false);
  const [demoDaysExpanded, setDemoDaysExpanded] = useState(false);
  const [newBatchMonth, setNewBatchMonth] = useState(new Date().getMonth() + 1);
  const [newBatchYear, setNewBatchYear] = useState(new Date().getFullYear());
  const [newBatchLabel, setNewBatchLabel] = useState('');
  const [newBatchStartDate, setNewBatchStartDate] = useState('');
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [hoveredStudentId, setHoveredStudentId] = useState<string | null>(null);
  const [reportStudent, setReportStudent] = useState<Student | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Student | null>(null);
  const [progressModalStudent, setProgressModalStudent] = useState<Student | null>(null);

  // Edit batch modal state
  const [editBatchId, setEditBatchId] = useState<string | null>(null);
  const [editBatchMonth, setEditBatchMonth] = useState(1);
  const [editBatchYear, setEditBatchYear] = useState(2026);
  const [editBatchLabel, setEditBatchLabel] = useState('');
  const [editBatchStartDate, setEditBatchStartDate] = useState('');

  // Delete batch state
  const [deleteBatchConfirm, setDeleteBatchConfirm] = useState<Batch | null>(null);
  const [batchContextMenu, setBatchContextMenu] = useState<{ batchId: string; x: number; y: number } | null>(null);
  const [savedVisible, setSavedVisible] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'saved'>('idle');
  const savedTimeout = useRef<ReturnType<typeof setTimeout>>();
  const syncTimeout = useRef<ReturnType<typeof setTimeout>>();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const batchCreatedRef = useRef(false); // BUG 4: prevent duplicate

  // --- Batch data cache ---
  interface BatchCacheEntry {
    students: Student[];
    attendance: AttendanceRecord[];
    demoDays: DemoDay[];
    demoScores: DemoScore[];
    demoFeedback: DemoFeedback[];
    rescheduledSessions: RescheduledSession[];
  }
  const batchCacheRef = useRef<Record<string, BatchCacheEntry>>({});
  const initialLoadDone = useRef(false);

  // Feedback modal state
  const [feedbackModal, setFeedbackModal] = useState<{
    demoDayId: string; studentId: string; studentName: string; demoDayTitle: string; demoDayDate: string | null; totalScore: string;
  } | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const feedbackTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Score values state: keyed by "demoDayId|studentId|criterion" → string value
  const [scoreValues, setScoreValues] = useState<Record<string, string>>({});
  const scoreDebounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Absence note modal state
  const [noteModal, setNoteModal] = useState<{
    studentId: string; sessionIndex: number; studentName: string; dayLabel: string; dateLabel: string;
  } | null>(null);
  const [noteText, setNoteText] = useState('');

  // Reschedule modal state — new flow: pick a Wednesday from week 1-6
  const [rescheduleModal, setRescheduleModal] = useState<{
    sessionIndex: number; dayName: string; weekNumber: number; existingId?: string;
  } | null>(null);
  const [selectedWednesdayWeek, setSelectedWednesdayWeek] = useState<number | null>(null);
  // Removal confirmation
  const [removeRescheduleConfirm, setRemoveRescheduleConfirm] = useState<RescheduledSession | null>(null);
  
  // Absence note reminder banner
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const activeBatch = batches.find(b => b.id === activeBatchId);

  const showSaved = () => {
    setSavedVisible(true);
    if (savedTimeout.current) clearTimeout(savedTimeout.current);
    savedTimeout.current = setTimeout(() => setSavedVisible(false), 2000);
  };

  const showSyncStatus = (status: 'idle' | 'syncing' | 'saved') => {
    setSyncStatus(status);
    if (syncTimeout.current) clearTimeout(syncTimeout.current);
    if (status === 'saved') {
      syncTimeout.current = setTimeout(() => setSyncStatus('idle'), 2000);
    }
  };

  // Save current state back to cache
  const saveToCacheFromState = useCallback(() => {
    if (!activeBatchId) return;
    batchCacheRef.current[activeBatchId] = { students, attendance, demoDays, demoScores, demoFeedback, rescheduledSessions };
  }, [activeBatchId, students, attendance, demoDays, demoScores, demoFeedback, rescheduledSessions]);

  // Keep cache in sync with state changes
  useEffect(() => { saveToCacheFromState(); }, [saveToCacheFromState]);

  // Fetch a single batch's data from Supabase
  const fetchBatchData = useCallback(async (batchId: string): Promise<BatchCacheEntry> => {
    const [studentsRes, attendanceRes, demoDaysRes, rescheduledRes] = await Promise.all([
      supabase.from('students').select('*').eq('batch_id', batchId).order('created_at'),
      supabase.from('attendance').select('*').eq('batch_id', batchId),
      supabase.from('demo_days').select('*').eq('batch_id', batchId).order('day_number'),
      supabase.from('rescheduled_sessions').select('*').eq('batch_id', batchId),
    ]);
    const fetchedStudents = studentsRes.data || [];
    const fetchedAttendance = (attendanceRes.data || []) as AttendanceRecord[];
    const fetchedDemoDays = demoDaysRes.data || [];
    const fetchedRescheduled = (rescheduledRes.data || []) as RescheduledSession[];
    let fetchedDemoScores: DemoScore[] = [];
    let fetchedDemoFeedback: DemoFeedback[] = [];
    const ddIds = fetchedDemoDays.map(d => d.id);
    if (ddIds.length > 0) {
      const [scoresRes, feedbackRes] = await Promise.all([
        supabase.from('demo_scores').select('*').in('demo_day_id', ddIds),
        supabase.from('demo_feedback').select('*').in('demo_day_id', ddIds),
      ]);
      if (scoresRes.data) fetchedDemoScores = scoresRes.data;
      if (feedbackRes.data) fetchedDemoFeedback = feedbackRes.data as DemoFeedback[];
    }
    return { students: fetchedStudents, attendance: fetchedAttendance, demoDays: fetchedDemoDays, demoScores: fetchedDemoScores, demoFeedback: fetchedDemoFeedback, rescheduledSessions: fetchedRescheduled };
  }, []);

  // Apply cached data to active state
  const applyCacheToState = useCallback((entry: BatchCacheEntry) => {
    setStudents(entry.students);
    setAttendance(entry.attendance);
    setDemoDays(entry.demoDays);
    setDemoScores(entry.demoScores);
    setDemoFeedback(entry.demoFeedback);
    setRescheduledSessions(entry.rescheduledSessions);
  }, []);

  // Switch batch tab — instant from cache, no fetch
  const switchBatch = useCallback((batchId: string) => {
    if (batchId === activeBatchId) return;
    setActiveBatchId(batchId);
    const cached = batchCacheRef.current[batchId];
    if (cached) {
      applyCacheToState(cached);
    }
    // If not cached yet (shouldn't happen after initial load), fetch
    if (!cached) {
      fetchBatchData(batchId).then(entry => {
        batchCacheRef.current[batchId] = entry;
        // Only apply if still active
        setActiveBatchId(prev => {
          if (prev === batchId) applyCacheToState(entry);
          return prev;
        });
      });
    }
  }, [activeBatchId, applyCacheToState, fetchBatchData]);

  // Initial load: fetch batches, load first immediately, background-load rest
  useEffect(() => {
    if (!user || initialLoadDone.current) return;
    initialLoadDone.current = true;
    (async () => {
      const { data } = await supabase.from('batches').select('*').eq('mod_id', user.id).order('created_at');
      if (!data || data.length === 0) { setBatches(data || []); return; }
      setBatches(data);
      // Load first batch immediately
      const firstId = data[0].id;
      setActiveBatchId(firstId);
      const firstData = await fetchBatchData(firstId);
      batchCacheRef.current[firstId] = firstData;
      applyCacheToState(firstData);
      // Background-load remaining batches
      for (let i = 1; i < data.length; i++) {
        const bId = data[i].id;
        const bData = await fetchBatchData(bId);
        batchCacheRef.current[bId] = bData;
      }
    })();
  }, [user, fetchBatchData, applyCacheToState]);

  // Reload batches list (after creating a new batch)
  const loadBatches = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('batches').select('*').eq('mod_id', user.id).order('created_at');
    if (data) setBatches(data);
  }, [user]);

  // Reload current batch data from Supabase (for error recovery)
  const loadBatchData = useCallback(async () => {
    if (!activeBatchId) return;
    const entry = await fetchBatchData(activeBatchId);
    batchCacheRef.current[activeBatchId] = entry;
    applyCacheToState(entry);
  }, [activeBatchId, fetchBatchData, applyCacheToState]);

  const getSessionDate = (sessionIndex: number): string | null => {
    if (!activeBatch?.start_date) return null;
    const start = new Date(activeBatch.start_date);
    const week = Math.floor(sessionIndex / 4);
    const dayInWeek = sessionIndex % 4;
    const dayOffsets = [0, 1, 3, 4];
    const date = new Date(start);
    date.setDate(start.getDate() + week * 7 + dayOffsets[dayInWeek]);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  const getSessionDateObj = (sessionIndex: number): Date | null => {
    if (!activeBatch?.start_date) return null;
    const start = new Date(activeBatch.start_date);
    const week = Math.floor(sessionIndex / 4);
    const dayInWeek = sessionIndex % 4;
    const dayOffsets = [0, 1, 3, 4];
    const date = new Date(start);
    date.setDate(start.getDate() + week * 7 + dayOffsets[dayInWeek]);
    return date;
  };

  const isSessionRescheduled = (sessionIndex: number): RescheduledSession | undefined => {
    const info = getSessionLabel(sessionIndex);
    const week = Math.floor(sessionIndex / 4) + 1;
    const dayName = info.isDemo ? 'Demo day' : info.day;
    return rescheduledSessions.find(r =>
      ((r.from_week ?? r.week_number) === week) && ((r.from_day ?? r.day_name) === dayName)
    );
  };

  const createBatch = async () => {
    if (!user || !newBatchLabel.trim()) return;
    // BUG 4: check existing
    const monthName = MONTHS[newBatchMonth - 1];
    const batchName = `${monthName} ${newBatchYear} · ${newBatchLabel.trim()}`;
    const existing = batches.find(b => b.name === batchName);
    if (existing) { setActiveBatchId(existing.id); setShowCreateBatch(false); return; }

    const { data } = await supabase.from('batches').insert({
      mod_id: user.id, name: batchName, month: newBatchMonth, year: newBatchYear, label: newBatchLabel.trim(),
    }).select().single();
    if (data) {
      await supabase.from('demo_days').insert([
        { batch_id: data.id, title: 'Demo day 01', day_number: 1 },
        { batch_id: data.id, title: 'Demo day 02', day_number: 2 },
        { batch_id: data.id, title: 'Demo day 03', day_number: 3 },
      ]);
      await logActivity(user.id, profile?.name || '', 'batch_created', `Created batch ${batchName}`, batchName);
      setShowCreateBatch(false); setNewBatchLabel(''); setNewBatchStartDate('');
      // Fetch the new batch data into cache and switch to it
      const newData = await fetchBatchData(data.id);
      batchCacheRef.current[data.id] = newData;
      applyCacheToState(newData);
      setActiveBatchId(data.id);
      await loadBatches();
    }
  };

  // Double-click tab → open edit modal
  const openEditBatch = (batch: Batch) => {
    setEditBatchId(batch.id);
    setEditBatchMonth(batch.month);
    setEditBatchYear(batch.year);
    setEditBatchLabel(batch.label);
    setEditBatchStartDate((batch as any).start_date || '');
  };

  const saveEditBatch = async () => {
    if (!editBatchId || !user || !editBatchLabel.trim()) return;
    const monthName = MONTHS[editBatchMonth - 1];
    const newName = `${monthName} ${editBatchYear} · ${editBatchLabel.trim()}`;
    await supabase.from('batches').update({
      name: newName, month: editBatchMonth, year: editBatchYear, label: editBatchLabel.trim(),
    }).eq('id', editBatchId);
    setBatches(prev => prev.map(b => b.id === editBatchId ? { ...b, name: newName, month: editBatchMonth, year: editBatchYear, label: editBatchLabel.trim() } : b));
    setEditBatchId(null);
    showSaved();
  };

  // Right-click tab → delete batch
  const deleteBatch = async (batch: Batch) => {
    // Cascade delete: demo_scores → demo_days, attendance, rescheduled_sessions, students, then batch
    const dds = (await supabase.from('demo_days').select('id').eq('batch_id', batch.id)).data || [];
    if (dds.length > 0) {
      await supabase.from('demo_scores').delete().in('demo_day_id', dds.map(d => d.id));
    }
    await supabase.from('demo_days').delete().eq('batch_id', batch.id);
    await supabase.from('attendance').delete().eq('batch_id', batch.id);
    await supabase.from('rescheduled_sessions').delete().eq('batch_id', batch.id);
    await supabase.from('students').delete().eq('batch_id', batch.id);
    await supabase.from('batches').delete().eq('id', batch.id);
    delete batchCacheRef.current[batch.id];
    const remaining = batches.filter(b => b.id !== batch.id);
    setBatches(remaining);
    if (activeBatchId === batch.id) {
      if (remaining.length > 0) {
        switchBatch(remaining[0].id);
      } else {
        setActiveBatchId(null);
        setStudents([]); setAttendance([]); setDemoDays([]); setDemoScores([]); setDemoFeedback([]); setRescheduledSessions([]);
      }
    }
    setDeleteBatchConfirm(null);
    if (user) {
      await logActivity(user.id, profile?.name || '', 'batch_deleted', `Deleted batch ${batch.name}`, batch.name);
    }
  };

  // Dismiss context menu on outside click or Escape
  useEffect(() => {
    if (!batchContextMenu) return;
    const handler = () => setBatchContextMenu(null);
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') setBatchContextMenu(null); };
    document.addEventListener('click', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('click', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [batchContextMenu]);


    const addStudent = async () => {
    const { data } = await supabase.from('students').insert({ batch_id: activeBatchId, name: '' }).select().single();
    if (data) {
      setStudents(prev => [...prev, data]);
      setEditingStudentId(data.id);
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  };

  const updateStudentName = async (studentId: string, name: string) => {
    await supabase.from('students').update({ name }).eq('id', studentId);
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, name } : s));
    if (name && user && activeBatch) {
      await logActivity(user.id, profile?.name || '', 'student_added', `Added student ${name}`, activeBatch.name);
    }
    setEditingStudentId(null);
  };

  const confirmRemoveStudent = (student: Student) => setDeleteConfirm(student);

  const removeStudent = async (student: Student) => {
    await supabase.from('attendance').delete().eq('student_id', student.id);
    await supabase.from('demo_feedback').delete().eq('student_id', student.id);
    await supabase.from('demo_scores').delete().eq('student_id', student.id);
    await supabase.from('students').delete().eq('id', student.id);
    setStudents(prev => prev.filter(s => s.id !== student.id));
    setDeleteConfirm(null);
    if (user && activeBatch) {
      await logActivity(user.id, profile?.name || '', 'student_removed', `Removed student ${student.name}`, activeBatch.name);
    }
  };

  // BUG 5: Optimistic attendance updates
  const cycleAttendance = async (studentId: string, sessionIndex: number) => {
    if (!activeBatchId) return;
    const existing = attendance.find(a => a.student_id === studentId && a.session_index === sessionIndex);
    let newState: string;
    if (!existing || existing.state === 'e') newState = 'c';
    else if (existing.state === 'c') newState = 'x';
    else newState = 'e';

    // Optimistic update
    showSyncStatus('syncing');
    if (existing) {
      const updateData: Partial<AttendanceRecord> = { state: newState };
      if (newState !== 'x') updateData.absence_note = null;
      setAttendance(prev => prev.map(a => a.id === existing.id ? { ...a, ...updateData } : a));
      // Background sync
      supabase.from('attendance').update({ state: newState, ...(newState !== 'x' ? { absence_note: null } : {}) }).eq('id', existing.id)
        .then(({ error }) => { if (error) { loadBatchData(); showSyncStatus('idle'); } else { showSyncStatus('saved'); } });
    } else {
      const tempId = `temp-${Date.now()}`;
      const optimistic: AttendanceRecord = { id: tempId, student_id: studentId, batch_id: activeBatchId, session_index: sessionIndex, state: newState };
      setAttendance(prev => [...prev, optimistic]);
      supabase.from('attendance').insert({ student_id: studentId, batch_id: activeBatchId, session_index: sessionIndex, state: newState })
        .select().single().then(({ data, error }) => {
          if (error) { setAttendance(prev => prev.filter(a => a.id !== tempId)); showSyncStatus('idle'); }
          else if (data) { setAttendance(prev => prev.map(a => a.id === tempId ? data as AttendanceRecord : a)); showSyncStatus('saved'); }
        });
    }
    showSaved();
    if (user && activeBatch) {
      const week = Math.floor(sessionIndex / 4) + 1;
      logActivity(user.id, profile?.name || '', 'attendance_marked', `Marked Week ${week} attendance`, activeBatch.name);
    }
  };

  // Mark all present/absent for a session
  const markAllForSession = async (sessionIndex: number, state: 'c' | 'x') => {
    if (!activeBatchId) return;
    for (const student of students) {
      const existing = attendance.find(a => a.student_id === student.id && a.session_index === sessionIndex);
      if (existing) {
        setAttendance(prev => prev.map(a => a.id === existing.id ? { ...a, state } : a));
        supabase.from('attendance').update({ state }).eq('id', existing.id);
      } else {
        const tempId = `temp-${Date.now()}-${student.id}`;
        setAttendance(prev => [...prev, { id: tempId, student_id: student.id, batch_id: activeBatchId, session_index: sessionIndex, state }]);
        supabase.from('attendance').insert({ student_id: student.id, batch_id: activeBatchId, session_index: sessionIndex, state })
          .select().single().then(({ data }) => {
            if (data) setAttendance(prev => prev.map(a => a.id === tempId ? data as AttendanceRecord : a));
          });
      }
    }
    showSaved();
  };

  const getAttendanceState = (studentId: string, sessionIndex: number): string => {
    return attendance.find(a => a.student_id === studentId && a.session_index === sessionIndex)?.state || 'e';
  };

  const getAbsenceNote = (studentId: string, sessionIndex: number): string | null => {
    return attendance.find(a => a.student_id === studentId && a.session_index === sessionIndex)?.absence_note || null;
  };

  const openNoteModal = (studentId: string, sessionIndex: number) => {
    const student = students.find(s => s.id === studentId);
    const info = getSessionLabel(sessionIndex);
    const dateStr = getSessionDate(sessionIndex) || '';
    const existing = getAbsenceNote(studentId, sessionIndex);
    setNoteText(existing || '');
    setNoteModal({
      studentId, sessionIndex,
      studentName: student?.name || 'Student',
      dayLabel: info.day,
      dateLabel: dateStr,
    });
  };

  const saveAbsenceNote = async () => {
    if (!noteModal) return;
    const rec = attendance.find(a => a.student_id === noteModal.studentId && a.session_index === noteModal.sessionIndex);
    if (rec) {
      await supabase.from('attendance').update({ absence_note: noteText || null }).eq('id', rec.id);
      setAttendance(prev => prev.map(a => a.id === rec.id ? { ...a, absence_note: noteText || null } : a));
    }
    setNoteModal(null);
    showSaved();
  };

  // === Reschedule v2: max 3, Wednesdays only ===
  const MAX_RESCHEDULES = 3;
  const reschedulesUsed = rescheduledSessions.length;
  const reschedulesRemaining = Math.max(0, MAX_RESCHEDULES - reschedulesUsed);

  // Compute Wednesday date for a given week (week 1-6) using batch start_date (Monday of week 1)
  const getWednesdayDate = (week: number): Date | null => {
    if (!activeBatch?.start_date) return null;
    const start = new Date(activeBatch.start_date);
    const d = new Date(start);
    d.setDate(start.getDate() + (week - 1) * 7 + 2); // Mon=0, Wed=+2
    return d;
  };
  const fmtDate = (d: Date | null) => d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  // Is the Wednesday of `week` already used by a reschedule?
  const wednesdayUsedBy = (week: number): RescheduledSession | undefined => {
    return rescheduledSessions.find(r => (r.to_week ?? null) === week);
  };

  // Does a week tab contain a rescheduled-to Wednesday?
  const weekHasWednesday = (week: number) => !!wednesdayUsedBy(week);

  // Reschedule handlers — open modal for a specific original session
  const openRescheduleModal = (sessionIndex: number, existingId?: string) => {
    if (!existingId && reschedulesRemaining <= 0) return;
    const info = getSessionLabel(sessionIndex);
    const weekNum = Math.floor(sessionIndex / 4) + 1;
    const dayName = info.isDemo ? 'Demo day' : info.day;
    const existing = rescheduledSessions.find(r => r.id === existingId);
    setSelectedWednesdayWeek(existing?.to_week ?? null);
    setRescheduleModal({ sessionIndex, dayName, weekNumber: weekNum, existingId });
  };

  const saveReschedule = async () => {
    if (!rescheduleModal || !activeBatchId || !user || selectedWednesdayWeek == null) return;
    const wedDate = getWednesdayDate(selectedWednesdayWeek);
    if (!wedDate) return;
    const toDateStr = wedDate.toISOString().split('T')[0];
    const fromWeek = rescheduleModal.weekNumber;
    const fromDay = rescheduleModal.dayName;
    if (rescheduleModal.existingId) {
      await supabase.from('rescheduled_sessions').update({
        from_week: fromWeek, from_day: fromDay,
        to_week: selectedWednesdayWeek, to_date: toDateStr,
        new_date: toDateStr, week_number: fromWeek, day_name: fromDay,
      } as any).eq('id', rescheduleModal.existingId);
      setRescheduledSessions(prev => prev.map(r => r.id === rescheduleModal.existingId
        ? { ...r, from_week: fromWeek, from_day: fromDay, to_week: selectedWednesdayWeek, to_date: toDateStr, new_date: toDateStr, week_number: fromWeek, day_name: fromDay }
        : r));
    } else {
      const { data } = await supabase.from('rescheduled_sessions').insert({
        batch_id: activeBatchId,
        week_number: fromWeek, day_name: fromDay,
        from_week: fromWeek, from_day: fromDay,
        to_week: selectedWednesdayWeek, to_date: toDateStr,
        original_date: getSessionDateObj(rescheduleModal.sessionIndex)?.toISOString().split('T')[0] || null,
        new_date: toDateStr,
        created_by: user.id,
      } as any).select().single();
      if (data) setRescheduledSessions(prev => [...prev, data as RescheduledSession]);
    }
    const desc = `Rescheduled W${fromWeek} ${fromDay} → W${selectedWednesdayWeek} Wed (${fmtDate(wedDate)})`;
    await logActivity(user.id, profile?.name || '', 'session_rescheduled', desc, activeBatch?.name || '');
    setRescheduleModal(null);
    setSelectedWednesdayWeek(null);
    showSaved();
  };

  const removeReschedule = async (id: string) => {
    await supabase.from('rescheduled_sessions').delete().eq('id', id);
    setRescheduledSessions(prev => prev.filter(r => r.id !== id));
    setRemoveRescheduleConfirm(null);
    showSaved();
  };

  // Stats
  const totalStudents = students.length;
  const totalSessions = 24;
  const avgAttendance = (() => {
    if (students.length === 0) return 0;
    const totalPossible = students.length * totalSessions;
    const present = attendance.filter(a => a.state === 'c').length;
    return totalPossible > 0 ? Math.round((present / totalPossible) * 100) : 0;
  })();
  const avgDemoScore = (() => {
    if (demoScores.length === 0) return 0;
    const avg = demoScores.reduce((sum, s) => sum + Number(s.score), 0) / demoScores.length;
    return Math.round(avg * 10) / 10;
  })();
  const sessionsLogged = (() => {
    const loggedSessions = new Set<number>();
    attendance.forEach(a => { if (a.state !== 'e') loggedSessions.add(a.session_index); });
    return loggedSessions.size;
  })();

  // Initialize scoreValues from demoScores whenever demoScores changes (e.g. on batch load)
  useEffect(() => {
    const vals: Record<string, string> = {};
    for (const s of demoScores) {
      const key = `${s.demo_day_id}|${s.student_id}|${s.criterion}`;
      if (Number(s.score) !== 0) vals[key] = String(s.score);
    }
    setScoreValues(vals);
  }, [demoScores]);

  const updateScoreValue = (demoDayId: string, studentId: string, criterion: string, rawVal: string) => {
    const key = `${demoDayId}|${studentId}|${criterion}`;
    setScoreValues(prev => ({ ...prev, [key]: rawVal }));

    // Debounce supabase sync
    if (scoreDebounceTimers.current[key]) clearTimeout(scoreDebounceTimers.current[key]);
    scoreDebounceTimers.current[key] = setTimeout(() => {
      const num = parseFloat(rawVal);
      const score = (!rawVal || rawVal === '.' || isNaN(num)) ? 0 : num;
      const existing = demoScores.find(s => s.demo_day_id === demoDayId && s.student_id === studentId && s.criterion === criterion);
      showSyncStatus('syncing');
      if (existing) {
        supabase.from('demo_scores').update({ score }).eq('id', existing.id)
          .then(({ error }) => {
            if (error) { loadBatchData(); showSyncStatus('idle'); }
            else {
              setDemoScores(prev => prev.map(s => s.id === existing.id ? { ...s, score } : s));
              showSyncStatus('saved');
            }
          });
      } else {
        const tempId = `temp-score-${Date.now()}-${key}`;
        setDemoScores(prev => [...prev, { id: tempId, demo_day_id: demoDayId, student_id: studentId, criterion, score }]);
        supabase.from('demo_scores').insert({ demo_day_id: demoDayId, student_id: studentId, criterion, score })
          .select().single().then(({ data, error }) => {
            if (error) { setDemoScores(prev => prev.filter(s => s.id !== tempId)); showSyncStatus('idle'); }
            else if (data) { setDemoScores(prev => prev.map(s => s.id === tempId ? data : s)); showSyncStatus('saved'); }
          });
      }
      showSaved();
      if (user && activeBatch) {
        logActivity(user.id, profile?.name || '', 'demo_score_added', `Added Demo day scores`, activeBatch.name);
      }
    }, 1000);
  };

  const getScoreValue = (demoDayId: string, studentId: string, criterion: string): string => {
    const key = `${demoDayId}|${studentId}|${criterion}`;
    return scoreValues[key] ?? '';
  };

  const getStudentDemoTotal = (demoDayId: string, studentId: string): string => {
    let hasAny = false;
    let total = 0;
    for (const c of CRITERIA) {
      const key = `${demoDayId}|${studentId}|${c}`;
      const val = scoreValues[key];
      if (val && val !== '.' && val !== '') {
        const num = parseFloat(val);
        if (!isNaN(num) && num > 0) { hasAny = true; total += num; }
      }
    }
    if (!hasAny) return '—';
    return (Math.round(total * 10) / 10).toString();
  };

  const getTotalColor = (totalStr: string): string => {
    if (totalStr === '—') return 'hsl(var(--muted-foreground))';
    const val = parseFloat(totalStr);
    if (val >= 16) return '#4ade80';
    if (val >= 12) return '#fbbf24';
    return '#f87171';
  };

  const getFeedback = (demoDayId: string, studentId: string): DemoFeedback | undefined => {
    return demoFeedback.find(f => f.demo_day_id === demoDayId && f.student_id === studentId);
  };

  const openFeedbackModal = (demoDayId: string, studentId: string, dd: DemoDay) => {
    const student = students.find(s => s.id === studentId);
    const existing = getFeedback(demoDayId, studentId);
    const totalScore = getStudentDemoTotal(demoDayId, studentId);
    setFeedbackText(existing?.feedback || '');
    setFeedbackModal({
      demoDayId, studentId,
      studentName: student?.name || 'Student',
      demoDayTitle: dd.title,
      demoDayDate: dd.date,
      totalScore,
    });
    setTimeout(() => {
      if (feedbackTextareaRef.current) {
        feedbackTextareaRef.current.style.height = 'auto';
        feedbackTextareaRef.current.style.height = feedbackTextareaRef.current.scrollHeight + 'px';
      }
    }, 50);
  };

  const saveFeedback = async () => {
    if (!feedbackModal) return;
    const existing = getFeedback(feedbackModal.demoDayId, feedbackModal.studentId);
    if (existing) {
      await supabase.from('demo_feedback').update({ feedback: feedbackText, updated_at: new Date().toISOString() } as any).eq('id', existing.id);
      setDemoFeedback(prev => prev.map(f => f.id === existing.id ? { ...f, feedback: feedbackText } : f));
    } else {
      const { data } = await supabase.from('demo_feedback').insert({
        demo_day_id: feedbackModal.demoDayId,
        student_id: feedbackModal.studentId,
        feedback: feedbackText,
      } as any).select().single();
      if (data) setDemoFeedback(prev => [...prev, data as DemoFeedback]);
    }
    setFeedbackModal(null);
    showSaved();
  };

  if (reportStudent && activeBatch) {
    return (
      <StudentReport
        student={reportStudent} batch={activeBatch} students={students}
        attendance={attendance} demoDays={demoDays} demoScores={demoScores}
        modName={profile?.name || ''} onBack={() => setReportStudent(null)}
      />
    );
  }

  const weekSessions = getWeekSessions(selectedWeek);
  const attendanceColor = avgAttendance >= 70 ? 'hsl(var(--score-green))' : avgAttendance >= 50 ? 'hsl(var(--score-amber))' : 'hsl(var(--score-red))';

  // Wednesday helpers — synthetic session_index = 1000 + (week-1) for the optional Wed column
  const WED_BASE = 1000;
  const wedSessionIndex = (week: number) => WED_BASE + (week - 1);
  const getRescheduleForWeekWed = (week: number): RescheduledSession | undefined =>
    rescheduledSessions.find(r => (r.to_week ?? null) === week);

  // Render column header with ⋮ menu
  const renderColumnHeader = (si: number, info: { day: string; week: number; isDemo: boolean }) => {
    const dateStr = getSessionDate(si);
    const rescheduled = isSessionRescheduled(si);

    return (
      <th key={si} className="text-center py-2 font-medium" style={{
        fontSize: 12, position: 'relative',
        background: rescheduled ? '#1e1800' : (info.isDemo ? 'hsl(var(--demo-col-bg))' : 'hsl(var(--grid-header-bg))'),
        color: rescheduled ? '#d4920a' : (info.isDemo ? 'hsl(var(--amber-text))' : 'hsl(var(--muted-foreground))'),
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span style={{ fontWeight: rescheduled ? 600 : undefined }}>
            {info.isDemo ? 'Demo day' : info.day}{rescheduled ? ' ↻' : ''}
          </span>
          <ColumnMenu
            sessionIndex={si}
            isRescheduled={!!rescheduled}
            onMarkAllPresent={() => markAllForSession(si, 'c')}
            onMarkAllAbsent={() => markAllForSession(si, 'x')}
            onReschedule={() => openRescheduleModal(si)}
            onEditReschedule={() => openRescheduleModal(si, rescheduled?.id)}
            onRemoveReschedule={() => rescheduled && setRemoveRescheduleConfirm(rescheduled)}
            rescheduleDisabled={!rescheduled && reschedulesRemaining <= 0}
          />
        </div>
        {rescheduled ? (
          <div style={{ fontSize: 9, color: '#9a6000' }}>
            rescheduled → W{rescheduled.to_week ?? '?'} Wed
          </div>
        ) : (
          dateStr && <div style={{ fontSize: 10, opacity: 0.7 }}>{dateStr}</div>
        )}
      </th>
    );
  };

  // Render Wednesday column header (target of a reschedule)
  const renderWedHeader = (week: number) => {
    const r = getRescheduleForWeekWed(week);
    if (!r) return null;
    const wedDate = getWednesdayDate(week);
    const dateStr = wedDate ? wedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
    return (
      <th key={`wed-${week}`} className="text-center py-2 font-medium" style={{
        fontSize: 12, position: 'relative',
        background: '#0d1a0d', color: '#4ade80',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Wed</span>
          <ColumnMenu
            sessionIndex={wedSessionIndex(week)}
            isRescheduled={true}
            onReschedule={() => {}}
            onEditReschedule={() => openRescheduleModal((((r.from_week ?? r.week_number) - 1) * 4) + (['Mon','Tue','Thu','Fri'].indexOf(r.from_day ?? r.day_name) >= 0 ? ['Mon','Tue','Thu','Fri'].indexOf(r.from_day ?? r.day_name) : 0), r.id)}
            onRemoveReschedule={() => setRemoveRescheduleConfirm(r)}
          />
        </div>
        <div style={{ fontSize: 9, color: '#4ade80', opacity: 0.7 }}>
          ↻ from W{r.from_week ?? r.week_number} {r.from_day ?? r.day_name}
        </div>
        {dateStr && <div style={{ fontSize: 10, color: '#4ade80', opacity: 0.5 }}>{dateStr}</div>}
      </th>
    );
  };

  // Render attendance cell or rescheduled badge
  const renderCell = (studentId: string, sessionIndex: number, isDemo: boolean) => {
    const rescheduled = isSessionRescheduled(sessionIndex);
    if (rescheduled) {
      return (
        <div className="flex items-center justify-center py-2" style={{ background: '#1e1800' }}>
          <div style={{
            width: 26, height: 26, borderRadius: 5,
            background: '#2a1f00', border: '1.5px solid #5a4a00',
            color: '#d4920a', fontSize: 14, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>↻</div>
        </div>
      );
    }
    const state = getAttendanceState(studentId, sessionIndex);
    const note = getAbsenceNote(studentId, sessionIndex);
    return (
      <div data-absence-cell={state === 'x' && !note ? `${studentId}-${sessionIndex}` : undefined}>
        <AttendanceCell
          state={state}
          isDemo={isDemo}
          absenceNote={note}
          onClick={() => cycleAttendance(studentId, sessionIndex)}
          onNoteClick={() => openNoteModal(studentId, sessionIndex)}
        />
      </div>
    );
  };

  // Render the Wednesday cell (normal attendance, green-tinted background)
  const renderWedCell = (studentId: string, week: number) => {
    const si = wedSessionIndex(week);
    const state = getAttendanceState(studentId, si);
    const note = getAbsenceNote(studentId, si);
    return (
      <div style={{ background: '#0d1a0d' }} data-absence-cell={state === 'x' && !note ? `${studentId}-${si}` : undefined}>
        <AttendanceCell
          state={state}
          isDemo={false}
          absenceNote={note}
          onClick={() => cycleAttendance(studentId, si)}
          onNoteClick={() => openNoteModal(studentId, si)}
        />
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <div className="px-6" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: 'hsl(var(--nav-bg))', borderBottom: '1px solid hsl(var(--nav-border))' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-0">
            {batches.map(batch => {
              const isActive = batch.id === activeBatchId;
              return (
                <div key={batch.id} className="flex items-center" style={{ maxWidth: 220 }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setBatchContextMenu({ batchId: batch.id, x: rect.left, y: rect.bottom + 4 });
                  }}>
                  <button
                    type="button"
                    onClick={() => switchBatch(batch.id)}
                    onDoubleClick={() => openEditBatch(batch)}
                    title={batch.name}
                    className={`px-3 py-3 text-sm font-medium border-b-2 transition-colors ${
                      isActive ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                    style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}
                  >{batch.name}</button>
                  {isActive && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setDeleteBatchConfirm(batch); }}
                      title="Delete batch"
                      aria-label="Delete batch"
                      style={{ flexShrink: 0, marginLeft: 6, marginRight: 4, width: 14, height: 14, padding: 0, color: '#555', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#555'; }}
                    >✕</button>
                  )}
                </div>
              );
            })}
            <button onClick={() => setShowCreateBatch(true)} className="px-3 py-3 text-muted-foreground hover:text-foreground text-lg">+</button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium bg-amber-bg text-amber-text">
              {(profile?.name || 'M').slice(0, 2).toUpperCase()}
            </div>
            <span className="text-sm text-foreground">{profile?.name || 'Moderator'}</span>
            <button onClick={async () => { try { await signOut(); } catch (e) { console.error(e); window.location.href = '/'; } }} className="text-xs text-muted-foreground hover:text-foreground ml-2">Logout</button>
          </div>
        </div>
      </div>

      {/* Create batch modal */}
      {showCreateBatch && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="p-6 w-full max-w-sm bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10 }}>
            <h2 className="text-lg font-medium text-foreground mb-4">Create new batch</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground">Month</label>
                <select value={newBatchMonth} onChange={(e) => setNewBatchMonth(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 text-sm text-foreground" style={{ border: '1px solid hsl(var(--input-border))', borderRadius: 7, background: 'hsl(var(--input-bg))' }}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Year</label>
                <input type="number" value={newBatchYear} onChange={(e) => setNewBatchYear(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 text-sm text-foreground" style={{ border: '1px solid hsl(var(--input-border))', borderRadius: 7, background: 'hsl(var(--input-bg))' }} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Label</label>
                <input type="text" placeholder="e.g. Beginners" value={newBatchLabel} onChange={(e) => setNewBatchLabel(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-sm text-foreground" style={{ border: '1px solid hsl(var(--input-border))', borderRadius: 7, background: 'hsl(var(--input-bg))' }} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Batch start date (Monday of Week 1)</label>
                <input type="date" value={newBatchStartDate} onChange={(e) => setNewBatchStartDate(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-sm text-foreground" style={{ border: '1px solid hsl(var(--input-border))', borderRadius: 7, background: 'hsl(var(--input-bg))' }} />
              </div>
              {newBatchLabel && (
                <p className="text-xs text-muted-foreground">Batch name: <strong className="text-foreground">{MONTHS[newBatchMonth - 1]} {newBatchYear} · {newBatchLabel}</strong></p>
              )}
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowCreateBatch(false)} className="flex-1"
                  style={cancelBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#333'; e.currentTarget.style.color = '#fff'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = '#2a2a2a'; e.currentTarget.style.color = '#ccc'; }}>Cancel</button>
                <button onClick={createBatch} disabled={!newBatchLabel.trim()} className="flex-1 disabled:opacity-50"
                  style={primaryBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#e8e8e8'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = '#fff'; }}>Create</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="bg-card border-border" style={{ borderRadius: 10, padding: 24 }}>
          <DialogHeader>
            <DialogTitle className="text-foreground" style={{ fontSize: 16 }}>Remove student?</DialogTitle>
            <DialogDescription className="text-muted-foreground" style={{ fontSize: 13 }}>
              This will remove {deleteConfirm?.name || 'this student'} and all their attendance data from this batch. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-4">
            <button onClick={() => setDeleteConfirm(null)}
              style={cancelBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#333'; e.currentTarget.style.color = '#fff'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = '#2a2a2a'; e.currentTarget.style.color = '#ccc'; }}>Cancel</button>
            <button onClick={() => { if (deleteConfirm) { const s = deleteConfirm; setDeleteConfirm(null); removeStudent(s); } }}
              style={destructBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#991b1b'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = '#7f1d1d'; }}>Remove</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Absence note modal */}
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setNoteModal(null)}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 10, padding: 20, maxWidth: 320, width: '100%' }}>
            <div style={{ fontSize: 14, color: '#F0F0F0', fontWeight: 500, marginBottom: 4 }}>Absence note for {noteModal.studentName}</div>
            <div style={{ fontSize: 11, color: '#555', marginBottom: 12 }}>
              {(() => {
                const dayMap: Record<string, string> = { Mon: 'Monday', Tue: 'Tuesday', Thu: 'Thursday', Fri: 'Friday' };
                const fullDay = dayMap[noteModal.dayLabel] || noteModal.dayLabel;
                const weekNum = Math.floor(noteModal.sessionIndex / 4) + 1;
                return `${fullDay} · Week ${weekNum}`;
              })()}
            </div>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="e.g. Sick, family emergency, travel..."
              rows={3}
              style={{
                width: '100%', background: '#242424', border: '1px solid #333', borderRadius: 6,
                padding: '8px 10px', fontSize: 12, color: '#F0F0F0', resize: 'none', outline: 'none',
                fontFamily: 'Inter, sans-serif',
              }}
            />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setNoteModal(null)}
                style={cancelBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#333'; e.currentTarget.style.color = '#fff'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = '#2a2a2a'; e.currentTarget.style.color = '#ccc'; }}>Cancel</button>
              <button onClick={() => { setNoteModal(null); saveAbsenceNote(); }}
                style={primaryBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#e8e8e8'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = '#fff'; }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule modal — Wednesday picker (max 3 per batch) */}
      {rescheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => { setRescheduleModal(null); setSelectedWednesdayWeek(null); }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 10, padding: 20, maxWidth: 400, width: '100%' }}>
            <div style={{ fontSize: 15, color: '#F0F0F0', fontWeight: 600, marginBottom: 4 }}>↻ Reschedule session</div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
              Week {rescheduleModal.weekNumber} · {rescheduleModal.dayName} — moving to a Wednesday
            </div>
            {/* Counter */}
            <div style={{ background: '#161616', borderRadius: 8, padding: '10px 12px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', gap: 5 }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: 9, height: 9, borderRadius: '50%',
                    background: i < (reschedulesUsed - (rescheduleModal.existingId ? 1 : 0)) ? '#fbbf24' : '#2a2a2a',
                    border: i < (reschedulesUsed - (rescheduleModal.existingId ? 1 : 0)) ? 'none' : '1px solid #333',
                    display: 'inline-block',
                  }} />
                ))}
              </div>
              <span style={{ fontSize: 12, color: '#888' }}>
                {reschedulesUsed} of 3 reschedules used · {reschedulesRemaining} remaining
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 8 }}>Choose a Wednesday to reschedule to:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto', marginBottom: 14 }}>
              {[1, 2, 3, 4, 5, 6].map(week => {
                const usedBy = wednesdayUsedBy(week);
                const isSelf = usedBy && usedBy.id === rescheduleModal.existingId;
                const isUsed = usedBy && !isSelf;
                const wedDate = getWednesdayDate(week);
                const isSelected = selectedWednesdayWeek === week;
                return (
                  <label key={week}
                    onClick={() => { if (!isUsed) setSelectedWednesdayWeek(week); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: isSelected ? '#0d1a0d' : '#222',
                      border: `1px solid ${isSelected ? '#166534' : '#333'}`,
                      borderRadius: 7, padding: '10px 12px',
                      cursor: isUsed ? 'not-allowed' : 'pointer',
                      opacity: isUsed ? 0.4 : 1,
                    }}>
                    <span style={{
                      width: 14, height: 14, borderRadius: '50%',
                      border: `2px solid ${isSelected ? '#4ade80' : '#555'}`,
                      background: isSelected ? '#4ade80' : 'transparent',
                      flexShrink: 0,
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#e8e8e8' }}>Week {week} · Wednesday</div>
                      <div style={{ fontSize: 11, color: '#555' }}>{fmtDate(wedDate) || '(set batch start date)'}</div>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 99,
                      background: isUsed ? '#2a2a2a' : '#0d2a0d',
                      color: isUsed ? '#888' : '#4ade80',
                    }}>{isUsed ? 'Already used' : 'Available'}</span>
                  </label>
                );
              })}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setRescheduleModal(null); setSelectedWednesdayWeek(null); }}
                style={cancelBtnStyle}>Cancel</button>
              <button onClick={() => saveReschedule()} disabled={selectedWednesdayWeek == null}
                style={{ background: '#2a1f00', border: '1px solid #7a5000', color: '#d4920a', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: selectedWednesdayWeek == null ? 0.5 : 1 }}
              >↻ Confirm reschedule</button>
            </div>
          </div>
        </div>
      )}

      {/* Remove reschedule confirmation */}
      {removeRescheduleConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setRemoveRescheduleConfirm(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 10, padding: 20, maxWidth: 380, width: '100%' }}>
            <div style={{ fontSize: 15, color: '#F0F0F0', fontWeight: 600, marginBottom: 6 }}>Remove this reschedule?</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 16, lineHeight: 1.5 }}>
              The original {removeRescheduleConfirm.from_day || removeRescheduleConfirm.day_name} session will be restored.
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setRemoveRescheduleConfirm(null)} style={cancelBtnStyle}>Cancel</button>
              <button onClick={() => removeReschedule(removeRescheduleConfirm.id)} style={destructBtnStyle}>Remove</button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback modal */}
      {feedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={() => setFeedbackModal(null)}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: '#1e1e1e', border: '1px solid #2e2e2e', borderRadius: 14, padding: 28, maxWidth: 480, width: '90%' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Individual feedback</div>
            <div style={{ fontSize: 13, color: '#555', marginBottom: 20 }}>
              {feedbackModal.studentName} · {feedbackModal.demoDayTitle} · {feedbackModal.demoDayDate || '—'} · Total: {feedbackModal.totalScore} / 20
            </div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Feedback notes</div>
            <textarea
              ref={feedbackTextareaRef}
              value={feedbackText}
              onChange={(e) => {
                setFeedbackText(e.target.value);
                e.currentTarget.style.height = 'auto';
                e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
              }}
              placeholder="Write detailed feedback for this student — what went well, areas to improve, specific examples..."
              style={{
                width: '100%', background: '#242424', border: '1px solid #333', borderRadius: 10,
                padding: 16, fontSize: 14, color: '#e8e8e8', lineHeight: 1.8,
                outline: 'none', minHeight: 120, resize: 'none', overflow: 'hidden',
                fontFamily: 'Inter, sans-serif',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => setFeedbackModal(null)}
                style={cancelBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#333'; e.currentTarget.style.color = '#fff'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = '#2a2a2a'; e.currentTarget.style.color = '#ccc'; }}>Cancel</button>
              <button onClick={() => { setFeedbackModal(null); saveFeedback(); }}
                style={primaryBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#e8e8e8'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = '#fff'; }}>Save feedback</button>
            </div>
          </div>
        </div>
      )}


      {batchContextMenu && (() => {
        const batch = batches.find(b => b.id === batchContextMenu.batchId);
        if (!batch) return null;
        return (
          <div style={{
            position: 'fixed', left: batchContextMenu.x, top: batchContextMenu.y, zIndex: 100, minWidth: 160,
            background: '#252525', border: '1px solid #333', borderRadius: 9, padding: 5,
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
            <button
              type="button"
              onClick={() => { setBatchContextMenu(null); openEditBatch(batch); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, color: '#888', borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#2e2e2e'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >✏️ Rename batch</button>
            <div style={{ height: 1, background: '#2e2e2e', margin: '3px 0' }} />
            <button
              type="button"
              onClick={() => { setBatchContextMenu(null); setDeleteBatchConfirm(batch); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, color: '#f87171', borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#2e2e2e'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >🗑 Delete batch</button>
          </div>
        );
      })()}

      {/* Delete batch confirmation modal */}
      {deleteBatchConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setDeleteBatchConfirm(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 10, padding: 24, maxWidth: 400, width: '100%' }}>
            <div style={{ fontSize: 16, color: '#F0F0F0', fontWeight: 500, marginBottom: 8 }}>Delete batch?</div>
            <div style={{ fontSize: 13, color: '#888', lineHeight: 1.5 }}>
              This will permanently delete <span style={{ color: '#f87171' }}>{deleteBatchConfirm.name}</span> and all its attendance, demo day scores and student records. This cannot be undone.
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setDeleteBatchConfirm(null)}
                style={cancelBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#333'; e.currentTarget.style.color = '#fff'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = '#2a2a2a'; e.currentTarget.style.color = '#ccc'; }}>Cancel</button>
              <button onClick={() => { const b = deleteBatchConfirm; setDeleteBatchConfirm(null); deleteBatch(b); }}
                style={destructBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#991b1b'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = '#7f1d1d'; }}>Delete batch</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit batch modal */}
      {editBatchId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="p-6 w-full max-w-sm bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10 }}>
            <h2 className="text-lg font-medium text-foreground mb-4">Edit batch details</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground">Month</label>
                <select value={editBatchMonth} onChange={(e) => setEditBatchMonth(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 text-sm text-foreground" style={{ border: '1px solid hsl(var(--input-border))', borderRadius: 7, background: 'hsl(var(--input-bg))' }}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Year</label>
                <input type="number" value={editBatchYear} onChange={(e) => setEditBatchYear(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 text-sm text-foreground" style={{ border: '1px solid hsl(var(--input-border))', borderRadius: 7, background: 'hsl(var(--input-bg))' }} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Label</label>
                <input type="text" placeholder="e.g. Beginners" value={editBatchLabel} onChange={(e) => setEditBatchLabel(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-sm text-foreground" style={{ border: '1px solid hsl(var(--input-border))', borderRadius: 7, background: 'hsl(var(--input-bg))' }} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Batch start date (Monday of Week 1)</label>
                <input type="date" value={editBatchStartDate} onChange={(e) => setEditBatchStartDate(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-sm text-foreground" style={{ border: '1px solid hsl(var(--input-border))', borderRadius: 7, background: 'hsl(var(--input-bg))' }} />
              </div>
              {editBatchLabel && (
                <p className="text-xs text-muted-foreground">Batch name: <strong className="text-foreground">{MONTHS[editBatchMonth - 1]} {editBatchYear} · {editBatchLabel}</strong></p>
              )}
              <div className="flex gap-2 pt-2">
                <button onClick={() => setEditBatchId(null)} className="flex-1"
                  style={cancelBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#333'; e.currentTarget.style.color = '#fff'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = '#2a2a2a'; e.currentTarget.style.color = '#ccc'; }}>Cancel</button>
                <button onClick={() => { setEditBatchId(null); saveEditBatch(); }} disabled={!editBatchLabel.trim()} className="flex-1 disabled:opacity-50"
                  style={primaryBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#e8e8e8'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = '#fff'; }}>Save changes</button>
              </div>
            </div>
          </div>
        </div>
      )}


      {activeBatch ? (
        <div className="p-6 max-w-6xl mx-auto" style={{ paddingTop: 64 }}>
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 22, fontWeight: 500 }} className="text-foreground">{totalStudents}</div>
              <div className="text-muted-foreground" style={{ fontSize: 12, marginTop: 2 }}>Students</div>
            </div>
            <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 22, fontWeight: 500, color: attendanceColor }}>{avgAttendance}%</div>
              <div className="text-muted-foreground" style={{ fontSize: 12, marginTop: 2 }}>Avg attendance</div>
            </div>
            <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 22, fontWeight: 500, color: 'hsl(var(--score-amber))' }}>{avgDemoScore || '—'}</div>
              <div className="text-muted-foreground" style={{ fontSize: 12, marginTop: 2 }}>Avg demo score</div>
            </div>
            <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 22, fontWeight: 500 }} className="text-foreground">{sessionsLogged} / {totalSessions}</div>
              <div className="text-muted-foreground" style={{ fontSize: 12, marginTop: 2 }}>Sessions logged</div>
            </div>
          </div>

          {/* Attendance card */}
          <div className="bg-card mb-4" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, padding: '14px 16px' }}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Attendance</h2>
                <p className="text-muted-foreground" style={{ fontSize: 12, marginTop: 2 }}>{activeBatch.name} · {students.length} students</p>
              </div>
              <div className="flex items-center gap-2">
                {syncStatus === 'syncing' && <span style={{ fontSize: 11, color: '#555' }}>Syncing...</span>}
                {syncStatus === 'saved' && <span style={{ fontSize: 11, color: '#4ade80' }}>✓ Saved</span>}
                {savedVisible && syncStatus === 'idle' && <span className="save-indicator" style={{ fontSize: 11, color: 'hsl(var(--score-green))' }}>✓ Saved</span>}
                <button onClick={() => setAllWeeksView(!allWeeksView)} className="flex items-center gap-1.5 text-xs"
                  style={{
                    padding: '4px 12px', borderRadius: 7,
                    ...(allWeeksView
                      ? { background: 'hsl(var(--foreground))', color: 'hsl(var(--background))', border: '1px solid hsl(var(--foreground))' }
                      : { background: 'hsl(var(--week-btn-bg))', color: 'hsl(var(--week-btn-text))', border: '1px solid hsl(var(--week-btn-border))' })
                  }}>
                  {allWeeksView ? <List className="w-3.5 h-3.5" /> : <Grid3X3 className="w-3.5 h-3.5" />}
                  {allWeeksView ? 'Week view' : 'All weeks'}
                </button>
                <button onClick={addStudent} className="flex items-center gap-1.5 text-xs"
                  style={{ padding: '4px 12px', borderRadius: 7, background: 'hsl(var(--week-btn-bg))', color: 'hsl(var(--week-btn-text))', border: '1px solid hsl(var(--week-btn-border))' }}>
                  <Plus className="w-3.5 h-3.5" /> Add student
                </button>
              </div>
            </div>

            {/* Week selector */}
            {!allWeeksView && (
              <div className="flex gap-2 mb-4">
                {[1, 2, 3, 4, 5, 6].map(w => {
                  const demo = isDemoWeek(w);
                  const selected = w === selectedWeek;
                  const hasWed = weekHasWednesday(w);
                  let style: React.CSSProperties = { padding: '4px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer' };
                  if (hasWed) style = { ...style, background: '#0d1a0d', color: '#4ade80', border: '1px solid #166534' };
                  else if (selected && demo) style = { ...style, background: 'hsl(var(--week-demo-active-bg))', color: 'hsl(var(--week-demo-active-text))', border: '1px solid hsl(var(--week-demo-active-bg))' };
                  else if (selected) style = { ...style, background: 'hsl(var(--week-btn-active-bg))', color: 'hsl(var(--week-btn-active-text))', border: '1px solid hsl(var(--week-btn-active-bg))' };
                  else if (demo) style = { ...style, background: 'hsl(var(--week-demo-bg))', color: 'hsl(var(--week-demo-text))', border: '1px solid hsl(var(--week-demo-border))' };
                  else style = { ...style, background: 'hsl(var(--week-btn-bg))', color: 'hsl(var(--week-btn-text))', border: '1px solid hsl(var(--week-btn-border))' };
                  if (selected && hasWed) style = { ...style, background: '#0d1a0d', color: '#4ade80', border: '2px solid #4ade80' };
                  return <button key={w} onClick={() => setSelectedWeek(w)} style={style}>Week {w}{demo ? ' · Demo' : ''}{hasWed ? ' ↻' : ''}</button>;
                })}
              </div>
            )}

            {/* Empty state */}
            {students.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <span style={{ fontSize: 32, ...emojiStyle }} className="mb-3">👥</span>
                <p className="text-sm text-muted-foreground mb-1">No students yet</p>
                <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }} className="mb-4">Add your first student to get started</p>
                <button onClick={addStudent} className="flex items-center gap-1.5 text-sm font-medium bg-primary text-primary-foreground" style={{ padding: '8px 16px', borderRadius: 7 }}>
                  <Plus className="w-4 h-4" /> Add student
                </button>
              </div>
            ) : allWeeksView ? (
              <div className="overflow-x-auto">
                <table className="text-sm" style={{ tableLayout: 'fixed', width: 'max-content' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid hsl(var(--row-border))' }}>
                      <th className="text-left py-2 font-medium text-muted-foreground sticky left-0 bg-card" style={{ width: 160, minWidth: 160, fontSize: 12 }}>Student</th>
                      {Array.from({ length: 24 }, (_, i) => {
                        const info = getSessionLabel(i);
                        const header = renderColumnHeader(i, info);
                        // After Tue (i % 4 === 1) of each week, insert Wed if rescheduled
                        if (i % 4 === 1) {
                          const w = Math.floor(i / 4) + 1;
                          if (getRescheduleForWeekWed(w)) {
                            return <React.Fragment key={i}>{header}{renderWedHeader(w)}</React.Fragment>;
                          }
                        }
                        return header;
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map(student => (
                      <tr key={student.id} style={{ borderBottom: '1px solid hsl(var(--row-border))' }}>
                        <td className="py-1 font-medium text-foreground sticky left-0 bg-card" style={{ width: 160, minWidth: 160, fontSize: 12, whiteSpace: 'nowrap' }}>
                          <span style={{ cursor: 'pointer' }} className="hover:underline" onClick={() => setProgressModalStudent(student)}>
                            {student.name || '(unnamed)'}
                          </span>
                          <span style={{ ...emojiStyle, marginLeft: 8, cursor: 'pointer' }} onClick={() => setProgressModalStudent(student)}>📄</span>
                        </td>
                        {Array.from({ length: 24 }, (_, i) => {
                          const info = getSessionLabel(i);
                          const rescheduled = isSessionRescheduled(i);
                          const cell = (
                            <td key={i} style={{
                              minWidth: 60,
                              padding: '10px 14px',
                              ...(rescheduled ? { background: '#1e1800' } : info.isDemo ? { background: 'hsl(var(--demo-col-bg))' } : {}),
                              ...(i % 4 === 0 && i > 0 ? { borderLeft: '2px solid #2e2e2e' } : {}),
                            }}>
                              {renderCell(student.id, i, info.isDemo)}
                            </td>
                          );
                          if (i % 4 === 1) {
                            const w = Math.floor(i / 4) + 1;
                            if (getRescheduleForWeekWed(w)) {
                              return (
                                <React.Fragment key={i}>
                                  {cell}
                                  <td key={`wed-${w}`} style={{ minWidth: 60, padding: '10px 14px', background: '#0d1a0d' }}>
                                    {renderWedCell(student.id, w)}
                                  </td>
                                </React.Fragment>
                              );
                            }
                          }
                          return cell;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <table className="text-sm" style={{ tableLayout: 'fixed', width: '100%' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid hsl(var(--row-border))' }}>
                    <th className="text-left py-2 font-medium text-muted-foreground" style={{ width: 140, minWidth: 140, fontSize: 12, background: 'hsl(var(--grid-header-bg))' }}>Student</th>
                    {weekSessions.map((si, idx) => {
                      const info = getSessionLabel(si);
                      const header = renderColumnHeader(si, info);
                      // Insert Wed column after Tue (idx 1) of selectedWeek if a reschedule targets it
                      if (idx === 1 && getRescheduleForWeekWed(selectedWeek)) {
                        return <React.Fragment key={si}>{header}{renderWedHeader(selectedWeek)}</React.Fragment>;
                      }
                      return header;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {students.map(student => (
                    <tr key={student.id} className="group"
                      style={{ borderBottom: '1px solid hsl(var(--row-border))' }}
                      onMouseEnter={() => setHoveredStudentId(student.id)}
                      onMouseLeave={() => setHoveredStudentId(null)}>
                      {/* BUG 3 fix: nowrap on name */}
                      <td className="py-1 font-medium text-foreground relative" style={{ width: 140, minWidth: 140, fontSize: 13, whiteSpace: 'nowrap' }}>
                        <div className="flex items-center gap-2">
                          {editingStudentId === student.id ? (
                            <input ref={nameInputRef} defaultValue={student.name}
                              onBlur={(e) => updateStudentName(student.id, e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                              className="bg-transparent outline-none text-sm w-24 text-foreground"
                              style={{ borderBottom: '1px solid hsl(var(--foreground))' }} autoFocus />
                          ) : (
                            <>
                              <span className="cursor-pointer hover:underline" onClick={() => setEditingStudentId(student.id)}>
                                {student.name || '(click to name)'}
                              </span>
                              <span style={{ ...emojiStyle, marginLeft: 8, cursor: 'pointer' }} onClick={() => setProgressModalStudent(student)}>📄</span>
                            </>
                          )}
                          {hoveredStudentId === student.id && (
                            <div className="flex items-center gap-1" style={{ whiteSpace: 'nowrap' }}>
                              <button onClick={() => confirmRemoveStudent(student)} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'hsl(var(--danger-text))' }}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setReportStudent(student)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 hover:text-foreground"
                                style={{ color: 'hsl(var(--muted-foreground))', fontSize: 11 }}>
                                Progress
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                      {weekSessions.map((si, idx) => {
                        const info = getSessionLabel(si);
                        const rescheduled = isSessionRescheduled(si);
                        const cell = (
                          <td key={si} style={{ ...(rescheduled ? { background: '#1e1800' } : info.isDemo ? { background: 'hsl(var(--demo-col-bg))' } : {}) }}>
                            {renderCell(student.id, si, info.isDemo)}
                          </td>
                        );
                        if (idx === 1 && getRescheduleForWeekWed(selectedWeek)) {
                          return (
                            <React.Fragment key={si}>
                              {cell}
                              <td key={`wed-${selectedWeek}`} style={{ background: '#0d1a0d' }}>
                                {renderWedCell(student.id, selectedWeek)}
                              </td>
                            </React.Fragment>
                          );
                        }
                        return cell;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Reschedule counter bar */}
            {students.length > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', borderTop: '1px solid #2a2a2a',
              }}>
                <span style={{ fontSize: 11, color: '#555' }}>Reschedules used:</span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: i < reschedulesUsed ? '#fbbf24' : '#2a2a2a',
                      border: i < reschedulesUsed ? 'none' : '1px solid #333',
                      display: 'inline-block',
                    }} />
                  ))}
                </div>
                <span style={{ fontSize: 11, color: reschedulesRemaining === 0 ? '#f87171' : '#555', marginLeft: 'auto' }}>
                  {reschedulesRemaining === 0 ? 'Maximum reached' : `${reschedulesUsed} of 3 used · ${reschedulesRemaining} remaining`}
                </span>
              </div>
            )}

            {students.length > 0 && (() => {
              // Calculate missing absence notes for current week
              const currentWeekSessions = getWeekSessions(selectedWeek);
              const missingNoteCells: { studentId: string; sessionIndex: number }[] = [];
              if (!allWeeksView) {
                for (const s of students) {
                  for (const si of currentWeekSessions) {
                    const state = getAttendanceState(s.id, si);
                    if (state === 'x') {
                      const note = getAbsenceNote(s.id, si);
                      if (!note) missingNoteCells.push({ studentId: s.id, sessionIndex: si });
                    }
                  }
                }
              }
              const missingCount = missingNoteCells.length;
              const showBanner = !allWeeksView && missingCount > 0 && !bannerDismissed;
              const modFirstName = (profile?.name || 'Mod').split(' ')[0];

              return (
                <>
                  {showBanner && (
                    <div style={{
                      background: '#1a1400', border: '1px solid #7a5000', borderRadius: 10, padding: '13px 16px',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 18, ...emojiStyle }}>📝</span>
                        <span style={{ fontSize: 13, color: '#e8e8e8', lineHeight: 1.5 }}>
                          Almost done, {modFirstName}! Just {missingCount} absence{missingCount > 1 ? 's' : ''} need a reason — quick note and you're all good 👍
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                        <button
                          onClick={() => {
                            if (missingNoteCells.length > 0) {
                              const first = missingNoteCells[0];
                              const el = document.querySelector(`[data-absence-cell="${first.studentId}-${first.sessionIndex}"]`);
                              if (el) {
                                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                el.classList.add('amber-glow');
                                setTimeout(() => el.classList.remove('amber-glow'), 1500);
                              }
                              openNoteModal(first.studentId, first.sessionIndex);
                            }
                          }}
                          style={{
                            fontSize: 12, padding: '5px 12px', border: '1px solid #7a5000', borderRadius: 7,
                            background: '#2a1f00', color: '#d4920a', cursor: 'pointer',
                          }}
                        >Add notes</button>
                        <span
                          onClick={() => setBannerDismissed(true)}
                          style={{ fontSize: 11, color: '#555', cursor: 'pointer' }}
                          onMouseEnter={(e) => { (e.target as HTMLElement).style.color = '#888'; }}
                          onMouseLeave={(e) => { (e.target as HTMLElement).style.color = '#555'; }}
                        >Skip for now</span>
                      </div>
                    </div>
                  )}
                  {isDemoWeek(selectedWeek) && !allWeeksView && (
                    <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: 'hsl(var(--amber-text))' }}>
                      <span style={emojiStyle}>⭐</span> Demo day attendance marked above · Scores tracked in Demo days section below
                    </div>
                  )}
                  <button onClick={addStudent} className="mt-3 text-xs text-muted-foreground hover:text-foreground">+ Add student</button>
                </>
              );
            })()}
          </div>

          {/* Demo days section */}
          <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, overflow: 'hidden' }}>
            <button onClick={() => setDemoDaysExpanded(!demoDaysExpanded)} className="w-full flex items-center justify-between"
              style={{ padding: '12px 16px', background: 'hsl(var(--grid-header-bg))', borderTop: '1px solid hsl(var(--border))' }}>
              <div className="flex items-center gap-2">
                {demoDaysExpanded ? <ChevronDown className="w-4 h-4 text-foreground" /> : <ChevronRight className="w-4 h-4 text-foreground" />}
                <span style={{ fontWeight: 500, fontSize: 13 }} className="text-foreground">Demo days</span>
                <span style={{ background: 'hsl(var(--pill-success-bg))', color: 'hsl(var(--pill-success-text))', borderRadius: 99, padding: '2px 8px', fontSize: 11 }}>
                  {demoDays.length} days
                </span>
              </div>
              <span className="text-muted-foreground" style={{ fontSize: 13 }}>{activeBatch.name}</span>
            </button>

            {demoDaysExpanded && (
              <div style={{ padding: '0 16px 16px' }} className="space-y-4 mt-4">
                {demoDays.map(dd => (
                  <div key={dd.id} className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10, overflow: 'hidden' }}>
                    <div className="flex items-center justify-between" style={{ padding: '14px 16px' }}>
                      <h3 style={{ fontWeight: 600, fontSize: 14 }} className="text-foreground">{dd.title}</h3>
                      <span className="text-muted-foreground" style={{ fontSize: 12 }}>{dd.date || '—'} · {students.length} students</span>
                    </div>
                    {/* Scoring rubric */}
                    <ScoringRubric />
                    <div className="overflow-x-auto" style={{ padding: '0 16px 14px' }}>
                      <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid hsl(var(--row-border))' }}>
                            <th className="text-left py-2 pr-3 font-medium text-muted-foreground" style={{ fontSize: 12, width: 140 }}>Criteria</th>
                            {students.map(s => (
                              <th key={s.id} className="text-center px-2 py-2 font-medium text-muted-foreground" style={{ fontSize: 12 }}>{s.name}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {CRITERIA.map(criterion => (
                            <tr key={criterion} style={{ borderBottom: '1px solid hsl(var(--row-border))' }}>
                              <td className="py-2 pr-3 text-foreground" style={{ fontSize: 12 }}>{criterion}</td>
                              {students.map(s => (
                                <td key={s.id} className="text-center px-2 py-2">
                                  <ScoreInput value={getScoreValue(dd.id, s.id, criterion)} onChange={(val) => updateScoreValue(dd.id, s.id, criterion, val)} />
                                </td>
                              ))}
                            </tr>
                          ))}
                          <tr className="font-medium" style={{ borderBottom: '1px solid hsl(var(--row-border))' }}>
                            <td className="py-2 pr-3 text-foreground" style={{ fontSize: 12 }}>Total (/ 20)</td>
                            {students.map(s => {
                              const total = getStudentDemoTotal(dd.id, s.id);
                              return <td key={s.id} className="text-center px-2 py-2" style={{ fontSize: 12, fontWeight: 700, color: getTotalColor(total) }}>{total}</td>;
                            })}
                          </tr>
                          <tr>
                            <td className="py-2 pr-3 text-foreground" style={{ fontSize: 12 }}>Individual feedback</td>
                            {students.map(s => {
                              const fb = getFeedback(dd.id, s.id);
                              return (
                                <td key={s.id} className="text-center px-2 py-2" style={{ cursor: 'pointer' }} onClick={() => openFeedbackModal(dd.id, s.id, dd)}>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                    <span style={{ fontSize: 20, fontFamily: '"Apple Color Emoji","Segoe UI Emoji",sans-serif' }}>{fb?.feedback ? '📝' : '📄'}</span>
                                    <span style={{ fontSize: 10, color: '#555', fontStyle: 'italic' }}>{fb?.feedback ? 'click to edit' : 'click to add'}</span>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-96 text-muted-foreground" style={{ paddingTop: 48 }}>
          <p>No batches yet. Click "+" to create your first batch.</p>
        </div>
      )}

      {/* Student progress modal */}
      {progressModalStudent && activeBatch && (
        <StudentProgressModal
          student={progressModalStudent}
          batchName={activeBatch.name}
          modName={profile?.name || ''}
          weekNumber={(() => {
            if (!activeBatch.start_date) return 1;
            const daysDiff = Math.floor((Date.now() - new Date(activeBatch.start_date).getTime()) / (1000 * 60 * 60 * 24));
            return Math.min(Math.max(Math.ceil(daysDiff / 7), 1), 6);
          })()}
          attendance={attendance}
          demoDays={demoDays}
          demoScores={demoScores}
          demoFeedback={demoFeedback}
          onClose={() => setProgressModalStudent(null)}
        />
      )}
    </div>
  );
};

export default ModDashboard;
