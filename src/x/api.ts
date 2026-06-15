import type { Database } from "bun:sqlite";
import { Auth } from "./auth.ts";
import { existingIds, storeTweets, upsertAuthors } from "../db.ts";

export const API = "https://api.twitter.com/2";

const TWEET_FIELDS =
  "created_at,public_metrics,lang,entities,referenced_tweets," +
  "conversation_id,in_reply_to_user_id,possibly_sensitive,context_annotations,note_tweet";
const USER_FIELDS = "username,name,public_metrics,description,verified";
const EXPANSIONS = "author_id,referenced_tweets.id,referenced_tweets.id.author_id";

async function authedGet(auth: Auth, url: string): Promise<Response> {
  return fetch(url, { headers: auth.authHeader() });
}

/** Resolve the authenticated user's id via /2/users/me (works for any account). */
export async function resolveUserId(auth: Auth): Promise<{ id: string; username: string }> {
  let r = await authedGet(auth, `${API}/users/me`);
  if (r.status === 401 && (await auth.onUnauthorized())) r = await authedGet(auth, `${API}/users/me`);
  if (!r.ok) throw new Error(`Could not resolve user (/2/users/me ${r.status}): ${(await r.text()).slice(0, 200)}`);
  const u = ((await r.json()) as any).data;
  console.error(`Authenticated as @${u.username} (id ${u.id})`);
  return { id: u.id, username: u.username };
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/** Page through a timeline endpoint, storing into the db. */
export async function fetchPaginated(
  auth: Auth,
  db: Database,
  path: string,
  source: string,
  label: string,
  incremental = false,
): Promise<number> {
  const baseParams: Record<string, string> = {
    max_results: "100",
    "tweet.fields": TWEET_FIELDS,
    "user.fields": USER_FIELDS,
    expansions: EXPANSIONS,
  };
  const seen = incremental ? existingIds(db, source) : new Set<string>();
  let total = 0;
  let rank = 0;
  let page = 0;
  let pageToken: string | undefined;

  while (true) {
    const params = new URLSearchParams(baseParams);
    if (pageToken) params.set("pagination_token", pageToken);
    const url = `${API}${path}?${params.toString()}`;
    const r = await authedGet(auth, url);

    if (r.status === 401) {
      if (await auth.onUnauthorized()) continue;
      console.error(`  ERROR 401 (auth not accepted for ${label})`);
      break;
    }
    if (r.status === 403) {
      console.error(`  SKIP ${label}: 403 ${(await r.text()).slice(0, 200)}`);
      break;
    }
    if (r.status === 429) {
      const reset = Number(r.headers.get("x-rate-limit-reset") ?? Math.floor(Date.now() / 1000) + 60);
      const wait = Math.max(5, reset - Math.floor(Date.now() / 1000) + 2);
      console.error(`  rate limited; sleeping ${wait}s...`);
      await sleep(wait * 1000);
      continue;
    }
    if (!r.ok) {
      console.error(`  ERROR ${r.status}: ${(await r.text()).slice(0, 300)}`);
      break;
    }

    const body = (await r.json()) as any;
    const data: any[] = body.data ?? [];
    const users: any[] = body.includes?.users ?? [];
    const authorMap = new Map<string, string>(users.map((u) => [u.id, u.username ?? ""]));
    upsertAuthors(db, users);
    const newInPage = data.filter((t) => !seen.has(t.id)).length;
    rank = storeTweets(db, source, data, authorMap, rank);
    total += data.length;
    page += 1;
    console.error(`  ${label}: page ${page}, +${data.length} (${newInPage} new, total ${total})`);

    if (incremental && page >= 1 && newInPage === 0) {
      console.error(`  ${label}: up to date, stopping early`);
      break;
    }
    pageToken = body.meta?.next_token;
    if (!pageToken) break;
    await sleep(1000); // gentle pacing
  }
  console.error(`  ${label}: DONE -> ${total} tweets`);
  return total;
}

/** Best-effort fetch of a single tweet's text (used by enrich for X-native articles). */
export async function tweetText(auth: Auth, id: string): Promise<string | null> {
  const url = `${API}/tweets/${id}?${new URLSearchParams({ "tweet.fields": "note_tweet,text" }).toString()}`;
  let r = await authedGet(auth, url);
  if (r.status === 401 && (await auth.onUnauthorized())) r = await authedGet(auth, url);
  if (!r.ok) return null;
  const d = ((await r.json()) as any).data ?? {};
  return d.note_tweet?.text || d.text || null;
}
