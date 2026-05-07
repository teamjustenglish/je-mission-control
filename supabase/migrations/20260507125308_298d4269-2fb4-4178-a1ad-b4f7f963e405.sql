create or replace function public.mod_has_shared_student(m_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.batches b
    join public.students s on s.batch_id = b.id
    join public.student_share_links sl on sl.student_id = s.id
    where b.mod_id = m_id
      and sl.revoked_at is null
  );
$$;

grant execute on function public.mod_has_shared_student(uuid) to anon, authenticated;

create or replace function public.batch_has_shared_student(b_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.students s
    join public.student_share_links sl on sl.student_id = s.id
    where s.batch_id = b_id
      and sl.revoked_at is null
  );
$$;

grant execute on function public.batch_has_shared_student(uuid) to anon, authenticated;

drop policy if exists profiles_public_select_via_share on public.profiles;
create policy profiles_public_select_via_share
  on public.profiles for select
  using (public.mod_has_shared_student(profiles.id));

drop policy if exists batches_public_select_via_share on public.batches;
create policy batches_public_select_via_share
  on public.batches for select
  using (public.batch_has_shared_student(batches.id));

drop policy if exists demo_days_public_select_via_share on public.demo_days;
create policy demo_days_public_select_via_share
  on public.demo_days for select
  using (public.batch_has_shared_student(demo_days.batch_id));

drop policy if exists rescheduled_public_select_via_share on public.rescheduled_sessions;
create policy rescheduled_public_select_via_share
  on public.rescheduled_sessions for select
  using (public.batch_has_shared_student(rescheduled_sessions.batch_id));