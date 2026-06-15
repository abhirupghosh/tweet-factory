import { readFileSync } from "node:fs";
import type { Env } from "./env.ts";

/** Post arbitrary text to a Slack incoming webhook. No-op if no URL. */
export async function slackPost(webhook: string | undefined, text: string): Promise<boolean> {
  if (!webhook) return false;
  const r = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`Slack post failed ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return true;
}

/** Split text into <limit chunks on line boundaries; hard-split overlong lines. */
function chunkLines(body: string, limit = 3500): string[] {
  const chunks: string[] = [];
  let cur = "";
  for (let line of body.split(/(?<=\n)/)) {
    while (line.length > limit) {
      if (cur) {
        chunks.push(cur);
        cur = "";
      }
      chunks.push(line.slice(0, limit));
      line = line.slice(limit);
    }
    if (cur.length + line.length > limit) {
      chunks.push(cur);
      cur = line;
    } else {
      cur += line;
    }
  }
  if (cur) chunks.push(cur);
  return chunks.length ? chunks : [""];
}

/** Post a file's contents across as many messages as needed (webhooks can't upload files). */
export async function slackPostFile(env: Env, path: string, header = "🧵 Fresh tweet drafts ready"): Promise<void> {
  const webhook = env.SLACK_WEBHOOK_URL;
  if (!webhook) {
    console.error("SLACK_WEBHOOK_URL not set — skipping Slack notification.");
    return;
  }
  const chunks = chunkLines(readFileSync(path, "utf8"));
  for (let i = 0; i < chunks.length; i++) {
    const label = chunks.length === 1 ? header : `${header} (${i + 1}/${chunks.length})`;
    await slackPost(webhook, `*${label}*\n\`\`\`\n${chunks[i]}\n\`\`\``);
  }
  console.error(`posted to Slack (${chunks.length} message${chunks.length !== 1 ? "s" : ""}).`);
}
