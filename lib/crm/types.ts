/**
 * Entiteiten in het CRM. Alles staat in één tabel (`clickup_crm_records`) met
 * `entity_type` als onderscheid.
 *
 * De naam ClickUp zit nog in de tabelnaam en de veldformaten, dat is de erfenis
 * van de eenmalige import. De koppeling is in juni 2026 losgehaald en in
 * september 2026 helemaal uit de Dash verwijderd: Supabase is de enige bron.
 *
 * `daley_list` is er niet meer. Dat was in de praktijk een takenlijst, die is
 * overgezet naar de `taken`-tabel. Er staan geen records met dat type meer in de
 * database, dus de dode waarde is nu ook uit de union gehaald.
 */
export type CrmEntityType =
  | 'lead'
  | 'ruwe_lead'
  | 'company'
  | 'contact'
  | 'assignment'
  | 'clickup_invoice'

export const CRM_ENTITY_TYPES: CrmEntityType[] = [
  'lead',
  'ruwe_lead',
  'company',
  'contact',
  'assignment',
  'clickup_invoice',
]
