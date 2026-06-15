import { parseArgs } from "node:util";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadCtx } from "../config.ts";
import { generateOnboarding } from "../llm/generate.ts";
import { slackPostFile } from "../slack.ts";

export async function cmdGenerate(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      dir: { type: "string" },
      n: { type: "string" },
      provider: { type: "string" },
      model: { type: "string" },
      timely: { type: "boolean" },
      "post-to-slack": { type: "boolean" },
      json: { type: "boolean" },
    },
    allowPositionals: true,
  });
  const ctx = loadCtx(values.dir);
  if (values.provider) ctx.env.TF_LLM_PROVIDER = values.provider;
  if (values.model) ctx.env.TF_LLM_MODEL = values.model;

  const bundle = await generateOnboarding(ctx, {
    n: values.n ? Number(values.n) : 10,
    timely: Boolean(values.timely),
  });
  bundle.drafts.sort((a, b) => b.score - a.score);

  // structured onboarding output — everything needed to onboard the customer
  const bundlePath = join(ctx.paths.root, "onboarding.json");
  writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));

  if (values.json) {
    console.log(JSON.stringify(bundle, null, 2));
  } else {
    const date = new Date().toISOString().slice(0, 10);
    const md = [
      `# Drafts — ${date}`,
      "",
      ...bundle.drafts.flatMap((d) => [`## (${d.score}) ${d.signal}`, d.text, d.note ? `> ${d.note}` : "", ""]),
    ].join("\n");
    mkdirSync(ctx.paths.draftsDir, { recursive: true });
    const file = join(ctx.paths.draftsDir, `${date}.md`);
    writeFileSync(file, md);
    console.log(md);
    console.error(
      `\nwrote ${bundle.drafts.length} drafts -> ${file}\nwrote onboarding bundle -> ${bundlePath}`,
    );
    if (values["post-to-slack"]) await slackPostFile(ctx.env, file, "🧵 fresh tweet drafts");
  }
}
