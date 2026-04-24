-- Add new reschedule columns alongside existing ones (preserving existing data structure)
ALTER TABLE public.rescheduled_sessions
  ADD COLUMN IF NOT EXISTS from_week integer,
  ADD COLUMN IF NOT EXISTS from_day text,
  ADD COLUMN IF NOT EXISTS to_week integer,
  ADD COLUMN IF NOT EXISTS to_date date;

-- Backfill new columns from legacy fields where possible
UPDATE public.rescheduled_sessions
SET from_week = COALESCE(from_week, week_number),
    from_day = COALESCE(from_day, day_name),
    to_date = COALESCE(to_date, new_date)
WHERE from_week IS NULL OR from_day IS NULL OR to_date IS NULL;