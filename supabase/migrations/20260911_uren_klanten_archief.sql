-- Klanten archiveren in de urenregistratie.
--
-- Een klant waar voorlopig geen uren voor geschreven worden hoort niet meer
-- tussen de tabs te staan, maar mag ook niet verdwijnen: de uren, projecten en
-- facturen blijven eraan hangen en moeten terug te halen zijn. Verwijderen is
-- daarvoor te grof, want dat gooit de regels weg.
--
-- Leeg = gewoon actief. Staat er een datum, dan is de klant gearchiveerd en
-- valt hij uit de lijst tot je hem terughaalt. De datum zelf is handig om te
-- zien sinds wanneer het stil ligt.

alter table uren_klanten
  add column if not exists gearchiveerd_op timestamptz;

create index if not exists idx_uren_klanten_gearchiveerd
  on uren_klanten (gearchiveerd_op);
