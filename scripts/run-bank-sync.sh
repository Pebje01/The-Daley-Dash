#!/bin/bash
# Dagelijkse bank-sync onder launchd.
#
# Roept de Dash zelf aan (die draait al permanent op poort 3003 via
# com.daley.daleydash), zodat alle categorisatielogica uit lib/btw.ts hergebruikt
# wordt en er geen tweede kopie van die regels ontstaat.
#
# caffeinate -i houdt de Mac wakker zolang de sync loopt, net als bij de
# Supabase-back-up. Zonder dat wordt het verzoek halverwege afgekapt zodra de
# Mac weer in slaap valt, en dan mis je stilletjes een dag.

set -uo pipefail

DASH_DIR="$HOME/Developer/the-daley-dash"
LOG="$DASH_DIR/logs/bank-sync.log"
NTFY_TOPIC_FALLBACK="daley-bank-9cc1ba9c"

mkdir -p "$(dirname "$LOG")"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"
}

# Geheimen uit .env.local halen zonder het hele bestand te sourcen: daar staan
# ook regels met spaties en aanhalingstekens in die de shell zouden breken.
lees_env() {
  grep -m1 "^$1=" "$DASH_DIR/.env.local" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'"
}

CRON_SECRET="$(lees_env CRON_SECRET)"
NTFY_TOPIC="$(lees_env NTFY_BANK_TOPIC)"
NTFY_TOPIC="${NTFY_TOPIC:-$NTFY_TOPIC_FALLBACK}"

melden() {
  curl -s -m 15 \
    -H "Title: Bank-sync" \
    -H "Priority: high" \
    -H "Tags: bank,warning" \
    -d "$1" "https://ntfy.sh/$NTFY_TOPIC" > /dev/null 2>&1 || true
}

if [ -z "$CRON_SECRET" ]; then
  log "FOUT: CRON_SECRET niet gevonden in .env.local"
  melden "Bank-sync kon niet starten: CRON_SECRET ontbreekt in .env.local."
  exit 1
fi

# Draait de Dash? Zo niet, dan heeft aanroepen geen zin.
if ! curl -s -m 5 -o /dev/null "http://localhost:3003/login"; then
  log "FOUT: Dash niet bereikbaar op poort 3003"
  melden "Bank-sync overgeslagen: de Daley Dash draait niet op poort 3003."
  exit 1
fi

ANTWOORD=$(caffeinate -i curl -s -m 120 \
  -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3003/api/cron/bank-sync")

log "$ANTWOORD"

# De route meldt zelf al via ntfy bij een fout of een verlopen koppeling. Hier
# vangen we alleen het geval op dat er helemaal geen bruikbaar antwoord kwam.
if [ -z "$ANTWOORD" ]; then
  log "FOUT: leeg antwoord van de sync-route"
  melden "Bank-sync gaf geen antwoord. Check logs/bank-sync.log."
  exit 1
fi

# Log afkappen zodat hij niet eindeloos groeit
tail -n 500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
