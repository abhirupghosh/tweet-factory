import { Database } from "bun:sqlite";

// Stable on-disk schema: existing tweets.db files stay drop-in compatible
// across upgrades. Change columns only with a migration.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS authors (
  id TEXT PRIMARY KEY,
  username TEXT, name TEXT, description TEXT,
  followers INTEGER, following INTEGER, tweet_count INTEGER, verified INTEGER
);
CREATE TABLE IF NOT EXISTS tweets (
  id TEXT, source TEXT,
  author_id TEXT, author_username TEXT,
  text TEXT, created_at TEXT, lang TEXT, conversation_id TEXT,
  in_reply_to_user_id TEXT,
  retweet_count INTEGER, reply_count INTEGER, like_count INTEGER,
  quote_count INTEGER, impression_count INTEGER, bookmark_count INTEGER,
  referenced_type TEXT,
  hashtags TEXT, mentions TEXT, urls TEXT, annotations TEXT,
  fetched_rank INTEGER,
  PRIMARY KEY (id, source)
);
CREATE TABLE IF NOT EXISTS article_content (
  tweet_id TEXT, url TEXT, content TEXT, title TEXT,
  method TEXT, ok INTEGER, fetched_at TEXT,
  PRIMARY KEY (tweet_id, url)
);
CREATE TABLE IF NOT EXISTS notion_pages (
  id TEXT PRIMARY KEY, title TEXT, url TEXT,
  tag TEXT, note TEXT, content TEXT, last_edited TEXT, fetched_at TEXT
);
`;

export interface NotionRow {
  id: string;
  title: string;
  url: string;
  tag: string;
  note: string | null;
  content: string | null;
  last_edited: string | null;
  fetched_at: string | null;
}

export function upsertNotionPage(db: Database, row: NotionRow): void {
  db.prepare(
    "INSERT INTO notion_pages (id,title,url,tag,note,content,last_edited,fetched_at) VALUES (?,?,?,?,?,?,?,?) " +
      "ON CONFLICT(id) DO UPDATE SET title=excluded.title, url=excluded.url, tag=excluded.tag, " +
      "note=COALESCE(excluded.note,notion_pages.note), content=COALESCE(excluded.content,notion_pages.content), " +
      "last_edited=excluded.last_edited, fetched_at=excluded.fetched_at",
  ).run(row.id, row.title, row.url, row.tag, row.note, row.content, row.last_edited, row.fetched_at);
}

export function listNotionPages(db: Database): NotionRow[] {
  return db.query("SELECT * FROM notion_pages ORDER BY tag, title").all() as NotionRow[];
}

export function deleteNotionPage(db: Database, id: string): void {
  db.prepare("DELETE FROM notion_pages WHERE id=?").run(id);
}

export type Sql = string | number | bigint | boolean | null | Uint8Array;

export function openDb(path: string, readonly = false): Database {
  const db = new Database(path, readonly ? { readonly: true } : { create: true });
  if (!readonly) {
    db.exec(SCHEMA);
    db.exec("PRAGMA busy_timeout=5000;");
  }
  return db;
}

interface XUser {
  id: string;
  username?: string;
  name?: string;
  description?: string;
  verified?: boolean;
  public_metrics?: {
    followers_count?: number;
    following_count?: number;
    tweet_count?: number;
  };
}

export function upsertAuthors(db: Database, users: XUser[] | undefined): void {
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO authors VALUES (?,?,?,?,?,?,?,?)",
  );
  for (const u of users ?? []) {
    const m = u.public_metrics ?? {};
    stmt.run(
      u.id,
      u.username ?? null,
      u.name ?? null,
      u.description ?? null,
      m.followers_count ?? null,
      m.following_count ?? null,
      m.tweet_count ?? null,
      u.verified ? 1 : 0,
    );
  }
}

interface XTweet {
  id: string;
  author_id?: string;
  text?: string;
  created_at?: string;
  lang?: string;
  conversation_id?: string;
  in_reply_to_user_id?: string;
  public_metrics?: Record<string, number>;
  entities?: {
    hashtags?: { tag?: string }[];
    mentions?: { username?: string }[];
    urls?: { expanded_url?: string }[];
  };
  context_annotations?: { domain?: { name?: string }; entity?: { name?: string } }[];
  referenced_tweets?: { type: string; id: string }[];
  note_tweet?: { text?: string };
}

/** Store a page of tweets. Column order MUST match the 21-col tweets schema.
 *  Returns the next fetched_rank (a per-fetch ordering counter). */
export function storeTweets(
  db: Database,
  source: string,
  tweets: XTweet[],
  authorMap: Map<string, string>,
  startRank: number,
): number {
  let rank = startRank;
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO tweets VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  );
  const tx = db.transaction((rows: XTweet[]) => {
    for (const t of rows) {
      const m = t.public_metrics ?? {};
      const ent = t.entities ?? {};
      const hashtags = (ent.hashtags ?? []).map((h) => h.tag ?? "").join(",");
      const mentions = (ent.mentions ?? []).map((h) => h.username ?? "").join(",");
      const urls = (ent.urls ?? [])
        .filter((h) => h.expanded_url)
        .map((h) => h.expanded_url!)
        .join(",");
      const ann = (t.context_annotations ?? [])
        .map((c) => `${c.domain?.name ?? ""}:${c.entity?.name ?? ""}`)
        .join(",");
      const refType = t.referenced_tweets?.[0]?.type ?? null;
      const aid = t.author_id ?? null;
      // note_tweet holds full text for long tweets
      const text = t.note_tweet?.text || t.text || "";
      stmt.run(
        t.id,
        source,
        aid,
        aid ? authorMap.get(aid) ?? "" : "",
        text,
        t.created_at ?? null,
        t.lang ?? null,
        t.conversation_id ?? null,
        t.in_reply_to_user_id ?? null,
        m.retweet_count ?? null,
        m.reply_count ?? null,
        m.like_count ?? null,
        m.quote_count ?? null,
        m.impression_count ?? null,
        m.bookmark_count ?? null,
        refType,
        hashtags,
        mentions,
        urls,
        ann,
        rank,
      );
      rank += 1;
    }
  });
  tx(tweets);
  return rank;
}

export function existingIds(db: Database, source: string): Set<string> {
  const rows = db.query("SELECT id FROM tweets WHERE source=?").all(source) as {
    id: string;
  }[];
  return new Set(rows.map((r) => r.id));
}
