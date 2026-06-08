#!/bin/bash
# Start de Daley Dash dev-server op poort 3003 onder launchd.
# Sourcet nvm zodat 'node'/'npm' blijven werken, ook na een node-update.
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

cd "$HOME/Developer/the-daley-dash" || exit 1
echo "===== Dash gestart $(date) ====="
exec npm run dev
