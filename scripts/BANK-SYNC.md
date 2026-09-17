# Automatische bank-sync (Knab via GoCardless)

Haalt elke nacht nieuwe banktransacties op en zet ze in `btw_bank_transactie`,
met dezelfde categorisatie als de handmatige Knab-CSV. Daarmee loopt de
btw-aangifte permanent bij en hoef je per kwartaal niets meer te exporteren.

Er staat nergens een bankwachtwoord in dit project. GoCardless is een
vergunninghoudende AISP onder PSD2, jij keurt de toegang eenmalig goed op het
inlogscherm van Knab zelf.

## Eenmalig instellen

### 1. GoCardless-account aanmaken (doe je zelf)

Ga naar <https://bankaccountdata.gocardless.com> en maak een gratis account.
Daarna onder **Developers, User secrets** een nieuw sleutelpaar aanmaken.
Je krijgt een `secret_id` en een `secret_key`.

### 2. Sleutels in `.env.local` zetten

```
GOCARDLESS_SECRET_ID=...
GOCARDLESS_SECRET_KEY=...
NTFY_BANK_TOPIC=daley-bank-9cc1ba9c
NEXT_PUBLIC_APP_URL=http://localhost:3003
```

Daarna de Dash herstarten zodat hij de nieuwe variabelen leest:

```bash
launchctl kickstart -k gui/$(id -u)/com.daley.daleydash
```

### 3. Migratie draaien

Voer `supabase/migrations/20260909_bank_koppeling.sql` uit in de Supabase
SQL Editor. Die maakt de tabel `bank_koppeling` en voegt een kolom `bron` toe
aan `btw_bank_transactie`.

### 4. Koppeling starten

```bash
curl -s -X POST -H "x-dash-secret: $(grep -m1 '^CRON_SECRET=' .env.local | cut -d= -f2-)" \
  -H "content-type: application/json" -d '{"bank":"knab"}' \
  http://localhost:3003/api/belasting/btw/bank-koppeling
```

Je krijgt een `link` terug. Open die in de browser, log in bij Knab en keur de
toegang goed.

### 5. Koppeling afronden

```bash
curl -s -X PUT -H "x-dash-secret: $(grep -m1 '^CRON_SECRET=' .env.local | cut -d= -f2-)" \
  http://localhost:3003/api/belasting/btw/bank-koppeling
```

Nu staan de rekeningen en IBAN's opgeslagen en is de koppeling actief.

### 6. Eerste sync draaien

```bash
bash scripts/run-bank-sync.sh && tail -5 logs/bank-sync.log
```

De eerste keer haalt hij tot 730 dagen historie op. Dat kan even duren.

### 7. Dagelijkse taak aanzetten

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.daley.bank-sync.plist
```

Draait daarna elke nacht om 03:30. Uitzetten kan met `launchctl bootout`.

## Onderhoud

**Elke 90 tot 180 dagen opnieuw goedkeuren.** Dat is een Europese eis, geen
beperking van deze opzet. De sync waarschuwt via ntfy zodra er nog 14 dagen
over zijn. Vernieuwen is stap 4 en 5 opnieuw doen.

Status opvragen:

```bash
curl -s -H "x-dash-secret: $(grep -m1 '^CRON_SECRET=' .env.local | cut -d= -f2-)" \
  http://localhost:3003/api/belasting/btw/bank-koppeling | python3 -m json.tool
```

## Let op bij de overgang

Transacties die je eerder via de CSV hebt geïmporteerd hebben een andere
referentie dan dezelfde transactie via GoCardless. De sync ontdubbelt daarom
ook op datum, bedrag en richting samen. Toch is het verstandig om voor een
kwartaal óf de CSV-import óf de automatische sync te gebruiken, niet allebei.
De kolom `bron` laat zien waar een regel vandaan komt.

## Wat er niet in zit

Betalen, overboeken of iets wijzigen bij de bank. De koppeling vraagt alleen
leesrechten aan (`balances`, `details`, `transactions`).
