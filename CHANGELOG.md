# Changelog

## v0.2.0 — OpenTUI rewrite + in-app LLM generation

Rebuilt end-to-end as a single **Bun/TypeScript** app. The Python pipeline and the Rust
`persona-forge` crate are removed; one binary `tf` (alias `tweet-factory`) now does install,
the full data pipeline, analysis, the onboarding TUI, **and** tweet generation.

- **`tf` CLI** — `onboard · auth · fetch · enrich · flush · search · notify · generate · update · cron · analyze`.
- **OpenTUI onboarding** (`tf onboard`) — clay-themed React TUI: live persona-card interview, account
  constellation + tagging, tweet roast, forge, and a **Generate** screen that drafts via your LLM.
- **In-app generation** (`tf generate`) — persona + the algorithm-optimizer rubric → your own LLM.
  Default backend is the **Claude Code CLI** (`claude -p`, no API key); set `TF_LLM_PROVIDER` to
  use a direct API instead (Anthropic / OpenRouter / OpenAI).
- **Bun built-ins** — `bun:sqlite`, `fetch`, `Bun.serve` (OAuth callback), Web Crypto (PKCE). Same
  `tweets.db` / `.tokens.json` / `flush` formats as before (drop-in compatible).
- **Distribution** — `bun build --compile` standalone binaries (`tf-darwin-arm64`, `tf-linux-x64`)
  built per-target on native runners.
- Dropped the OAuth 1.0a fallback (OAuth 2.0 is required for bookmarks).
- The Claude `/tweet-factory` skill is kept as an optional path, rewired to call `tf`.

## v0.1.0 — first release

The first public release of **tweet-factory** — a self-updating system that learns from your own
X (Twitter) activity and drafts algorithm-optimized tweets in your voice. Everything runs locally;
your data and secrets never leave your machine.

### Features
- **Backfill** (`fetch.py`) — pulls your likes, bookmarks, and tweets into a local SQLite DB
  (`tweets.db`). OAuth 1.0a or 2.0, incremental, auto-refreshing token, user resolved via `/2/users/me`.
- **Article enrichment** (`enrich_articles.py`) — pulls the real content behind bookmarked links
  (Tavily Extract for external URLs).
- **Living persona + flush** (`flush.py`) — surfaces only new interactions each run so the system
  learns continuously.
- **`/tweet-factory` skill** — drafts in your voice, then scores + rewrites each draft via the
  `twitter-algorithm-optimizer` skill (grounded in `xai-org/x-algorithm`), then re-asserts voice.
- **Timely topics** (`tavily_search.py`) — current-event-aware drafts.
- **Slack notifications** (`notify_slack.py`) — optional push of fresh drafts.
- **persona-forge** — a fast Rust/ratatui onboarding TUI: live persona-card interview, account
  constellation + tagging, heuristic tweet roast, and a pull-the-lever finish.
- **Turnkey setup** — `setup_x.sh` (interactive or agent-driven) + `SETUP.md` runbook for coding agents.
- **Deploy story** — `deploy.sh` (self-updating) + `backup.sh` (nightly state backup) for always-on
  hosting on a server.

### Notes
- The X refresh token rotates on use — run `fetch.py` on one machine only.
- `.env`, `.tokens.json`, and `tweets.db` are gitignored and never committed.
