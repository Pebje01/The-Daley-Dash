-- Automatische bankkoppeling via GoCardless Bank Account Data (PSD2).
-- Vervangt het handmatig exporteren en uploaden van de Knab-CSV per kwartaal.
--
-- Uitvoeren via Supabase Dashboard > SQL Editor.
--
-- Twee wijzigingen:
--   1) Een tabel die onthoudt welke koppeling actief is en tot wanneer.
--   2) Een kolom `bron` op btw_bank_transactie, zodat we CSV-regels en
--      automatisch opgehaalde regels uit elkaar kunnen houden.
--
-- RLS staat aan zonder policies: alleen de server-side service-key komt erbij,
-- consistent met de lockdown-migratie 20260625.

-- 1) Actieve bankkoppeling
create table if not exists public.bank_koppeling (
  id uuid primary key default gen_random_uuid(),
  bank text not null default 'Knab',
  institution_id text not null,              -- bijv. KNAB_KNABNL2H
  requisition_id text not null unique,       -- de koppeling bij GoCardless
  agreement_id text,
  account_ids text[] not null default '{}',  -- rekeningen die eronder vallen
  ibans text[] not null default '{}',
  status text not null default 'wacht_op_goedkeuring',
    -- 'wacht_op_goedkeuring' | 'actief' | 'verlopen' | 'ingetrokken'
  geldig_tot timestamptz,                    -- einde van de PSD2-toestemming
  laatste_sync timestamptz,
  laatste_fout text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bank_koppeling_status on public.bank_koppeling(status);

alter table public.bank_koppeling enable row level security;

-- 2) Herkomst van een banktransactie
-- Bestaande regels komen allemaal uit de handmatige CSV-import, vandaar de default.
alter table public.btw_bank_transactie
  add column if not exists bron text not null default 'csv';
    -- 'csv' | 'gocardless'

comment on column public.btw_bank_transactie.bron is
  'csv = handmatige Knab-export, gocardless = automatische PSD2-sync';

-- De sync ontdubbelt op referentie, maar een CSV-regel en een GoCardless-regel
-- van dezelfde betaling hebben verschillende referenties. Deze index maakt de
-- extra controle op datum, bedrag en richting snel genoeg om per run te doen.
create index if not exists idx_btw_bank_dedup
  on public.btw_bank_transactie(datum, bedrag, credit_debet);
