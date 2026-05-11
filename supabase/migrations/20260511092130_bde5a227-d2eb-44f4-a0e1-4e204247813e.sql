ALTER TABLE public.students
  ADD COLUMN status text NOT NULL DEFAULT 'active',
  ADD COLUMN status_reason text NULL,
  ADD COLUMN status_changed_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_students_batch_status
  ON public.students (batch_id, status);