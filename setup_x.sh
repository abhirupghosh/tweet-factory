#!/usr/bin/env bash
# setup_x.sh — onboarding for tweet-factory (Bun/TypeScript edition).
# Ensures Bun + deps, gathers credentials, builds the `tf` binary, authorizes X,
# back-fills your data, and launches the onboarding TUI.
#
# Coding agents: collect keys via AskUserQuestion and write them to .env, then run
# `NONINTERACTIVE=1 ./setup_x.sh` (the user still clicks "Authorize" in the browser).
set -uo pipefail
cd "$(dirname "$0")"

BOLD=$'\033[1m'; GRN=$'\033[32m'; YEL=$'\033[33m'; RST=$'\033[0m'
say(){ printf "\n%s%s%s\n" "$BOLD" "$*" "$RST"; }
NONINTERACTIVE="${NONINTERACTIVE:-0}"

CHECK=0
for a in "$@"; do
  case "$a" in
    --check) CHECK=1 ;;
    -h|--help) echo "usage: ./setup_x.sh [--check]"; echo "  --check  report missing tools/keys without changing anything"; exit 0 ;;
    *) echo "unknown option: $a (try --help)"; exit 2 ;;
  esac
done

# In --check mode never create or mutate .env.
[ "$CHECK" = 1 ] || { [ -f .env ] || cp .env.example .env; }
get(){ grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2-; }
have(){ [ -n "$(get "$1")" ]; }

if [ "$CHECK" = 1 ]; then
  say "tweet-factory setup — read-only check (no changes made)"
  report(){ if have "$1"; then printf "  %s✓%s %s\n" "$GRN" "$RST" "$1"; else printf "  %s—%s %s (%s)\n" "$YEL" "$RST" "$1" "$2"; fi; }
  tool(){ if command -v "$1" >/dev/null 2>&1; then printf "  %s✓%s %s installed\n" "$GRN" "$RST" "$1"; else printf "  %s—%s %s not found (%s)\n" "$YEL" "$RST" "$1" "$2"; fi; }
  echo "  tools:"
  export PATH="$HOME/.bun/bin:$PATH"
  tool bun "the setup script can install it"
  tool claude "optional — default LLM backend for 'tf generate'; or set an API key"
  echo "  keys (.env):"
  [ -f .env ] || echo "  (no .env yet — will be created from .env.example on a real run)"
  report TWITTER_OAUTH2_CLIENT_ID "REQUIRED"
  report TWITTER_OAUTH2_CLIENT_SECRET "REQUIRED"
  report ANTHROPIC_API_KEY "optional — only for direct-API generation"
  report TAVILY_API_KEY "optional — timely topics + article enrichment"
  report SLACK_WEBHOOK_URL "optional — push drafts to Slack"
  echo; echo "  Run without --check to set up for real."
  exit 0
fi
setkv(){ grep -v "^$1=" .env > .env.tmp 2>/dev/null || true; mv .env.tmp .env; printf '%s=%s\n' "$1" "$2" >> .env; }
ask(){ # ask KEY required|optional "prompt" "hint"
  local key="$1" req="$2" prompt="$3" hint="${4:-}"
  if have "$key"; then printf "  %s✓%s %s set\n" "$GRN" "$RST" "$key"; return; fi
  if [ "$NONINTERACTIVE" = "1" ]; then
    [ "$req" = required ] && { printf "  %s!%s %s missing (required)\n" "$YEL" "$RST" "$key"; MISSING=1; }; return
  fi
  echo; echo "  $prompt"; [ -n "$hint" ] && echo "    → $hint"
  [ "$req" = optional ] && echo "    (optional — press Enter to skip)"
  read -r -p "    $key = " v; [ -n "$v" ] && setkv "$key" "$v"
  [ -z "$v" ] && [ "$req" = required ] && MISSING=1
}

MISSING=0
say "tweet-factory setup"
echo "  X OAuth 2.0 keys: developer.x.com → app → User auth settings (Read, Web App,"
echo "  callback http://127.0.0.1:8675/callback) → Keys and tokens → OAuth 2.0 Client ID/Secret."
ask TWITTER_OAUTH2_CLIENT_ID     required "X OAuth 2.0 Client ID"
ask TWITTER_OAUTH2_CLIENT_SECRET required "X OAuth 2.0 Client Secret"
ask ANTHROPIC_API_KEY            optional "Anthropic API key (only for direct-API generation)" "default backend is the Claude Code CLI — no key needed; or set OPENROUTER_API_KEY / OPENAI_API_KEY"
ask TAVILY_API_KEY               optional "Tavily API key" "free at https://tavily.com — timely topics + article enrichment"
ask SLACK_WEBHOOK_URL            optional "Slack Incoming Webhook" "push generated drafts to Slack"
[ "$MISSING" = 1 ] && { echo; echo "  Missing required keys — add them to .env and re-run."; exit 1; }

say "Installing Bun + building tf"
export PATH="$HOME/.bun/bin:$PATH"
command -v bun >/dev/null 2>&1 || { echo "  installing bun..."; curl -fsSL https://bun.sh/install | bash >/dev/null 2>&1; export PATH="$HOME/.bun/bin:$PATH"; }
bun install >/dev/null 2>&1 && echo "  ✓ deps installed"
bun build --compile src/index.ts --outfile tf >/dev/null 2>&1 && echo "  ✓ built ./tf"

if [ ! -f .tokens.json ]; then
  say "Authorizing your X account"
  echo "  A browser opens — log in as the account to analyze and click 'Authorize app'."
  ./tf auth || { echo "  auth failed — check the callback URL / keys and re-run."; exit 1; }
fi

say "Back-filling your X data"
./tf fetch
./tf flush >/dev/null 2>&1 || true

say "${GRN}Setup complete.${RST}"
echo "  Launch the onboarding TUI:   ./tf onboard"
echo "  Generate drafts anytime:     ./tf generate"
echo "  (single-host rule: run ./tf fetch on ONE machine only — the X token rotates on use)"
