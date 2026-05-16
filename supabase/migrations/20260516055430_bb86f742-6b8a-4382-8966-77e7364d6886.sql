-- Create student_action_snoozes table for dropout intervention snoozes
CREATE TABLE public.student_action_snoozes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  snooze_type TEXT NOT NULL,
  snoozed_by UUID REFERENCES auth.users(id),
  snoozed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for active snooze lookups
CREATE INDEX idx_student_action_snoozes_active
  ON public.student_action_snoozes(student_id, snooze_type, expires_at);

-- Enable Row Level Security
ALTER TABLE public.student_action_snoozes ENABLE ROW LEVEL SECURITY;

-- Helper function: is student owned by current mod?
-- We inline the EXISTS check in each policy rather than a function,
-- to follow the existing RLS pattern in this project.

-- Mods can SELECT snoozes for their own students
CREATE POLICY "mods see own snoozes" ON public.student_action_snoozes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.batches b ON b.id = s.batch_id
      WHERE s.id = student_id AND b.mod_id = auth.uid()
    )
  );

-- Admins can SELECT all snoozes
CREATE POLICY "admins see all snoozes" ON public.student_action_snoozes
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Mods can INSERT snoozes for their own students
CREATE POLICY "mods insert own snoozes" ON public.student_action_snoozes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.batches b ON b.id = s.batch_id
      WHERE s.id = student_id AND b.mod_id = auth.uid()
    )
  );

-- Admins can INSERT any snooze
CREATE POLICY "admins insert snoozes" ON public.student_action_snoozes
  FOR INSERT WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Mods can UPDATE snoozes for their own students
CREATE POLICY "mods update own snoozes" ON public.student_action_snoozes
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.batches b ON b.id = s.batch_id
      WHERE s.id = student_id AND b.mod_id = auth.uid()
    )
  );

-- Admins can UPDATE any snooze
CREATE POLICY "admins update snoozes" ON public.student_action_snoozes
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Mods can DELETE snoozes for their own students
CREATE POLICY "mods delete own snoozes" ON public.student_action_snoozes
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.batches b ON b.id = s.batch_id
      WHERE s.id = student_id AND b.mod_id = auth.uid()
    )
  );

-- Admins can DELETE any snooze
CREATE POLICY "admins delete snoozes" ON public.student_action_snoozes
  FOR DELETE USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
  );
