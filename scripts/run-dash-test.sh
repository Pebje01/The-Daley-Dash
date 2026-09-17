#!/bin/bash
# Start de TESTVERSIE van de Dash op poort 3004, naast de live Dash op 3003.
#
# De testversie gebruikt een eigen Supabase-project en een eigen zandbakmap,
# zie lib/dashModus.ts. Alle instellingen daarvoor staan in .env.test.local;
# node --env-file zet ze in de omgeving vóórdat Next .env.local inleest, en
# Next overschrijft bestaande omgevingsvariabelen nooit. Zo wint test altijd.
#
# Draait onder launchd als com.daley.daleydash-test, of handmatig: npm run dev:test
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

DASH_DIR="$HOME/Developer/the-daley-dash"
cd "$DASH_DIR" || exit 1

if [ ! -f .env.test.local ]; then
  echo "Geen .env.test.local gevonden. Kopieer .env.test.example en vul hem in."
  exit 1
fi

# Zonder deze regels in het bestand zou de testversie terugvallen op live-waarden
for verplicht in NEXT_PUBLIC_DASH_MODUS SUPABASE_DATA_URL SUPABASE_DATA_SECRET_KEY DALEY_WERK_ROOT ADMIN_FACTUREN_PATH ADMIN_OFFERTES_PATH; do
  if ! grep -q "^$verplicht=." .env.test.local; then
    echo "$verplicht ontbreekt in .env.test.local, testversie niet gestart."
    exit 1
  fi
done

# launchd geeft een kale PATH mee, zonder Homebrew
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# De testdatabase draait lokaal in Docker (Colima). Beide commando's doen niets
# als het al draait, dus dit is veilig bij elke (her)start.
if ! colima status >/dev/null 2>&1; then
  echo "Colima starten..."
  colima start || { echo "Colima start mislukt"; exit 1; }
fi
if ! supabase status --workdir testversie >/dev/null 2>&1; then
  echo "Lokale test-Supabase starten..."
  supabase start --workdir testversie || { echo "Supabase start mislukt"; exit 1; }
fi

# De zandbak voor PDF's, bestandssync en syncstatus
ZANDBAK="$HOME/Library/Application Support/daley-dash-test"
mkdir -p "$ZANDBAK/DALEY WERK/Bedrijf Administratie/Verkoopfacturen" "$ZANDBAK/DALEY WERK/Bedrijf Administratie/Offertes" "$ZANDBAK/state"

# De klok voor de wachtdienst start nu, niet pas bij het eerste bezoek. Zo gaat
# een testversie die je aanzet en vervolgens nooit opent toch vanzelf weer uit.
date +%s > "$ZANDBAK/state/laatste-activiteit"

echo "===== Dash TEST gestart $(date) ====="
export NEXT_DIST_DIR=.next-test
exec node --env-file=.env.test.local node_modules/next/dist/bin/next dev -p 3004 -H 0.0.0.0
