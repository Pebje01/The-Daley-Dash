# The Daley Dash Portal

## Project
- Next.js 14 + TypeScript + Tailwind CSS + Supabase
- Taal: Nederlands (UI, comments, variabelen mogen Engels)
- Path alias: `@/*` verwijst naar project root
- Huisstijl: zie @/tailwind.config.ts voor kleuren, fonts en spacing tokens

## Data (BELANGRIJK)
- **Supabase is de single source of truth** voor alle bedrijfsdata
- Offertes, facturen, klanten en line items worden ALTIJD via Supabase opgeslagen en ingelezen
- Lokale bestanden (Excel, PDF) zijn alleen exports — Supabase is leidend
- Bij het toevoegen van offertes/facturen: altijd via Supabase API of dashboard, nooit alleen lokaal
- Omzet berekeningen zijn gebaseerd op goedgekeurde offertes (status `akkoord`) in Supabase

## Structuur
```
app/
├── (auth)/login/           # Login pagina (Supabase auth)
├── (dashboard)/            # Beschermd achter auth middleware
│   ├── page.tsx            # Dashboard homepage (KPI's, pipeline, CRM-strip)
│   ├── layout.tsx          # Sidebar + page background
│   ├── offertes/           # Offertes overzicht + detail
│   ├── facturen/           # Facturen overzicht + detail
│   ├── betalingen/         # Betalingen (vereist betalingen-tabel, zie migrations)
│   ├── abonnementen/       # Abonnementen + MRR
│   ├── klanten/            # Urenregistratie-klanten (uren_klanten)
│   ├── taken/              # Taken kanban
│   ├── uren/               # Urenregistratie
│   ├── belasting/          # BTW-rapportage + aangifte voorbereiding
│   ├── crm/                # CRM-module (zie hieronder)
│   │   ├── leads/ bedrijven/ contacten/ opdrachten/ facturen/ blocklist/
│   └── crm-sync/           # ClickUp sync status + handmatige sync
├── api/
│   ├── crm/                # relations (id-based), stats, bedrijven (lite, voor uren-FK)
│   ├── integrations/clickup/  # sync, cron, webhook, records CRUD, promote
│   └── ...                 # offertes, facturen, uren, taken, betalingen, etc.
├── o/[slug]/ + offerte/[id]/  # Publieke offertepagina's
├── fonts/                  # Geist (sans) + Uxum (serif)
└── globals.css             # Tailwind + component classes (card, btn, input, pill)
components/
├── ClickUpCrmRecordsPage.tsx  # Generieke CRM-pagina (lijst/board/detail/bulk)
├── Sidebar.tsx, StatusBadge.tsx, DrawerHost/DrawerContext, ...
lib/
├── clickup/                # ClickUp API client, sync, config (lijst-id's uit env)
├── supabase/               # Per-tabel data-helpers + client/server/middleware
├── companies.ts            # Bedrijfsconfiguratie (TDE, WGB, daleyphotography)
├── types.ts                # TypeScript types
└── pdf/                    # Offerte/factuur PDF-generatie
scripts/
├── run-dash.sh             # LaunchAgent start-script (com.daley.daleydash, poort 3003)
└── fix-data-audit.mjs      # Datafixes uit audit 2026-06-09 (dry-run / --apply)
supabase/migrations/        # SQL-migraties (handmatig uitvoeren in SQL Editor)
middleware.ts               # Auth redirect middleware
```

## CRM-module (BELANGRIJK)

### Architectuur: één source of truth
- **Supabase is de bron** voor CRM-data (leads, bedrijven, contacten, opdrachten, facturatie). ClickUp is losgekoppeld (juni 2026) en dient alleen nog als archief.
- **"Daley Jansen's List" bestaat niet meer** (juli 2026): dat was het `daley_list` entity-type, maar in de praktijk een takenlijst. De openstaande items zijn overgezet naar de `taken`-tabel (`/taken`) en het CRM-onderdeel + de route `/crm/daley-list` zijn verwijderd. De `taken`-tabel is dé to-do lijst; het `daley_list` entity-type blijft alleen als dode waarde in de EntityType-union staan.
- Alle data staat in de tabel **`clickup_crm_records`** (alle entiteiten in één tabel, met `entity_type`, `clickup_task_id`, `custom_fields` JSON). Records aangemaakt na de loskoppeling hebben `clickup_task_id` met prefix `local-`.
- Schrijven gaat via **`lib/crm/store.ts`** (create/update/delete/promote), rechtstreeks naar Supabase. Veldformaten blijven ClickUp-compatibel: drop_down = orderindex, relaties = array van task-stubs, labels = array van option-ids.
- **ClickUp-sync is uitgeschakeld:** de routes cron/sync/webhook onder `/api/integrations/clickup/` geven 410. NOOIT opnieuw activeren; een sync zou lokale wijzigingen overschrijven. De oude synccode in `lib/clickup/sync.ts` wordt niet meer aangeroepen.
- **Relaties** (bedrijf <-> contact <-> lead <-> opdracht) zitten in custom fields van het type `tasks`/`list_relationship`. `/api/crm/relations?id=...` leidt ze in beide richtingen af uit `clickup_crm_records`. NIET de legacy-tabellen gebruiken.
- **Legacy-tabellen** `crm_bedrijven`, `crm_contacten`, `crm_leads`, `crm_opdrachten`, `crm_facturatie` zijn een eenmalige import en worden NIET bijgewerkt. Enige actieve rol: `uren_klanten.crm_bedrijf_id` verwijst naar `crm_bedrijven` (uren-koppeling). Bouw er geen nieuwe features op.

### Leadfases en opvolging (juli 2026)
- **Fases van leads staan in `lib/crm/pipeline.ts`**, niet meer in ClickUp. Bordkolommen: Nieuwe kans, Benaderd, In gesprek, Offerte uit, Later opvolgen, Gewonnen, Niets uitgekomen, Verloren. Oude statussen (on hold, klant on hold, blacklist, archief) blijven bestaan maar staan achter "Toon afgesloten fases".
- De route `/api/crm/statuses` is weg: die haalde de statusconfig live uit ClickUp. Nieuwe statussen voeg je toe in `LEAD_FASES`.
- **Fase en opvolging zijn twee losse assen.** De fase zegt waar een lead staat, `volgende_actie` zegt wanneer je er weer wat mee moet. Follow-up is dus nooit een kolom.
- Kolommen op `clickup_crm_records`: `volgende_actie` (date), `volgende_actie_notitie`, `laatste_contact`, `contact_pogingen`, `contact_status`, `contact_status_tot`, `contact_status_reden` (migraties `20260724_crm_opvolging.sql` en `20260724_crm_contactstatus.sql`).
- Elke fase heeft een standaard opvolgtermijn (`opvolgDagen`), per lead te overschrijven via de datumkiezer. Contact loggen zet die standaard automatisch.
- **Contactstatus** is de derde as, naast fase en opvolging: `open`, `pauze` (zacht, optioneel tot een datum) of `blokkade` (hard). Een pauze met einddatum zet `volgende_actie` op die datum, zodat de relatie er vanzelf weer uit komt rollen. Een pauze waarvan de datum voorbij is telt via `contactStand()` weer als open.
- Blokkade betekent geen opvolging en geen contact loggen. `updateCrmRecord` en `logContactMoment` in `lib/crm/store.ts` forceren dat server-side, ook bij het verslepen van een kaart. Contact loggen op een gepauzeerde relatie heft de pauze op.
- Contactstatus geldt ook voor contacten en bedrijven (het blok staat in hun detailkaart), de fases en "Vandaag oppakken" zijn alleen voor leads.
- **Blocklist:** geblokkeerde relaties verdwijnen van het leadbord (pauze blijft er wel op staan) en komen samen op `/crm/blocklist` (nav-item met Ban-icoon). Die pagina (`components/crm/BlocklistPage.tsx`) leest `/api/crm/blocklist` = alle records met `contact_status = 'blokkade'` over lead/contact/company, met reden + deblokkeerknop (PATCH contact_status = open). Het bord toont een "N op de blocklist" link naar die pagina.
- Het blok "Vandaag oppakken" boven het bord toont alles met een actie vandaag of eerder, dwars door de fases heen.
- CRM-records lopen nu via **`/api/crm/records`** (lijst, detail, promote, contact). De oude routes onder `/api/integrations/clickup/records/` zijn verwijderd.

### ClickUpCrmRecordsPage features
- Lijst (gegroepeerd op status) + Board view, zoeken, status-filter dropdown
- Kolomsortering (klik op kolomkop), bulk-selectie met bulk status/verwijderen
- Detail-modal: naam, status, notities (dashboard-only, in `raw.notes`), deadline, bewerkbare custom fields (dropdown/labels/datum/tekst/bedrag), relatiepaneel, uren-koppeling, promote (lead -> opdracht -> factuur)
- Custom fields schrijven: PATCH `/api/integrations/clickup/records/[id]` met `custom_fields: [{id, value}]`; dropdowns willen option-id's, labels arrays van option-id's, datums ms-timestamps

## Factuur-PDF: pagina-opbouw (BELANGRIJK)
- De afsluitende regel (`.footer`, met KVK/BTW/IBAN en het factuurnummer) hoort **alleen op de laatste pagina**. Nooit als herhalende paginavoettekst op elke pagina. Dit geldt voor de urenpagina-generator én voor de factuur-skills.
- Marges komen van `@page` (13mm/13mm/11mm), niet van padding op `.page`. Met padding krijgt alleen de eerste pagina witruimte en plakt een tweede pagina tegen de bovenrand.
- `.page` in print: `width:auto`, geen padding, `min-height:271mm!important`. Die `!important` is nodig omdat de basisregel voor `.page` ná het `@media print`-blok staat. Op precies 273mm rolt er door afronding een lege pagina uit.
- Verder: `thead{display:table-header-group}`, `tbody tr` en de blokken totalen/betaling breken nooit middenin af.
- Het WGB-sjabloon (`wgbFactuurHtml.ts`) houdt `@page{margin:0}`, anders loopt de groene hero niet meer door tot de paginarand. Daar staan alleen de afbreekregels.
- Het werkbestand voor Chrome gaat naar `~/Library/Caches/daley-dash/`, nooit naar de facturenmap: daar horen alleen PDF's. Geldt voor `genereerFactuurPdf` én `scripts/genereer-factuur.mjs`.
- Logo's staan als data-URI in `lib/pdf` (`tdeLogo.mjs`, `dpLogo.mjs`, `wgbLogo.ts`) en worden nooit uit een HTML-bestand gelezen.

## Factuurnummering en concepten (BELANGRIJK)
- Het datumdeel in een factuurnummer is de **factuurdatum**, niet de dag waarop je hem aanmaakt. Dat geldt voor de Dash én voor de factuur-skills (tde-factuur, wgb-factuur, daley-factuur).
- Tel volgnummers altijd op het datumdeel in het **nummer** (`number ilike 'F-260731-%'`), nooit op de kolom `date`. Tellen op `date` gaf dubbele nummers zodra de factuurdatum in de toekomst lag.
- Facturen die nog niet de deur uit gaan zijn **concepten**: eigen reeks `C-JJMMDD-XX`, PDF in `Verkoopfacturen/_Concepten`, status `concept`. Een concept claimt dus nooit een factuurnummer.
- De scan (`/api/admin/scan`) slaat mappen over die met `_` beginnen, zodat concepten buiten de sync blijven, en waarschuwt als twee bestanden hetzelfde nummer dragen.
- `POST /api/facturen/[id]/definitief` maakt een concept definitief: echt nummer uit de bedrijfsreeks, PDF naar de kwartaalmap, uren afboeken, status `verzonden`.
- Uren op een concept krijgen wel het conceptnummer maar blijven `gefactureerd = false`, zodat ze pas bij definitief maken worden afgeboekt.

## Data-afspraken
- **Montung hoort niet in de Dash.** Dat is een aparte VOF (BB-Import) met een eigen BTW-nummer en een eigen systeem in montung-voorraad. De Montung-mappen staan niet in `lib/admin/documentPaths.ts`, en `getFacturen` + `getFactuurStats` filteren net als de BTW-module op `EIGEN_BEDRIJVEN` (`lib/btw.ts`). Voeg Montung hier nooit aan toe.
- `exclude_from_revenue` en `revenue_date` op facturen worden gerespecteerd door ZOWEL de facturenpagina als `getFactuurStats` (dashboardkaarten). Nieuwe omzetberekeningen moeten deze velden ook respecteren.
- Verwachte omzet telt alleen NIET-gefactureerde uren mee (gefactureerde uren zitten al in facturen).
- Migraties in `supabase/migrations/` draaien niet automatisch: uitvoeren via de Supabase SQL Editor of de Management API (`POST /v1/projects/fvywfygsjslojpvqrpxw/database/query`). Alle migraties t/m 20260610 zijn uitgevoerd.
- Supabase legacy API keys zijn uitgeschakeld; gebruik `SUPABASE_SECRET_KEY` (nieuwe stijl), niet `SUPABASE_SERVICE_ROLE_KEY`.

## Deployment & Architectuur

### Dashboard vs. publieke offertes
- Het **dashboard** (`/(dashboard)/*`) is bedoeld voor lokaal gebruik of afgeschermd op Vercel
- De **publieke offertepagina's** (`/offerte/[id]`) worden live gezet per bedrijfsdomein
- Alles communiceert met Supabase — ook lokaal draaien is prima zolang `.env.local` klopt

### Multi-domein aanpak
- Één Vercel deployment, meerdere domeinen eraan gekoppeld:
  - `wegrowbrands.online` → WGB offertes
  - `thedaleyedit.nl` → TDE + Daley Photography offertes
- De offertepagina leest `company_id` uit Supabase en toont automatisch de juiste huisstijl
- Klanten zien bijv.: `wegrowbrands.online/offerte/[uuid]` of `thedaleyedit.nl/offerte/[uuid]`

### Dashboard afschermen (BELANGRIJK)
- **Auth staat bewust UIT.** Dat is een keuze, geen vergeten TODO. `lib/supabase/middleware.ts` laat alles door en `lib/supabase/server.ts` gebruikt de service-role key, waarmee RLS overal omzeild wordt.
- Dat kan omdat de Dash **alleen lokaal** draait en de server sinds 1 augustus 2026 **alleen op 127.0.0.1** luistert (`dev` en `start` in package.json, plus `.claude/launch.json`). Daarvoor stond hij op 0.0.0.0 en kon iedereen op hetzelfde wifi-netwerk de hele administratie openen.
- **Verander die host nooit terug naar 0.0.0.0** zonder eerst auth aan te zetten.
- Zet auth WEL aan zodra: de Dash gedeployed wordt, hij op een ander adres gaat luisteren, of er iemand anders bij moet. Dan moeten `middleware.ts` én `server.ts` allebei terug, want alleen de middleware is niet genoeg.
- Er is één Supabase-gebruiker: `hello@thedaleyedit.nl`.

### Verwijderen van facturen (BELANGRIJK)
- Alles loopt via `verwijderFactuurVeilig()` in `lib/supabase/facturen.ts`. Nooit rechtstreeks `.delete()` op `facturen`.
- Die helper zet eerst een volledige kopie in `facturen_prullenbak`, geeft de gekoppelde uren weer vrij, en weigert verstuurde facturen (`verzonden`, `herinnering-verzonden`, `betaald`, `te-laat`) zonder expliciete bevestiging.
- **De bestandssync verwijdert niets.** Ontbreekt een PDF, dan meldt hij dat en zoekt hij het nummer eerst in de hele administratie. Een verplaatst bestand is geen verwijderde factuur. Zie `docs/audit-2026-08-01.md` punt 1b voor wat er misging.

### Offertenummering
- Format: `OF-YYMMDD-NN` (bijv. `OF-260315-01`)
- Slug = nummer in lowercase = publieke URL
- Bij datumwijziging in dashboard: nummer én slug updaten automatisch mee (volgnummer blijft behouden)
- `deposit_percentage` per offerte instelbaar (standaard 50%, afwijkend bijv. 30% voor PGS Housing)

## PDF en online offertepagina (KRITIEK: altijd synchroon)

**De PDF en de online offertepagina (`/offerte/[id]`) moeten altijd 100% identiek zijn qua inhoud.**

### Wat altijd moet overeenkomen:
- Alle line items (descriptions, details, secties)
- Intro-tekst
- Voorwaarden en opmerkingen
- Bedragen (subtotaal, BTW, totaal, aanbetaling, restant)
- Aanbetalingspercentage (dynamisch per offerte via `depositPercentage`)
- Datum, offertenummer, geldig-tot datum
- Betaalknop tekst, kleur en onderschrift ("Veilig betalen via iDEAL")
- Restant-tekst: altijd "Restant (X%):" — NIET "bij oplevering" of iets anders

### Wanneer PDF regenereren:
- Bij **elke wijziging** aan een offerte in het dashboard (via `saveField`) moet automatisch een nieuwe PDF worden opgeslagen via `saveOffertePdf()`
- De PDF wordt alleen opgeslagen als er een folder geselecteerd is (`folderName` aanwezig)
- Gebruik altijd de meest recente offerte-data (niet stale React state) voor PDF generatie

### Aanbetalingsknop:
- Kleur: donkergroen `#16a34a` (RGB: 22, 163, 74)
- Tekst: `Betaal aanbetaling: {euro(depositAmount)}`
- Onderschrift: `Veilig betalen via iDEAL`
- Gecentreerd, zowel in PDF als op de online pagina

## Schrijfstijl algemeen
- Gebruik **geen em dashes** (—). Gebruik in plaats daarvan een komma, punt, of herformuleer de zin.

## Offerte schrijfstijl (BELANGRIJK)

### Inhoudsvlakken (line items / details veld)
- Gebruik **bullet points** (•), geen lange aaneengesloten zinnen
- Sectienaam = de `description` (kort en duidelijk, bijv. "Website voor makelaarsdienst Amsterdam")
- Details = bullet points met wat er inbegrepen is — kort, feitelijk, geen marketing-taal
- Geen AI-achtige omschrijvingen zoals "strak, clean en esthetisch passend bij..."
- Kortingen vermelden als laatste bullet: `• Introductiekorting 50% — normaaltarief € X.XXX`
- Prijzen alleen als extra info in details, nooit als hoofdtekst

### Voorbeeld goede stijl:
```
description: "Website voor makelaarsdienst Amsterdam"
details:
• Custom meertalig design (NL/EN)
• Pagina's: Home, About Us, Diensten & Contact
• Contactformulier
• Gericht op expats & internationale doelgroep
• Teksten aangeleverd door opdrachtgever
• Introductiekorting 50% — normaaltarief € 1.450
```

### Intro-tekst
- Persoonlijk en direct: "Hey [naam], dank je wel voor je aanvraag..."
- Max 2-3 zinnen, geen opsomming
- Geen AI-jargon

## Commands
- `npm run dev` — start dev server op localhost:3003
- `npm run build` — productie build (BELANGRIJK: draai na elke reeks wijzigingen)
- `npm run lint` — ESLint check

## Verificatie (BELANGRIJK)
- Controleer NA ELKE wijziging of de dev server nog draait (`lsof -ti :3003`). Zo niet: herstart met `npx next dev -p 3003 --turbo &`
- Gebruik `npx tsc --noEmit` voor TypeScript-checks in plaats van `npm run build` (build kan de dev server killen)
- Draai `npm run lint` na het schrijven van nieuwe code
- NOOIT `npm run build` draaien terwijl de dev server draait — gebruik `npx tsc --noEmit` als alternatief
- Bij UI-wijzigingen: maak een screenshot en vergelijk met het gewenste resultaat
- **Na elke UI-wijziging of build: loop de pagina visueel na in de browser.** Controleer of alles correct rendert, of de styling klopt met de huisstijl, en noteer verbeterpunten. Fix gevonden issues direct voordat je verder gaat.
- **Wees proactief kritisch:** kijk na elke taak naar zwakke punten, UX-verbeteringen en ontbrekende functionaliteit. Geef concrete tips om het dashboard sterker te maken (bijv. betere foutafhandeling, lege states, responsive design, performance, toegankelijkheid). Meld dit aan de gebruiker vóórdat je de taak als afgerond beschouwt.
- Pak altijd de root cause aan, onderdruk geen errors
- Bij bugs: schrijf eerst een beschrijving van het verwachte vs werkelijke gedrag

## Workflow
- Verken EERST de relevante code voordat je wijzigingen maakt
- Bij grotere features: gebruik Plan Mode om te verkennen → plannen → implementeren
- Maak kleine, gerichte wijzigingen per stap
- Gebruik subagents voor onderzoek zodat de hoofdcontext schoon blijft
- `/clear` tussen ongerelateerde taken om context fris te houden
- Commit messages in het Nederlands

## Code stijl
- Gebruik `import` syntax (ES modules), geen `require`
- Componenten in `components/`, utilities in `lib/`
- Supabase client via `lib/supabase/`
- Gebruik Tailwind brand-tokens voor styling (bijv. `text-brand-text-primary`, `bg-brand-lavender`)
- Geen inline styles of hardcoded hex kleuren — gebruik altijd huisstijl tokens
- Headlines: `font-uxum` (Uxum serif), body: standaard sans-serif (Geist)

## Huisstijl samenvatting
- Sidebar: lavender gradient (`from-brand-lavender-light to-brand-lavender`)
- Pagina achtergrond: licht gradient (`from-brand-page-light to-brand-page-medium`)
- Cards: wit met navy border (`card` class)
- Buttons: primary = paars (`btn-primary`), secondary = wit met navy border (`btn-secondary`)
- Status badges: pastel achtergrond + accent tekstkleur (`pill` class)
- Tekst: navy primair (`text-brand-text-primary`), grijs secundair (`text-brand-text-secondary`)
