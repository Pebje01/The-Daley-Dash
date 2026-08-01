-- Prullenbak voor verwijderde facturen.
--
-- Aanleiding: op 1 augustus 2026 verwijderde de bestandssync een verstuurde
-- factuur (F-260731-03, Hairless & Skin) uit Supabase omdat de PDF naar een
-- andere map was verplaatst. Er was geen weg terug: geen enkele back-up bevatte
-- hem nog. Elke verwijdering legt vanaf nu eerst de volledige rij plus de
-- factuurregels hier neer.
--
-- Bewust een aparte tabel en geen deleted_at-kolom op facturen: zo hoeft geen
-- enkele bestaande query aangepast te worden en kan er nergens een filter
-- vergeten worden.

CREATE TABLE IF NOT EXISTS facturen_prullenbak (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factuur_id UUID NOT NULL,
  number TEXT NOT NULL,
  company_id TEXT,
  client_name TEXT,
  status TEXT,
  date DATE,
  total NUMERIC(10,2),
  -- Waar de verwijdering vandaan kwam: 'sync', 'dashboard', 'uren-restore'
  bron TEXT,
  reden TEXT,
  verwijderd_op TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- De volledige rij en regels, zodat terugzetten altijd kan
  factuur JSONB NOT NULL,
  regels JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS facturen_prullenbak_number_idx ON facturen_prullenbak (number);
CREATE INDEX IF NOT EXISTS facturen_prullenbak_verwijderd_op_idx ON facturen_prullenbak (verwijderd_op DESC);

ALTER TABLE facturen_prullenbak ENABLE ROW LEVEL SECURITY;
