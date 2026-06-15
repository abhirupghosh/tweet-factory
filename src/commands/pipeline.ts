import { parseArgs } from "node:util";
import { loadCtx } from "../config.ts";
import { flushBuild, flushCommit, flushCount, flushStatus } from "../flush.ts";
import { tavilySearch } from "../tavily.ts";
import { slackPost, slackPostFile } from "../slack.ts";
import { runEnrich } from "../enrich.ts";
import { runFetch } from "../x/fetch.ts";
import { notionSync } from "./notion.ts";

export async function cmdFlush(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      dir: { type: "string" },
      commit: { type: "boolean" },
      status: { type: "boolean" },
      count: { type: "boolean" },
    },
    allowPositionals: true,
  });
  const ctx = loadCtx(values.dir);
  if (values.commit) flushCommit(ctx);
  else if (values.status) flushStatus(ctx);
  else if (values.count) flushCount(ctx);
  else flushBuild(ctx);
}

export async function cmdSearch(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      dir: { type: "string" },
      news: { type: "boolean" },
      days: { type: "string" },
      max: { type: "string" },
      json: { type: "boolean" },
    },
    allowPositionals: true,
  });
  const query = positionals.join(" ").trim();
  if (!query) throw new Error("usage: tf search <query> [--news --days N --max N --json]");
  const ctx = loadCtx(values.dir);
  const key = ctx.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY not set in .env");
  const data = await tavilySearch(key, query, {
    topic: values.news ? "news" : "general",
    days: values.days ? Number(values.days) : 7,
    max: values.max ? Number(values.max) : 5,
  });
  if (values.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  console.log(`## Tavily: ${query}`);
  if (data.answer) console.log(`\n**Summary:** ${data.answer}\n`);
  for (const res of data.results ?? []) {
    const date = (res.published_date ?? "").slice(0, 10);
    console.log(`- **${res.title ?? ""}** ${date ? `(${date})` : ""}`);
    console.log(`  ${res.url ?? ""}`);
    const snippet = (res.content ?? "").trim().replace(/\n/g, " ");
    if (snippet) console.log(`  ${snippet.slice(0, 280)}`);
  }
  console.log();
}

export async function cmdNotify(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { dir: { type: "string" } },
    allowPositionals: true,
  });
  const [file, header] = positionals;
  if (!file) throw new Error("usage: tf notify <file> [header]");
  const ctx = loadCtx(values.dir);
  await slackPostFile(ctx.env, file, header);
}

export async function cmdEnrich(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: { dir: { type: "string" }, all: { type: "boolean" }, force: { type: "boolean" } },
    allowPositionals: true,
  });
  const ctx = loadCtx(values.dir);
  await runEnrich(ctx, { all: Boolean(values.all), force: Boolean(values.force) });
}

export async function cmdUpdate(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: { dir: { type: "string" } },
    allowPositionals: true,
  });
  const ctx = loadCtx(values.dir);
  await runFetch(ctx, { incremental: true });
  flushBuild(ctx);
}

export async function cmdCron(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: { dir: { type: "string" }, "enrich-all": { type: "boolean" } },
    allowPositionals: true,
  });
  const ctx = loadCtx(values.dir);
  console.error(`===== cron ${new Date().toISOString()} =====`);
  await runFetch(ctx, { incremental: true });
  await runEnrich(ctx, { all: Boolean(values["enrich-all"]) });
  if (ctx.env.NOTION_API_KEY) await notionSync(ctx).catch((e) => console.error("notion sync failed:", (e as Error).message));
  flushBuild(ctx);
  const pending = flushCount(ctx);
  console.error(`pending=${pending}`);
  if (pending > 0 && ctx.env.SLACK_WEBHOOK_URL) {
    await slackPost(
      ctx.env.SLACK_WEBHOOK_URL,
      `🆕 ${pending} new X interactions ready — run \`tf generate\` for fresh drafts.`,
    );
    console.error(" [slack pinged]");
  }
}
