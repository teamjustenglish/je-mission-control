
-- 1. Lock down moderator_codes (remove public access; admins + edge functions only)
DROP POLICY IF EXISTS "Anyone can read codes for activation" ON public.moderator_codes;
DROP POLICY IF EXISTS "Anyone can update codes for activation" ON public.moderator_codes;

-- 2. Lock down settings table (remove public read; admins only via existing policies)
DROP POLICY IF EXISTS "Anyone can read settings for invite code validation" ON public.settings;
CREATE POLICY "Admins can read settings" ON public.settings
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Remove broad public share-link related policies (replaced by SECURITY DEFINER RPC)
DROP POLICY IF EXISTS "share_links_public_select" ON public.student_share_links;
DROP POLICY IF EXISTS "students_public_select_via_share" ON public.students;
DROP POLICY IF EXISTS "attendance_public_select_via_share" ON public.attendance;
DROP POLICY IF EXISTS "demo_scores_public_select_via_share" ON public.demo_scores;
DROP POLICY IF EXISTS "demo_feedback_public_select_via_share" ON public.demo_feedback;
DROP POLICY IF EXISTS "demo_days_public_select_via_share" ON public.demo_days;
DROP POLICY IF EXISTS "batches_public_select_via_share" ON public.batches;
DROP POLICY IF EXISTS "rescheduled_public_select_via_share" ON public.rescheduled_sessions;
DROP POLICY IF EXISTS "profiles_public_select_via_share" ON public.profiles;

-- 4. Drop helper functions that were only used by the dropped policies
DROP FUNCTION IF EXISTS public.has_active_share_link(uuid);
DROP FUNCTION IF EXISTS public.mod_has_shared_student(uuid);
DROP FUNCTION IF EXISTS public.batch_has_shared_student(uuid);

-- 5. RPC: fetch all data for a student share page by slug (verifies the slug)
CREATE OR REPLACE FUNCTION public.get_student_share_data(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link record;
  v_student record;
  v_batch record;
  v_mod_name text;
  v_attendance jsonb;
  v_demo_days jsonb;
  v_demo_scores jsonb;
  v_demo_feedback jsonb;
BEGIN
  IF p_slug IS NULL OR length(p_slug) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_link FROM public.student_share_links
    WHERE slug = p_slug AND revoked_at IS NULL LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_student FROM public.students WHERE id = v_link.student_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_batch FROM public.batches WHERE id = v_student.batch_id;
  SELECT name INTO v_mod_name FROM public.profiles WHERE id = v_batch.mod_id;

  SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) INTO v_attendance
    FROM public.attendance a WHERE a.student_id = v_link.student_id;
  SELECT coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) INTO v_demo_days
    FROM public.demo_days d WHERE d.batch_id = v_student.batch_id;
  SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v_demo_scores
    FROM public.demo_scores s WHERE s.student_id = v_link.student_id;
  SELECT coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) INTO v_demo_feedback
    FROM public.demo_feedback f WHERE f.student_id = v_link.student_id;

  UPDATE public.student_share_links
    SET last_viewed_at = now() WHERE id = v_link.id;

  RETURN jsonb_build_object(
    'student', to_jsonb(v_student),
    'batch', to_jsonb(v_batch),
    'mod_name', coalesce(v_mod_name, ''),
    'attendance', v_attendance,
    'demo_days', v_demo_days,
    'demo_scores', v_demo_scores,
    'demo_feedback', v_demo_feedback
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_share_data(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_share_data(text) TO anon, authenticated;
