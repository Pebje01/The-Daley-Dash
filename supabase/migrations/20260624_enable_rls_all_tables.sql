-- Beveiliging: zet Row-Level Security (RLS) aan op alle publieke tabellen.
-- Zonder policies betekent dit: de publieke (anon) sleutel kan niets meer
-- lezen/schrijven via de REST-API. De server gebruikt de service-key, die
-- RLS omzeilt, dus de app blijft gewoon werken.
-- Lost de Supabase-melding "rls_disabled_in_public" op.

do $$
declare
  r record;
begin
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security;', r.tablename);
  end loop;
end $$;
