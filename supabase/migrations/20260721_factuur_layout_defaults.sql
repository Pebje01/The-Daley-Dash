-- Bedrijfsbrede standaardindeling voor de sleepbare factuur-editor: één rij per
-- company_id met de blokposities (mm) die nieuwe facturen van dat bedrijf
-- automatisch moeten krijgen, zodat je niet elke factuur opnieuw hoeft te
-- verslepen.
--
-- Een BEFORE INSERT trigger op `facturen` past dit automatisch toe zodra een
-- nieuwe factuur wordt aangemaakt zonder eigen `layout_overrides`. Dit werkt op
-- databaseniveau, dus voor ALLE aanmaakwegen (de Daley Dash-app, maar ook de
-- losse curl-inserts vanuit de factuur-skills), zonder dat elke skill dit apart
-- hoeft te implementeren.
create table if not exists public.factuur_layout_defaults (
  company_id text primary key,
  layout_overrides jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.factuur_layout_defaults enable row level security;

create or replace function public.apply_default_layout_overrides()
returns trigger as $$
begin
  if new.layout_overrides is null then
    select layout_overrides into new.layout_overrides
    from public.factuur_layout_defaults
    where company_id = new.company_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_apply_default_layout_overrides on public.facturen;
create trigger trg_apply_default_layout_overrides
  before insert on public.facturen
  for each row
  execute function public.apply_default_layout_overrides();
