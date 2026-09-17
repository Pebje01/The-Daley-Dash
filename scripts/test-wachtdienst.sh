#!/bin/bash
# Zet de testversie uit als hij 15 minuten niet gebruikt is.
#
# Draait elke minuut via de LaunchAgent com.daley.daleydash-test-wacht. De
# testversie schrijft zelf een tijdstempel zolang het tabblad in beeld is, zie
# components/TestHartslag.tsx en app/api/test/heartbeat/route.ts. Staat het
# tabblad op de achtergrond of is het dicht, dan komt er niets meer binnen en
# veroudert de stempel vanzelf.
set -u

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
GRENS=900   # 15 minuten in seconden
LABEL="com.daley.daleydash-test"
STEMPEL="$HOME/Library/Application Support/daley-dash-test/state/laatste-activiteit"
STOPPER="$HOME/Developer/the-daley-dash/scripts/stop-dash-test.sh"

# Heeft launchd de testversie onder handen? Dat is iets anders dan "poort 3004
# antwoordt": een koude start haalt eerst Colima en Supabase op, en dat duurt
# ruim een minuut. In die tijd draait de taak wel maar luistert er nog niets.
job_draait() {
  launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null | grep -q 'state = running'
}

poort_leeft() {
  lsof -ti :3004 >/dev/null 2>&1
}

# Alleen containers van de testversie, en minstens één? Dan is het een restje
# dat we mogen opruimen. Draait er iets van een ander project, dan blijven we
# overal vanaf.
alleen_test_containers() {
  local draaiend vreemd
  draaiend=$(docker ps --format '{{.Names}}' 2>/dev/null)
  [ -n "$draaiend" ] || return 1
  vreemd=$(printf '%s\n' "$draaiend" | grep -v 'daley-dash-test' | grep -c .)
  [ "$vreemd" = "0" ]
}

if ! poort_leeft; then
  # Nog aan het opstarten: afblijven. Dit ging eerder mis, toen sloeg de
  # wachtdienst toe terwijl Supabase nog aan het opkomen was en werd elke
  # koude start halverwege afgebroken.
  job_draait && exit 0

  # Taak draait niet en er luistert niets, maar de testdatabase staat nog aan.
  # Restje van een vastgelopen start of een handmatige stop: opruimen.
  if colima status >/dev/null 2>&1 && alleen_test_containers; then
    echo "$(date): dev server weg, testdatabase draait nog. Opruimen."
    exec "$STOPPER"
  fi
  exit 0
fi

# Geen stempel betekent net gestart. Dan niet ingrijpen, wel de klok starten,
# zodat een testversie die je aanzet en nooit opent alsnog vanzelf uitgaat.
if [ ! -f "$STEMPEL" ]; then
  mkdir -p "$(dirname "$STEMPEL")"
  date +%s > "$STEMPEL"
  exit 0
fi

laatst=$(cat "$STEMPEL" 2>/dev/null)
case "$laatst" in
  ''|*[!0-9]*) exit 0 ;;   # onleesbare stempel: met rust laten
esac

stil=$(( $(date +%s) - laatst ))
[ "$stil" -lt "$GRENS" ] && exit 0

echo "$(date): $stil seconden niet gebruikt, testversie gaat uit."
exec "$STOPPER"
