#!/bin/bash
# Wrapper voor de dagelijkse Supabase-back-up onder launchd.
# Sourcet nvm zodat 'node' blijft werken ook na een node-update.

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

cd "$HOME/Developer/the-daley-dash" || exit 1
echo "===== Back-up gestart $(date) ====="
node scripts/backup-supabase.cjs
echo "===== Back-up klaar $(date) ====="
