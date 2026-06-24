-- Activiteitenlog voor CRM-records: voedt de activiteitenfeed op de detailkaarten.
-- Gevuld vanuit lib/crm/store.ts bij aanmaken, wijzigen en promoten van records.
CREATE TABLE IF NOT EXISTS crm_activiteiten (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES clickup_crm_records(id) ON DELETE CASCADE,
  soort TEXT NOT NULL DEFAULT 'veld',
  omschrijving TEXT NOT NULL,
  oude_waarde TEXT,
  nieuwe_waarde TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_activiteiten_record_idx ON crm_activiteiten(record_id, created_at DESC);

ALTER TABLE crm_activiteiten ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth users full access on crm_activiteiten" ON crm_activiteiten;
CREATE POLICY "Auth users full access on crm_activiteiten"
  ON crm_activiteiten FOR ALL TO authenticated USING (true) WITH CHECK (true);
