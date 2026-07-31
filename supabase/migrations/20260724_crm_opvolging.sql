-- Opvolging op CRM-records (leadbord): volgende actie, contactmomenten en blokkeerlijst.
-- Alleen toevoegen, bestaande kolommen blijven ongemoeid. Idempotent.

ALTER TABLE clickup_crm_records
  ADD COLUMN IF NOT EXISTS volgende_actie DATE,
  ADD COLUMN IF NOT EXISTS volgende_actie_notitie TEXT,
  ADD COLUMN IF NOT EXISTS laatste_contact TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contact_pogingen INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS niet_benaderen BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS niet_benaderen_reden TEXT;

-- Voedt het blok "Vandaag oppakken": openstaande acties, nooit geblokkeerde relaties.
CREATE INDEX IF NOT EXISTS clickup_crm_records_volgende_actie_idx
  ON clickup_crm_records (volgende_actie)
  WHERE volgende_actie IS NOT NULL AND niet_benaderen = false;

COMMENT ON COLUMN clickup_crm_records.volgende_actie IS 'Datum waarop deze lead weer opgepakt moet worden. Standaardwaarde per fase, per lead aanpasbaar.';
COMMENT ON COLUMN clickup_crm_records.laatste_contact IS 'Laatste gelogde contactmoment (mail, telefoon, WhatsApp, meeting).';
COMMENT ON COLUMN clickup_crm_records.contact_pogingen IS 'Aantal gelogde contactmomenten, telt de follow-ups.';
COMMENT ON COLUMN clickup_crm_records.niet_benaderen IS 'Blokkeerlijst: deze relatie wil niet meer benaderd worden.';
