import type { Ctx } from "./config.ts";
import { openDb } from "./db.ts";

const MARKERS = [
  "insane", "so over", "absolute beauty", "damn", "blessed", "cooked",
  "hyped", "holy shit", "bullish", "wild", "neat",
];

export interface VoiceStats {
  handle: string;
  n_own: number;
  n_likes: number;
  n_bookmarks: number;
  lowercase_pct: number;
  median_words: number;
  markers: string[];
  authors: { username: string; count: number }[];
  recent: { text: string; like_count: number }[];
}

/** Voice/taste stats read straight from tweets.db. */
export function loadStats(ctx: Ctx): VoiceStats {
  const db = openDb(ctx.paths.db, true);
  try {
    const handleRow = db
      .query("SELECT author_username u FROM tweets WHERE source='own' AND author_username<>'' LIMIT 1")
      .get() as { u: string } | null;
    const handle = handleRow ? `@${handleRow.u}` : "@you";

    const count = (src: string) =>
      (db.query("SELECT COUNT(*) c FROM tweets WHERE source=?").get(src) as { c: number }).c;

    const texts = (
      db
        .query(
          "SELECT text FROM tweets WHERE source='own' AND COALESCE(referenced_type,'original')='original' AND text<>''",
        )
        .all() as { text: string }[]
    ).map((r) => r.text);

    let lowercasePct = 0;
    let medianWords = 0;
    let markers: string[] = [];
    if (texts.length) {
      const lower = texts.filter((t) => {
        const c = t[0];
        return c && c === c.toLowerCase() && c !== c.toUpperCase();
      }).length;
      lowercasePct = Math.floor((lower * 100) / texts.length);
      const wc = texts.map((t) => t.split(/\s+/).filter(Boolean).length).sort((a, b) => a - b);
      medianWords = wc[Math.floor(wc.length / 2)] ?? 0;
      const hits = new Map<string, number>();
      for (const t of texts) {
        const lc = t.toLowerCase();
        for (const m of MARKERS) if (lc.includes(m)) hits.set(m, (hits.get(m) ?? 0) + 1);
      }
      markers = [...hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m]) => m);
    }

    const authors = (
      db
        .query(
          "SELECT author_username u, COUNT(*) c FROM tweets WHERE source='like' AND author_username<>'' " +
            "GROUP BY u ORDER BY c DESC LIMIT 14",
        )
        .all() as { u: string; c: number }[]
    ).map((r) => ({ username: r.u, count: r.c }));

    const recent = (
      db
        .query(
          "SELECT text, COALESCE(like_count,0) like_count FROM tweets WHERE source='own' " +
            "AND COALESCE(referenced_type,'original')='original' AND text<>'' ORDER BY created_at DESC LIMIT 6",
        )
        .all() as { text: string; like_count: number }[]
    );

    return {
      handle,
      n_own: count("own"),
      n_likes: count("like"),
      n_bookmarks: count("bookmark"),
      lowercase_pct: lowercasePct,
      median_words: medianWords,
      markers,
      authors,
      recent,
    };
  } finally {
    db.close();
  }
}

/** Heuristic 0-100 reach score + one-line roast. */
export function roast(text: string): { score: number; quip: string } {
  const t = text.trim();
  const lc = t.toLowerCase();
  let score = 40;
  let weakest = "needs a sharper hook";

  if (t.endsWith("?")) score += 18;
  else {
    score += 4;
    weakest = "no question — nothing to reply to";
  }
  if (t.length > 120 || t.includes("\n")) score += 12;
  else score += 4;
  if ((t.match(/#/g) ?? []).length >= 3) {
    score -= 15;
    weakest = "3+ hashtags reads as spam to the quality classifier";
  }
  if (lc.includes("http")) {
    score -= 12;
    weakest = "link in the body tanks dwell — put it in a reply";
  }
  if (/[0-9]/.test(t)) score += 8;
  if (t.split(/\s+/).filter(Boolean).length < 4) {
    score -= 6;
    weakest = "too thin — give it a real stake";
  }
  score = Math.max(5, Math.min(98, score));
  const quip = score >= 80 ? "this one actually slaps." : score >= 60 ? `solid. fix: ${weakest}.` : `oof. ${weakest}.`;
  return { score, quip };
}
