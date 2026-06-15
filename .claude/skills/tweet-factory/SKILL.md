---
name: tweet-factory
description: Refresh the user's tweet database, review new likes/bookmarks (the "flush"), update the living persona, pull timely topics via Tavily, generate a fresh batch of draft tweets in the user's voice, and score + rewrite each one against the X algorithm boost playbook. Use when the user wants new tweet drafts, a persona refresh, or to process recent X activity. Trigger on "/tweet-factory", "generate tweets", "new drafts", "refresh my tweet persona".
---

# Tweet Factory

Generates fresh, on-brand draft tweets for the repo owner, learning continuously from their latest X activity, then **scores and optimizes each draft against the [`X_ALGORITHM_BOOST_PLAYBOOK.md`](../../../X_ALGORITHM_BOOST_PLAYBOOK.md) rubric** so every draft ships with a 0-100 reach score, a grounded critique, and an optimized rewrite. Run it from the project root (the directory containing `tweets.db`).

This skill **composes** two responsibilities:
- **tweet-factory (here)** owns the data + voice + generation pipeline (fetch → flush → persona → Tavily → drafts).
- **algorithm scoring/rewrite** owns the 0-100 reach score, critique, and rewrite. The source of
  truth for ranking levers is the committed [`X_ALGORITHM_BOOST_PLAYBOOK.md`](../../../X_ALGORITHM_BOOST_PLAYBOOK.md)
  (grounded in `xai-org/x-algorithm`) — this ships with the repo and always works. If your org also
  installs the optional richer `twitter-algorithm-optimizer` skill at
  `~/.claude/skills/twitter-algorithm-optimizer/`, prefer it. Do not duplicate algorithm logic here.

**First run on a fresh clone:** if `persona/PERSONA.md` doesn't exist, copy it from `persona/PERSONA.template.md` and fill in the owner's identity, voice, and lane before generating. The richer the persona, the better the voice match.

## Inputs you rely on
- `tweets.db` — the owner's likes/bookmarks/tweets (SQLite).
- `flush/pending.md` — NEW interactions since last run (the delta to learn from).
- `persona/PERSONA.md` — the living voice + taste + strategy doc. **Source of truth for their voice.**
- **`X_ALGORITHM_BOOST_PLAYBOOK.md`** (repo root) — the source of truth for X ranking signals + the scoring rubric. Ships with the repo; always available. (Optional: if `~/.claude/skills/twitter-algorithm-optimizer/SKILL.md` exists, prefer its richer `GROUNDING.md`.)
- `tf search` — timely web results (Tavily) so drafts can reference current events.

> **Note:** as of v0.2.0 the whole pipeline is the `tf` (tweet-factory) CLI, and generation
> can run fully in-app with your own LLM via `tf generate` (no Claude Code needed). This skill remains
> the optional Claude-Code path; it calls `tf` for all data ops.

## Procedure

### 1. Refresh data + build the flush
Run the prep script (incremental fetch + flush build):
```bash
tf update
```
If it errors on auth, tell the user the token may need re-auth (`tf auth`) and stop. Otherwise continue.

### 2. Read the flush and persona
- Read `flush/pending.md`. This is what's NEW since last run.
- Read `persona/PERSONA.md` in full.
- Read the last 1-2 files in `drafts/` (if any) so you don't repeat recent drafts.

### 3. Update the persona
Based on `flush/pending.md`, update `persona/PERSONA.md`:
- New authors they've started liking → add to taste signals / reply targets.
- New recurring topics → note any lane shifts (but keep them ~80% in their stated lane).
- If any of their new tweets performed well/poorly, note the pattern under "Running notes" with the date.
- Keep the Voice section stable unless there's clear evidence their style changed.
- Append a dated line under "Running notes". Keep the doc tight — edit, don't just append endlessly.

### 4. Pull timely topics (Tavily)
Run 1-3 searches in their lane for current events worth tweeting about, e.g.:
```bash
tf search "claude code OR codex OR cursor agentic coding" --news --days 7 --max 5
tf search "AI agents startups customer support" --news --days 7 --max 4
```
Pick searches relevant to what's in the flush + persona lane. Use the dated results to ground 2-4 of the drafts in something happening *now* (a model release, a debate, a launch). Never invent facts — only reference what Tavily actually returned, and keep their voice (per `persona/PERSONA.md`).

### 5. Generate raw drafts (voice-first)
Write **10 drafts** in their voice (obey `persona/PERSONA.md` voice rules exactly), spread across their proven shapes:
- 2-3 spicy/contrarian one-liners (→ likes)
- 2-3 tooling observations or workflow shifts (→ likes + dwell)
- 1-2 build-in-public / product posts with a hard number + CTA (if the owner has a product)
- 1-2 saveable playbook posts (→ bookmarks)
- 1-2 reply templates aimed at specific big accounts they like (compose natively)
- 2-4 of the above should be **timely** (grounded in Tavily results), tagged `[timely]`.

At this stage optimize for **voice authenticity**, not the algorithm — the next step handles reach. Respect: lowercase-start, terse, no banned phrases, no listicle-slop. Avoid repeating recent drafts.

### 6. Score + rewrite each draft against the algorithm playbook
This is the merge point. Load [`X_ALGORITHM_BOOST_PLAYBOOK.md`](../../../X_ALGORITHM_BOOST_PLAYBOOK.md) (or the optional `twitter-algorithm-optimizer` skill if installed) and apply its rubric to **every** draft from Step 5:
1. **Hard-filter check** — flag any CRITICAL violation (PTOS categories, link in the primary body, low-quality/spammy framing, etc.). Fix before scoring.
2. **Score** the draft 0-100 on the playbook's rubric, citing the levers.
3. **Optimize** — take the top-3 weakest signals and produce a rewrite.
4. **Rescore** the rewrite and record the delta.

Crucial constraint: the rewrite must **not** flatten the owner's voice. After it rewrites, do a voice pass against `persona/PERSONA.md` — keep the algorithmic structure (reply hook, line-break pacing, standalone T1, link-in-reply) but restore their lowercase, terseness, and phrasing. If the optimized version reads like generic LinkedIn copy, you over-corrected; pull it back toward the raw draft.

Keep drafts that score **≥ 70** after rewrite. Drop or regenerate anything that can't clear 70 without breaking voice.

### 7. Save + commit the flush
- Write the batch to `drafts/YYYY-MM-DD.md` (real date from `date +%F`). For each kept draft record: the final (voice-preserved, optimized) text, its score `(raw → optimized)`, the algorithm signal it targets, and a one-line note on what the optimizer changed.
- Mark the flush processed so items don't resurface:
```bash
tf flush --commit
```

### 8. (Optional) Notify
If `SLACK_WEBHOOK_URL` is set in `.env`, post a short summary + the drafts:
```bash
tf notify drafts/YYYY-MM-DD.md
```
(Skip silently if the script or webhook isn't configured.)

### 9. Report
Summarize to the user: how many new flush items were processed, what persona changes you made, which timely topics you used, and show the kept drafts inline with their `(raw → optimized)` scores.

## Notes
- **Composition, not duplication:** all ranking-signal reasoning, the scoring rubric, and the do/don't rules live in `X_ALGORITHM_BOOST_PLAYBOOK.md` (or the optional `twitter-algorithm-optimizer` skill, if your org installs one). This skill never re-derives them — it generates in-voice, then defers to the playbook for scoring/rewrite, then re-asserts voice.
- Single-host rule: the X refresh token rotates on use. Run `tf fetch` on ONE machine only. Running fetch on two hosts will break auth.
- If `flush/pending.md` shows 0 new items, still generate drafts — lean harder on Tavily timely topics and evergreen persona shapes, and say so in the report.
