
-- Create week_status table
CREATE TABLE public.week_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  week_number int NOT NULL CHECK (week_number BETWEEN 1 AND 6),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'finalised', 'closed', 'reopened')),
  finalised_at timestamptz NULL,
  finalised_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_at timestamptz NULL,
  reopened_at timestamptz NULL,
  reopened_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, week_number)
);

-- Index for batch lookups
CREATE INDEX week_status_batch_id_idx ON public.week_status (batch_id);

-- Updated_at trigger (reuse if exists, create if not)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER week_status_updated_at
  BEFORE UPDATE ON public.week_status
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.week_status ENABLE ROW LEVEL SECURITY;

-- Mod policies
CREATE POLICY week_status_mod_select ON public.week_status FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.batches b WHERE b.id = week_status.batch_id AND b.mod_id = auth.uid()));

CREATE POLICY week_status_mod_update ON public.week_status FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.batches b WHERE b.id = week_status.batch_id AND b.mod_id = auth.uid()));

CREATE POLICY week_status_mod_insert ON public.week_status FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.batches b WHERE b.id = week_status.batch_id AND b.mod_id = auth.uid()));

-- Admin policies
CREATE POLICY week_status_admin_select ON public.week_status FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY week_status_admin_update ON public.week_status FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY week_status_admin_insert ON public.week_status FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Backfill existing batches
INSERT INTO public.week_status (batch_id, week_number, status)
SELECT b.id, w.week_number, 'open'
FROM public.batches b
CROSS JOIN (VALUES (1), (2), (3), (4), (5), (6)) AS w(week_number)
ON CONFLICT (batch_id, week_number) DO NOTHING;
