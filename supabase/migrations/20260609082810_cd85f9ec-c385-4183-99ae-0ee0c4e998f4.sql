ALTER TABLE public.houston_query_log ALTER COLUMN source DROP NOT NULL;
ALTER TABLE public.houston_query_log
  ADD COLUMN IF NOT EXISTS user_role TEXT,
  ADD COLUMN IF NOT EXISTS houston_variant TEXT,
  ADD COLUMN IF NOT EXISTS answer_preview TEXT,
  ADD COLUMN IF NOT EXISTS tokens_input INTEGER,
  ADD COLUMN IF NOT EXISTS tokens_output INTEGER,
  ADD COLUMN IF NOT EXISTS cost_usd NUMERIC;