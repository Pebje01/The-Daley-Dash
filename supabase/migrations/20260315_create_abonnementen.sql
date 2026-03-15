-- =============================================================
-- Migratie: abonnementen tabel aanmaken
-- =============================================================

CREATE TABLE IF NOT EXISTS abonnementen (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          TEXT NOT NULL,
  client_name         TEXT NOT NULL,
  client_contact_person TEXT,
  client_email        TEXT,
  client_phone        TEXT,
  client_address      TEXT,
  description         TEXT NOT NULL,
  amount              DECIMAL(10,2) NOT NULL,
  btw_percentage      DECIMAL(5,2) NOT NULL DEFAULT 21,
  interval            TEXT NOT NULL CHECK (interval IN ('maandelijks', 'kwartaal', 'jaarlijks')),
  status              TEXT NOT NULL DEFAULT 'actief' CHECK (status IN ('actief', 'gepauzeerd', 'beeindigd')),
  start_date          DATE NOT NULL,
  end_date            DATE,
  next_invoice_date   DATE,
  last_invoice_date   DATE,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_abonnementen_company_id ON abonnementen(company_id);
CREATE INDEX IF NOT EXISTS idx_abonnementen_status ON abonnementen(status);

ALTER TABLE abonnementen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users full access on abonnementen"
  ON abonnementen FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
