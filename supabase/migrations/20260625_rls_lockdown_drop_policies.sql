-- Beveiliging (vervolg): verwijder alle bestaande policies op publieke tabellen
-- en borg dat RLS overal aan staat. Resultaat: de publieke (anon/publishable)
-- sleutel kan via de REST-API niets meer lezen of schrijven. De service-key
-- (server-side) omzeilt RLS en blijft werken, dus de app blijft functioneren.
--
-- Reden: er stonden permissieve policies ("sta alles toe") dormant terwijl RLS
-- uit was; toen RLS aanging werden die actief en bleef de data leesbaar.

do $$
declare
  r record;
begin
  -- 1) Alle bestaande policies op publieke tabellen verwijderen.
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on public.%I;', r.policyname, r.tablename);
  end loop;

  -- 2) RLS aanzetten op alle publieke tabellen (idempotent).
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security;', r.tablename);
  end loop;
end $$;
