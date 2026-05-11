import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { logActivity, getSessionLabel, getWeekSessions, isDemoWeek, MONTHS, CRITERIA, getSessionsOccurred, computeAttendancePct, getCurrentWeek } from '@/lib/batchtrack';
import { Plus, Trash2, ChevronDown, ChevronRight, Grid3X3, List } from 'lucide-react';
import StudentReport from '@/components/StudentReport';
import ScoringRubric from '@/components/ScoringRubric';
import StudentProgressModal from '@/components/StudentProgressModal';
import ToDoSidebar, { AdminSummaryPanel } from '@/components/ToDoSidebar';
import type { Task } from '@/components/ToDoSidebar';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface Batch { id: string; name: string; mod_id: string; month: number; year: number; start_date?: string | null; }
interface Student { id: string; batch_id: string; name: string; status?: string | null; status_reason?: string | null; status_changed_at?: string | null; }
const isDroppedStudent = (s: Pick<Student, 'status'>) => s.status === 'dropped';
interface AttendanceRecord { id: string; student_id: string; batch_id: string; session_index: number; state: string; absence_note?: string | null; }
interface DemoDay { id: string; batch_id: string; title: string; date: string | null; day_number: number; }
interface DemoScore { id: string; demo_day_id: string; student_id: string; criterion: string; score: number; }
interface DemoFeedback { id: string; demo_day_id: string; student_id: string; feedback: string; }
interface RescheduledSession { id: string; batch_id: string; week_number: number; day_name: string; original_date: string | null; new_date: string; reason: string | null; created_by: string; from_week?: number | null; from_day?: string | null; to_week?: number | null; to_date?: string | null; }

const emojiStyle: React.CSSProperties = { fontFamily: '"Apple Color Emoji","Segoe UI Emoji",sans-serif' };

const btnPress = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.transform = 'scale(0.98)'; };
const btnRelease = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.transform = ''; };
const cancelBtnStyle: React.CSSProperties = { background: 'hsl(var(--secondary))', border: '1px solid hsl(var(--input))', color: 'hsl(var(--foreground))', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'background 0.1s, transform 0.05s' };
const primaryBtnStyle: React.CSSProperties = { background: 'hsl(var(--foreground))', border: '1px solid hsl(var(--foreground))', color: 'hsl(var(--primary-foreground))', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'background 0.1s, transform 0.05s' };
const destructBtnStyle: React.CSSProperties = { background: 'hsl(var(--destructive))', border: '1px solid hsl(var(--destructive))', color: 'hsl(var(--destructive-foreground))', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'background 0.1s, transform 0.05s' };

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
                background: 'hsl(var(--score-green))',
                border: '2px solid hsl(var(--card))',
                zIndex: 10,
              }} />
            ) : (
              <span className="pulse-dot" style={{
                position: 'absolute', top: -3, right: -3,
                width: 7, height: 7, borderRadius: '50%',
                background: 'hsl(var(--score-amber))',
                border: '2px solid hsl(var(--card))',
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
                background: 'hsl(var(--secondary))', border: '1px solid hsl(var(--border))', borderRadius: 8,
                padding: '12px 12px', minWidth: 185, maxWidth: 220,
              }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.08em' }}>Absence note</div>
                {absenceNote ? (
                  <>
                    <div style={{ fontSize: 13, color: 'hsl(var(--foreground))', lineHeight: 1.4, marginBottom: 8 }}>{absenceNote}</div>
                    <button onClick={(e) => { e.stopPropagation(); onNoteClick(); }} style={{ fontSize: 11, color: 'hsl(var(--score-amber))', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      <span style={emojiStyle}>✏️</span> Edit note
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic', marginBottom: 8 }}>No reason added yet</div>
                    <button onClick={(e) => { e.stopPropagation(); onNoteClick(); }} style={{ fontSize: 11, color: 'hsl(var(--score-amber))', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      <span style={emojiStyle}>✏️</span> Add note
                    </button>
                  </>
                )}
                {/* Arrow */}
                <div style={{
                  position: 'absolute', bottom: 9, left: '50%', transform: 'translateX(-50%)',
                  width: 0, height: 0,
                  borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
                  borderTop: '5px solid hsl(var(--secondary))',
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

const DroppedTag: React.FC = () => (
  <span style={{
    marginLeft: 6, background: 'hsl(var(--danger-bg))', color: 'hsl(var(--score-red))',
    border: '1px solid hsl(var(--score-red) / 0.4)', fontSize: 9, padding: '1px 6px',
    borderRadius: 9999, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600,
    display: 'inline-block', verticalAlign: 'middle',
  }}>Dropped</span>
);

const menuItemStyle: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none',
  padding: '6px 10px', fontSize: 12, color: 'hsl(var(--foreground))', cursor: 'pointer', borderRadius: 4,
};

const StudentRowMenu: React.FC<{
  student: { id: string; name: string };
  open: boolean;
  dropped: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDrop: () => void;
  onReverse: () => void;
  onDelete: () => void;
}> = ({ open, dropped, onToggle, onEdit, onDrop, onReverse, onDelete }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggle();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onToggle]);
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', marginLeft: 4 }}>
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        style={{
          width: 20, height: 20, border: '1px solid hsl(var(--border))', borderRadius: 4,
          background: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))',
          fontSize: 14, lineHeight: '14px', cursor: 'pointer', padding: 0,
        }}
        title="Student options"
      >⋮</button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 200,
          background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6,
          boxShadow: '0 4px 16px hsl(var(--background) / 0.6)', zIndex: 50, padding: 4,
        }}>
          <button onClick={(e) => { e.stopPropagation(); onEdit(); }} style={menuItemStyle}>Edit details</button>
          <div style={{ borderTop: '1px solid hsl(var(--border))', margin: '4px 0', fontSize: 10, color: 'hsl(var(--muted-foreground))', padding: '4px 8px 0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</div>
          {dropped ? (
            <button onClick={(e) => { e.stopPropagation(); onReverse(); onToggle(); }} style={{ ...menuItemStyle, color: 'hsl(var(--amber-text))' }}>Reverse drop-out</button>
          ) : (
            <button onClick={(e) => { e.stopPropagation(); onDrop(); }} style={{ ...menuItemStyle, color: 'hsl(var(--score-red))' }}>Mark as dropped out</button>
          )}
          <div style={{ borderTop: '1px solid hsl(var(--border))', margin: '4px 0', fontSize: 10, color: 'hsl(var(--muted-foreground))', padding: '4px 8px 0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Danger zone</div>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); onToggle(); }} style={{ ...menuItemStyle, color: 'hsl(var(--score-red))' }}>Delete student</button>
        </div>
      )}
    </div>
  );
};

// Column header dropdown menu
const ColumnMenu: React.FC<{
  sessionIndex: number;
  isRescheduled: boolean;
  isRescheduledTarget?: boolean;
  onMarkAllPresent?: () => void;
  onMarkAllAbsent?: () => void;
  onReschedule: () => void;
  onEditReschedule?: () => void;
  onRemoveReschedule?: () => void;
  rescheduleDisabled?: boolean;
  hideMarkAll?: boolean;
}> = ({ isRescheduled, isRescheduledTarget, onMarkAllPresent, onMarkAllAbsent, onReschedule, onEditReschedule, onRemoveReschedule, rescheduleDisabled, hideMarkAll }) => {
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
          color: 'hsl(var(--muted-foreground))', background: 'hsl(var(--secondary))', cursor: 'pointer', fontSize: 12,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1,
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => { const t = e.currentTarget; t.style.background = 'hsl(var(--border))'; t.style.color = 'hsl(var(--foreground))'; t.style.borderColor = 'hsl(var(--muted-foreground))'; }}
        onMouseLeave={(e) => { const t = e.currentTarget; t.style.background = 'hsl(var(--secondary))'; t.style.color = 'hsl(var(--muted-foreground))'; t.style.borderColor = 'hsl(var(--border))'; }}
      >⋮</button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4,
          background: 'hsl(var(--secondary))', border: '1px solid #333', borderRadius: 8,
          padding: 5, minWidth: 195, zIndex: 50,
        }}>
          {isRescheduled ? (
            <>
              <button
                onClick={() => { setOpen(false); onEditReschedule?.(); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, color: 'hsl(var(--amber-text))', borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'hsl(var(--border))'; (e.target as HTMLElement).style.color = 'hsl(var(--foreground))'; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = 'hsl(var(--amber-text))'; }}
              >↻ Edit reschedule</button>
              <button
                onClick={() => { setOpen(false); onRemoveReschedule?.(); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, color: 'hsl(var(--muted-foreground))', borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'hsl(var(--border))'; (e.target as HTMLElement).style.color = 'hsl(var(--foreground))'; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = 'hsl(var(--muted-foreground))'; }}
              >✕ Remove reschedule</button>
              {isRescheduledTarget && !hideMarkAll && (
                <>
                  <div style={{ height: 1, background: 'hsl(var(--border))', margin: '4px 0' }} />
                  <button
                    onClick={() => { setOpen(false); onMarkAllPresent?.(); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, color: 'hsl(var(--muted-foreground))', borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer' }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'hsl(var(--border))'; (e.target as HTMLElement).style.color = 'hsl(var(--foreground))'; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = 'hsl(var(--muted-foreground))'; }}
                  >✓ Mark all present</button>
                  <button
                    onClick={() => { setOpen(false); onMarkAllAbsent?.(); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, color: 'hsl(var(--muted-foreground))', borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer' }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'hsl(var(--border))'; (e.target as HTMLElement).style.color = 'hsl(var(--foreground))'; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = 'hsl(var(--muted-foreground))'; }}
                  >✗ Mark all absent</button>
                </>
              )}
            </>
          ) : (
            <>
              <button
                onClick={() => { if (rescheduleDisabled) return; setOpen(false); onReschedule(); }}
                title={rescheduleDisabled ? 'Maximum reschedules reached (3 of 3)' : ''}
                disabled={rescheduleDisabled}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, color: rescheduleDisabled ? 'hsl(var(--muted-foreground))' : 'hsl(var(--amber-text))', borderRadius: 6, background: 'transparent', border: 'none', cursor: rescheduleDisabled ? 'not-allowed' : 'pointer' }}
                onMouseEnter={(e) => { if (rescheduleDisabled) return; (e.target as HTMLElement).style.background = 'hsl(var(--border))'; (e.target as HTMLElement).style.color = 'hsl(var(--foreground))'; }}
                onMouseLeave={(e) => { if (rescheduleDisabled) return; (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = 'hsl(var(--amber-text))'; }}
              >↻ Reschedule session</button>
              {!hideMarkAll && <>
                <div style={{ height: 1, background: 'hsl(var(--border))', margin: '4px 0' }} />
                <button
                  onClick={() => { setOpen(false); onMarkAllPresent?.(); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, color: 'hsl(var(--muted-foreground))', borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'hsl(var(--border))'; (e.target as HTMLElement).style.color = 'hsl(var(--foreground))'; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = 'hsl(var(--muted-foreground))'; }}
                >✓ Mark all present</button>
                <button
                  onClick={() => { setOpen(false); onMarkAllAbsent?.(); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, color: 'hsl(var(--muted-foreground))', borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'hsl(var(--border))'; (e.target as HTMLElement).style.color = 'hsl(var(--foreground))'; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = 'hsl(var(--muted-foreground))'; }}
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
  disabled?: boolean;
}> = ({ value, onChange, disabled = false }) => {
  const [flash, setFlash] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { inputRef.current?.blur(); return; }
    if (e.key === 'Backspace' || e.key === 'Tab' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Delete') return;
    if (!/[\d.]/.test(e.key)) { e.preventDefault(); }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Accept anything during typing — validate on blur only. This prevents flicker / value clearing mid-keystroke.
    onChange(e.target.value);
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
      value={value}
      onChange={disabled ? undefined : handleChange}
      onBlur={disabled ? undefined : handleBlur}
      onKeyDown={disabled ? undefined : handleKeyPress}
      readOnly={disabled}
      tabIndex={disabled ? -1 : undefined}
      className="score-input"
      style={{
        width: 44, textAlign: 'center', fontSize: 12, padding: '3px 6px',
        border: flash ? '1.5px solid #f87171' : '1px solid hsl(var(--input-border))',
        borderRadius: 6, background: 'hsl(var(--input-bg))', color: 'hsl(var(--foreground))',
        MozAppearance: 'textfield', outline: 'none', transition: 'border-color 0.2s',
        cursor: disabled ? 'default' : 'text',
        opacity: disabled ? 0.85 : 1,
      }}
    />
  );
};

interface ModDashboardProps {
  readOnly?: boolean;
  batchIdOverride?: string;
  modIdOverride?: string;
  hideTopNav?: boolean;
}

const ModDashboard: React.FC<ModDashboardProps> = ({
  readOnly = false,
  batchIdOverride,
  modIdOverride,
  hideTopNav = false,
}) => {
  const { user, profile, signOut } = useAuth();
  const isDevTester = profile?.email === 'dilinaedu@gmail.com';
  // When viewing another mod's data (admin read-only), we may need to display
  // that mod's name. Fetch it on demand and fall back to logged-in profile.
  const [overrideModName, setOverrideModName] = useState<string | null>(null);
  useEffect(() => {
    if (!modIdOverride) { setOverrideModName(null); return; }
    let cancelled = false;
    supabase.from('profiles').select('name').eq('id', modIdOverride).maybeSingle()
      .then(({ data }) => { if (!cancelled) setOverrideModName((data as any)?.name ?? null); });
    return () => { cancelled = true; };
  }, [modIdOverride]);
  const displayModName = modIdOverride ? (overrideModName || '') : (profile?.name || '');
  const [batches, setBatches] = useState<Batch[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [demoDays, setDemoDays] = useState<DemoDay[]>([]);
  const [demoScores, setDemoScores] = useState<DemoScore[]>([]);
  const [demoFeedback, setDemoFeedback] = useState<DemoFeedback[]>([]);
  const [rescheduledSessions, setRescheduledSessions] = useState<RescheduledSession[]>([]);
  const [weekStatuses, setWeekStatuses] = useState<{ id: string; batch_id: string; week_number: number; status: string }[]>([]);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [allWeeksView, setAllWeeksView] = useState(false);
  const [showCreateBatch, setShowCreateBatch] = useState(false);
  const [demoDaysExpanded, setDemoDaysExpanded] = useState(false);
  const [newBatchMonth, setNewBatchMonth] = useState(new Date().getMonth() + 1);
  const [newBatchYear, setNewBatchYear] = useState(new Date().getFullYear());
  
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
    weekStatuses: { id: string; batch_id: string; week_number: number; status: string }[];
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
  const initializedBatchRef = useRef<string | null>(null);

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
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  // Removal confirmation
  const [removeRescheduleConfirm, setRemoveRescheduleConfirm] = useState<RescheduledSession | null>(null);

  // Demo make-up scheduling modal
  const [makeupModal, setMakeupModal] = useState<{
    studentId: string; studentName: string; dayNumber: number; demoDayId: string; demoDayTitle: string; demoDayDate: string | null; isEdit: boolean;
  } | null>(null);
  const [makeupDate, setMakeupDate] = useState<string>('');
  const [makeupNote, setMakeupNote] = useState<string>('');
  const [makeupSaving, setMakeupSaving] = useState(false);
  
  // Absence note reminder banner
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Student row ⋮ menu
  const [studentMenuId, setStudentMenuId] = useState<string | null>(null);

  // Drop-out modal
  const [dropoutModal, setDropoutModal] = useState<Student | null>(null);
  const [dropoutReason, setDropoutReason] = useState('');
  const [dropoutDate, setDropoutDate] = useState('');
  const [dropoutSaving, setDropoutSaving] = useState(false);

  // Reverse drop-out confirm
  const [reverseDropConfirm, setReverseDropConfirm] = useState<Student | null>(null);

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
    batchCacheRef.current[activeBatchId] = { students, attendance, demoDays, demoScores, demoFeedback, rescheduledSessions, weekStatuses };
  }, [activeBatchId, students, attendance, demoDays, demoScores, demoFeedback, rescheduledSessions]);

  // Keep cache in sync with state changes
  useEffect(() => { saveToCacheFromState(); }, [saveToCacheFromState]);

  // Fetch a single batch's data from Supabase
  const fetchBatchData = useCallback(async (batchId: string): Promise<BatchCacheEntry> => {
    const [studentsRes, attendanceRes, demoDaysRes, rescheduledRes, weekStatusRes] = await Promise.all([
      supabase.from('students').select('*').eq('batch_id', batchId).order('created_at'),
      supabase.from('attendance').select('*').eq('batch_id', batchId),
      supabase.from('demo_days').select('*').eq('batch_id', batchId).order('day_number'),
      supabase.from('rescheduled_sessions').select('*').eq('batch_id', batchId),
      supabase.from('week_status').select('id,batch_id,week_number,status').eq('batch_id', batchId),
    ]);
    const fetchedStudents = studentsRes.data || [];
    const fetchedAttendance = (attendanceRes.data || []) as AttendanceRecord[];
    const fetchedDemoDays = demoDaysRes.data || [];
    const fetchedRescheduled = (rescheduledRes.data || []) as RescheduledSession[];
    const fetchedWeekStatuses = (weekStatusRes.data || []) as { id: string; batch_id: string; week_number: number; status: string }[];
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
    return { students: fetchedStudents, attendance: fetchedAttendance, demoDays: fetchedDemoDays, demoScores: fetchedDemoScores, demoFeedback: fetchedDemoFeedback, rescheduledSessions: fetchedRescheduled, weekStatuses: fetchedWeekStatuses };
  }, []);

  // Apply cached data to active state
  const applyCacheToState = useCallback((entry: BatchCacheEntry) => {
    setStudents(entry.students);
    setAttendance(entry.attendance);
    setDemoDays(entry.demoDays);
    setDemoScores(entry.demoScores);
    setDemoFeedback(entry.demoFeedback);
    setRescheduledSessions(entry.rescheduledSessions);
    setWeekStatuses(entry.weekStatuses);
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
    if (initialLoadDone.current) return;
    const filterModId = modIdOverride ?? user?.id;
    if (!filterModId) return;
    initialLoadDone.current = true;
    (async () => {
      const { data } = await supabase.from('batches').select('*').eq('mod_id', filterModId).order('created_at');
      if (!data || data.length === 0) { setBatches(data || []); return; }
      setBatches(data);
      // If a batchIdOverride is provided, force-select it (ignore other sources)
      const overridden = batchIdOverride && data.find(b => b.id === batchIdOverride);
      const firstId = overridden ? batchIdOverride : data[0].id;
      setActiveBatchId(firstId);
      const firstData = await fetchBatchData(firstId);
      batchCacheRef.current[firstId] = firstData;
      applyCacheToState(firstData);
      // Background-load remaining batches
      for (const b of data) {
        if (b.id === firstId) continue;
        const bData = await fetchBatchData(b.id);
        batchCacheRef.current[b.id] = bData;
      }
    })();
  }, [user, modIdOverride, batchIdOverride, fetchBatchData, applyCacheToState]);

  // If batchIdOverride changes after initial load, force-switch to it
  useEffect(() => {
    if (!batchIdOverride) return;
    if (activeBatchId === batchIdOverride) return;
    if (!batches.find(b => b.id === batchIdOverride)) return;
    switchBatch(batchIdOverride);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchIdOverride, batches]);

  // Reload batches list (after creating a new batch)
  const loadBatches = useCallback(async () => {
    const filterModId = modIdOverride ?? user?.id;
    if (!filterModId) return;
    const { data } = await supabase.from('batches').select('*').eq('mod_id', filterModId).order('created_at');
    if (data) setBatches(data);
  }, [user, modIdOverride]);

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
    if (readOnly) return;
    if (!user || !newBatchStartDate) return;
    const monthName = MONTHS[newBatchMonth - 1];
    const batchName = `${monthName} ${newBatchYear}`;
    const existing = batches.find(b => b.name === batchName);
    if (existing) { setActiveBatchId(existing.id); setShowCreateBatch(false); return; }

    const startDateValue = newBatchStartDate.trim() ? newBatchStartDate : null;
    const { data } = await supabase.from('batches').insert({
      mod_id: user.id, name: batchName, month: newBatchMonth, year: newBatchYear, start_date: startDateValue,
    }).select().single();
    if (data) {
      await supabase.from('demo_days').insert([
        { batch_id: data.id, title: 'Demo day 01', day_number: 1 },
        { batch_id: data.id, title: 'Demo day 02', day_number: 2 },
        { batch_id: data.id, title: 'Demo day 03', day_number: 3 },
      ]);
      // Seed week_status rows (6 weeks, all open) for the new batch
      const weekRows = [1, 2, 3, 4, 5, 6].map(week => ({
        batch_id: data.id,
        week_number: week,
        status: 'open' as const,
      }));
      const { error: wsErr } = await supabase.from('week_status').insert(weekRows);
      if (wsErr) console.error('Failed to create week_status rows', wsErr);
      await logActivity(user.id, profile?.name || '', 'batch_created', `Created batch ${batchName}`, batchName);
      setShowCreateBatch(false); setNewBatchStartDate('');
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
    if (readOnly) return;
    setEditBatchId(batch.id);
    setEditBatchMonth(batch.month);
    setEditBatchYear(batch.year);
    setEditBatchStartDate((batch as any).start_date || '');
  };

  const saveEditBatch = async () => {
    if (readOnly) return;
    if (!editBatchId || !user) return;
    const monthName = MONTHS[editBatchMonth - 1];
    const newName = `${monthName} ${editBatchYear}`;
    const startDateValue = editBatchStartDate.trim() ? editBatchStartDate : null;
    await supabase.from('batches').update({
      name: newName, month: editBatchMonth, year: editBatchYear, start_date: startDateValue,
    }).eq('id', editBatchId);
    setBatches(prev => prev.map(b => b.id === editBatchId ? { ...b, name: newName, month: editBatchMonth, year: editBatchYear, start_date: startDateValue } : b));
    setEditBatchId(null);
    showSaved();
  };

  // Right-click tab → delete batch
  const deleteBatch = async (batch: Batch) => {
    if (readOnly) return;
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
    if (readOnly) return;
    const { data } = await supabase.from('students').insert({ batch_id: activeBatchId, name: '' }).select().single();
    if (data) {
      setStudents(prev => [...prev, data]);
      setEditingStudentId(data.id);
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  };

  const updateStudentName = async (studentId: string, name: string) => {
    if (readOnly) return;
    await supabase.from('students').update({ name }).eq('id', studentId);
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, name } : s));
    if (name && user && activeBatch) {
      await logActivity(user.id, profile?.name || '', 'student_added', `Added student ${name}`, activeBatch.name);
    }
    setEditingStudentId(null);
  };

  const confirmRemoveStudent = (student: Student) => { if (readOnly) return; setDeleteConfirm(student); };

  const removeStudent = async (student: Student) => {
    if (readOnly) return;
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

  // Optimistic attendance updates via upsert (uses unique (batch_id, student_id, session_index))
  const cycleAttendance = async (studentId: string, sessionIndex: number) => {
    if (readOnly) return;
    if (!activeBatchId) return;
    const studentRec = students.find(s => s.id === studentId);
    if (studentRec && isDroppedStudent(studentRec)) return;
    const existing = attendance.find(a => a.student_id === studentId && a.session_index === sessionIndex);
    let newState: string;
    if (!existing || existing.state === 'e') newState = 'c';
    else if (existing.state === 'c') newState = 'x';
    else newState = 'e';

    const prevState = existing?.state ?? 'e';
    const prevNote = existing?.absence_note ?? null;
    const tempId = `temp-${Date.now()}-${studentId}-${sessionIndex}`;
    const isTempId = !!existing?.id?.startsWith('temp-');

    // Optimistic local update
    showSyncStatus('syncing');
    if (existing) {
      const updateData: Partial<AttendanceRecord> = { state: newState };
      if (newState !== 'x') updateData.absence_note = null;
      setAttendance(prev => prev.map(a => a.id === existing.id ? { ...a, ...updateData } : a));
    } else {
      const optimistic: AttendanceRecord = { id: tempId, student_id: studentId, batch_id: activeBatchId, session_index: sessionIndex, state: newState };
      setAttendance(prev => [...prev, optimistic]);
    }

    // Guard: never send a temp id to Supabase. The pending insert will resolve and
    // replace the temp row with the real row; the next click will then upsert normally.
    if (isTempId) {
      showSyncStatus('saved');
    } else {
      // Single upsert — relies on unique constraint (batch_id, student_id, session_index)
      const payload = {
        student_id: studentId,
        batch_id: activeBatchId,
        session_index: sessionIndex,
        state: newState,
        ...(newState !== 'x' ? { absence_note: null as string | null } : {}),
      };
      supabase.from('attendance')
        .upsert(payload, { onConflict: 'batch_id,student_id,session_index' })
        .select().single()
        .then(({ data, error }) => {
          if (error) {
            console.error('Attendance save error:', {
              message: error.message,
              code: error.code,
              details: error.details,
              hint: error.hint,
              payload: { studentId, sessionIndex, state: newState },
            });
            // Revert only this cell
            if (existing) {
              setAttendance(prev => prev.map(a => a.id === existing.id ? { ...a, state: prevState, absence_note: prevNote } : a));
            } else {
              setAttendance(prev => prev.filter(a => a.id !== tempId));
            }
            toast.error('Failed to save attendance');
            showSyncStatus('idle');
          } else if (data) {
            // Reconcile local row with the canonical DB row (real id, etc.)
            const saved = data as AttendanceRecord;
            setAttendance(prev => {
              const withoutTemp = prev.filter(a => a.id !== tempId);
              const idx = withoutTemp.findIndex(a => a.student_id === saved.student_id && a.session_index === saved.session_index && a.batch_id === saved.batch_id);
              if (idx === -1) return [...withoutTemp, saved];
              const next = withoutTemp.slice();
              next[idx] = saved;
              return next;
            });
            showSyncStatus('saved');
          }
        });
    }
    showSaved();
    if (user && activeBatch) {
      let description = 'Marked attendance';
      if (sessionIndex >= 1000) {
        const toWeek = sessionIndex - 1000 + 1;
        const r = rescheduledSessions.find(r => (r.to_week ?? null) === toWeek);
        if (r) {
          const week = r.from_week ?? r.week_number;
          const day = r.from_day ?? r.day_name;
          description = `Marked Week ${week}, ${day} (rescheduled) attendance`;
        }
      } else if (sessionIndex >= 0 && sessionIndex < 24) {
        const week = Math.floor(sessionIndex / 4) + 1;
        const dayNumber = (sessionIndex % 4) + 1;
        const day = ['Mon', 'Tue', 'Thu', 'Fri'][sessionIndex % 4];
        description = `Marked Week ${week}, Day ${dayNumber} (${day}) attendance`;
      }
      logActivity(user.id, profile?.name || '', 'attendance_marked', description, activeBatch.name);
    }
  };

  // Mark all present/absent for a session
  const markAllForSession = async (sessionIndex: number, state: 'c' | 'x') => {
    if (readOnly) return;
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

  // Demo day absence detection
  // Demo days happen on Friday of weeks 2, 4, 6 → session_index = (week-1)*4+3
  const getDemoDaySessionIndex = (dayNumber: number): number | null => {
    if (dayNumber < 1 || dayNumber > 3) return null;
    const week = dayNumber * 2;
    return (week - 1) * 4 + 3; // Fri of that week
  };

  const isStudentAbsentOnDemoDay = (studentId: string, dayNumber: number): boolean => {
    const baseIdx = getDemoDaySessionIndex(dayNumber);
    if (baseIdx === null) return false;
    // Check if this Friday was rescheduled
    const week = dayNumber * 2;
    const reschedule = rescheduledSessions.find(r =>
      ((r.from_week ?? r.week_number) === week) &&
      ((r.from_day ?? r.day_name) === 'Fri')
    );
    if (reschedule) {
      // Demo happened on rescheduled day — check the Wed synthetic index
      const wedIdx = 1000 + (week - 1); // WED_BASE + (week - 1)
      const rescheduledAtt = attendance.find(a =>
        a.student_id === studentId && a.session_index === wedIdx && a.batch_id === activeBatchId
      );
      if (rescheduledAtt) return rescheduledAtt.state === 'x';
      // No attendance record for rescheduled day — treat as not absent (session may not have happened yet)
      return false;
    }
    // Check original Friday slot
    const original = attendance.find(a => a.student_id === studentId && a.session_index === baseIdx);
    return original?.state === 'x';
  };

  // Returns student's attendance state on a demo day: 'c' (present), 'x' (absent), or 'e' (not marked).
  // Honors rescheduled Friday demo days via synthetic Wed index (1000 + week-1).
  const getStudentDemoDayState = (studentId: string, dayNumber: number): 'c' | 'x' | 'e' => {
    const baseIdx = getDemoDaySessionIndex(dayNumber);
    if (baseIdx === null) return 'e';
    const week = dayNumber * 2;
    const reschedule = rescheduledSessions.find(r =>
      ((r.from_week ?? r.week_number) === week) &&
      ((r.from_day ?? r.day_name) === 'Fri')
    );
    if (reschedule) {
      const wedIdx = 1000 + (week - 1);
      const ra = attendance.find(a =>
        a.student_id === studentId && a.session_index === wedIdx && a.batch_id === activeBatchId
      );
      return ra?.state === 'c' || ra?.state === 'x' ? (ra.state as 'c' | 'x') : 'e';
    }
    const original = attendance.find(a => a.student_id === studentId && a.session_index === baseIdx);
    return original?.state === 'c' || original?.state === 'x' ? (original.state as 'c' | 'x') : 'e';
  };

  // Make-up scheduling helpers
  const getStudentMakeup = (studentId: string, dayNumber: number): { date: string; note: string | null } | null => {
    if (!isStudentAbsentOnDemoDay(studentId, dayNumber)) return null;
    const dd = demoDays.find(d => d.day_number === dayNumber);
    if (!dd) return null;
    const scoreRow = demoScores.find((s: any) => s.demo_day_id === dd.id && s.student_id === studentId && s.makeup_date);
    if (!scoreRow) return null;
    return { date: (scoreRow as any).makeup_date as string, note: ((scoreRow as any).makeup_note as string | null) ?? null };
  };
  const getAbsentNeedsScheduling = (dayNumber: number): Student[] =>
    students.filter(s => !isDroppedStudent(s) && isStudentAbsentOnDemoDay(s.id, dayNumber) && !getStudentMakeup(s.id, dayNumber));
  const getAbsentScheduled = (dayNumber: number): Array<{ student: Student; makeup: { date: string; note: string | null } }> =>
    students
      .filter(s => !isDroppedStudent(s) && isStudentAbsentOnDemoDay(s.id, dayNumber))
      .map(s => ({ student: s, makeup: getStudentMakeup(s.id, dayNumber) }))
      .filter((x): x is { student: Student; makeup: { date: string; note: string | null } } => x.makeup !== null);
  const fmtMakeupDate = (iso: string): string => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return iso; }
  };


  const openNoteModal = (studentId: string, sessionIndex: number) => {
    if (readOnly) return;
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
    if (readOnly) return;
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
    if (readOnly) return;
    if (!existingId && reschedulesRemaining <= 0) return;
    const info = getSessionLabel(sessionIndex);
    const weekNum = Math.floor(sessionIndex / 4) + 1;
    const dayName = info.isDemo ? 'Demo day' : info.day;
    const existing = rescheduledSessions.find(r => r.id === existingId);
    setSelectedWednesdayWeek(existing?.to_week ?? null);
    setRescheduleModal({ sessionIndex, dayName, weekNumber: weekNum, existingId });
  };

  const saveReschedule = async () => {
    if (readOnly) return;
    setRescheduleError(null);
    if (!rescheduleModal || !activeBatchId || !user) {
      setRescheduleError('Something went wrong, please try again');
      return;
    }
    if (selectedWednesdayWeek == null) {
      setRescheduleError('Please select a Wednesday');
      return;
    }
    if (!rescheduleModal.existingId && reschedulesUsed >= MAX_RESCHEDULES) {
      setRescheduleError('Maximum reschedules reached (3 of 3)');
      setTimeout(() => { setRescheduleModal(null); setSelectedWednesdayWeek(null); setRescheduleError(null); }, 1200);
      return;
    }
    const wedDate = getWednesdayDate(selectedWednesdayWeek);
    if (!wedDate) {
      setRescheduleError('Set a batch start date before rescheduling');
      return;
    }
    const toDateStr = wedDate.toISOString().split('T')[0];
    const fromWeek = rescheduleModal.weekNumber;
    const fromDay = rescheduleModal.dayName;
    setRescheduleSaving(true);
    try {
      if (rescheduleModal.existingId) {
        const { error } = await supabase.from('rescheduled_sessions').update({
          from_week: fromWeek, from_day: fromDay,
          to_week: selectedWednesdayWeek, to_date: toDateStr,
          new_date: toDateStr, week_number: fromWeek, day_name: fromDay,
        } as any).eq('id', rescheduleModal.existingId);
        if (error) throw error;
        setRescheduledSessions(prev => prev.map(r => r.id === rescheduleModal.existingId
          ? { ...r, from_week: fromWeek, from_day: fromDay, to_week: selectedWednesdayWeek, to_date: toDateStr, new_date: toDateStr, week_number: fromWeek, day_name: fromDay }
          : r));
      } else {
        const { data, error } = await supabase.from('rescheduled_sessions').insert({
          batch_id: activeBatchId,
          week_number: fromWeek, day_name: fromDay,
          from_week: fromWeek, from_day: fromDay,
          to_week: selectedWednesdayWeek, to_date: toDateStr,
          original_date: getSessionDateObj(rescheduleModal.sessionIndex)?.toISOString().split('T')[0] || null,
          new_date: toDateStr,
          created_by: user.id,
        } as any).select().single();
        if (error) throw error;
        if (data) setRescheduledSessions(prev => [...prev, data as RescheduledSession]);
      }
      const desc = `Rescheduled W${fromWeek} ${fromDay} → W${selectedWednesdayWeek} Wed (${fmtDate(wedDate)})`;
      await logActivity(user.id, profile?.name || '', 'session_rescheduled', desc, activeBatch?.name || '');
      setRescheduleModal(null);
      setSelectedWednesdayWeek(null);
      setRescheduleError(null);
      showSaved();
    } catch (err) {
      console.error('saveReschedule error', err);
      setRescheduleError('Something went wrong, please try again');
    } finally {
      setRescheduleSaving(false);
    }
  };

  const removeReschedule = async (id: string) => {
    if (readOnly) return;
    await supabase.from('rescheduled_sessions').delete().eq('id', id);
    setRescheduledSessions(prev => prev.filter(r => r.id !== id));
    setRemoveRescheduleConfirm(null);
    showSaved();
  };

  // ===== Demo make-up scheduling =====
  const openMakeupModal = (studentId: string, dayNumber: number) => {
    if (readOnly) return;
    const student = students.find(s => s.id === studentId);
    const dd = demoDays.find(d => d.day_number === dayNumber);
    if (!student || !dd) return;
    const existing = getStudentMakeup(studentId, dayNumber);
    const todayIso = new Date().toISOString().slice(0, 10);
    setMakeupDate(existing ? (existing.date.slice(0, 10)) : todayIso);
    setMakeupNote(existing?.note || '');
    setMakeupModal({
      studentId,
      studentName: student.name,
      dayNumber,
      demoDayId: dd.id,
      demoDayTitle: dd.title,
      demoDayDate: dd.date,
      isEdit: !!existing,
    });
  };

  const closeMakeupModal = () => {
    setMakeupModal(null);
    setMakeupDate('');
    setMakeupNote('');
    setMakeupSaving(false);
  };

  const saveMakeup = async () => {
    if (!makeupModal || readOnly || makeupSaving) return;
    if (!makeupDate) { toast.error('Please pick a make-up date'); return; }
    setMakeupSaving(true);
    const { demoDayId, studentId, studentName, dayNumber } = makeupModal;
    const makeupIso = new Date(makeupDate).toISOString();
    const noteVal = makeupNote.trim() || null;
    try {
      const existing = demoScores.filter(s => s.demo_day_id === demoDayId && s.student_id === studentId);
      const missingCriteria = CRITERIA.filter(c => !existing.find(e => e.criterion === c));

      // Update existing rows
      if (existing.length > 0) {
        const { error: updErr } = await supabase
          .from('demo_scores')
          .update({ makeup_date: makeupIso, makeup_note: noteVal } as any)
          .eq('demo_day_id', demoDayId)
          .eq('student_id', studentId);
        if (updErr) throw updErr;
      }
      // Insert any missing criterion rows with score 0
      if (missingCriteria.length > 0) {
        const rows = missingCriteria.map(criterion => ({
          demo_day_id: demoDayId, student_id: studentId, criterion, score: 0,
          makeup_date: makeupIso, makeup_note: noteVal,
        }));
        const { data: inserted, error: insErr } = await supabase
          .from('demo_scores').insert(rows as any).select();
        if (insErr) throw insErr;
        if (inserted) {
          setDemoScores(prev => [...prev, ...(inserted as DemoScore[])]);
        }
      }
      // Reflect makeup fields in local state for existing rows
      setDemoScores(prev => prev.map(s =>
        (s.demo_day_id === demoDayId && s.student_id === studentId)
          ? ({ ...s, makeup_date: makeupIso, makeup_note: noteVal } as any)
          : s
      ));
      if (user && activeBatch) {
        logActivity(
          user.id, profile?.name || '',
          'demo_makeup_scheduled',
          `Recorded make-up for ${studentName} on Demo Day ${dayNumber} (made up on ${fmtMakeupDate(makeupIso)})`,
          activeBatch.name,
        );
      }
      showSaved();
      closeMakeupModal();
    } catch (e) {
      console.error('saveMakeup error', e);
      toast.error('Failed to save make-up — please try again');
      setMakeupSaving(false);
    }
  };

  const removeMakeup = async () => {
    if (!makeupModal || readOnly || makeupSaving) return;
    setMakeupSaving(true);
    const { demoDayId, studentId, studentName, dayNumber } = makeupModal;
    try {
      const { error } = await supabase
        .from('demo_scores')
        .update({ makeup_date: null, makeup_note: null } as any)
        .eq('demo_day_id', demoDayId)
        .eq('student_id', studentId);
      if (error) throw error;
      setDemoScores(prev => prev.map(s =>
        (s.demo_day_id === demoDayId && s.student_id === studentId)
          ? ({ ...s, makeup_date: null, makeup_note: null } as any)
          : s
      ));
      if (user && activeBatch) {
        logActivity(
          user.id, profile?.name || '',
          'demo_makeup_scheduled',
          `Removed make-up for ${studentName} on Demo Day ${dayNumber}`,
          activeBatch.name,
        );
      }
      showSaved();
      closeMakeupModal();
    } catch (e) {
      console.error('removeMakeup error', e);
      toast.error('Failed to remove make-up — please try again');
      setMakeupSaving(false);
    }
  };


  // ===== Drop-out helpers =====
  const activeStudents = useMemo(() => students.filter(s => !isDroppedStudent(s)), [students]);
  const droppedStudents = useMemo(() => students.filter(isDroppedStudent), [students]);
  const sortedStudents = useMemo(() => {
    const named = activeStudents.filter(s => (s.name || '').trim() !== '');
    const unnamed = activeStudents.filter(s => (s.name || '').trim() === '');
    const dropped = [...droppedStudents].sort((a, b) => {
      const ad = a.status_changed_at ? new Date(a.status_changed_at).getTime() : 0;
      const bd = b.status_changed_at ? new Date(b.status_changed_at).getTime() : 0;
      return bd - ad;
    });
    return [...named, ...dropped, ...unnamed];
  }, [activeStudents, droppedStudents]);

  const openDropoutModal = (s: Student) => {
    if (readOnly) return;
    setDropoutReason('');
    setDropoutDate(new Date().toISOString().slice(0, 10));
    setDropoutModal(s);
    setStudentMenuId(null);
  };
  const closeDropoutModal = () => { setDropoutModal(null); setDropoutReason(''); setDropoutSaving(false); };

  const saveDropout = async () => {
    if (!dropoutModal || readOnly) return;
    setDropoutSaving(true);
    try {
      const dateIso = dropoutDate ? new Date(dropoutDate).toISOString() : new Date().toISOString();
      const { error } = await supabase.from('students').update({
        status: 'dropped',
        status_reason: dropoutReason || null,
        status_changed_at: dateIso,
      } as any).eq('id', dropoutModal.id);
      if (error) throw error;
      setStudents(prev => prev.map(s => s.id === dropoutModal.id
        ? { ...s, status: 'dropped', status_reason: dropoutReason || null, status_changed_at: dateIso }
        : s));
      if (user && activeBatch) {
        await logActivity(user.id, profile?.name || '', 'student_dropped', `Marked ${dropoutModal.name} as dropped out`, activeBatch.name);
      }
      showSaved();
      closeDropoutModal();
    } catch (e) {
      console.error('saveDropout', e);
      toast.error('Failed to save — please try again');
      setDropoutSaving(false);
    }
  };

  const reverseDropout = async (s: Student) => {
    if (readOnly) return;
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase.from('students').update({
        status: 'active', status_reason: null, status_changed_at: nowIso,
      } as any).eq('id', s.id);
      if (error) throw error;
      setStudents(prev => prev.map(x => x.id === s.id
        ? { ...x, status: 'active', status_reason: null, status_changed_at: nowIso }
        : x));
      if (user && activeBatch) {
        await logActivity(user.id, profile?.name || '', 'student_reactivated', `Reversed ${s.name}'s drop-out`, activeBatch.name);
      }
      showSaved();
      setReverseDropConfirm(null);
    } catch (e) {
      console.error('reverseDropout', e);
      toast.error('Failed to save — please try again');
    }
  };

  // Stats
  const enrolledStudents = students.length;
  const activeStudentCount = activeStudents.length;
  const droppedCount = droppedStudents.length;
  const totalStudents = activeStudentCount;
  const totalSessions = 24;
  const avgAttendance: number | null = (() => {
    if (activeStudents.length === 0) return null;
    const sessionsOccurred = getSessionsOccurred(activeBatch?.start_date);
    const activeIds = new Set(activeStudents.map(s => s.id));
    const present = attendance.filter(a => a.state === 'c' && activeIds.has(a.student_id)).length;
    return computeAttendancePct(present, activeStudents.length, sessionsOccurred);
  })();
  // avgDemoScore computed below after getStudentDemoTotal is defined
  const sessionsCompleted = (() => {
    const completedIndexes = new Set<number>();
    attendance.forEach(a => {
      if (a.batch_id !== activeBatchId) return;
      if (a.state !== 'c' && a.state !== 'x') return;
      if (a.session_index >= 0 && a.session_index < 24) {
        completedIndexes.add(a.session_index);
      } else if (a.session_index >= 1000) {
        const toWeek = a.session_index - 1000 + 1;
        const r = rescheduledSessions.find(r => (r.to_week ?? null) === toWeek);
        if (r) {
          const week = (r.from_week ?? r.week_number) as number;
          const dayName = (r.from_day ?? r.day_name) as string;
          const dayIdx = dayName === 'Mon' ? 0 : dayName === 'Tue' ? 1 : dayName === 'Thu' ? 2 : 3;
          completedIndexes.add((week - 1) * 4 + dayIdx);
        }
      }
    });
    return completedIndexes.size;
  })();

  // Initialize scoreValues from demoScores when:
  //  1. The active batch changed (new batch loaded), OR
  //  2. We haven't initialized this batch yet AND demoScores now has data
  //     (async fetch completed after the initial mount).
  // The "scoreValues empty" gate prevents wiping in-progress typing on
  // subsequent demoScores updates (e.g. after a debounced upsert).
  useEffect(() => {
    const shouldInit =
      initializedBatchRef.current !== activeBatchId ||
      (initializedBatchRef.current === activeBatchId &&
        Object.keys(scoreValues).length === 0 &&
        demoScores.length > 0);
    if (!shouldInit) return;

    const vals: Record<string, string> = {};
    for (const s of demoScores) {
      const key = `${s.demo_day_id}|${s.student_id}|${s.criterion}`;
      if (Number(s.score) !== 0) vals[key] = String(s.score);
    }
    setScoreValues(vals);
    initializedBatchRef.current = activeBatchId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBatchId, demoScores]);

  const updateScoreValue = (demoDayId: string, studentId: string, criterion: string, rawVal: string) => {
    if (readOnly) return;
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
            if (error) { showSyncStatus('idle'); toast.error('Failed to save score — please try again', { duration: 4000 }); }
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
            if (error) { setDemoScores(prev => prev.filter(s => s.id !== tempId)); showSyncStatus('idle'); toast.error('Failed to save score — please try again', { duration: 4000 }); }
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
    if (val >= 16) return 'hsl(var(--score-green))';
    if (val >= 12) return 'hsl(var(--score-amber))';
    return 'hsl(var(--score-red))';
  };

  const { avgDemoScore, absentDemoCount } = (() => {
    if (demoDays.length === 0 || activeStudents.length === 0) return { avgDemoScore: 0, absentDemoCount: 0 };
    let totalScore = 0;
    let studentDayCount = 0;
    let absentCount = 0;
    for (const dd of demoDays) {
      for (const s of activeStudents) {
        if (isStudentAbsentOnDemoDay(s.id, dd.day_number)) {
          absentCount++;
          continue;
        }
        const t = getStudentDemoTotal(dd.id, s.id);
        if (t !== '—') {
          totalScore += parseFloat(t);
          studentDayCount++;
        }
      }
    }
    const avg = studentDayCount > 0 ? Math.round((totalScore / studentDayCount) * 10) / 10 : 0;
    return { avgDemoScore: avg, absentDemoCount: absentCount };
  })();

  const getFeedback = (demoDayId: string, studentId: string): DemoFeedback | undefined => {
    return demoFeedback.find(f => f.demo_day_id === demoDayId && f.student_id === studentId);
  };

  const openFeedbackModal = (demoDayId: string, studentId: string, dd: DemoDay) => {
    if (readOnly) return;
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
    if (readOnly) return;
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
  const attendanceColor = avgAttendance === null ? 'hsl(var(--muted-foreground))' : avgAttendance >= 70 ? 'hsl(var(--score-green))' : avgAttendance >= 50 ? 'hsl(var(--score-amber))' : 'hsl(var(--score-red))';

  // --- Task detection for ToDoSidebar ---
  const computedCurrentWeek = getCurrentWeek(activeBatch?.start_date) ?? 1;
  const currentWeekStatus = weekStatuses.find(ws => ws.week_number === computedCurrentWeek)?.status || 'open';

  // Helper: generate tasks for a given week
   const generateTasksForWeek = (weekNum: number, isOverdue: boolean): Task[] => {
     if (!activeBatch || students.length === 0) return [];
     const tasks: Task[] = [];
     const today = new Date();
     today.setHours(0, 0, 0, 0);
     const wStart = (weekNum - 1) * 4;
     const shortDayNames = ['Mon', 'Tue', 'Thu', 'Fri'];
     const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

     const formatShortDate = (d: Date): string => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

     // 1. Attendance missing — flag if ANY student lacks attendance for that session
     // For current-week (non-overdue): only show if session is in the past OR mod has started marking it.
     // For overdue weeks: all past sessions are shown regardless.
     for (let i = 0; i < 4; i++) {
       const si = wStart + i;
       const sessionDate = getSessionDateObj(si);
       if (!sessionDate) continue;
       const studentsWithAttendance = attendance.filter(a =>
         a.session_index === si && a.batch_id === activeBatch.id && a.state !== 'e'
       ).length;
       const totalStudents = students.length;
       const isPastSession = sessionDate < today;
       const hasStarted = studentsWithAttendance > 0;
       // Overdue tabs are always past weeks, so show all. Current week: only past or started.
       if (!isOverdue && !isPastSession && !hasStarted) continue;
       if (isOverdue && !isPastSession) continue;
       if (studentsWithAttendance < totalStudents) {
         const remaining = totalStudents - studentsWithAttendance;
         const dateStr = formatShortDate(sessionDate);
         tasks.push({
           id: `untouched-${si}`,
           type: 'untouched_session',
           severity: isOverdue ? 'default' : 'urgent',
           title: `Mark ${shortDayNames[i]} ${dateStr} attendance`,
           meta: `${remaining} of ${totalStudents} students missing`,
           targetSessionIndex: si,
           isOverdue,
           weekNumber: weekNum,
         });
       }
     }

     // 2. Absences without reason
     const absencesBySession: Record<number, { studentId: string; name: string }[]> = {};
     for (const a of attendance) {
       if (a.state === 'x' && (!a.absence_note || a.absence_note.trim() === '')) {
         if (a.session_index < wStart || a.session_index >= wStart + 4) continue;
         if (!absencesBySession[a.session_index]) absencesBySession[a.session_index] = [];
         const student = students.find(s => s.id === a.student_id);
         absencesBySession[a.session_index].push({ studentId: a.student_id, name: student?.name?.split(' ')[0] || 'Student' });
       }
     }
     for (const [siStr, items] of Object.entries(absencesBySession)) {
       const si = parseInt(siStr);
       const dayIdx = si % 4;
       const sessionDate = getSessionDateObj(si);
       const dateStr = sessionDate ? ` ${formatShortDate(sessionDate)}` : '';
       const n = items.length;
       const names = items.slice(0, 3).map(ii => ii.name);
       const extra = n > 3 ? ` + ${n - 3} more` : '';
       tasks.push({
         id: `absence-note-${si}`,
         type: 'absence_no_reason',
         severity: isOverdue ? 'default' : 'warn',
         title: `${shortDayNames[dayIdx]}${dateStr} absence reasons`,
         meta: names.join(', ') + extra,
         targetSessionIndex: si,
         isOverdue,
         weekNumber: weekNum,
       });
     }

     // 3. Demo day scores missing
     for (const dd of demoDays) {
       const ddWeek = dd.day_number * 2;
       if (ddWeek !== weekNum) continue;
       if (!dd.date) continue;
       const ddDate = new Date(dd.date + 'T00:00:00');
       if (ddDate > today) continue;
       const dateStr = formatShortDate(ddDate);
       let missing = 0;
       for (const s of students) {
         if (isStudentAbsentOnDemoDay(s.id, dd.day_number)) continue;
         const hasScores = CRITERIA.some(c => {
           const key = `${dd.id}|${s.id}|${c}`;
           return scoreValues[key] && scoreValues[key] !== '' && scoreValues[key] !== '.';
         });
         if (!hasScores) missing++;
       }
       if (missing > 0) {
         tasks.push({
           id: `demo-scores-${dd.id}`,
           type: 'demo_scores_missing',
           severity: isOverdue ? 'default' : 'warn',
           title: `Demo Day ${dd.day_number} scores · ${dateStr}`,
           meta: `${missing} student${missing > 1 ? 's' : ''} remaining`,
           targetDemoDayId: dd.id,
           isOverdue,
           weekNumber: weekNum,
         });
       }
     }

     // 4. Demo day feedback missing
     for (const dd of demoDays) {
       const ddWeek = dd.day_number * 2;
       if (ddWeek !== weekNum) continue;
       if (!dd.date) continue;
       const ddDate = new Date(dd.date + 'T00:00:00');
       if (ddDate > today) continue;
       const dateStr = formatShortDate(ddDate);
       let missing = 0;
       for (const s of students) {
         if (isStudentAbsentOnDemoDay(s.id, dd.day_number)) continue;
         const hasScores = CRITERIA.some(c => {
           const key = `${dd.id}|${s.id}|${c}`;
           return scoreValues[key] && scoreValues[key] !== '' && scoreValues[key] !== '.';
         });
         if (!hasScores) continue;
         const fb = demoFeedback.find(f => f.demo_day_id === dd.id && f.student_id === s.id);
         if (!fb || !fb.feedback || fb.feedback.trim() === '') missing++;
       }
       if (missing > 0) {
         tasks.push({
           id: `demo-feedback-${dd.id}`,
           type: 'demo_feedback_missing',
           severity: isOverdue ? 'default' : 'warn',
           title: `Demo Day ${dd.day_number} feedback · ${dateStr}`,
           meta: `${missing} student${missing > 1 ? 's' : ''} remaining`,
           targetDemoDayId: dd.id,
           isOverdue,
           weekNumber: weekNum,
         });
       }
     }

     return tasks;
   };

  // Current week tasks
  const detectedTasks: Task[] = useMemo(() => {
    if (!isDevTester) return [];
    if (!activeBatch || students.length === 0) return [];
    const cw = computedCurrentWeek;
    const tasks = generateTasksForWeek(cw, false);
    tasks.sort((a, b) => {
      const order = { urgent: 0, warn: 1, default: 2 };
      return (order[a.severity] ?? 2) - (order[b.severity] ?? 2);
    });
    if (currentWeekStatus === 'open') {
      tasks.push({
        id: 'finalise',
        type: 'finalise',
        severity: 'default',
        title: `Finalise Week ${cw}`,
        meta: `Confirms your data for Week ${cw}`,
      });
    }
    return tasks;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDevTester, activeBatch, students, attendance, demoDays, demoFeedback, scoreValues, computedCurrentWeek, currentWeekStatus, rescheduledSessions]);

  // Overdue tasks (previous weeks that are 'open' or 'closed' — not 'finalised' or 'reopened')
  const overdueTasks: Task[] = useMemo(() => {
    if (!isDevTester) return [];
    if (!activeBatch || students.length === 0) return [];
    const cw = computedCurrentWeek;
    const allOverdue: Task[] = [];
    for (let w = 1; w < cw; w++) {
      const ws = weekStatuses.find(s => s.week_number === w);
      const status = ws?.status || 'open';
      if (status === 'finalised' || status === 'reopened') continue;
      const weekTasks = generateTasksForWeek(w, true);
      allOverdue.push(...weekTasks);
    }
    return allOverdue;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDevTester, activeBatch, students, attendance, demoDays, demoFeedback, scoreValues, computedCurrentWeek, weekStatuses, rescheduledSessions]);

  // Click handler for tasks — switch week, scroll + pulse
  const handleTaskClick = (task: Task) => {
    if (task.type === 'finalise' || task.isOverdue) return;

    let targetWeek: number | null = null;
    if (task.targetSessionIndex !== undefined) {
      targetWeek = Math.floor(task.targetSessionIndex / 4) + 1;
    } else if (task.targetDemoDayId) {
      const dd = demoDays.find(d => d.id === task.targetDemoDayId);
      if (dd) targetWeek = dd.day_number * 2;
    }

    if (targetWeek !== null) {
      if (allWeeksView) setAllWeeksView(false);
      if (targetWeek !== selectedWeek) setSelectedWeek(targetWeek);
    }

    if (task.targetDemoDayId && !demoDaysExpanded) {
      setDemoDaysExpanded(true);
    }

    requestAnimationFrame(() => {
      setTimeout(() => {
        const targetId = task.targetSessionIndex !== undefined
          ? `session-col-${task.targetSessionIndex}`
          : task.targetDemoDayId
            ? `demo-day-${task.targetDemoDayId}`
            : null;
        if (!targetId) return;
        const target = document.getElementById(targetId);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.classList.add('mc-pulse');
          setTimeout(() => target.classList.remove('mc-pulse'), 2400);
        }
      }, 100);
    });
  };

  const handleFinaliseClick = () => {
    toast('(this would finalise the week — coming next)');
  };

  // Compute completion pct for admin summary
  const completionPct = useMemo(() => {
    const nonFinalise = detectedTasks.filter(t => t.type !== 'finalise');
    if (nonFinalise.length === 0) return 100;
    const maxEstimate = Math.max(nonFinalise.length, 5);
    return Math.round(((maxEstimate - nonFinalise.length) / maxEstimate) * 100);
  }, [detectedTasks]);
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
      <th key={si} id={`session-col-${si}`} className="text-center py-2 font-medium" style={{
        fontSize: 12, position: 'relative',
        background: rescheduled ? 'hsl(var(--amber-bg))' : (info.isDemo ? 'hsl(var(--demo-col-bg))' : 'hsl(var(--grid-header-bg))'),
        color: rescheduled ? 'hsl(var(--amber-text))' : (info.isDemo ? 'hsl(var(--amber-text))' : 'hsl(var(--muted-foreground))'),
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span style={{ fontWeight: rescheduled ? 600 : undefined }}>
            {info.isDemo ? 'Demo day' : info.day}{rescheduled ? ' ↻' : ''}
          </span>
          {!readOnly && (
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
          )}
        </div>
        {rescheduled ? (
          <div style={{ fontSize: 11, color: 'hsl(var(--amber-text))' }}>
            rescheduled → W{rescheduled.to_week ?? '?'} Wed
          </div>
        ) : (
          dateStr && <div style={{ fontSize: 11, opacity: 0.7 }}>{dateStr}</div>
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
        background: 'hsl(var(--success-bg))', color: 'hsl(var(--score-green))',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Wed</span>
          {!readOnly && (
            <ColumnMenu
              sessionIndex={wedSessionIndex(week)}
              isRescheduled={true}
              isRescheduledTarget={true}
              onReschedule={() => {}}
              onEditReschedule={() => openRescheduleModal((((r.from_week ?? r.week_number) - 1) * 4) + (['Mon','Tue','Thu','Fri'].indexOf(r.from_day ?? r.day_name) >= 0 ? ['Mon','Tue','Thu','Fri'].indexOf(r.from_day ?? r.day_name) : 0), r.id)}
              onRemoveReschedule={() => setRemoveRescheduleConfirm(r)}
              onMarkAllPresent={() => markAllForSession(wedSessionIndex(week), 'c')}
              onMarkAllAbsent={() => markAllForSession(wedSessionIndex(week), 'x')}
            />
          )}
        </div>
        <div style={{ fontSize: 11, color: 'hsl(var(--score-green))', opacity: 0.7 }}>
          ↻ from W{r.from_week ?? r.week_number} {r.from_day ?? r.day_name}
        </div>
        {dateStr && <div style={{ fontSize: 11, color: 'hsl(var(--score-green))', opacity: 0.5 }}>{dateStr}</div>}
      </th>
    );
  };

  // Render attendance cell or rescheduled badge
  const renderCell = (studentId: string, sessionIndex: number, isDemo: boolean) => {
    const rescheduled = isSessionRescheduled(sessionIndex);
    if (rescheduled) {
      return (
        <div className="flex items-center justify-center py-2" style={{ background: 'hsl(var(--amber-bg))' }}>
          <div style={{
            width: 26, height: 26, borderRadius: 6,
            background: 'hsl(var(--amber-bg))', border: '1.5px solid #5a4a00',
            color: 'hsl(var(--amber-text))', fontSize: 14, fontWeight: 700,
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
      <div style={{ background: 'hsl(var(--success-bg))' }} data-absence-cell={state === 'x' && !note ? `${studentId}-${si}` : undefined}>
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
      {!hideTopNav && (
      <div className="px-6" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: 'hsl(var(--nav-bg))', borderBottom: '1px solid hsl(var(--nav-border))' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-0">
            {batches.map(batch => {
              const isActive = batch.id === activeBatchId;
              return (
                <div key={batch.id} className="flex items-center" style={{ maxWidth: 220 }}
                  onContextMenu={(e) => {
                    if (readOnly) return;
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
                  {isActive && !readOnly && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setDeleteBatchConfirm(batch); }}
                      title="Delete batch"
                      aria-label="Delete batch"
                      style={{ flexShrink: 0, marginLeft: 6, marginRight: 4, width: 14, height: 14, padding: 0, color: 'hsl(var(--muted-foreground))', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'hsl(var(--score-red))'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'hsl(var(--muted-foreground))'; }}
                    >✕</button>
                  )}
                </div>
              );
            })}
            {!readOnly && (
              <button onClick={() => { const d = new Date(); const day = d.getDay(); const diff = day === 0 ? 1 : (day === 1 ? 7 : 8 - day); d.setDate(d.getDate() + diff); setNewBatchStartDate(d.toISOString().split('T')[0]); setShowCreateBatch(true); }} className="px-3 py-3 text-muted-foreground hover:text-foreground text-lg">+</button>
            )}
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
      )}

      {/* Create batch modal */}
      {showCreateBatch && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="p-6 w-full max-w-sm bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 10 }}>
            <h2 className="text-lg font-medium text-foreground mb-4">Create new batch</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground">Month</label>
                <select value={newBatchMonth} onChange={(e) => setNewBatchMonth(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 text-sm text-foreground" style={{ border: '1px solid hsl(var(--input-border))', borderRadius: 8, background: 'hsl(var(--input-bg))' }}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Year</label>
                <input type="number" value={newBatchYear} onChange={(e) => setNewBatchYear(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 text-sm text-foreground" style={{ border: '1px solid hsl(var(--input-border))', borderRadius: 8, background: 'hsl(var(--input-bg))' }} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Batch start date (Monday of Week 1) <span className="text-red-500">*</span></label>
                <input type="date" value={newBatchStartDate} onChange={(e) => setNewBatchStartDate(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-sm text-foreground" style={{ border: '1px solid hsl(var(--input-border))', borderRadius: 8, background: 'hsl(var(--input-bg))' }} />
                <p className="text-muted-foreground mt-1" style={{ fontSize: 11 }}>Required. This drives all week and day calculations.</p>
              </div>
              <p className="text-xs text-muted-foreground">Batch name: <strong className="text-foreground">{MONTHS[newBatchMonth - 1]} {newBatchYear}</strong></p>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowCreateBatch(false)} className="flex-1"
                  style={cancelBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(var(--border))'; e.currentTarget.style.color = 'hsl(var(--foreground))'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = 'hsl(var(--border))'; e.currentTarget.style.color = 'hsl(var(--foreground))'; }}>Cancel</button>
                <button onClick={createBatch} disabled={!newBatchStartDate} className="flex-1 disabled:opacity-50"
                  style={primaryBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(var(--foreground))'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = 'hsl(var(--foreground))'; }}>Create</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="bg-card border-border" style={{ borderRadius: 8, padding: 24 }}>
          <DialogHeader>
            <DialogTitle className="text-foreground" style={{ fontSize: 16 }}>Remove student?</DialogTitle>
            <DialogDescription className="text-muted-foreground" style={{ fontSize: 13 }}>
              This will remove {deleteConfirm?.name || 'this student'} and all their attendance data from this batch. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-4">
            <button onClick={() => setDeleteConfirm(null)}
              style={cancelBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(var(--border))'; e.currentTarget.style.color = 'hsl(var(--foreground))'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'hsl(var(--border))'; e.currentTarget.style.color = 'hsl(var(--foreground))'; }}>Cancel</button>
            <button onClick={() => { if (deleteConfirm) { const s = deleteConfirm; setDeleteConfirm(null); removeStudent(s); } }}
              style={destructBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(var(--destructive))'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'hsl(var(--destructive))'; }}>Remove</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Absence note modal */}
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'hsl(var(--background) / 0.7)' }}
          onClick={() => setNoteModal(null)}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: 'hsl(var(--card))', border: '1px solid #2A2A2A', borderRadius: 8, padding: 20, maxWidth: 320, width: '100%' }}>
            <div style={{ fontSize: 14, color: 'hsl(var(--foreground))', fontWeight: 500, marginBottom: 4 }}>Absence note for {noteModal.studentName}</div>
            <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginBottom: 12 }}>
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
                width: '100%', background: 'hsl(var(--secondary))', border: '1px solid #333', borderRadius: 6,
                padding: '8px 10px', fontSize: 12, color: 'hsl(var(--foreground))', resize: 'none', outline: 'none',
                fontFamily: 'Inter, sans-serif',
              }}
            />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setNoteModal(null)}
                style={cancelBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(var(--border))'; e.currentTarget.style.color = 'hsl(var(--foreground))'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'hsl(var(--border))'; e.currentTarget.style.color = 'hsl(var(--foreground))'; }}>Cancel</button>
              <button onClick={() => { setNoteModal(null); saveAbsenceNote(); }}
                style={primaryBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(var(--foreground))'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'hsl(var(--foreground))'; }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule modal — Wednesday picker (max 3 per batch) */}
      {rescheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'hsl(var(--background) / 0.7)' }}
          onClick={() => { setRescheduleModal(null); setSelectedWednesdayWeek(null); setRescheduleError(null); }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: 'hsl(var(--card))', border: '1px solid #2A2A2A', borderRadius: 8, padding: 20, maxWidth: 400, width: '100%' }}>
            <div style={{ fontSize: 15, color: 'hsl(var(--foreground))', fontWeight: 600, marginBottom: 4 }}>↻ Reschedule session</div>
            <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginBottom: 12 }}>
              Week {rescheduleModal.weekNumber} · {rescheduleModal.dayName} — moving to a Wednesday
            </div>
            {/* Counter */}
            <div style={{ background: 'hsl(var(--card))', borderRadius: 8, padding: '10px 12px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', gap: 5 }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: 9, height: 9, borderRadius: '50%',
                    background: i < (reschedulesUsed - (rescheduleModal.existingId ? 1 : 0)) ? 'hsl(var(--score-amber))' : 'hsl(var(--border))',
                    border: i < (reschedulesUsed - (rescheduleModal.existingId ? 1 : 0)) ? 'none' : '1px solid #333',
                    display: 'inline-block',
                  }} />
                ))}
              </div>
              <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                {reschedulesUsed} of 3 reschedules used · {reschedulesRemaining} remaining
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginBottom: 8 }}>Choose a Wednesday to reschedule to:</div>
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto',
              marginBottom: rescheduleError ? 6 : 14,
              border: rescheduleError === 'Please select a Wednesday' ? '1px solid #f87171' : '1px solid transparent',
              borderRadius: 8, padding: rescheduleError === 'Please select a Wednesday' ? 4 : 0,
            }}>
              {[1, 2, 3, 4, 5, 6].map(week => {
                const usedBy = wednesdayUsedBy(week);
                const isSelf = usedBy && usedBy.id === rescheduleModal.existingId;
                const isUsed = usedBy && !isSelf;
                const wedDate = getWednesdayDate(week);
                const isSelected = selectedWednesdayWeek === week;
                return (
                  <label key={week}
                    onClick={() => { if (!isUsed) { setSelectedWednesdayWeek(week); setRescheduleError(null); } }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: isSelected ? 'hsl(var(--success-bg))' : 'hsl(var(--secondary))',
                      border: `1px solid ${isSelected ? 'hsl(var(--success-text))' : 'hsl(var(--border))'}`,
                      borderRadius: 8, padding: '10px 12px',
                      cursor: isUsed ? 'not-allowed' : 'pointer',
                      opacity: isUsed ? 0.4 : 1,
                    }}>
                    <span style={{
                      width: 14, height: 14, borderRadius: '50%',
                      border: `2px solid ${isSelected ? 'hsl(var(--score-green))' : 'hsl(var(--muted-foreground))'}`,
                      background: isSelected ? 'hsl(var(--score-green))' : 'transparent',
                      flexShrink: 0,
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'hsl(var(--foreground))' }}>Week {week} · Wednesday</div>
                      <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>{fmtDate(wedDate) || '(set batch start date)'}</div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 9999,
                      background: isUsed ? 'hsl(var(--border))' : 'hsl(var(--success-bg))',
                      color: isUsed ? 'hsl(var(--muted-foreground))' : 'hsl(var(--score-green))',
                    }}>{isUsed ? 'Already used' : 'Available'}</span>
                  </label>
                );
              })}
            </div>
            {rescheduleError && (
              <div style={{ fontSize: 12, color: 'hsl(var(--score-red))', marginBottom: 10 }}>{rescheduleError}</div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setRescheduleModal(null); setSelectedWednesdayWeek(null); setRescheduleError(null); }}
                style={cancelBtnStyle}>Cancel</button>
              <button type="button" onClick={() => saveReschedule()}
                style={{ background: 'hsl(var(--amber-bg))', border: '1px solid #7a5000', color: 'hsl(var(--amber-text))', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: rescheduleSaving ? 'wait' : 'pointer', opacity: rescheduleSaving ? 0.7 : 1 }}
              >↻ Confirm reschedule</button>
            </div>
          </div>
        </div>
      )}

      {/* Remove reschedule confirmation */}
      {removeRescheduleConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setRemoveRescheduleConfirm(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'hsl(var(--card))', border: '1px solid #2A2A2A', borderRadius: 8, padding: 20, maxWidth: 380, width: '100%' }}>
            <div style={{ fontSize: 15, color: 'hsl(var(--foreground))', fontWeight: 600, marginBottom: 6 }}>Remove this reschedule?</div>
            <div style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginBottom: 16, lineHeight: 1.5 }}>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'hsl(var(--background) / 0.75)' }}
          onClick={() => setFeedbackModal(null)}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: 'hsl(var(--card))', border: '1px solid #2e2e2e', borderRadius: 8, padding: 28, maxWidth: 480, width: '90%' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'hsl(var(--foreground))', marginBottom: 4 }}>Individual feedback</div>
            <div style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginBottom: 20 }}>
              {feedbackModal.studentName} · {feedbackModal.demoDayTitle} · {feedbackModal.demoDayDate || '—'} · Total: {feedbackModal.totalScore} / 20
            </div>
            <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginBottom: 8 }}>Feedback notes</div>
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
                width: '100%', background: 'hsl(var(--secondary))', border: '1px solid #333', borderRadius: 8,
                padding: 16, fontSize: 14, color: 'hsl(var(--foreground))', lineHeight: 1.8,
                outline: 'none', minHeight: 120, resize: 'none', overflow: 'hidden',
                fontFamily: 'Inter, sans-serif',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => setFeedbackModal(null)}
                style={cancelBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(var(--border))'; e.currentTarget.style.color = 'hsl(var(--foreground))'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'hsl(var(--border))'; e.currentTarget.style.color = 'hsl(var(--foreground))'; }}>Cancel</button>
              <button onClick={() => { setFeedbackModal(null); saveFeedback(); }}
                style={primaryBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(var(--foreground))'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'hsl(var(--foreground))'; }}>Save feedback</button>
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
            background: 'hsl(var(--secondary))', border: '1px solid #333', borderRadius: 8, padding: 5,
            boxShadow: '0 4px 16px hsl(var(--background) / 0.5)',
          }} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
            <button
              type="button"
              onClick={() => { setBatchContextMenu(null); openEditBatch(batch); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, color: 'hsl(var(--muted-foreground))', borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'hsl(var(--border))'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >✏️ Edit details</button>
            <div style={{ height: 1, background: 'hsl(var(--border))', margin: '3px 0' }} />
            <button
              type="button"
              onClick={() => { setBatchContextMenu(null); setDeleteBatchConfirm(batch); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, color: 'hsl(var(--score-red))', borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'hsl(var(--border))'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >🗑 Delete batch</button>
          </div>
        );
      })()}

      {/* Delete batch confirmation modal */}
      {deleteBatchConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setDeleteBatchConfirm(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'hsl(var(--card))', border: '1px solid #2A2A2A', borderRadius: 8, padding: 24, maxWidth: 400, width: '100%' }}>
            <div style={{ fontSize: 16, color: 'hsl(var(--foreground))', fontWeight: 500, marginBottom: 8 }}>Delete batch?</div>
            <div style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', lineHeight: 1.5 }}>
              This will permanently delete <span style={{ color: 'hsl(var(--score-red))' }}>{deleteBatchConfirm.name}</span> and all its attendance, demo day scores and student records. This cannot be undone.
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setDeleteBatchConfirm(null)}
                style={cancelBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(var(--border))'; e.currentTarget.style.color = 'hsl(var(--foreground))'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'hsl(var(--border))'; e.currentTarget.style.color = 'hsl(var(--foreground))'; }}>Cancel</button>
              <button onClick={() => { const b = deleteBatchConfirm; setDeleteBatchConfirm(null); deleteBatch(b); }}
                style={destructBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(var(--destructive))'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'hsl(var(--destructive))'; }}>Delete batch</button>
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
                  className="w-full mt-1 px-3 py-2 text-sm text-foreground" style={{ border: '1px solid hsl(var(--input-border))', borderRadius: 8, background: 'hsl(var(--input-bg))' }}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Year</label>
                <input type="number" value={editBatchYear} onChange={(e) => setEditBatchYear(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 text-sm text-foreground" style={{ border: '1px solid hsl(var(--input-border))', borderRadius: 8, background: 'hsl(var(--input-bg))' }} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Batch start date (Monday of Week 1)</label>
                <input type="date" value={editBatchStartDate} onChange={(e) => setEditBatchStartDate(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-sm text-foreground" style={{ border: '1px solid hsl(var(--input-border))', borderRadius: 8, background: 'hsl(var(--input-bg))' }} />
              </div>
              <p className="text-xs text-muted-foreground">Batch name: <strong className="text-foreground">{MONTHS[editBatchMonth - 1]} {editBatchYear}</strong></p>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setEditBatchId(null)} className="flex-1"
                  style={cancelBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(var(--border))'; e.currentTarget.style.color = 'hsl(var(--foreground))'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = 'hsl(var(--border))'; e.currentTarget.style.color = 'hsl(var(--foreground))'; }}>Cancel</button>
                <button onClick={() => { setEditBatchId(null); saveEditBatch(); }} className="flex-1 disabled:opacity-50"
                  style={primaryBtnStyle} onMouseDown={btnPress} onMouseUp={btnRelease} onMouseLeave={btnRelease}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(var(--foreground))'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = 'hsl(var(--foreground))'; }}>Save changes</button>
              </div>
            </div>
          </div>
        </div>
      )}


      {activeBatch ? (
        <div style={{ display: 'flex', paddingTop: hideTopNav ? 0 : 48 }}>
        <div className="p-6 mx-auto" style={{ flex: 1, minWidth: 0, maxWidth: 1152, paddingTop: hideTopNav ? 24 : 16 }}>
          {hideTopNav && (
            <div style={{ marginBottom: 20 }}>
              <h2 className="text-foreground" style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{activeBatch.name}</h2>
              <div className="text-muted-foreground" style={{ fontSize: 13, marginTop: 4 }}>
                {displayModName ? `${displayModName} · ` : ''}{students.length} student{students.length === 1 ? '' : 's'}
              </div>
            </div>
          )}
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 22, fontWeight: 500 }} className="text-foreground">
                {droppedCount > 0 ? `${activeStudentCount} / ${enrolledStudents}` : activeStudentCount}
              </div>
              <div className="text-muted-foreground" style={{ fontSize: 12, marginTop: 2 }}>Active students</div>
            </div>
            <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 22, fontWeight: 500, color: attendanceColor }}>{avgAttendance === null ? '—' : `${avgAttendance}%`}</div>
              <div className="text-muted-foreground" style={{ fontSize: 12, marginTop: 2 }}>Avg attendance</div>
            </div>
            <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 22, fontWeight: 500, color: 'hsl(var(--score-amber))' }}>{avgDemoScore || '—'}</div>
              <div className="text-muted-foreground" style={{ fontSize: 12, marginTop: 2 }}>Avg demo score</div>
              {absentDemoCount > 0 && (
                <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 2, fontStyle: 'italic' }}>
                  {absentDemoCount} absent (excluded)
                </div>
              )}
            </div>
            <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 22, fontWeight: 500, color: droppedCount >= 1 ? 'hsl(var(--score-red))' : 'hsl(var(--muted-foreground))' }}>{droppedCount}</div>
              <div className="text-muted-foreground" style={{ fontSize: 12, marginTop: 2 }}>Dropouts</div>
              {enrolledStudents > 0 && (
                <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 2, fontStyle: 'italic' }}>
                  {Math.round((droppedCount / enrolledStudents) * 100)}% of batch
                </div>
              )}
            </div>
            <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 22, fontWeight: 500 }} className="text-foreground">{sessionsCompleted} / {totalSessions}</div>
              <div className="text-muted-foreground" style={{ fontSize: 12, marginTop: 2 }}>Sessions completed</div>
            </div>
          </div>

          {/* Attendance card */}
          <div className="bg-card mb-4" style={{ border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '14px 16px' }}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Attendance</h2>
                <p className="text-muted-foreground" style={{ fontSize: 12, marginTop: 2 }}>{activeBatch.name} · {students.length} students</p>
              </div>
              <div className="flex items-center gap-2">
                {syncStatus === 'syncing' && <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>Syncing...</span>}
                {syncStatus === 'saved' && <span style={{ fontSize: 11, color: 'hsl(var(--score-green))' }}>✓ Saved</span>}
                {savedVisible && syncStatus === 'idle' && <span className="save-indicator" style={{ fontSize: 11, color: 'hsl(var(--score-green))' }}>✓ Saved</span>}
                <button onClick={() => setAllWeeksView(!allWeeksView)} className="flex items-center gap-1.5 text-xs"
                  style={{
                    padding: '4px 12px', borderRadius: 8,
                    ...(allWeeksView
                      ? { background: 'hsl(var(--foreground))', color: 'hsl(var(--background))', border: '1px solid hsl(var(--foreground))' }
                      : { background: 'hsl(var(--week-btn-bg))', color: 'hsl(var(--week-btn-text))', border: '1px solid hsl(var(--week-btn-border))' })
                  }}>
                  {allWeeksView ? <List className="w-3.5 h-3.5" /> : <Grid3X3 className="w-3.5 h-3.5" />}
                  {allWeeksView ? 'Week view' : 'All weeks'}
                </button>
                {!readOnly && (
                  <button onClick={addStudent} className="flex items-center gap-1.5 text-xs"
                    style={{ padding: '4px 12px', borderRadius: 8, background: 'hsl(var(--week-btn-bg))', color: 'hsl(var(--week-btn-text))', border: '1px solid hsl(var(--week-btn-border))' }}>
                    <Plus className="w-3.5 h-3.5" /> Add student
                  </button>
                )}
              </div>
            </div>

            {/* Week selector */}
            {!allWeeksView && (
              <div className="flex gap-2 mb-4">
                {[1, 2, 3, 4, 5, 6].map(w => {
                  const demo = isDemoWeek(w);
                  const selected = w === selectedWeek;
                  const hasWed = weekHasWednesday(w);
                  let style: React.CSSProperties = { padding: '4px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer' };
                  if (hasWed) style = { ...style, background: 'hsl(var(--success-bg))', color: 'hsl(var(--score-green))', border: '1px solid #166534' };
                  else if (selected && demo) style = { ...style, background: 'hsl(var(--week-demo-active-bg))', color: 'hsl(var(--week-demo-active-text))', border: '1px solid hsl(var(--week-demo-active-bg))' };
                  else if (selected) style = { ...style, background: 'hsl(var(--week-btn-active-bg))', color: 'hsl(var(--week-btn-active-text))', border: '1px solid hsl(var(--week-btn-active-bg))' };
                  else if (demo) style = { ...style, background: 'hsl(var(--week-demo-bg))', color: 'hsl(var(--week-demo-text))', border: '1px solid hsl(var(--week-demo-border))' };
                  else style = { ...style, background: 'hsl(var(--week-btn-bg))', color: 'hsl(var(--week-btn-text))', border: '1px solid hsl(var(--week-btn-border))' };
                  if (selected && hasWed) style = { ...style, background: 'hsl(var(--success-bg))', color: 'hsl(var(--score-green))', border: '2px solid #4ade80' };
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
                {!readOnly && (
                  <button onClick={addStudent} className="flex items-center gap-1.5 text-sm font-medium bg-primary text-primary-foreground" style={{ padding: '8px 16px', borderRadius: 7 }}>
                    <Plus className="w-4 h-4" /> Add student
                  </button>
                )}
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
                    {sortedStudents.map((student, idx) => {
                      const dropped = isDroppedStudent(student);
                      const prev = sortedStudents[idx - 1];
                      const showDivider = dropped && prev && !isDroppedStudent(prev);
                      return (
                      <React.Fragment key={student.id}>
                        {showDivider && (
                          <tr aria-hidden="true"><td colSpan={26} style={{ borderTop: '1px solid hsl(var(--border))', padding: 0, height: 1 }} /></tr>
                        )}
                      <tr style={{ borderBottom: '1px solid hsl(var(--row-border))', opacity: dropped ? 0.55 : 1 }}>
                        <td className="py-1 font-medium text-foreground sticky left-0 bg-card" style={{ width: 160, minWidth: 160, fontSize: 12, whiteSpace: 'nowrap' }}>
                          <span style={{ cursor: 'pointer', textDecoration: dropped ? 'line-through' : 'none', color: dropped ? 'hsl(var(--muted-foreground))' : undefined }} className="hover:underline" onClick={() => setProgressModalStudent(student)}>
                            {student.name || '(unnamed)'}
                          </span>
                          {dropped && <DroppedTag />}
                          <span style={{ ...emojiStyle, marginLeft: 8, cursor: 'pointer' }} onClick={() => setProgressModalStudent(student)}>📄</span>
                          {!readOnly && <StudentRowMenu student={student} open={studentMenuId === student.id} onToggle={() => setStudentMenuId(studentMenuId === student.id ? null : student.id)} onEdit={() => { setEditingStudentId(student.id); setStudentMenuId(null); setTimeout(() => nameInputRef.current?.focus(), 50); }} onDrop={() => openDropoutModal(student)} dropped={dropped} onReverse={() => setReverseDropConfirm(student)} onDelete={() => confirmRemoveStudent(student)} />}
                        </td>
                        {Array.from({ length: 24 }, (_, i) => {
                          const info = getSessionLabel(i);
                          const rescheduled = isSessionRescheduled(i);
                          const cell = (
                            <td key={i} className="text-center align-middle" style={{
                              minWidth: 60,
                              padding: '5px 10px',
                              ...(rescheduled ? { background: 'hsl(var(--amber-bg))' } : info.isDemo ? { background: 'hsl(var(--demo-col-bg))' } : {}),
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
                                  <td key={`wed-${w}`} className="text-center align-middle" style={{ minWidth: 60, padding: '5px 10px', background: 'hsl(var(--success-bg))' }}>
                                    {renderWedCell(student.id, w)}
                                  </td>
                                </React.Fragment>
                              );
                            }
                          }
                          return cell;
                        })}
                      </tr>
                      </React.Fragment>
                      );
                    })}
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
                  {sortedStudents.map((student, sIdx) => {
                    const dropped = isDroppedStudent(student);
                    const prev = sortedStudents[sIdx - 1];
                    const showDivider = dropped && prev && !isDroppedStudent(prev);
                    return (
                    <React.Fragment key={student.id}>
                      {showDivider && (
                        <tr aria-hidden="true"><td colSpan={weekSessions.length + 1} style={{ borderTop: '1px solid hsl(var(--border))', padding: 0, height: 1 }} /></tr>
                      )}
                    <tr className="group"
                      style={{ borderBottom: '1px solid hsl(var(--row-border))', opacity: dropped ? 0.55 : 1 }}>
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
                              <span
                                className={readOnly || dropped ? '' : 'cursor-pointer hover:underline'}
                                style={{ textDecoration: dropped ? 'line-through' : 'none', color: dropped ? 'hsl(var(--muted-foreground))' : undefined }}
                                onClick={readOnly || dropped ? undefined : () => setEditingStudentId(student.id)}
                              >
                                {student.name || (readOnly ? '(unnamed)' : '(click to name)')}
                              </span>
                              {dropped && <DroppedTag />}
                              <span style={{ ...emojiStyle, marginLeft: 8, cursor: 'pointer' }} onClick={() => setProgressModalStudent(student)}>📄</span>
                              {!readOnly && <StudentRowMenu student={student} open={studentMenuId === student.id} onToggle={() => setStudentMenuId(studentMenuId === student.id ? null : student.id)} onEdit={() => { setEditingStudentId(student.id); setStudentMenuId(null); setTimeout(() => nameInputRef.current?.focus(), 50); }} onDrop={() => openDropoutModal(student)} dropped={dropped} onReverse={() => setReverseDropConfirm(student)} onDelete={() => confirmRemoveStudent(student)} />}
                            </>
                          )}
                        </div>
                      </td>
                      {weekSessions.map((si, idx) => {
                        const info = getSessionLabel(si);
                        const rescheduled = isSessionRescheduled(si);
                        const cell = (
                          <td key={si} className="text-center align-middle" style={{ padding: '5px 10px', ...(rescheduled ? { background: 'hsl(var(--amber-bg))' } : info.isDemo ? { background: 'hsl(var(--demo-col-bg))' } : {}) }}>
                            {renderCell(student.id, si, info.isDemo)}
                          </td>
                        );
                        if (idx === 1 && getRescheduleForWeekWed(selectedWeek)) {
                          return (
                            <React.Fragment key={si}>
                              {cell}
                              <td key={`wed-${selectedWeek}`} className="text-center align-middle" style={{ padding: '5px 10px', background: 'hsl(var(--success-bg))' }}>
                                {renderWedCell(student.id, selectedWeek)}
                              </td>
                            </React.Fragment>
                          );
                        }
                        return cell;
                      })}
                    </tr>
                    </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* Reschedule counter bar */}
            {students.length > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', borderTop: '1px solid #2a2a2a',
              }}>
                <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>Reschedules used:</span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: i < reschedulesUsed ? 'hsl(var(--score-amber))' : 'hsl(var(--border))',
                      border: i < reschedulesUsed ? 'none' : '1px solid #333',
                      display: 'inline-block',
                    }} />
                  ))}
                </div>
                <span style={{ fontSize: 11, color: reschedulesRemaining === 0 ? 'hsl(var(--score-red))' : 'hsl(var(--muted-foreground))', marginLeft: 'auto' }}>
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
              const showBanner = !readOnly && !allWeeksView && missingCount > 0 && !bannerDismissed;
              const modFirstName = (profile?.name || 'Mod').split(' ')[0];

              return (
                <>
                  {showBanner && !isDevTester && (
                    <div style={{
                      background: 'hsl(var(--amber-bg))', border: '1px solid #5a4a00', borderRadius: 8,
                      padding: '10px 12px', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    }}>
                      <span style={{ fontSize: 12, color: 'hsl(var(--score-amber))', lineHeight: 1.4 }}>
                        Almost done, {modFirstName}! Just {missingCount} absence{missingCount > 1 ? 's' : ''} need a reason — quick note and you're all good 👍
                      </span>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={() => {
                            const first = missingNoteCells[0];
                            if (first) {
                              const student = students.find(s => s.id === first.studentId);
                              const si = first.sessionIndex;
                              const dayIdx = si % 4;
                              const dayNames = ['Monday', 'Tuesday', 'Thursday', 'Friday'];
                              const sessionDate = getSessionDateObj(si);
                              const dateLabel = sessionDate ? sessionDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
                              setNoteModal({ studentId: first.studentId, sessionIndex: si, studentName: student?.name || 'Student', dayLabel: dayNames[dayIdx], dateLabel });
                              setNoteText('');
                            }
                          }}
                          style={{ background: 'hsl(var(--amber-border))', border: '1px solid #7a6a10', color: 'hsl(var(--score-amber))', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                        >Add notes</button>
                        <button
                          onClick={() => setBannerDismissed(true)}
                          style={{ background: 'transparent', border: '1px solid #3a3a00', color: 'hsl(var(--muted-foreground))', borderRadius: 6, padding: '5px 12px', fontSize: 11, cursor: 'pointer' }}
                        >Skip for now</button>
                      </div>
                    </div>
                  )}
                  {isDemoWeek(selectedWeek) && !allWeeksView && (
                    <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: 'hsl(var(--amber-text))' }}>
                      <span style={emojiStyle}>⭐</span> Demo day attendance marked above · Scores tracked in Demo days section below
                    </div>
                  )}
                  {!readOnly && <button onClick={addStudent} className="mt-3 text-xs text-muted-foreground hover:text-foreground">+ Add student</button>}
                </>
              );
            })()}
          </div>

          {/* Demo days section */}
          <div className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 8, overflow: 'hidden' }}>
            <button onClick={() => setDemoDaysExpanded(!demoDaysExpanded)} className="w-full flex items-center justify-between"
              style={{ padding: '12px 16px', background: 'hsl(var(--grid-header-bg))', borderTop: '1px solid hsl(var(--border))' }}>
              <div className="flex items-center gap-2">
                {demoDaysExpanded ? <ChevronDown className="w-4 h-4 text-foreground" /> : <ChevronRight className="w-4 h-4 text-foreground" />}
                <span style={{ fontWeight: 500, fontSize: 13 }} className="text-foreground">Demo days</span>
                <span style={{ background: 'hsl(var(--pill-success-bg))', color: 'hsl(var(--pill-success-text))', borderRadius: 9999, padding: '2px 8px', fontSize: 11 }}>
                  {demoDays.length} days
                </span>
              </div>
              <span className="text-muted-foreground" style={{ fontSize: 13 }}>{activeBatch.name}</span>
            </button>

            {demoDaysExpanded && (
              <div style={{ padding: '0 16px 16px' }} className="space-y-4 mt-4">
                {demoDays.map(dd => {
                  const absentNeeds = readOnly ? [] : getAbsentNeedsScheduling(dd.day_number);
                  const absentScheduled = getAbsentScheduled(dd.day_number);
                  const totalAbsent = absentNeeds.length + absentScheduled.length;
                  const showBanner = !readOnly && absentNeeds.length > 0;
                  return (
                  <div key={dd.id} id={`demo-day-${dd.id}`} className="bg-card" style={{ border: '1px solid hsl(var(--border))', borderRadius: 8, overflow: 'hidden' }}>
                    <div className="flex items-center justify-between" style={{ padding: '14px 16px' }}>
                      <h3 style={{ fontWeight: 600, fontSize: 14 }} className="text-foreground">{dd.title}</h3>
                      <span className="text-muted-foreground" style={{ fontSize: 12 }}>{dd.date || '—'} · {students.length} students</span>
                    </div>

                    {/* Absent-students banner (only shown if at least one needs scheduling) */}
                    {showBanner && (
                      <div style={{
                        margin: '0 16px 12px', background: 'hsl(var(--amber-bg))',
                        border: '1px solid hsl(var(--amber-border))', borderRadius: 8,
                        color: 'hsl(var(--amber-text))', overflow: 'hidden',
                      }}>
                        {absentNeeds.length === 1 && absentScheduled.length === 0 ? (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px' }}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>
                              ⚠ {absentNeeds[0].name} was absent on demo day. Make up the demo and add the scores.
                            </div>
                            <button
                              type="button"
                              onClick={() => openMakeupModal(absentNeeds[0].id, dd.day_number)}
                              style={{
                                background: 'transparent', border: '1px solid hsl(var(--amber-border))',
                                color: 'hsl(var(--amber-text))', borderRadius: 6,
                                padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                              }}
                            >Make up demo</button>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid hsl(var(--amber-border))' }}>
                              <div style={{ fontSize: 13, fontWeight: 500 }}>
                                ⚠ {totalAbsent} students were absent on demo day
                                <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.8 }}>
                                  · Make up their demos and add scores
                                </span>
                              </div>
                              <span style={{
                                background: 'hsl(var(--amber-text) / 0.15)', color: 'hsl(var(--amber-text))',
                                borderRadius: 9999, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                              }}>{absentNeeds.length}</span>
                            </div>
                            <div>
                              {/* Pending first */}
                              {absentNeeds.map(s => (
                                <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 14px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontSize: 13, fontWeight: 500, color: 'hsl(var(--foreground))' }}>{s.name}</span>
                                    <span style={{
                                      background: 'hsl(var(--danger-bg))', color: 'hsl(var(--score-red))',
                                      borderRadius: 9999, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                                    }}>Needs make-up</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => openMakeupModal(s.id, dd.day_number)}
                                    style={{
                                      background: 'transparent', border: '1px solid hsl(var(--amber-border))',
                                      color: 'hsl(var(--amber-text))', borderRadius: 6,
                                      padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                    }}
                                  >Make up</button>
                                </div>
                              ))}
                              {/* Then scheduled, dimmed */}
                              {absentScheduled.map(({ student, makeup }) => (
                                <div key={student.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 14px', opacity: 0.7 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontSize: 13, fontWeight: 500, color: 'hsl(var(--foreground))' }}>{student.name}</span>
                                    <span style={{
                                      background: 'hsl(var(--amber-bg))', color: 'hsl(var(--amber-text))',
                                      borderRadius: 9999, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                                    }}>Made up {fmtMakeupDate(makeup.date)}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => openMakeupModal(student.id, dd.day_number)}
                                    style={{
                                      background: 'transparent', border: '1px solid hsl(var(--amber-border))',
                                      color: 'hsl(var(--amber-text))', borderRadius: 6,
                                      padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                    }}
                                  >Edit</button>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Scoring rubric */}
                    <ScoringRubric />
                    <div className="overflow-x-auto" style={{ padding: '0 16px 14px' }}>
                      <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid hsl(var(--row-border))' }}>
                            <th className="text-left py-2 pr-3 font-medium text-muted-foreground" style={{ fontSize: 12, width: 140 }}>Criteria</th>
                            {students.map(s => {
                              const isAbsent = isStudentAbsentOnDemoDay(s.id, dd.day_number);
                              const makeup = isAbsent ? getStudentMakeup(s.id, dd.day_number) : null;
                              return (
                                <th key={s.id} className="text-center px-2 py-2 font-medium text-muted-foreground" style={{ fontSize: 12 }}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, verticalAlign: 'middle' }}>
                                    <span>{s.name}</span>
                                    {isAbsent && makeup && (
                                      <button
                                        type="button"
                                        onClick={readOnly ? undefined : () => openMakeupModal(s.id, dd.day_number)}
                                        title={`Made up on ${fmtMakeupDate(makeup.date)}${makeup.note ? ` · ${makeup.note}` : ''}`}
                                        style={{
                                          width: 10, height: 10, borderRadius: '50%',
                                          background: 'hsl(var(--score-amber))',
                                          boxShadow: '0 0 0 2px hsl(var(--card))',
                                          border: 'none', padding: 0, cursor: readOnly ? 'default' : 'pointer',
                                          display: 'inline-block',
                                        }}
                                      />
                                    )}
                                    {isAbsent && !makeup && (
                                      <span style={{
                                        marginLeft: 0, fontSize: 11,
                                        padding: '1px 5px', borderRadius: 9999,
                                        background: 'hsl(var(--danger-bg))', color: 'hsl(var(--score-red))',
                                        border: '1px solid hsl(var(--danger-bg))', fontWeight: 500,
                                      }}>absent</span>
                                    )}
                                  </span>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {CRITERIA.map(criterion => (
                            <tr key={criterion} style={{ borderBottom: '1px solid hsl(var(--row-border))' }}>
                              <td className="py-2 pr-3 text-foreground" style={{ fontSize: 12 }}>{criterion}</td>
                              {students.map(s => {
                                const state = getStudentDemoDayState(s.id, dd.day_number);
                                const makeup = state === 'x' ? getStudentMakeup(s.id, dd.day_number) : null;
                                const canScore = state === 'c' || (state === 'x' && !!makeup);
                                if (!canScore) {
                                  const tip = state === 'e'
                                    ? 'Mark attendance first'
                                    : 'Student was absent on this demo day. Record a make-up to enter scores.';
                                  return (
                                    <td key={s.id} className="text-center px-2 py-2">
                                      <div
                                        title={tip}
                                        style={{
                                          width: 44, height: 26, background: 'hsl(var(--card))',
                                          border: '1px dashed hsl(var(--input-border))', borderRadius: 6,
                                          color: 'hsl(var(--muted-foreground))', textAlign: 'center', lineHeight: '24px',
                                          fontSize: 12, cursor: 'not-allowed', userSelect: 'none', margin: '0 auto', opacity: 0.6,
                                        }}
                                      >—</div>
                                    </td>
                                  );
                                }
                                return (
                                  <td key={s.id} className="text-center px-2 py-2"
                                    style={state === 'x' && makeup ? { background: 'hsl(var(--amber-bg) / 0.35)' } : undefined}
                                  >
                                    <ScoreInput value={getScoreValue(dd.id, s.id, criterion)} onChange={(val) => updateScoreValue(dd.id, s.id, criterion, val)} disabled={readOnly} />
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                          <tr className="font-medium" style={{ borderBottom: '1px solid hsl(var(--row-border))' }}>
                            <td className="py-2 pr-3 text-foreground" style={{ fontSize: 12 }}>Total (/ 20)</td>
                            {students.map(s => {
                              const state = getStudentDemoDayState(s.id, dd.day_number);
                              const makeup = state === 'x' ? getStudentMakeup(s.id, dd.day_number) : null;
                              const canScore = state === 'c' || (state === 'x' && !!makeup);
                              if (!canScore) {
                                if (state === 'e') {
                                  return <td key={s.id} className="text-center px-2 py-2" style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--muted-foreground))' }}>—</td>;
                                }
                                return <td key={s.id} className="text-center px-2 py-2" style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--score-red))' }}>Absent</td>;
                              }
                              const total = getStudentDemoTotal(dd.id, s.id);
                              return <td key={s.id} className="text-center px-2 py-2" style={{ fontSize: 12, fontWeight: 700, color: getTotalColor(total) }}>{total}</td>;
                            })}
                          </tr>
                          <tr>
                            <td className="py-2 pr-3 text-foreground" style={{ fontSize: 12 }}>Individual feedback</td>
                            {students.map(s => {
                               const state = getStudentDemoDayState(s.id, dd.day_number);
                               const makeup = state === 'x' ? getStudentMakeup(s.id, dd.day_number) : null;
                               const canScore = state === 'c' || (state === 'x' && !!makeup);
                               if (!canScore) {
                                 const tip = state === 'e' ? 'Mark attendance first' : 'Student was absent on this demo day.';
                                 const label = state === 'e' ? '' : 'absent';
                                 return (
                                   <td key={s.id} className="text-center px-2 py-2">
                                     <div title={tip} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'not-allowed', userSelect: 'none', opacity: 0.5 }}>
                                       <div style={{ width: 22, height: 22, background: 'hsl(var(--card))', border: '1px dashed hsl(var(--input-border))', borderRadius: 4, color: 'hsl(var(--muted-foreground))', textAlign: 'center', lineHeight: '20px', fontSize: 12 }}>—</div>
                                       {label && <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' }}>{label}</span>}
                                     </div>
                                   </td>
                                 );
                               }
                               const fb = getFeedback(dd.id, s.id);
                               return (
                                 <td key={s.id} className="text-center px-2 py-2" style={{ cursor: readOnly ? 'default' : 'pointer' }} onClick={readOnly ? undefined : () => openFeedbackModal(dd.id, s.id, dd)}>
                                   <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                     <span style={{ fontSize: 20, fontFamily: '"Apple Color Emoji","Segoe UI Emoji",sans-serif' }}>{fb?.feedback ? '📝' : '📄'}</span>
                                     {!readOnly && <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' }}>{fb?.feedback ? 'click to edit' : 'click to add'}</span>}
                                   </div>
                                 </td>
                               );
                             })}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        {/* Right sidebar — only for dev tester */}
        {isDevTester && readOnly && hideTopNav ? (
          <AdminSummaryPanel
            modName={displayModName}
            weekNumber={computedCurrentWeek}
            taskCount={detectedTasks.filter(t => t.type !== 'finalise').length}
            weekCompletionPct={completionPct}
          />
        ) : isDevTester && !readOnly ? (
          <ToDoSidebar
            tasks={detectedTasks}
            overdueTasks={overdueTasks}
            weekNumber={computedCurrentWeek}
            weekStatus={currentWeekStatus}
            onTaskClick={handleTaskClick}
            onFinaliseClick={handleFinaliseClick}
          />
        ) : null}
        </div>
      ) : (
        <div className="flex items-center justify-center h-96 text-muted-foreground" style={{ paddingTop: 48 }}>
          <p>No batches yet. Click "+" to create your first batch.</p>
        </div>
      )}

      {/* Make-up demo modal */}
      {makeupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'hsl(var(--background) / 0.7)' }}
          onClick={closeMakeupModal}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: 20, maxWidth: 420, width: '100%' }}>
            <div style={{ fontSize: 15, color: 'hsl(var(--foreground))', fontWeight: 600, marginBottom: 4 }}>
              Mark {makeupModal.studentName.split(' ')[0]}'s make-up demo
            </div>
            <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginBottom: 14 }}>
              {makeupModal.studentName} was absent on Demo Day {makeupModal.dayNumber}
              {makeupModal.demoDayDate ? ` (${makeupModal.demoDayDate})` : ''}. Enter the date the make-up demo was done.
            </div>

            <label style={{ display: 'block', fontSize: 12, color: 'hsl(var(--muted-foreground))', marginBottom: 6 }}>Make-up date</label>
            <input
              type="date"
              value={makeupDate}
              onChange={(e) => setMakeupDate(e.target.value)}
              style={{
                width: '100%', background: 'hsl(var(--secondary))', border: '1px solid hsl(var(--input-border))', borderRadius: 6,
                padding: '8px 10px', fontSize: 13, color: 'hsl(var(--foreground))', outline: 'none', marginBottom: 12,
              }}
            />

            <label style={{ display: 'block', fontSize: 12, color: 'hsl(var(--muted-foreground))', marginBottom: 6 }}>Note (optional)</label>
            <textarea
              value={makeupNote}
              onChange={(e) => setMakeupNote(e.target.value)}
              placeholder="e.g. doing make-up next Tuesday"
              rows={2}
              style={{
                width: '100%', background: 'hsl(var(--secondary))', border: '1px solid hsl(var(--input-border))', borderRadius: 6,
                padding: '8px 10px', fontSize: 12, color: 'hsl(var(--foreground))', resize: 'none', outline: 'none',
                fontFamily: 'Inter, sans-serif', marginBottom: 12,
              }}
            />

            <div style={{
              background: 'hsl(var(--amber-bg))', border: '1px solid hsl(var(--amber-border))',
              color: 'hsl(var(--amber-text))', borderRadius: 8, padding: '8px 12px', fontSize: 12, marginBottom: 16,
            }}>
              Saving will unlock scoring for {makeupModal.studentName.split(' ')[0]} on Demo Day {makeupModal.dayNumber}.
            </div>

            <div className="flex items-center justify-between gap-2">
              <div>
                {makeupModal.isEdit && (
                  <button
                    type="button"
                    onClick={removeMakeup}
                    disabled={makeupSaving}
                    style={{
                      background: 'transparent', border: '1px solid hsl(var(--border))',
                      color: 'hsl(var(--score-red))', borderRadius: 8,
                      padding: '8px 12px', fontSize: 12, fontWeight: 500, cursor: makeupSaving ? 'wait' : 'pointer',
                    }}
                  >Remove make-up</button>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={closeMakeupModal} style={cancelBtnStyle}>Cancel</button>
                <button
                  type="button"
                  onClick={saveMakeup}
                  disabled={makeupSaving}
                  style={{ ...primaryBtnStyle, opacity: makeupSaving ? 0.7 : 1, cursor: makeupSaving ? 'wait' : 'pointer' }}
                >Save make-up date</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dropout modal */}
      {dropoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'hsl(var(--background) / 0.7)' }} onClick={closeDropoutModal}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: 20, maxWidth: 440, width: '90%' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'hsl(var(--foreground))', marginBottom: 4 }}>Mark {dropoutModal.name} as dropped out</div>
            <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginBottom: 14, lineHeight: 1.5 }}>
              They'll be moved to inactive status. Their past attendance and demo scores stay on record. You can reverse this anytime.
            </div>
            <label style={{ display: 'block', fontSize: 12, color: 'hsl(var(--muted-foreground))', marginBottom: 6 }}>Reason (visible to admin)</label>
            <textarea
              value={dropoutReason}
              onChange={(e) => setDropoutReason(e.target.value)}
              placeholder="e.g. Career change, work hours conflicting with class."
              rows={3}
              style={{ width: '100%', background: 'hsl(var(--secondary))', border: '1px solid hsl(var(--input-border))', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: 'hsl(var(--foreground))', resize: 'vertical', outline: 'none', fontFamily: 'Inter, sans-serif', marginBottom: 12 }}
            />
            <label style={{ display: 'block', fontSize: 12, color: 'hsl(var(--muted-foreground))', marginBottom: 6 }}>Drop-out date</label>
            <input type="date" value={dropoutDate} onChange={(e) => setDropoutDate(e.target.value)}
              style={{ width: '100%', background: 'hsl(var(--secondary))', border: '1px solid hsl(var(--input-border))', borderRadius: 6, padding: '8px 10px', fontSize: 13, color: 'hsl(var(--foreground))', outline: 'none', marginBottom: 16 }} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeDropoutModal} style={cancelBtnStyle}>Cancel</button>
              <button type="button" onClick={saveDropout} disabled={dropoutSaving}
                style={{ background: 'hsl(var(--destructive))', border: '1px solid hsl(var(--destructive))', color: 'hsl(var(--destructive-foreground))', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: dropoutSaving ? 'wait' : 'pointer', opacity: dropoutSaving ? 0.7 : 1 }}>
                Mark dropped out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reverse drop-out confirm */}
      {reverseDropConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'hsl(var(--background) / 0.7)' }} onClick={() => setReverseDropConfirm(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: 20, maxWidth: 400, width: '90%' }}>
            <div style={{ fontSize: 14, color: 'hsl(var(--foreground))', marginBottom: 16, lineHeight: 1.5 }}>
              Reverse {reverseDropConfirm.name}'s drop-out? They'll return to active status and start counting in batch stats again.
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setReverseDropConfirm(null)} style={cancelBtnStyle}>Cancel</button>
              <button type="button" onClick={() => reverseDropout(reverseDropConfirm)} style={primaryBtnStyle}>Reverse drop-out</button>
            </div>
          </div>
        </div>
      )}

      {/* Student progress modal */}
      {progressModalStudent && activeBatch && (
        <StudentProgressModal
          student={progressModalStudent}
          batchName={activeBatch.name}
          modName={profile?.name || ''}
          weekNumber={getCurrentWeek(activeBatch.start_date) ?? 6}
          startDate={activeBatch.start_date || null}
          attendance={attendance}
          demoDays={demoDays}
          demoScores={demoScores}
          demoFeedback={demoFeedback}
          studentStatus={progressModalStudent.status || 'active'}
          statusReason={progressModalStudent.status_reason || null}
          statusChangedAt={progressModalStudent.status_changed_at || null}
          onReverseDropout={readOnly ? undefined : () => { setReverseDropConfirm(progressModalStudent); setProgressModalStudent(null); }}
          onClose={() => setProgressModalStudent(null)}
        />
      )}
    </div>
  );
};

export default ModDashboard;
