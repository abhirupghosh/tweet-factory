import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Ctx } from "./config.ts";
import { openDb } from "./db.ts";

const SOURCES = ["like", "bookmark", "own"] as const;
type Source = (typeof SOURCES)[number];

interface State {
  processed: Record<Source, string[]>;
  baselined_at?: string;
  last_commit?: string;
}

interface Row {
  id: string;
  author_username: string | null;
  text: string;
  created_at: string | null;
  like_count: number | null;
  retweet_count: number | null;
  reply_count: number | null;
  ty: string;
}

function ensureDirs(ctx: Ctx) {
  mkdirSync(ctx.paths.flushDir, { recursive: true });
  mkdirSync(ctx.paths.flushArchive, { recursive: true });
}

function loadState(ctx: Ctx): State | null {
  if (!existsSync(ctx.paths.flushState)) return null;
  return JSON.parse(readFileSync(ctx.paths.flushState, "utf8"));
}
function saveState(ctx: Ctx, state: State) {
  writeFileSync(ctx.paths.flushState, JSON.stringify(state));
}

function pending(ctx: Ctx, state: State): Record<Source, Row[]> {
  const db = openDb(ctx.paths.db, true);
  try {
    const out = {} as Record<Source, Row[]>;
    for (const s of SOURCES) {
      const proc = new Set(state.processed?.[s] ?? []);
      const rows = db
        .query(
          "SELECT id, author_username, text, created_at, like_count, retweet_count, " +
            "reply_count, COALESCE(referenced_type,'original') ty " +
            "FROM tweets WHERE source=? ORDER BY fetched_rank",
        )
        .all(s) as Row[];
      out[s] = rows.filter((r) => !proc.has(r.id));
    }
    return out;
  } finally {
    db.close();
  }
}

function baseline(ctx: Ctx): State {
  const db = openDb(ctx.paths.db, true);
  try {
    const processed = {} as Record<Source, string[]>;
    for (const s of SOURCES) {
      processed[s] = (db.query("SELECT id FROM tweets WHERE source=? ORDER BY fetched_rank").all(s) as { id: string }[]).map(
        (r) => r.id,
      );
    }
    const state: State = { processed, baselined_at: new Date().toISOString() };
    saveState(ctx, state);
    return state;
  } finally {
    db.close();
  }
}

function writePendingMd(ctx: Ctx, pend: Record<Source, Row[]>): number {
  const LABELS: Record<Source, string> = {
    like: "NEW LIKES",
    bookmark: "NEW BOOKMARKS",
    own: "YOUR NEW TWEETS",
  };
  const body: string[] = [];
  let total = 0;
  for (const s of SOURCES) {
    const items = pend[s];
    total += items.length;
    body.push(`\n## ${LABELS[s]} (${items.length})`);
    if (items.length === 0) {
      body.push("_(none)_");
      continue;
    }
    for (const r of items) {
      const d = (r.created_at ?? "").slice(0, 10);
      const meta = r.author_username ? `@${r.author_username}` : "";
      body.push(`\n- [${d} ${meta} ♥${r.like_count} ↻${r.retweet_count} ${r.ty}]\n  ${r.text}`);
    }
  }
  const header = [
    "# Flush — pending new interactions",
    `_generated ${new Date().toISOString()}_`,
    `**Total pending: ${total}**`,
    "",
  ];
  writeFileSync(ctx.paths.flushPending, header.concat(body).join("\n") + "\n");
  return total;
}

export function flushBuild(ctx: Ctx): void {
  ensureDirs(ctx);
  const state = loadState(ctx);
  if (state === null) {
    baseline(ctx);
    writeFileSync(
      ctx.paths.flushPending,
      "# Flush — pending new interactions\n\n**Total pending: 0** " +
        "(baseline initialized; everything currently in tweets.db marked processed)\n",
    );
    console.error("baseline initialized; pending=0 (all current items marked processed)");
    return;
  }
  const pend = pending(ctx, state);
  writePendingMd(ctx, pend);
  console.error(
    `pending written -> ${ctx.paths.flushPending}  (likes=${pend.like.length} ` +
      `bookmarks=${pend.bookmark.length} own=${pend.own.length} total=${pend.like.length + pend.bookmark.length + pend.own.length})`,
  );
}

export function flushCommit(ctx: Ctx): void {
  ensureDirs(ctx);
  const state: State = loadState(ctx) ?? { processed: { like: [], bookmark: [], own: [] } };
  const pend = pending(ctx, state);
  let moved = 0;
  for (const s of SOURCES) {
    state.processed[s] ??= [];
    state.processed[s].push(...pend[s].map((r) => r.id));
    moved += pend[s].length;
  }
  state.last_commit = new Date().toISOString();
  saveState(ctx, state);
  if (existsSync(ctx.paths.flushPending)) {
    const stamp = new Date().toISOString().replace(/\.\d+Z$/, "Z").replace(/:/g, "");
    renameSync(ctx.paths.flushPending, join(ctx.paths.flushArchive, `flush-${stamp}.md`));
  }
  console.error(`committed ${moved} items as processed; pending cleared`);
}

export function flushStatus(ctx: Ctx): void {
  const state = loadState(ctx);
  if (state === null) {
    console.error("no state yet (first build will baseline)");
    return;
  }
  const pend = pending(ctx, state);
  for (const s of SOURCES) console.error(`  ${s}: ${pend[s].length} pending`);
}

export function flushCount(ctx: Ctx): number {
  const state = loadState(ctx);
  if (state === null) {
    console.log(0);
    return 0;
  }
  const pend = pending(ctx, state);
  const n = pend.like.length + pend.bookmark.length + pend.own.length;
  console.log(n); // stdout only — cron parses this
  return n;
}
