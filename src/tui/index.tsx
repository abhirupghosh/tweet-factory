import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./App.tsx";
import { loadStats } from "../analyze.ts";
import type { Ctx } from "../config.ts";

export async function launchTui(ctx: Ctx, opts: { selftest?: boolean } = {}): Promise<void> {
  const stats = loadStats(ctx);
  const renderer = await createCliRenderer();
  createRoot(renderer).render(<App ctx={ctx} stats={stats} />);
  if (opts.selftest) {
    // headless smoke: render a frame, then tear down cleanly.
    await Bun.sleep(500);
    try {
      renderer.destroy();
    } catch {}
    console.error("selftest: rendered onboarding without crashing");
    process.exit(0);
  }
}
