-- Uren-klanten hangen aan een CRM-bedrijf.
--
-- De pagina Klanten is opgegaan in CRM > Bedrijven: een klant is een bedrijf,
-- en de contactpersonen staan bij Contacten. Een rij in uren_klanten is nu
-- alleen nog de uren- en factuurkant van een bedrijf: uurtarief, klantnummer
-- en het adres dat op de urenfactuur komt.
--
-- De oude koppeling crm_bedrijf_id wijst naar de legacy-tabel crm_bedrijven,
-- een eenmalige import die niet meer wordt bijgewerkt. Deze kolom wijst naar
-- het echte CRM-bedrijf in clickup_crm_records. crm_bedrijf_id blijft staan
-- maar wordt niet meer gebruikt.

alter table uren_klanten
  add column if not exists crm_record_id uuid references clickup_crm_records(id) on delete set null;

-- Eén uren-klant per bedrijf
create unique index if not exists uren_klanten_crm_record_id_uniek
  on uren_klanten (crm_record_id)
  where crm_record_id is not null;

-- Bestaande klanten koppelen. Eerst op naam (hoofdletters en spaties maken niet
-- uit), dan via de naam van het oude legacy-bedrijf. Bij twee CRM-bedrijven met
-- dezelfde naam wint het oudste, en een bedrijf dat al gekoppeld is slaan we over.
update uren_klanten k
set crm_record_id = (
  select r.id from clickup_crm_records r
  where r.entity_type = 'company'
    and lower(trim(r.name)) = lower(trim(k.naam))
    and not exists (select 1 from uren_klanten x where x.crm_record_id = r.id)
  order by r.created_at
  limit 1
)
where k.crm_record_id is null;

update uren_klanten k
set crm_record_id = (
  select r.id from clickup_crm_records r
  join crm_bedrijven b on lower(trim(b.naam)) = lower(trim(r.name))
  where r.entity_type = 'company'
    and b.id = k.crm_bedrijf_id
    and not exists (select 1 from uren_klanten x where x.crm_record_id = r.id)
  order by r.created_at
  limit 1
)
where k.crm_record_id is null and k.crm_bedrijf_id is not null;

-- Eén klantnummer hoort bij één bedrijf. Fitness de Kloek stond eerst als
-- FKL001 op de facturen en als FKL003 in het CRM; dit voorkomt dat het
-- andersom ook kan: twee bedrijven met hetzelfde nummer.
create unique index if not exists uren_klanten_klantnummer_uniek
  on uren_klanten (klantnummer)
  where klantnummer is not null and klantnummer <> '';
