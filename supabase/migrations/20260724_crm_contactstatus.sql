-- Contactstatus met drie standen, vervangt de losse boolean niet_benaderen.
--   open      = gewoon benaderbaar
--   pauze     = zachte stop, voorlopig even niet, optioneel tot een datum
--   blokkade  = harde stop, wil nooit meer benaderd worden
-- Idempotent. Bestaande blokkades worden meegenomen voordat de oude kolommen weg gaan.

ALTER TABLE clickup_crm_records
  ADD COLUMN IF NOT EXISTS contact_status TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS contact_status_tot DATE,
  ADD COLUMN IF NOT EXISTS contact_status_reden TEXT;

DO $$
BEGIN
  ALTER TABLE clickup_crm_records
    ADD CONSTRAINT clickup_crm_records_contact_status_check
    CHECK (contact_status IN ('open', 'pauze', 'blokkade'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Oude blokkades overzetten
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clickup_crm_records' AND column_name = 'niet_benaderen'
  ) THEN
    EXECUTE $sql$
      UPDATE clickup_crm_records
         SET contact_status = 'blokkade',
             contact_status_reden = COALESCE(contact_status_reden, niet_benaderen_reden)
       WHERE niet_benaderen IS TRUE
    $sql$;
  END IF;
END $$;

DROP INDEX IF EXISTS clickup_crm_records_volgende_actie_idx;

ALTER TABLE clickup_crm_records
  DROP COLUMN IF EXISTS niet_benaderen,
  DROP COLUMN IF EXISTS niet_benaderen_reden;

-- Voedt het blok "Vandaag oppakken": openstaande acties van benaderbare relaties.
CREATE INDEX IF NOT EXISTS clickup_crm_records_volgende_actie_idx
  ON clickup_crm_records (volgende_actie)
  WHERE volgende_actie IS NOT NULL AND contact_status <> 'blokkade';

COMMENT ON COLUMN clickup_crm_records.contact_status IS 'open, pauze (zacht, voorlopig niet) of blokkade (hard, nooit meer benaderen).';
COMMENT ON COLUMN clickup_crm_records.contact_status_tot IS 'Einddatum van een pauze. Daarna komt de relatie vanzelf weer terug in de opvolging.';
