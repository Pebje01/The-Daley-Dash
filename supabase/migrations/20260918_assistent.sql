-- De assistent in de Dash: gesprekken, berichten en voorstellen.
--
-- De assistent (Claude via de lokale CLI) mag facturen voorstellen, maar voert
-- zelf niets uit. Elk voorstel komt als kaart in de chat en gebeurt pas als
-- Daley op de knop klikt. Daarom staan voorstellen in een eigen tabel met een
-- status: de knop voert alleen een voorstel uit dat nog open staat, en een
-- voorstel kan maar één keer uitgevoerd worden.

create table if not exists assistent_gesprekken (
  id uuid primary key default gen_random_uuid(),
  -- Sessie-id van de claude CLI, om het gesprek met --resume voort te zetten
  claude_sessie_id text,
  titel text,
  -- Pagina waar het gesprek begon, als context
  pagina text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists assistent_berichten (
  id uuid primary key default gen_random_uuid(),
  gesprek_id uuid not null references assistent_gesprekken(id) on delete cascade,
  -- gebruiker | assistent | voorstel | systeem
  rol text not null,
  inhoud jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_assistent_berichten_gesprek
  on assistent_berichten (gesprek_id, created_at);

create table if not exists assistent_voorstellen (
  id uuid primary key default gen_random_uuid(),
  gesprek_id uuid references assistent_gesprekken(id) on delete cascade,
  -- factuur_nieuw | factuur_wijzigen | factuur_pdf | factuur_koppelen
  type text not null,
  -- Wat de assistent voorstelt, zoals hij het aanleverde
  payload jsonb not null,
  -- Nagerekend door de Dash: bedragen, verwacht nummer, waarschuwingen
  controle jsonb,
  status text not null default 'open'
    -- bezig: de knop is ingedrukt en de actie loopt, zodat een dubbelklik niets dubbel doet
    check (status in ('open', 'bezig', 'uitgevoerd', 'geannuleerd', 'mislukt')),
  resultaat jsonb,
  -- Of de assistent al gehoord heeft wat Daley met dit voorstel deed
  gemeld boolean not null default false,
  created_at timestamptz not null default now(),
  uitgevoerd_op timestamptz
);

create index if not exists idx_assistent_voorstellen_gesprek
  on assistent_voorstellen (gesprek_id, created_at);

-- Net als de andere tabellen: RLS aan zonder policies. De Dash leest en
-- schrijft server-side met de secret key, de browser komt er nooit direct bij.
alter table assistent_gesprekken enable row level security;
alter table assistent_berichten enable row level security;
alter table assistent_voorstellen enable row level security;
