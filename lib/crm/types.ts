/**
 * Entiteiten in het CRM. Alles staat in één tabel (`clickup_crm_records`) met
 * `entity_type` als onderscheid.
 *
 * De naam ClickUp zit nog in de tabelnaam en de veldformaten, maar de koppeling
 * is in juni 2026 losgehaald: Supabase is de bron. Dit type woont daarom hier en
 * niet meer in `lib/clickup/config.ts`.
 *
 * `daley_list` is er niet meer. Dat was in de praktijk een takenlijst, die is
 * overgezet naar de `taken`-tabel. Er staan geen records met dat type meer in de
 * database, dus de dode waarde is nu ook uit de union gehaald.
 */
export type CrmEntityType =
  | 'lead'
  | 'company'
  | 'contact'
  | 'assignment'
  | 'clickup_invoice'

export const CRM_ENTITY_TYPES: CrmEntityType[] = [
  'lead',
  'company',
  'contact',
  'assignment',
  'clickup_invoice',
]
