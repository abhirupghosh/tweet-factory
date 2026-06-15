import { parseArgs } from "node:util";
import { loadCtx } from "../config.ts";
import { runFetch } from "../x/fetch.ts";

const SOURCES = ["like", "bookmark", "own"];

export async function cmdFetch(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      dir: { type: "string" },
      incremental: { type: "boolean" },
    },
    allowPositionals: true,
  });
  const sources = positionals.filter((p) => SOURCES.includes(p));
  const ctx = loadCtx(values.dir);
  await runFetch(ctx, { sources, incremental: Boolean(values.incremental) });
}
