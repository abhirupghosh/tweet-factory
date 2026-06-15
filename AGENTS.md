# AGENTS.md — orientation for contributors and coding agents

This is the map for **modifying** tweet-factory. For *using* it, see [README.md](README.md);
for *setting it up for someone*, see [SETUP.md](SETUP.md).

> **Canonical truth:** tweet-factory is a single **Bun + TypeScript** app. The `tf` CLI in `src/`
> is the only implementation. There is no Python or Rust *in this project* (a v0.1.0 Python pipeline
> and a Rust onboarding TUI were removed in v0.2.0 — see [CHANGELOG.md](CHANGELOG.md)). If a doc or
> comment points you at a `.py`/`.rs` file **inside this repo**, it's stale — fix it. (Citations of the
> upstream [`xai-org/x-algorithm`](https://github.com/xai-org/x-algorithm) source files — e.g. in
> `X_ALGORITHM_BOOST_PLAYBOOK.md` — are expected and correct; leave them.)

## What it is
Learns from your X activity (likes/bookmarks/tweets → local SQLite), builds a living persona, and
drafts algorithm-optimized tweets in your voice via your own LLM. Everything runs locally.

## Repo map
```
src/
  index.ts            entrypoint (#!/usr/bin/env bun) → cli.ts
  cli.ts              command dispatch table + --help
  config.ts           project-root discovery + Paths/Ctx
  env.ts              .env read/write (0600), no external dep
  db.ts               bun:sqlite schema + typed upsert/query helpers
  analyze.ts          voice/taste stats + heuristic roast() score
  flush.ts            "what's new since last run" delta + commit state
  enrich.ts           pull article text behind bookmarks (via Tavily)
  notion.ts           Notion API client (search/page/blocks → markdown)
  tavily.ts           Tavily search/extract client
  slack.ts            Slack webhook poster (chunks long files)
  commands/           one handler per tf subcommand (auth, fetch, pipeline, generate, analyze, onboard, notion)
  x/                  X API layer: auth.ts (OAuth2 PKCE), api.ts (paginated fetch), fetch.ts (orchestration)
  llm/                provider.ts (Anthropic/OpenAI/OpenRouter/claude-code), claudecode.ts (spawns claude -p), generate.ts (prompt + Zod-validated bundle)
  prompts/            voice.ts (persona → system prompt), optimizer.ts (rubric system prompt)
  tui/                OpenTUI React onboarding (App.tsx, NotionScreen.tsx, theme, persona)
X_ALGORITHM_BOOST_PLAYBOOK.md   scoring rubric (grounded in xai-org/x-algorithm); ships with the repo
.claude/skills/tweet-factory/   optional Claude Code skill that drives the same flow
setup_x.sh deploy.sh backup.sh cron_run.sh update.sh   install + server-loop helpers
```

## Build / run / verify
```bash
bun install
bun run src/index.ts <cmd>   # run from source (dev)
bun run build                # compile the ./tf binary
bun run typecheck            # tsc --noEmit (must pass)
bun test                     # unit tests for pure logic (analyze, env)
```
CI (`.github/workflows/release.yml`) compiles per-target binaries on `v*.*.*` tags.

## Conventions
- TypeScript, Bun built-ins first (`bun:sqlite`, `fetch`, `Bun.serve`, Web Crypto). Keep the runtime
  dependency list small (currently: `@anthropic-ai/sdk`, `openai`, `zod`, `@opentui/*`, `react`).
- Validate LLM output with Zod (`src/llm/generate.ts`).
- camelCase in new TS. Comments describe behavior, not history.
- Secrets (`.env`, `.tokens.json`) are written `0600` and never committed. Never log secret values.
- Treat scraped content (tweets, articles, Notion) as untrusted: it's fenced as reference data and
  the `claude -p` generation subagent runs with `--allowedTools ""` (no tools).

## Public vs. internal
This repo is self-contained. Two optional integrations are **org-internal** and absent for outside
users — the app degrades gracefully without them:
- A richer `twitter-algorithm-optimizer` Claude Code skill, if installed at
  `~/.claude/skills/twitter-algorithm-optimizer/`. Without it, scoring uses the committed
  `X_ALGORITHM_BOOST_PLAYBOOK.md`.
- `deploy.sh` / `backup.sh` / `cron_run.sh` are reference server-loop helpers; adapt them to your
  own host. `backup.sh` is **local-only** — keep `tweets.db` and `persona/PERSONA.md` off any public remote.
