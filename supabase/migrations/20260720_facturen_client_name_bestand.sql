-- Voegt `client_name_bestand` toe aan facturen: een optionele, korte/schone naam
-- voor bestandsnamen (PDF/HTML), los van `client_name` dat op de factuur zelf
-- (adresblok) staat. Sommige skills (tde-factuur, daley-factuur) vroegen al om
-- een aparte "klantNaamVoorBestand" bij het aanmaken, maar die werd nooit
-- opgeslagen. Daardoor gebruikte de Daley Dash bij regenereren altijd de volle
-- `client_name` (kan lang zijn, met leestekens), wat een ander bestand opleverde
-- dan het origineel door de skill aangemaakte bestand. NULL valt terug op
-- client_name (huidig gedrag, geen wijziging voor bestaande facturen).
alter table public.facturen
  add column if not exists client_name_bestand text;
