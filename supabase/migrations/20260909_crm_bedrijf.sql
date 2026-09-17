-- Prospects en leads horen bij één van de eigen bedrijven.
--
-- The Daley Edit is de overkoepelende weergave en laat alles zien, ook wat op
-- WGB of Daley Photography staat. Binnen WGB of Daley Photography zie je alleen
-- wat aan dat bedrijf is toegewezen.
--
-- Leeg = nog niet toegewezen. Die records blijven zichtbaar onder The Daley
-- Edit, zodat er bij het uitrollen niets uit beeld verdwijnt.
--
-- De kolom staat op de hele tabel (alle entity_types delen die), maar wordt
-- alleen gebruikt voor lead en ruwe_lead. Bedrijven, contacten en opdrachten
-- blijven gedeeld: dezelfde klant kan werk voor meerdere bedrijven zijn.

alter table clickup_crm_records
  add column if not exists company_id text;

create index if not exists idx_crm_records_company_entity
  on clickup_crm_records (company_id, entity_type);
