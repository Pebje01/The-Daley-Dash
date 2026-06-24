-- Betalingen-tabel: stond al in de code (lib/supabase/betalingen.ts, /betalingen
-- pagina, /api/betalingen) maar bestond nog niet in de database.
-- Uitvoeren via Supabase Dashboard > SQL Editor, of supabase db push.

CREATE TABLE IF NOT EXISTS betalingen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factuur_id UUID REFERENCES facturen(id) ON DELETE SET NULL,
  company_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_email TEXT,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'openstaand',
  method TEXT,
  mollie_payment_id TEXT,
  reference TEXT,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS betalingen_factuur_id_idx ON betalingen(factuur_id);
CREATE INDEX IF NOT EXISTS betalingen_status_idx ON betalingen(status);

ALTER TABLE betalingen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth users full access on betalingen" ON betalingen;
CREATE POLICY "Auth users full access on betalingen"
  ON betalingen FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
