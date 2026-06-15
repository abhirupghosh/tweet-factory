import type { Env } from "./env.ts";

const API = "https://api.notion.com/v1";
const VERSION = "2022-06-28";

export interface NotionPage {
  id: string;
  title: string;
  url: string;
  last_edited: string;
}

function headers(env: Env): Record<string, string> {
  const key = env.NOTION_API_KEY;
  if (!key) throw new Error("NOTION_API_KEY not set in .env (create an internal integration at notion.so/my-integrations).");
  return {
    Authorization: `Bearer ${key}`,
    "Notion-Version": VERSION,
    "Content-Type": "application/json",
  };
}

function richText(arr: any[] | undefined): string {
  return (arr ?? []).map((t) => t.plain_text ?? "").join("");
}

function titleOf(page: any): string {
  // page title lives in a property of type "title"
  const props = page.properties ?? {};
  for (const k of Object.keys(props)) {
    if (props[k]?.type === "title") return richText(props[k].title) || "(untitled)";
  }
  // databases expose `title` at top level
  if (Array.isArray(page.title)) return richText(page.title) || "(untitled)";
  return "(untitled)";
}

/** Search pages the integration can access. */
export async function searchPages(env: Env, query = ""): Promise<NotionPage[]> {
  const out: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const r = await fetch(`${API}/search`, {
      method: "POST",
      headers: headers(env),
      body: JSON.stringify({
        query,
        filter: { property: "object", value: "page" },
        page_size: 50,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new Error(`Notion search failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
    const data = (await r.json()) as any;
    for (const p of data.results ?? []) {
      out.push({ id: p.id, title: titleOf(p), url: p.url ?? "", last_edited: p.last_edited_time ?? "" });
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor && out.length < 200);
  return out;
}

export async function pageMeta(env: Env, id: string): Promise<{ title: string; url: string; last_edited: string }> {
  const r = await fetch(`${API}/pages/${encodeURIComponent(id)}`, { headers: headers(env), signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`Notion page fetch failed (${r.status})`);
  const p = (await r.json()) as any;
  return { title: titleOf(p), url: p.url ?? "", last_edited: p.last_edited_time ?? "" };
}

const PREFIX: Record<string, string> = {
  heading_1: "# ",
  heading_2: "## ",
  heading_3: "### ",
  bulleted_list_item: "- ",
  numbered_list_item: "1. ",
  to_do: "- [ ] ",
  quote: "> ",
  callout: "> ",
};

async function blockChildren(env: Env, id: string, depth: number, budget: { n: number }): Promise<string[]> {
  if (depth > 3 || budget.n <= 0) return [];
  const lines: string[] = [];
  let cursor: string | undefined;
  do {
    const url = `${API}/blocks/${encodeURIComponent(id)}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`;
    const r = await fetch(url, { headers: headers(env), signal: AbortSignal.timeout(30_000) });
    if (!r.ok) break;
    const data = (await r.json()) as any;
    for (const b of data.results ?? []) {
      if (budget.n-- <= 0) break;
      const t = b.type as string;
      const body = b[t];
      if (t === "code") {
        lines.push("```" + (body.language ?? "") + "\n" + richText(body.rich_text) + "\n```");
      } else if (body?.rich_text) {
        const text = richText(body.rich_text);
        if (text) lines.push((PREFIX[t] ?? "") + text);
      }
      if (b.has_children && t !== "child_page" && t !== "child_database") {
        const nested = await blockChildren(env, b.id, depth + 1, budget);
        lines.push(...nested.map((l) => "  " + l));
      }
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor && budget.n > 0);
  return lines;
}

/** Fetch a page's content as markdown-ish text (bounded). */
export async function fetchPageMarkdown(env: Env, id: string): Promise<string> {
  const budget = { n: 300 }; // max blocks
  const lines = await blockChildren(env, id, 0, budget);
  const md = lines.join("\n");
  return md.length > 12000 ? md.slice(0, 12000) + "\n…(truncated)" : md;
}
