-- Voeg de kerntabellen toe aan de Realtime-publicatie zodat postgres_changes
-- subscriptions in de app (dashboard, offertes, facturen, betalingen) events
-- ontvangen. Uitvoeren via Supabase Dashboard > SQL Editor.
--
-- Let op: delivery van events respecteert RLS. Zolang auth in de app is
-- uitgeschakeld (browser gebruikt de anon key zonder sessie) komen er geen
-- events binnen; het focus/visibility-vangnet in de UI dekt dat scenario.
-- Zodra login weer actief is werkt realtime direct via de policies
-- "Auth users full access".

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'offertes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE offertes;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'facturen'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE facturen;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'betalingen')
     AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'betalingen'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE betalingen;
  END IF;
END $$;
