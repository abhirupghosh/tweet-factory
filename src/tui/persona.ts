import { mkdirSync, writeFileSync } from "node:fs";
import type { Ctx } from "../config.ts";
import type { VoiceStats } from "../analyze.ts";

export const TAGS = ["·", "inspiration", "competitor", "north-star", "friend"] as const;
export type TagIdx = number; // 0..4 index into TAGS

/** Write persona/PERSONA.md from interview answers + tagged accounts + measured stats. */
export function writePersona(
  ctx: Ctx,
  answers: string[],
  tags: TagIdx[],
  stats: VoiceStats,
): void {
  const voice = answers[3]?.trim() || "lowercase · terse";
  const tagged = stats.authors
    .map((a, i) => ({ a, t: tags[i] ?? 0 }))
    .filter((x) => x.t > 0)
    .map((x) => `@${x.a.username} (${TAGS[x.t]})`);
  const heroes = tagged.length
    ? tagged.join(", ")
    : stats.authors.slice(0, 5).map((a) => `@${a.username}`).join(", ");

  const md = `# Persona — ${stats.handle} (forged by tweet-factory)

## Identity
${answers[0]?.trim() || "—"}

## Voice
- ${voice}
- markers: ${stats.markers.length ? stats.markers.join(" · ") : "—"}
- ${stats.lowercase_pct}% of posts start lowercase; median ~${stats.median_words} words

## Lane (stay ~80% here)
${answers[0]?.trim() || "building with AI"}

## Hottest take (tone reference)
${answers[1]?.trim() || "—"}

## Building now
${answers[2]?.trim() || "—"}

## Hero / reply-target accounts
${heroes}

## Algorithm priors
Likes 1.0 > replies 0.5 > retweets 0.3 > dwell 0.2. First 24-48h matters. Reply natively to bigger
accounts. Original posts over replies for reach. See the optimizer rubric.

## Running notes
- forged via the tweet-factory onboarding TUI
`;
  mkdirSync(ctx.paths.personaDir, { recursive: true });
  writeFileSync(ctx.paths.persona, md);
}
