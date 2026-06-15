import type { Database } from "bun:sqlite";
import type { Ctx } from "./config.ts";
import { openDb } from "./db.ts";
import { Auth } from "./x/auth.ts";
import { tweetText } from "./x/api.ts";
import { tavilyExtract } from "./tavily.ts";

const X_ARTICLE = /https?:\/\/(?:x|twitter)\.com\/i\/article\/(\d+)/;

export interface EnrichOpts {
  all?: boolean;
  force?: boolean;
}

function already(db: Database, tweetId: string, url: string): boolean {
  return db.query("SELECT 1 FROM article_content WHERE tweet_id=? AND url=?").get(tweetId, url) != null;
}

function store(
  db: Database,
  tweetId: string,
  url: string,
  content: string | null,
  method: string,
  ok: boolean,
): void {
  db.prepare("INSERT OR REPLACE INTO article_content VALUES (?,?,?,?,?,?,?)").run(
    tweetId,
    url,
    content,
    null,
    method,
    ok ? 1 : 0,
    new Date().toISOString(),
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runEnrich(ctx: Ctx, opts: EnrichOpts = {}): Promise<void> {
  const key = ctx.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY not set in .env");
  const sources = opts.all ? ["bookmark", "like", "own"] : ["bookmark"];
  const auth = new Auth(ctx.env, ctx.paths); // for the X-native article attempt
  const db = openDb(ctx.paths.db);

  let extOk = 0,
    xOk = 0,
    fail = 0,
    skip = 0;
  try {
    const placeholders = sources.map(() => "?").join(",");
    const rows = db
      .query(
        `SELECT id, urls, author_username FROM tweets WHERE source IN (${placeholders}) ` +
          "AND urls IS NOT NULL AND urls<>''",
      )
      .all(...sources) as { id: string; urls: string; author_username: string }[];

    for (const { id, urls, author_username: author } of rows) {
      for (const url of urls.split(",").filter(Boolean)) {
        if (url.includes("t.co/")) continue;
        if (!opts.force && already(db, id, url)) {
          skip++;
          continue;
        }
        const m = X_ARTICLE.exec(url);
        try {
          if (m) {
            const content = await tweetText(auth, m[1]);
            if (content) {
              store(db, id, url, content, "x_api", true);
              xOk++;
              console.error(`  x-article ok   @${author} (${content.length} ch)`);
            } else {
              store(db, id, url, null, "x_api", false);
              fail++;
              console.error(`  x-article FAIL @${author} (auth-walled) ${url}`);
            }
          } else {
            const content = await tavilyExtract(key, url);
            if (content) {
              store(db, id, url, content, "tavily", true);
              extOk++;
              console.error(`  external ok    @${author} (${content.length} ch) ${url.slice(0, 60)}`);
            } else {
              store(db, id, url, null, "tavily", false);
              fail++;
              console.error(`  external FAIL  @${author} ${url.slice(0, 60)}`);
            }
            await sleep(800); // gentle on Tavily
          }
        } catch (e) {
          store(db, id, url, null, "error", false);
          fail++;
          console.error(`  ERROR @${author} ${url.slice(0, 60)}: ${(e as Error).message}`);
        }
      }
    }

    console.error(`\n=== enrichment summary ===`);
    console.error(`  external (Tavily) ok: ${extOk}`);
    console.error(`  x-native article ok:  ${xOk}`);
    console.error(`  failed/unavailable:   ${fail}`);
    console.error(`  skipped (already):    ${skip}`);
    const total = (db.query("SELECT COUNT(*) c FROM article_content WHERE ok=1").get() as { c: number }).c;
    console.error(`  total stored article bodies: ${total}`);
  } finally {
    db.close();
  }
}
