#!/usr/bin/env bash
# Cron entrypoint → tf cron (incremental fetch + enrich + flush + Slack ping if new).
# Prefers the compiled ./tf binary; falls back to `bun run` from source.
set -uo pipefail
cd "$(dirname "$0")"
mkdir -p logs
export PATH="$HOME/.bun/bin:$PATH"

if [ -x ./tf ]; then
  ./tf cron >> logs/cron.log 2>&1
else
  bun run src/index.ts cron >> logs/cron.log 2>&1
fi
