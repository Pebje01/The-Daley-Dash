-- Werkbank: het interne IT- en werkwijzehandboek.
--
-- Hoe de computer, de NAS, de servers en de vaste afspraken in elkaar zitten.
-- Begonnen als los document, hier naartoe gehaald zodat het bijgewerkt kan
-- worden zonder dat er code aan te pas komt.
--
-- Bewust NIET gefilterd op bedrijf. De NAS, de poorten en de serverafspraken
-- gelden voor Daley zelf, niet per bedrijf. Net als de belastingaangifte, het
-- CRM en de taken staat dit los van de bedrijfskiezer.
--
-- De kolom `status` is het hart van dit document en moet blijven bestaan:
--   nagekeken  = op de machine zelf gecontroleerd, hierop kun je bouwen
--   notities   = komt uit oude aantekeningen, nog niet nagemeten
--   openstaand = moet nog uitgezocht worden
-- Zonder dat onderscheid weet je bij een regel niet of hij te vertrouwen is,
-- en dan is een handboek gevaarlijker dan geen handboek.

create table if not exists werkbank_secties (
  id            uuid primary key default gen_random_uuid(),
  titel         text not null,
  inhoud        text not null default '',
  status        text not null default 'notities'
                check (status in ('nagekeken', 'notities', 'openstaand')),
  gecontroleerd_op date,
  volgorde      integer not null default 0,
  created_at    timestamptz not null default now(),
  bijgewerkt_op timestamptz not null default now()
);

create index if not exists idx_werkbank_volgorde on werkbank_secties (volgorde);

-- Bijwerken van bijgewerkt_op gebeurt in lib/supabase/werkbank.ts en niet in een
-- trigger, zodat een handmatige correctie in de SQL Editor de datum niet stiekem
-- verzet.

-- ── Startinhoud ────────────────────────────────────────────────
-- Alleen invoegen als de tabel nog leeg is, zodat het opnieuw draaien van deze
-- migratie geen dubbele secties oplevert of eigen aanpassingen overschrijft.

insert into werkbank_secties (titel, inhoud, status, gecontroleerd_op, volgorde)
select * from (values
(
  'NAS en backups',
  E'De Synology staat thuis in het netwerk en doet twee dingen: hij bewaart de handmatige kopie van de Developer map, en hij draait Photos, Plex en Synology Drive. Time Machine loopt daar los van.\n\n## Het apparaat\n\n| Onderdeel | Waarde |\n| --- | --- |\n| Model | Synology DS224+, Intel Celeron J4125, 4 kernen |\n| Systeem | DSM op Linux 4.4.302+ |\n| Adres | `192.168.178.67` |\n| SSH | poort `49155`, gebruiker `admin`, met sleutel |\n| Snelkoppeling | `ssh diskstation` (staat in `~/.ssh/config`) |\n| Opslag | `/volume1` plus twee USB volumes |\n\n## Waar de backup landt\n\nDrie shares hangen als netwerkschijf aan de Mac: `home`, `Documenten` en `Videos`. De Developer kopie staat in de eerste.\n\n`/volume1/homes/admin/Backup/MacBook-Pro-van-Daley.local/Users/daleyjansen_1/Developer`\n\nVia de Mac is dat `/Volumes/home/Backup/...`\n\n## node_modules gaat mee, en dat moet niet\n\nIn elk project op de NAS staat een volledige `node_modules`. Dat zijn mappen die met één commando terugkomen, dus ze horen niet in een backup.\n\nDe verhouding is het punt. Van de 270.118 bestanden in de Developer map zitten er 194.366 in `node_modules`. Dat is 72% van alle bestanden, maar maar 14% van de 23 GB. Een backup over SMB kost tijd per bestand, niet per gigabyte.\n\nOp de NAS staan er **41**, op de Mac nog maar **14**. De backup heeft ze dus opgespaard van projecten waar ze lokaal al weg zijn.\n\n## Afspraken\n\n1. Backup de Developer map, maar sluit `node_modules`, `.next`, `dist`, `build`, `.venv` en `DerivedData` uit.\n2. `.git` gaat wel mee, 2,2 GB. Daar zit de geschiedenis in.\n3. Sluit de backup share uit van de media-indexering in DSM.\n4. Time Machine gaat naar de losse Buffalo HD 1TB, niet naar de NAS. Twee gescheiden sporen.\n\n## De NAS bekijken zonder DSM\n\n- `ssh diskstation ''cat /proc/loadavg; uptime''` hoe druk is hij\n- `ssh diskstation ''df -h /volume1''` hoeveel ruimte is er nog\n- `ssh diskstation ''ps -eo stat,etime,comm | grep D''` wat wacht er op de schijf\n\nDe drie getallen van de load average zijn het gemiddelde over 1, 5 en 15 minuten. Vergelijk ze met 4, het aantal kernen. Wachten op de schijf telt net zo zwaar mee als rekenwerk, dus een hoog getal betekent bijna altijd drukke schijven en geen drukke processor.\n\nStart nooit meerdere zware zoekopdrachten tegelijk op de NAS. Ze vechten om dezelfde schijven en dan komt er van geen enkele een antwoord.',
  'nagekeken',
  date '2026-09-09',
  10
),
(
  'Vaste poorten',
  E'Elk project heeft een eigen poort, zodat twee dev servers elkaar nooit in de weg zitten. Deze nummers komen uit de `package.json` en `.claude/launch.json` van de projecten zelf.\n\n| Poort | Project | Soort |\n| --- | --- | --- |\n| 3000 | Montung website (Sanity CORS) | Next.js |\n| 3001 | NYC Planning | Next.js |\n| 3002 | Montung voorraad | Next.js |\n| 3003 | The Daley Dash | Next.js |\n| 3005 | The Daley Edit | Next.js |\n| 3006 | Daley Photography | Next.js |\n| 3007 | Meet the Locals | Next.js |\n| 3008 | Mindoor | Next.js |\n| 3009 | Sales Spark | Next.js |\n| 3013 | Nova Studio website | Next.js |\n| 3020 | macro tracker, het eetdagboek | Next.js |\n| 4010 | Duplifind | web |\n| 4323 | TypTalk landing | Astro |\n| 4325 | PGS Housing | Astro |\n| 4326 | Hairless & Skin | Astro |\n| 4328 | Fitness de Kloek | Astro |\n| 4329 | Van Rijn Works | Astro |\n| 8080 | PGS Housing moodboard | python http.server |\n| 8087 | Home Exchange gids | python http.server |\n| 8000 | Gereserveerd voor Hetzner | niet gebruiken |\n\n## Hier zit drift in\n\n- **4321** staat in de launch bestanden van Fitness de Kloek, Richard Hoofs en Van Rijn Works tegelijk. De standaardpoort van Astro die drie keer is blijven staan.\n- **3005** staat zowel bij The Daley Edit als bij We Grow Brands.\n- **3006** bij Daley Photography en Nova Studio, **3008** bij Mindoor en Nova Facturatie, **3010** bij Wilfred Mooij en een tweede Montung ingang.\n- Sales Spark staat op **3009** in `package.json` maar op **3016** in `launch.json`.\n\n## Afspraken\n\n1. Zet de poort in `package.json` als `next dev -p XXXX`, niet alleen in `launch.json`. Anders krijg je een ander nummer vanuit de terminal dan vanuit de editor.\n2. Nooit uit jezelf een dev server starten, en maximaal één per project. Er heeft ooit acht dagen een spookserver op 3012 een hele processorkern opgegeten.\n3. Nieuw project? Pak het eerstvolgende vrije nummer en zet het meteen in deze lijst.',
  'nagekeken',
  date '2026-09-09',
  20
),
(
  'Hosting en domeinen',
  E'Dit komt uit oudere aantekeningen en is nog niet nagemeten op de servers zelf. Controleer het voor je erop bouwt.\n\n| Onderdeel | Waarde |\n| --- | --- |\n| Server | Hetzner VPS, `178.104.41.26`, root login |\n| Deployment | Coolify op die VPS, beheert de Next.js sites |\n| Uitrollen | Automatisch via GitHub webhook bij een push naar `main`. Niet handmatig triggeren. |\n| Mail | Hostinger, plus AhaSend voor mail vanuit websites |\n| Domeinen | Deels Hostinger, deels TransIP |\n| Database | Supabase, organisatie op `info@montung.nl` voor Montung |\n\n## Bij elk nieuw websiteproject\n\n1. AhaSend instellen voor uitgaande mail.\n2. Contactformulier krijgt altijd een database fallback, zodat een inzending nooit verdwijnt als de mail hapert.\n3. UptimeRobot erop zetten voor monitoring.',
  'notities',
  null,
  30
),
(
  'Sleutels en wachtwoorden',
  E'Niets van dit alles staat in dit document, en dat blijft zo. Hier staat alleen waar het te vinden is.\n\n- **Notion** is de plek voor WordPress app passwords, API keys en serverlogins. Daar eerst kijken.\n- **TransIP** private key staat in `~/.config/transip/`, aangewezen via `TRANSIP_PRIVATE_KEY_FILE`. Niet in de scripts zelf.\n- **Gemini key** voor beeldwerk staat in `~/.config/gemini/thedaleyedit.env`.\n- **Coolify** bewaart de gevoelige waarden als omgevingsvariabelen, private keys base64 gecodeerd.\n- **De NAS** gaat via een SSH sleutel, dus daar hoeft geen wachtwoord doorheen.\n\n## Afspraak\n\nSleutels horen in een keychain, een env bestand buiten de repo, of in Notion. Nooit in code, nooit in een commit, nooit los in een tekstbestandje in de projectmap.',
  'notities',
  null,
  40
),
(
  'Werkafspraken',
  E'## Schrijven\n\n- Geen lange streepjes. Overal, in elk project. Een komma, een punt, een dubbele punt of een pipe doet het net zo goed.\n- Zo min mogelijk gewone koppelstreepjes in lopende tekst. Alleen bij samenstellingen die het echt nodig hebben.\n- Montung schrijft semi zakelijk en altijd in de je vorm, nooit "u".\n- Sales Spark staat in de ik vorm, ook in de SEO teksten. Klantcitaten blijven derde persoon.\n\n## Samenwerken met Claude\n\n- Eerst overleggen, dan pas wijzigen. Geen aanpassingen zonder akkoord.\n- Bij een repo eerst de `CLAUDE.md` lezen voor er iets gebeurt.\n- Beeld dat gegenereerd wordt meteen laten zien en direct in de goede map zetten.\n- Afbeeldingen standaard onder de 4 MB houden.\n\n## Facturen\n\n- Elke factuurskill schrijft ook de regels weg, anders werkt de editor en het opslaan als PDF niet. Montung is de uitzondering, dat heeft een eigen systeem.\n- Het factuurnummer volgt de factuurdatum. Nog niet verstuurde facturen krijgen een losse C nummering en blijven buiten de synchronisatie.\n- Omzet boeken op factuurdatum, BTW op betaaldatum.',
  'nagekeken',
  date '2026-09-09',
  50
),
(
  'Nog aan te vullen',
  E'Plekken waar nu nog een gat zit.\n\n- Wat er precies op de Hetzner VPS draait, en hoe daar veilig bij te komen.\n- Het wekelijkse beveiligingsscript: wat het controleert en wat er met de uitkomst gebeurt.\n- Welk domein bij Hostinger staat en welk bij TransIP, met de vervaldatums erbij.\n- Herstelplan. Wat te doen als de Mac vandaag stukgaat, en in welke volgorde.\n- De vaste mappenstructuur voor klantwerk, en waar Downloads ophoudt en Documenten begint.\n- Welke apps op de Mac echt nodig zijn, en welke er alleen maar staan.',
  'openstaand',
  null,
  60
)
) as seed(titel, inhoud, status, gecontroleerd_op, volgorde)
where not exists (select 1 from werkbank_secties);
