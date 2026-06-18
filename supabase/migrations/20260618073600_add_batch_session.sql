-- Add a morning/evening session distinction to batches.
--
-- A moderator may legitimately run BOTH a morning (sun) and an evening (moon)
-- cohort in the same calendar month. The only thing disallowed is two batches
-- with the same (mod_id, month, year, session) -- i.e. a true duplicate.
--
-- Two known mods run both sessions (Sia and Lilian); every other batch is a
-- single session and keeps the 'evening' default.

-- 1. Add the column. Existing rows default to 'evening'.
ALTER TABLE public.batches
  ADD COLUMN IF NOT EXISTS session text NOT NULL DEFAULT 'evening';

ALTER TABLE public.batches
  ADD CONSTRAINT batches_session_check CHECK (session IN ('morning', 'evening'));

-- 2. Backfill the two known morning cohorts BEFORE adding the unique constraint,
--    otherwise the constraint creation fails on the existing duplicate pair.
--    Lilian's "Jun 2026" morning batch (cohort with Poorni):
UPDATE public.batches SET session = 'morning'
  WHERE id = 'b9c52b69-895b-4f7f-bcf1-c926abba0601';
--    Sia's morning "May 2026" batch (cohort with Kushin); her other May 2026
--    batch (with Jessica) stays 'evening':
UPDATE public.batches SET session = 'morning'
  WHERE id = '8379572b-5129-48ed-8e8c-8f6fca33d710';

-- 3. Enforce uniqueness at the DB level: one batch per mod, per month, per session.
--    Same month with different sessions is allowed; same month + same session is not.
ALTER TABLE public.batches
  ADD CONSTRAINT batches_mod_month_year_session_unique
  UNIQUE (mod_id, month, year, session);
