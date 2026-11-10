-- Security fix (11 Nov 2026)
-- 1. exec_select_query is SECURITY DEFINER and ran any SELECT; it was executable by
--    anon + authenticated, so the public publishable key could read every table.
--    Only the mc-mcp edge function (service role) needs it.
revoke execute on function public.exec_select_query(text) from public, anon, authenticated;
grant execute on function public.exec_select_query(text) to service_role;

-- 2. Shared secret for the mc-mcp connector endpoint. RLS on with no policies:
--    only the service role can read it. The value is generated in the database
--    and is deliberately not stored in this repo.
create table if not exists public.private_secrets (
  key text primary key,
  value text not null,
  created_at timestamptz default now()
);
alter table public.private_secrets enable row level security;
revoke all on public.private_secrets from anon, authenticated;
insert into public.private_secrets(key, value)
  values ('mc_mcp_key', encode(gen_random_bytes(24), 'hex'))
  on conflict (key) do nothing;
