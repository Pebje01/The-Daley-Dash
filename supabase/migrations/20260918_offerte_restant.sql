-- "Nog te factureren" per akkoord-offerte.
--
-- Wat er van een offerte nog gefactureerd moet worden is het offertebedrag min
-- de facturen die eraan gekoppeld zijn (facturen.offerte_id). Soms komt dat
-- restant er nooit: het project viel kleiner uit, of er is korting gegeven.
-- Dan zet Daley het restant op vervallen, anders blijft het eeuwig openstaan.
--
-- Leeg = het restant telt gewoon mee. Een datum = vervallen sinds dan.

alter table offertes
  add column if not exists restant_vervallen_op timestamptz;
