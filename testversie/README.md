# Testversie van de Dash

Een tweede Dash op http://localhost:3004 (of `<ip-van-de-mac>:3004` op de telefoon) met nepdata. Zie de sectie "Testversie" in `CLAUDE.md` voor het waarom.

## Dagelijks
Niets. De LaunchAgent `com.daley.daleydash-test` start Colima, de lokale Supabase en de Dash vanzelf.

## Handig
- Nepdata terugzetten: Instellingen > Testmodus > "Testdata opnieuw vullen", of `npm run testdb:vullen`.
- Data bekijken in Supabase Studio: http://127.0.0.1:55323
- Uitzetten (scheelt geheugen): `launchctl bootout gui/$(id -u)/com.daley.daleydash-test` en `npm run testdb:stop`.
- Weer aanzetten: `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.daley.daleydash-test.plist`

## Nieuwe migratie
Draai hem ook op de testdatabase:

    psql postgresql://postgres:postgres@127.0.0.1:55322/postgres -f supabase/migrations/<bestand>.sql

## Database helemaal opnieuw opbouwen
1. `npm run testdb:stop -- --no-backup` en `npm run testdb:start` (lege database).
2. Schema van live ophalen, alleen structuur. `supabase db dump --linked` gebruikt het IPv6-adres van de database en dat is vanuit Colima niet bereikbaar, dus via de pooler in een Postgres 17-container:

       supabase db dump --linked --dry-run -s public > /tmp/dump.sh
       sed -i '' -e 's#^export PGHOST=.*#export PGHOST="aws-1-eu-central-1.pooler.supabase.com"#' \
                 -e 's#^export PGUSER=.*#export PGUSER="cli_login_postgres.fvywfygsjslojpvqrpxw"#' /tmp/dump.sh
       docker run --rm -i --entrypoint bash public.ecr.aws/supabase/postgres:17.6.1.063 < /tmp/dump.sh > testversie/schema.sql
       rm /tmp/dump.sh

3. Laden: `psql postgresql://postgres:postgres@127.0.0.1:55322/postgres -f testversie/schema.sql`
4. Alle migraties erover (ze zijn idempotent): `for f in supabase/migrations/*.sql; do psql postgresql://postgres:postgres@127.0.0.1:55322/postgres -q -f "$f"; done`
5. `npm run testdb:vullen`
