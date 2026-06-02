CREATE OR REPLACE FUNCTION public.exec_select_query(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  -- Only allow SELECT statements
  IF NOT (TRIM(LEADING FROM LOWER(query)) LIKE 'select%'
    OR TRIM(LEADING FROM LOWER(query)) LIKE 'with%') THEN
    RAISE EXCEPTION 'Only SELECT statements are allowed';
  END IF;

  EXECUTE 'SELECT COALESCE(json_agg(t), ''[]''::json) FROM (' || query || ') t'
  INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.exec_select_query(text) TO authenticated, service_role;
