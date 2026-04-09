
CREATE TABLE public.demo_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  demo_day_id UUID NOT NULL REFERENCES public.demo_days(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  feedback TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(demo_day_id, student_id)
);

ALTER TABLE public.demo_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mods can view own demo_feedback"
  ON public.demo_feedback FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM demo_days JOIN batches ON batches.id = demo_days.batch_id
    WHERE demo_days.id = demo_feedback.demo_day_id AND batches.mod_id = auth.uid()
  ));

CREATE POLICY "Mods can insert own demo_feedback"
  ON public.demo_feedback FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM demo_days JOIN batches ON batches.id = demo_days.batch_id
    WHERE demo_days.id = demo_feedback.demo_day_id AND batches.mod_id = auth.uid()
  ));

CREATE POLICY "Mods can update own demo_feedback"
  ON public.demo_feedback FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM demo_days JOIN batches ON batches.id = demo_days.batch_id
    WHERE demo_days.id = demo_feedback.demo_day_id AND batches.mod_id = auth.uid()
  ));

CREATE POLICY "Mods can delete own demo_feedback"
  ON public.demo_feedback FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM demo_days JOIN batches ON batches.id = demo_days.batch_id
    WHERE demo_days.id = demo_feedback.demo_day_id AND batches.mod_id = auth.uid()
  ));

CREATE POLICY "Admins can view all demo_feedback"
  ON public.demo_feedback FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));
