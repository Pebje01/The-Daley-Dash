# Prompt: IB-aangifte werkblad toevoegen aan The Daley Dash

Kopieer alles vanaf "## Opdracht" naar Claude Code. Lees eerst `CLAUDE.md` en de bestaande `/belasting` pagina voordat je begint.

---

## Opdracht

Bouw een nieuwe pagina `/belasting/aangifte/[jaar]` in The Daley Dash waarin Daley zijn jaarlijkse inkomstenbelasting-aangifte kan voorbereiden. De bestaande `/belasting` pagina blijft bestaan als real-time BTW/IB dashboard voor het lopende jaar; deze nieuwe pagina is specifiek voor het aangifteproces per afgesloten jaar.

Volg de conventies uit `CLAUDE.md`:
- Nederlands UI, geen em dashes
- Supabase is single source of truth
- Huisstijl-tokens uit `tailwind.config.ts` gebruiken, geen hardcoded kleuren
- `card`, `btn-primary`, `btn-secondary`, `input`, `pill` classes gebruiken
- Headlines met `font-uxum`
- Commit messages in het Nederlands

## Context om eerst te lezen

1. `CLAUDE.md` — project-conventies
2. `app/(dashboard)/belasting/page.tsx` — bestaande belasting-pagina (niet aanpassen, alleen als referentie voor styling)
3. `lib/belasting.ts` — bevat `berekenInkomstenbelasting()`, `aggregeerPerKwartaal()`, en constanten voor schijven/kortingen. Hergebruik waar mogelijk; voeg nieuwe berekeningen toe voor jaren 2023 t/m 2026 indien nodig (constanten per jaar als object).
4. `app/api/belasting/stats/route.ts` (en omgeving) — bestaande API voor het belasting-dashboard, als voorbeeld voor datastructuur
5. `supabase-schema.sql` — huidige schema (zie vooral `facturen` tabel met velden `status`, `paid_at`, `subtotal`, `total`, `date`)
6. `components/Sidebar.tsx` — navigatie

## Functionele eisen

### Routing en navigatie

- Nieuwe route: `app/(dashboard)/belasting/aangifte/[jaar]/page.tsx`
- Default redirect: `/belasting/aangifte` → `/belasting/aangifte/{laatste-afgesloten-jaar}` (bijv. 2025 als vandaag 2026)
- Jaarkiezer in header: dropdown met 2023 t/m (huidig jaar). Bij wijzigen navigeren naar andere jaar.
- Sidebar: voeg sub-item toe onder "Belasting" → "Aangifte voorbereiding" met `FileBarChart` of `ClipboardList` icoon. Overweeg een `NavSection` met expand/collapse onder Belasting.

### Pagina-secties (in volgorde, allemaal binnen `card` blokken)

**1. Kop**
- H1 "Aangifte inkomstenbelasting {jaar}"
- Onderschrift met datum laatst bijgewerkt
- Knoppen: "Exporteer PDF", "Reset jaar"
- Jaar-switcher dropdown rechts

**2. Omzet (readonly, auto)**
- Uit Supabase: alle facturen met `date` in het gekozen jaar
- Toon: totale omzet excl. BTW, totale BTW, aantal facturen, uitsplitsing per kwartaal
- Layout: 4 KPI-cards bovenaan (zoals bestaande /belasting)
- Gebruik `aggregeerPerKwartaal` uit `lib/belasting.ts`

**3. Debiteuren per 31 december {jaar}**
- Lijst van facturen met `date` in jaar en nog niet betaald (`paid_at IS NULL` of `status != 'betaald'`)
- Per rij: factuurnummer, klant, factuurdatum, vervaldatum, bedrag incl. BTW, status-pill (open, aangemaand, in incasso, in rechtszaak, oninbaar)
- De status-pill is per debiteur editable en wordt opgeslagen in nieuwe tabel `belasting_debiteur_status` (zie schema onder)
- Totaal debiteuren onderaan, dit bedrag vult automatisch de balanspost "Handelsdebiteuren"
- Button "Markeer als oninbaar" per rij: opent modal met waarschuwing dat dit pas mag na 1 jaar of bij hard bewijs, en vraagt om notitie

**4. Zakelijke kosten**
- Lijst van regels, elke regel heeft: label (tekst), categorie (dropdown), bedrag (numeriek, excl. BTW), datum (optioneel), notitie (optioneel)
- Categorieën: `inkoop`, `software_abonnementen`, `telefoon_internet`, `reiskosten_auto`, `reiskosten_ov`, `representatie_80pct`, `kantoorbenodigdheden`, `contributies_vakliteratuur`, `verzekeringen`, `bankkosten`, `advocaat_juridisch`, `overig`
- Regels kunnen worden toegevoegd, bewerkt, verwijderd (CRUD op `belasting_kosten_regel` tabel)
- Representatie wordt automatisch voor 80% meegerekend in aftrekbare kosten (zakelijke etentjes etc.)
- Subtotalen per categorie, totaal onderaan
- Mogelijkheid om te importeren vanuit de Bonnetjes-map later (niet in deze scope, wel stub-knop "Importeer uit bonnetjes" die voor nu een toast "Binnenkort beschikbaar" toont)

**5. Investeringen en KIA-check**
- Lijst van regels, elke regel heeft: label, bedrag excl. BTW, datum, afschrijvingstermijn in jaren (default 5)
- Voor elk item apart: toont een badge "Telt voor KIA" als bedrag ≥ €450, anders "Directe aftrek" (valt onder kosten, niet investering)
- Onder de lijst:
  - Totaal investeringen dit jaar
  - Als totaal > € 2.901 én ten minste één item ≥ € 450: toon KIA-aftrek = 28% over totaal, met maximum van € 19.778 bij investeringen tot € 70.602 (check Belastingdienst-tabel per jaar)
  - Anders: "Geen KIA dit jaar" met toelichting
- Afschrijving: toon per item het afschrijvingsbedrag dit jaar (lineair = bedrag / termijn), totaal afschrijving telt als kosten

**6. Aftrekposten en voorwaarden**

Checkboxes en invulvelden:
- [ ] Urencriterium voldaan (1.225 uur in onderneming dit jaar) → info-tooltip met uitleg. Vereist voor zelfstandigenaftrek en startersaftrek.
- [ ] Zelfstandigenaftrek (auto aangevinkt als urencriterium = ja). Bedrag per jaar:
  - 2023: € 5.030
  - 2024: € 3.750
  - 2025: € 2.470
  - 2026: € 1.200 (of actuele afbouw)
- [ ] Startersaftrek. Extra velden: "Aantal keren al gebruikt" (0-3). Toont error als 3 al bereikt. Bedrag € 2.123.
- [ ] MKB-winstvrijstelling (altijd aan, auto). Percentage per jaar:
  - 2023: 14,00%
  - 2024: 13,31%
  - 2025: 12,70%
  - 2026: 12,70% (check)
- Oudedagsreserve (FOR): info-card met tekst "Afgeschaft per 1 januari 2023. Bestaande FOR-saldo kan alleen afgebouwd worden." Veld "FOR-saldo per 1-1-{jaar}" (readonly voor 2023+, alleen invulbaar als saldo vóór 2023 bestond). Optie "FOR vrijval dit jaar: € X" die bij belastbaar inkomen wordt opgeteld.

**7. Berekening (readonly, real-time)**

Netjes gestapeld als een winst- en verliesrekening:

```
Omzet excl. BTW                                   € X
Af: Zakelijke kosten (incl. representatie 80%)    € X
Af: Afschrijvingen                                € X
─────────────────────────────────────────────────────
Winst voor ondernemersaftrek                      € X

Af: Zelfstandigenaftrek                           € X
Af: Startersaftrek                                € X
Af: KIA                                           € X
─────────────────────────────────────────────────────
Winst na ondernemersaftrek                        € X

Af: MKB-winstvrijstelling (12,7%)                 € X
Bij: FOR vrijval                                  € X
─────────────────────────────────────────────────────
Belastbaar inkomen uit onderneming                € X

Schijf 1 (36,97% tot € 75.518)                    € X
Schijf 2 (49,50%)                                 € X
Bruto belasting                                   € X
Af: Algemene heffingskorting                      € X
Af: Arbeidskorting                                € X
─────────────────────────────────────────────────────
Geschatte te betalen IB                           € X
```

**8. Balans per 31 december {jaar}** (readonly met een paar editable velden)
- Activa:
  - Banksaldo (invoerveld, editable)
  - Handelsdebiteuren (readonly, uit sectie 3)
  - Voorraad (editable, default 0)
  - Inventaris / bedrijfsmiddelen (readonly, uit sectie 5 minus afschrijvingen, boekwaarde)
- Passiva:
  - Eigen vermogen (editable)
  - Crediteuren (editable)
  - Te betalen BTW (readonly, uit Q4 aangifte)

**9. Invulhulp Mijn Belastingdienst**

Een tabel met twee kolommen: "Veld in aangifte" en "Bedrag". Dit is de copy-paste-klare lijst zodat Daley gewoon over kan tikken. Bijvoorbeeld:

| Veld | Bedrag |
|---|---|
| Netto-omzet | € 10.124 |
| Af: kosten | € X |
| Zelfstandigenaftrek | € 2.470 |
| Handelsdebiteuren (balans) | € 3.305 |
| ... | ... |

## Supabase schema (toevoegen aan `supabase-schema.sql`)

```sql
-- Hoofdrecord per jaar
CREATE TABLE IF NOT EXISTS belasting_aangifte (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jaar INTEGER NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Aftrekposten
  urencriterium_voldaan BOOLEAN DEFAULT true,
  claim_zelfstandigenaftrek BOOLEAN DEFAULT true,
  claim_startersaftrek BOOLEAN DEFAULT false,
  startersaftrek_keer_gebruikt INTEGER DEFAULT 0,

  -- FOR
  for_saldo_begin_jaar DECIMAL(10,2) DEFAULT 0,
  for_vrijval DECIMAL(10,2) DEFAULT 0,

  -- Balansposten (editable)
  banksaldo_eindstand DECIMAL(10,2),
  voorraad DECIMAL(10,2) DEFAULT 0,
  eigen_vermogen DECIMAL(10,2),
  crediteuren DECIMAL(10,2) DEFAULT 0,

  -- Meta
  laatst_bijgewerkt TIMESTAMPTZ DEFAULT NOW(),
  notities TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kostenregels
CREATE TABLE IF NOT EXISTS belasting_kosten_regel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aangifte_id UUID REFERENCES belasting_aangifte(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  categorie TEXT NOT NULL,
  bedrag DECIMAL(10,2) NOT NULL,
  datum DATE,
  notitie TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Investeringen
CREATE TABLE IF NOT EXISTS belasting_investering (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aangifte_id UUID REFERENCES belasting_aangifte(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  bedrag DECIMAL(10,2) NOT NULL,
  datum DATE NOT NULL,
  afschrijvingstermijn_jaren INTEGER DEFAULT 5,
  notitie TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Debiteur-status per factuur (bovenop de bestaande facturen tabel)
CREATE TABLE IF NOT EXISTS belasting_debiteur_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factuur_id UUID REFERENCES facturen(id) ON DELETE CASCADE,
  aangifte_id UUID REFERENCES belasting_aangifte(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open',
    -- 'open' | 'aangemaand' | 'in_incasso' | 'in_rechtszaak' | 'oninbaar'
  notitie TEXT,
  oninbaar_per DATE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(factuur_id, aangifte_id)
);

-- RLS policies zoals bij bestaande tabellen
```

## API endpoints

- `GET /api/belasting/aangifte/[jaar]` — haalt aangifte + kostenregels + investeringen + debiteur-statussen op. Creëert leeg record als nog niet bestaat.
- `PATCH /api/belasting/aangifte/[jaar]` — update velden op hoofdrecord
- `POST /api/belasting/aangifte/[jaar]/kosten` — nieuwe kostenregel
- `PATCH /api/belasting/aangifte/[jaar]/kosten/[id]` — update
- `DELETE /api/belasting/aangifte/[jaar]/kosten/[id]` — verwijder
- Zelfde patroon voor `/investeringen`
- `PATCH /api/belasting/aangifte/[jaar]/debiteur/[factuur_id]` — update status

## Berekeningslogica

Voeg toe aan `lib/belasting.ts` of maak nieuwe `lib/belasting-aangifte.ts`:

```ts
export interface AangifteInput {
  jaar: number
  omzetExcl: number
  kosten: number
  afschrijvingen: number
  urencriterium: boolean
  claimZelfstandigenaftrek: boolean
  claimStartersaftrek: boolean
  kiaAftrek: number
  forVrijval: number
}

export interface AangifteUitkomst {
  winstVoorAftrek: number
  zelfstandigenaftrek: number
  startersaftrek: number
  kia: number
  winstNaAftrek: number
  mkbVrijstelling: number
  forVrijval: number
  belastbaarInkomen: number
  ib: IBBreakdown
}

export function berekenAangifte(input: AangifteInput): AangifteUitkomst { ... }
```

Belangrijk:
- Zelfstandigenaftrek mag niet meer bedragen dan de winst voor aftrek
- Startersaftrek kan wel voor verlies zorgen (mag negatief maken)
- MKB-vrijstelling alleen over positief bedrag
- Constanten per jaar ophalen via een `CONSTANTEN_PER_JAAR` object

## UI bouwstenen

- Gebruik `Landmark`, `FileBarChart`, `Receipt`, `Calculator`, `PiggyBank`, `AlertTriangle`, `Info` uit `lucide-react`
- Editable kostenregels: inline edit met `<input>` dat onChange debounced opslaat (300ms debounce)
- Voeg een "Niet opgeslagen" indicator toe rechtsboven die verdwijnt na succesvolle save
- Secties zijn collapsible (default open)
- Mobile: stack alles verticaal, tabellen krijgen horizontale scroll

## Verificatie voordat je klaar bent

1. `npx tsc --noEmit` zonder errors
2. `npm run lint` zonder errors
3. Draai de Supabase migratie lokaal en test met een leeg record voor 2025
4. Vul dummy-data in: 2 kostenregels, 1 investering van € 1.500 (geen KIA), 1 van € 3.000 (wel KIA) en verifieer dat de berekening klopt
5. Verifieer dat Daley's werkelijke omzet 2025 van € 10.123,81 uit de facturen wordt opgehaald
6. Visual check op de pagina: huisstijl, alignment, responsive
7. Pak de root cause als iets niet werkt, onderdruk geen errors

## Out of scope (niet in deze taak)

- Integratie met Belastingdienst API
- Import uit Bonnetjes-map (wel stub-knop)
- Auto-invulling via bankafschrift
- Samen Effectief Online specifieke zaken (wordt generiek afgehandeld door debiteur-status "in_rechtszaak")

## Daley's werkelijke situatie 2025 (voor test-data)

Gebruik dit als sanity check:
- Omzet 2025: € 10.123,81 excl. BTW (20 facturen)
- Openstaande facturen per 31-12: factuur 2025F-1113-01 en 2025F-1119-01 van Samen Effectief Online, samen € 3.305,41 incl. BTW, status "in_rechtszaak"
- Zelfstandigenaftrek 2025: € 2.470
- Startersaftrek: nog niet 3x gebruikt (check met Daley)
- MKB-vrijstelling 2025: 12,70%
- FOR-saldo: waarschijnlijk 0 (afgeschaft per 2023, check of er historisch iets staat)
