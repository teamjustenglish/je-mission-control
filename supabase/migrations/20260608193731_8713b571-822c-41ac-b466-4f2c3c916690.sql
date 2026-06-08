CREATE TABLE public.houston_query_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  question TEXT,
  response_chars INTEGER,
  duration_ms INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.houston_query_log TO authenticated;
GRANT ALL ON public.houston_query_log TO service_role;

ALTER TABLE public.houston_query_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all houston query logs"
ON public.houston_query_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_houston_query_log_created_at ON public.houston_query_log (created_at DESC);
CREATE INDEX idx_houston_query_log_user_id ON public.houston_query_log (user_id);