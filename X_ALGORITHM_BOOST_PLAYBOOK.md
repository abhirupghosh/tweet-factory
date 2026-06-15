# X Algorithm Boost Playbook

A distilled, **code-grounded** reference for the X "For You" ranking algorithm, used by
`tweet-factory` to score and optimize drafts. Every lever below traces to the open-source
[`xai-org/x-algorithm`](https://github.com/xai-org/x-algorithm) (2026 release: `grox`,
`thunder`, `home-mixer`, `phoenix`). Where a number is *not* in the code, it is labelled
`[inferred]` and should be treated as a heuristic, not a fact.

> This file is the **self-contained fallback** for the `/tweet-factory` skill and `tf generate`.
> If your org also installs the richer `twitter-algorithm-optimizer` skill, that takes precedence;
> otherwise this is the source of truth. Keep claims honest — the code does not publish weight
> magnitudes, so don't invent them.

---

## How ranking works (the pipeline)

A post must clear, in order:

1. **Grox eligibility gates** (pre-pipeline) — quality + safety classifiers. Fail → zero reach.
2. **Candidate sourcing** — Thunder (in-network, from your followers) and Phoenix (out-of-network,
   two-tower ANN retrieval, top-200 only).
3. **Pre-scoring filters** — blocks/mutes, muted keywords, dedup, age cutoff.
4. **Phoenix ML scoring** — `final_score = Σ(weight_i × P(action_i))` over ~19 predicted actions.
5. **Author-diversity decay + OON discount** — multiplicative penalties.
6. **Post-selection filters** — visibility filtering, conversation dedup.

The demo weights shipped in `phoenix/run_pipeline.py` are `favorite=1.0, reply=0.5,
retweet=0.3, dwell=0.2`. **Production weights are runtime parameters and are NOT published** —
treat ratios as directional only.

---

## The levers that matter (ranked, all code-proven unless noted)

### Hard gates — fail any and you get zero For You reach
- **Pass the quality gate.** Original posts are scored 0-1 by a VLM; `< 0.4` is filtered
  (`grox/classifiers/content/banger_initial_screen.py`). Write with clear intent, topical
  coherence, no low-effort filler.
- **Avoid the 7 PTOS categories** (`grox/classifiers/content/safety_ptos.py`): violent media,
  adult content, spam, illegal/regulated, hate/abuse, violent speech, self-harm.
- **Keep the account public** — protected accounts get no For You distribution.
- **Don't get blocked/muted** — `author_socialgraph_filter.rs` drops your post per-user. The
  `P(report)`, `P(block_author)`, `P(mute_author)` predictions carry the largest negative
  weights in scoring (`ranking_scorer.rs`).
- **Post inside the freshness window** — Thunder evicts posts after ~2 days
  (`thunder/posts/post_store.rs`), and `age_filter.rs` hard-cuts old posts. Phoenix also
  buckets age (fresher = better).

### High-impact positive levers
- **Grow followers.** In-network posts get full score; out-of-network is multiplied by an
  `OonWeightFactor < 1.0` (`ranking_scorer.rs`). Followers are structural reach.
- **Drive replies and dwell.** Replies and dwell are top positive signals. Ask a real question,
  take a debatable position, leave a framework others want to extend. Dwell is normalized to
  ~30s, so write something worth pausing on.
- **Build a consistent topical identity.** Phoenix OON retrieval is embedding-similarity based
  (top-200). Topic-hopping dilutes your embedding; coherence widens out-of-network reach.
  Engagement-farming by unrelated accounts does **not** move you into new retrieval pools.
- **Post native original content** (not link-outs, not pure retweets). Originals get their own
  Thunder deque and priority; video gets a third deque + a VQV scoring term.
- **Post at peak times.** Thunder sorts in-network purely by recency; early engagement
  (first 30-60 min) compounds. `[inferred]` best windows ~Tue-Thu 9-10am.
- **Drive reposts, shares (incl. DM/copy-link), quote tweets, profile clicks, follows** — each is
  a distinct additive signal in `ranking_scorer.rs`.
- **Add media.** `has_media` is an ML feature; `[inferred]` images ~2.5x engagement vs text-only.

### Negative levers — avoid
- **Author-diversity decay:** posting multiple times into the *same feed batch* attenuates each
  exponentially (`author_diversity_scorer.rs`). Space your posts. (This is per-batch, **not** a
  per-day count limit — see myths.)
- **Conversation dedup:** within a thread only the highest-scoring post survives
  (`dedup_conversation_filter.rs`). Put your effort into the T1 (thread starter).
- **Already-seen filter:** a post shown once won't re-appear (bloom filter); recycling exact
  content doesn't get re-served.
- **Muted keywords / brand-safety MediumRisk** suppress reach silently.

---

## Scoring rubric (use this to score a draft 0-100)

Score each draft against the levers, weighted by impact:

| Dimension | Weight | What earns points |
|---|---|---|
| Quality / clarity (passes the gate) | 20 | specific, coherent, non-filler, single clear idea |
| Reply pull | 18 | a real question, a debatable take, an extendable framework |
| Dwell / depth | 15 | rewards a 5-30s read; a number, a concrete example |
| Topical coherence | 12 | stays in the author's lane (consistent embedding) |
| Shareability (repost/DM/quote) | 12 | strong opinion, useful framework, notable data |
| Native format | 10 | no link in the primary body; media where it helps |
| Voice authenticity | 8 | sounds like the author, not generic LLM copy |
| Safety / no self-sabotage | 5 | no PTOS risk, not engagement-bait that draws reports |

Keep drafts scoring **≥ 70**. Below that, rewrite the 2-3 weakest dimensions or drop the draft.

---

## Myths the code contradicts (do NOT optimize for these)

- ❌ "Replies are worth 13.5x a like / reposts 20x." Demo weights are reply=0.5, retweet=0.3
  relative to like=1.0. The 13.5x/20x figures are legacy 2023 numbers.
- ❌ "3+ hashtags cut reach 40%." Spam detection is a VLM, not a hashtag counter. No
  hashtag-count threshold exists in the repo. (Still: hashtag-stuffing reads as low-quality.)
- ❌ "External links carry a hardcoded 50-90% penalty." No link-detection demote exists in code.
  The effect is *behavioral* (links lower dwell), so link-in-reply is still good practice — just
  don't claim a fixed penalty.
- ❌ "Posting 4+/day triggers a hard penalty." Author diversity is per-feed-batch, not per-day.
- ❌ "Bookmarks / Premium / sentiment are weighted signals." None appear in the open-source
  scoring code. Don't optimize for unpublished mechanisms.

---

## What the open source does NOT tell us
Engagement weight magnitudes, trained model weights, Grox thresholds beyond `0.4`, OON factor
values, and the visibility-filtering ("shadowban") thresholds are all runtime/black-box. Never
present any specific multiplier as code-proven. When in doubt, say it's inferred.

---

*Source: [`xai-org/x-algorithm`](https://github.com/xai-org/x-algorithm), 2026 open-source
release. Regenerate by cloning that repo and re-reading the files cited above.*
