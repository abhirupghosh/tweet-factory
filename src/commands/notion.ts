import { parseArgs } from "node:util";
import { loadCtx, type Ctx } from "../config.ts";
import { deleteNotionPage, listNotionPages, openDb, upsertNotionPage } from "../db.ts";
import { fetchPageMarkdown, pageMeta, searchPages } from "../notion.ts";

/** Refresh content of all tagged pages (incremental via last_edited). Used by cron + TUI. */
export async function notionSync(ctx: Ctx, force = false): Promise<number> {
  if (!ctx.env.NOTION_API_KEY) {
    console.error("NOTION_API_KEY not set — skipping Notion sync.");
    return 0;
  }
  const db = openDb(ctx.paths.db);
  try {
    const pages = listNotionPages(db);
    let synced = 0;
    for (const p of pages) {
      const meta = await pageMeta(ctx.env, p.id).catch(() => null);
      if (!meta) {
        console.error(`  skip ${p.title} (unreachable — is it shared with the integration?)`);
        continue;
      }
      if (!force && p.last_edited === meta.last_edited && p.content) continue;
      const content = await fetchPageMarkdown(ctx.env, p.id).catch(() => p.content ?? "");
      upsertNotionPage(db, {
        id: p.id,
        title: meta.title || p.title,
        url: meta.url || p.url,
        tag: p.tag,
        note: p.note,
        content,
        last_edited: meta.last_edited,
        fetched_at: new Date().toISOString(),
      });
      synced++;
      console.error(`  synced [${p.tag}] ${meta.title} (${content.length} ch)`);
    }
    console.error(`notion: synced ${synced}/${pages.length} tagged pages`);
    return synced;
  } finally {
    db.close();
  }
}

/** Tag (designate) a page and cache its content immediately. Programmatic API for the TUI. */
export async function notionTag(ctx: Ctx, id: string, tag: string, note?: string): Promise<void> {
  const db = openDb(ctx.paths.db);
  try {
    const meta = await pageMeta(ctx.env, id);
    const content = await fetchPageMarkdown(ctx.env, id).catch(() => "");
    upsertNotionPage(db, {
      id,
      title: meta.title,
      url: meta.url,
      tag,
      note: note ?? null,
      content,
      last_edited: meta.last_edited,
      fetched_at: new Date().toISOString(),
    });
  } finally {
    db.close();
  }
}

export async function cmdNotion(argv: string[]): Promise<void> {
  const sub = argv[0];
  const rest = argv.slice(1);

  switch (sub) {
    case "search": {
      const { values, positionals } = parseArgs({
        args: rest,
        options: { dir: { type: "string" }, json: { type: "boolean" } },
        allowPositionals: true,
      });
      const ctx = loadCtx(values.dir);
      const pages = await searchPages(ctx.env, positionals.join(" "));
      if (values.json) {
        console.log(JSON.stringify(pages, null, 2));
        return;
      }
      for (const p of pages) console.log(`${p.id}  ${p.title}\n    ${p.url}`);
      console.error(`\n${pages.length} pages accessible to the integration.`);
      return;
    }
    case "tag": {
      const { values, positionals } = parseArgs({
        args: rest,
        options: { dir: { type: "string" }, tag: { type: "string" }, note: { type: "string" } },
        allowPositionals: true,
      });
      const id = positionals[0];
      if (!id || !values.tag) throw new Error("usage: tf notion tag <pageId> --tag <label> [--note <text>]");
      const ctx = loadCtx(values.dir);
      await notionTag(ctx, id, values.tag, values.note);
      console.error(`tagged ${id} as [${values.tag}] and cached its content.`);
      return;
    }
    case "untag": {
      const { values, positionals } = parseArgs({
        args: rest,
        options: { dir: { type: "string" } },
        allowPositionals: true,
      });
      const id = positionals[0];
      if (!id) throw new Error("usage: tf notion untag <pageId>");
      const ctx = loadCtx(values.dir);
      const db = openDb(ctx.paths.db);
      try {
        deleteNotionPage(db, id);
      } finally {
        db.close();
      }
      console.error(`untagged ${id}.`);
      return;
    }
    case "list": {
      const { values } = parseArgs({
        args: rest,
        options: { dir: { type: "string" }, json: { type: "boolean" }, full: { type: "boolean" } },
        allowPositionals: true,
      });
      const ctx = loadCtx(values.dir);
      const db = openDb(ctx.paths.db); // write-mode ensures notion_pages exists on older DBs
      const rows = listNotionPages(db);
      db.close();
      if (values.json) {
        console.log(JSON.stringify(values.full ? rows : rows.map(({ content, ...r }) => r), null, 2));
        return;
      }
      for (const r of rows)
        console.log(`[${r.tag}] ${r.title}${r.note ? ` — ${r.note}` : ""}  (${(r.content ?? "").length} ch)`);
      console.error(`\n${rows.length} tagged Notion pages.`);
      return;
    }
    case "sync": {
      const { values } = parseArgs({
        args: rest,
        options: { dir: { type: "string" }, force: { type: "boolean" } },
        allowPositionals: true,
      });
      const ctx = loadCtx(values.dir);
      await notionSync(ctx, Boolean(values.force));
      return;
    }
    default:
      console.error("usage: tf notion <search|tag|untag|list|sync> [...]");
      process.exit(2);
  }
}
