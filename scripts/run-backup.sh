#!/bin/bash
# Wrapper voor de dagelijkse Supabase-back-up onder launchd.
# Sourcet nvm zodat 'node' blijft werken ook na een node-update.
#
# caffeinate -i houdt de Mac wakker zolang de back-up loopt. Zonder dat werd het
# proces om 03:00 halverwege afgebroken zodra de Mac weer in slaap ging, en dat
# leverde een maand lang halve back-ups op zonder enige foutmelding.
#
# Het script logt zelf naar Supabase-Backups/backup.log, dus hier geen echo's:
# die zouden via launchd in datzelfde bestand belanden en door elkaar lopen.

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

cd "$HOME/Developer/the-daley-dash" || exit 1
exec caffeinate -i node scripts/backup-supabase.cjs
