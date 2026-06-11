-- Extend setup_invite_account to optionally persist the mod's profile photo.
--
-- The invite signup flow inserts the profile row client-side (id, email, name, role,
-- and now avatar_url). This RPC remains the authority for granting the moderator role
-- and counting invite uses; we give it an optional p_avatar_url so the photo can also
-- be set server-side as a safety net. COALESCE means it only fills avatar_url when the
-- row doesn't already have one — it never clobbers a value the client just inserted.
--
-- Adding a parameter changes the function's argument signature, so the old 1-arg
-- overload is dropped first to avoid leaving two overloads behind. The default keeps
-- existing callers (rpc with just p_token) working unchanged.
DROP FUNCTION IF EXISTS public.setup_invite_account(TEXT);

CREATE OR REPLACE FUNCTION public.setup_invite_account(
  p_token TEXT,
  p_avatar_url TEXT DEFAULT NULL
)
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

  -- Only fill the photo if the profile doesn't already have one (no clobber).
  IF p_avatar_url IS NOT NULL THEN
    UPDATE public.profiles
    SET avatar_url = COALESCE(avatar_url, p_avatar_url)
    WHERE id = auth.uid();
  END IF;

  UPDATE public.mod_invites SET uses = uses + 1 WHERE id = v_invite_id;

  RETURN 'ok';
END;
$$;

GRANT EXECUTE ON FUNCTION public.setup_invite_account(TEXT, TEXT) TO authenticated;
