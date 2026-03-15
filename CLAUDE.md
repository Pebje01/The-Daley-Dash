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
│   ├── page.tsx            # Dashboard homepage
│   ├── layout.tsx          # Sidebar + page background
│   ├── offertes/           # Offertes overzicht + nieuw formulier
│   ├── facturen/           # Facturen overzicht + nieuw formulier
│   └── klanten/            # Klanten overzicht
├── fonts/                  # Geist (sans) + Uxum (serif)
├── globals.css             # Tailwind + component classes (card, btn, input, pill)
└── layout.tsx              # Root layout met font registratie
components/                 # Sidebar, StatusBadge, FileTypeIcon, OfferteFilesBrowser
hooks/
└── useDirectoryFiles.ts    # React hook voor File System Access API
lib/
├── companies.ts            # Bedrijfsconfiguratie (TDE, WGB, etc.)
├── file-system.ts          # File System Access API utilities + IndexedDB
├── store.ts                # LocalStorage data helpers
├── types.ts                # TypeScript types
└── supabase/               # Supabase client, server, middleware
types/
└── file-system-access.d.ts # TS type declarations voor File System Access API
public/                     # Statische bestanden
middleware.ts               # Auth redirect middleware
```

## Deployment & Architectuur

### Dashboard vs. publieke offertes
- Het **dashboard** (`/(dashboard)/*`) is bedoeld voor lokaal gebruik of afgeschermd op Vercel
- De **publieke offertepagina's** (`/offerte/[id]`) worden live gezet per bedrijfsdomein
- Alles communiceert met Supabase — ook lokaal draaien is prima zolang `.env.local` klopt

### Multi-domein aanpak
- Één Vercel deployment, meerdere domeinen eraan gekoppeld:
  - `wegrewbrands.nl` → WGB offertes
  - `thedaleydash.nl` → TDE offertes
  - etc.
- De offertepagina leest `company_id` uit Supabase en toont automatisch de juiste huisstijl
- Klanten zien: `wegrewbrands.nl/offerte/of-260315-01`

### Dashboard afschermen in productie
- `middleware.ts` beschermt `/(dashboard)/*` via Supabase auth
- Nog toe te voegen: productie-IP-check of extra wachtwoordlaag zodat dashboard alleen voor eigenaar toegankelijk is

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
- `npm run dev` — start dev server op localhost:3000
- `npm run build` — productie build (BELANGRIJK: draai na elke reeks wijzigingen)
- `npm run lint` — ESLint check

## Verificatie (BELANGRIJK)
- Controleer NA ELKE wijziging of de dev server nog draait (`lsof -ti :3000`). Zo niet: herstart met `npx next dev --turbo &`
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
