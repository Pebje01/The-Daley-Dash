import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SCHEMA_SQL = `
-- Tabel: offertes
CREATE TABLE IF NOT EXISTS offertes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number TEXT UNIQUE NOT NULL,
  company_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_contact_person TEXT,
  client_email TEXT,
  client_phone TEXT,
  client_address TEXT,
  client_kvk TEXT,
  client_btw TEXT,
  date DATE NOT NULL,
  valid_until DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'concept',
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  btw_percentage DECIMAL(5,2) NOT NULL DEFAULT 21,
  btw_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  total DECIMAL(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  slug TEXT UNIQUE,
  password_hash TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  approved_at TIMESTAMPTZ,
  approved_by_name TEXT,
  approved_by_email TEXT,
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
`

export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const results: { step: string; success: boolean; error?: string }[] = []

  // Execute schema SQL via rpc or direct query
  // Since we can't run raw DDL through the client, we'll test if tables exist
  // by trying to select from them

  // Test if tables already exist
  const { error: testError } = await supabase.from('offertes').select('id').limit(1)

  if (!testError) {
    return NextResponse.json({
      message: 'Tabellen bestaan al! Setup is niet nodig.',
      tables: ['offertes', 'line_items', 'offerte_approvals'],
    })
  }

  // Tables don't exist yet - the user needs to run the SQL manually
  return NextResponse.json({
    message: 'Tabellen bestaan nog niet. Voer de SQL uit in Supabase Dashboard > SQL Editor.',
    instructions: [
      '1. Ga naar https://supabase.com/dashboard',
      '2. Open je project',
      '3. Klik links op "SQL Editor"',
      '4. Plak de SQL hieronder en klik "Run"',
    ],
    sql: SCHEMA_SQL,
    rls_sql: `
-- RLS policies
ALTER TABLE offertes ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE offerte_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users full access on offertes" ON offertes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users full access on line_items" ON line_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users full access on offerte_approvals" ON offerte_approvals FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anon can read public offertes" ON offertes FOR SELECT TO anon USING (is_public = true);
CREATE POLICY "Anon can read line items of public offertes" ON line_items FOR SELECT TO anon USING (EXISTS (SELECT 1 FROM offertes WHERE offertes.id = line_items.offerte_id AND offertes.is_public = true));
CREATE POLICY "Anon can insert approvals" ON offerte_approvals FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update public offerte status" ON offertes FOR UPDATE TO anon USING (is_public = true) WITH CHECK (is_public = true);
    `,
  }, { status: 400 })
}
