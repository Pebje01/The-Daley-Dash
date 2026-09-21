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

## Bedrijfsselectie (september 2026)
- Bovenin de sidebar staat de bedrijfskiezer (`BedrijfKiezer` in `components/Sidebar.tsx`). Die bepaalt wat je in de hele Dash ziet. Hij stond eerst onderaan de navigatie als "Actief bedrijf".
- **The Daley Edit is de standaard en is overkoepelend:** daar zie je alles bij elkaar, dus ook We Grow Brands en Daley Photography. Kies je WGB of DP, dan zie je alleen de data van dat bedrijf. Zo werkte de Dash altijd al onder de streep: de weergave onder TDE is precies het oude, ongefilterde gedrag.
- De keuze staat in `components/CompanyContext.tsx`. `activeCompany` is het gekozen bedrijf, `scope` is waar de data op gefilterd wordt: `'alle'` bij TDE, anders het bedrijf zelf. Gebruik `scope` voor het filteren en `activeCompany` alleen waar je een concreet bedrijf nodig hebt (bijvoorbeeld het standaardbedrijf van een nieuwe offerte).
- `scopeGeladen` is false tot de opgeslagen keuze uit localStorage is gelezen. Pagina's wachten daarop met laden, anders haal je eerst alle bedrijven op en direct daarna nog eens het gekozen bedrijf, met een flits van andermans data.
- Gefilterd worden: dashboard (offerte- en factuurstats, abonnementen, open leads), offertes, facturen, betalingen plus kasstroom, abonnementen, uren, prospects en leads.
- **De belasting hoort alleen bij The Daley Edit.** Alle drie de bedrijven vallen onder hetzelfde KVK- en BTW-nummer, dus dat is één aangifte; een aangifte per bedrijf bestaat niet. Binnen WGB of DP verdwijnen de drie belastingitems uit de sidebar en de BTW-kaart van het dashboard, en toont `/belasting` een uitleg met een knop terug naar TDE. Bouw er geen bedrijfsfilter in, dat zou een half beeld geven van iets waar je een aangifte op baseert.
- **Niet gefilterd, met opzet:** bedrijven, contacten, opdrachten en facturatie in het CRM (dezelfde klant kan werk voor meerdere van je bedrijven zijn) en taken.
- De rij bedrijfstabs op de offerte- en facturenpagina blijft alleen zichtbaar onder TDE. Binnen WGB of DP zou hij je uit je eigen administratie kunnen trekken.

### Prospects en leads per bedrijf
- `clickup_crm_records.company_id` (migratie `20260909_crm_bedrijf.sql`) zegt voor welk eigen bedrijf een prospect of lead is. Leeg = nog niet toegewezen: die zie je alleen onder TDE, zodat er bij het uitrollen niets uit beeld verdween.
- De kolom staat op de hele tabel maar geldt **alleen voor `lead` en `ruwe_lead`**. `/api/crm/records` negeert de parameter `company` voor de andere entity_types, en `/api/crm/stats` filtert er alleen de leadtellers mee.
- Kiezen doe je in de detailkaart van een lead ("Voor welk bedrijf"), in het nieuw-recordformulier, en op de prospectlijst met de kleine keuzelijst per rij. Nieuwe records krijgen standaard het bedrijf dat je op dat moment gekozen hebt, en TDE als je in de overkoepelende weergave zit.
- Zolang de migratie niet gedraaid is, vallen lezen en aanmaken terug op het gedrag zonder kolom, zodat de CRM-pagina's blijven werken. Een schrijfactie die wél een bedrijf zet geeft dan een duidelijke fout in plaats van het veld stilletjes te vergeten. Die terugval mag weg zodra de migratie overal gedraaid is.

## Structuur
```
app/
├── (auth)/login/           # Login pagina (Supabase auth)
├── (dashboard)/            # Beschermd achter auth middleware
│   ├── page.tsx            # Dashboard: geld dat klaarligt, vandaag oppakken, pijplijn, to-do
│   ├── financieel/         # Omzet, verwachte omzet, betalingen, btw, abonnementen
│   ├── layout.tsx          # Sidebar + page background
│   ├── offertes/           # Offertes overzicht + detail
│   ├── facturen/           # Facturen overzicht + detail
│   ├── betalingen/         # Betalingen (vereist betalingen-tabel, zie migrations)
│   ├── abonnementen/       # Abonnementen + MRR
│   ├── klanten/            # Alleen nog een doorverwijzing naar /crm/bedrijven
│   ├── taken/              # Taken kanban
│   ├── uren/               # Urenregistratie
│   ├── belasting/          # BTW-rapportage + aangifte voorbereiding
│   └── crm/                # CRM-module (zie hieronder)
│       ├── prospects/ leads/ bedrijven/ contacten/ opdrachten/ facturen/ blocklist/
├── api/
│   ├── crm/                # relations (id-based), stats, bedrijven (lite, voor uren-FK)
│   └── ...                 # offertes, facturen, uren, taken, betalingen, etc.
├── o/[slug]/ + offerte/[id]/  # Publieke offertepagina's
├── fonts/                  # Geist (sans) + Uxum (serif)
└── globals.css             # Tailwind + component classes (card, btn, input, pill)
components/
├── CrmRecordsPage.tsx      # Generieke CRM-pagina (lijst/board/detail/bulk)
├── Sidebar.tsx, StatusBadge.tsx, DrawerHost/DrawerContext, ...
lib/
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
- **Supabase is de bron** voor CRM-data (leads, bedrijven, contacten, opdrachten, facturatie). ClickUp is losgekoppeld (juni 2026) en in september 2026 helemaal uit de Dash gehaald: de syncpagina, de koppelroutes, de "Openen in ClickUp"-links en de importscripts zijn weg. Daley gebruikt ClickUp niet meer; dit is haar eigen leadbord. Bouw geen ClickUp-koppeling terug.
- **"Daley Jansen's List" bestaat niet meer** (juli 2026): dat was het `daley_list` entity-type, maar in de praktijk een takenlijst. De openstaande items zijn overgezet naar de `taken`-tabel (`/taken`) en het CRM-onderdeel + de route `/crm/daley-list` zijn verwijderd. De `taken`-tabel is dé to-do lijst; het `daley_list` entity-type blijft alleen als dode waarde in de EntityType-union staan.
- Alle data staat in de tabel **`clickup_crm_records`** (alle entiteiten in één tabel, met `entity_type`, `clickup_task_id`, `custom_fields` JSON). Records aangemaakt na de loskoppeling hebben `clickup_task_id` met prefix `local-`.
- Schrijven gaat via **`lib/crm/store.ts`** (create/update/delete/promote), rechtstreeks naar Supabase. Veldformaten zijn nog die van de oude ClickUp-import (daarom ook de tabelnaam, die blijft bewust staan): drop_down = orderindex, relaties = array van task-stubs, labels = array van option-ids.
- **Geen ClickUp-sync meer:** de routes onder `/api/integrations/clickup/` en `lib/clickup/` zijn verwijderd. Een sync zou lokale wijzigingen overschrijven.
- Oude ClickUp-tags (branchelabels als horeca, retail, travel) staan nog alleen-lezen in de kolom `tags` en heten in de detailkaart "Branche (oud label)". Eigen labels zijn `dash_tags`.
- **Relaties** (bedrijf <-> contact <-> lead <-> opdracht) zitten in custom fields van het type `tasks`/`list_relationship`. `/api/crm/relations?id=...` leidt ze in beide richtingen af uit `clickup_crm_records`. NIET de legacy-tabellen gebruiken.
- Koppelen doe je in de kop van de detailkaart (onder de titel): daar staan alle koppelingen als labeltjes, met een kruisje om los te koppelen en de knop **Koppelen** voor de zoeker. Dat stond eerst als blok Relaties bovenaan de middelste kolom en viel dan buiten beeld zodra die kolom naar de velden gescrold was. Of meteen bij het aanmaken via het blok "Koppelen aan" in het nieuw-recordformulier. Beide lopen door `koppelRecords()` in `components/CrmRecordsPage.tsx`: die schrijft de koppeling op het bronrecord, en anders op het doelrecord, net welke van de twee een relatieveld heeft dat naar het andere type wijst. Omdat de relaties-API beide richtingen afleidt, maakt het voor de weergave niet uit welke kant de waarde draagt.
- Koppelingen bij het aanmaken zijn bewust niet alles-of-niets: valt een koppeling om, dan blijft het nieuwe record staan en meldt het formulier welke koppeling niet is gelukt. Een record kwijtraken om een mislukte relatie is erger dan een relatie die je zelf nog even legt.
- Bestaat het record waaraan je wil koppelen nog niet, dan maak je het in de zoeker zelf aan ("Nieuwe lead ... aanmaken"). Zonder zoekterm stelt hij de naam van het bronrecord voor, want een lead heet meestal net zo als het bedrijf. Een nieuwe lead krijgt status `nieuwe kans`: met de serverstandaard `open` valt hij buiten alle bordkolommen.
- Die knop loopt gewoon door de dubbelcheck heen. Botst het, dan zie je de melding en pas dan de knop "Toch aanmaken" (die `negeerDubbel` meestuurt). Bij een blokkade blijft die knop weg, want die is server-side toch niet te overrulen. Zet er geen vaste `negeerDubbel: true` in: een lead voor een bedrijf dat je net hebt aangemaakt botst per definitie op de naam, maar een echte dubbele wil je nog steeds zien.
- **Legacy-tabellen** `crm_bedrijven`, `crm_contacten`, `crm_leads`, `crm_opdrachten`, `crm_facturatie` zijn een eenmalige import en worden NIET bijgewerkt. Bouw er geen nieuwe features op. De uren-koppeling liep eerst via `uren_klanten.crm_bedrijf_id` naar `crm_bedrijven`; sinds september 2026 loopt hij via `crm_record_id` naar het echte CRM-bedrijf (zie "Klanten zijn bedrijven").

### Leadfases en opvolging (juli 2026)
- **Fases van leads staan in `lib/crm/pipeline.ts`**, niet meer in ClickUp. Bordkolommen: Nieuwe kans, Benaderd, In gesprek, Offerte uit, Later opvolgen, On hold, Gewonnen, Niets uitgekomen, Verloren, Blocklist. Oude statussen (klant on hold, archief) blijven bestaan maar staan achter "Toon afgesloten fases".
- De route `/api/crm/statuses` is weg: die haalde de statusconfig live uit ClickUp. Nieuwe statussen voeg je toe in `LEAD_FASES`.
- **Fase en opvolging zijn twee losse assen.** De fase zegt waar een lead staat, `volgende_actie` zegt wanneer je er weer wat mee moet. Follow-up is dus nooit een kolom.
- Kolommen op `clickup_crm_records`: `volgende_actie` (date), `volgende_actie_notitie`, `laatste_contact`, `contact_pogingen`, `contact_status`, `contact_status_tot`, `contact_status_reden` (migraties `20260724_crm_opvolging.sql` en `20260724_crm_contactstatus.sql`).
- Elke fase heeft een standaard opvolgtermijn (`opvolgDagen`), per lead te overschrijven via de datumkiezer. Contact loggen zet die standaard automatisch.
- **Contactstatus** is de derde as, naast fase en opvolging: `open`, `pauze` (zacht, optioneel tot een datum) of `blokkade` (hard). Een pauze met einddatum zet `volgende_actie` op die datum, zodat de relatie er vanzelf weer uit komt rollen. Een pauze waarvan de datum voorbij is telt via `contactStand()` weer als open.
- Blokkade betekent geen opvolging en geen contact loggen. `updateCrmRecord` en `logContactMoment` in `lib/crm/store.ts` forceren dat server-side, ook bij het verslepen van een kaart. Contact loggen op een gepauzeerde relatie heft de pauze op.
- Contactstatus geldt ook voor contacten en bedrijven (het blok staat in hun detailkaart), de fases en "Vandaag oppakken" zijn alleen voor leads.
- **Bij leads is contactstatus geen losse keuze meer (september 2026), hij volgt de fase.** Kolom On hold (`'on hold'`) = pauze, kolom Blocklist (opgeslagen als `'blacklist'`) = blokkade, elke andere fase = open. Twee knoppen voor hetzelfde gaf leads die in de fase "blacklist" stonden maar niet op de blocklist. De koppeling zit in `contactVeldenBijFase()` en `faseVoorContactStatus()` in `pipeline.ts`; `updateCrmRecord` past hem server-side toe (slepen, statuskiezer, bulk), het scherm spiegelt hem. Zet je de contactstatus van een lead rechtstreeks, dan schuift de fase mee: deblokkeren op de Blocklist-pagina zet hem in Later opvolgen. Contact loggen op een lead in On hold zet hem op Benaderd. In de detailkaart van een lead staan de drie contactstatusknoppen dus niet meer, alleen einddatum en reden zolang hij in On hold of Blocklist staat.
- **Blocklist = partijen, niet los werk (september 2026).** `/crm/blocklist` toont alleen **bedrijven en contacten** met `contact_status = 'blokkade'`: met hen doe je geen zaken meer. Een geblokkeerde **lead of opdracht** is werk dat daaruit volgt en blijft op het bord staan, in de kolom Blocklist, met "Niet benaderen" en de **reden op de kaart zelf** (`BoardCard`). Dat onderscheid was er eerst niet: toen stond alles door elkaar op één pagina.
- Route `/api/crm/blocklist` filtert dus op `entity_type in (contact, company)`. Een afgewezen prospect vind je terug op de tab Afgewezen van `/crm/prospects`, niet op de blocklist. De dubbelcheck kijkt los daarvan naar álle geblokkeerde records, dus een geblokkeerd bedrijf houdt nieuwe leads en prospects nog steeds tegen.
- Op het leadbord staat boven de kolommen een link **Blocklist** naar die pagina, op de andere borden een "N op de blocklist" link (die teller stond eerst in een tak die alleen voor leads liep en was daardoor altijd 0).
- Het blok "Vandaag oppakken" boven het bord toont alles met een actie vandaag of eerder, dwars door de fases heen.
- CRM-records lopen nu via **`/api/crm/records`** (lijst, detail, promote, contact). De oude routes onder `/api/integrations/clickup/records/` zijn verwijderd.

### AI-kwalificatie van leads (augustus 2026)
- Nieuwe leads worden automatisch beoordeeld door Claude: branchelabel, score 0-100, plus- en minpunten, en een voorgestelde eerste stap. De AI zoekt zelf de website op en leest die.
- **Draait op het Claude-abonnement, niet op API-credits.** `lib/ai/claude-cli.ts` start de lokale `claude` CLI (`-p` met `--json-schema`, tools WebSearch en WebFetch). Daarom werkt dit alleen lokaal: op een server zonder ingelogde CLI is er alsnog een API-key nodig.
- De CLI wordt bewust vanuit de tmp-map gestart, zodat deze CLAUDE.md niet wordt meegeladen. En het binary wordt zelf opgezocht (`~/.local/bin/claude`), want de LaunchAgent erft een kale PATH.
- **De AI is adviserend, nooit sturend.** Hij schrijft alleen in de `ai_*`-kolommen. Fase, `volgende_actie` en `contact_status` blijven handwerk. Verander dat niet zonder overleg: het bord is bewust van de gebruiker.
- De AI krijgt de recente activiteit mee, maar een reeks statuswijzigingen binnen 15 minuten telt als één wijziging, en valt weg als hij eindigt waar hij begon (`voegStatusKliksSamen` in `lib/ai/kwalificeer-lead.ts`). Aanleiding: bij Breakthrough Business was vijf keer heen en weer geklikt (ook langs "Offerte uit"), en de AI schreef daarna dat er al een offerte was geweest.
- Criteria staan los in `lib/ai/lead-criteria.ts`, zodat je kunt bijstellen wat een goede lead is zonder aan de motor te komen.
- **Twee sporen in de criteria** (augustus 2026): het Nederlandse MKB, en de internationale reisbranche (toerismebureaus, DMO's, reisaanbieders). Dat tweede spoor staat er omdat elke buitenlandse organisatie anders automatisch rond de 2 scoort op "buiten Nederland", terwijl daar juist werk zit.
- **Het ontbreken van een Benelux-ingang is géén minpunt** (bijgesteld september 2026). Dat stond er eerst wel, als het scharnier van het hele spoor, en dat was een denkfout tegen Daley's eigen positionering: dat gat is precies wat zij komt vullen, zij kan die ingang zelf zijn. Onder die oude regel scoorde elke buitenlandse organisatie zonder Nederlandse tak automatisch laag, en dat haalde juist de kansrijke kleine bureaus eruit.
- **Wat er nu voor in de plaats weegt:** is er een Engelstalige, naar buiten kijkende marketingafdeling, kopen ze wel eens buiten de deur (PR-bureaus, contentmakers, persreizen), is er een aanleiding (nieuwe vliegroute, campagne, jubileum), en landt een koud bericht uit Nederland er eigenlijk wel. Dat laatste is de echte reden om laag te scoren: alles via de nationale koepel, budgetten die een jaar vooruit vastliggen (let op afwijkende boekjaren, Japan loopt april tot maart), of alleen een infomailbox. Klein en direct aanspreekbaar weegt zwaarder dan groot en indrukwekkend.
- Is die Benelux-ingang er wél, dan is dat een plus. Loopt hij via een vertegenwoordiger of PR-bureau hier, dan is **dat bureau de eigenlijke lead** en niet het hoofdkantoor. Voorbeeld: JNTO loopt in de Benelux via AVIAREPS in Amsterdam.
- Voor dit spoor staat er een expliciete schaal in de criteria (45 tot 60 is realistisch het hoogste voor een koude benadering, boven de 60 alleen langs een warme route). Zonder die schaal kruipt het model terug naar de MKB-getallen. Een reisdienstverlener (bagagevervoer, touroperator, boekingsplatform) is geen DMO en krijgt de gewone commerciële meetlat.
- Instapelpunten: automatisch bij `POST /api/crm/records` (entity_type lead), handmatig via `POST /api/crm/leads/kwalificeer` met `{id}`, en in bulk met `{alleOnbeoordeelde: true}`.
- **De bulkroute pakt alleen levende fases**, geen gewonnen, verloren, gearchiveerde of geblokkeerde leads. Die beoordelen kost limiet en levert niets op. Let op de `.or('contact_status.is.null,...')`: een kale `.neq` gooit ook alle NULL-rijen eruit.
- Wachtrij met max 2 tegelijk (`lib/ai/kwalificatie-wachtrij.ts`, instelbaar via `LEAD_AI_CONCURRENCY`). Zonder rem zou een import net zoveel claude-processen starten als er leads zijn.
- Vangnet voor leads die buiten de Dash om binnenkomen: LaunchAgent `com.daley.lead-ai` draait `scripts/kwalificeer-leads.mjs --watch`, elk kwartier, max 10 per ronde. Logt naar `/tmp/daley-lead-ai.log`.
- Uitzetten: `LEAD_AI_UIT=1` in `.env.local`. Model wisselen: `CLAUDE_CLI_MODEL`.

### Leads benaderen via Spark (september 2026)
- **Knop "Benaderen" in de kop van de detailkaart van een lead** (niet bij geblokkeerde leads). De AI schrijft een eerste mail, Daley past hem aan in het blok Benaderen bovenin de werkkolom (`components/crm/BenaderenBlok.tsx`), en "Openen in Spark" opent hem als ingevuld nieuw bericht in Spark. **Versturen doet ze zelf; de Dash verstuurt nooit iets.**
- **Spark wordt alleen gelezen**, via de lokale `spark` CLI (`lib/mail/spark.ts`). Schrijftoegang voor de koppeling kost bij Spark extra, dus `spark draft` gebruiken we bewust niet. De CLI praat met de draaiende Spark Desktop-app: dit werkt alleen als Spark op de Mac openstaat. Het binary wordt zelf opgezocht (`/usr/local/bin/spark`, of `SPARK_CLI_PATH`), want de LaunchAgent erft een kale PATH.
- **Openen gaat met een gewone maillink** (`mailtoLink`). Op de Mac (host localhost of 127.0.0.1) opent de route hem met `open -a "Spark Desktop"`, want de standaard mailapp is Outlook; op de telefoon opent de browser de maillink.
- **Een maillink kan de afzender niet meegeven** (getest: Spark negeert `from=`), Spark neemt zijn standaardaccount (hello@thedaleyedit.nl). Het blok toont welk account bij het bedrijf van de lead hoort (`kiesAccount`: exact adres of hetzelfde domein; WGB staat in `lib/companies.ts` als hello@, in Spark als daley@), en Daley kiest dat in het berichtvenster. Het terugvinden werkt vanaf elk account, en de rij krijgt het account waar hij echt vandaan ging.
- Flow en statussen in `lib/crm/benaderen.ts`, tabel `crm_mail_concepten` (migratie `20260918_crm_mail_concepten.sql`): uitgaand `concept` (in de Dash) -> `in_spark` (geopend) -> `verstuurd`, of `geannuleerd`; inkomend `ontvangen`. Eén rij per mail of poging, oude blijven staan.
- **Verstuurd herkennen:** `zoekVerzondenMails` zoekt eerst over alle mappen welke accounts aan het adres mailden en kijkt dan alleen in hun map Sent (een concept aan hetzelfde adres staat in Drafts en telt niet). Bij een concept moet ook het onderwerp kloppen (zonder Re:, en Spark kapt lange onderwerpen af), verstuurd na het openen. Past Daley het onderwerp in Spark nog aan, dan pakt de losse-mailronde hem alsnog op.
- **Ook zelf geschreven mails aan leads worden vastgelegd** (`registreerVerzondenMails`): lopende leads met een bekend mailadres, mails van de afgelopen 3 dagen en na het laatst gelogde contact. Die krijgen een rij met status `verstuurd`, lege tekst en `spark_bericht_id` (unieke index, telt nooit dubbel). De terugkijktermijn is bewust kort, zodat het aanzetten geen stapel oude mails logt.
- Een verzonden mail logt `logContactMoment` met soort mail; een lead in Nieuwe kans of On hold gaat naar Benaderd, en de opvolgdatum van de fase wordt gezet.
- Nagekeken wordt bij het openen van de kaart, als je terugkomt in het Dash-venster (hooguit elke 20 seconden) en elk kwartier door het vangnet `scripts/kwalificeer-leads.mjs --watch` via `POST /api/crm/benaderen/controleer` (eerst open concepten, dan losse mails).
- **Ontvanger: alleen het adres dat Daley zelf aanwijst** (`ruwe_contact_email`, `gekozenAdres`). De Dash pakt nooit automatisch een adres van een gekoppeld record. Aanleiding: aan de lead "Diego website + video + foto" hing een contact dat bij Montung hoorde, en dan zou een mail aan die persoon als contact met deze lead tellen. Adressen van gekoppelde contacten en bedrijven staan wel als suggestie in het blok **Mailadres** in de detailkaart (`components/crm/MailAdresKiezer.tsx`, route `/api/crm/records/[id]/mailadres`), met erbij van wie ze zijn.
- **Mailadressen ophalen voor leads:** dezelfde AI-zoeker als bij prospects (`lib/ai/zoek-contactgegevens.ts`) werkt nu ook op `entity_type = 'lead'`. Knop **Mailadressen zoeken** boven het leadbord (met de teller van lopende leads zonder adres) en een knop per lead in het blok Mailadres. De bulkroute `POST /api/crm/leads/contact` neemt `entity: 'lead'` en pakt dan alleen lopende fases. De zoeker valt voor de website terug op het veld Website van de lead zelf of van het gekoppelde bedrijf, want leads die niet uit de prospectlijst komen hebben geen `ruwe_website`. Elk gevonden adres wordt nog steeds deterministisch nagerekend tegen de echte site.
- **De tekst** komt uit `lib/ai/schrijf-benadering.ts`: dezelfde lokale claude CLI als de kwalificatie, met alleen WebFetch, en de toonregels uit Daley's tone-of-voice-skill ingekort voor een eerste zakelijke mail (kort, één concreet haakje, één vraag, geen verkooppraatje, geen lange streepjes; Engels bij buitenlandse organisaties). Geen handtekening in de tekst, die zet Spark eronder.
- **Reacties herkennen** (`registreerReacties`, laatste stap van `controleerMail`): per lopende lead met een bekend mailadres zoekt de Dash mail **van** dat adres, of van het hele bedrijfsdomein als het geen gratis domein is (`afzenderSleutel`, want een reactie komt vaak van een collega). Alleen bij leads die Daley al benaderde (`laatste_contact` of `contact_pogingen`), anders telt elke nieuwsbrief van een bedrijf op de lijst. Noreply- en nieuwsbriefadressen vallen af (`isAutomatischeAfzender`, op het volledige adres uit `spark thread`, want de zoektabel kapt adressen af). Mails van vóór Daley's laatste verzonden mail tellen niet.
- Een reactie komt in `crm_mail_concepten` met `richting = 'in'`, status `ontvangen`, `van` en `gezien_op` leeg. De lead krijgt `volgende_actie` vandaag met notitie "Heeft gereageerd: onderwerp", `laatste_contact` schuift mee (maar `contact_pogingen` niet, die telt alleen Daley's pogingen) en de activiteit "Reactie ontvangen". **De fase blijft staan**: of het een gesprek wordt, beslist Daley.
- In de leadkaart staat dan bovenin `components/crm/ReactieMelding.tsx`: **Lezen** (de tekst uit `spark thread`, ook op de telefoon), **Naar Spark** (haalt Spark naar voren, alleen op de Mac), **Zet op In gesprek** en **Gezien**. Mailt Daley daarna zelf, dan gaan eerdere reacties vanzelf op gezien (`reactiesAfgehandeld`).
- **Geen deeplink naar een gesprek in Spark**: de `Link:` uit `spark thread` en het schema `readdle-spark://` opent Spark van buitenaf niet ("Spark couldn't open this link", getest). Daarom lezen in de Dash.
- **In de testversie opent er niets in Spark** (`openInSpark` weigert bij `IS_TEST`). Schrijven en nakijken werken wel, nakijken leest dan de echte Spark maar schrijft alleen in de testdatabase.

### Prospects (voorheen "ruwe leads", hernoemd augustus 2026)
- **Prospects zijn bedrijven die je nog wil benaderen**, pagina `/crm/prospects`, component `components/crm/ProspectsPage.tsx`. Zowel kandidaten uit onderzoek als bedrijven die je zelf uitkiest komen hier binnen.
- **Waarom dit vóór het leadbord staat en niet als eerste kolom erin:** "Nieuwe kans" heeft `opvolgDagen: 2`, dus elk record op het bord genereert binnen twee dagen een actie in "Vandaag oppakken". Een groslijst van vijftig bedrijven zou het bord in een takenlijst veranderen. Een lead is een gesprek dat loopt, een prospect is een naam op je lijst. Zet prospects dus nooit rechtstreeks op het bord.
- **Drie keuzes per prospect, meer niet (september 2026): goedkeuren, later of afwijzen.** Groen keurt goed en zet `entity_type` op `lead` met status `nieuwe kans`, en daarmee gaat hij het bord op waar de opvolging thuishoort. Rood wijst af, zet `contact_status` op blokkade en stuurt hem naar de blocklist. Oranje ("Later") parkeert hem: `status` = `later`, en dan valt hij uit de lijst die je nu beoordeelt zonder dat er een oordeel op zit. De knoppen zijn met opzet groen, oranje en rood: op kleur kun je een lange lijst afwerken zonder te lezen wat er op de knop staat.
- **Vier tabs bovenaan (`Tab` in `ProspectsPage.tsx`): Te beoordelen, Later opvolgen, Goedgekeurd, Afgewezen.** Dat zijn de vier uitkomsten van diezelfde triage, geen vier pagina's: je wil een beslissing kunnen terugzien en terugdraaien zonder weg te navigeren. Vanuit Later gaat de middelste knop terug naar Te beoordelen; vanuit Afgewezen haalt "Terughalen" de blokkade eraf.
- **Goedgekeurd toont leads, geen prospects meer.** Die tab haalt `?entity=lead` op en houdt over wat zijn prospect-velden nog draagt (`kwamUitProspects`: `ruwe_bron`, `ruwe_fit_reden`, `ruwe_contactpersoon`, `ruwe_telefoon` of `ruwe_contact_status`). Die kolommen blijven staan als `entity_type` omklapt, en alleen deze pagina vult ze, dus dat is de herkomst. Daarom staan er geen knoppen op die rijen: veranderen doe je op het leadbord.
- Hier stond eerst een statusrij (Nog beoordelen, Te benaderen, Gemaild, Gereageerd) met een knop om een prospect een stap verder te zetten, plus knoppen per rij voor de AI-beoordeling en het opzoeken van contactgegevens. Dat is er allemaal uit: een prospect is een oordeel, geen traject, en een tweede pijplijn naast het leadbord bijhouden werkte niet. De kolom `status` draagt daarvan nog precies één waarde: `later`. Dat is bewust die bestaande kolom en geen nieuwe: het is één waarde, en een migratie zou hier niets opleveren.
- **De lijst is gebouwd om te scannen:** elke rij is dichtgeklapt even hoog (naam, score, branche, bedrijf, contactgegevens en één regel onderbouwing). De chevron rechts klapt de volledige onderbouwing uit plus het veld "Reden afwijzen"; dat veld stond eerst op elke rij en maakte de lijst onrustig.
- Volgorde: sterren eerst, dan de hoogste AI-score, dan op naam. Bewust niet op datum: bovenaan hoort te staan wat je als eerste wil beoordelen.
- De enrichment blijft, maar op paginaniveau: "Contactgegevens zoeken" in de kop draait over alles wat nog een mailadres of nummer mist. De AI-beoordeling loopt vanzelf bij het aanmaken; alleen als die ontbreekt of mislukt is verschijnt er een klein "beoordelen" naast de score. Let op: de bulkroute `alleOnbeoordeelde` pakt alleen `lead`, niet `ruwe_lead`, dus dat linkje is de enige herstelweg voor prospects.
- **In de database heet het entity_type nog `ruwe_lead` en de kolommen nog `ruwe_*`.** Dat is bewust niet meegehernoemd: interne namen, een migratie levert niets zichtbaars op. De API-parameter blijft dus `?entity=ruwe_lead`.
- Prospects krijgen automatisch hun contactgegevens opgezocht: website, contactpersoon, mailadres en telefoonnummer. Zonder die gegevens valt er niets te beoordelen en niets te benaderen.
- Motor: `lib/ai/zoek-contactgegevens.ts`, dezelfde lokale `claude` CLI als de kwalificatie, met WebSearch en WebFetch. Kolommen: `ruwe_contactpersoon`, `ruwe_telefoon`, `ruwe_contact_status`, `ruwe_contact_gezocht_op`, `ruwe_contact_toelichting`, `ruwe_contact_fout` (migratie `20260808_crm_ruwe_lead_contact.sql`).
- **Alleen lege velden worden gevuld.** Wat je zelf hebt ingevuld wint altijd, net als bij de AI-kwalificatie: dit is een vangnet, geen automaat die jouw werk overschrijft.
- **Elk gevonden mailadres wordt daarna deterministisch nagerekend** tegen de echte site (`verifieerEmail`): homepage plus contact- en over-ons-pagina's, hooguit zes pagina's. Staat het adres er niet letterlijk maar wel een ander adres op hetzelfde domein, dan wint dat. Vinden we niets, dan blijft het veld leeg. Haal die controle er niet uit: een taalmodel stelt met gemak een plausibel adres samen uit naam plus domein, en een bounce kost je afzenderreputatie.
- Eigen wachtrij (`lib/ai/contact-wachtrij.ts`, max 2 tegelijk, `LEAD_CONTACT_CONCURRENCY`), los van de kwalificatiewachtrij zodat een reeks zoekopdrachten de beoordeling van nieuwe leads niet ophoudt.
- Instapelpunten: automatisch bij `POST /api/crm/records` met `entity_type = 'ruwe_lead'` (de prospect-waarde), handmatig via `POST /api/crm/leads/contact` met `{id}` of `{ids}`, en in bulk met `{alleOnvolledige: true, limiet}` (alles zonder mailadres of nummer, dat nog niet eerder is opgezocht, en niet geblokkeerd is).
- Dezelfde `LEAD_AI_UIT=1` zet ook dit uit.

### Dubbelcheck bij het toevoegen van leads en prospects
- `POST /api/crm/records` weigert een `lead` of `ruwe_lead` die er al staat of die geblokkeerd is. Logica in `lib/crm/dubbelcheck.ts`, melding via `botsingMelding()`.
- Vergelijkt op drie sleutels, in die volgorde van betrouwbaarheid: **domein** (uit de website of anders uit het mailadres), **mailadres**, en pas als laatste **naam**. Op naam wordt alleen gematcht als niet beide kanten een domein hebben: twee bedrijven mogen dezelfde naam dragen, twee domeinen nooit. Namen worden genormaliseerd, dus "Van Dijk Hoveniers B.V." en "van dijk hoveniers" zijn hetzelfde bedrijf.
- De check kijkt **door alle entity_types heen**, inclusief de custom fields Website en E-mail van bedrijven en contacten. Een prospect voor een bedrijf dat al klant is, is net zo goed een dubbele.
- **Een dubbele kun je bewust overrulen met `negeerDubbel: true`, een blokkade nooit.** Die uitzondering staat server-side in de route en niet alleen in het scherm, anders wandelt een geblokkeerd bedrijf via een directe API-call of een import alsnog binnen. Dat is precies wat de blocklist moet stoppen.
- Valt de check zelf om (database niet bereikbaar), dan laat hij het record door. Liever een dubbele lead dan een lead die je niet kwijt kunt.
- Bewust alleen op leads en prospects: die komen uit onderzoek en imports, en dat is waar dezelfde bedrijven telkens opnieuw binnendruppelen. Bedrijven, contacten en opdrachten voeg je bewust toe.

### Lijsten blijven staan waar je staat (september 2026)
- **Na verwijderen, een bulkactie of een keuze op Prospects laadt de lijst stil bij**: `load({ stil: true })` in `CrmRecordsPage`, `load(true)` in `ProspectsPage`. Zonder dat zet `setLoading(true)` een laadscherm in de plaats van de lijst, klapt de scrollhoogte in en sta je weer bovenaan, precies waar je net niet was.
- Een verwijderd record gaat **eerst lokaal uit `items`** en pas daarna komt de stille verversing. De blocklistpagina doet hetzelfde bij deblokkeren.
- Een stille verversing wist de selectie niet. De knop Ververs roept bewust `load()` zonder `stil` aan, met het draaiende icoontje erbij: dat is een gevraagde actie en mag je zien gebeuren. Let op dat je zo'n knop dan wel als `onClick={() => load()}` schrijft, anders komt het klik-event als eerste argument binnen.

### De ketting: prospect, lead, opdracht, facturatie (september 2026)
- **Elk record sluit zichzelf af zodra er een opvolger is.** "Maak opdracht aan" bij een gewonnen lead zet die lead op de fase **`omgezet`** ("Omgezet naar opdracht", `opBord: false`), "Maak factuur aan" bij een afgeronde opdracht zet die opdracht op **`gefactureerd`**. Dat gebeurt server-side in `promoteCrmRecord`, met een activiteit erbij, zodat het ook klopt als het ergens anders vandaan wordt aangeroepen.
- **Waarom:** de kolom Gewonnen liep vol met werk dat allang als opdracht liep. Nu is Gewonnen een werklijstje: gewonnen, maar nog geen opdracht van gemaakt. Hetzelfde geldt voor Opdrachten en gefactureerd werk.
- **De lead verdwijnt niet.** Hij staat achter "Toon afgesloten fases" in de kolom Omgezet naar opdracht, met de koppeling naar de opdracht. Het zijn bewust twee records: een lead is hoe het werk binnenkwam (pogingen, reacties, fase), een opdracht is het werk zelf (uitvoeren, factureren). Zo werkt een gangbaar CRM ook.
- Eenmalig rechtgezet op 18 september 2026: tien gewonnen leads die al een opdracht hadden staan nu op `omgezet`. De vijf zonder opdracht bleven op Gewonnen staan.
- **De fase `omgezet` heet in het scherm "Afgerond"** en is groen met een wit vinkje. Dat vinkje komt uit `StatusIcon` voor de groep `Done`, dus het volgt vanzelf uit de fasedefinitie.

### Een lead afsluiten: reden en blocklist (september 2026)
- **Archief vraagt om een reden.** Zet je een lead op Archief (via de statuskiezer of door hem op het bord te slepen), dan vraagt de Dash waarom er niets uit gekomen is, met een paar voorzetjes (geen reactie, te duur, naar een ander gegaan, geen budget). De reden gaat naar de kolom **`afsluit_reden`** (migratie `20260918_crm_afsluit_reden.sql`) en staat daarna op de kaart.
- **Blocklist vraagt twee dingen:** eerst de reden (die gaat naar `contact_status_reden`, want dat gaat over de relatie), en daarna apart: **"Contact op blocklist zetten?"** met de gekoppelde contacten en bedrijven erbij. Zeg je ja, dan krijgen die ook `contact_status = 'blokkade'` met dezelfde reden. Dat is bewust een losse vraag: een lead blokkeren is iets anders dan iemand nooit meer benaderen.
- Beide vragen zitten in `vraagFaseVelden()` in `CrmRecordsPage`, gebruikt door zowel `StatusPicker` als het verslepen (`verplaatsNaarFase`), zodat het niet uitmaakt hoe je de fase verandert. Annuleren laat de fase staan.
- `melding.vraagTekst()` (in `components/MeldingProvider.tsx`) is het invoervenster daarvoor: zelfde venster als een bevestiging, met een tekstveld en klikbare suggesties. Enter bevestigt, shift+enter is een nieuwe regel.
- Zolang de migratie niet gedraaid is werkt alles door zonder de reden (`redenKolomBestaat` in `lib/crm/store.ts` en de terugval in `/api/crm/records`), maar een poging om er wél een te bewaren geeft een duidelijke fout in plaats van stilletjes niets te doen.

### CrmRecordsPage features
- **Detailkaart (september 2026):** 1320px breed, vaste hoogte (`h-[90dvh]`), drie kolommen vanaf `xl`: werk (AI-beoordeling, beschrijving, notities) | details op een lichte lavendeltint (contactstatus, relaties, deadline, velden, uren, labels) | activiteit. Op `lg` schuift de activiteit onder de details, daaronder is het één scrollende kolom. Fase, "voor welk bedrijf" en de opvolgknoppen staan in de kop. Kopjes via `DetailSectie`, invoervelden via `VELD_INPUT` uit `lib/crm/stijl.ts`: altijd wit met een lichte rand, nooit de zware `.input` (kaartkleur met donkere rand). Vlakken zoals de AI-kwalificatie en de detailkolom zijn heel licht lila of grijs met een lichte rand; alles wat je invult is wit. Geldt ook voor het nieuw-recordformulier en de opvolgpopup (`OpvolgControls.tsx`). "Toegewezen aan" is weg: er is maar één gebruiker.
- **AI-kwalificatie is standaard ingeklapt** tot één regel (score en branche). De kop klapt hem uit; open of dicht wordt per browser onthouden (`crm-ai-kwalificatie-open`). Hij nam eerst de halve werkkolom in.
- **Beschrijving is een wit tekstvlak dat je zelf bijwerkt** (`raw.description`), altijd zichtbaar, ook als hij leeg is. Opslaan gaat mee met de knop Opslaan, net als Notities; hij wordt alleen meegestuurd als hij gewijzigd is.
- **Terugzetten** (opdracht terug naar de lead, factuur terug naar de opdracht) staat in de detailkaart, als icoon op de bordkaart en in de selectiebalk van de lijst. Alle drie lopen via `zetPromotieTerug` / `terugzettenApi`.
- Lijst (gegroepeerd op status) + Board view, zoeken, status-filter dropdown
- Kolomsortering (klik op kolomkop), bulk-selectie met bulk status/verwijderen
- Detail-modal: naam, status, notities (dashboard-only, in `raw.notes`), deadline, bewerkbare custom fields (dropdown/labels/datum/tekst/bedrag), relatiepaneel, uren-koppeling, promote (lead -> opdracht -> factuur)
- Custom fields schrijven: PATCH `/api/crm/records/[id]` met `custom_fields: [{id, value}]`; dropdowns willen option-id's, labels arrays van option-id's, datums ms-timestamps

## Factuur-PDF: pagina-opbouw (BELANGRIJK)
- De afsluitende regel (`.footer`, met KVK/BTW/IBAN en het factuurnummer) hoort **alleen op de laatste pagina**. Nooit als herhalende paginavoettekst op elke pagina. Dit geldt voor de urenpagina-generator én voor de factuur-skills.
- Marges komen van `@page` (13mm/13mm/11mm), niet van padding op `.page`. Met padding krijgt alleen de eerste pagina witruimte en plakt een tweede pagina tegen de bovenrand.
- `.page` in print: `width:auto`, geen padding, `min-height:271mm!important`. Die `!important` is nodig omdat de basisregel voor `.page` ná het `@media print`-blok staat. Op precies 273mm rolt er door afronding een lege pagina uit.
- Verder: `thead{display:table-header-group}`, `tbody tr` en de blokken totalen/betaling breken nooit middenin af.
- Het WGB-sjabloon (`wgbFactuurHtml.ts`) houdt `@page{margin:0}`, anders loopt de groene hero niet meer door tot de paginarand. Daar staan alleen de afbreekregels.
- Het werkbestand voor Chrome gaat naar `~/Library/Caches/daley-dash/`, nooit naar de facturenmap: daar horen alleen PDF's. Geldt voor `genereerFactuurPdf` én `scripts/genereer-factuur.mjs`.
- Logo's staan als data-URI in `lib/pdf` (`tdeLogo.mjs`, `dpLogo.mjs`, `wgbLogo.ts`) en worden nooit uit een HTML-bestand gelezen.

## Factuur bewerken: gegevens en PDF lopen altijd gelijk (september 2026)
- Op de factuurdetail staan twee knoppen met elk een eigen taak. **Bewerken** past de inhoud aan (klant, regels, datums, betaallink). **Indeling aanpassen** (de sleepbare editor) verschuift alleen blokken op de PDF, tekst kan daar niet. Tijdens het bewerken is de indelingsknop verborgen, want de editor leest uit Supabase en ziet niet opgeslagen wijzigingen niet.
- **Elke wijziging aan iets wat op de PDF staat maakt meteen de PDF opnieuw**, server-side in `PATCH /api/facturen/[id]` (lijst `PDF_VELDEN`). Status, omzetdatum en betaaldatum staan niet op de PDF en slaan dat over. Aanleiding: Bewerken schreef alleen naar Supabase, dus in de map bleef een verouderde PDF staan.
- Beide wegen lopen door `slaFactuurPdfOp()` in `lib/pdf/factuurPdfOpslaan.ts`. Die controleert of Chrome echt een verse PDF heeft geschreven (Chrome geeft zelf geen fout terug), en verplaatst een PDF die na de wijziging op een andere plek hoort (andere kwartaalmap of bestandsnaam) naar de macOS-prullenbak, zodat er geen twee versies van één factuur in het archief staan.
- Mislukt de PDF, dan blijft de wijziging in Supabase staan en meldt het scherm dat de PDF achterloopt. Nooit stil laten falen.
- **Verandert het aantal regels, dan gaat `layout_overrides` terug naar null** (de standaardindeling). De editor bewaart vaste posities in mm; met meer regels viel de tabel anders over het betaalblok.
- **De editor stuurt `geladenOp` (updated_at) mee** bij opslaan. Is de factuur intussen via Bewerken gewijzigd, dan weigert `regenerate-pdf` met 409 en vraagt om herladen.
- **Een verstuurde factuur** (`VERSTUURDE_STATUSSEN`, nu in `lib/types.ts`) vraagt bij opslaan eerst om bevestiging, want je overschrijft een PDF die de klant al heeft.
- Regels bewaren bij opslaan ook `datum` en `eenheid`. Die vielen eerst weg, waardoor een factuur uit uren bij Bewerken zijn werkdatums en uurweergave kwijtraakte.

## Dashboard en Financieel (september 2026)
- **Het dashboard is de pagina voor vandaag**: wat moet ik doen en welk geld ligt klaar. **Bovenaan staat sinds 18 september 2026 weer de omzet** (`components/dashboard/OmzetBlok.tsx`): dit jaar, de gekozen maand met pijltjes, verwachte omzet, en een staafje per maand (klik kiest de maand). Daley vond het dashboard zonder omzet onduidelijk. De tabel per maand, betalingen en btw blijven op `/financieel` (sidebar: Financieel > Overzicht).
- Het dashboard vult vanaf `xl` de schermhoogte (`min-h`), met "Vandaag oppakken" als rij die meerekt maar minstens 10rem houdt. Op een lager scherm scrolt de pagina liever dan dat dat blok verdwijnt.
- Indeling (`app/(dashboard)/page.tsx`), vanaf `xl` een raster van 3 kolommen: links **Omzet**, **Geld dat klaarligt** (uren te factureren, offertes te factureren, openstaand, te laat; incl. btw, open uren met 21% aangenomen), **Vandaag oppakken** (`components/dashboard/VandaagOppakken.tsx`: acties uit `/api/acties` plus leads waarvoor `moetVandaagOpgepakt()` geldt), **Pijplijn** (offertes verstuurd, leads in gesprek, open leads, MRR) en **Recente offertes en facturen** (4 elk). Rechts over de volle hoogte de to-do list. Vandaag oppakken is de rij die meerekt en zelf scrolt; op telefoon staat alles onder elkaar met de to-do list direct na het geld.
- `/financieel` (`app/(dashboard)/financieel/page.tsx`): omzet dit jaar en per maand, verwachte omzet, te laat, omzet per maand (tabel), verwachte omzet per maand, betalingen, BTW opzij (alleen onder TDE) en abonnementen.
- Nieuwe cijfers voor het dashboard komen uit `getFactuurStats`: `overdueBedrag`, `openUren`, `openUrenIncl`.

## Nog te factureren van akkoord-offertes (september 2026)
- **Restant = offertebedrag min de gekoppelde facturen** (`facturen.offerte_id`, geannuleerde niet meegeteld). Berekening op één plek: `berekenFacturatie()` / `haalFacturatie()` in `lib/offertes/facturatie.ts`. Verschillen onder € 1 (`RESTANT_MARGE`) tellen niet.
- De dashboardtegel heet "Nog te factureren" (`nogTeFacturerenAantal`, `nogTeFactureren` uit `getOfferteStats`). De oude tegel "Akkoord" telde elke goedgekeurde offerte volledig op, ook als hij al helemaal gefactureerd was.
- **Verwachte omzet** (`getFactuurStats`) telt van een akkoord-offerte alleen het restant; een verstuurde offerte zonder factuur volledig. Eerder telde één gekoppelde factuur (bv. een aanbetaling van 50%) als "helemaal gefactureerd" en viel de andere helft weg.
- **Koppelen** doe je op de factuurkaart met "Hoort bij offerte" (`components/facturen/OfferteKoppeling.tsx`, slaat direct op via PATCH `offerteId`, `null` ontkoppelt; geen nieuwe PDF want het staat er niet op). De assistent kan het ook. Facturen uit uren en uit de skills krijgen geen offerte, die koppel je dus zelf.
- **Restant vervalt:** op de offerte (`components/offertes/OfferteFacturatie.tsx`, route `/api/offertes/[id]/facturatie`) zet je een restant dat nooit gefactureerd gaat worden op vervallen, bv. bij korting of een kleiner project. Kolom `offertes.restant_vervallen_op` (migratie `20260918_offerte_restant.sql`). Zonder migratie rekent alles door alsof niets vervallen is, en geeft de knop een duidelijke fout.

## Factuurnummering en concepten (BELANGRIJK, herzien september 2026)
- Het datumdeel in een factuurnummer is de **factuurdatum**, niet de dag waarop je hem aanmaakt. Dat geldt voor de Dash én voor de factuur-skills (tde-factuur, wgb-factuur, daley-factuur).
- Tel volgnummers altijd op het datumdeel in het **nummer** (`number ilike 'F-260731-%'`), nooit op de kolom `date`. Tellen op `date` gaf dubbele nummers zodra de factuurdatum in de toekomst lag. Enige nummerbron is `volgendNummer()` in `lib/supabase/factuurNummer.ts`, gebruikt door zowel `/api/factuur-van-uren` als `/api/facturen` (de losse "Nieuwe factuur"-pagina).
- **Er is geen aparte conceptreeks meer.** Elke factuur, ook een concept, krijgt bij aanmaken meteen een echt nummer uit de bedrijfsreeks (F-JJMMDD-XX) en de PDF gaat altijd naar de kwartaalmap. Of een factuur de deur uit is, zeg je uitsluitend via het `status`-veld (`concept`, `verzonden`, ...). Dit verving het oude systeem met een losse C-JJMMDD-XX-reeks en een `_Concepten`-map, dat in de praktijk verwarrend bleek: het nummer op de factuurkaart liep niet vanzelf synchroon met een handmatige statuswijziging.
- Uren op een concept blijven `gefactureerd = false` tot de status verandert. Zodra een factuur van `concept` naar een andere status gaat (via de statuskiezer op de factuurkaart, `updateFactuur` in `lib/supabase/facturen.ts`), boekt diezelfde functie de gekoppelde uren automatisch af (`gefactureerd = true`) op basis van het factuurnummer. Er is geen aparte "Definitief maken"-actie meer nodig, dat ging op in een gewone statuswijziging.
- **"Open in editor"** (derde knop in de factuurpopup op `/uren`, september 2026): `POST /api/factuur-van-uren` met `inEditor: true` legt de factuur volledig vast (echt nummer, regels, uren afgeboekt) maar slaat de PDF-stap over. De popup opent daarna `/api/facturen/[id]/editor?nieuw=1`; daar heet de opslaanknop "Factuur opslaan" en maakt `regenerate-pdf` de PDF voor het eerst. Het tabblad wordt al bij de klik geopend (`window.open` binnen de gebruikersactie), anders blokkeert de browser hem na de fetch.

## Klanten zijn bedrijven (september 2026)
- **De losse pagina Klanten is weg.** Een klant is een bedrijf in CRM > Bedrijven, de contactpersonen staan bij Contacten en hangen aan hun bedrijf. `/klanten` stuurt alleen nog door naar `/crm/bedrijven`. Aanleiding: Klanten, Bedrijven en Contacten was drie keer hetzelfde.
- **`uren_klanten` blijft bestaan, als de uren- en factuurkant van een bedrijf:** uurtarief, klantnummer, t.a.v., factuur-e-mail en factuuradres. Die komen op de urenfactuur. De koppeling is `uren_klanten.crm_record_id` naar `clickup_crm_records` (entity_type `company`), één uren-klant per bedrijf (unieke index). Migratie `20260918_uren_klanten_crm_record.sql` koppelt de bestaande klanten eerst op naam en anders via de oude `crm_bedrijf_id`.
- **Bewerken doe je in de detailkaart van het bedrijf**, blok "Urenregistratie en facturatie" (`components/crm/UrenKlantBlok.tsx`), met een eigen opslaanknop. Daar staan ook de cijfers die op Klanten stonden: uren, gefactureerd, aantal facturen en offertes, en wat nog openstaat. Offertes en facturen dragen alleen een klantnaam, dus die worden op naam gevonden. Een bedrijf dat er nog niet in staat voeg je daar toe met "Toevoegen aan urenregistratie".
- **Op `/uren` kies je een klant uit je CRM-bedrijven.** `GET /api/crm/bedrijven?lite=true` geeft nu de CRM-bedrijven (id is het CRM-record, geblokkeerde bedrijven vallen weg), niet meer de importtabel. Een nieuwe uren-klant krijgt `crmRecordId` mee. Handmatig een klant zonder bedrijf aanmaken kan nog, maar is de uitzondering.
- Zolang de migratie niet gedraaid is, vinden `/uren` en het blok de klant op naam (`crmBedrijfVan` in de urenpagina), en geeft een nieuwe klant aan een bedrijf koppelen een duidelijke fout.
- **Eén klantnummer per bedrijf, op één plek: `uren_klanten.klantnummer`.** Het CRM-veld Klantnummer (oude ClickUp-import) wordt niet meer getoond (`EditableFieldsPanel` filtert het weg bij bedrijven) en de kolom Klantnr op de bedrijvenlijst leest alleen `uren_klanten`. Het was misgegaan: Fitness de Kloek stond op de facturen als FKL001 en in het CRM als FKL003. `scripts/klantnummers-samenvoegen.mjs` (proef, of `--apply`) zet de oude nummers over, met de factuur-PDF als leidend, en maakt het CRM-veld daarna leeg. Een bedrijf met een klantnummer maar zonder uren krijgt een gearchiveerde uren-klant, zodat hij niet tussen de tabs van /uren staat.

## Urenregistratie: overzicht als startpagina (september 2026)
- **`/uren` opent op de tab Overzicht** (`components/uren/UrenOverzicht.tsx`), niet meer op de eerste klant. Daarachter staan de klanten als losse tabs, als sheets in Excel. `activeKlantId = null` is het overzicht; na verversen blijft een geopende klant open.
- Bovenaan het totaal: open uren (met hoeveel daarvan deze maand), te factureren ex. en incl. btw, en het aantal klanten met open uren. Daaronder per klant een blok (twee naast elkaar vanaf `lg`), gesorteerd op openstaand bedrag. Klik op een blok opent de klant.
- **Open = nog niet gefactureerd, los van de maand.** De urenregistratie is bedoeld om elke maand je uren door te geven, maar uren uit augustus die nog niet gefactureerd zijn horen er gewoon bij. Zodra er een factuur van gemaakt is vallen ze eruit (`gefactureerd = true`, projecten `status = gefactureerd`). De pagina haalt al alleen open uren en actieve projecten op; het overzicht telt die op, met het uurtarief per regel.
- Een gearchiveerde klant staat alleen in het overzicht als er nog iets openstaat, anders vergeet je geld dat nog ligt.

## Urenregistratie: klanten archiveren (september 2026)
- Een klant waar voorlopig geen uren voor komen **archiveer** je in plaats van hem te verwijderen. Kolom `uren_klanten.gearchiveerd_op` (migratie `20260911_uren_klanten_archief.sql`): leeg is actief, een datum betekent geparkeerd. De uren, projecten en facturen blijven gewoon staan.
- Op `/uren` staan drie dingen naast elkaar, alledrie als icoon: **Nieuwe klant** (erbij), **Archiveren** (parkeren, `Archive`) en **Verwijderen** (`UserX`, gooit ook alle regels weg). Archiveren vraagt bewust niet om bevestiging, want de knop ernaast draait het terug; verwijderen doet dat wel, want dat is definitief.
- Gearchiveerde klanten vallen uit de rij tabs en staan achter de archiefknop met de teller ernaast. Daar haal je ze met één icoon terug. Kies je in "Nieuwe klant" een CRM-bedrijf dat al aan een gearchiveerde uren-klant hangt, dan wordt die vanzelf teruggehaald: er weer bij zetten is hetzelfde.
- `getUurKlanten()` geeft **standaard alleen de actieve klanten terug**; `?archief=1` op `/api/uren-klanten` haalt ze er allemaal bij. De urenpagina vraagt alles op en splitst zelf (voor de teller), en het blok in de bedrijfskaart toont een gearchiveerde klant met een melding.
- Zolang de migratie niet gedraaid is, valt **lezen** terug op het gedrag zonder kolom (iedereen actief), maar geeft **archiveren** een duidelijke fout in plaats van stilletjes niets te doen. Je zou anders denken dat de klant geparkeerd staat terwijl hij gewoon in de lijst blijft.

## Assistent in de Dash (september 2026)
- **Een chatknop rechtsonder op elke pagina** (`components/assistent/AssistentKnop.tsx`, gemount in `app/(dashboard)/layout.tsx`). Daley typt wat ze wil ("maak een factuur voor ... met de open uren") en de assistent zoekt het op en zet het klaar. Voorlopig alleen voor facturen: maken, wijzigen, PDF opnieuw in de map, uren en offertes koppelen.
- **Draait op het Claude-abonnement** via de lokale `claude` CLI, net als de leadkwalificatie. Per bericht één run (`lib/assistent/claude.ts`) met `--output-format stream-json`, `--resume` voor het vervolg, vanuit de tmp-map (geen CLAUDE.md). Model: `ASSISTENT_MODEL`, anders `CLAUDE_CLI_MODEL`, anders `claude-sonnet-5`.
- **Hij kan geen code, bestanden of terminal aanraken.** `--tools ""` zet alle ingebouwde tools uit, `--strict-mcp-config` laadt alleen `scripts/dash-mcp.mjs`. Dat is de volledige gereedschapskist: zes leesacties (zoek_klant, open_uren, open_projecten, zoek_facturen, factuur_details, akkoord_offertes) en vier `stel_*`-acties. De MCP-server praat met de Dash-API via `x-dash-secret`; het geheim gaat in een tijdelijk configbestand met mode 600, niet als argument.
- **Voorstel eerst, altijd.** De `stel_*`-acties schrijven alleen een rij in `assistent_voorstellen`, nagekeken door `controleerVoorstel()` in `lib/assistent/voorstellen.ts` (bedragen, verwacht nummer, klantgegevens aangevuld uit uren, facturen en offertes, uren al gefactureerd, datum ver weg). In de chat staat het als kaart (`VoorstelKaart.tsx`); pas de knop roept `/uitvoeren` aan. Die claimt eerst `open -> bezig` in één update, dus een dubbelklik maakt nooit twee facturen, en kijkt het voorstel opnieuw na. Voeg nooit een actie toe die zonder klik iets wijzigt.
- **Eén pad voor facturen.** Aanmaken gaat via `maakFactuur()` (`lib/facturen/maakFactuur.ts`), dat ook door `/api/factuur-van-uren` gebruikt wordt. Wijzigen via `wijzigFactuurMetPdf()` (`lib/facturen/wijzigFactuur.ts`), dat ook achter PATCH `/api/facturen/[id]` zit. Verandert bij een wijziging de factuurdatum van dag, dan krijgt de factuur een nieuw nummer, en `updateFactuur` verhuist de uren en de slug mee.
- Wat Daley met een voorstel deed (uitgevoerd, geannuleerd, mislukt) gaat bij het volgende bericht mee in de prompt (kolom `gemeld`), anders denkt de assistent dat iets nog klaarstaat.
- Gesprekken staan in `assistent_gesprekken` en `assistent_berichten` (migratie `20260918_assistent.sql`); het laatste gesprek komt terug via localStorage. Instructies en huisregels staan los in `lib/assistent/instructies.ts`.
- Eén run per gesprek tegelijk, time-out 5 minuten. Zonder migratie geeft de chat een duidelijke melding.

## Testversie van de Dash (september 2026)
- **Een tweede, volledig losse Dash op poort 3004 met nepdata**, om dingen te laten zien of uit te proberen zonder de echte administratie te raken. Schakelen doe je in Instellingen (Testmodus), dat brengt je naar dezelfde pagina op de andere poort. In test staat er een oranje streep bovenin, een label in de werkbalk en TEST in het tabblad.
- **Bewust een apart proces en geen schakelaar per verzoek:** dan kan geen enkele achtergrondtaak (AI-wachtrij, sync) per ongeluk in live schrijven.
- **Data en login zijn gescheiden.** Inloggen gaat in beide versies via het live Supabase-project (`NEXT_PUBLIC_SUPABASE_URL`), de data komt in test uit `SUPABASE_DATA_URL`. Cookies gelden niet per poort, dus één login werkt voor beide. De keuze zit in `supabaseDataConfig()` in `lib/dashModus.ts`, gebruikt door `lib/supabase/server.ts` en `service.ts`. Maak nooit een Supabase-client voor data die daar omheen gaat.
- **Vangrails:** in test valt de data-client nooit terug op de live variabelen, en weigert hij als de URL het live project (`fvywfygsjslojpvqrpxw`) bevat. Het vulscript en `POST /api/test/reset` werken daarnaast alleen op een lokale URL, en de resetroute geeft 404 in live.
- **De database draait lokaal** (Docker via Colima): `testversie/supabase/config.toml`, poorten 553xx, alleen db, API en Studio (http://127.0.0.1:55323). Kost geen Supabase-projectplek.
- Starten: LaunchAgent `com.daley.daleydash-test` draait `scripts/run-dash-test.sh`: die start Colima en de lokale Supabase als dat nodig is, laadt `.env.test.local` met `node --env-file` (Next overschrijft bestaande omgevingsvariabelen niet, dus test wint van `.env.local`) en start `next dev -p 3004` met `NEXT_DIST_DIR=.next-test`. Logs: `/tmp/daley-dash-test.log`.

### De testversie draait alleen als je hem aanzet (september 2026)
- **De LaunchAgent start niet mee bij inloggen.** `RunAtLoad` en `KeepAlive` staan allebei op false. Eerder stonden ze aan, en dan hield de testversie de hele dag ongeveer 2,6 GB bezet (2 GB voor de Colima-VM, de rest voor de tweede dev server) voor iets wat je die dag misschien niet eens opende.
- **Het schuifje in Instellingen zet hem echt aan en uit.** Daarvoor sprong het alleen naar de andere poort. Aanzetten loopt via `POST /api/test/modus` met `{aan:true}`, dat `launchctl kickstart` doet; het scherm wacht met `wachtTotTestversieDraait()` tot poort 3004 antwoordt en springt dan pas. Een koude start duurt ongeveer 40 seconden, want Colima en Supabase moeten eerst op gang komen.
- **Uitzetten kan alleen vanuit de live Dash.** De testversie kan niet de server zijn die zichzelf afsluit, dan komt er nooit een antwoord terug. Het schuifje in test stuurt je daarom eerst naar 3003 met `testUit=1` in de adresbalk, en `components/TestmodusOvergang.tsx` doet daar de rest. Bouw dit nooit om naar een fetch vanuit de testversie zelf.
- **Afsluiten is meer dan de dev server.** `scripts/stop-dash-test.sh` doet ze op volgorde: `launchctl kill TERM`, dan `supabase stop --workdir testversie` (zonder `--no-backup`, dus de nepdata blijft staan), dan `colima stop`. Pas bij die laatste stap krijg je het geheugen echt terug. Colima gaat alleen uit als er geen containers van een ander project draaien.
- **Na 15 minuten zonder gebruik gaat hij vanzelf uit.** `components/TestHartslag.tsx` stuurt elke minuut een stempel naar `/api/test/heartbeat`, maar alleen als het tabblad in beeld is: een tabblad op de achtergrond telt als niet gebruiken. De stempel staat in `~/Library/Application Support/daley-dash-test/state/laatste-activiteit`, zie `lib/testActiviteit.ts`. LaunchAgent `com.daley.daleydash-test-wacht` draait elke minuut `scripts/test-wachtdienst.sh` en sluit af zodra die stempel ouder is dan een kwartier. Log: `/tmp/daley-dash-test-wacht.log`.
- **De wachtdienst moet eerst kijken of de taak draait, niet alleen of poort 3004 antwoordt.** Tijdens een koude start draait de taak wel maar luistert er nog niets, en zonder die controle brak de wachtdienst elke koude start halverwege af. Dat is precies wat er misging toen dit gebouwd werd.
- Is de testversie ondertussen afgesloten, dan merkt `TestHartslag` dat aan een mislukte stempel en toont een scherm met "Weer aanzetten" (gaat naar 3003 met `testAan=1`) in plaats van je op een dode pagina te laten zitten.
- `/api/test/modus` bestaat alleen in live en geeft 404 in test; `/api/test/heartbeat` precies andersom.
- **In test gebeurt niets naar buiten:** `lib/email.ts` verstuurt niets, de bankkoppeling (`haalToken` in `lib/gocardless.ts`) weigert, en `DALEY_WERK_ROOT` wijst naar `~/Library/Application Support/daley-dash-test/DALEY WERK`, dus PDF's en de bestandssync blijven in de zandbak.
- **Let op wat test erft uit `.env.local`.** Alles wat daar niet in `.env.test.local` overschreven wordt, geldt ook in test. `ADMIN_FACTUREN_PATH` en `ADMIN_OFFERTES_PATH` wezen zo naar de echte administratie, waardoor de testversie echte PDF's kon lezen. Die worden nu in test genegeerd (`envPaths` in `lib/admin/documentPaths.ts` en `facturenBaseVoor` in `lib/pdf/factuurGenerator.ts`) en staan daarnaast op de zandbak in `.env.test.local`. Voeg je een env-variabele toe die naar echte bestanden of diensten wijst, regel dan ook de testversie.
- De nepomzet ligt bewust ver boven Daley's eigen cijfers (rond € 50.000 per jaar), zodat de testversie er nooit uitziet als haar eigen administratie.
- **Nepdata:** `lib/testdata/vulTestdata.mjs`, gebruikt door `npm run testdb:vullen` en de knop "Testdata opnieuw vullen" in Instellingen (alleen in test). Maakt eerst alles leeg. Datums tellen vanaf vandaag, mailadressen eindigen op `.example`. CRM-velden komen uit `testversie/crm-veldsjablonen.json` (alleen velddefinities uit live, geen waarden).
- **De code is gedeeld:** de testversie draait `next dev` op dezelfde projectmap (alleen met `.env.test.local` en `NEXT_DIST_DIR=.next-test`), dus elke codewijziging zit er meteen in. Herstarten hoeft alleen na een wijziging in `scripts/run-dash-test.sh` of in de omgevingsvariabelen.
- **Alleen het schema loopt apart:** draai een nieuwe migratie ook op de testdatabase, met `npm run testdb:migratie supabase/migrations/<bestand>.sql` (dat is psql op poort 55322). Het uitgangsschema (`testversie/schema.sql`) is een dump van live zonder data; opnieuw maken kan via `supabase db dump --linked -s public`, maar die gebruikt het directe IPv6-adres en dat werkt niet vanuit Colima. Zie `testversie/README.md`.

## Werkbank: het IT-handboek (september 2026)

- De Werkbank staat op `/bedrijfsinfo`, tabel `werkbank_secties`, en is Daley's eigen handboek: NAS en backups, vaste poorten, hosting, sleutels, werkafspraken. Elke sectie heeft een `status` (`nagekeken`, `notities`, `openstaand`) en een `gecontroleerd_op`.
- **Hij blijft bij via de routine `werkbank-check`** (`~/.claude/scheduled-tasks/werkbank-check/SKILL.md`, elke maandag rond 8:30). Die draait `scripts/werkbank-check.mjs` en doet er iets mee. Routines draaien alleen als de app openstaat; anders schuift hij door naar de eerstvolgende keer.
- **Het script leest alleen en verandert nooit iets.** Het legt de poortentabel naast alle `package.json`-scripts en `launch.json`-bestanden in `~/Developer` plus de globale `~/.claude/launch.json`, kijkt met `ssh diskstation` naar vrije ruimte en belasting, controleert of de sleutelpaden nog bestaan, en meldt secties ouder dan 90 dagen. Exitcodes: 0 klopt, 1 verschillen, 2 Dash onbereikbaar.
- **De scheiding is: feiten mogen automatisch, tekst nooit.** De routine voegt rijen toe aan de poortentabel en vervangt de lijst onder "Hier zit drift in". De inleiding, de afspraken en elke andere lopende tekst blijven van Daley. Herschrijf die niet, ook niet "even netter".
- **De routine vult alleen aan, hij corrigeert geen bestaande rijen.** Dat is met opzet: de namen op schijf zijn rommeliger dan Daley's tabel (`hairless-and-skin` tegenover "Hairless & Skin", `pgs-moodboard` tegenover "PGS Housing moodboard"), en automatisch overschrijven zou het handboek juist slechter maken. Een rij die niet meer klopt gaat naar de to-do list, niet de tabel in.
- **Namen worden gegroepeerd voor het bepalen van een botsing** (`sleutel()` en `groepeer()` in het script). "Montung-website" en "montung-dev" zijn hetzelfde project op dezelfde poort, geen botsing. Zonder die groepering stond de halve driftlijst vol met botsingen die geen botsing waren.
- **Alles waar een oordeel voor nodig is wordt één taak** in de to-do list, titel begint met "Werkbank:". De routine werkt een bestaande openstaande taak bij in plaats van er elke week een nieuwe naast te zetten. Geen verschillen betekent geen taak.
- **Het tellen van `node_modules` op de NAS staat er bewust niet in:** dat is een zware zoekopdracht over SMB, en de Werkbank raadt dat zelf af. Dat blijft handwerk.
- De punten onder "Nog aan te vullen" krijgt een routine nooit gevuld, dat zijn stukken die alleen Daley kan schrijven. Ze worden hooguit als regel meegestuurd in een taak die er toch al is.

## To-do list (september 2026)
- `/taken` heet in de UI "To-do list" (sidebar en paginatitel). Route, tabel `taken` en de code-namen blijven `taken`.
- Titels pas je aan door op de regel te klikken (of het potloodje). Enter of wegklikken slaat op, Escape annuleert.
- **Slepen verplaatst alleen tussen de to-do list en Vandaag, nooit de volgorde** (september 2026, Daley's keuze). Elke ochtend sleep je wat je vandaag doet naar Vandaag (`scheduled_date` = vandaag), en terug slepen haalt de datum weer weg. Binnen dezelfde lijst gebeurt er niets. Naast het slepen staat per rij een knop (zon: naar Vandaag, pijl: terug), want op een touchscreen werkt slepen niet.
- **Standaardvolgorde:** kolom `positie` (laag = bovenaan, migratie `20260917_taken_volgorde_prioriteit.sql`); een nieuwe taak komt bovenaan. Hij is niet meer met de hand te veranderen. Vandaag staat op prioriteit, urgent eerst.
- **Wat je niet afvinkt, schuift door:** Vandaag toont alles met een datum tot en met vandaag, met "sinds [datum]" bij taken van een eerdere dag. Afvinken vanuit Vandaag zet de datum op vandaag, zodat "Afgerond vandaag" (`scheduled_date` = vandaag) alleen de taken van vandaag toont en morgen weer leeg begint.
- **Indeling (september 2026), naar Daley's oude Notion-lijst:** vanaf `lg` staat links de to-do list als tabel op twee derde van de breedte, rechts Vandaag op een derde (`lg:grid-cols-3`, tabel `lg:col-span-2`).
- **De tabel** heeft de kolommen Taak, Prioriteit, Status, Bedrijf en Deadline (`TabelRij`), met een vaste `min-w` zodat hij op smalle schermen zijwaarts scrolt. Vandaag gebruikt de smalle `VandaagRij`: alleen een gekleurd vlaggetje en de deadline als die er is. Keuzes openen `Keuzelijst`, die `fixed` staat zodat de scrollende kaart hem niet afknipt.
- **Filter vlak boven de tabel, onder het invoerveld: Alles (standaard), Urgent, Hoog, Middel, Laag, Afgerond** (`TAKEN_TABS`). Alles = de hele open backlog, een prioriteit = open taken met precies die prioriteit, Afgerond = alle afgevinkte taken. In Afgerond is niets te verslepen en staat geen invoerveld. Filter je op een prioriteit, dan krijgt een nieuwe taak die prioriteit, anders verdwijnt hij meteen uit beeld.
- **Sorteren (september 2026):** klik op een kolomkop (Taak, Prioriteit, Status, Bedrijf, Deadline). Eerste klik de natuurlijke volgorde (A tot Z, urgent eerst, niet gestart eerst, vroegste deadline eerst), tweede klik andersom, derde klik terug naar de standaardvolgorde. Lege waarden staan altijd onderaan, bij gelijke waarden blijft de standaardvolgorde staan (`sorteerOpKolom` in `lib/taken.ts`). De keuze wordt per browser onthouden in localStorage (`taken-sortering`).
- Sorteren en slepen staan los van elkaar: ook in een gesorteerde lijst sleep je taken naar Vandaag. Boven de tabel staat dan "Sortering uit".
- **Prioriteit** (`prioriteit`: urgent, hoog, middel, laag, of leeg) staat los van de deadline, met opzet: een taak kan dringend zijn zonder datum, of een datum hebben zonder haast. Zonder sortering geldt de standaardvolgorde. Kleuren in `PRIORITEITEN` in `lib/taken.ts`: urgent rood, hoog oranje, middel blauw, laag grijs.
- **Status** (`status`: `niet_gestart` of `bezig`, leeg = niet gestart) kent alleen open standen. **Afgerond is de bestaande kolom `done`**, want Vandaag en de dashboardstrook leunen daarop. Afgerond kiezen in de statuskolom zet `done`, een andere status zet hem weer open. `statusVan()` maakt er één weergave van.
- **Bedrijf** (`bedrijf`: tde, wgb, daleyphotography) toont de vaste bedrijfskleuren uit `lib/companies.ts`. Taken worden bewust niet gefilterd op de bedrijfskiezer, het is een label.
- **Deadline** (`deadline`, date) opent de datumkiezer van de browser; verlopen en nog open is rood.
- Migraties: `20260917_taken_volgorde_prioriteit.sql` en `20260918_taken_status_bedrijf_deadline.sql`.
- Zonder migratie valt lezen terug op aanmaakdatum; een prioriteit zetten geeft dan een duidelijke fout.
- Op het dashboard staat de to-do list als kolom rechts (`components/TodoWidget.tsx`): alles voor vandaag, daaronder hooguit 6 uit de backlog. Toevoegen vanaf het dashboard zet de taak op vandaag; afvinken van een backlogtaak ook, zodat hij onder "Afgerond vandaag" landt.
- "Vandaag" is de lokale datum (`vandaagLokaal`), nooit `toISOString`: dat is UTC en gaf na middernacht nog gisteren.

## Profiel (september 2026)
- **Het bolletje onderin de sidebar** (`ProfielMenu` in `components/Sidebar.tsx`) opent een menu naar boven, zoals bij Claude en ChatGPT: Profiel, Instellingen, Uitloggen. De losse knop Instellingen en de uitlogrij zijn daarin opgegaan.
- **Profiel** (`components/ProfielModal.tsx`) bewaart persoonlijke gegevens: naam, roepnaam, wat je doet, telefoon, geboortedatum, adres, website en socials, plus voorkeuren voor de assistent. Bedrijfsgegevens (KVK, BTW, IBAN) blijven in Instellingen, uit `lib/companies.ts`.
- **Opslag: `user_metadata.profiel` van de Supabase-login** (`lib/profiel.ts`), geen tabel en dus geen migratie. Inloggen gaat in live en test via hetzelfde project, dus het profiel is in beide gelijk. Die metadata gaat mee in elk sessietoken: zet er geen foto of lange teksten in.
- Roepnaam en voorkeuren gaan mee met elk bericht aan de assistent (`profielTekst` in `lib/assistent/instructies.ts`), afgekapt, en ondergeschikt aan de vaste regels.

## Data-afspraken
- **Montungs administratie hoort niet in de Dash.** Dat is een aparte VOF (BB-Import) met een eigen BTW-nummer en een eigen systeem in montung-voorraad. **Montung als bedrijf in het CRM mag wel** (september 2026): Daley kan werk doen voor Montung, en Frank van Naarden en Daley staan er als contactpersonen. Bleijenberg is de oude naam van Montung en staat bewust niet meer in het CRM; zet het er niet terug. De Montung-mappen staan niet in `lib/admin/documentPaths.ts`, en `getFacturen` + `getFactuurStats` filteren net als de BTW-module op `EIGEN_BEDRIJVEN` (`lib/btw.ts`). Voeg Montung hier nooit aan toe.
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
- **Auth staat AAN sinds 8 september 2026.** De dev-server luistert op `0.0.0.0` (`dev` en `start` in package.json), zodat de Dash ook op de telefoon via het wifi-netwerk werkt: `http://<ip-van-de-mac>:3003`. Daarom is login verplicht.
- `lib/supabase/middleware.ts` is de enige toegangscontrole: deny-by-default, met een korte allowlist (login, publieke offertepagina's `/offerte/` en `/o/`, `/api/offerte-public/`, cron, manifest/sw/logo's). Geen sessie: pagina's gaan naar `/login?next=...`, API-routes geven 401. Voeg nooit iets aan de allowlist toe dat bedrijfsdata teruggeeft.
- Er is bewust geen uitzondering voor localhost: de middleware ziet alleen de Host-header, en die is te vervalsen. Op de Mac log je één keer in, daarna ververst Supabase de sessie zelf.
- `lib/supabase/server.ts` gebruikt nog steeds de service-role key (RLS omzeild). Dat kan alleen omdat de middleware alles dekt. Haal de middleware nooit weg zonder deze client sessiegebonden te maken.
- **Scripts** (LaunchAgent `com.daley.lead-ai`, `scripts/kwalificeer-leads.mjs`) sturen de header `x-dash-secret` mee met `CRON_SECRET` uit `.env.local`. Nieuwe scripts die de API aanroepen moeten dat ook doen.
- Er is één Supabase-gebruiker: `hello@thedaleyedit.nl`.

### Verwijderen van facturen (BELANGRIJK)
- Alles loopt via `verwijderFactuurVeilig()` in `lib/supabase/facturen.ts`. Nooit rechtstreeks `.delete()` op `facturen`.
- Die helper zet eerst een volledige kopie in `facturen_prullenbak`, geeft de gekoppelde uren weer vrij, en weigert verstuurde facturen (`verzonden`, `herinnering-verzonden`, `betaald`, `te-laat`) zonder expliciete bevestiging.
- **De bestandssync verwijdert niets.** Ontbreekt een PDF, dan meldt hij dat en zoekt hij het nummer eerst in de hele administratie. Een verplaatst bestand is geen verwijderde factuur. Zie `docs/audit-2026-08-01.md` punt 1b voor wat er misging.
- **De map is leidend, maar jij beslist (september 2026).** Een factuur waarvan de PDF nergens meer staat krijgt op `/facturen` een roze rij met het label "Geen PDF"; alleen verplaatst is een oranje rij met "PDF verplaatst". In de melding erboven staat naast "PDF opnieuw opslaan" ook "Klopt, factuur verwijderen", want wie een PDF weggooit omdat de factuur niet klopt, wil hem meestal ook uit de Dash. Die knop loopt via `verwijderFactuurMetBevestiging()` (`components/facturen/verwijderFactuur.ts`), dezelfde functie als de prullenbakknop op de factuurkaart, dus met prullenbakkopie en de extra vraag bij een verstuurde factuur.
- Bij het openen van de facturenpagina draait `runSync(undefined, { alleenControle: true })`: alleen de controle op ontbrekende PDF's, zonder import. Een volledige sync stuurt elke nog niet geïmporteerde PDF naar Gemini, en dat hoort niet bij elk paginabezoek.

### Bestandssync: wat wel en niet ingelezen wordt (september 2026)
- **De Dash leest alleen administratie vanaf 2026 in.** `EERSTE_DASH_JAAR` in `app/api/admin/sync/route.ts` zet die grens. Nummers met een jaar ervoor (`OF-25...`, `F-25...` en ouder) worden overgeslagen en meegeteld als `overgeslagenOud`, samen met de oude factuurreeks (`2020F-`, `2024F-`).
- **Haal die grens niet weg om oude PDF's binnen te halen.** Het nummer ín die oude bestanden wijkt bij 71 van de 72 offertes af van de bestandsnaam (`OF-0011`, `OF-231027`, zelfs de typfout `OF-271101`), en varianten als `_reacties` en `(kopie)` dragen hetzelfde nummer. Importeren levert dus records met verkeerde nummers en dubbelen op. Wil je ze alsnog in de Dash, gebruik dan een eenmalig script met het nummer uit de bestandsnaam als leidend en een lijst vooraf om te controleren.
- **Elk niet herkend bestand kost een AI-verzoek.** `extractDoc` stuurt het naar Gemini zolang `GEMINI_API_KEY` gezet is, en de terugval `pdftotext` staat niet in de PATH van de LaunchAgent. Voor de grens leverde dat bij elke achtergrondsync 72 verzoeken op en `failed: 72`.
- **Mappen die met `_` beginnen slaan scan én sync over.** Dat zijn werkmappen, geen archief (`_Teruggezet`, en `_Verzonden origineel` voor een PDF zoals die verstuurd is).

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

## Responsive (september 2026)
- De Dash is een PWA en moet op telefoon (375-430px) en tablet werken. De shell (sidebar met hamburger onder `md`, `pt-12` voor de hamburgerbalk) zit in `app/(dashboard)/layout.tsx` en `components/Sidebar.tsx`.
- **Werkbalk bovenaan (september 2026):** boven elke pagina staat een lege werkbalk in `app/(dashboard)/layout.tsx`. Die houdt de ruimte vast zodat elke pagina op dezelfde hoogte begint als de bedrijfskiezer in de sidebar (82px). De hoogte staat als `--dash-topbar` in `globals.css` (0 op telefoon, 50px vanaf `md`), want de schermvullende pagina's rekenen ermee via `h-[calc(100dvh-var(--dash-topbar))]`. Verander die hoogte alleen daar, niet per pagina, en gebruik nooit meer een kale `100dvh`.
- **Vaste paginakop (september 2026).** Elke pagina begint gelijk, dus houd je hieraan bij een nieuwe pagina:
  - titel: `<h1 className="font-uxum text-headline text-brand-text-primary">` (28px). Niet `text-sidebar-t` of `text-h2`, en geen icoon ervoor: dat staat al in de sidebar.
  - ondertitel: `<p className="text-body text-brand-text-secondary mt-1">`. Niet `text-sm` en niet `mt-0.5`.
  - paginaroot `p-4 sm:p-6 lg:p-8`, zonder eigen `xl:px-*`. Alle pagina's houden dezelfde linkermarge; compacter maken doe je verticaal, nooit horizontaal.
  - Resultaat op 1728 breed: titel op top 82 en left 252, ondertitel op top 122. Meet met `document.querySelector('main h1').getBoundingClientRect()`.
- **Paginaroot:** altijd `p-4 sm:p-6 lg:p-8`, nooit kaal `p-8`. `.card` heeft `p-4 sm:p-card-padding`.
- **Tabellen:** altijd in een `overflow-x-auto` wrapper met een `min-w-[...]` op de tabel, zodat cellen niet in elkaar gedrukt worden. Nooit `card p-0 overflow-hidden` om een tabel heen: dat snijdt op mobiel de rechterkolommen onbereikbaar af. Gebruik `card p-0 overflow-x-auto`.
- **Kopregels** (titel + knoppen): `flex-col sm:flex-row sm:items-center gap-3`, knoppenrijen `flex-wrap`. Statgrids: `grid-cols-2 lg:grid-cols-4`; blokken naast elkaar: `grid-cols-1 md:grid-cols-2`. Twee kleine invoervelden (postcode/stad, datums) mogen wel `grid-cols-2` blijven.
- **Drawers** (`components/SlideOverPanel.tsx`) zijn op telefoon een bottom sheet over de volle breedte, vanaf `sm` een gecentreerde modal. Gebruik `dvh` in plaats van `vh` voor maximale hoogtes, anders valt de onderkant op iOS onder de adresbalk.
- De CRM-lijst (`CrmRecordsPage`) heeft vaste pixelkolommen en scrolt zijwaarts; dat is bewust.
- Testen: Playwright-MCP op 390x844 (het in-app browservenster laadt de dev-chunks niet altijd). Controleer dat `document.documentElement.scrollWidth` gelijk is aan `innerWidth`.
- **Alles in één scherm op de MacBook Pro 14" (1512x982, breakpoint `xl`):** dat is de standaard werkplek. Elke pagina moet daar passen zonder paginascroll. Overzichtspagina's (dashboard, betalingen, belasting) worden vanaf `xl` compacter (`xl:px-6 xl:pt-5 xl:pb-4`, `xl:gap-4`, `xl:p-4` op kaarten) en zetten blokken naast elkaar. Lijstpagina's krijgen vanaf `lg` een vaste hoogte (`lg:h-[100dvh] lg:overflow-hidden lg:flex lg:flex-col`) waarbij alleen de tabelkaart scrolt (`lg:flex-1 lg:min-h-0 lg:overflow-auto`, `thead` sticky). Meet met Playwright op 1512x982: `document.documentElement.scrollHeight` moet 982 zijn.

## Huisstijl samenvatting
- Sidebar: lavender gradient (`from-brand-lavender-light to-brand-lavender`)
- Pagina achtergrond: licht gradient (`from-brand-page-light to-brand-page-medium`)
- Cards: wit met navy border (`card` class)
- Buttons: primary = paars (`btn-primary`), secondary = wit met navy border (`btn-secondary`)
- Status badges: pastel achtergrond + accent tekstkleur (`pill` class)
- Tekst: navy primair (`text-brand-text-primary`), grijs secundair (`text-brand-text-secondary`)
