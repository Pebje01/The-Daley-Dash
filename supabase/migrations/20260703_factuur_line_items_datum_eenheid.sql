-- Voegt `datum` en `eenheid` toe aan factuur_line_items.
--
-- De factuur-generatie (app/api/factuur-van-uren) schrijft deze velden al weg en
-- de regenerate-route (app/api/facturen/[id]/regenerate-pdf) leest ze weer uit,
-- zodat een factuur met datum-subregels en "per uur" regels correct opnieuw
-- gegenereerd kan worden. Zonder deze kolommen faalde de line-items insert stil,
-- waardoor facturen zonder regels in de database belandden.
alter table public.factuur_line_items
  add column if not exists datum date,
  add column if not exists eenheid text;
