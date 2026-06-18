import React, { useEffect, useState } from 'react';
import {
  MessageCircle,
  Phone,
  TrendingUp,
  Rocket,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentWeek, getSessionsOccurred, computeAttendancePct, sessionIconForBatch } from '@/lib/batchtrack';
import { format } from 'date-fns';
import MetricInfo from '@/components/MetricInfo';

// ─────────────────────────── Types ───────────────────────────
type Tone = 'red' | 'amber' | 'green' | 'ink';

interface Stat {
  lab: string;
  val: string;
  sub: string;
  amber?: boolean;
  up?: boolean;
  info?: { what: string; calculated: string };
}

interface Priority {
  tone: 'red' | 'amber';
  rank: string;
  title: string;
  desc: string;
  action: string;
  icon: LucideIcon;
}

interface Batch {
  mod: string;
  batch: string;
  batchId: string;
  week: number;
  att: number | null;
  attTone: Tone;
  le: number;
  leTone: Exclude<Tone, 'ink'>;
  health: string;
  healthTone: Exclude<Tone, 'ink'>;
}

// ─────────────────────────── Tone maps (literal strings for Tailwind JIT) ───────────────────────────
const ATT_TONE: Record<Tone, string> = {
  red: 'text-[#dc2626]',
  amber: 'text-[#ba7517]',
  green: 'text-[#4ade80]',
  ink: 'text-[#f5f5f5]',
};

const PILL_TONE: Record<Exclude<Tone, 'ink'>, string> = {
  red: 'bg-[#2a0e0e] text-[#fca5a5]',
  amber: 'bg-[#1d1408] text-[#fbbf24]',
  green: 'bg-[#0f2415] text-[#86efac]',
};

const PRIO_BORDER: Record<'red' | 'amber', string> = {
  red: 'border-l-[#dc2626]',
  amber: 'border-l-[#ba7517]',
};

const PRIO_RANK: Record<'red' | 'amber', string> = {
  red: 'text-[#dc2626]',
  amber: 'text-[#ba7517]',
};

const initials = (name: string) =>
  name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

// ─────────────────────────── Helpers ───────────────────────────
const DAY_OFFSETS = [0, 1, 3, 4]; // Mon, Tue, Thu, Fri

function getSessionDate(startDate: string, sessionIndex: number): Date {
  const weekNum = Math.floor(sessionIndex / 4);
  const dayInWeek = sessionIndex % 4;
  const start = new Date(startDate + 'T00:00:00');
  return new Date(start.getTime() + (weekNum * 7 + DAY_OFFSETS[dayInWeek]) * 86400000);
}

function getWeekMonday(date: Date = new Date()): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function highlightBriefing(text: string, modNames: string[]): string {
  let result = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  result = result.replace(
    /(\d+\.?\d*%)/g,
    '<b style="font-weight:600;color:#f0a020">$1</b>',
  );

  const sorted = [...modNames].sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    if (!name) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(
      new RegExp(`\\b${escaped}\\b`, 'g'),
      `<b style="font-weight:600;color:#f0a020">${name}</b>`,
    );
  }

  return result;
}

// ─────────────────────────── Subcomponents ───────────────────────────
function Hero({ stats }: { stats: Stat[] }) {
  return (
    <div className="mb-4 grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((s, i) => (
        <div
          key={i}
          className={`rounded-[14px] border px-5 pb-[18px] pt-5 ${
            s.amber
              ? 'border-[#ba7517]/25 bg-[#1d1408]'
              : 'border-white/[0.06] bg-[#1a1a1a]'
          }`}
        >
          <div className="mb-[14px] flex items-center gap-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b6b6b]">
            {s.lab}
            {s.info && <MetricInfo {...s.info} />}
          </div>
          <div
            className={`text-[40px] font-semibold leading-none tracking-[-0.025em] tabular-nums ${
              s.amber ? 'text-[#f0a020]' : ''
            }`}
          >
            {s.val}
          </div>
          <div className="mt-[10px] text-[13px] leading-[1.4] text-[#a3a3a3]">
            {s.up ? (
              <>
                <span className="inline-flex items-center gap-[3px] font-medium text-[#4ade80]">
                  <TrendingUp className="h-[14px] w-[14px]" />
                  up
                </span>{' '}
                {s.sub}
              </>
            ) : (
              s.sub
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Briefing({ html }: { html: string | null }) {
  return (
    <div className="mb-9 rounded-[14px] border border-white/[0.06] bg-[#161616] px-7 py-[26px]">
      <div className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#6b6b6b]">
        How are we doing
      </div>
      {html === null ? (
        <div className="space-y-[10px]">
          <div className="h-[18px] w-3/4 animate-pulse rounded-md bg-[#2a2a2a]" />
          <div className="h-[18px] w-full animate-pulse rounded-md bg-[#2a2a2a]" />
          <div className="h-[18px] w-2/3 animate-pulse rounded-md bg-[#2a2a2a]" />
        </div>
      ) : (
        <p
          className="m-0 max-w-[76ch] text-[19px] leading-[1.6] tracking-[-0.005em] text-[#a3a3a3] [text-wrap:pretty]"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}

function Priorities({ priorities }: { priorities: Priority[] }) {
  if (priorities.length === 0) return null;
  return (
    <div className="mb-9">
      <div className="mb-[14px] font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#6b6b6b]">
        Needs attention
      </div>
      <div className="flex flex-col gap-3">
        {priorities.map((p, i) => {
          const Icon = p.icon;
          return (
            <div
              key={i}
              className={`flex flex-col gap-2 rounded-xl border border-l-[3px] border-white/[0.06] bg-[#1a1a1a] px-[22px] py-[18px] ${PRIO_BORDER[p.tone]}`}
            >
              <div className={`font-mono text-[11px] font-medium uppercase tracking-[0.08em] ${PRIO_RANK[p.tone]}`}>
                {p.rank}
              </div>
              <div className="text-base font-semibold tracking-[-0.01em]">{p.title}</div>
              <div className="max-w-[68ch] text-[14px] leading-[1.5] text-[#a3a3a3]">
                {p.desc}
              </div>
              <div className="mt-1 inline-flex items-center gap-2 text-[13.5px] font-medium text-[#60a5fa]">
                <Icon className="h-[15px] w-[15px] shrink-0" />
                {p.action}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BatchesTable({
  batches,
  extraCount,
  extraAllHealthy,
}: {
  batches: Batch[];
  extraCount: number;
  extraAllHealthy: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-white/[0.06] bg-[#1a1a1a]">
      <div className="flex items-baseline justify-between border-b border-white/[0.045] px-[22px] pb-4 pt-[18px]">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em]">Active batches</h3>
        <div className="font-mono text-[11px] tracking-[0.04em] text-[#6b6b6b]">
          most needs attention first
        </div>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {([
              { label: 'Mod', info: null },
              { label: 'Batch', info: null },
              { label: 'Week', info: null },
              {
                label: 'Attendance',
                info: {
                  what: "This batch's overall attendance rate from the start until now",
                  calculated: "Present marks ÷ all marks (present + absent) across every session that has occurred. Dropped students are excluded.",
                },
              },
              {
                label: 'Loose ends',
                info: {
                  what: "Number of absences in this batch that still need a reason",
                  calculated: "Absent marks where the mod hasn't saved a reason or category yet. Resolves to zero once every absence has an explanation.",
                },
              },
              {
                label: 'Health',
                info: {
                  what: "An overall status label for this batch",
                  calculated: "Green = on track (attendance 85%+, few loose ends). Amber = worth watching. Red = needs support (attendance below 80%, or 8+ loose ends).",
                },
              },
            ] as { label: string; info: { what: string; calculated: string } | null }[]).map(({ label, info }) => (
              <th
                key={label}
                className="border-b border-white/[0.045] px-[22px] py-[11px] text-left font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-[#6b6b6b]"
              >
                <span className="inline-flex items-center gap-1">
                  {label}
                  {info && <MetricInfo {...info} />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {batches.map((b, i) => (
            <tr key={i} className="transition-colors last:[&>td]:border-b-0 hover:bg-white/[0.025]">
              <td className="border-b border-white/[0.045] px-[22px] py-[13px] text-[14px]">
                <div className="flex items-center gap-[10px]">
                  <div className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-white/[0.06] bg-[#242424] text-[11px] font-semibold text-[#a3a3a3]">
                    {initials(b.mod)}
                  </div>
                  <div className="font-medium">{b.mod}</div>
                </div>
              </td>
              <td className="border-b border-white/[0.045] px-[22px] py-[13px] text-[14px] tabular-nums text-[#f5f5f5]">
                {b.batch} {sessionIconForBatch(b.batchId)}
              </td>
              <td className="border-b border-white/[0.045] px-[22px] py-[13px] text-[14px] tabular-nums text-[#a3a3a3]">
                Week {b.week}
              </td>
              <td className={`border-b border-white/[0.045] px-[22px] py-[13px] text-[14px] font-medium tabular-nums ${ATT_TONE[b.attTone]}`}>
                {b.att !== null ? `${b.att}%` : '—'}
              </td>
              <td className="border-b border-white/[0.045] px-[22px] py-[13px] text-[14px]">
                <span className={`inline-flex items-center gap-[6px] rounded-full px-[10px] py-[3px] text-[12px] font-medium tabular-nums ${PILL_TONE[b.leTone]}`}>
                  <span className="h-[6px] w-[6px] rounded-full bg-current" />
                  {b.le}
                </span>
              </td>
              <td className="border-b border-white/[0.045] px-[22px] py-[13px] text-[14px]">
                <span className={`inline-flex items-center rounded-full px-[10px] py-[3px] text-[12px] font-medium ${PILL_TONE[b.healthTone]}`}>
                  {b.health}
                </span>
              </td>
            </tr>
          ))}
          {batches.length === 0 && (
            <tr>
              <td colSpan={6} className="px-[22px] py-[18px] text-[13px] text-[#6b6b6b]">
                No active batches found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="flex items-center gap-2 bg-[#161616] px-[22px] py-[13px] text-[13px] text-[#a3a3a3]">
        {extraCount > 0 ? (
          <>
            <span className={`h-[5px] w-[5px] rounded-full ${extraAllHealthy ? 'bg-[#4ade80]' : 'bg-[#fbbf24]'}`} />
            {extraCount} more batch{extraCount !== 1 ? 'es' : ''}
            {extraAllHealthy ? ' · all healthy' : ''}
          </>
        ) : (
          <>
            <span className="h-[5px] w-[5px] rounded-full bg-[#4ade80]" />
            all batches shown
          </>
        )}
      </div>
    </div>
  );
}

function Trend({
  values,
  weeks,
  current,
  prev,
  avg,
}: {
  values: number[];
  weeks: string[];
  current: number;
  prev: number;
  avg: number;
}) {
  const nonZero = values.filter((v) => v > 0);
  const max = nonZero.length > 0 ? Math.max(...nonZero) : 100;
  const min = nonZero.length > 0 ? Math.max(Math.min(...nonZero) - 4, 0) : 0;
  const barH = (v: number) => {
    if (v === 0) return 3;
    if (max === min) return 100;
    return Math.max(((v - min) / (max - min)) * 100, 5);
  };
  const isUp = current > 0 && prev > 0 && current >= prev;

  return (
    <div className="rounded-[14px] border border-white/[0.06] bg-[#1a1a1a] p-[22px]">
      <div className="mb-4 flex items-center gap-1 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#6b6b6b]">
        Attendance · last 8 weeks
        <MetricInfo
          what="How overall attendance has tracked week-by-week over the past 8 weeks"
          calculated="Each bar is the combined present rate across all batches for sessions that fell in that calendar week. Weeks with no sessions show as empty."
        />
      </div>
      <div className="text-[48px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
        {current > 0 ? `${current}%` : '—'}
      </div>
      {current > 0 && prev > 0 ? (
        <div className={`mt-3 inline-flex items-center gap-1 text-[13.5px] font-medium ${isUp ? 'text-[#4ade80]' : 'text-[#dc2626]'}`}>
          <TrendingUp className="h-[14px] w-[14px]" />
          {isUp ? 'up' : 'down'} from {prev}% last week
        </div>
      ) : (
        <div className="mt-3 text-[13.5px] text-[#6b6b6b]">
          {current > 0 ? 'first week of data' : 'no sessions marked yet'}
        </div>
      )}
      <div className="mt-6 flex h-[84px] items-end gap-[7px]">
        {values.map((v, i) => (
          <div
            key={i}
            className={`flex-1 rounded-t-[3px] bg-[#ba7517] ${
              i === values.length - 1 ? 'opacity-100' : v === 0 ? 'opacity-20' : 'opacity-85'
            }`}
            style={{ height: `${barH(v)}%`, minHeight: 6 }}
            title={v > 0 ? `${v}%` : 'no data'}
          />
        ))}
      </div>
      <div className="mt-[9px] flex gap-[7px]">
        {weeks.map((w, i) => (
          <span key={i} className="flex-1 text-center font-mono text-[10px] text-[#6b6b6b]">
            {w}
          </span>
        ))}
      </div>
      <div className="mt-5 flex justify-between border-t border-white/[0.045] pt-4 text-[12.5px] text-[#a3a3a3]">
        <span className="inline-flex items-center gap-1">
          8-week average
          <MetricInfo
            what="Average weekly attendance over the past 8 weeks"
            calculated="Mean of the weekly attendance rates shown in the bars above. Weeks with no data are excluded from the average."
          />
        </span>
        <b className="font-semibold tabular-nums text-[#f5f5f5]">
          {avg > 0 ? `${avg}%` : '—'}
        </b>
      </div>
    </div>
  );
}

function Houston({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex flex-col gap-4 rounded-[14px] border border-white/[0.06] bg-[#1a1a1a] px-[22px] py-[18px] sm:flex-row sm:items-center sm:gap-[18px]">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] border border-[#ba7517]/25 bg-[#1d1408] text-[#ba7517]">
        <Rocket className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <div className="text-[14px] font-semibold tracking-[-0.01em]">
          Want more detail? Ask Houston.
        </div>
        <div className="mt-[3px] text-[13px] leading-[1.45] text-[#a3a3a3]">
          Try{' '}
          <span className="font-medium text-[#ba7517]">"How is Yumi's batch trending?"</span>{' '}
          or <span className="font-medium text-[#ba7517]">"Who else is at drop risk?"</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-[190px] cursor-pointer items-center gap-2 rounded-full border border-white/[0.06] bg-[#0e0e0e] py-[9px] pl-[14px] pr-4 text-[13px] text-[#6b6b6b] transition-colors hover:border-white/[0.12]"
      >
        <Sparkles className="h-[15px] w-[15px] text-[#6b6b6b]" />
        Ask Houston…
        <kbd className="ml-auto rounded-[5px] border border-white/[0.06] bg-[#1a1a1a] px-[6px] py-px font-mono text-[11px] text-[#6b6b6b]">
          ⌘K
        </kbd>
      </button>
    </div>
  );
}

// ─────────────────────────── Page ───────────────────────────
interface AnalyticsDashboardProps {
  onOpenHouston: () => void;
}

export default function AnalyticsDashboard({ onOpenHouston }: AnalyticsDashboardProps) {
  const [stats, setStats] = useState<Stat[]>([
    { lab: 'Open loose ends', val: '—', sub: 'loading…', amber: true },
    { lab: 'Active students', val: '—', sub: 'loading…' },
    { lab: 'Active mods', val: '—', sub: 'loading…' },
    { lab: 'Attendance this week', val: '—', sub: 'loading…' },
  ]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [extraBatchCount, setExtraBatchCount] = useState(0);
  const [extraAllHealthy, setExtraAllHealthy] = useState(true);
  const [trendValues, setTrendValues] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0]);
  const [trendWeeks, setTrendWeeks] = useState<string[]>(['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'now']);
  const [trendCurrent, setTrendCurrent] = useState(0);
  const [trendPrev, setTrendPrev] = useState(0);
  const [trendAvg, setTrendAvg] = useState(0);
  const [briefingHtml, setBriefingHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const today = new Date();
      // 90-day window for trend history; 49-day window (7 weeks) for active-batch logic
      const ninetyDaysAgo = new Date(today.getTime() - 90 * 86400000).toISOString();
      const fourteenDaysAgo = new Date(today.getTime() - 14 * 86400000);
      const todayMonday = getWeekMonday(today);

      // ── Fetch ──────────────────────────────────────────────────
      const { data: allBatches } = await supabase
        .from('batches')
        .select('id, name, mod_id, start_date')
        .gte('created_at', ninetyDaysAgo);

      const batchList = allBatches ?? [];
      const batchIds = batchList.map((b: any) => b.id);

      const { data: modProfiles } = await supabase
        .from('profiles')
        .select('id, name, email, role')
        .eq('role', 'moderator');

      const modList = modProfiles ?? [];

      let students: any[] = [];
      let attendanceRows: any[] = [];
      let activityLog: any[] = [];

      if (batchIds.length > 0) {
        // Students and activity log fetched in parallel; attendance paginated separately
        // because Supabase's server-side max-rows cap (default 1000) silently truncates
        // a combined .limit() request. Paginating with .range() bypasses that cap.
        const [studentsRes, activityRes] = await Promise.all([
          supabase.from('students').select('id, batch_id, name, status').in('batch_id', batchIds),
          supabase
            .from('activity_log')
            .select('mod_id, action_type, created_at')
            .gte('created_at', todayMonday.toISOString()),
        ]);
        students = studentsRes.data ?? [];
        activityLog = activityRes.data ?? [];

        // Paginate attendance in 1000-row pages until exhausted
        const PAGE = 1000;
        let attPage = 0;
        while (true) {
          const { data: chunk } = await supabase
            .from('attendance')
            .select('student_id, batch_id, session_index, state, absence_note, absence_category')
            .in('batch_id', batchIds)
            .range(attPage * PAGE, attPage * PAGE + PAGE - 1);
          if (!chunk || chunk.length === 0) break;
          attendanceRows = attendanceRows.concat(chunk);
          if (chunk.length < PAGE) break;
          attPage++;
        }
      }

      if (cancelled) return;

      // ── Index ──────────────────────────────────────────────────
      const batchById = new Map<string, any>(batchList.map((b: any) => [b.id, b]));
      const modById = new Map<string, any>(modList.map((m: any) => [m.id, m]));

      const attendanceByBatch = new Map<string, any[]>();
      for (const a of attendanceRows) {
        if (!attendanceByBatch.has(a.batch_id)) attendanceByBatch.set(a.batch_id, []);
        attendanceByBatch.get(a.batch_id)!.push(a);
      }

      const studentsByBatch = new Map<string, any[]>();
      for (const s of students) {
        if (!studentsByBatch.has(s.batch_id)) studentsByBatch.set(s.batch_id, []);
        studentsByBatch.get(s.batch_id)!.push(s);
      }

      // ── Active batches: started, within 49-day window (7 weeks) ─
      const activeBatches = batchList.filter((b: any) => {
        if (!b.start_date) return false;
        const start = new Date(b.start_date + 'T00:00:00');
        const days = Math.floor((today.getTime() - start.getTime()) / 86400000);
        return days >= 0 && days < 49;
      });
      const activeBatchIdSet = new Set(activeBatches.map((b: any) => b.id as string));

      // ── Per-batch metrics (active batches only) ────────────────
      type BM = {
        batchId: string; batchName: string; modName: string;
        week: number; totalAtt: number | null; looseEnds: number;
      };
      const batchMetrics: BM[] = [];

      let progThisPresent = 0, progThisTotal = 0;
      let progLastPresent = 0, progLastTotal = 0;

      for (const batch of activeBatches) {
        const bStudents = studentsByBatch.get(batch.id) ?? [];
        const bActive = bStudents.filter((s: any) => s.status !== 'dropped');
        const bAtt = attendanceByBatch.get(batch.id) ?? [];
        const week = getCurrentWeek(batch.start_date) ?? 1;
        const sessOccurred = getSessionsOccurred(batch.start_date);
        const modName: string = modById.get(batch.mod_id)?.name ?? 'Unknown';
        const activeIds = new Set(bActive.map((s: any) => s.id as string));

        const looseEnds = bAtt.filter((a: any) =>
          a.state === 'x' && !a.absence_note && !a.absence_category && activeIds.has(a.student_id)
        ).length;

        // Same formula as mod view: present / (activeStudents × sessionsOccurred)
        const present = bAtt.filter((a: any) => a.state === 'c' && activeIds.has(a.student_id)).length;
        const totalAtt = computeAttendancePct(present, bActive.length, sessOccurred);

        // This week sessions (current batch week, sessions that have occurred)
        const thisWeekIdxs = [(week - 1) * 4, (week - 1) * 4 + 1, (week - 1) * 4 + 2, (week - 1) * 4 + 3]
          .filter((s) => s < sessOccurred);
        const thisMarks = bAtt.filter((a: any) =>
          thisWeekIdxs.includes(a.session_index) && (a.state === 'c' || a.state === 'x') && activeIds.has(a.student_id)
        );
        progThisPresent += thisMarks.filter((a: any) => a.state === 'c').length;
        progThisTotal += thisMarks.length;

        // Last week sessions
        if (week > 1) {
          const lastWeekIdxs = [(week - 2) * 4, (week - 2) * 4 + 1, (week - 2) * 4 + 2, (week - 2) * 4 + 3];
          const lastMarks = bAtt.filter((a: any) =>
            lastWeekIdxs.includes(a.session_index) && (a.state === 'c' || a.state === 'x') && activeIds.has(a.student_id)
          );
          progLastPresent += lastMarks.filter((a: any) => a.state === 'c').length;
          progLastTotal += lastMarks.length;
        }

        batchMetrics.push({ batchId: batch.id, batchName: batch.name, modName, week, totalAtt, looseEnds });
      }

      // ── A. STATS (all scoped to active batches) ────────────────
      const allLE = attendanceRows.filter((a: any) =>
        a.state === 'x' && !a.absence_note && !a.absence_category && activeBatchIdSet.has(a.batch_id)
      );
      const openLeCount = allLE.length;
      const modsWithLE = new Set(
        allLE.map((a: any) => batchById.get(a.batch_id)?.mod_id).filter(Boolean)
      ).size;

      const activeStudentCount = students.filter((s: any) =>
        s.status !== 'dropped' && activeBatchIdSet.has(s.batch_id)
      ).length;
      const activeStudentBatchIds = new Set(
        students
          .filter((s: any) => s.status !== 'dropped' && activeBatchIdSet.has(s.batch_id))
          .map((s: any) => s.batch_id)
      ).size;

      const activeModCount = modList.length;
      const modsMarkedThisWeek = new Set(
        activityLog.filter((a: any) => a.action_type === 'attendance_marked').map((a: any) => a.mod_id)
      ).size;

      const thisWeekAtt = progThisTotal > 0 ? Math.round((progThisPresent / progThisTotal) * 100) : null;
      const lastWeekAtt = progLastTotal > 0 ? Math.round((progLastPresent / progLastTotal) * 100) : null;

      // "This week" date range label (Mon d – Today d Mon, e.g. "Mon 1 – Wed 3 Jun")
      const weekMon = getWeekMonday(today);
      const isSameDay = weekMon.toDateString() === today.toDateString();
      const thisWeekRange = isSameDay
        ? format(today, 'EEE d MMM')
        : `${format(weekMon, 'EEE d')} – ${format(today, 'EEE d MMM')}`;

      if (!cancelled) {
        setStats([
          {
            lab: 'Open loose ends',
            val: String(openLeCount),
            sub: `across ${modsWithLE} mod${modsWithLE !== 1 ? 's' : ''}`,
            amber: openLeCount > 0,
            info: {
              what: "Absences that haven't been explained yet",
              calculated: "Counts every 'absent' mark across all running batches where the mod hasn't saved a reason or category. The number drops once every absence has an explanation.",
            },
          },
          {
            lab: 'Active students',
            val: String(activeStudentCount),
            sub: `across ${activeStudentBatchIds} batch${activeStudentBatchIds !== 1 ? 'es' : ''}`,
            info: {
              what: "Students currently enrolled in a running batch",
              calculated: "All students in batches that started in the last 7 weeks. Excludes anyone the mod has marked as dropped.",
            },
          },
          {
            lab: 'Active mods',
            val: String(activeModCount),
            sub: modsMarkedThisWeek === activeModCount
              ? 'all marked this week'
              : `${modsMarkedThisWeek} of ${activeModCount} marked this week`,
            info: {
              what: "Moderators who currently have a running batch",
              calculated: "Mods with a batch that started in the last 7 weeks. The note below shows how many have marked attendance at least once so far this week.",
            },
          },
          thisWeekAtt !== null
            ? {
                lab: 'Attendance this week',
                val: `${thisWeekAtt}%`,
                sub: lastWeekAtt !== null
                  ? `${thisWeekRange} · from ${lastWeekAtt}% last week`
                  : thisWeekRange,
                up: lastWeekAtt !== null ? thisWeekAtt > lastWeekAtt : undefined,
                info: {
                  what: "Percentage of sessions attended across all running batches, for this week so far",
                  calculated: "Present marks ÷ total marks (present + absent) for sessions in the current calendar week. Updates as mods mark their grids.",
                },
              }
            : {
                lab: 'Attendance this week',
                val: '—',
                sub: `${thisWeekRange} · no sessions marked yet`,
                info: {
                  what: "Percentage of sessions attended across all running batches, for this week so far",
                  calculated: "Present marks ÷ total marks (present + absent) for sessions in the current calendar week. Updates as mods mark their grids.",
                },
              },
        ]);
      }

      // ── B. PRIORITIES ──────────────────────────────────────────
      // P1: batches with <80% att or >8 LE, up to 4, ranked by combined score
      const p1Sorted = batchMetrics
        .filter((m) => m.looseEnds > 8 || (m.totalAtt !== null && m.totalAtt < 80))
        .sort((a, b) => {
          const sa = a.looseEnds * 2 + (a.totalAtt !== null ? (100 - a.totalAtt) / 3 : 33);
          const sb = b.looseEnds * 2 + (b.totalAtt !== null ? (100 - b.totalAtt) / 3 : 33);
          return sb - sa;
        })
        .slice(0, 4);
      const p1BatchIdSet = new Set(p1Sorted.map((m) => m.batchId));

      const p1Cards: Priority[] = p1Sorted.map((m, i) => {
        const parts: string[] = [];
        if (m.totalAtt !== null && m.totalAtt < 80) parts.push(`attendance at ${m.totalAtt}%`);
        if (m.looseEnds > 8) parts.push(`${m.looseEnds} loose ends`);
        return {
          tone: 'red' as const,
          rank: i === 0 ? 'highest' : 'at risk',
          title: `${m.modName}'s ${m.batchName} needs support`,
          desc: `${parts.join(' and ')}.`,
          action: `DM ${m.modName} on Discord · check what's going on`,
          icon: MessageCircle,
        };
      });

      // P2: top 2 students with 3+ absences in last 14 days
      type AtRiskEntry = { name: string; count: number; batchName: string; modName: string };
      const atRiskAll: AtRiskEntry[] = [];
      for (const batch of activeBatches) {
        if (!batch.start_date) continue;
        const bActive = (studentsByBatch.get(batch.id) ?? []).filter((s: any) => s.status !== 'dropped');
        // Exclude rescheduled session indices (≥1000) from 14-day window check
        const bAtt = (attendanceByBatch.get(batch.id) ?? []).filter((a: any) => a.session_index < 1000);
        const modName: string = modById.get(batch.mod_id)?.name ?? 'Unknown';
        for (const student of bActive) {
          let recent = 0;
          for (const a of bAtt.filter((x: any) => x.student_id === student.id && x.state === 'x')) {
            if (getSessionDate(batch.start_date, a.session_index) >= fourteenDaysAgo) recent++;
          }
          if (recent >= 3) atRiskAll.push({ name: student.name, count: recent, batchName: batch.name, modName });
        }
      }
      atRiskAll.sort((a, b) => b.count - a.count);
      const p2Cards: Priority[] = atRiskAll.slice(0, 2).map((r) => ({
        tone: 'red' as const,
        rank: 'high',
        title: `${r.name} is on a drop trajectory`,
        desc: `${r.count} absences in the last two weeks (${r.batchName}). At this pace they're likely to disengage before the term ends.`,
        action: `Flag to ${r.modName} · consider a check-in call`,
        icon: Phone,
      }));

      // P3: mods with 2+ LE in weeks 1-4, not already in P1
      const p3Cards: Priority[] = batchMetrics
        .filter((m) => m.week >= 1 && m.week <= 4 && m.looseEnds >= 2 && !p1BatchIdSet.has(m.batchId))
        .sort((a, b) => b.looseEnds - a.looseEnds)
        .map((m) => ({
          tone: 'amber' as const,
          rank: 'watch',
          title: `${m.modName}'s ${m.batchName} is starting to slide`,
          desc: `${m.looseEnds} loose ends in week ${m.week}${m.totalAtt !== null ? `, attendance at ${m.totalAtt}%` : ''}. Worth a nudge now before it compounds.`,
          action: `Message ${m.modName} · clear loose ends this week`,
          icon: MessageCircle,
        }));

      // Combine, cap at 7, number sequentially
      const allCards = [...p1Cards, ...p2Cards, ...p3Cards].slice(0, 7);
      allCards.forEach((c, i) => { c.rank = `${i + 1} · ${c.rank}`; });

      if (!cancelled) setPriorities(allCards);

      // ── C. BATCHES TABLE ───────────────────────────────────────
      const batchRows: (Batch & { sortScore: number })[] = batchMetrics.map((m) => {
        // Health thresholds aligned with priority scoring
        const health =
          (m.totalAtt !== null && m.totalAtt < 80) || m.looseEnds > 8
            ? 'at risk'
            : (m.totalAtt !== null && m.totalAtt < 85) || m.looseEnds >= 2
              ? 'watch'
              : 'healthy';
        const healthTone: Exclude<Tone, 'ink'> = health === 'at risk' ? 'red' : health === 'watch' ? 'amber' : 'green';
        const attTone: Tone =
          m.totalAtt === null ? 'ink' : m.totalAtt < 75 ? 'red' : m.totalAtt < 80 ? 'amber' : m.totalAtt >= 90 ? 'green' : 'ink';
        const leTone: Exclude<Tone, 'ink'> = m.looseEnds > 8 ? 'red' : m.looseEnds >= 2 ? 'amber' : 'green';
        const sortScore = health === 'at risk' ? 0 : health === 'watch' ? 1 : 2;
        return {
          mod: m.modName, batch: m.batchName, batchId: m.batchId, week: m.week,
          att: m.totalAtt, attTone,
          le: m.looseEnds, leTone,
          health, healthTone, sortScore,
        };
      }).sort((a, b) => {
        const scoreDiff = a.sortScore - b.sortScore;
        if (scoreDiff !== 0) return scoreDiff;
        // Within same health tier: worst att first; null (no sessions yet) last
        const attA = a.att ?? 101;
        const attB = b.att ?? 101;
        return attA - attB;
      });

      const top5 = batchRows.slice(0, 5);
      const remaining = batchRows.slice(5);
      const remHealthy = remaining.every((b) => b.health === 'healthy');

      if (!cancelled) {
        setBatches(top5);
        setExtraBatchCount(remaining.length);
        setExtraAllHealthy(remHealthy);
      }

      // ── D. TREND (8 calendar weeks, all 90-day batches for history) ─
      const weekMondays: Date[] = Array.from({ length: 8 }, (_, i) =>
        new Date(todayMonday.getTime() - (7 - i) * 7 * 86400000)
      );
      const weekData: { present: number; total: number }[] = Array.from({ length: 8 }, () => ({ present: 0, total: 0 }));

      for (const batch of batchList) {
        if (!batch.start_date) continue;
        const bAtt = attendanceByBatch.get(batch.id) ?? [];
        for (const a of bAtt) {
          if (a.state !== 'c' && a.state !== 'x') continue;
          if (a.session_index >= 1000) continue; // skip rescheduled session sentinel indices
          const sd = getSessionDate(batch.start_date, a.session_index);
          for (let w = 0; w < 8; w++) {
            const wStart = weekMondays[w];
            const wEnd = new Date(wStart.getTime() + 7 * 86400000);
            if (sd >= wStart && sd < wEnd) {
              if (a.state === 'c') weekData[w].present++;
              weekData[w].total++;
              break;
            }
          }
        }
      }

      const trendVals = weekData.map((w) => w.total > 0 ? Math.round((w.present / w.total) * 100) : 0);
      const trendWks = weekMondays.map((d, i) => (i === 7 ? 'now' : format(d, 'MMM d')));
      const nonZeroTrend = trendVals.filter((v) => v > 0);
      const trendAvgVal = nonZeroTrend.length > 0
        ? Math.round((nonZeroTrend.reduce((a, b) => a + b, 0) / nonZeroTrend.length) * 10) / 10
        : 0;

      if (!cancelled) {
        setTrendValues(trendVals);
        setTrendWeeks(trendWks);
        setTrendCurrent(trendVals[7]);
        setTrendPrev(trendVals[6]);
        setTrendAvg(trendAvgVal);
      }

      // ── E. HOUSTON BRIEFING ────────────────────────────────────
      if (!cancelled) setBriefingHtml(null);

      try {
        const topBatchCtx = batchMetrics.slice(0, 3).map((m) =>
          `${m.batchName} (${m.modName}): att=${m.totalAtt ?? '—'}%, LE=${m.looseEnds}, week ${m.week}`
        ).join('; ');

        const question =
          `Write a 2-3 sentence operational summary of how this week is going. ` +
          `Lead with whether things are on track. Highlight the single biggest concern by mod name and batch name with specific numbers. ` +
          `Same chill plain-English tone as the rest of Houston. No jargon, no opening pleasantries — start directly with the summary. ` +
          `Context: attendance this week=${thisWeekAtt ?? '—'}%, active students=${activeStudentCount}, ` +
          `open loose ends=${openLeCount}, top batches: ${topBatchCtx}`;

        const { data, error } = await supabase.functions.invoke('ask-houston', {
          body: { question },
        });

        if (!error && !cancelled) {
          const result = typeof data === 'string' ? JSON.parse(data) : data;
          if (result?.answer) {
            const modNames: string[] = modList.map((m: any) => m.name).filter(Boolean);
            setBriefingHtml(highlightBriefing(result.answer, modNames));
          } else {
            setBriefingHtml(result?.error ? 'Briefing unavailable right now.' : 'No summary available.');
          }
        }
      } catch (e) {
        if (!cancelled) setBriefingHtml('Briefing unavailable right now.');
        console.error('briefing error', e);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-[#0e0e0e] font-sans text-[#f5f5f5] antialiased">
      <div className="mx-auto max-w-[1200px] px-8 pb-16 pt-7">
        <Hero stats={stats} />
        <Briefing html={briefingHtml} />
        <Priorities priorities={priorities} />
        <div className="mb-9 grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.62fr_1fr]">
          <BatchesTable batches={batches} extraCount={extraBatchCount} extraAllHealthy={extraAllHealthy} />
          <Trend values={trendValues} weeks={trendWeeks} current={trendCurrent} prev={trendPrev} avg={trendAvg} />
        </div>
        <Houston onClick={onOpenHouston} />
      </div>
    </div>
  );
}
