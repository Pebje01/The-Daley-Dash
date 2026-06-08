-- Koppel uren_klanten aan crm_bedrijven
-- Stap 1: kolom toevoegen
ALTER TABLE uren_klanten
  ADD COLUMN IF NOT EXISTS crm_bedrijf_id uuid REFERENCES crm_bedrijven(id) ON DELETE SET NULL;

-- Stap 2: maak crm_bedrijven records voor bestaande uren_klanten die nog geen match hebben
INSERT INTO crm_bedrijven (naam, created_at, updated_at)
SELECT DISTINCT uk.naam, now(), now()
FROM uren_klanten uk
WHERE NOT EXISTS (
  SELECT 1 FROM crm_bedrijven cb WHERE lower(cb.naam) = lower(uk.naam)
);

-- Stap 3: koppel uren_klanten aan hun crm record
UPDATE uren_klanten uk
SET crm_bedrijf_id = cb.id
FROM crm_bedrijven cb
WHERE lower(uk.naam) = lower(cb.naam)
  AND uk.crm_bedrijf_id IS NULL;
