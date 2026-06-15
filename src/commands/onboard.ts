import { parseArgs } from "node:util";
import { loadCtx } from "../config.ts";

export async function cmdOnboard(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: { dir: { type: "string" }, selftest: { type: "boolean" } },
    allowPositionals: true,
  });
  const ctx = loadCtx(values.dir);
  // Lazy-load the TUI (OpenTUI native addon) so headless commands stay light.
  const { launchTui } = await import("../tui/index.tsx");
  await launchTui(ctx, { selftest: Boolean(values.selftest) });
}
