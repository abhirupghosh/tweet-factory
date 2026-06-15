#!/usr/bin/env bash
# Convenience: refresh tweets.db (incremental) + build the flush. → tf update
set -uo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.bun/bin:$PATH"
if [ -x ./tf ]; then exec ./tf update; else exec bun run src/index.ts update; fi
