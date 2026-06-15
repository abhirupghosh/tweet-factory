# Setting up tweet-factory for a new user — agent runbook

**Audience: a coding agent (Claude Code, etc.) setting this up for a user on their machine.**
Follow these steps in order. Use the `AskUserQuestion` tool whenever you need a key, secret, or
decision from the user — never guess or invent credentials. Keep the user in the loop; the whole
thing takes ~5 minutes plus one browser click from them.

> The mechanical work is done by `./setup_x.sh` (Bun/TypeScript — no Python). Your job is to
> collect the inputs it needs (via AskUserQuestion), run it, help the user fill their persona, and
> hand them the loop prompt.

---

## Step 0 — Clone + orient
Make sure you're in the project directory (the one containing `setup_x.sh` and `package.json`).
Run a read-only check first — it reports missing tools/keys without changing anything:
```bash
./setup_x.sh --check
```

## Step 1 — Get the user's X API credentials (REQUIRED)
The only hard requirement is an X app with **OAuth 2.0** (the sole auth X allows for reading
bookmarks). Walk the user through it, then collect the keys with **AskUserQuestion**.

Tell the user to do this at https://developer.x.com/en/portal/dashboard → their app →
**User authentication settings**:
- App permissions: **Read**
- Type of App: **Web App, Automated App or Bot** (confidential client → gives a refresh token)
- Callback URI: `http://127.0.0.1:8675/callback`  ← must be exact
- Save, then open the **Keys and tokens** tab and copy the **OAuth 2.0 Client ID and Client Secret**.

Then **AskUserQuestion** to collect:
- `TWITTER_OAUTH2_CLIENT_ID` (required)
- `TWITTER_OAUTH2_CLIENT_SECRET` (required)

Write them into `.env` (copy `.env.example` first if `.env` doesn't exist). Never echo secret
values back in plaintext in your responses.

## Step 2 — Optional integrations (ask, offer to skip)
Use **AskUserQuestion** (with a clear "skip" option) for these. They're optional:
- `ANTHROPIC_API_KEY` — only if the user wants direct-API generation instead of the default
  Claude Code CLI backend. (Default `tf generate` spawns `claude -p` and needs no key.)
- `TAVILY_API_KEY` — free at https://tavily.com. Enables timely, current-event-aware tweets +
  pulling full article content behind bookmarked links. Recommended.
- `SLACK_WEBHOOK_URL` — https://api.slack.com/messaging/webhooks. If set, generated drafts get
  pushed to Slack. If skipped, drafts just appear in the terminal / `drafts/`.

## Step 3 — Run the setup script
Once `.env` has at least the two OAuth2 values:
```bash
./setup_x.sh
```
It installs Bun, builds `tf`, then runs the OAuth flow — **a browser opens and the user must click
"Authorize app"** (logged in as the account they want to analyze). Then it back-fills their
likes/bookmarks/tweets into `tweets.db` and baselines the flush.

If the user is on a remote/headless box, they'll need to open the printed authorize URL from a
machine with a browser; set `OAUTH_REDIRECT_URI` to a reachable callback and register it in the
portal (see README). The callback binds to `127.0.0.1` unless you set `OAUTH_BIND_HOST`.

## Step 4 — Fill the persona
`setup_x.sh` creates `persona/PERSONA.md` from the template. Make it real — this is what makes
drafts sound like the user. Two good approaches:
- **Interview** the user with AskUserQuestion: their handle, what they want to be known for
  (their "lane"), voice rules (casing, length, tone), and any banned phrases.
- **Infer from data**: read `tweets.db` (their own tweets + most-liked authors + bookmarks) and
  draft the persona from their actual style, then confirm with the user. `tf analyze` summarizes
  their measured voice signals.

The richer `persona/PERSONA.md`, the better the voice match.

## Step 5 — (Optional) enrich article bookmarks
If `TAVILY_API_KEY` is set and you want full article text behind their bookmarks:
```bash
./tf enrich
```

## Step 6 — Hand off the loop prompt
End by giving the user the prompt that generates tweets going forward. Pick based on whether they
set up Slack:

**With Slack:**
```
/loop 6h Spawn a subagent via the Agent tool with model "opus" to run /tweet-factory end-to-end, then post that run's drafts to Slack via ./tf notify drafts/$(date +%F).md "🧵 fresh tweet ideas". Reply with only a one-line summary. Keep going on this interval.
```

**Terminal only (no Slack):**
```
/loop 6h Spawn a subagent via the Agent tool with model "opus" to run /tweet-factory end-to-end and show me the drafts. Keep going on this interval.
```

Or, for a one-off batch, just tell them to run `./tf generate` (or `/tweet-factory` in Claude Code).

---

## Reminders
- **Single-host rule:** `tf fetch` (and the loop) must run on ONE machine only — the X refresh
  token rotates on every use; running it on two hosts invalidates the token.
- **Secrets never get committed:** `.env`, `.tokens.json`, and `tweets.db` are gitignored.
- **Re-auth:** if a run ever logs a 401, run `./tf auth` once to re-mint the token.
- For always-on scheduling + self-updating loops on a server, see the **Deploy** section in
  [`README.md`](README.md) (`deploy.sh` / `backup.sh` / `cron_run.sh`).
