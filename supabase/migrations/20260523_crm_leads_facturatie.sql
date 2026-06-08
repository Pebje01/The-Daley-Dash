CREATE TABLE IF NOT EXISTS crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clickup_id text UNIQUE,
  naam text NOT NULL,
  status text,
  bedrijf_id uuid REFERENCES crm_bedrijven(id) ON DELETE SET NULL,
  contactpersoon_id uuid REFERENCES crm_contacten(id) ON DELETE SET NULL,
  bron text,
  type_kans text,
  producten text[],
  details text,
  prijs_incl_btw numeric,
  beslissingsdatum date,
  op_initiatief_van text,
  reden text,
  notities text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_facturatie (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clickup_id text UNIQUE,
  naam text NOT NULL,
  status text,
  bedrijf_id uuid REFERENCES crm_bedrijven(id) ON DELETE SET NULL,
  contactpersoon_id uuid REFERENCES crm_contacten(id) ON DELETE SET NULL,
  bron text,
  type_kans text,
  invoice_category text,
  producten text[],
  details text,
  prijs_incl_btw numeric,
  factuurdatum date,
  op_initiatief_van text,
  notities text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_facturatie ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can do everything on crm_leads"
  ON crm_leads FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can do everything on crm_facturatie"
  ON crm_facturatie FOR ALL TO authenticated USING (true) WITH CHECK (true);
