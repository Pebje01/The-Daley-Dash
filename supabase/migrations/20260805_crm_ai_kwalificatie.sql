-- AI-kwalificatie van leads. Een lokale Claude (via de CLI, op het abonnement)
-- beoordeelt binnenkomende leads: branchelabel, score, signalen en een
-- voorgestelde eerste stap. Advies, geen automaat: de AI raakt fase,
-- volgende_actie en contactstatus nooit aan.
-- Alleen toevoegen, bestaande kolommen blijven ongemoeid. Idempotent.

ALTER TABLE clickup_crm_records
  ADD COLUMN IF NOT EXISTS ai_status TEXT,
  ADD COLUMN IF NOT EXISTS ai_score INTEGER,
  ADD COLUMN IF NOT EXISTS ai_prioriteit TEXT,
  ADD COLUMN IF NOT EXISTS ai_branche TEXT,
  ADD COLUMN IF NOT EXISTS ai_website TEXT,
  ADD COLUMN IF NOT EXISTS ai_samenvatting TEXT,
  ADD COLUMN IF NOT EXISTS ai_signalen JSONB,
  ADD COLUMN IF NOT EXISTS ai_volgende_stap TEXT,
  ADD COLUMN IF NOT EXISTS ai_beoordeeld_op TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_model TEXT,
  ADD COLUMN IF NOT EXISTS ai_fout TEXT;

-- De worker pakt hier zijn werk op: leads die nog nooit beoordeeld zijn of
-- waarvan een eerdere poging is mislukt.
CREATE INDEX IF NOT EXISTS clickup_crm_records_ai_status_idx
  ON clickup_crm_records (entity_type, ai_status)
  WHERE entity_type = 'lead';

COMMENT ON COLUMN clickup_crm_records.ai_status IS 'wachtend, bezig, klaar of mislukt. NULL = nog nooit aangeboden.';
COMMENT ON COLUMN clickup_crm_records.ai_score IS 'Kwalificatiescore 0-100. Hoger is kansrijker voor Daley.';
COMMENT ON COLUMN clickup_crm_records.ai_prioriteit IS 'hoog, midden of laag. Grovere vertaling van de score.';
COMMENT ON COLUMN clickup_crm_records.ai_branche IS 'Branchelabel, bijvoorbeeld hovenier of tuinarchitect.';
COMMENT ON COLUMN clickup_crm_records.ai_website IS 'Website die de AI heeft gevonden en bekeken.';
COMMENT ON COLUMN clickup_crm_records.ai_signalen IS 'JSON: {plus: [..], min: [..]} met de argumenten achter de score.';
COMMENT ON COLUMN clickup_crm_records.ai_volgende_stap IS 'Voorgestelde eerste stap. Advies, wordt nooit automatisch uitgevoerd.';
COMMENT ON COLUMN clickup_crm_records.ai_fout IS 'Foutmelding van de laatste mislukte poging.';
