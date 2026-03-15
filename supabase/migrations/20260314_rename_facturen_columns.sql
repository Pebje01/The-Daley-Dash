-- =============================================================
-- Migratie: facturen kolommen hernoemen naar Engels
-- (consistent met offertes tabel)
-- =============================================================

-- Stap 1: Alle RLS policies op facturen droppen (ze gebruiken user_id)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'facturen'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON facturen', pol.policyname);
  END LOOP;
END $$;

-- Stap 2: Kolommen hernoemen
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='facturen' AND column_name='nummer') THEN
    ALTER TABLE facturen RENAME COLUMN nummer TO number;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='facturen' AND column_name='klant_naam') THEN
    ALTER TABLE facturen RENAME COLUMN klant_naam TO client_name;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='facturen' AND column_name='klant_email') THEN
    ALTER TABLE facturen RENAME COLUMN klant_email TO client_email;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='facturen' AND column_name='vervaldatum') THEN
    ALTER TABLE facturen RENAME COLUMN vervaldatum TO due_date;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='facturen' AND column_name='totaal_excl') THEN
    ALTER TABLE facturen RENAME COLUMN totaal_excl TO subtotal;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='facturen' AND column_name='totaal_btw') THEN
    ALTER TABLE facturen RENAME COLUMN totaal_btw TO btw_amount;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='facturen' AND column_name='totaal') THEN
    ALTER TABLE facturen RENAME COLUMN totaal TO total;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='facturen' AND column_name='betaald_op') THEN
    ALTER TABLE facturen RENAME COLUMN betaald_op TO paid_at;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='facturen' AND column_name='notities') THEN
    ALTER TABLE facturen RENAME COLUMN notities TO notes;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='facturen' AND column_name='aangemaakt') THEN
    ALTER TABLE facturen RENAME COLUMN aangemaakt TO created_at;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='facturen' AND column_name='bijgewerkt') THEN
    ALTER TABLE facturen RENAME COLUMN bijgewerkt TO updated_at;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='facturen' AND column_name='mollie_id') THEN
    ALTER TABLE facturen RENAME COLUMN mollie_id TO mollie_payment_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='facturen' AND column_name='mollie_url') THEN
    ALTER TABLE facturen RENAME COLUMN mollie_url TO mollie_payment_url;
  END IF;

  -- user_id (UUID) → company_id (TEXT): eerst FK constraint droppen
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='facturen' AND column_name='user_id') THEN
    ALTER TABLE facturen DROP CONSTRAINT IF EXISTS facturen_user_id_fkey;
    ALTER TABLE facturen ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
    ALTER TABLE facturen RENAME COLUMN user_id TO company_id;
  END IF;
END $$;

-- Stap 3: Nieuwe kolommen toevoegen
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM facturen WHERE date IS NULL) THEN
    ALTER TABLE facturen ALTER COLUMN date SET NOT NULL;
  END IF;
END $$;

-- number UNIQUE constraint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'facturen_number_key') THEN
    ALTER TABLE facturen ADD CONSTRAINT facturen_number_key UNIQUE (number);
  END IF;
END $$;

-- Stap 4: factuur_line_items tabel
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
ALTER TABLE factuur_line_items ENABLE ROW LEVEL SECURITY;

-- Stap 5: Nieuwe RLS policies (open voor authenticated users)
CREATE POLICY "Auth users full access on facturen"
  ON facturen FOR ALL TO authenticated USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='factuur_line_items' AND policyname='Auth users full access on factuur_line_items'
  ) THEN
    CREATE POLICY "Auth users full access on factuur_line_items"
      ON factuur_line_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Stap 6: Oude kolommen opruimen
ALTER TABLE facturen DROP COLUMN IF EXISTS regels;
ALTER TABLE facturen DROP COLUMN IF EXISTS klant_id;
ALTER TABLE facturen DROP COLUMN IF EXISTS onderwerp;
