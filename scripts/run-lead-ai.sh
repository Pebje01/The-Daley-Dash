#!/bin/bash
# Vangnet voor de AI-kwalificatie van leads, onder launchd.
#
# Leads die je in de Dash aanmaakt gaan meteen de wachtrij in. Dit proces pakt
# de rest op: imports, leads die binnenkwamen terwijl de Dash stil lag, en
# mislukte pogingen. Praat met de draaiende Dash op 127.0.0.1:3003.
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# De claude CLI staat in ~/.local/bin en zit niet in de kale launchd-PATH.
export PATH="$HOME/.local/bin:$PATH"

cd "$HOME/Developer/the-daley-dash" || exit 1
echo "===== Lead-AI vangnet gestart $(date) ====="
exec node scripts/kwalificeer-leads.mjs --watch --limit 10 --interval 15
