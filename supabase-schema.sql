-- ============================================================
-- Offerte-module Supabase schema
-- Voer dit uit in Supabase Dashboard > SQL Editor
-- ============================================================

-- Tabel: offertes
CREATE TABLE IF NOT EXISTS offertes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number TEXT UNIQUE NOT NULL,
  company_id TEXT NOT NULL,

  -- Klantgegevens
  client_name TEXT NOT NULL,
  client_contact_person TEXT,
  client_email TEXT,
  client_phone TEXT,
  client_address TEXT,
  client_kvk TEXT,
  client_btw TEXT,

  -- Offerte details
  date DATE NOT NULL,
  valid_until DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'concept',

  -- Financieel
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  btw_percentage DECIMAL(5,2) NOT NULL DEFAULT 21,
  btw_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  total DECIMAL(10,2) NOT NULL DEFAULT 0,

  notes TEXT,

  -- Client-facing
  slug TEXT UNIQUE,
  password_hash TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,

  -- Goedkeuring
  approved_at TIMESTAMPTZ,
  approved_by_name TEXT,
  approved_by_email TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabel: line_items
CREATE TABLE IF NOT EXISTS line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offerte_id UUID NOT NULL REFERENCES offertes(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  details TEXT,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0
);

-- Tabel: offerte_approvals (audit log)
CREATE TABLE IF NOT EXISTS offerte_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offerte_id UUID NOT NULL REFERENCES offertes(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  client_ip TEXT,
  user_agent TEXT,
  agreed_to_terms BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_offertes_company_id ON offertes(company_id);
CREATE INDEX IF NOT EXISTS idx_offertes_status ON offertes(status);
CREATE INDEX IF NOT EXISTS idx_offertes_slug ON offertes(slug);
CREATE INDEX IF NOT EXISTS idx_offertes_created_at ON offertes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_line_items_offerte_id ON line_items(offerte_id);
CREATE INDEX IF NOT EXISTS idx_offerte_approvals_offerte_id ON offerte_approvals(offerte_id);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE offertes ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE offerte_approvals ENABLE ROW LEVEL SECURITY;

-- Authenticated users: full access
CREATE POLICY "Auth users full access on offertes"
  ON offertes FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Auth users full access on line_items"
  ON line_items FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Auth users full access on offerte_approvals"
  ON offerte_approvals FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Anonymous (public): read public offertes, insert approvals
CREATE POLICY "Anon can read public offertes"
  ON offertes FOR SELECT
  TO anon
  USING (is_public = true);

CREATE POLICY "Anon can read line items of public offertes"
  ON line_items FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM offertes
      WHERE offertes.id = line_items.offerte_id
      AND offertes.is_public = true
    )
  );

CREATE POLICY "Anon can insert approvals"
  ON offerte_approvals FOR INSERT
  TO anon
  WITH CHECK (true);

-- Anon needs UPDATE on offertes for approval status change
-- This is done through server-side API, but if needed:
CREATE POLICY "Anon can update public offerte status"
  ON offertes FOR UPDATE
  TO anon
  USING (is_public = true)
  WITH CHECK (is_public = true);

-- ============================================================
-- ClickUp CRM Sync (Leads / Bedrijven / Contacten)
-- ============================================================

CREATE TABLE IF NOT EXISTS clickup_crm_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('daley_list', 'lead', 'company', 'contact', 'assignment', 'clickup_invoice')),
  clickup_task_id TEXT NOT NULL UNIQUE,
  clickup_list_id TEXT NOT NULL,
  clickup_space_id TEXT,
  clickup_folder_id TEXT,
  name TEXT NOT NULL,
  status TEXT,
  url TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  assignees JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  clickup_date_created TIMESTAMPTZ,
  clickup_date_updated TIMESTAMPTZ,
  due_date TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clickup_sync_state (
  integration TEXT PRIMARY KEY,
  last_full_sync_at TIMESTAMPTZ,
  last_successful_sync_at TIMESTAMPTZ,
  last_webhook_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clickup_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('manual', 'cron', 'webhook')),
  status TEXT NOT NULL CHECK (status IN ('started', 'success', 'error')),
  trigger_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS clickup_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL DEFAULT 'unknown',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_clickup_crm_entity_type ON clickup_crm_records(entity_type);
CREATE INDEX IF NOT EXISTS idx_clickup_crm_clickup_list_id ON clickup_crm_records(clickup_list_id);
CREATE INDEX IF NOT EXISTS idx_clickup_crm_active ON clickup_crm_records(active);
CREATE INDEX IF NOT EXISTS idx_clickup_sync_runs_started_at ON clickup_sync_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_clickup_webhook_events_received_at ON clickup_webhook_events(received_at DESC);

ALTER TABLE clickup_crm_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE clickup_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE clickup_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE clickup_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read clickup crm records"
  ON clickup_crm_records FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Auth users can read clickup sync state"
  ON clickup_sync_state FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Auth users can read clickup sync runs"
  ON clickup_sync_runs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Auth users can read clickup webhook events"
  ON clickup_webhook_events FOR SELECT
  TO authenticated
  USING (true);
