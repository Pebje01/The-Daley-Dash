-- Belasting-aangiftetabellen: de aangiftepagina (belasting/aangifte/[jaar]) en
-- bijbehorende API-routes stonden al in de code maar deze tabellen ontbraken nog.
-- Uitvoeren via Supabase Dashboard > SQL Editor.

CREATE TABLE IF NOT EXISTS belasting_aangifte (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jaar INT NOT NULL UNIQUE,
  urencriterium_voldaan BOOLEAN NOT NULL DEFAULT false,
  claim_zelfstandigenaftrek BOOLEAN NOT NULL DEFAULT false,
  claim_startersaftrek BOOLEAN NOT NULL DEFAULT false,
  startersaftrek_keer_gebruikt INT NOT NULL DEFAULT 0,
  for_saldo_begin_jaar DECIMAL(12,2) NOT NULL DEFAULT 0,
  for_vrijval DECIMAL(12,2) NOT NULL DEFAULT 0,
  banksaldo_eindstand DECIMAL(12,2),
  voorraad DECIMAL(12,2) NOT NULL DEFAULT 0,
  eigen_vermogen DECIMAL(12,2),
  crediteuren DECIMAL(12,2) NOT NULL DEFAULT 0,
  notities TEXT,
  laatst_bijgewerkt TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS belasting_kosten_regel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aangifte_id UUID NOT NULL REFERENCES belasting_aangifte(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '',
  categorie TEXT NOT NULL DEFAULT 'overig',
  bedrag DECIMAL(12,2) NOT NULL DEFAULT 0,
  datum DATE,
  notitie TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS belasting_investering (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aangifte_id UUID NOT NULL REFERENCES belasting_aangifte(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '',
  bedrag DECIMAL(12,2) NOT NULL DEFAULT 0,
  datum DATE NOT NULL,
  afschrijvingstermijn_jaren INT NOT NULL DEFAULT 5,
  notitie TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS belasting_debiteur_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aangifte_id UUID NOT NULL REFERENCES belasting_aangifte(id) ON DELETE CASCADE,
  factuur_id UUID NOT NULL REFERENCES facturen(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open',
  notitie TEXT,
  oninbaar_per DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (factuur_id, aangifte_id)
);

CREATE INDEX IF NOT EXISTS belasting_kosten_regel_aangifte_idx ON belasting_kosten_regel(aangifte_id);
CREATE INDEX IF NOT EXISTS belasting_investering_aangifte_idx ON belasting_investering(aangifte_id);
CREATE INDEX IF NOT EXISTS belasting_debiteur_status_aangifte_idx ON belasting_debiteur_status(aangifte_id);

ALTER TABLE belasting_aangifte ENABLE ROW LEVEL SECURITY;
ALTER TABLE belasting_kosten_regel ENABLE ROW LEVEL SECURITY;
ALTER TABLE belasting_investering ENABLE ROW LEVEL SECURITY;
ALTER TABLE belasting_debiteur_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth users full access on belasting_aangifte" ON belasting_aangifte;
CREATE POLICY "Auth users full access on belasting_aangifte"
  ON belasting_aangifte FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Auth users full access on belasting_kosten_regel" ON belasting_kosten_regel;
CREATE POLICY "Auth users full access on belasting_kosten_regel"
  ON belasting_kosten_regel FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Auth users full access on belasting_investering" ON belasting_investering;
CREATE POLICY "Auth users full access on belasting_investering"
  ON belasting_investering FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Auth users full access on belasting_debiteur_status" ON belasting_debiteur_status;
CREATE POLICY "Auth users full access on belasting_debiteur_status"
  ON belasting_debiteur_status FOR ALL TO authenticated USING (true) WITH CHECK (true);
