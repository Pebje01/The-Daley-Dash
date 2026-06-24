-- Notion-stijl labels (tags) voor CRM bedrijven in The Daley Dash.
-- Eigen tagging in de Dash zelf, los van de ClickUp-sync.

-- Catalogus van beschikbare tags (gedeeld over alle bedrijven), Notion-stijl.
-- kleur = Notion-kleurnaam (gray, brown, orange, yellow, green, blue, purple, pink, red).
create table if not exists crm_dash_tags (
  id uuid primary key default gen_random_uuid(),
  naam text not null unique,
  kleur text not null default 'gray',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Geselecteerde tags per record (array van tag-id's als JSONB).
-- Staat op clickup_crm_records en blijft behouden bij ClickUp-sync,
-- omdat de sync-upsert (onConflict clickup_task_id) deze kolom niet meestuurt.
alter table clickup_crm_records
  add column if not exists dash_tags jsonb not null default '[]'::jsonb;

-- Seed: de 14 labels met overgenomen Notion-kleuren.
insert into crm_dash_tags (naam, kleur, sort_order) values
  ('Baby',            'pink',   1),
  ('Retail',          'gray',   2),
  ('Local',           'gray',   3),
  ('Photography',     'gray',   4),
  ('HoReCa',          'red',    5),
  ('Food/Product',    'purple', 6),
  ('Charity/NGO',     'brown',  7),
  ('Animals',         'orange', 8),
  ('Financial',       'blue',   9),
  ('Tech/AI',         'gray',   10),
  ('Travel',          'yellow', 11),
  ('Sports',          'green',  12),
  ('Media & Creative','blue',   13),
  ('Diensten',        'gray',   14)
on conflict (naam) do nothing;
