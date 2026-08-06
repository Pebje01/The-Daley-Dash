-- clickup_crm_records_entity_type_check stond niet in de migratiegeschiedenis
-- (hoorde bij het initiele schema) en kende 'ruwe_lead' nog niet. Zonder deze
-- migratie weigert de database elke insert met entity_type = 'ruwe_lead'.

ALTER TABLE clickup_crm_records DROP CONSTRAINT clickup_crm_records_entity_type_check;

ALTER TABLE clickup_crm_records
  ADD CONSTRAINT clickup_crm_records_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    'daley_list'::text, 'lead'::text, 'ruwe_lead'::text, 'company'::text,
    'contact'::text, 'assignment'::text, 'clickup_invoice'::text
  ]));
