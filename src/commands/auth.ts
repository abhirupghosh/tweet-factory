import { parseArgs } from "node:util";
import { loadCtx } from "../config.ts";
import { runPkceFlow } from "../x/auth.ts";

export async function cmdAuth(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      dir: { type: "string" },
      port: { type: "string" },
      bind: { type: "string" },
      "redirect-uri": { type: "string" },
      "no-browser": { type: "boolean" },
      timeout: { type: "string" },
    },
    allowPositionals: true,
  });
  const ctx = loadCtx(values.dir);
  await runPkceFlow(ctx.env, ctx.paths, {
    port: values.port ? Number(values.port) : undefined,
    bind: values.bind,
    redirectUri: values["redirect-uri"],
    noBrowser: Boolean(values["no-browser"]),
    timeoutSecs: values.timeout ? Number(values.timeout) : undefined,
  });
}
