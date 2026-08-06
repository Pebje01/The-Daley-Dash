-- Ruwe leads: een triagelaag voor het entity_type 'ruwe_lead' in dezelfde
-- clickup_crm_records-tabel. Bewust geen nieuwe tabel: entity_type
-- onderscheidt al records van elkaar, en op deze manier hergebruikt een
-- ruwe lead gewoon de bestaande AI-kwalificatie, blocklist en activiteitenlog.
-- Alleen toevoegen, bestaande kolommen blijven ongemoeid. Idempotent.

ALTER TABLE clickup_crm_records
  ADD COLUMN IF NOT EXISTS ruwe_contact_email TEXT,
  ADD COLUMN IF NOT EXISTS ruwe_website TEXT,
  ADD COLUMN IF NOT EXISTS ruwe_bron TEXT,
  ADD COLUMN IF NOT EXISTS ruwe_fit_reden TEXT,
  ADD COLUMN IF NOT EXISTS ruwe_prioriteit TEXT;

DO $$
BEGIN
  ALTER TABLE clickup_crm_records
    ADD CONSTRAINT clickup_crm_records_ruwe_prioriteit_check
    CHECK (ruwe_prioriteit IS NULL OR ruwe_prioriteit IN ('ster', 'normaal', 'laag'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS clickup_crm_records_ruwe_lead_status_idx
  ON clickup_crm_records (status)
  WHERE entity_type = 'ruwe_lead';

COMMENT ON COLUMN clickup_crm_records.ruwe_contact_email IS 'Alleen relevant voor entity_type ruwe_lead: e-mailadres van de eerste ingang.';
COMMENT ON COLUMN clickup_crm_records.ruwe_website IS 'Alleen relevant voor entity_type ruwe_lead: website zoals gevonden tijdens onderzoek.';
COMMENT ON COLUMN clickup_crm_records.ruwe_bron IS 'Alleen relevant voor entity_type ruwe_lead: waar deze kandidaat vandaan komt (zoekopdracht, platform, verwijzing).';
COMMENT ON COLUMN clickup_crm_records.ruwe_fit_reden IS 'Alleen relevant voor entity_type ruwe_lead: handmatig genoteerde reden waarom dit een fit is, los van het AI-oordeel.';
COMMENT ON COLUMN clickup_crm_records.ruwe_prioriteit IS 'Alleen relevant voor entity_type ruwe_lead: ster, normaal of laag. Handmatige prioriteit, los van ai_prioriteit.';
