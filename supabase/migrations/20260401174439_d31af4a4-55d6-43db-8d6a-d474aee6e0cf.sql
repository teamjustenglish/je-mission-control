
-- Create rescheduled_sessions table
CREATE TABLE public.rescheduled_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  day_name TEXT NOT NULL,
  original_date DATE,
  new_date DATE NOT NULL,
  reason TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rescheduled_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all rescheduled_sessions" ON public.rescheduled_sessions
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Mods can view own rescheduled_sessions" ON public.rescheduled_sessions
  FOR SELECT USING (EXISTS (SELECT 1 FROM batches WHERE batches.id = rescheduled_sessions.batch_id AND batches.mod_id = auth.uid()));

CREATE POLICY "Mods can insert own rescheduled_sessions" ON public.rescheduled_sessions
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM batches WHERE batches.id = rescheduled_sessions.batch_id AND batches.mod_id = auth.uid()));

CREATE POLICY "Mods can update own rescheduled_sessions" ON public.rescheduled_sessions
  FOR UPDATE USING (EXISTS (SELECT 1 FROM batches WHERE batches.id = rescheduled_sessions.batch_id AND batches.mod_id = auth.uid()));

CREATE POLICY "Mods can delete own rescheduled_sessions" ON public.rescheduled_sessions
  FOR DELETE USING (EXISTS (SELECT 1 FROM batches WHERE batches.id = rescheduled_sessions.batch_id AND batches.mod_id = auth.uid()));

-- Create moderator_codes table
CREATE TABLE public.moderator_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mod_id UUID,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.moderator_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do everything with moderator_codes" ON public.moderator_codes
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can read codes for activation" ON public.moderator_codes
  FOR SELECT USING (true);
