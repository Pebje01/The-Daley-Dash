-- =============================================================
-- Migratie: facturen kolommen hernoemen naar Engels
-- (consistent met offertes tabel)
-- =============================================================

-- Bestaande kolommen hernoemen
ALTER TABLE facturen RENAME COLUMN nummer TO number;
ALTER TABLE facturen RENAME COLUMN klant_naam TO client_name;
ALTER TABLE facturen RENAME COLUMN klant_email TO client_email;
ALTER TABLE facturen RENAME COLUMN vervaldatum TO due_date;
ALTER TABLE facturen RENAME COLUMN totaal_excl TO subtotal;
ALTER TABLE facturen RENAME COLUMN totaal_btw TO btw_amount;
ALTER TABLE facturen RENAME COLUMN totaal TO total;
ALTER TABLE facturen RENAME COLUMN betaald_op TO paid_at;
ALTER TABLE facturen RENAME COLUMN notities TO notes;
ALTER TABLE facturen RENAME COLUMN aangemaakt TO created_at;
ALTER TABLE facturen RENAME COLUMN bijgewerkt TO updated_at;
ALTER TABLE facturen RENAME COLUMN mollie_id TO mollie_payment_id;
ALTER TABLE facturen RENAME COLUMN mollie_url TO mollie_payment_url;

-- user_id → company_id (consistent met offertes)
ALTER TABLE facturen RENAME COLUMN user_id TO company_id;

-- Kolommen toevoegen die de code verwacht maar nog niet bestaan
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS date DATE;
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS client_contact_person TEXT;
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS client_phone TEXT;
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS client_address TEXT;
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS client_kvk TEXT;
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS client_btw TEXT;
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS btw_percentage DECIMAL(5,2) NOT NULL DEFAULT 21;
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- date vullen vanuit created_at voor bestaande rows
UPDATE facturen SET date = created_at::date WHERE date IS NULL;
ALTER TABLE facturen ALTER COLUMN date SET NOT NULL;

-- factuur_line_items tabel aanmaken (nu ontbreekt deze)
CREATE TABLE IF NOT EXISTS factuur_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factuur_id UUID NOT NULL REFERENCES facturen(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  details TEXT,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  section_title TEXT
);

CREATE INDEX IF NOT EXISTS idx_factuur_line_items_factuur_id ON factuur_line_items(factuur_id);

-- RLS voor factuur_line_items
ALTER TABLE factuur_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users full access on factuur_line_items"
  ON factuur_line_items FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Optioneel: migreer data van regels (JSONB) naar factuur_line_items
-- Uncomment als er data in regels staat die je wilt bewaren:
--
-- INSERT INTO factuur_line_items (factuur_id, sort_order, description, quantity, unit_price)
-- SELECT
--   f.id,
--   (item->>'sort_order')::int,
--   item->>'description',
--   COALESCE((item->>'quantity')::decimal, 1),
--   COALESCE((item->>'unit_price')::decimal, 0)
-- FROM facturen f,
--   jsonb_array_elements(f.regels) WITH ORDINALITY AS t(item, idx)
-- WHERE f.regels IS NOT NULL AND jsonb_array_length(f.regels) > 0;

-- Na migratie van regels kun je de kolom verwijderen:
-- ALTER TABLE facturen DROP COLUMN IF EXISTS regels;
-- ALTER TABLE facturen DROP COLUMN IF EXISTS klant_id;
-- ALTER TABLE facturen DROP COLUMN IF EXISTS onderwerp;
