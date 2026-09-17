-- Volgorde en prioriteit voor de to-do list (/taken).
--
-- Tot nu toe stonden taken op aanmaakdatum, nieuwste bovenaan. Je wil ze zelf
-- kunnen verslepen, dus de volgorde wordt een eigen kolom. Het is een getal met
-- decimalen: een taak tussen twee andere zetten krijgt het midden van die twee,
-- zodat een versleping maar één rij hoeft bij te werken.
--
-- Prioriteit is optioneel. Leeg = geen prioriteit gegeven.

alter table taken
  add column if not exists positie double precision,
  add column if not exists prioriteit text
    check (prioriteit in ('urgent', 'hoog', 'middel', 'laag'));

-- Bestaande taken houden de volgorde die ze nu hebben: nieuwste bovenaan
update taken t
set positie = sub.rn
from (
  select id, row_number() over (order by created_at desc) as rn
  from taken
) sub
where t.id = sub.id
  and t.positie is null;

create index if not exists idx_taken_positie on taken (positie);
