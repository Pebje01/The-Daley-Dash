-- Leads benaderen vanuit de Dash, versturen via Spark.
--
-- De Dash schrijft een eerste mail (AI, in Daley's toon), Daley past hem aan en
-- opent hem als nieuw bericht in Spark. Daar verstuurt ze hem zelf. De Dash kijkt
-- daarna in de verzonden mail van Spark of hij de deur uit is, en legt dan het
-- contactmoment vast. Mails die Daley zelf aan een lead stuurt, zonder concept,
-- komen hier ook in: status 'verstuurd' met een lege tekst.
--
-- Reacties van een lead komen er ook in, met richting 'in' en status 'ontvangen'.
-- `gezien_op` zegt of Daley de reactie heeft afgehandeld.
--
-- Eén rij per poging. Een oud concept blijft staan met status 'geannuleerd' of
-- 'verstuurd', zodat je later nog ziet wat er gestuurd is.

create table if not exists crm_mail_concepten (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references clickup_crm_records(id) on delete cascade,
  -- Het Spark-account waarmee hij verstuurd wordt, bijvoorbeeld hello@thedaleyedit.nl
  -- uit: Daley mailt de lead | in: de lead mailt terug
  richting text not null default 'uit' check (richting in ('uit', 'in')),
  account text,
  aan text,
  -- Bij een reactie: het adres waar hij vandaan kwam
  van text,
  onderwerp text not null default '',
  tekst text not null default '',
  -- concept: nog in de Dash | in_spark: geopend in Spark |
  -- verstuurd: gevonden in de verzonden mail | geannuleerd: weggegooid |
  -- ontvangen: een reactie van de lead
  status text not null default 'concept'
    check (status in ('concept', 'in_spark', 'verstuurd', 'geannuleerd', 'ontvangen')),
  in_spark_op timestamptz,
  -- Moment van versturen, of bij een reactie het moment van binnenkomen
  verstuurd_op timestamptz,
  gezien_op timestamptz,
  -- Id van de verzonden mail in Spark: voorkomt dat dezelfde mail twee keer telt
  spark_bericht_id text,
  laatst_gecontroleerd_op timestamptz,
  ai_model text,
  aangemaakt_op timestamptz not null default now(),
  bijgewerkt_op timestamptz not null default now()
);

create index if not exists idx_crm_mail_concepten_record on crm_mail_concepten (record_id, aangemaakt_op desc);
create index if not exists idx_crm_mail_concepten_open on crm_mail_concepten (status) where status = 'in_spark';
create index if not exists idx_crm_mail_concepten_reacties on crm_mail_concepten (record_id) where richting = 'in' and gezien_op is null;
create unique index if not exists idx_crm_mail_concepten_bericht on crm_mail_concepten (spark_bericht_id) where spark_bericht_id is not null;

alter table crm_mail_concepten enable row level security;
