
-- Add batch_id column to activity_log if not exists
ALTER TABLE public.activity_log ADD COLUMN IF NOT EXISTS batch_id uuid;

-- Add start_date column to batches if not exists  
ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS start_date date;

-- Add last_sign_in column to profiles for tracking activity
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_sign_in timestamp with time zone;
