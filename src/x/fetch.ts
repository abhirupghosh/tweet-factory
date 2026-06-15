import type { Ctx } from "../config.ts";
import { openDb } from "../db.ts";
import { Auth } from "./auth.ts";
import { fetchPaginated, resolveUserId } from "./api.ts";

export interface FetchOpts {
  sources?: string[];
  incremental?: boolean;
}

const ALL_TARGETS = (id: string) => [
  { path: `/users/${id}/liked_tweets`, source: "like", label: "LIKES" },
  { path: `/users/${id}/bookmarks`, source: "bookmark", label: "BOOKMARKS" },
  { path: `/users/${id}/tweets`, source: "own", label: "OWN TWEETS" },
];

export async function runFetch(ctx: Ctx, opts: FetchOpts = {}): Promise<void> {
  const auth = new Auth(ctx.env, ctx.paths);
  const db = openDb(ctx.paths.db);
  try {
    const { id } = await resolveUserId(auth);
    let targets = ALL_TARGETS(id);
    if (opts.sources?.length) targets = targets.filter((t) => opts.sources!.includes(t.source));

    console.error(`Fetch mode: ${opts.incremental ? "incremental" : "full"}`);
    for (const t of targets) {
      console.error(`\n=== Fetching ${t.label} ===`);
      await fetchPaginated(auth, db, t.path, t.source, t.label, opts.incremental);
    }

    console.error("\n=== Database summary ===");
    const sources = db.query("SELECT DISTINCT source FROM tweets").all() as { source: string }[];
    for (const { source } of sources) {
      const n = (db.query("SELECT COUNT(*) c FROM tweets WHERE source=?").get(source) as { c: number }).c;
      console.error(`  ${source}: ${n}`);
    }
    const na = (db.query("SELECT COUNT(*) c FROM authors").get() as { c: number }).c;
    console.error(`  distinct authors: ${na}`);
  } finally {
    db.close();
  }
}
