-- Contactgegevens bij ruwe leads: wie is de persoon, welk nummer, welk adres.
-- Zonder mailadres of nummer is een ruwe lead onbruikbaar, want dan kun je er
-- niets mee. Deze kolommen zijn de plek waar de contactzoeker zijn vondst in
-- kwijt kan, naast de bestaande ruwe_-kolommen.
-- Alleen toevoegen, bestaande kolommen blijven ongemoeid. Idempotent.

ALTER TABLE clickup_crm_records
  ADD COLUMN IF NOT EXISTS ruwe_contactpersoon TEXT,
  ADD COLUMN IF NOT EXISTS ruwe_telefoon TEXT,
  ADD COLUMN IF NOT EXISTS ruwe_contact_status TEXT,
  ADD COLUMN IF NOT EXISTS ruwe_contact_gezocht_op TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ruwe_contact_toelichting TEXT,
  ADD COLUMN IF NOT EXISTS ruwe_contact_fout TEXT;

-- De wachtrij pakt hier zijn werk op: ruwe leads die nog nooit zijn opgezocht
-- of waarvan een eerdere poging is mislukt.
CREATE INDEX IF NOT EXISTS clickup_crm_records_ruwe_contact_status_idx
  ON clickup_crm_records (ruwe_contact_status)
  WHERE entity_type = 'ruwe_lead';

COMMENT ON COLUMN clickup_crm_records.ruwe_contactpersoon IS 'Alleen relevant voor entity_type ruwe_lead: naam van de eigenaar of vaste contactpersoon.';
COMMENT ON COLUMN clickup_crm_records.ruwe_telefoon IS 'Alleen relevant voor entity_type ruwe_lead: telefoonnummer zoals het op de site staat.';
COMMENT ON COLUMN clickup_crm_records.ruwe_contact_status IS 'wachtend, bezig, klaar of mislukt. NULL = nog nooit opgezocht.';
COMMENT ON COLUMN clickup_crm_records.ruwe_contact_gezocht_op IS 'Wanneer de contactzoeker voor het laatst langs deze lead is geweest.';
COMMENT ON COLUMN clickup_crm_records.ruwe_contact_toelichting IS 'Waar de gegevens vandaan komen, bijvoorbeeld contactpagina of footer.';
COMMENT ON COLUMN clickup_crm_records.ruwe_contact_fout IS 'Foutmelding van de laatste mislukte poging.';
