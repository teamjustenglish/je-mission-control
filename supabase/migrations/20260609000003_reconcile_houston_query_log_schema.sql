-- houston_query_log was created in production with a different schema (source, response_chars,
-- duration_ms). Our edge functions write user_role, houston_variant, answer_preview,
-- tokens_input, tokens_output, cost_usd. This migration reconciles the two.

-- source was NOT NULL but we never set it — make it nullable so existing inserts don't fail
ALTER TABLE public.houston_query_log
  ALTER COLUMN source DROP NOT NULL;

-- Add the columns our edge functions and HoustonUsagePage actually use
ALTER TABLE public.houston_query_log
  ADD COLUMN IF NOT EXISTS user_role      TEXT CHECK (user_role IN ('admin', 'moderator')),
  ADD COLUMN IF NOT EXISTS houston_variant TEXT CHECK (houston_variant IN ('admin', 'mod')),
  ADD COLUMN IF NOT EXISTS answer_preview  TEXT,
  ADD COLUMN IF NOT EXISTS tokens_input    INTEGER,
  ADD COLUMN IF NOT EXISTS tokens_output   INTEGER,
  ADD COLUMN IF NOT EXISTS cost_usd        NUMERIC(10, 6);
