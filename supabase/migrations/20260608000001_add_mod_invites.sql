-- Persistent invite links for mod account self-signup (Discord-style)

CREATE TABLE public.mod_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uses INTEGER NOT NULL DEFAULT 0,
  revoked_at TIMESTAMPTZ
);

ALTER TABLE public.mod_invites ENABLE ROW LEVEL SECURITY;

-- Only admins can read or write mod_invites directly
CREATE POLICY "Admins can manage invite links" ON public.mod_invites
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Public function: returns true if the token exists and has not been revoked.
-- Callable by anon so the /invite/[token] page can validate without exposing the table.
CREATE OR REPLACE FUNCTION public.check_invite_token(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mod_invites
    WHERE token = p_token AND revoked_at IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.check_invite_token(TEXT) TO anon, authenticated;

-- Authenticated function: inserts the moderator user_role and increments the invite uses counter.
-- Called after supabase.auth.signUp() returns a session and the profile row is inserted.
CREATE OR REPLACE FUNCTION public.setup_invite_account(p_token TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite_id UUID;
BEGIN
  SELECT id INTO v_invite_id
  FROM public.mod_invites
  WHERE token = p_token AND revoked_at IS NULL;

  IF v_invite_id IS NULL THEN
    RETURN 'invalid_token';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), 'moderator')
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.mod_invites SET uses = uses + 1 WHERE id = v_invite_id;

  RETURN 'ok';
END;
$$;

GRANT EXECUTE ON FUNCTION public.setup_invite_account(TEXT) TO authenticated;
