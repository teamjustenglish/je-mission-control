
-- Create student_share_links table
CREATE TABLE public.student_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  created_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  last_viewed_at timestamptz NULL
);

CREATE INDEX student_share_links_slug_idx ON public.student_share_links (slug);
CREATE INDEX student_share_links_student_id_idx ON public.student_share_links (student_id);

ALTER TABLE public.student_share_links ENABLE ROW LEVEL SECURITY;

-- Mods can SELECT their own students' share links
CREATE POLICY share_links_mod_select
  ON public.student_share_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.batches b ON b.id = s.batch_id
      WHERE s.id = student_share_links.student_id AND b.mod_id = auth.uid()
    )
  );

-- Mods can INSERT share links for their own students
CREATE POLICY share_links_mod_insert
  ON public.student_share_links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.batches b ON b.id = s.batch_id
      WHERE s.id = student_id AND b.mod_id = auth.uid()
    )
  );

-- Mods can UPDATE (revoke) their own students' share links
CREATE POLICY share_links_mod_update
  ON public.student_share_links FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.batches b ON b.id = s.batch_id
      WHERE s.id = student_share_links.student_id AND b.mod_id = auth.uid()
    )
  );

-- Anonymous users can SELECT non-revoked share link rows
CREATE POLICY share_links_public_select
  ON public.student_share_links FOR SELECT
  USING (revoked_at IS NULL);

-- Admin full access
CREATE POLICY share_links_admin_all
  ON public.student_share_links FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Public read policies on related tables (only when valid share link exists)

CREATE POLICY students_public_select_via_share
  ON public.students FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.student_share_links sl
      WHERE sl.student_id = students.id AND sl.revoked_at IS NULL
    )
  );

CREATE POLICY batches_public_select_via_share
  ON public.batches FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.student_share_links sl ON sl.student_id = s.id
      WHERE s.batch_id = batches.id AND sl.revoked_at IS NULL
    )
  );

CREATE POLICY attendance_public_select_via_share
  ON public.attendance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.student_share_links sl
      WHERE sl.student_id = attendance.student_id AND sl.revoked_at IS NULL
    )
  );

CREATE POLICY demo_days_public_select_via_share
  ON public.demo_days FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.student_share_links sl ON sl.student_id = s.id
      WHERE s.batch_id = demo_days.batch_id AND sl.revoked_at IS NULL
    )
  );

CREATE POLICY demo_scores_public_select_via_share
  ON public.demo_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.student_share_links sl
      WHERE sl.student_id = demo_scores.student_id AND sl.revoked_at IS NULL
    )
  );

CREATE POLICY demo_feedback_public_select_via_share
  ON public.demo_feedback FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.student_share_links sl
      WHERE sl.student_id = demo_feedback.student_id AND sl.revoked_at IS NULL
    )
  );

CREATE POLICY profiles_public_select_via_share
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.batches b
      JOIN public.students s ON s.batch_id = b.id
      JOIN public.student_share_links sl ON sl.student_id = s.id
      WHERE b.mod_id = profiles.id AND sl.revoked_at IS NULL
    )
  );

CREATE POLICY rescheduled_public_select_via_share
  ON public.rescheduled_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.student_share_links sl ON sl.student_id = s.id
      WHERE s.batch_id = rescheduled_sessions.batch_id AND sl.revoked_at IS NULL
    )
  );
