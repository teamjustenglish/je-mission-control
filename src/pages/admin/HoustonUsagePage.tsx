import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
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

const HoustonUsagePage: React.FC = () => {
  const [logs, setLogs] = useState<QueryLogEntry[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => { loadData(); }, []);

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
  const paged       = userStats.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // ── 14-day sparkline ─────────────────────────────────────────────
  const sparkData = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (13 - i));
    const prefix = d.toISOString().slice(0, 10);
    const day = logs.filter(l => l.created_at.startsWith(prefix));
    return {
      date: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      admin: day.filter(l => l.houston_variant === 'admin').length,
      mod:   day.filter(l => l.houston_variant === 'mod').length,
    };
  });

  const heroCards = [
    { label: 'Total queries', value: monthLogs.length.toString(), sub: 'this month' },
    { label: 'Total cost',    value: fmtCost(totalCost),          sub: 'this month' },
    { label: 'Admin Houston', value: `${adminLogs.length} · ${fmtCost(adminCost)}`, sub: 'this month' },
    { label: 'Mod Houston',   value: `${modLogs.length} · ${fmtCost(modCost)}`,     sub: 'this month' },
  ];

  if (loading) return <p className="text-sm text-muted-foreground p-4">Loading…</p>;

  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground mb-4">Houston usage</h2>

      {/* Hero stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {heroCards.map(card => (
          <div key={card.label} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>{card.label}</div>
            <div style={{ fontSize: 19, fontWeight: 600, color: '#e8e8e8', marginBottom: 2 }}>{card.value}</div>
            <div style={{ fontSize: 11, color: '#555' }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* 14-day sparkline */}
      <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 10, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e8e8', marginBottom: 16 }}>Daily queries — last 14 days</div>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={sparkData} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#555' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#555' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8, fontSize: 12, color: '#e8e8e8' }}
              labelStyle={{ color: '#888', marginBottom: 4 }}
              itemStyle={{ color: '#e8e8e8' }}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Line type="monotone" dataKey="admin" name="Admin" stroke="#60a5fa" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
            <Line type="monotone" dataKey="mod"   name="Mod"   stroke="#c084fc" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Per-user table */}
      <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 10, marginBottom: 20 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #2a2a2a', fontSize: 13, fontWeight: 600, color: '#e8e8e8' }}>
          Per-user stats (all time)
        </div>
        {paged.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">No queries logged yet.</p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 110px', padding: '8px 16px', borderBottom: '1px solid #222' }}>
              {['User', 'Queries', 'Cost', 'Last query'].map(h => (
                <span key={h} style={{ fontSize: 10, color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
              ))}
            </div>
            {paged.map(u => (
              <div key={u.user_id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 110px', padding: '10px 16px', borderBottom: '1px solid #1e1e1e', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: 13, color: '#e8e8e8' }}>{profileMap[u.user_id] || u.name}</span>
                  <span style={{ fontSize: 10, color: '#555', marginLeft: 6 }}>{u.role}</span>
                </div>
                <span style={{ fontSize: 13, color: '#e8e8e8' }}>{u.count}</span>
                <span style={{ fontSize: 13, color: '#e8e8e8' }}>{fmtCost(u.totalCost)}</span>
                <span style={{ fontSize: 12, color: '#666' }}>{timeAgo(u.lastQuery)}</span>
              </div>
            ))}
          </>
        )}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '12px 16px' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}
              style={{ background: '#2a2a2a', border: '1px solid #333', color: currentPage <= 1 ? '#555' : '#e8e8e8', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: currentPage <= 1 ? 'not-allowed' : 'pointer', opacity: currentPage <= 1 ? 0.4 : 1 }}>
              ← Prev
            </button>
            <span style={{ fontSize: 12, color: '#666' }}>Page {currentPage} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
              style={{ background: '#2a2a2a', border: '1px solid #333', color: currentPage >= totalPages ? '#555' : '#e8e8e8', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer', opacity: currentPage >= totalPages ? 0.4 : 1 }}>
              Next →
            </button>
          </div>
        )}
      </div>

      {/* Cost breakdown */}
      <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 10, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e8e8', marginBottom: 12 }}>Cost breakdown (this month)</div>
        {[
          { label: 'Admin Houston', cost: adminCost, count: adminLogs.length },
          { label: 'Mod Houston',   cost: modCost,   count: modLogs.length },
          { label: 'Combined',      cost: totalCost, count: monthLogs.length, isTotal: true },
        ].map(item => (
          <div key={item.label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '9px 0', borderBottom: item.isTotal ? 'none' : '1px solid #222',
            marginTop: item.isTotal ? 4 : 0,
          }}>
            <div>
              <span style={{ fontSize: 13, color: item.isTotal ? '#e8e8e8' : '#aaa', fontWeight: item.isTotal ? 600 : 400 }}>
                {item.label}
              </span>
              <span style={{ fontSize: 10, color: '#555', marginLeft: 6 }}>
                {item.count} {item.count === 1 ? 'query' : 'queries'}
              </span>
            </div>
            <span style={{ fontSize: item.isTotal ? 15 : 13, fontWeight: item.isTotal ? 700 : 400, color: item.isTotal ? '#fbbf24' : '#888' }}>
              {fmtCost(item.cost)}
            </span>
          </div>
        ))}
      </div>

      {/* TODO (v2): Top 10 question themes — call Houston to cluster recent questions into themes */}
    </div>
  );
};

export default HoustonUsagePage;
