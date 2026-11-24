-- "Report a problem" (25 Nov 2026): reports from MC users become alfred_notes rows with source 'report'.
-- Only ADDS columns and swaps one index; no existing row changes. Safe to re-run.

alter table public.alfred_notes
  add column if not exists severity text check (severity in ('blocking', 'annoying', 'idea')),
  add column if not exists page text,
  add column if not exists about text,
  add column if not exists reported_by uuid,
  add column if not exists reporter_name text,
  add column if not exists reporter_role text,
  add column if not exists browser text,
  add column if not exists client_time text,
  add column if not exists errors jsonb;

-- People's reports never merge with each other (two mods can both write "page won't load").
-- Automatic notes still merge by title.
drop index if exists public.alfred_notes_one_open_per_title;
create unique index if not exists alfred_notes_one_open_per_title_auto
  on public.alfred_notes (title) where status = 'open' and source <> 'report';
create index if not exists alfred_notes_reports_by_person
  on public.alfred_notes (reported_by, created_at desc) where source = 'report';

create or replace function public.alfred_note_raise(p_title text, p_detail text default null, p_source text default 'mc')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into alfred_notes (title, detail, source)
  values (left(p_title, 200), left(p_detail, 4000),
          case when coalesce(p_source, 'report') = 'report' then 'mc' else p_source end)
  on conflict (title) where status = 'open' and source <> 'report'
  do update set last_seen_at = now(), times_seen = alfred_notes.times_seen + 1,
                detail = coalesce(excluded.detail, alfred_notes.detail)
  returning id into v_id;
  return v_id;
end $$;

-- Snapshot = the 22 Nov one plus two report counts.
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
      and start_date > current_date - 49
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
    'open_notes',           (select count(*) from alfred_notes where status = 'open'),
    'open_problem_reports', (select count(*) from alfred_notes where status = 'open' and source = 'report'),
    'open_blocking_reports',(select count(*) from alfred_notes where status = 'open' and source = 'report' and severity = 'blocking')
  );
$$;

revoke all on function public.alfred_note_raise(text, text, text) from public, anon, authenticated;
revoke all on function public.alfred_status_snapshot() from public, anon, authenticated;
grant execute on function public.alfred_note_raise(text, text, text) to service_role;
grant execute on function public.alfred_status_snapshot() to service_role;
