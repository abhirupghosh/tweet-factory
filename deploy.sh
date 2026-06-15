#!/usr/bin/env bash
# Self-update a server deployment: pull latest app code + rebuild deps/binary.
# Safe to run at the top of every loop cycle. Runtime state (.env, .tokens.json,
# tweets.db, persona/, flush/, drafts/) is gitignored and never touched by pulls.
set -uo pipefail
cd "$(dirname "$0")"
mkdir -p logs
LOG="logs/deploy.log"

{
  echo "===== deploy $(date -u +%FT%TZ) ====="

  # 1. app code (fast-forward only; tracked files are never modified at runtime)
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git pull --ff-only origin main 2>&1 | tail -3 || echo "WARN: code pull failed; using current checkout"
  else
    echo "WARN: not a git checkout; skipping code pull"
  fi

  # 2. bun deps + recompile the tf binary
  export PATH="$HOME/.bun/bin:$PATH"
  if command -v bun >/dev/null 2>&1; then
    bun install --frozen-lockfile 2>&1 | tail -2 || echo "WARN: bun install failed"
    bun build --compile src/index.ts --outfile tf 2>&1 | tail -2 || echo "WARN: tf build failed"
  else
    echo "WARN: bun not found; install with: curl -fsSL https://bun.sh/install | bash"
  fi

  echo "deploy done."
} >> "$LOG" 2>&1
