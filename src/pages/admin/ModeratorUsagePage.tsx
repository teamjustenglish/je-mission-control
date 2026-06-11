import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import MetricInfo from '@/components/MetricInfo';

/**
 * Moderator Usage — Phase 1.
 *
 * Everything here is derived from timestamps that already exist. The headline
 * source is `activity_log` (mod_id, action_type, created_at), which is the only
 * per-mod timestamped event stream — the raw `attendance` and `demo_scores`
 * tables carry no timestamps of their own. "Any action" unions activity_log with
 * houston_query_log, announcement_reads and student_share_links so the active-mod
 * counts reflect every touchpoint, not just batch edits.
 */

const JE_BLUE = '#0592E2';
const GREEN = '#4ade80';
const AMBER = '#fbbf24';
const RED = '#f87171';

const DAY = 24 * 60 * 60 * 1000;

interface ModInfo { id: string; name: string; }
interface BatchInfo { id: string; mod_id: string; name: string; start_date: string | null; }
interface ActivityRow { mod_id: string; action_type: string; description: string; batch_name: string; created_at: string; }
interface ShareRow { created_by: string | null; created_at: string; last_viewed_at: string | null; }
interface AnnRow { id: string; created_at: string; archived: boolean; }
interface ReadRow { announcement_id: string; user_id: string; read_at: string; }
interface DemoDayRow { id: string; batch_id: string; date: string | null; }
interface AttRow { batch_id: string; state: string; absence_category: string | null; }

interface AdoptionRow { label: string; pct: number | null; num: number; denom: number; note?: string; info?: { what: string; calculated: string }; }
interface WatchItem {
  modId: string;
  name: string;
  score: number;
  signals: string[];
}

// en-CA gives YYYY-MM-DD; Asia/Colombo keeps day boundaries on Sri Lanka midnight
// (matches the convention used on the Houston usage page).
const toSlDate = (d: Date): string => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// Session calendar date from a batch's start Monday. Sessions run Mon/Tue/Thu/Fri,
// 4 per week. week is 1-based, dayIdx 0-3 → offsets [0,1,3,4] days from week's Monday.
const sessionDate = (startDate: string, week: number, dayIdx: number): Date => {
  const start = new Date(startDate + 'T00:00:00');
  const offsets = [0, 1, 3, 4];
  const d = new Date(start);
  d.setDate(start.getDate() + (week - 1) * 7 + offsets[dayIdx]);
  return d;
};

const fetchAllAttendance = async (batchIds: string[]): Promise<AttRow[]> => {
  if (batchIds.length === 0) return [];
  // Supabase silently caps a single select at 1000 rows; paginate with .range().
  const PAGE = 1000;
  let page = 0;
  const out: AttRow[] = [];
  while (true) {
    const { data } = await supabase
      .from('attendance')
      .select('batch_id, state, absence_category')
      .in('batch_id', batchIds)
      .range(page * PAGE, page * PAGE + PAGE - 1);
    const rows = data ?? [];
    out.push(...(rows as AttRow[]));
    if (rows.length < PAGE) break;
    page++;
  }
  return out;
};

const adoptionColor = (pct: number | null): string => {
  if (pct == null) return '#3b3b3b';
  if (pct >= 80) return GREEN;
  if (pct >= 50) return AMBER;
  return RED;
};

const ModeratorUsagePage: React.FC<{ onLookCloser?: (modId: string) => void }> = ({ onLookCloser }) => {
  const [loading, setLoading] = useState(true);
  const [mods, setMods] = useState<ModInfo[]>([]);
  const [wam, setWam] = useState({ current: 0, prev: 0 });
  const [damAvg, setDamAvg] = useState(0);
  const [ttm, setTtm] = useState<{ current: number | null; prev: number | null }>({ current: null, prev: null });
  const [trend, setTrend] = useState<{ label: string; mods: number }[]>([]);
  const [adoption, setAdoption] = useState<AdoptionRow[]>([]);
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const now = new Date();
    const nowMs = now.getTime();
    const last7 = nowMs - 7 * DAY;
    const prev7 = nowMs - 14 * DAY;
    const last14 = nowMs - 14 * DAY;
    const last30 = nowMs - 30 * DAY;
    const last56 = nowMs - 56 * DAY;
    const last90 = nowMs - 90 * DAY;

    // ── Baseline + light metadata ──────────────────────────────────
    const [modsRes, batchesRes, sharesRes, annsRes] = await Promise.all([
      supabase.from('profiles').select('id, name').eq('role', 'moderator'),
      supabase.from('batches').select('id, mod_id, name, start_date'),
      supabase.from('student_share_links').select('created_by, created_at, last_viewed_at'),
      supabase.from('announcements').select('id, created_at, archived').gte('created_at', new Date(last30).toISOString()),
    ]);

    const modList: ModInfo[] = (modsRes.data ?? []).map((m) => ({ id: m.id, name: m.name || m.id.slice(0, 8) }));
    const modIds = new Set(modList.map((m) => m.id));
    const N = modList.length;
    const batches: BatchInfo[] = (batchesRes.data ?? []) as BatchInfo[];
    const shares: ShareRow[] = (sharesRes.data ?? []) as ShareRow[];
    const anns: AnnRow[] = (annsRes.data ?? []) as AnnRow[];

    // batch_name → most recent start_date (activity_log attendance_marked rows carry
    // batch_name but not batch_id, so names are the only join key available).
    const batchStartByName = new Map<string, string>();
    for (const b of [...batches].sort((a, b2) => (a.start_date ?? '').localeCompare(b2.start_date ?? ''))) {
      if (b.start_date) batchStartByName.set(b.name, b.start_date);
    }

    // ── Timestamped event sources ──────────────────────────────────
    const [activityRows, houstonRes, readsRes] = await Promise.all([
      fetchActivity(new Date(last90).toISOString()),
      (supabase as any).from('houston_query_log').select('user_id, created_at'),
      anns.length > 0
        ? supabase.from('announcement_reads').select('announcement_id, user_id, read_at').in('announcement_id', anns.map((a) => a.id))
        : Promise.resolve({ data: [] as ReadRow[] }),
    ]);

    const activity: ActivityRow[] = activityRows.filter((a) => modIds.has(a.mod_id));
    const houstonAll: { user_id: string | null; created_at: string }[] = houstonRes.data ?? [];
    const reads: ReadRow[] = (readsRes.data ?? []) as ReadRow[];

    // Unified "any action" event stream (modId, ms).
    const events: { modId: string; ms: number }[] = [];
    for (const a of activity) events.push({ modId: a.mod_id, ms: new Date(a.created_at).getTime() });
    for (const h of houstonAll) if (h.user_id && modIds.has(h.user_id)) events.push({ modId: h.user_id, ms: new Date(h.created_at).getTime() });
    for (const r of reads) if (modIds.has(r.user_id)) events.push({ modId: r.user_id, ms: new Date(r.read_at).getTime() });
    for (const s of shares) if (s.created_by && modIds.has(s.created_by)) events.push({ modId: s.created_by, ms: new Date(s.created_at).getTime() });

    const distinctIn = (from: number, to: number): Set<string> => {
      const set = new Set<string>();
      for (const e of events) if (e.ms >= from && e.ms < to) set.add(e.modId);
      return set;
    };

    // ── 1. WAM / DAM / stickiness ──────────────────────────────────
    const wamCurrent = distinctIn(last7, nowMs).size;
    const wamPrev = distinctIn(prev7, last7).size;

    // DAM avg: distinct mods per Colombo-day over the last 7 days.
    let damSum = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const slDate = toSlDate(d);
      const set = new Set<string>();
      for (const e of events) if (toSlDate(new Date(e.ms)) === slDate) set.add(e.modId);
      damSum += set.size;
    }
    const dam = damSum / 7;

    // ── Time to mark (median hours), from activity_log attendance_marked ──
    // TODO: Uses activity_log 'attendance_marked' events. The logger overwrites
    // created_at on re-marks, so this is "last marked" not "first marked". Add a
    // real created_at to the attendance table later for first-marked accuracy.
    const ttmFor = (from: number, to: number): number | null => {
      const lags: number[] = [];
      for (const a of activity) {
        if (a.action_type !== 'attendance_marked') continue;
        const ms = new Date(a.created_at).getTime();
        if (ms < from || ms >= to) continue;
        const m = a.description.match(/Week (\d+), Day (\d+)/);
        const start = batchStartByName.get(a.batch_name);
        if (!m || !start) continue; // skip rescheduled / unmappable rows
        const week = parseInt(m[1], 10);
        const dayIdx = parseInt(m[2], 10) - 1;
        if (dayIdx < 0 || dayIdx > 3) continue;
        const sd = sessionDate(start, week, dayIdx).getTime();
        const lagH = (ms - sd) / (60 * 60 * 1000);
        if (lagH >= 0) lags.push(lagH);
      }
      return median(lags);
    };

    // ── 2. WAM 8-week trend ────────────────────────────────────────
    const trendData: { label: string; mods: number }[] = [];
    for (let w = 7; w >= 0; w--) {
      const from = nowMs - (w + 1) * 7 * DAY;
      const to = nowMs - w * 7 * DAY;
      const label = new Date(from).toLocaleDateString('en', { month: 'short', day: 'numeric' });
      trendData.push({ label, mods: distinctIn(from, to).size });
    }

    // ── 3. Feature adoption ────────────────────────────────────────
    const adoptionRows: AdoptionRow[] = [];

    // (a) Marked attendance this week
    const markedThisWeek = new Set<string>();
    for (const a of activity) {
      if (a.action_type === 'attendance_marked' && new Date(a.created_at).getTime() >= last7) markedThisWeek.add(a.mod_id);
    }
    adoptionRows.push(mkAdoption('Marked attendance this week', markedThisWeek.size, N, {
      what: "Mods who have marked attendance for at least one session this week",
      calculated: "Mods with at least one attendance action saved in the last 7 days. Denominator is all moderators.",
    }));

    // (b) Asked Houston at least once (ever)
    const houstonEver = new Set<string>();
    for (const h of houstonAll) if (h.user_id && modIds.has(h.user_id)) houstonEver.add(h.user_id);
    adoptionRows.push(mkAdoption('Asked Houston at least once', houstonEver.size, N, {
      what: "Mods who have ever used the Houston chat",
      calculated: "Mods with at least one Houston question in our records, at any point in time.",
    }));

    // (c) Used a student share link (created a link that was viewed at least once)
    const sharedViewed = new Set<string>();
    for (const s of shares) if (s.created_by && modIds.has(s.created_by) && s.last_viewed_at) sharedViewed.add(s.created_by);
    adoptionRows.push(mkAdoption('Used a student share link', sharedViewed.size, N, {
      what: "Mods who have shared a student progress link that was actually opened",
      calculated: "Mods who created a share link that someone viewed at least once. Links that were never opened don't count.",
    }));

    // (d) Opened announcements within 24h — mods who opened EVERY last-7d announcement <24h
    const recentAnns = anns.filter((a) => !a.archived && new Date(a.created_at).getTime() >= last7);
    const annInfo = {
      what: "Mods who opened every announcement from this week within 24 hours of it being sent",
      calculated: "A mod passes if they opened all announcements sent in the last 7 days within a day of each one going out. If there were no announcements, this shows as unavailable.",
    };
    if (recentAnns.length === 0) {
      adoptionRows.push({ label: 'Opened announcements within 24h', pct: null, num: 0, denom: N, note: 'no announcements this week', info: annInfo });
    } else {
      const annCreated = new Map(recentAnns.map((a) => [a.id, new Date(a.created_at).getTime()]));
      let hit = 0;
      for (const mod of modList) {
        const ok = recentAnns.every((a) => {
          const r = reads.find((rr) => rr.announcement_id === a.id && rr.user_id === mod.id);
          if (!r) return false;
          return new Date(r.read_at).getTime() - (annCreated.get(a.id) ?? 0) <= DAY;
        });
        if (ok) hit++;
      }
      adoptionRows.push(mkAdoption('Opened announcements within 24h', hit, N, annInfo));
    }

    // (e) Entered demo scores within 48h of a demo day in the last 14d.
    // TODO: Uses activity_log 'demo_score_added' events matched to the nearest
    // demo_days.date in the mod's batch within the window — the log description is
    // generic ("Added Demo day scores") and doesn't name the demo day, so a batch
    // with two demo days in the window is matched by proximity, not identity. Add a
    // demo_day_id (or a created_at) to demo_scores for an exact mapping.
    const recentBatches = batches.filter((b) => b.start_date && new Date(b.start_date + 'T00:00:00').getTime() >= nowMs - 70 * DAY);
    const recentBatchIds = recentBatches.map((b) => b.id);
    const batchMod = new Map(batches.map((b) => [b.id, b.mod_id]));
    const demoDaysRes = recentBatchIds.length > 0
      ? await supabase.from('demo_days').select('id, batch_id, date').in('batch_id', recentBatchIds)
      : { data: [] as DemoDayRow[] };
    const demoDays: DemoDayRow[] = (demoDaysRes.data ?? []) as DemoDayRow[];
    // demo days that actually happened within the last 14d
    const windowDemoDays = demoDays.filter((d) => d.date && (() => {
      const t = new Date(d.date + 'T00:00:00').getTime();
      return t >= last14 && t <= nowMs;
    })());
    const modsWithDemo = new Set<string>();
    for (const d of windowDemoDays) { const m = batchMod.get(d.batch_id); if (m && modIds.has(m)) modsWithDemo.add(m); }
    // demo_score_added events per mod (timestamps) within the window
    const demoScoreEventsByMod = new Map<string, number[]>();
    for (const a of activity) {
      if (a.action_type !== 'demo_score_added') continue;
      const ms = new Date(a.created_at).getTime();
      if (ms < last14) continue;
      if (!demoScoreEventsByMod.has(a.mod_id)) demoScoreEventsByMod.set(a.mod_id, []);
      demoScoreEventsByMod.get(a.mod_id)!.push(ms);
    }
    let demoOnTime = 0;
    for (const modId of modsWithDemo) {
      // this mod's demo days in the window
      const myDemoDates = windowDemoDays
        .filter((d) => batchMod.get(d.batch_id) === modId && d.date)
        .map((d) => new Date(d.date! + 'T00:00:00').getTime());
      const myEvents = demoScoreEventsByMod.get(modId) ?? [];
      const onTime = myDemoDates.some((dd) => myEvents.some((ev) => ev >= dd && ev - dd <= 2 * DAY));
      if (onTime) demoOnTime++;
    }
    adoptionRows.push(mkAdoption('Entered demo scores within 48h', demoOnTime, modsWithDemo.size, {
      what: "Mods with a recent demo day who entered scores within 48 hours",
      calculated: "Looks at demo days in the last 14 days. A mod passes if scores were saved within 48 hours of the demo day date. Only mods who had a demo day in this window are counted.",
    }));

    // ── 4. Watchlist ───────────────────────────────────────────────
    const lastActionByMod = new Map<string, number>();
    for (const e of events) {
      const cur = lastActionByMod.get(e.modId);
      if (cur == null || e.ms > cur) lastActionByMod.set(e.modId, e.ms);
    }

    // unread announcements (last 30d, not archived) per mod
    const activeAnns = anns.filter((a) => !a.archived);
    // `reads` already covers every announcement in the 30d window (fetched above),
    // so reuse it for the unread calc rather than round-tripping again.
    const allReadKey = new Set(reads.map((r) => `${r.announcement_id}|${r.user_id}`));

    // loose ends per mod from recent batches: orphan absences + missing demo scores + untouched sessions
    const attendance = await fetchAllAttendance(recentBatchIds);
    const studentsRes = recentBatchIds.length > 0
      ? await supabase.from('students').select('id, batch_id, status').in('batch_id', recentBatchIds)
      : { data: [] as { id: string; batch_id: string; status: string }[] };
    const students = (studentsRes.data ?? []) as { id: string; batch_id: string; status: string }[];
    const demoDayIds = demoDays.map((d) => d.id);
    const scoresRes = demoDayIds.length > 0
      ? await supabase.from('demo_scores').select('demo_day_id').in('demo_day_id', demoDayIds)
      : { data: [] as { demo_day_id: string }[] };
    const scoredDemoDayIds = new Set(((scoresRes.data ?? []) as { demo_day_id: string }[]).map((s) => s.demo_day_id));

    const looseEndsByMod = new Map<string, { orphan: number; missingDemo: number; untouched: number }>();
    for (const b of recentBatches) {
      const ent = looseEndsByMod.get(b.mod_id) ?? { orphan: 0, missingDemo: 0, untouched: 0 };
      const bAtt = attendance.filter((a) => a.batch_id === b.id);
      ent.orphan += bAtt.filter((a) => a.state === 'x' && !a.absence_category).length;
      // demo days that already happened but have no scores
      ent.missingDemo += demoDays.filter((d) => d.batch_id === b.id && d.date && new Date(d.date + 'T00:00:00').getTime() < nowMs && !scoredDemoDayIds.has(d.id)).length;
      // untouched session slots: expected marked cells (students × sessions occurred) minus marked cells
      const bStudents = students.filter((s) => s.batch_id === b.id && s.status !== 'dropped');
      const occurred = b.start_date ? sessionsOccurred(b.start_date, now) : 0;
      const expected = bStudents.length * occurred;
      const marked = bAtt.filter((a) => a.state === 'c' || a.state === 'x').length;
      ent.untouched += Math.max(0, expected - marked);
      looseEndsByMod.set(b.mod_id, ent);
    }

    // assemble raw signals
    const raw = modList.map((m) => {
      const last = lastActionByMod.get(m.id);
      const daysSince = last == null ? 90 : Math.floor((nowMs - last) / DAY);
      const unread = activeAnns.filter((a) => !allReadKey.has(`${a.id}|${m.id}`)).length;
      const le = looseEndsByMod.get(m.id) ?? { orphan: 0, missingDemo: 0, untouched: 0 };
      const looseTotal = le.orphan + le.missingDemo + le.untouched;
      return { m, daysSince, unread, le, looseTotal };
    });
    const maxDays = Math.max(1, ...raw.map((r) => r.daysSince));
    const maxUnread = Math.max(1, ...raw.map((r) => r.unread));
    const maxLoose = Math.max(1, ...raw.map((r) => r.looseTotal));

    const scored: WatchItem[] = raw.map((r) => {
      const score = r.daysSince / maxDays + r.unread / maxUnread + r.looseTotal / maxLoose;
      const signals: string[] = [];
      if (r.daysSince >= 2) signals.push(`${r.daysSince} day${r.daysSince === 1 ? '' : 's'} since last action`);
      if (r.unread >= 1) signals.push(`Hasn't opened ${r.unread} announcement${r.unread === 1 ? '' : 's'}`);
      if (r.le.missingDemo > 0) signals.push(`${r.le.missingDemo} demo day${r.le.missingDemo === 1 ? '' : 's'} missing scores`);
      if (r.le.orphan > 0) signals.push(`${r.le.orphan} absence${r.le.orphan === 1 ? '' : 's'} without a reason`);
      if (r.le.untouched > 0) signals.push(`${r.le.untouched} unmarked session slot${r.le.untouched === 1 ? '' : 's'}`);
      return { modId: r.m.id, name: r.m.name, score, signals };
    });
    const watch = scored
      .filter((w) => w.signals.length > 0 && w.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    // ── Commit ─────────────────────────────────────────────────────
    setMods(modList);
    setWam({ current: wamCurrent, prev: wamPrev });
    setDamAvg(dam);
    setTtm({ current: ttmFor(last7, nowMs), prev: ttmFor(prev7, last7) });
    setTrend(trendData);
    setAdoption(adoptionRows);
    setWatchlist(watch);
    setLoading(false);
  };

  const N = mods.length;

  if (loading) {
    return (
      <div className="py-16 text-center font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#6b6b6b]">
        Loading…
      </div>
    );
  }

  const wamDelta = wam.current - wam.prev;
  const stickiness = wam.current > 0 ? Math.round((damAvg / wam.current) * 100) : null;
  const ttmDelta = ttm.current != null && ttm.prev != null ? ttm.current - ttm.prev : null;

  const heroCards: { label: string; value: string; sub: React.ReactNode; info: { what: string; calculated: string } }[] = [
    {
      label: 'Weekly active mods',
      value: `${wam.current} / ${N}`,
      sub: <DeltaNote delta={wamDelta} unit="vs last week" goodWhenUp />,
      info: {
        what: "Mods who did something in Mission Control in the last 7 days",
        calculated: "Any action counts — marking attendance, scoring demos, opening Houston, creating share links, or reading an announcement. Each mod is counted once even if they did many things.",
      },
    },
    {
      label: 'Daily active mods · avg',
      value: `${damAvg.toFixed(1)} / ${N}`,
      sub: 'distinct mods per day · last 7d',
      info: {
        what: "On an average day last week, how many mods were active",
        calculated: "For each of the past 7 days, we count the unique mods who took any action. This is the average of those 7 daily counts.",
      },
    },
    {
      label: 'Stickiness',
      value: stickiness != null ? `${stickiness}%` : '—',
      sub: stickiness != null
        ? (stickiness >= 50 ? `Sticky · benchmark is 50%` : `Below 50% benchmark`)
        : 'no active mods',
      info: {
        what: "Of the mods active this week, what fraction are also active most days",
        calculated: "Daily active mods ÷ weekly active mods. 50%+ is generally considered 'sticky' — it means mods are checking in regularly, not just once or twice a week.",
      },
    },
    {
      label: 'Time to mark · median',
      value: ttm.current != null ? `${ttm.current.toFixed(1)}h` : '—',
      sub: ttm.current != null
        ? <DeltaNote delta={ttmDelta} unit="vs last week" goodWhenUp={false} suffix="h" />
        : 'no marks this week',
      info: {
        what: "How long it typically takes a mod to mark attendance after a session starts",
        calculated: "For each saved attendance mark, we measure the gap from the session's scheduled date to when it was saved. This is the middle value across all marks this week. Note: if a mark is edited later, the timer resets to the edit time.",
      },
    },
  ];

  return (
    <div>
      {/* Page header */}
      <div className="mb-4">
        <div className="mb-[6px] font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#6b6b6b]">
          Intelligence
        </div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#f5f5f5]">Moderator usage</h1>
      </div>

      {/* 1. Hero stats */}
      <div className="mb-4 grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
        {heroCards.map((card) => (
          <div key={card.label} className="rounded-[14px] border border-white/[0.06] bg-[#1a1a1a] px-5 pb-[18px] pt-5">
            <div className="mb-[14px] flex items-center gap-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b6b6b]">
              {card.label}
              <MetricInfo {...card.info} />
            </div>
            <div className="text-[40px] font-semibold leading-none tracking-[-0.025em] tabular-nums">
              {card.value}
            </div>
            <div className="mt-[10px] text-[13px] leading-[1.4] text-[#a3a3a3]">
              {card.sub}
            </div>
          </div>
        ))}
      </div>

      {/* 2. WAM 8-week trend */}
      <div className="mb-6 rounded-[14px] border border-white/[0.06] bg-[#1a1a1a] p-[22px]">
        <div className="mb-4 flex items-center gap-1 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#6b6b6b]">
          Weekly active mods · last 8 weeks
          <MetricInfo
            what="How many mods were active each week over the past two months"
            calculated="Each data point is the number of unique mods who took any action during that 7-day window. The top of the chart is the total number of mods in the system."
          />
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={trend} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6b6b6b' }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 10, fill: '#6b6b6b' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              domain={[0, Math.max(N, 1)]}
            />
            <Tooltip
              contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, fontSize: 12, color: '#f5f5f5' }}
              labelStyle={{ color: '#6b6b6b', marginBottom: 4 }}
              formatter={(v: number) => [`${v} / ${N} mods`, 'Active']}
            />
            <Line type="monotone" dataKey="mods" name="Active mods" stroke={JE_BLUE} strokeWidth={2} dot={{ r: 2, fill: JE_BLUE }} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 3. Feature adoption */}
      <div className="mb-6 rounded-[14px] border border-white/[0.06] bg-[#1a1a1a] px-[22px] py-[18px]">
        <div className="mb-[18px] font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#6b6b6b]">
          Feature adoption · this week
        </div>
        <div className="flex flex-col gap-[18px]">
          {adoption.map((row) => {
            const color = adoptionColor(row.pct);
            return (
              <div key={row.label}>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[13px] text-[#d4d4d4]">
                    {row.label}
                    {row.info && <MetricInfo {...row.info} />}
                  </span>
                  <span className="font-mono text-[12px] tabular-nums" style={{ color }}>
                    {row.pct != null ? `${row.pct}% ` : '— '}
                    <span className="text-[#6b6b6b]">({row.num}/{row.denom}{row.note ? ` · ${row.note}` : ''})</span>
                  </span>
                </div>
                <div className="mt-[7px] h-[5px] w-full overflow-hidden rounded-full bg-white/[0.05]">
                  <div className="h-full rounded-full transition-all" style={{ width: `${row.pct ?? 0}%`, background: color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Watchlist */}
      <div className="overflow-hidden rounded-[14px] border border-white/[0.06] bg-[#1a1a1a]">
        <div className="flex items-baseline justify-between border-b border-white/[0.045] px-[22px] pb-4 pt-[18px]">
          <h3 className="text-[15px] font-semibold tracking-[-0.01em]">Watchlist</h3>
          <div className="font-mono text-[11px] tracking-[0.04em] text-[#6b6b6b]">needs attention</div>
        </div>
        {watchlist.length === 0 ? (
          <div className="px-[22px] py-[18px] text-[13px] text-[#6b6b6b]">Everyone's on track — nothing flagged. 🎉</div>
        ) : (
          <div className="flex flex-col">
            {watchlist.map((w) => (
              <div key={w.modId} className="flex items-start justify-between gap-4 border-b border-white/[0.045] px-[22px] py-[16px] last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-[10px]">
                    <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-white/[0.06] bg-[#242424] text-[11px] font-semibold text-[#a3a3a3]">
                      {w.name.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <span className="font-medium text-[#f5f5f5]">{w.name}</span>
                  </div>
                  <ul className="ml-[36px] mt-[8px] flex flex-col gap-[4px]">
                    {w.signals.map((s, i) => (
                      <li key={i} className="flex items-center gap-[7px] text-[12.5px] text-[#a3a3a3]">
                        <span className="inline-block h-[3px] w-[3px] shrink-0 rounded-full bg-[#f87171]" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  onClick={() => onLookCloser?.(w.modId)}
                  className="shrink-0 rounded-full border border-white/[0.06] bg-[#0e0e0e] px-4 py-[6px] text-[12px] text-[#a3a3a3] transition-colors hover:border-white/[0.12] hover:text-[#f5f5f5]"
                >
                  Look closer →
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── helpers ──────────────────────────────────────────────────────────

const mkAdoption = (label: string, num: number, denom: number, info?: { what: string; calculated: string }): AdoptionRow => ({
  label,
  pct: denom > 0 ? Math.round((num / denom) * 100) : null,
  num,
  denom,
  info,
});

// Sessions occurred so far for a batch (Mon/Tue/Thu/Fri, capped at 24).
// Mirrors getSessionsOccurred from lib/batchtrack.
const sessionsOccurred = (startDate: string, now: Date): number => {
  const start = new Date(startDate + 'T00:00:00');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysDiff = Math.floor((today.getTime() - start.getTime()) / DAY);
  if (daysDiff < 0) return 0;
  const fullWeeks = Math.floor(daysDiff / 7);
  const dayInWeek = daysDiff % 7;
  let partial = 0;
  for (const off of [0, 1, 3, 4]) if (off <= dayInWeek) partial++;
  return Math.min(fullWeeks * 4 + partial, 24);
};

// Paginated activity_log fetch (90d window can exceed the 1000-row cap).
const fetchActivity = async (sinceIso: string): Promise<ActivityRow[]> => {
  const PAGE = 1000;
  let page = 0;
  const out: ActivityRow[] = [];
  while (true) {
    const { data } = await supabase
      .from('activity_log')
      .select('mod_id, action_type, description, batch_name, created_at')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    const rows = data ?? [];
    out.push(...(rows as ActivityRow[]));
    if (rows.length < PAGE) break;
    page++;
  }
  return out;
};

const DeltaNote: React.FC<{ delta: number | null; unit: string; goodWhenUp: boolean; suffix?: string }> = ({ delta, unit, goodWhenUp, suffix = '' }) => {
  if (delta == null || delta === 0) {
    return <span className="text-[#6b6b6b]">{delta === 0 ? 'no change' : '—'} {unit}</span>;
  }
  const up = delta > 0;
  const good = up === goodWhenUp;
  const color = good ? GREEN : RED;
  const sign = up ? '+' : '';
  const val = Number.isInteger(delta) ? delta.toString() : delta.toFixed(1);
  return (
    <span>
      <span style={{ color }}>{sign}{val}{suffix}</span> <span className="text-[#6b6b6b]">{unit}</span>
    </span>
  );
};

export default ModeratorUsagePage;
