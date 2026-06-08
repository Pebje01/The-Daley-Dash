-- CRM tabellen: bedrijven, contacten, opdrachten (geimporteerd vanuit ClickUp)

CREATE TABLE IF NOT EXISTS crm_bedrijven (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clickup_id text UNIQUE,
  naam text NOT NULL,
  status text,
  website text,
  klantnummer text,
  notities text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_contacten (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clickup_id text UNIQUE,
  naam text NOT NULL,
  email text,
  telefoon text,
  beroep text,
  website text,
  bedrijf_id uuid REFERENCES crm_bedrijven(id) ON DELETE SET NULL,
  notities text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_opdrachten (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clickup_id text UNIQUE,
  naam text NOT NULL,
  status text,
  bedrijf_id uuid REFERENCES crm_bedrijven(id) ON DELETE SET NULL,
  contactpersoon_id uuid REFERENCES crm_contacten(id) ON DELETE SET NULL,
  details text,
  prijs_incl_btw numeric,
  datum_afgerond date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS: zelfde patroon als andere tabellen (auth vereist)
ALTER TABLE crm_bedrijven ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_contacten ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_opdrachten ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can do everything on crm_bedrijven"
  ON crm_bedrijven FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can do everything on crm_contacten"
  ON crm_contacten FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can do everything on crm_opdrachten"
  ON crm_opdrachten FOR ALL TO authenticated USING (true) WITH CHECK (true);
