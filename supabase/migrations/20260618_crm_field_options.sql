-- Centrale optielijst voor CRM-keuzevelden (labels / drop_down) in The Daley Dash.
-- Tot nu toe droeg elk record een eigen kopie van de optielijst mee in
-- custom_fields[].type_config.options (erfenis van de ClickUp-sync). Daardoor
-- moest een nieuwe optie zoals "Overig" in alle records tegelijk. Met deze
-- centrale tabel staat de lijst nog maar op één plek; records houden enkel hun
-- gekozen waarde (labels: option-id, drop_down: orderindex), die onveranderd blijft.

create table if not exists crm_field_options (
  id text primary key,             -- option-id; voor labels gelijk aan de ClickUp-id zodat bestaande waarden blijven matchen
  field_id text not null,          -- ClickUp custom field-id (gelijk over alle records van een type)
  entity_type text,
  field_name text,
  field_type text not null,        -- 'labels' | 'drop_down'
  label text not null,
  color text,
  orderindex int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists crm_field_options_field_id_idx on crm_field_options (field_id);

-- Seed: bestaande opties uit de per-record kopieën centraliseren (onthoudt de huidige lijst).
insert into crm_field_options (id, field_id, entity_type, field_name, field_type, label, color, orderindex)
select distinct on (opt->>'id')
  opt->>'id'                                   as id,
  f->>'id'                                     as field_id,
  r.entity_type                                as entity_type,
  f->>'name'                                   as field_name,
  f->>'type'                                   as field_type,
  coalesce(opt->>'label', opt->>'name', '')    as label,
  opt->>'color'                                as color,
  coalesce((opt->>'orderindex')::int, 0)       as orderindex
from clickup_crm_records r
  cross join lateral jsonb_array_elements(coalesce(r.custom_fields, '[]'::jsonb)) as f
  cross join lateral jsonb_array_elements(coalesce(f->'type_config'->'options', '[]'::jsonb)) as opt
where f->>'type' in ('labels', 'drop_down')
  and opt->>'id' is not null
order by opt->>'id', r.entity_type
on conflict (id) do nothing;

-- "Overig" als centrale extra keuze voor het Beroep-veld (contacten). Idempotent.
insert into crm_field_options (id, field_id, entity_type, field_name, field_type, label, color, orderindex)
select
  gen_random_uuid()::text,
  '0244bd83-96bb-4130-908c-22cdde05a8fd',
  'contact', 'Beroep', 'labels', 'Overig', '#9a9a9a',
  coalesce((select max(orderindex) from crm_field_options where field_id = '0244bd83-96bb-4130-908c-22cdde05a8fd'), -1) + 1
where not exists (
  select 1 from crm_field_options
  where field_id = '0244bd83-96bb-4130-908c-22cdde05a8fd' and lower(label) = 'overig'
);
