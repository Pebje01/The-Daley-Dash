-- Waarom een lead is afgesloten.
--
-- Een lead die op Archief komt is niets geworden, en dan wil je over een jaar
-- nog kunnen zien waarom: geen reactie, te duur, andere partij, geen budget.
-- De blokkadereden staat al in contact_status_reden; die gaat over de relatie,
-- deze over dit ene stuk werk.

alter table clickup_crm_records
  add column if not exists afsluit_reden text;
