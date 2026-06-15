# Persona — @YOUR_HANDLE (living doc, updated each run by the tweet-factory skill)

_Copy this file to `persona/PERSONA.md` and fill it in. The skill updates PERSONA.md from `flush/pending.md` each run. The richer this is, the better the voice match._

## Identity
Who you are in one or two lines: role, company/project, location, anything that shapes what you post about.

## Voice (the rules the skill must obey when drafting)
List your actual stylistic rules. Examples to adapt:
- Casing (e.g. lowercase-start, or sentence case).
- Typical length (short and punchy vs. longer threads).
- Energy / tone markers (words and phrases you actually use).
- Structure habits (bullets, threads, emoji usage).
- Stance (contrarian, earnest, analytical, funny).
- **Banned phrases** you never want in your tweets (AI-slop, engagement bait, "this isn't X it's Y", etc.).

> Tip: run `tf fetch` (or `tf analyze`) then look at your own top tweets in `tweets.db` to extract these rules from real data.

## Lane (stay ~80% here for a sharp ranking embedding)
The 1-2 topics you want to be known for. The X ranker embeds you into interest clusters by topical consistency, so topic-hopping dilutes out-of-network reach.

## What performs (replicate these shapes)
Once you have data, list your own best-performing post shapes with examples and their metrics.

## What to avoid
Patterns that flatline for you, plus algorithm penalties: burst-posting (author-diversity decay), pure-reply self-threads (conversation dedup), listicle-slop (quality classifier demotes it).

## Taste signals (who/what you engage — mine for collab + reply targets)
Accounts you like/bookmark most, and the kinds of content you save. The skill fills this in from your flush over time.

## Algorithm priors (from X_ALGORITHM_BOOST_PLAYBOOK.md)
Likes weight 1.0 (primary) > replies 0.5 > retweets 0.3 > dwell 0.2. First 24-48h engagement drives out-of-network reach. Reply natively to bigger accounts (compounds via RealGraph). Add media. The 2026 quality classifier rewards original/specific over templated.

## Running notes (skill appends dated observations here)
- _(none yet)_
