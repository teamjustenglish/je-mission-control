-- Alfred HQ (22 Nov 2026): read-only status feed + developer notes.
-- Contract: ~/code/je/ALFRED-HQ.md. Server side only; nothing users see changes.
-- Safe to re-run (everything is "if not exists" / "or replace").

-- 1. Service-role-only secrets (same table PR #66 creates; RLS on, no policies).
create table if not exists public.private_secrets (
  key text primary key,
  value text not null,
  created_at timestamptz default now()
);
alter table public.private_secrets enable row level security;
revoke all on public.private_secrets from anon, authenticated;
-- The HQ key itself is never stored: only its SHA-256 hex under key 'alfred_hq_key_sha256'
-- (inserted by hand, not in this repo).

-- 2. Notes = problems that need a developer. Written by Alfred, by this project's own
--    checks, or by a terminal. Status open -> fixed / wont_fix with a short "fix" line.
create table if not exists public.alfred_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  detail text,
  status text not null default 'open' check (status in ('open', 'fixed', 'wont_fix')),
  source text not null default 'alfred',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  times_seen integer not null default 1,
  fixed_at timestamptz,
  fix text
);
create unique index if not exists alfred_notes_one_open_per_title
  on public.alfred_notes (title) where status = 'open';
create index if not exists alfred_notes_status_created
  on public.alfred_notes (status, created_at desc);
alter table public.alfred_notes enable row level security;
revoke all on public.alfred_notes from anon, authenticated;

-- Raise a note (or bump the open one with the same title, so repeats don't pile up).
create or replace function public.alfred_note_raise(p_title text, p_detail text default null, p_source text default 'mc')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into alfred_notes (title, detail, source)
  values (left(p_title, 200), left(p_detail, 4000), coalesce(p_source, 'mc'))
  on conflict (title) where status = 'open'
  do update set last_seen_at = now(), times_seen = alfred_notes.times_seen + 1,
                detail = coalesce(excluded.detail, alfred_notes.detail)
  returning id into v_id;
  return v_id;
end $$;

-- Close a note: status 'fixed' or 'wont_fix', plus what was done (commit or date).
create or replace function public.alfred_note_close(p_id uuid, p_status text, p_fix text)
returns void
language sql
security definer
set search_path = public
as $$
  update alfred_notes
     set status = case when p_status in ('fixed', 'wont_fix') then p_status else 'fixed' end,
         fix = left(p_fix, 500), fixed_at = now()
   where id = p_id;
$$;

-- 3. One light snapshot for the feed: counts and timestamps only, no names/emails.
--    Only small indexed tables; attendance is filtered to running batches.
create or replace function public.alfred_status_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with running as (
    select id, mod_id from batches
    where start_date is not null
      and start_date <= current_date
      and start_date > current_date - 49          -- 6 weeks + a week of wrap-up
  )
  select jsonb_build_object(
    'running_batches',      (select count(*) from running),
    'mods_running',         (select count(distinct mod_id) from running),
    'active_students',      (select count(*) from students s join running r on r.id = s.batch_id where s.status <> 'dropped'),
    'absences_no_reason',   (select count(*) from attendance a
                               join running r on r.id = a.batch_id
                               join students s on s.id = a.student_id
                              where a.state = 'x' and s.status <> 'dropped'
                                and coalesce(a.absence_note, '') = '' and coalesce(a.absence_category, '') = ''),
    'last_mod_action_at',   (select max(created_at) from activity_log),
    'mod_actions_7d',       (select count(*) from activity_log where created_at > now() - interval '7 days'),
    'last_share_view_at',   (select max(last_viewed_at) from student_share_links),
    'share_links_live',     (select count(*) from student_share_links where revoked_at is null),
    'last_sign_in_at',      (select max(last_sign_in) from profiles),
    'raw_sql_open_to_public', has_function_privilege('anon', 'public.exec_select_query(text)', 'execute'),
    'mcp_key_set',          exists (select 1 from private_secrets where key = 'mc_mcp_key'),
    'open_notes',           (select count(*) from alfred_notes where status = 'open')
  );
$$;

revoke all on function public.alfred_note_raise(text, text, text) from public, anon, authenticated;
revoke all on function public.alfred_note_close(uuid, text, text) from public, anon, authenticated;
revoke all on function public.alfred_status_snapshot() from public, anon, authenticated;
grant execute on function public.alfred_note_raise(text, text, text) to service_role;
grant execute on function public.alfred_note_close(uuid, text, text) to service_role;
grant execute on function public.alfred_status_snapshot() to service_role;
