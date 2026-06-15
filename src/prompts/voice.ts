import { existsSync, readFileSync } from "node:fs";
import type { Ctx } from "../config.ts";
import { loadStats } from "../analyze.ts";

/** Build the voice system prompt from persona/PERSONA.md (+ live stats as a fallback/augment). */
export function voiceSystem(ctx: Ctx): string {
  let persona = "";
  if (existsSync(ctx.paths.persona)) persona = readFileSync(ctx.paths.persona, "utf8");

  const s = loadStats(ctx);
  const derived = [
    `Handle: ${s.handle}`,
    `Measured voice: ${s.lowercase_pct}% of posts start lowercase; median ~${s.median_words} words.`,
    s.markers.length ? `Recurring energy markers: ${s.markers.join(", ")}.` : "",
    s.authors.length ? `Engages most with: ${s.authors.slice(0, 8).map((a) => "@" + a.username).join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const personaBlock = persona.trim()
    ? `The account owner's persona (source of truth for voice):\n\n${persona.trim()}`
    : `No persona file yet — infer voice from the measured signals below.`;

  return `You write tweets AS this specific account owner, matching their voice exactly. Never flatten their
voice into generic LinkedIn copy. Keep their casing, terseness, phrasing, and stance.

${personaBlock}

Measured signals from their real tweets:
${derived}`;
}
