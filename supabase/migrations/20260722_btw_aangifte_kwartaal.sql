-- BTW-aangifte per kwartaal (zakelijk), los van de jaarlijkse IB-aangifte
-- (belasting_aangifte). Drie tabellen: een hoofdrecord per kwartaal, de
-- geimporteerde Knab-banktransacties, en kostenposten voor de voorbelasting.
--
-- Koppeling via de tekstsleutel `kwartaal` in formaat '2026-Q2'.
-- RLS staat aan zonder policies: alleen de server-side service-key komt erbij,
-- consistent met de lockdown-migratie 20260625.

-- 1) Hoofdrecord per kwartaal
create table if not exists public.btw_aangifte (
  id uuid primary key default gen_random_uuid(),
  kwartaal text not null unique,             -- '2026-Q2'
  jaar int not null,
  kwartaalnummer int not null check (kwartaalnummer between 1 and 4),
  status text not null default 'concept',    -- 'concept' | 'ingediend'
  notities text,
  ingediend_op timestamptz,

  -- Correctie vorige periode (bijv. vergeten omzet), onder EUR 1.000 in deze
  -- aangifte meegenomen i.p.v. een aparte suppletie.
  correctie_omzet_excl numeric(12,2) not null default 0,
  correctie_btw numeric(12,2) not null default 0,
  correctie_toelichting text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Geimporteerde banktransacties (Knab)
create table if not exists public.btw_bank_transactie (
  id uuid primary key default gen_random_uuid(),
  kwartaal text not null,
  referentie text unique,                    -- Knab 'Referentie', dedup-sleutel
  datum date not null,
  bedrag numeric(12,2) not null,             -- altijd positief; richting via credit_debet
  credit_debet text not null,                -- 'C' (bij) | 'D' (af)
  tegenrekening text,
  tegenrekeninghouder text,
  omschrijving text,
  betaalwijze text,

  -- Auto-classificatie, door de gebruiker overschrijfbaar
  categorie text not null default 'onbekend',
    -- 'omzet' | 'zakelijke_kost' | 'kosten_retour' | 'btw_afdracht'
    -- | 'intern_spaarpot' | 'prive_overboeking' | 'prive_lening' | 'prive_overig' | 'onbekend'
  categorie_handmatig boolean not null default false,

  -- Omzet-koppeling aan een factuur
  factuur_id uuid references public.facturen(id) on delete set null,
  factuur_nummer text,                       -- herkend nummer uit de omschrijving

  created_at timestamptz not null default now()
);
create index if not exists idx_btw_bank_kwartaal on public.btw_bank_transactie(kwartaal);

-- 3) Kostenposten voor de voorbelasting (inkoopfacturen)
create table if not exists public.btw_kostenpost (
  id uuid primary key default gen_random_uuid(),
  kwartaal text not null,
  leverancier text not null,
  datum date,
  bedrag_incl numeric(12,2) not null default 0,
  bedrag_excl numeric(12,2) not null default 0,
  btw_bedrag numeric(12,2) not null default 0,
  btw_behandeling text not null default 'nl_21',
    -- 'nl_21' | 'nl_9' | 'verlegd' | 'vrij' | 'geen'
  land text,
  categorie text,
  aftrekbaar_pct numeric(5,2) not null default 100,   -- deels-zakelijk (bijv. telefoon)
  bron text,                                 -- bestandsnaam / 'mail' / 'handmatig'
  bron_transactie_id uuid references public.btw_bank_transactie(id) on delete set null,
  notitie text,
  created_at timestamptz not null default now()
);
create index if not exists idx_btw_kosten_kwartaal on public.btw_kostenpost(kwartaal);

-- RLS: aan, zonder policies (alleen service-key)
alter table public.btw_aangifte enable row level security;
alter table public.btw_bank_transactie enable row level security;
alter table public.btw_kostenpost enable row level security;
