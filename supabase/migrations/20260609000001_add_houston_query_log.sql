-- Log every Houston query for cost visibility and usage analytics.
-- Edge functions write via the service role key so no INSERT policy is needed for users.

CREATE TABLE public.houston_query_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  user_role TEXT NOT NULL CHECK (user_role IN ('admin', 'moderator')),
  houston_variant TEXT NOT NULL CHECK (houston_variant IN ('admin', 'mod')),
  question TEXT NOT NULL,
  answer_preview TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  cost_usd NUMERIC(10, 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.houston_query_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read the log (usage analytics page)
CREATE POLICY "Admins can read houston_query_log" ON public.houston_query_log
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
