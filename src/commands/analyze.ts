import { parseArgs } from "node:util";
import { loadCtx } from "../config.ts";
import { loadStats, roast } from "../analyze.ts";

export async function cmdAnalyze(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: { dir: { type: "string" }, json: { type: "boolean" }, roast: { type: "boolean" } },
    allowPositionals: true,
  });
  const ctx = loadCtx(values.dir);
  const s = loadStats(ctx);

  if (values.json) {
    console.log(JSON.stringify(s, null, 2));
    return;
  }

  if (values.roast) {
    console.log(`roast — ${s.handle}'s recent posts:\n`);
    for (const r of s.recent) {
      const { score, quip } = roast(r.text);
      console.log(`${String(score).padStart(3)}  ${r.text.replace(/\n/g, " ").slice(0, 60)}…  — ${quip}`);
    }
    return;
  }

  console.log(`voice/taste — ${s.handle}`);
  console.log(`  corpus: ${s.n_own} tweets · ${s.n_likes} likes · ${s.n_bookmarks} bookmarks`);
  console.log(`  voice: ${s.lowercase_pct}% lowercase-start · median ~${s.median_words} words`);
  if (s.markers.length) console.log(`  energy markers: ${s.markers.join(" · ")}`);
  console.log(`  top engaged: ${s.authors.slice(0, 10).map((a) => "@" + a.username).join("  ")}`);
}
