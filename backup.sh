#!/usr/bin/env bash
# Local-only backup of per-user runtime state (nothing is pushed to any remote):
#   - tweets.db          -> backups/ (keep last 7 daily snapshots)
#   - persona/PERSONA.md -> backups/ (keep last 7 daily snapshots)
# `backups/` is gitignored. Run from cron/systemd if you want nightly snapshots.
#
# NOTE: PERSONA.md and tweets.db are personal data — keep them OFF any public remote.
set -uo pipefail
cd "$(dirname "$0")"
mkdir -p logs backups
LOG="logs/backup.log"

{
  echo "===== backup $(date -u +%FT%TZ) ====="

  if [ -f tweets.db ]; then
    cp tweets.db "backups/tweets-$(date -u +%F).db"
    ls -1t backups/tweets-*.db 2>/dev/null | tail -n +8 | xargs -r rm -f
    echo "db snapshot ok"
  fi

  if [ -f persona/PERSONA.md ]; then
    cp persona/PERSONA.md "backups/PERSONA-$(date -u +%F).md"
    ls -1t backups/PERSONA-*.md 2>/dev/null | tail -n +8 | xargs -r rm -f
    echo "persona snapshot ok"
  fi

  echo "backup done."
} >> "$LOG" 2>&1
