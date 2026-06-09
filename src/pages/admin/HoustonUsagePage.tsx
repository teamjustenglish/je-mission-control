import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ChevronDown } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

interface QueryLogEntry {
  id: string;
  user_id: string;
  user_role: string;
  houston_variant: string;
  question: string;
  answer_preview: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  cost_usd: number | null;
  created_at: string;
}

interface UserStats {
  user_id: string;
  name: string;
  role: string;
  count: number;
  totalCost: number;
  lastQuery: string;
}

const PAGE_SIZE = 25;

const fmtCost = (n: number) => `$${n.toFixed(4)}`;

const timeAgo = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const initials = (name: string) =>
  name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

const HoustonUsagePage: React.FC = () => {
  const [logs, setLogs] = useState<QueryLogEntry[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setExpandedUserId(null); }, [page]);

  const loadData = async () => {
    setLoading(true);
    const [logsRes, modsRes, adminsRes] = await Promise.all([
      (supabase as any).from('houston_query_log').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, name').eq('role', 'moderator'),
      supabase.from('profiles').select('id, name').eq('role', 'admin'),
    ]);
    const allProfiles = [...(modsRes.data || []), ...(adminsRes.data || [])];
    const map: Record<string, string> = {};
    for (const p of allProfiles) map[p.id] = p.name || p.id.slice(0, 8);
    setLogs(logsRes.data || []);
    setProfileMap(map);
    setLoading(false);
  };

  // ── This-month slice ─────────────────────────────────────────────
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthLogs = logs.filter(l => l.created_at >= thisMonthStart);
  const adminLogs = monthLogs.filter(l => l.houston_variant === 'admin');
  const modLogs   = monthLogs.filter(l => l.houston_variant === 'mod');
  const totalCost = monthLogs.reduce((s, l) => s + (l.cost_usd ?? 0), 0);
  const adminCost = adminLogs.reduce((s, l) => s + (l.cost_usd ?? 0), 0);
  const modCost   = modLogs.reduce((s, l) => s + (l.cost_usd ?? 0), 0);

  // ── Per-user table (all time) ────────────────────────────────────
  const userStatsMap = new Map<string, UserStats>();
  for (const l of logs) {
    if (!userStatsMap.has(l.user_id)) {
      userStatsMap.set(l.user_id, {
        user_id: l.user_id,
        name: profileMap[l.user_id] || l.user_id.slice(0, 8),
        role: l.user_role,
        count: 0,
        totalCost: 0,
        lastQuery: l.created_at,
      });
    }
    const s = userStatsMap.get(l.user_id)!;
    s.count++;
    s.totalCost += l.cost_usd ?? 0;
    if (l.created_at > s.lastQuery) s.lastQuery = l.created_at;
  }
  const userStats   = Array.from(userStatsMap.values()).sort((a, b) => b.count - a.count);
  const totalPages  = Math.max(1, Math.ceil(userStats.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = userStats.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // ── 14-day sparkline ─────────────────────────────────────────────
  // en-CA locale gives YYYY-MM-DD; timeZone ensures day boundaries match Sri Lanka midnight,
  // not UTC midnight (which would shift today's queries to the wrong bucket).
  const toSlDate = (d: Date): string =>
    d.toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });

  const sparkData = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (13 - i));
    const slDate = toSlDate(d);
    const day = logs.filter(l => toSlDate(new Date(l.created_at)) === slDate);
    return {
      date: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      admin: day.filter(l => l.houston_variant === 'admin').length,
      mod:   day.filter(l => l.houston_variant === 'mod').length,
    };
  });

  const heroCards = [
    { label: 'Total queries', value: monthLogs.length.toString(),   sub: 'this month' },
    { label: 'Total cost',    value: fmtCost(totalCost),             sub: 'this month' },
    { label: 'Admin Houston', value: adminLogs.length.toString(),    sub: `${fmtCost(adminCost)} this month` },
    { label: 'Mod Houston',   value: modLogs.length.toString(),      sub: `${fmtCost(modCost)} this month` },
  ];

  if (loading) {
    return (
      <div className="py-16 text-center font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#6b6b6b]">
        Loading…
      </div>
    );
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-4">
        <div className="mb-[6px] font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#6b6b6b]">
          Intelligence
        </div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#f5f5f5]">Houston usage</h1>
      </div>

      {/* Hero stats */}
      <div className="mb-4 grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
        {heroCards.map((card) => (
          <div
            key={card.label}
            className="rounded-[14px] border border-white/[0.06] bg-[#1a1a1a] px-5 pb-[18px] pt-5"
          >
            <div className="mb-[14px] font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b6b6b]">
              {card.label}
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

      {/* Sparkline + cost breakdown row */}
      <div className="mb-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.62fr_1fr]">

        {/* 14-day sparkline */}
        <div className="rounded-[14px] border border-white/[0.06] bg-[#1a1a1a] p-[22px]">
          <div className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#6b6b6b]">
            Daily queries · last 14 days
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={sparkData} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#6b6b6b' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#6b6b6b' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: '#1a1a1a',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 10,
                  fontSize: 12,
                  color: '#f5f5f5',
                }}
                labelStyle={{ color: '#6b6b6b', marginBottom: 4 }}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8, color: '#a3a3a3' }} />
              <Line type="monotone" dataKey="admin" name="Admin" stroke="#60a5fa" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
              <Line type="monotone" dataKey="mod"   name="Mod"   stroke="#c084fc" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Cost breakdown */}
        <div className="rounded-[14px] border border-white/[0.06] bg-[#1a1a1a] px-[22px] py-[18px]">
          <div className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#6b6b6b]">
            Cost breakdown · this month
          </div>
          {[
            { label: 'Admin Houston', cost: adminCost, count: adminLogs.length, isTotal: false },
            { label: 'Mod Houston',   cost: modCost,   count: modLogs.length,   isTotal: false },
            { label: 'Combined',      cost: totalCost, count: monthLogs.length, isTotal: true  },
          ].map((item) => (
            <div
              key={item.label}
              className={`flex items-center justify-between py-[10px] ${
                item.isTotal
                  ? 'mt-1 border-t border-white/[0.045]'
                  : 'border-b border-white/[0.045]'
              }`}
            >
              <div>
                <span className={`text-[13px] ${item.isTotal ? 'font-semibold text-[#f5f5f5]' : 'text-[#a3a3a3]'}`}>
                  {item.label}
                </span>
                <span className="ml-[6px] font-mono text-[10px] text-[#6b6b6b]">
                  {item.count} {item.count === 1 ? 'query' : 'queries'}
                </span>
              </div>
              <span className={`tabular-nums ${item.isTotal ? 'text-[15px] font-semibold text-[#fbbf24]' : 'text-[13px] text-[#a3a3a3]'}`}>
                {fmtCost(item.cost)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Per-user table */}
      <div className="overflow-hidden rounded-[14px] border border-white/[0.06] bg-[#1a1a1a]">
        <div className="flex items-baseline justify-between border-b border-white/[0.045] px-[22px] pb-4 pt-[18px]">
          <h3 className="text-[15px] font-semibold tracking-[-0.01em]">Per-user stats</h3>
          <div className="font-mono text-[11px] tracking-[0.04em] text-[#6b6b6b]">all time</div>
        </div>

        {paged.length === 0 ? (
          <div className="px-[22px] py-[18px] text-[13px] text-[#6b6b6b]">No queries logged yet.</div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['User', 'Queries', 'Cost', 'Last query', ''].map((h) => (
                  <th
                    key={h}
                    className="border-b border-white/[0.045] px-[22px] py-[11px] text-left font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-[#6b6b6b]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((u) => {
                const isExpanded = expandedUserId === u.user_id;
                const userLogs = logs.filter(l => l.user_id === u.user_id).slice(0, 10);
                return (
                  <React.Fragment key={u.user_id}>
                    <tr
                      className="cursor-pointer transition-colors hover:bg-white/[0.025]"
                      onClick={() => setExpandedUserId(isExpanded ? null : u.user_id)}
                    >
                      <td className="border-b border-white/[0.045] px-[22px] py-[13px] text-[14px]">
                        <div className="flex items-center gap-[10px]">
                          <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-white/[0.06] bg-[#242424] text-[11px] font-semibold text-[#a3a3a3]">
                            {initials(profileMap[u.user_id] || u.name)}
                          </div>
                          <div>
                            <span className="font-medium text-[#f5f5f5]">{profileMap[u.user_id] || u.name}</span>
                            <span className="ml-[6px] font-mono text-[10px] text-[#6b6b6b]">{u.role}</span>
                          </div>
                        </div>
                      </td>
                      <td className="border-b border-white/[0.045] px-[22px] py-[13px] text-[14px] tabular-nums text-[#f5f5f5]">
                        {u.count}
                      </td>
                      <td className="border-b border-white/[0.045] px-[22px] py-[13px] text-[14px] tabular-nums text-[#a3a3a3]">
                        {fmtCost(u.totalCost)}
                      </td>
                      <td className="border-b border-white/[0.045] px-[22px] py-[13px] text-[13px] text-[#6b6b6b]">
                        {timeAgo(u.lastQuery)}
                      </td>
                      <td className="border-b border-white/[0.045] px-[16px] py-[13px] text-right">
                        <ChevronDown
                          size={14}
                          className={`inline-block text-[#6b6b6b] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={5} className="border-b border-white/[0.045] bg-[#141414] px-[22px] py-[16px]">
                          {userLogs.length === 0 ? (
                            <p className="text-[12px] text-[#4b4b4b]">No queries yet.</p>
                          ) : (
                            <div className="flex flex-col gap-[10px]">
                              {userLogs.map((l) => (
                                <div key={l.id} className="border-b border-white/[0.03] pb-[10px] last:border-b-0 last:pb-0">
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[13px] font-medium leading-[1.4] text-[#f5f5f5]">
                                        {l.question || '-'}
                                      </p>
                                      {l.answer_preview && (
                                        <p className="mt-[5px] text-[12px] leading-[1.5] text-[#6b6b6b]">
                                          {l.answer_preview.length > 300
                                            ? l.answer_preview.slice(0, 300) + '...'
                                            : l.answer_preview}
                                        </p>
                                      )}
                                    </div>
                                    <div className="shrink-0 text-right">
                                      <div className="text-[11px] text-[#4b4b4b]">{timeAgo(l.created_at)}</div>
                                      {l.cost_usd != null && (
                                        <div className="mt-[2px] font-mono text-[10px] text-[#3b3b3b]">
                                          {fmtCost(l.cost_usd)}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 bg-[#161616] px-[22px] py-[13px]">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="rounded-full border border-white/[0.06] bg-[#0e0e0e] px-4 py-[5px] text-[12px] text-[#a3a3a3] transition-colors hover:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Prev
            </button>
            <span className="font-mono text-[11px] text-[#6b6b6b]">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="rounded-full border border-white/[0.06] bg-[#0e0e0e] px-4 py-[5px] text-[12px] text-[#a3a3a3] transition-colors hover:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* TODO (v2): Top 10 question themes — call Houston to cluster recent questions into themes */}
    </div>
  );
};

export default HoustonUsagePage;
