# tweet-factory

A self-updating system that learns from **your own** X (Twitter) activity and generates algorithm-optimized draft tweets in **your** voice.

It pulls your likes, bookmarks, and tweets into a local SQLite DB, builds a living "persona" of how you write and what you engage with, scores drafts against the **2026 open-source X ranking algorithm** ([`xai-org/x-algorithm`](https://github.com/xai-org/x-algorithm)), pulls timely topics via [Tavily](https://tavily.com), and drafts fresh tweets in your voice — generated **in-app by your own LLM**.

A single binary `tf` (alias `tweet-factory`) does everything: install, the data pipeline, analysis, the [OpenTUI](https://opentui.com) onboarding, and generation. Everything runs locally; your data and secrets never leave your machine.

> **v0.2.0** — OpenTUI/Bun rewrite. See [CHANGELOG.md](CHANGELOG.md).

---

## Download & install

```bash
git clone https://github.com/abhirupghosh/tweet-factory.git
cd tweet-factory
./setup_x.sh            # installs Bun, builds tf, gathers keys, runs OAuth, back-fills your data
```

Then:
```bash
./tf onboard           # the OpenTUI onboarding (interview → tag accounts → roast → generate)
./tf generate          # draft fresh tweets via your LLM anytime
```

Setting up with a coding agent? Point it at [`SETUP.md`](SETUP.md). Prefer a prebuilt binary?
Grab `tf-<platform>` from a [release](https://github.com/abhirupghosh/tweet-factory/releases), `chmod +x`, run it.

**Requirements:** [Bun](https://bun.sh) (the setup script installs it), an X developer app (free,
OAuth 2.0), and — for generation — the [Claude Code](https://claude.com/claude-code) CLI
(**default backend, no API key**; `tf generate` spawns `claude -p`). Prefer a direct API instead?
Set `TF_LLM_PROVIDER` + a key (Anthropic / OpenRouter / OpenAI). Optional:
[Tavily](https://tavily.com) (timely topics + article enrichment), [Notion](https://www.notion.so/my-integrations)
(tagged grounding pages), and a Slack webhook.

---

## What it does

The `tf` CLI:

| Command | What it does |
|---|---|
| `tf onboard` | OpenTUI onboarding — interview, account tagging, tweet roast, persona forge, live generation |
| `tf auth` | OAuth 2.0 (PKCE) flow → `.tokens.json` |
| `tf fetch [--incremental]` | pull likes / bookmarks / tweets into `tweets.db` |
| `tf enrich` | pull full article content behind bookmarked links (Tavily) |
| `tf flush [--commit]` | surface only *new* interactions since last run; `--commit` marks them processed |
| `tf notion <search\|tag\|untag\|list\|sync>` | connect Notion; tag notable pages (freeform) as static grounding for generation |
| `tf search <q> --news` | timely web results (Tavily) |
| `tf generate [--n N --timely --post-to-slack]` | draft fresh tweets in your voice via your LLM, scored against the algorithm rubric |
| `tf notify <file>` | push drafts to Slack |
| `tf update` | incremental fetch + rebuild `flush/pending.md` (non-LLM; safe to cron) |
| `tf cron` | fetch + enrich + flush + Slack ping (server-loop entrypoint) |
| `tf analyze [--json]` | voice / taste stats |

Run `tf --help` for the full list.

---

## Quick start

**One command** (interactive — gathers keys, sets up the env, runs OAuth, back-fills your data):
```bash
./setup_x.sh
```
It walks you through everything and ends by pointing you at `tf onboard` / `tf generate`.

**Setting this up with a coding agent?** Point it at [`SETUP.md`](SETUP.md) — an agent runbook that
has it collect your API keys via interactive questions, run `setup_x.sh`, fill your persona from
your real tweets, and hand you the loop prompt.

The manual steps below are what `setup_x.sh` automates, if you'd rather do it by hand.

---

## Manual setup

### 1. Register an X app
At [developer.x.com](https://developer.x.com/en/portal/dashboard), create an app, then under **User authentication settings**:
- **App permissions:** Read
- **Type of App:** Web App, Automated App or Bot (confidential client — gives you a refresh token)
- **Callback URI:** `http://127.0.0.1:8675/callback`

> **Why OAuth 2.0?** X allows reading **bookmarks** *only* via OAuth 2.0 user context. App-only bearer tokens get a 403.

### 2. Configure secrets
```bash
cp .env.example .env
# fill in TWITTER_OAUTH2_CLIENT_ID / SECRET, and optionally TAVILY_API_KEY etc.
```

### 3. Install Bun + build `tf`
```bash
curl -fsSL https://bun.sh/install | bash   # if you don't have Bun
bun install
bun run build                              # compiles the ./tf binary
```
(You can skip the build and run from source anytime with `bun run src/index.ts <cmd>`.)

### 4. Authorize + first pull
```bash
./tf auth              # opens browser → click Authorize → saves .tokens.json
./tf fetch             # pulls all likes + bookmarks + tweets into tweets.db
```

### 5. Set up your persona
```bash
cp persona/PERSONA.template.md persona/PERSONA.md
# edit PERSONA.md with your identity, voice rules, and content lane
```

---

## Daily use

```bash
./tf update            # incremental fetch + build flush/pending.md (non-LLM; safe to cron)
./tf generate          # draft 10 fresh tweets via your LLM, scored against the algorithm rubric
```

`tf update` is the non-LLM prep (safe to schedule via cron/systemd — see [Deploy](#deploy)).
`tf generate` is the creative step: it loads your persona + the
[`X_ALGORITHM_BOOST_PLAYBOOK.md`](X_ALGORITHM_BOOST_PLAYBOOK.md) scoring rubric, drafts in your
voice, scores each draft 0-100, and keeps the ones that clear the bar without flattening your voice.
Drafts are written to `drafts/YYYY-MM-DD.md` (and pushed to Slack with `--post-to-slack`).

### Optional: the Claude Code skill
If you use [Claude Code](https://claude.com/claude-code), the bundled `/tweet-factory`
[skill](.claude/skills/tweet-factory/SKILL.md) runs the same flow as an agent. It can compose a
richer optimizer skill if your org installs one; otherwise it falls back to the committed
[`X_ALGORITHM_BOOST_PLAYBOOK.md`](X_ALGORITHM_BOOST_PLAYBOOK.md) — so it works standalone.

---

## Understand the algorithm yourself
Drafts are scored against signals distilled in [`X_ALGORITHM_BOOST_PLAYBOOK.md`](X_ALGORITHM_BOOST_PLAYBOOK.md),
which is grounded in the open-source X ranking code. To regenerate or verify it:
```bash
git clone --depth 1 https://github.com/xai-org/x-algorithm.git
# then read the files cited in the playbook (grox/, thunder/, home-mixer/, phoenix/)
```

---

## Deploy
For always-on use on a server, three helper scripts are included:
- `deploy.sh` — fast-forward the checkout, reinstall deps, and rebuild `tf` (safe to run at the top of a loop).
- `backup.sh` — local-only nightly snapshots of `tweets.db` and `persona/PERSONA.md` into `backups/`.
- `cron_run.sh` — cron entrypoint that runs `tf cron` (incremental fetch + enrich + flush + Slack ping).

Schedule `cron_run.sh` (or `tf cron`) however you like (cron, systemd timer). Personal data
(`tweets.db`, `persona/PERSONA.md`) stays local — keep it off any public remote.

---

## Security
- `.env` and `.tokens.json` are gitignored and written `0600`. **Never commit them.**
- The X OAuth refresh token **rotates on every use** — run `tf fetch` on **one machine only**, or you'll invalidate the token.
- The OAuth callback binds to `127.0.0.1` by default; only widen `OAUTH_BIND_HOST` if you authorize from another machine (e.g. Tailscale).
- `tweets.db` contains other people's tweet text (your likes/bookmarks). It's gitignored and stays local.
- `tf generate` sends scraped content (your tweets, bookmarked articles, Notion pages) to your LLM as *reference data*; the spawned `claude -p` subagent runs with **no tools** so injected text can't take actions.

## Contributing
See [AGENTS.md](AGENTS.md) for the repo map, build/test commands, and conventions (it doubles as
contributor orientation for both humans and coding agents).

## License
MIT — see [LICENSE](LICENSE).
