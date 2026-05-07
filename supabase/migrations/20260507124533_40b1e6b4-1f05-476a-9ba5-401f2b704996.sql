
-- Step 1: Create security definer helper function
create or replace function public.has_active_share_link(s_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.student_share_links
    where student_id = s_id and revoked_at is null
  );
$$;

grant execute on function public.has_active_share_link(uuid) to anon, authenticated;

-- Step 2: Drop and recreate all public-share policies

drop policy if exists profiles_public_select_via_share on public.profiles;
create policy profiles_public_select_via_share
  on public.profiles for select
  using (
    exists (
      select 1
      from public.batches b
      join public.students s on s.batch_id = b.id
      where b.mod_id = profiles.id
        and public.has_active_share_link(s.id)
    )
  );

drop policy if exists students_public_select_via_share on public.students;
create policy students_public_select_via_share
  on public.students for select
  using (public.has_active_share_link(students.id));

drop policy if exists batches_public_select_via_share on public.batches;
create policy batches_public_select_via_share
  on public.batches for select
  using (
    exists (
      select 1 from public.students s
      where s.batch_id = batches.id
        and public.has_active_share_link(s.id)
    )
  );

drop policy if exists attendance_public_select_via_share on public.attendance;
create policy attendance_public_select_via_share
  on public.attendance for select
  using (public.has_active_share_link(attendance.student_id));

drop policy if exists demo_days_public_select_via_share on public.demo_days;
create policy demo_days_public_select_via_share
  on public.demo_days for select
  using (
    exists (
      select 1 from public.students s
      where s.batch_id = demo_days.batch_id
        and public.has_active_share_link(s.id)
    )
  );

drop policy if exists demo_scores_public_select_via_share on public.demo_scores;
create policy demo_scores_public_select_via_share
  on public.demo_scores for select
  using (public.has_active_share_link(demo_scores.student_id));

drop policy if exists demo_feedback_public_select_via_share on public.demo_feedback;
create policy demo_feedback_public_select_via_share
  on public.demo_feedback for select
  using (public.has_active_share_link(demo_feedback.student_id));

drop policy if exists rescheduled_public_select_via_share on public.rescheduled_sessions;
create policy rescheduled_public_select_via_share
  on public.rescheduled_sessions for select
  using (
    exists (
      select 1 from public.students s
      where s.batch_id = rescheduled_sessions.batch_id
        and public.has_active_share_link(s.id)
    )
  );
