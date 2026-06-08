ALTER TABLE crm_bedrijven ADD COLUMN IF NOT EXISTS tags text[];
ALTER TABLE crm_bedrijven ADD COLUMN IF NOT EXISTS clickup_created_at timestamptz;
ALTER TABLE crm_bedrijven ADD COLUMN IF NOT EXISTS clickup_updated_at timestamptz;

ALTER TABLE crm_contacten ADD COLUMN IF NOT EXISTS tags text[];
ALTER TABLE crm_contacten ADD COLUMN IF NOT EXISTS clickup_created_at timestamptz;
ALTER TABLE crm_contacten ADD COLUMN IF NOT EXISTS clickup_updated_at timestamptz;

ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS tags text[];
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS clickup_created_at timestamptz;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS clickup_updated_at timestamptz;
