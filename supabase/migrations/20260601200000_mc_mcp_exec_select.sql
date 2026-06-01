-- Safe SELECT-only SQL execution for MCP server (mc_query_data tool)
CREATE OR REPLACE FUNCTION public.exec_select_query(query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT (lower(trim(query)) LIKE 'select%') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;
  IF lower(query) ~ '\y(insert|update|delete|drop|alter|truncate|create|grant|revoke|exec|execute)\y' THEN
    RAISE EXCEPTION 'Query contains a forbidden SQL keyword';
  END IF;
  EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (%s) t', query) INTO result;
  RETURN coalesce(result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.exec_select_query(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exec_select_query(text) TO service_role;
