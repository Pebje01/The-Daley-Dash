#!/bin/bash
# Zet de TESTVERSIE van de Dash helemaal uit: de dev server op 3004, de lokale
# test-Supabase en de Colima-VM eronder. Pas als die VM weg is krijg je het
# geheugen echt terug, want die houdt 2 GB vast zolang hij draait.
#
# Aangeroepen door de schakelaar in Instellingen (via /api/test/modus) en door
# scripts/test-wachtdienst.sh na 15 minuten zonder activiteit.
set -u

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
DASH_DIR="$HOME/Developer/the-daley-dash"
LABEL="com.daley.daleydash-test"
EIGENAAR="gui/$(id -u)"

echo "===== Dash TEST stoppen $(date) ====="

# 1. De dev server. KeepAlive staat uit in de LaunchAgent, dus launchd start
#    hem hierna niet vanzelf opnieuw.
launchctl kill TERM "$EIGENAAR/$LABEL" 2>/dev/null
for _ in $(seq 1 20); do
  lsof -ti :3004 >/dev/null 2>&1 || break
  sleep 0.5
done
resten=$(lsof -ti :3004 2>/dev/null)
if [ -n "$resten" ]; then
  echo "Poort 3004 bleef hangen, alsnog hard afsluiten."
  kill -9 $resten 2>/dev/null
fi

# 2. De lokale test-Supabase. Zonder --no-backup blijft de nepdata gewoon staan,
#    dus de volgende keer start hij met dezelfde testdata op.
if [ -d "$DASH_DIR/testversie" ]; then
  (cd "$DASH_DIR" && supabase stop --workdir testversie >/dev/null 2>&1)
fi

# 3. De VM eronder, maar alleen als er verder niets in Docker draait. Anders
#    zou een container van een heel ander project hier sneuvelen.
if colima status >/dev/null 2>&1; then
  vreemd=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -v 'daley-dash-test' | grep -c .)
  if [ "$vreemd" = "0" ]; then
    colima stop >/dev/null 2>&1
    echo "Colima gestopt."
  else
    echo "Colima blijft aan: er draaien nog $vreemd containers van iets anders."
  fi
fi

echo "Testversie uit."
