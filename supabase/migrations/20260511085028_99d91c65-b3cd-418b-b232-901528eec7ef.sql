ALTER TABLE public.demo_scores
  ADD COLUMN IF NOT EXISTS makeup_date timestamptz NULL,
  ADD COLUMN IF NOT EXISTS makeup_note text NULL;

CREATE INDEX IF NOT EXISTS idx_demo_scores_makeup_date
  ON public.demo_scores (demo_day_id, student_id)
  WHERE makeup_date IS NOT NULL;