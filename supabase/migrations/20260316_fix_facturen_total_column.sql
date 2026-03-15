-- =============================================================
-- Migratie: facturen.totaal hernoemen naar total (als het nog niet gedaan is)
-- =============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'facturen' AND column_name = 'totaal'
  ) THEN
    ALTER TABLE facturen RENAME COLUMN totaal TO total;
  END IF;
END $$;
