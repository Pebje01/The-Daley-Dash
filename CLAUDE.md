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
